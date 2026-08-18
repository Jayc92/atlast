# Atlast M4 Implementation Plan — Change-Impact Simulation

**Status:** Accepted — the M4 implementation baseline (accepted 2026-08-17)
**Date:** 2026-08-17

> **Planning authorization boundary (2026-08-17):** Joseph Carfagno explicitly authorized M4 planning and pre-release architecture/ADR review only, after M3 formally closed through PR #69 at `539860d` and local `main` synchronized cleanly ([TASKS.md](../TASKS.md), [HANDOFF.md](../HANDOFF.md)). The released boundary was this plan, Proposed ADRs 0032–0035, independent review and correction, bounded implementation slices, and factual planning records.

> **Approval and authorization boundary (2026-08-17):** After independent architecture review and correction, Joseph Carfagno explicitly accepted ADRs 0032–0035 and approved this plan as the M4 implementation baseline. The acceptance record merged through PR #71 at `8e93d10`, and local `main` was synchronized cleanly.

> **M4-A release (2026-08-17):** After the accepted baseline merged and local `main` synchronized cleanly, Joseph Carfagno explicitly authorized M4-A within the exact boundary in [§ 6](#6-proposed-implementation-slices): additive shared impact contracts and the `packages/impact-model` pure engine, its unit tests, and the ADR-0035 engine contract-test suite. No `apps/api` route, fixture catalog, or `apps/web` change is authorized. This release is effective only after the documentation record of this authorization merges to `main` and local `main` is synchronized cleanly. **M4-B through M4-E and M5+ remain unauthorized.**

> **M4-A closure and M4-B release (2026-08-18):** M4-A was independently reviewed, fully verified, and squash-merged through PR #73 at `9ee21e4`; GitHub Actions `verify` passed in 4m2s. The review corrected one literal NUL source byte without changing runtime delimiter behavior. Joseph Carfagno then explicitly authorized M4-B within the exact § 6 boundary: the composed impact route, closed error mapping and integration tests, plus the fixture-backed exact-match scenario catalog and scoring suite under existing `pnpm test`. No browser work is authorized. This release becomes operational only after its documentation record merges to `main` and local `main` synchronizes cleanly. **M4-C through M4-E and M5+ remain unauthorized.**

## 1. Objective

M4 answers PROJECT_SPEC § 4's Impact query — "if entity X changes in way Y, what is affected?" — with a deterministic, evidence-linked, ranked result, entirely over the synthetic topology M1–M3 already built. [docs/architecture.md § 3.7](architecture.md#3-layer-responsibilities) is explicit that this deterministic engine "must exist and be validated as the explainable baseline **before any LLM-generated reasoning is added**." M4 delivers exactly that baseline and nothing beyond it — no AI, no ML, no natural-language explanation layer.

The M4 exit criteria remain those in [docs/milestones.md](milestones.md):

1. An impact query returns ranked affected entities, each with a traversable, deterministic explanation.
2. The synthetic scenario harness runs in CI and scores impact quality automatically.

## 2. Binding Invariants

1. **Deterministic before AI.** No LLM, ML, or probabilistic component is introduced anywhere in M4. Any future LLM use is limited to explaining deterministic results in natural language, never producing conclusions the engine did not, and requires its own separate ADR and human approval (docs/architecture.md § 3.7).
2. **Change type is a lens, never a filter or rank input.** `removal`, `degradation`, and `interface-change` produce identical rankings and evidence paths for the same origin, bounds, and pin; they differ only in the echoed hypothetical label ([ADR-0032](adr/0032-m4-change-impact-domain-model.md) § 2).
3. **No new relationship taxonomy.** `relationshipType` remains the open, unclosed classification token it already is; M4 closes no part of it.
4. **Impact queries never mutate topology.** No graph subject, assertion, or Evidence record is created, modified, or deleted by an impact query.
5. **Truncation is always visible.** A truncated traversal's ranked list is never presented as a complete blast radius ([ADR-0032](adr/0032-m4-change-impact-domain-model.md) § 5).
6. **No hidden winner.** Rank score is evidence-derived; `changeType` only labels the hypothetical question and never participates in result ordering.
7. **Query-API only browser.** The web app consumes validated HTTP contracts and never imports `packages/impact-model` or graph-model/repository internals directly.
8. **Accuracy means exact-match correctness.** The synthetic scenario harness measures whether the deterministic engine matches hand-authored expected output exactly, not a statistical accuracy score ([ADR-0035](adr/0035-m4-synthetic-accuracy-harness.md) § 1).

## 3. Proposed Architecture

### 3.1 Shared contracts

`packages/shared` gains, additively:

- `impactChangeTypeSchema` — the closed `removal` | `degradation` | `interface-change` enum;
- `ImpactPathStep` — reusing the identical strict shape ADR-0029 already defined for latent-risk path steps (`sourceEntityIdentifier`, `targetEntityIdentifier`, `relationshipIdentifier`, `assertionIdentifier`);
- `ImpactResult` — `{ entityIdentifier, rankScore, pathEdgeCount, path }`;
- the impact-query HTTP request/response envelope ([ADR-0033](adr/0033-m4-impact-query-api-contract.md) § 2).

No existing M1/M2/M3 schema, type, or interface changes.

### 3.2 Impact model package

A new workspace package, `packages/impact-model`, implements the pure deterministic engine ([ADR-0032](adr/0032-m4-change-impact-domain-model.md)): eligible-edge qualification, the widest-path (maximin) search with its exact tie-break chain, and rank-score/ordering computation. It depends only on `@atlast/shared`, mirroring `packages/overlay-model`'s dependency boundary exactly. It takes an already-resolved `TraversalResult`, origin, and validated bounds as input; it deliberately takes no `changeType`, repository dependency, clock, or randomness.

### 3.3 Synthetic accuracy-harness scenario catalog

`fixtures/demo-company/impact-scenarios/` ([ADR-0035](adr/0035-m4-synthetic-accuracy-harness.md) § 2) holds hand-authored scripted scenarios over the existing retained topology: origin, `changeType`, bounds, pin, and the complete expected ordered `ImpactResult` set. Exhaustive algorithm shapes absent from that small catalog — including multiple paths and 500-subject truncation — use hand-authored immutable `TraversalResult` values in the engine contract suite, not new Evidence. The engine contract suite is created in M4-A and the fixture-backed catalog in M4-B; neither is created by this plan.

### 3.4 API composition

`apps/api` adds one read-only route:

`GET /api/v1/entities/{entityId}/impact`

The handler resolves one bounded topology traversal through `TopologyGraphStore`, then calls the pure `packages/impact-model` engine with the traversal result, origin, and validated bounds. The handler validates and echoes `changeType` without passing it into ranking. It returns the combined envelope ([ADR-0033](adr/0033-m4-impact-query-api-contract.md) § 2). No additional repository read is performed. No existing route's semantics change.

### 3.5 Browser integration

The M2/M3 topology workspace gains an entity-scoped impact panel, opened from entity detail or the trust inspector: a `changeType` selector reusing the existing traversal `direction`/`depth`/`minConfidence` controls, a ranked result list with the exact numeric rank score labeled "uncalibrated synthetic score," per-result evidence-path drill-down reusing the existing M2 Evidence-dereferencing machinery, and honest truncated/empty/error states ([ADR-0034](adr/0034-m4-impact-presentation-and-accessibility.md)). The panel reuses the existing M2 single-flight coordinator and canonical URL state; it adds exactly one new URL key (`changeType`).

## 4. Deterministic Impact Semantics

Summarized from [ADR-0032](adr/0032-m4-change-impact-domain-model.md); the ADR is binding, this is a pointer for reviewers:

- **Origin:** one Entity subject identifier; Relationship-origin queries are out of scope.
- **Bounds:** the existing traversal `direction` (required), `depth` (required, 1–5), `minimumConfidence` (optional, default 0) — no new range or budget.
- **Eligible edges:** identical to ADR-0029's latent-risk qualification rule (confidence floor, both endpoints in scope, Relationship-claim revisions only, no competing-claim edges).
- **Rank score:** the selected path's bottleneck (minimum-edge) confidence. Selection first computes the destination's maximum bottleneck score, then chooses the shortest path using only edges meeting that score, then breaks equal-length ties by lexicographic step-tuple order. This two-phase form preserves the global comparator when a later weak edge collapses earlier score differences. Widest-path precedence is new M4 policy; only edge qualification and deterministic tuple comparison are reused from ADR-0029.
- **Ordering:** rank score descending, then path edge count ascending, then Entity identifier ascending in raw UTF-16 order.
- **Change type:** validated and carried through unchanged as the hypothetical label; it is not an impact-engine input and never affects ranking math.

## 5. Temporal and Identity Semantics

Impact queries reuse the existing pin semantics unchanged: the existing all-or-none `(asOf, horizon, derivationVersion)` pin, the existing latest-then-pinned browser coordination pattern (ADR-0026's single-flight coordinator), and the existing resolved-identity mismatch-is-a-failure rule. Impact carries no second temporal coordinate — unlike M3's overlay frame, there is nothing analogous to select or pin beyond the one topology identity the traversal already resolves.

## 6. Proposed Implementation Slices

Mirroring the M3-A through M3-F pattern at M4's smaller scope. Order is dependency-driven; no dates or estimates are attached. None of these slices is released by this plan — each requires its own separate, explicit authorization after the preceding slice merges and `main` synchronizes cleanly, exactly as every M2/M3 slice required.

| Slice | Content                                                                                                                                                                                               | Depends on                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| M4-A  | Additive shared impact contracts; `packages/impact-model` pure engine (eligible edges, widest-path search, ranking); focused unit tests. No API/browser.                                              | ADR-0032 accepted                  |
| M4-B  | `GET /api/v1/entities/{entityId}/impact` route, composition, closed error mapping, integration tests; the accuracy-harness scenario catalog and its scoring suite wired into `pnpm test`. No browser. | M4-A, ADR-0033 + ADR-0035 accepted |
| M4-C  | Browser impact panel: `changeType` selector, ranked list, precise rank/change-type presentation, evidence-path drill-down. No accessibility/history hardening yet.                                    | M4-B, ADR-0034 accepted            |
| M4-D  | Accessibility, canonical-URL, truncation/empty/failure-state hardening; browser acceptance for the primary desktop/mobile impact journeys; VoiceOver QA.                                              | M4-C                               |
| M4-E  | Boundary re-audit; no-side-door audit extension for `packages/impact-model`; bundle/latency/memory/cardinality measurements; M4 exit-criterion closure and milestone closeout.                        | M4-D                               |

**Rollback points:** every slice boundary is a rollback point, exactly as every prior milestone's slices have been — M4-A is schema/engine-only and trivially revertible; M4-B is the first slice where the engine meets a real HTTP surface.

## 7. Verification Strategy

### Unit/component tests

- `packages/impact-model`: eligible-edge qualification, widest-path selection and its full tie-break chain, both-direction path ordering, cycle safety, truncation honesty, purity, and empty-result correctness using direct immutable `TraversalResult` contracts (ADR-0032 § Verification Obligations).
- `apps/web`: exact rank/trust-language presentation, canonical URL wire format for `changeType`, truncation/empty-state rendering, focus management (ADR-0034 § Verification Obligations).

### API integration tests

- Parameter matrix, coercion, and closed error mapping for malformed requests, unknown origin, horizon bounds, and unsupported derivation version (ADR-0033 § Verification Obligations).
- One-traversal-call, zero-additional-repository-read assertions.

### Accuracy harness

- Exact-match scenario replay against the real fixture-backed repositories, covering ADR-0035 § 3's feasible retained-topology classes and three-change-type invariance group, reported as a plain pass/total count in `TASKS.md`.
- Multi-path, tie-break, cycle, both-direction, and truncated-result obligations run in the separate engine contract suite over hand-authored immutable traversal inputs; they do not require new Evidence.
- A deliberately mutated expectation must fail its test, proving the harness can detect a real regression.

### Browser acceptance

- Desktop: entity detail → open impact panel → select change type → inspect ranked result → drill into evidence path.
- Mobile: the same journey adapted to the existing M2/M3 narrow-layout pattern.
- Honest failure: a truncated traversal, an empty result, and a deterministic intercepted API error each render their specific, distinct, non-stale state.

Existing `scripts/verify.sh` remains the only repository verification entry point; no new script or CI stage is introduced (ADR-0035 § 4).

## 8. Dependencies and Technology

No new third-party dependency is proposed. M4 reuses TypeScript, Zod, Fastify, React, React Router, React Flow, ELK, Vitest, and Playwright under their existing Accepted ADRs. `packages/impact-model` is a new internal workspace boundary, not a new external technology — the identical framing ADR-0029 § 8-equivalent used for `packages/overlay-model`.

## 9. Explicit Non-Goals

- Any LLM-generated, ML-based, or probabilistic reasoning (docs/architecture.md § 3.7 hard constraint).
- Risk-scored impact prediction, historical incident correlation, entity criticality, or deploy-history enrichment (post-M5, unscheduled per docs/milestones.md).
- Fragility analysis (SPOF detection, circular-dependency detection, drift detection) — post-M5, unscheduled.
- A closed `relationshipType` taxonomy or any relationship-kind-based edge filtering.
- A Relationship-origin impact query, a relationship-detail route, or a bulk/batch impact route.
- Any topology mutation, annotation, or remediation action — advisory remediation recommendations remain a post-M5, unscheduled, human-decision item and Atlast never executes changes against observed systems (PROJECT_SPEC § 7).
- Real systems, credentials, employer data, or customer data.
- Authentication, hosting, multi-user state, or M5 connectors.

## 10. Review and Release Gates

Before M4-A may begin:

1. this plan and ADRs 0032–0035 receive independent architecture review — **complete 2026-08-17**;
2. every blocking finding is corrected and re-reviewed — **complete 2026-08-17**;
3. Joseph Carfagno explicitly accepts the complete M4 baseline (this plan and ADRs 0032–0035) — **complete 2026-08-17**;
4. the acceptance record merges to `main` and local `main` is synchronized cleanly — **complete 2026-08-17, through PR #71 at `8e93d10`**;
5. M4-A receives a separate, explicit implementation authorization — **complete 2026-08-17; effective once this record merges to `main` and local `main` is synchronized cleanly**.

M4-A is complete through PR #73 at `9ee21e4`. M4-B was separately authorized by Joseph Carfagno on 2026-08-18 and becomes operational only after that authorization record merges and local `main` synchronizes cleanly. Each subsequent slice (M4-C through M4-E) still requires its own explicit authorization after its predecessor is independently reviewed, passes the complete local `scripts/verify.sh`, is approved, merges with GitHub Actions `verify` passing, and its checkpoint documentation is updated. M4-C through M4-E remain gated; M5+ remain unauthorized.
