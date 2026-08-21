# ADR-0038: Resolve M5 Reconciliation Scaling Before Changing Storage Engine

**Status:** Accepted
**Date:** 2026-08-21

> **Approval note (2026-08-21):** Joseph Carfagno explicitly accepted ADR-0038 after review of the real M5 measurement (audit § 23) and this remedy analysis, including the precision review of its output-invariant wording above. **Acceptance settles the architecture decision only — retain the existing in-memory `EvidenceStore`/`TopologyGraphStore`; reject SQLite/PostgreSQL/graph-database migration on the current evidence; require the `m1-v1` reconciliation algorithm's O(n²) scaling to be resolved before M5 closes. It does not itself authorize implementation.** The reconciliation-optimization implementation requires its own separate, explicit implementation authorization, effective only after this acceptance record merges to `main` and local `main` is synchronized cleanly. **M5 remains open. M5-B and M5-C remain unauthorized.**

## Context

[ADR-0018](0018-m1-storage-strategy.md) retained fixture-backed in-memory storage for M1 and named four concrete conditions that would justify revisiting that decision, one of which is scheduled re-evaluation at each subsequent forcing point. The M2 forcing point ([TASKS.md](../../TASKS.md) M2-F entry) found no condition fired. [docs/m5-plan.md § 4.4](../m5-plan.md#4-proof-obligations) and [docs/milestones.md](../milestones.md#m5--read-only-local-kubernetes-connector-gated)'s verification obligation 4 both require the same conditions to be re-run against the real dataset M5-A's Kubernetes connector actually produced, before M5 can close. That reassessment is recorded in [docs/audits/m0-synthetic-boundary-audit.md § 23](../audits/m0-synthetic-boundary-audit.md); this ADR is the required response to its finding.

## Problem

§ 23's measurement found that a single entity-detail read, at the real observed M5 cardinality of 3,707 corroborating provenance Evidence records on one assertion, takes a median of **9.27 seconds** — roughly 300× the sub-30ms "comfortably interactive" latency this project's own prior measurements (M2-F, M4-E § 20.6) established as the standing in-memory comfort baseline. This fires [ADR-0018](0018-m1-storage-strategy.md)'s condition 2 ("Fixture suites or M2 interactive latency measurably exceeding in-memory comfort"). Per [docs/m5-plan.md § 4.4](../m5-plan.md#4-proof-obligations), a fired condition requires this new ADR before any further M5 slice or later milestone proceeds. **Critically, a fired storage condition is not itself proof that the storage engine is the cause** — this ADR exists specifically to determine that, rather than assume it.

## Measured M5 Evidence

From [audit § 23](../audits/m0-synthetic-boundary-audit.md#23-adr-0018-real-m5-workload-storage-reassessment-2026-08-21), measured against the real production read path (`InMemoryTopologyGraphStore.getSubject` → `SnapshotResolver` → `reconcileEvidenceAtHorizon` → `buildAssertionReadResult`), using synthetic Evidence shaped identically to the real M5-A connector's output:

| Cardinality | Median      | p95          | Max          |
| ----------- | ----------- | ------------ | ------------ |
| 20          | 1.57 ms     | 2.70 ms      | 4.27 ms      |
| 1,000       | 670.13 ms   | 709.40 ms    | 731.49 ms    |
| 3,707       | 9,273.59 ms | 10,625.98 ms | 10,744.31 ms |

Scaling is superlinear and closely matches **quadratic**: a 3.707× cardinality increase (1,000 → 3,707) produced a 13.8× latency increase (3.707² ≈ 13.74).

## Exact ADR-0018 Condition That Fired

Condition 2, verbatim: **"Fixture suites or M2 interactive latency measurably exceeding in-memory comfort (concrete trigger for the SQLite evaluation)."** Conditions 1 (the scheduled-review trigger itself), 3 (durable state beyond regenerable fixtures), and 4 (traversal/temporal patterns better served by a relational or graph engine) did **not** fire — confirmed in [audit § 23.5](../audits/m0-synthetic-boundary-audit.md#235-adr-0018-condition-by-condition-assessment).

## Root-Cause Decomposition

Direct inspection of the exercised code path, not inference from the curve shape alone:

- **(A) `EvidenceStore` lookup cost:** `InMemoryEvidenceStore.getEvidenceByIdentifier` is an O(1) `Map.get` (`packages/graph-model/src/evidence-store.ts`). The freshness computation (`latestSupportingObservedAt`, `topology-graph-store.ts`) calls it once per provenance entry — O(n) per read of one revision. **Linear, not the dominant term.**
- **(B) Reconciliation algorithm cost — the dominant term.** `packages/graph-model/src/reconciliation.ts` processes Evidence in atomic equal-`observedAt` steps (ADR-0022 § 7); this M5 workload produces one step per poll (3,707 distinct steps, never batched, because the connector never coalesces corroborating polls). At **every** step, `standingFilteredObservations` re-scans a subject's **entire accumulated observation history** (`subjectState.observations.filter(...)`) to recompute standing-source-filtered provenance from scratch. Summed over n steps, this is `1 + 2 + ... + n ≈ n²/2` — O(n²).
- **(C) Snapshot assembly cost:** building `Snapshot.subjects` from the reconciliation result is O(subject count); with exactly one subject in this workload, this is not a meaningful contributor.
- **(D) Content-addressed revision/provenance cost — a second, compounding O(n²) contributor of the same order as (B).** Because each new corroborating observation changes the accumulated `provenance` array, the per-step draft-change check (`canonicalizeToJcsString` over a payload embedding the current provenance) differs every step, so a **new** revision closes and opens at every single step — matching the real M5-A finding that the assertion identifier changed on every poll (§ 21.7/§ 22.2). The final `allRevisions.map(...)` pass then computes `sha256HexOfCanonicalJson` over **each** of the ~n resulting revisions' own provenance array (sizes 1, 2, 3, ..., n) — summing to O(n²) again.
- **(E) Connector corroboration frequency:** the M5 connector's 2-second poll interval, with no de-duplication of "nothing changed" observations, is what makes n grow large for a given session length. This does not change the algorithm's complexity class, but it is the practical multiplier that turned an O(n²) characteristic invisible at M0-M4 fixture scale (max 20 Evidence records) into a 9.27-second measured cost after two hours of unthrottled real polling.

**(B) and (D) share the same underlying cause:** the accepted `m1-v1` policy re-derives the complete standing-observation set and re-canonicalizes/re-digests the complete provenance array from scratch at every corroborating step, with no incremental or memoized path. Neither (A) nor (C) meaningfully contributes at this workload's shape.

## Contractual Output Invariants

Reviewed against the existing accepted architecture (ADR-0014, ADR-0016, ADR-0021, ADR-0022) and the merged `packages/graph-model` test suite, to determine precisely which outputs any reconciliation-algorithm change must reproduce exactly — rather than imposing a blanket "byte-identical output" requirement where no accepted contract actually demands one:

- **Content-addressed assertion identifiers** (`atlast:assertion:<digest>`) — **contractual; must remain byte-identical** for the same logical identifying payload (`derivationVersion`, `subjectIdentifier`, `claim`, `validity`, `provenance`, `ruleTrace`, `conflictState`, `ambiguityState`): ADR-0014/ADR-0022 define assertions as content-addressed via RFC 8785 canonicalization plus SHA-256 over exactly that payload.
- **Canonical serialization** (RFC 8785/JCS) — **contractual; the algorithm itself is unchanged** (ADR-0016/ADR-0021): any optimization must still canonicalize through the existing, unmodified `canonicalizeToJcsString`/`sha256HexOfCanonicalJson` primitives, never a faster approximation of them.
- **Entity/subject identifiers** — unaffected by this optimization; computed independently by identity normalization (ADR-0022 § 2), not by the reconciliation step loop this ADR targets.
- **Assertion semantics** (confidence formula, standing-source-filtered provenance rule, conflict "alternatives-only" structure, ambiguity near-match detection) — **contractual; must classify identically** for identical Evidence input (ADR-0022).
- **Provenance membership** — **contractual**: the exact set of Evidence citations a revision carries is defined by ADR-0022's standing-source-filtered provenance rule.
- **Provenance ordering** — **contractual**: the existing S5 implementation record ([TASKS.md](../../TASKS.md)) already establishes "deterministic identifier-sorted output" as a verified property; provenance must remain sorted ascending by identifier, not merely set-equal in arbitrary order.
- **Confidence** — **contractual**, exact IEEE-754 arithmetic per ADR-0022.
- **Freshness** — **contractual as a classification result** (`current`/`stale`/`historical`, ADR-0022 § 13/ADR-0015): freshness is computed at read time from `latestSupportingObservedAt`, not embedded in the content-addressed payload itself; the optimization must produce the same classification for the same real inputs, via any internal computation path.
- **`ruleTrace`** — **contractual**: the closed rule-name vocabulary and exact citation rules (ADR-0022 § 10) must produce the same entries for the same inputs.
- **`validFrom`/`validTo` and revision count** — **contractual, and genuinely required, not merely a performance artifact of the current algorithm**: because provenance is part of a revision's content-addressed identity, and this M5 workload's provenance genuinely changes on every corroborating poll, producing one closed revision per poll is _correct_ behavior under the existing accepted policy. An O(n)/O(n log n) fix must produce the identical sequence of revisions and validity intervals, computed faster — never a _different_ (e.g., coalesced) revision history.
- **Temporal/pinned-`asOf` read behavior** — unaffected: a separate read-composition concern (ADR-0016/0017/0024) layered above reconciliation output, not part of reconciliation itself.
- **Ambiguity/conflict behavior** — **contractual**, same basis as assertion semantics above.

**Not contractual, and therefore not required to be identical:** the literal JSON property-insertion order of any non-canonicalized wire response (canonicalization already governs ordering independently of source-object insertion order), and any internal data structure, iteration strategy, or intermediate representation the optimization uses to compute the same contractual result faster.

## Decision

**Retain the existing in-memory `EvidenceStore`/`TopologyGraphStore` architecture. Do not adopt SQLite, PostgreSQL, or a dedicated graph database on this evidence.** Require, as the condition for M5 to close, that the `m1-v1` reconciliation algorithm's per-step observation-filtering and per-revision content-addressing be changed from their current O(n²) shape to O(n) or O(n log n) in the number of corroborating observations per subject — while preserving **contract-equivalent deterministic output** exactly as enumerated above (byte-identical content-addressed identifiers, canonical serialization, provenance membership and ordering, confidence, `ruleTrace`, conflict/ambiguity structure, and the identical sequence of revisions and validity intervals for identical input); only the internal computation strategy may change, never the contractual result. **This ADR does not itself authorize that implementation** — it names the required remedy class and defers the implementation slice to its own separate, explicit authorization, exactly as every prior milestone slice required.

## Alternatives Considered

- **Option A — Fix the reconciliation algorithm, retain in-memory stores (chosen).** Maintain each subject's standing-filtered observation set and each open revision's content-addressing incrementally (e.g., an appended/removed index per claim key, and incremental or memoized canonicalization/digesting) instead of re-deriving the complete history at every step. Directly attacks root causes (B) and (D). No new dependency, no schema, no operational burden, fully reversible, and verifiable by the existing 372+ `packages/graph-model` regression tests plus a new large-cardinality test — a pure internal-computation change behind an unchanged public interface.
- **Option B — Retain reconciliation semantics, add in-memory indexing/materialized structures.** On inspection this is the same remedy as Option A described from the data-structure side rather than the algorithm side (an incrementally maintained index _is_ the fix to the per-step full-history rescan). Not a distinct competing alternative; folded into the Decision above.
- **Option C — Connector-side corroboration deduplication/coalescing.** Rejected as the primary remedy. Silently dropping or coalescing "nothing changed" observations would discard real observational history and directly conflicts with this project's binding "provenance is mandatory" rule ([CLAUDE.md Hard Rule 3](../../CLAUDE.md#hard-rules-from-guardrailsmd--never-relax-these); [GUARDRAILS.md](../../GUARDRAILS.md)) and with Evidence's append-only design (ADR-0014). It would also weaken the very signal that lets a live source keep a fact honestly `current` (§ 22's freshness proof depends on continued real corroboration). A narrower variant — merely reducing poll frequency — would not discard anything, but only delays the same O(n²) cost to a later n; it does not attack the measured root cause and is explicitly out of this ADR's scope (implementation, including any polling change, is not authorized here).
- **Option D — SQLite.** Evaluated honestly: SQLite's indexing could turn the per-step full-history scan into an indexed range query, plausibly O(log n) per step instead of O(n) — but that is exactly the same asymptotic improvement an in-memory index (Option A) achieves, without SQLite's real costs: a new dependency, schema migrations "exactly when the domain model is least stable" (ADR-0018's own words), and Zod-schema-to-relational-row translation. SQLite would not remove the O(n²) _algorithm_; it would only make each O(n) step faster, which an in-memory index equally achieves. **Rejected**: it does not attack the measured root cause any better than Option A, at strictly higher cost, and ADR-0018 condition 3 (durable state beyond regenerable fixtures) remains absent — nothing here needs persistence.
- **Option E — PostgreSQL.** All of SQLite's downsides, plus a server process, provisioning, and version-pinning burden ADR-0018 already named as "the largest single source of nondeterminism for zero functional gain" at this scale and in direct tension with this project's no-containers local-runtime convention. Nothing in this evidence indicates scale beyond what an algorithm fix (or, if ever needed, SQLite) would handle. **Rejected** — not chosen "because it scales farther;" no evidence supports needing that scale.
- **Option F — Dedicated graph database.** ADR-0018 condition 4 (traversal/temporal patterns a relational or graph engine demonstrably serves better) explicitly did **not** fire — M5 exercised zero traversal (Pods only, no Relationships). A graph database would address a workload characteristic absent from this evidence while doing nothing to fix the measured per-subject reconciliation cost. **Rejected** on both "solves a problem Atlast does not have" and "does not attack the measured root cause" grounds.

## Tradeoffs

- **Chosen:** zero new infrastructure, zero new dependency, full reversibility, and a fix scoped exactly to the measured problem — at the cost of requiring a real algorithmic change to an accepted, frozen derivation policy's _implementation_ (not its _semantics_), which must be proven behavior-preserving before it can be trusted.
- **Given up:** the option of using this reassessment to also address any future durability or traversal-scale need speculatively — deliberately not done, since neither is measured or required today (ADR-0018 conditions 3 and 4 remain unfired).

## Consequences

- M5 cannot close until this algorithmic remedy is implemented, its own separate authorization is granted, and the § 7 validation requirement below passes.
- `packages/graph-model/src/reconciliation.ts`'s pure-function boundary and ADR-0022's exact behavioral guarantees remain the frozen contract any implementation must preserve exactly, per the enumerated contractual invariants above — not a blanket byte-for-byte requirement on every internal or non-canonicalized representation; the existing 372+ test suite is the regression backstop, supplemented by a new cardinality-scale test.
- No product-facing behavior, schema, API contract, or accepted ADR content changes as a result of this ADR alone.
- Root cause (E) — the connector's unthrottled 2-second polling with no coalescing — remains a standing, real growth driver even after an algorithmic fix (an O(n) or O(n log n) algorithm still does more total work as n grows, just far more slowly); this ADR does not require changing it, but a future slice may still choose to revisit polling cadence as a complementary, non-blocking optimization.

## Risks

- **A behavior-changing "optimization."** The highest risk of any reconciliation-algorithm change is silently altering output (confidence, conflict/ambiguity detection, validity intervals, or content-addressed identifiers) while appearing to "just be faster." Mitigated by requiring contract-equivalent output proof — the enumerated invariants above, verified against the existing full test suite — before any implementation is accepted.
- **Underestimating (E)'s long-run effect.** An O(n log n) fix still grows with sustained corroboration; a workload with orders of magnitude more polling than this M5-A session could eventually re-trigger condition 2 again. This ADR does not claim otherwise, and future reassessment remains available exactly as ADR-0018's own scheduled-review mechanism already provides.
- **Scope creep into a real migration.** Because this ADR explicitly rejects SQLite/PostgreSQL/graph-database migration now, there is a risk of later re-raising them without new evidence; the "Conditions That Would Justify Changing This Decision" section below states exactly what new evidence would be required.

## Validation Requirement

Before this ADR's remedy may be considered proven (not before implementation, which requires its own separate authorization), a before/after measurement must be run **at the same M5 cardinality, n = 3,707**, using the identical methodology [audit § 23](../audits/m0-synthetic-boundary-audit.md#23-adr-0018-real-m5-workload-storage-reassessment-2026-08-21) established (real `mapObservedPodToEvidence`-shaped synthetic Evidence, deterministic advancing injected `Clock`, 5 warm-up reads, 30 timed samples), and must report:

- median, p95, and max latency at n = 3,707, compared directly against § 23.3's `9,273.59 ms` / `10,625.98 ms` / `10,744.31 ms` baseline;
- scaling context at the same three cardinalities (20, 1,000, 3,707) to confirm the curve is now linear or near-linear, not merely faster at one point;
- **correctness**: contract-equivalent reconciliation output — confidence, provenance membership and ordering, conflict/ambiguity state, validity intervals and revision count, `ruleTrace`, and content-addressed identifiers all identical to the current implementation's output for identical input — against the complete existing `packages/graph-model` test suite, unchanged;
- **identical provenance/freshness semantics**: the same entity, at the same cardinality, must still expose the same `current`/`stale`/`historical` pinned-`asOf` transitions § 22.6 proved, with the same provenance dereferenceable and unchanged;
- the complete, unmodified `./scripts/verify.sh` passing all seven stages.

No specific millisecond target is imposed beyond what this document's own measured evidence already establishes (the ~sub-30 ms "comfortably interactive" bar this project has consistently used) — this ADR does not invent a new numeric SLA ADR-0018 itself does not contain.

## Conditions That Would Justify Changing This Decision

- The validation requirement above is attempted and cannot achieve a genuinely sub-quadratic result without violating `m1-v1`'s accepted semantics — in which case a storage-engine or semantic-policy change becomes the next honest question, not this one.
- A future, measured workload demonstrates a real, committed requirement for durable state beyond regenerable fixtures (ADR-0018 condition 3, still unfired) — e.g., an approved human-annotation mechanism.
- A future, measured workload exercises real traversal or temporal query patterns a relational or graph engine demonstrably serves better (ADR-0018 condition 4, still unfired) — e.g., M5-B's Deployment/Service relationship modeling, if and when separately authorized.
- Sustained corroboration volume, even under an O(n log n) fix, is measured to re-exceed the comfort bar at a realistic session length — in which case connector-side poll-frequency changes (the narrower Option C variant) become the next question to evaluate, not a storage migration.
