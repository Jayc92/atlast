# ADR-0015: Deterministic Identity Reconciliation — Rules-First, Conflict-Preserving, Replayable

**Status:** Accepted; amended by [ADR-0019](0019-subject-identity-and-assertion-claims.md)
**Date:** 2026-07-23

> **Approval note (2026-07-23):** Accepted by human review as part of the **M1 architecture baseline**. Acceptance settles the M1 reconciliation design only — it does **not** authorize implementation. M1 implementation requires a separate, explicit human authorization ([docs/milestones.md](../milestones.md)).

> **Amendment notice (2026-07-23):** [ADR-0019](0019-subject-identity-and-assertion-claims.md) (Accepted) amends this ADR's dependent typed-subject wording only: where the text below assumes type is a subject-level fact (e.g., the conflict example of two sources asserting different types for one entity), type now lives in the GraphAssertion's canonical claim per ADR-0019. The conflict semantics themselves — coexisting incompatible claims, per-claim confidence, no winner — are unchanged and strengthened. The decision text below is **preserved verbatim as accepted**; all other decisions stand unchanged.

## Context

Reconciliation is "the hardest problem in the system" ([architecture § 3.3](../architecture.md#33-reconciliation-engine)): deciding which observations describe the same thing, scoring confidence, recording conflict, and aging facts. The open question "identity resolution strategy: rules-first with ML assist, or probabilistic from the start?" is assigned to this ADR ([architecture § 7](../architecture.md#7-open-questions)), with the recorded lean toward rules-first for explainability. In M1 every input is synthetic fixture Evidence (ADR-0014), determinism is non-negotiable ([GUARDRAILS.md § 5](../../GUARDRAILS.md#5-testing-philosophy)), and time and randomness must come through injectable interfaces ([architecture § 4](../architecture.md#4-cross-cutting-concerns)).

## Problem

Define how Evidence becomes stable Entity/Relationship subjects and the GraphAssertions about them (ADR-0014) — same-identity decisions, corroboration, confidence, conflicts, staleness — such that the process is fully deterministic, idempotent under replay, explainable claim-by-claim, and honest about ambiguity.

## Decision (proposed)

### Rules-first, deterministic only

M1 reconciliation is a **pure, deterministic function** of (ordered Evidence set, derivation policy). **No ML, no probabilistic identity model, no randomness — hidden or seeded — in M1.** Every identity decision is traceable to a named rule and the Evidence that triggered it. Reconciliation output — subjects and assertions — is a function of Evidence and policy alone; the injected clock plays no role in producing assertions, only in classifying their staleness at query time (below).

### The versioned derivation policy: `m1-v1`

Every input that shapes reconciliation output is recorded in one versioned **derivation policy** document, identified as **`m1-v1`**: the normalization rule list, the alias policy, the confidence formula and its constants, and the staleness thresholds — together with the `schemaVersion` and canonical serialization version they pair with (ADR-0016). The policy is data, reviewed like a contract. **Changing any part of it creates a new policy version** (`m1-v2`, …); no constant is left to implementation-time review, and no policy change can silently alter previously derived output (ADR-0016 binds snapshot identity to the derivation version).

### Identity keys

- Each Evidence record carries a **source-scoped identity**: the identity claim as the discovery source expressed it (`<source>:<source-native-id>`). Source-scoped identities are never merged implicitly across sources.
- Reconciliation computes a **normalized identity key** per claim via the explicit, ordered normalization rules of policy `m1-v1`: (1) Unicode NFC, (2) lowercase, (3) trim, (4) collapse internal whitespace runs to a single `-`, (5) strip the policy's declared decorative-affix list (`m1-v1` list: `svc-`, `-svc`, `service-`, `-service`). Rules are data in the policy document, not code.
- **Cross-source identity resolution in M1 is exact match on normalized keys, plus an explicit alias table.** The alias table is **versioned derivation-policy data** (part of `m1-v1`), **not Evidence**: aliases do not flow through the evidence store, carry no timestamps or provenance, and never appear in any assertion's provenance — they are matching configuration, reviewed and versioned with the policy, and changing them is a new derivation version. This synthetic alias mechanism exists solely for M1 fixtures; **using any alias mechanism with real systems requires a separately approved ADR** — it is exactly the kind of quiet human-authored topology influence that must be re-reviewed before reality arrives. Anything short of an exact rule match is **not** merged. Matched claims resolve to one **stable subject identifier** (ADR-0014); assertion revisions produced from them reference that subject.

### Corroboration and confidence

- Evidence from **distinct sources** whose claims resolve to the same normalized key **corroborates** one claim. Corroboration arriving above an already-pinned horizon does not modify any existing assertion revision: reconciliation at the later horizon emits a **new content-addressed revision** (ADR-0014) whose provenance includes the new Evidence — the earlier revision, and every snapshot pinned on it, is untouched.
- **Confidence and freshness are orthogonal.** Confidence measures how well-supported a claim is by its provenance under the current rules; freshness measures how recently it was observed relative to the query time. Confidence changes **only** when supporting provenance changes or the derivation policy's rules change — **never merely because the clock advances**. Time-related doubt is expressed exclusively through the staleness classification below.
- The exact `m1-v1` confidence formula, where `s` is the number of **distinct corroborating sources** in the assertion's provenance:

  ```
  confidence(s) = 0.5 + 0.4 × (1 − 2^(−(s − 1)))
  ```

  So one source → `0.5`, two → `0.7`, three → `0.8`, four → `0.85`, approaching but never reaching the `0.9` cap. Properties bound by this ADR and satisfied by the formula: **deterministic, strictly monotonic in distinct-source corroboration, bounded below 1.0** (certainty is unreachable by construction). Constants live in policy `m1-v1`; changing them is a new policy version.

- Confidence is derived from **each revision's own provenance** and carried by that revision with the rule trace that produced it — every confidence value is explainable, and a confidence change is always a new revision, never an edit.

### Conflict

- When Evidence resolving to the same identity makes **mutually exclusive claims** (e.g., two sources assert different types for one entity), reconciliation records a **conflict structure** (ADR-0014) holding all claims with their provenance. The assertion surfaces as conflicted with per-claim confidence; no winner is chosen.

### Ambiguity

- When rules produce a **partial or uncertain match** (e.g., keys match only after a normalization step declared "weak", or an alias is one-directional), the identities remain **separate assertions**, each flagged with an explicit ambiguity marker referencing the near-match. **Ambiguity is never resolved by merging; unresolved is the correct output.** Resolving a flagged ambiguity requires new Evidence (or, post-M1, a human annotation mechanism — out of scope here).

### Staleness and aging

- Freshness per assertion revision derives from its most recent supporting Evidence (ADR-0014). Staleness is a **query-time classification** — response data computed against the query's `asOf`, never written into the immutable revision or its identifier: the same revision classifies `current` at one query time and `stale` at a later one, deterministically. The exact `m1-v1` thresholds, computed **solely from age at T** as `asOf − latest supporting observedAt`:
  - **`current`** — age < **7 days**
  - **`stale`** — 7 days ≤ age < **30 days**
  - **`historical`** — age ≥ **30 days**

  Freshness says nothing about supersession: a revision whose validity interval no longer contains `asOf` is **absent** from the active snapshot at that `asOf` — in M1 it is reached only through pinned snapshots at earlier `asOf` values, and the separate temporal state `superseded` (ADR-0016) is reserved for a future bounded history route deferred beyond M1. Interval closure never forces a freshness value, and closing an interval at a later horizon never retroactively changes the classification at an earlier `asOf`. Thresholds live in policy `m1-v1` (arbitrary-but-fixed at synthetic scale; real sources will motivate per-source thresholds later — a new policy version). Classification transitions are visible on every read and never destructive.

### Determinism and idempotent replay

- Reconciliation consumes Evidence in the **total order defined by ADR-0016** (`observedAt`, then the unique `recordedSequence`). Replaying the same Evidence set under the same derivation policy yields **byte-identical subjects, assertion revisions (with identical content-addressed identifiers), confidences, conflicts, and ambiguity markers** — this is a tested invariant, and it is what makes the graph rebuildable.
- Reconciliation is **incremental-safe**: processing Evidence in batches or one-by-one converges to the same result as processing all at once (order-insensitivity beyond the defined total order).

### Required fixture coverage

The M1 fixture suite must include, at minimum, scenarios for: **exact cross-source match** (corroboration raises confidence), **late corroboration as revision** (Evidence above a pinned horizon yields a new assertion revision while the pinned snapshot stays byte-identical), **conflict** (mutually exclusive claims coexist), **staleness** (a revision's classification crosses the `m1-v1` thresholds as the query time advances, while its confidence is unchanged), and **ambiguity** (a near-match stays split and flagged). The scenario catalog lives in [docs/m1-plan.md](../m1-plan.md).

## Alternatives Considered

- **Probabilistic identity resolution from the start** (similarity scoring, thresholded merge) — the strongest alternative; it is where mature multi-source reconciliation ends up. Rejected for M1: thresholds tuned against synthetic data are fiction, probabilistic merges are hard to explain claim-by-claim, and a wrong merge is exactly the "confidently wrong map" the spec names as the worst failure. The rules-first contract deliberately leaves room for a scored matcher **behind the same conflict/ambiguity semantics** later.
- **ML-assisted matching** — prohibited by the M1 gate in spirit and unjustifiable before real heterogeneous sources exist (post-M5 at the earliest, per [architecture § 3.3](../architecture.md#33-reconciliation-engine)).
- **No normalization (byte-exact source IDs only)** — maximally safe, but fails the fixture reality that sources name the same service differently; it would push all matching into the alias table.
- **Fuzzy string matching (edit distance) with a cutoff** — deterministic in principle, but cutoff tuning is unprincipled without real data and its false merges are silent. The ambiguity marker mechanism covers the honest version of this need.

## Tradeoffs

- **Chosen:** every merge decision explainable and reproducible; ambiguity honest; zero tuning burden; replay as a testable property.
- **Given up:** recall — real-world identity variants that rules don't cover stay unmerged (correctly flagged, but noisier than a tuned matcher). Accepted: for a map that must be trusted, a visible split is cheaper than an invisible wrong merge.

## Consequences

- The derivation policy (`m1-v1`) becomes a reviewed data artifact; ADR-0016 pins snapshot identity to its version, so policy evolution is visible and old snapshots stay reproducible.
- **Refines [architecture § 3.3](../architecture.md#33-reconciliation-engine):** that document's draft phrasing says aging facts "decay in confidence"; this ADR proposes the sharper separation — aging changes the staleness classification while confidence tracks provenance only. If this ADR is accepted, architecture.md § 3.3 should be updated in the same change to say facts _age in freshness_ rather than decay in confidence.
- ADR-0016's Evidence ordering becomes load-bearing for determinism and must be settled compatibly.
- The query API (ADR-0017) must expose conflict and ambiguity states — they are outputs, not internal bookkeeping.

## Risks

- **Rules accrete into an unreadable pile.** Mitigation: rules are named, ordered, data-defined, and each fixture scenario cites the rules it exercises.
- **The alias table becomes a manual topology editor** (a prohibited pattern). Mitigation: aliases are versioned derivation-policy data — every alias change is a new policy version, visible in snapshot identity, reviewed like a contract change — and the mechanism is explicitly barred from real systems without a separately approved ADR.
- **Confidence formula false precision.** The `m1-v1` constants are arbitrary-but-fixed at synthetic scale and could be mistaken for calibrated values. Mitigation: the policy document labels them explicitly as uncalibrated; recalibration against real sources is a new policy version, and snapshot identity (ADR-0016) keeps old derivations reproducible.

## Testable Invariants and Acceptance Evidence

1. Same Evidence set + same rules → byte-identical reconciliation output (replay determinism).
2. Batch vs. incremental processing converges to identical output.
3. No merge occurs without a named rule match; every assertion's rule trace is non-empty.
4. Conflicting claims are both present post-reconciliation with their provenance; no test observes a silent winner.
5. Ambiguous near-matches remain distinct assertions carrying ambiguity markers.
6. Confidence follows the `m1-v1` formula exactly, is strictly monotonic in distinct-source corroboration, and is **unchanged** as the query time advances without new Evidence or a policy change (orthogonality test).
7. Freshness classification is a pure function of age at `asOf` under the `m1-v1` thresholds: it crosses exactly those thresholds as the query time advances with confidence held constant, and closing a revision's validity interval at a later horizon changes neither its classification at any earlier `asOf` nor its bytes — supersession is expressed by absence from later active snapshots, never by a freshness value (validity/freshness separation test).
8. Later corroborating Evidence produces a new assertion revision (new identifier, expanded provenance, recomputed confidence) and never mutates an existing one; earlier pinned snapshots remain byte-identical (shared with ADR-0014 invariant 10 / ADR-0016 invariant 4).
9. Aliases are policy data: no alias appears in any provenance set, and an alias change alone changes reconciliation output only under a new derivation version (alias-not-Evidence test).
10. No reconciliation code path reads wall-clock time or any randomness source.

**Acceptance evidence at review time:** this document plus the four required fixture scenarios enumerated in [docs/m1-plan.md](../m1-plan.md).

## Dependencies on Other Proposed ADRs

- **ADR-0014** defines the stable subjects and the GraphAssertion, provenance, conflict, and ambiguity shapes this process produces.
- **ADR-0016** defines the Evidence total order, the temporal validity this process writes into, and the derivation-version pinning that makes policy `m1-v1` part of snapshot identity.
- **ADR-0017** must surface conflict/ambiguity/confidence exactly as produced here.
- **ADR-0018** must persist rule traces and conflict structures without loss.

## Why This Fits Atlast

- **Explainable or not at all:** rules-first makes every edge interrogable — the Principle 5 bar applied to identity itself.
- **Fail honest:** ambiguity flagged beats similarity guessed.
- **Determinism is non-negotiable:** reconciliation as a pure function is the strongest possible form of the guardrail.

## Conditions That Would Justify Changing This Decision

- Real heterogeneous sources (M5+) producing measured, systematic under-merging that the rules+alias mechanism cannot express — the scheduled trigger for evaluating a scored matcher behind the same honesty semantics.
- A human-annotation mechanism being approved (its own ADR) that changes how ambiguity gets resolved.
- Fixture-demonstrated cases where the exact-match contract forces incorrect splits that damage M2 UX evaluation.
