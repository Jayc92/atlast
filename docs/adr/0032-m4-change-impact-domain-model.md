# ADR-0032: M4 Change-Impact Domain Model and Confidence-Weighted Ranking

**Status:** Accepted
**Date:** 2026-08-17

> **Approval note (2026-08-17):** Drafted under Joseph Carfagno's 2026-08-17 authorization of M4 planning and pre-release architecture/ADR review only ([TASKS.md](../../TASKS.md), [HANDOFF.md](../../HANDOFF.md)), independently reviewed and corrected, then **explicitly accepted by Joseph Carfagno on 2026-08-17** as part of the M4 implementation baseline alongside [docs/m4-plan.md](../m4-plan.md) and ADRs 0033–0035. Acceptance becomes operational only after this record merges to `main` and local `main` is synchronized cleanly. Acceptance does not release M4-A and does not authorize M5+.

## Context

M4's exit criterion is: "An impact query returns ranked affected entities, each with a traversable, deterministic explanation" ([docs/milestones.md](../milestones.md)). [PROJECT_SPEC.md § 4](../../PROJECT_SPEC.md#4-core-concepts-domain-language) already defines an **Impact query** as "a question of the form 'if entity X changes in way Y, what is affected?' answered with a ranked, evidence-linked result set." [docs/architecture.md § 3.7](../architecture.md) requires the deterministic engine to exist and be validated **before any LLM-generated reasoning is added**; this ADR defines that deterministic engine only. No AI, ML, or LLM component is introduced by this decision.

The M1–M3 baseline already provides everything the engine needs as pure input: bounded, confidence-filtered traversal (`TopologyGraphStore.traverse`, ADR-0017/0024) returning Relationship assertion revisions with per-revision confidence, and a proven pattern for deriving a secondary, presentation-facing result from a traversal without a second traversal or recursive amplification (`packages/overlay-model`'s latent-downstream-risk projector, ADR-0029). M4 reuses both rather than inventing a new traversal or a new relationship taxonomy.

`relationshipType` is deliberately an open, unclosed classification token ([packages/shared/src/classification.ts](../../packages/shared/src/classification.ts)), not a closed enum — PROJECT_SPEC names relationship kinds "by example," and closing the set is out of scope for any milestone to date. A change-impact design that requires a closed relationship taxonomy (for example, to decide which relationship kinds "carry" an interface change) would force an unauthorized schema closure. This ADR is written to avoid that.

## Decision

### 1. Impact queries are Entity-scoped and reuse the existing traversal contract

An impact query names one origin Entity subject identifier and a **change type** (§ 2). Impact queries do not accept a Relationship origin — consistent with the M2 non-goal of a relationship-detail route and with PROJECT_SPEC § 4's "entity X" wording. The query reuses the exact existing traversal request bounds unchanged: `direction` (`upstream` | `downstream`), `depth` (integer 1–5), and `minimumConfidence` (0–1, default 0), plus the existing all-or-none `(asOf, horizon, derivationVersion)` pin. No new traversal budget, depth range, or confidence range is introduced; the existing 500-subject traversal budget and its visible `truncated` flag are reused unchanged.

The caller's `direction` choice determines which relationship claims are followed, exactly as it does for the existing traversal route — this ADR assigns it no new meaning. `direction: upstream` finds Entities whose relationship claims point _at_ the origin (its callers/dependents) — the conventional shape of "what breaks if I change this." `direction: downstream` finds Entities the origin's claims point _at_ (its dependencies) — a rarer but valid question ("what does the origin depend on that this change also touches"). The API does not privilege one direction as "the" impact direction; the caller states the question it is asking.

### 2. Change type is a presentation lens, never a graph filter or rank input

```ts
export const impactChangeTypeSchema = z.enum([
  "removal",
  "degradation",
  "interface-change",
]);
```

All three change types traverse and rank identically (§ 3): the qualifying-edge rule, the path search, the selected evidence path, and the rank score are computed exactly the same way regardless of `changeType`. Change type is echoed in the response and used only to label the hypothetical question in the UI (ADR-0034). It never selects eligible relationship claims, alters a rank score, selects an evidence path, or breaks a result-ordering tie.

This preserves the separation [docs/m3-plan.md § 4](../m3-plan.md#4-deterministic-health-semantics) established between presentation policy and topology confidence. A design that let `interface-change` narrow the eligible-edge set by relationship type was considered and rejected (§ Alternatives) precisely because `relationshipType` is open-ended and no ADR has closed it; inventing a closed "interface-carrying" relationship subset here would be exactly that closure, done implicitly and without its own review. M4 therefore makes no comparative severity claim among the three hypothetical change types.

### 3. Confidence-weighted ranking is a deterministic widest-path search

The engine consumes one already-resolved `TraversalResult` (the same shape the traversal route returns) plus the origin identifier and validated bounds. It deliberately does **not** accept `changeType`, because § 2 gives that label no ranking semantics. The API validates and echoes `changeType` as part of the user's complete hypothetical question. The engine performs no repository read, no second traversal, no clock, and no randomness — it is a pure function, exactly as `packages/overlay-model`'s projector is pure (ADR-0029 § 5).

**Eligible edges** reuse ADR-0029 § 3's qualification rule: one returned Relationship assertion revision whose claim is a Relationship claim, whose confidence meets the validated request floor, and whose source and target Entity identifiers are both in scope (the origin plus every Entity the traversal returned). Nested `conflictState.competingClaims` are never treated as edges, matching ADR-0029.

Path arrays are ordered from the origin outward in **traversal order**, while every path step preserves the Relationship claim's canonical orientation unchanged. For `direction: downstream`, traversal proceeds from a step's `sourceEntityIdentifier` to its `targetEntityIdentifier`; for `direction: upstream`, it proceeds from `targetEntityIdentifier` to `sourceEntityIdentifier`. The step still records `{ sourceEntityIdentifier, targetEntityIdentifier, relationshipIdentifier, assertionIdentifier }` in canonical claim orientation in both cases. This is the existing traversal direction rule made explicit for path construction, not a reversal of the underlying claim.

For every Entity reachable from the origin over these eligible edges within the traversal's already-explored bounds, the engine computes the **maximum bottleneck-confidence path** — the path whose weakest edge is as strong as possible. Selection is explicitly two-phase so the secondary ordering remains globally correct even when a later weak edge lowers two previously different bottleneck scores:

1. Compute each destination's maximum achievable bottleneck confidence over the eligible graph.
2. For that destination, retain only edges whose confidence is at least that maximum bottleneck score, then select the shortest origin-to-destination path in that retained graph.
3. Break equal-length shortest-path ties by the raw UTF-16 lexicographic order of the path's ordered `(sourceEntityIdentifier, targetEntityIdentifier, relationshipIdentifier, assertionIdentifier)` step tuples.

Equivalently, complete candidate paths compare by the following total order:

1. Candidate paths are compared first by bottleneck confidence (the minimum per-edge confidence along the path) — higher is better.
2. Ties are broken by fewest edges — fewer is better.
3. Remaining ties are broken by the raw UTF-16 lexicographic order of the path's ordered `(sourceEntityIdentifier, targetEntityIdentifier, relationshipIdentifier, assertionIdentifier)` step tuples. This reuses ADR-0029's deterministic tuple representation and raw UTF-16 comparison discipline, but the widest-path and edge-count precedence are new M4 ranking policy.
4. Final ties (identical path under every criterion above, which cannot occur for distinct paths) are impossible by construction, since step 3's tuple sequence is injective over distinct edge sequences.

Selected paths are simple: an Entity identifier may appear at most once in a path. Both phases operate only on the bounded in-scope Entity and eligible-edge sets, so cycles cannot generate new candidates indefinitely. The implementation may use any algorithm that produces exactly this two-phase result; it may not substitute a naive single-label widest-path predecessor tree, because a later weaker edge can collapse bottleneck scores and change the globally shortest tied path.

The path selected by this order for a given Entity is its **selected evidence path**; that path's bottleneck confidence is the Entity's **rank score**. ADR-0029 chose shortest paths first for latent-risk explanation; M4 deliberately chooses bottleneck confidence first because its separate product requirement is confidence-weighted ranking. The two policies share edge qualification and deterministic tuple comparison, but they are not the same comparator.

Each path step is the identical strict shape ADR-0029 § 3 defined: `{ sourceEntityIdentifier, targetEntityIdentifier, relationshipIdentifier, assertionIdentifier }`. An Entity's path is always nonempty (the origin itself never appears in the ranked result set — it is the subject of the change, not an entity affected by it).

### 4. Result ordering

The ranked result list orders by: rank score descending; then path edge count (path length) ascending; then Entity identifier ascending in raw UTF-16 code-unit order. `changeType` is not part of this ordering. Rank scores are compared as the validated numeric values returned by the shared confidence schema, with no display rounding or epsilon tolerance in the comparator.

### 5. Truncation is never silently absorbed

A traversal result whose `traversal.truncated` is `true` means some potentially-affected Entities beyond the 500-subject budget are not reflected in the ranked list. The response must carry `traversal.truncated` unchanged (ADR-0033) and the ranked list must never be presented as a complete blast radius when truncated — the identical discipline [docs/m3-plan.md § 4](../m3-plan.md#4-deterministic-health-semantics) already states for latent-risk derivation: "A truncated traversal is labeled as incomplete context and never presented as proof that no latent risk exists outside the loaded subgraph." An empty ranked result list is a valid, honestly-labeled outcome (the origin has no reachable dependents/dependencies meeting the request's bounds) and is never treated as an error.

### 6. No new domain claim, no topology mutation

Impact queries read only the existing Entity/Relationship/GraphAssertion contracts (ADR-0014/0015/0019/0022) through the existing repository interface (ADR-0017/0020/0024). No new Entity claim, Relationship claim, or Evidence shape is introduced. No graph subject or assertion is created, modified, or deleted by an impact query — it is as strictly read-only as traversal or health-context. `packages/impact-model` (ADR-0033) depends only on `@atlast/shared`, exactly mirroring `packages/overlay-model`'s dependency boundary (ADR-0029 § 5), and is not itself the "AI impact & analysis engine" [docs/architecture.md § 3.7](../architecture.md) describes as a future consumer of the query API — it is the deterministic baseline that engine would eventually sit atop, exposed here as one more query-API composition, exactly as `packages/overlay-model` is.

## Consequences

- Impact analysis is fully explainable: every ranked result names the exact evidence-linked path that produced its score, satisfying PROJECT_SPEC Principle 5 without any AI component.
- No new relationship taxonomy, closed enum, or schema widening is required; `relationshipType` remains open-ended exactly as designed.
- The widest-path search is more expensive than the fixed-path derivation ADR-0029 used, but remains bounded by the same 500-subject traversal budget already in force — no unbounded work is introduced.
- Change type carries no evidence weight, so two queries against the same origin differing only in `changeType` return identically ranked, identically pathed results differing only in the echoed hypothetical label — this is intentional and must be tested as an explicit invariant (ADR-0035).
- The "prediction value" success criterion in [PROJECT_SPEC.md § 2.3](../../PROJECT_SPEC.md#23-success-criteria-long-term) remains open until real incident data exists (post-M5, unscheduled); this ADR closes only the M4 planning-gate question of how the deterministic engine itself is measured for correctness (ADR-0035).

## Alternatives Rejected

- **Closed relationship-kind taxonomy gating `interface-change` propagation:** would force an unauthorized, implicit closure of the deliberately open `relationshipType` classification token; rejected outright (§ 2).
- **Multiplicative path confidence (product of edge confidences):** decays sharply with path length in a way that has no evidentiary meaning here (M1 confidence is a per-assertion corroboration measure, not an independent-probability channel whose product is meaningful); the weakest-link (bottleneck) model is the simpler, more defensible reading and mirrors how a single broken dependency — not a diminishing product — determines whether a downstream consumer is actually affected.
- **Summing or averaging confidence across all paths to an Entity:** produces a score with no clean interpretation and would let many weak paths outrank one strong path, the opposite of "confidence" as a trust signal elsewhere in this system.
- **A second traversal per change type:** rejected; reuses the existing single bounded traversal exactly as ADR-0029 does, avoiding doubled repository load and a second source of truth for reachability.
- **Recursive impact amplification (an affected Entity's own dependents inherit its score):** rejected for the same cycle-safety reason ADR-0029's Alternatives Rejected section gives for recursive latent-risk derivation — it can amplify state indefinitely and obscure the direct cause.
- **Statistical or ML-based ranking:** explicitly out of order per docs/architecture.md § 3.7 and the M4 hard constraint; the deterministic engine must exist and be validated first.

## Verification Obligations

- Eligible-edge qualification tests identical in shape to ADR-0029's (confidence floor, both-endpoints-in-scope, no competing-claim edges, direction-correct departure/arrival).
- Widest-path selection tests: single path, multiple paths of differing bottleneck confidence, bottleneck ties broken by edge count, remaining ties broken by the exact lexicographic tuple order, cycles (no amplification, no infinite loop), and truncated-traversal honesty.
- `changeType`-invariance tests: identical origin, bounds, and pin across all three change types produce identical rank scores, paths, and ordering, differing only in the echoed `changeType`.
- Purity tests: no caller-input mutation, no returned-value aliasing, no clock/randomness/I-O dependency, byte-identical replay across repeated invocation and shuffled input ordering.
- Empty-result tests: an origin with no qualifying eligible edges returns an empty, non-error ranked list.

## Change Conditions

Revisit before: closing the `relationshipType` classification (would let change-type-specific edge filtering be reconsidered under its own ADR); introducing any LLM-generated explanation layer (docs/architecture.md § 3.7 requires its own separate human approval); introducing risk-scored or ML-based prediction (post-M5, unscheduled); or widening impact queries to a Relationship origin.

This Accepted ADR does not authorize implementation. M4-A requires a separate, explicit implementation release.
