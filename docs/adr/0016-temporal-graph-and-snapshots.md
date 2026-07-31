# ADR-0016: Temporal Graph and Snapshots — Bitemporal Records, Derived Snapshots, Deterministic Replay

**Status:** Accepted; amended by [ADR-0021](0021-jcs-canonicalization-clarifications.md)
**Date:** 2026-07-23

> **Approval note (2026-07-23):** Accepted by human review as part of the **M1 architecture baseline**. Acceptance settles the M1 temporal design only — it does **not** authorize implementation. M1 implementation requires a separate, explicit human authorization ([docs/milestones.md](../milestones.md)).

> **Amendment notice (2026-07-31):** [ADR-0021](0021-jcs-canonicalization-clarifications.md) (Accepted) amends this ADR's canonical-serialization clauses. ADR-0021 controls where this ADR says JCS object keys are sorted "by Unicode code point" — **property names are sorted as arrays of raw UTF-16 code units** per RFC 8785 § 3.2.3 — and where this ADR globally says "`null` never appears in canonical serialization" — **generic JCS preserves explicit `null`**, while absent optional domain fields remain omitted by payload builders (an Atlast payload rule, not a serializer rule). The decision text below is **preserved verbatim as accepted** — where those clauses differ, ADR-0021 controls. Every other decision in this ADR — the bitemporal axes, `recordedSequence`, horizons, validity, replay, and snapshot semantics — remains in force unchanged.

## Context

"Time is a dimension, not an afterthought" ([architecture § 1.6](../architecture.md#16-time-is-a-dimension-not-an-afterthought)), and the named project-killer is a current-state-only model with history bolted on later ([architecture § 5](../architecture.md#5-explicit-anti-patterns)). ADR-0012 (accepted) already requires the repository contract to carry snapshot and as-of-time semantics from its first version. M1's exit criteria include versioning/snapshots with as-of-time queries ([docs/milestones.md M1](../milestones.md#m1--synthetic-topology-model-gated)). Determinism rules ([GUARDRAILS.md § 5](../../GUARDRAILS.md#5-testing-philosophy)) forbid wall-clock dependence and ordering luck.

## Problem

Define temporal semantics — what times exist, what is immutable, what "as of T" means, what a Snapshot is, and how equal timestamps order — such that history is native, replay is exact, and no operation destroys the past.

## Decision (proposed)

### Two time axes and an ingestion ordinal, all explicit

Every Evidence record carries two timestamps and one ordinal, named distinctly and never conflated:

- **`observedAt`** — when the discovery source observed the fact (fixture-declared in M1; source-reported from M5).
- **`recordedAt`** — when the Evidence entered Atlast's evidence store: the **audit timestamp** (fixture-declared in M1 to keep tests deterministic; assigned via the injected clock when live ingestion exists). Multiple records may legitimately share a `recordedAt`.
- **`recordedSequence`** — a **deterministic, unique, strictly increasing ingestion ordinal** assigned per Evidence record as it enters the store: an **integer from 1 through `Number.MAX_SAFE_INTEGER` (2^53 − 1)**, the JavaScript safe-integer range, so every value is exactly representable in the IEEE 754 doubles the runtime and JSON use. M1 fixtures **declare it explicitly**; future live ingestion assigns it atomically at append time. Later Evidence always receives a higher `recordedSequence` — even when its `observedAt` is old (late-arriving observation) or its `recordedAt` equals another record's. Validation rejects with an explicit error any value that is duplicate, zero, negative, non-integer, or above the safe-integer bound.

This is a deliberately minimal bitemporal model: `observedAt` drives topology semantics ("what was true"), `recordedAt` drives auditability ("what did Atlast know, and when"), and `recordedSequence` pins exact Evidence sets (the horizon below). Both time axes are queryable; **as-of queries default to the `observedAt` axis**, with the `recordedAt` axis available for audit-style questions. `recordedAt` is never used as a horizon — that is `recordedSequence`'s job, and conflating them would make horizons ambiguous whenever two records share a timestamp.

### Immutability and derivation

- **Evidence is append-only and immutable** (ADR-0014). Corrections are new Evidence, never edits.
- **GraphAssertion revisions are immutable and content-addressed** (ADR-0014). Each revision carries a **half-open validity interval `[validFrom, validTo)`** on the `observedAt` axis, as known at the horizon that produced it. Reconciliation never edits a revision: when later Evidence adds provenance, changes confidence, closes an interval, or changes conflict/ambiguity state, it emits a **new revision with a new content-addressed identifier**; every earlier revision remains byte-identical and reproducible through the snapshot horizons that pinned it.
- **Validity determines snapshot membership; freshness classifies what is present.** These are separate dimensions:
  - A snapshot at as-of time T includes exactly the revisions whose validity interval **contains T** (`validFrom ≤ T < validTo`, with an open `validTo` treated as unbounded at that horizon).
  - For each included revision, the **freshness classification** (`current`/`stale`/`historical`) is computed **solely from its age at T** — `T − latest supporting observedAt` — under the `m1-v1` thresholds (ADR-0015). Closing an interval at a _later_ horizon never retroactively changes a revision's classification at an earlier T.
  - Once T passes a revision's `validTo`, the revision is **absent** from the active snapshot at T — absence, not a freshness state.
  - **M1 exposes no route that returns revisions outside their validity**: time travel is done by querying pinned snapshots at different T values. The distinct **temporal state `superseded`** is **reserved** for a future bounded assertion-history route (deferred beyond M1, per ADR-0017) so that supersession, when it is exposed, is never expressed by overloading the freshness classification.
- **Disappearance** (a source stops observing an entity) closes nothing by itself: the revision remains valid and its query-time classification **ages** through the staleness thresholds as T advances. History viewed later does not retroactively change what "as of T" returns.

### Snapshots

- A **Snapshot is a derived, deterministic view**: the subjects with their valid assertion revisions (confidences, conflicts, and ambiguity markers; freshness classifications are computed per read at the snapshot's T) at time T over an exact Evidence set under a given derivation policy. Snapshots are **not stored copies** in M1; they are computed on demand from revision validity intervals.
- **Snapshot identity is the triple (asOf T, evidence horizon H, derivationVersion V)**:
  - **T** — the as-of time on the `observedAt` axis;
  - **H** — the **evidence horizon: an append-only Evidence-store watermark expressed as a `recordedSequence` value**. A horizon H includes **exactly** the Evidence records with `recordedSequence ≤ H` — an exact, enumerable Evidence set, not a timestamp cutoff. Because sequences are unique and strictly increasing, later Evidence (however old its `observedAt`, and even with a `recordedAt` equal to an included record's) always lies above any previously pinned horizon and can never enter it;
  - **V** — the **derivation version**, pinning everything that shapes derivation: the `schemaVersion`, the reconciliation and normalization rules, the alias policy, the confidence policy, the staleness thresholds (all bundled as the ADR-0015 derivation policy, e.g. `m1-v1`), and the canonical serialization version below.

  Two snapshot requests with equal (T, H, V) return identical results, byte-for-byte. **Changing any pinned policy creates a new derivation version and can never silently change an existing snapshot identity** — old (T, H, V) triples remain reproducible as long as their policy version is retained.

- **Canonical serialization** (versioned as part of V) is defined tightly enough that independent implementations agree on checksums. The M1 canonical form follows **RFC 8785 (JSON Canonicalization Scheme, JCS)**, pinned as `jcs-rfc8785` in the derivation policy, with the Atlast-specific rules below stated explicitly (they constrain the _data_, where JCS constrains the _encoding_):
  - **Encoding**: UTF-8 **without BOM**; compact form with **no insignificant whitespace** anywhere.
  - **Object keys** sorted lexicographically by Unicode code point (per JCS); no implementation-defined key order anywhere.
  - **Strings** escaped deterministically per JCS: the two-character escapes (`\"`, `\\`, `\n`, `\t`, `\r`, `\b`, `\f`) where defined, `\u00XX` lowercase-hex escapes for remaining control characters, all other characters emitted literally as UTF-8 — never gratuitously escaped.
  - **Collections** (an Atlast rule — JCS does not order arrays) sorted by the identifier of their elements: subjects by subject identifier, assertion revisions by assertion identifier, provenance by Evidence identifier — ascending by code point.
  - **Timestamps** as UTC ISO 8601 strings with exactly millisecond precision and a `Z` suffix (`2026-07-23T00:00:00.000Z`).
  - **Numbers** serialized per JCS (ECMAScript `Number::toString` on the IEEE 754 double): shortest round-trip decimal, no trailing zeros, integers without a decimal point or exponent, and exponent notation exactly where that algorithm produces it. `recordedSequence` values serialize as plain decimal digits **because** they are constrained to the safe-integer range 1…2^53 − 1 (above) — within that range the JCS algorithm never produces a decimal point or exponent.
  - **Omitted vs. null**: optional fields that are absent are **omitted entirely**; `null` never appears in canonical serialization.
  - **Checksum: SHA-256** over the UTF-8 bytes of this canonical form — the same algorithm content-addressing assertion identifiers (ADR-0014) — exposed with every snapshot so identity is verifiable, not asserted. The algorithm name is pinned in the derivation policy; changing it is a new derivation version.
- Snapshot **diffs** ("what changed between T1 and T2") are **explicitly deferred beyond M1**: no M1 exit criterion requires them ([docs/milestones.md M1](../milestones.md#m1--synthetic-topology-model-gated)), and consumers can compare two pinned snapshots themselves. A diff query family would be additive to ADR-0017 when a milestone needs it (M2 history playback is the expected trigger).

### Total order and tie-breaks

Determinism requires a total order over Evidence. Proposed ordering key, compared lexicographically:

1. `observedAt` (primary axis),
2. `recordedSequence` (unique by construction, so the order is total with no further tie-break needed).

Equal-`observedAt` Evidence is thus ordered stably and documented — never by insertion order, iteration order, `recordedAt` coincidence, or any runtime accident. Reconciliation (ADR-0015) consumes Evidence in exactly this order.

### Replay

- **Replay invariant:** deriving the graph from the same Evidence set under the same derivation version produces identical subjects, identical assertions, and identical snapshots for every (T, H, V) — the operational meaning of "the graph is derived and rebuildable" ([architecture § 1.1](../architecture.md#11-evidence-in-assertions-out)).
- Replay is also the **upgrade path**: when reconciliation rules improve, the graph is recomputed from retained Evidence rather than migrated in place.

### Boundary between evidence history and derived snapshots

The evidence store owns durable history: it is the source of truth and the only thing that must never lose data. Derived assertions and snapshots are a **cache of computation** — losing them loses nothing (ADR-0012's persistence stance). ADR-0018 may choose to persist derived state for speed, but persistence of derived state is an optimization, never a source of truth, and must be invalidated by Evidence or rule changes.

## Alternatives Considered

- **Single-axis time (observation only)** — simpler, and the strongest alternative at M1 scale where fixtures declare both times anyway. Rejected because retrofitting the record axis later is precisely the bolt-on anti-pattern: audit questions ("did Atlast know this during the incident?") become unanswerable, and M5 live ingestion would force a breaking model change.
- **Full bitemporal query surface (arbitrary combinations of both axes) at M1** — maximal power, but doubles the query semantics to specify and test before any consumer needs it. Deferred: the model stores both axes; the M1 query surface (ADR-0017) exposes as-of on `observedAt` plus horizon pinning.
- **Materialized, stored snapshots** — faster reads and stable artifacts, but introduces cache-invalidation and storage-consistency problems at a scale that doesn't need them. Deferred to ADR-0018's change conditions with measured need.
- **Event-sourcing framework adoption** — the pattern here is homomorphic to event sourcing, but a framework imports vocabulary and machinery that competes with the domain language guardrail. The plain model is small enough to own.

## Tradeoffs

- **Chosen:** history native from the first record; audit and topology time separable; snapshots reproducible and verifiable; replay as the recovery and upgrade mechanism.
- **Given up:** on-demand snapshot computation costs CPU per query (acceptable at synthetic scale, measurable by ADR-0018's evaluation); two timestamps per Evidence record is a modeling burden fixtures must carry from day one.

## Consequences

- Fixture files must declare both timestamps and the `recordedSequence` ordinal explicitly — no fixture may rely on load time or file order (this also keeps CI deterministic).
- ADR-0015's determinism inherits this ADR's total order; the two must be accepted or revised together.
- ADR-0017's as-of query parameters and snapshot endpoints take their semantics verbatim from here.
- ADR-0018's evaluation must weigh each storage option's fit for interval queries and ordered scans (its § "temporal fit").

## Risks

- **Interval logic is subtle** (open/closed boundaries, adjacent intervals). Mitigation: boundary conventions are fixed in the schema documentation (proposed: half-open `[start, end)`), and the fixture suite includes edge-of-interval cases.
- **Unbounded history growth.** Real: retention is an open question ([architecture § 7](../architecture.md#7-open-questions)) deliberately **not** resolved here; at M1 synthetic scale, full retention is correct and cheap. The retention decision belongs to the M1 storage/evidence discussion (ADR-0018 records it as deferred).
- **Clock misuse.** Any code path reading wall-clock time silently breaks as-of semantics. Mitigation: the injected-clock rule is already binding; invariant 9 below makes it tested.

## Testable Invariants and Acceptance Evidence

1. Same Evidence set + same derivation version → identical snapshot for every (T, H, V), across repeated runs, process restarts, and independent implementations of the canonical serialization (replay determinism; SHA-256-checksum-verified).
2. Late-arriving Evidence (`recordedSequence` > H) does not alter any snapshot pinned at horizon H — tested specifically with **late Evidence whose `observedAt` is older than already-included observations** (late-old-observation test): the old horizon's snapshots remain byte-identical.
3. Changing any pinned policy (rules, aliases, confidence constants, staleness thresholds, schema version, serialization version) yields a new derivation version; snapshots under the old (T, H, V) remain byte-identical to their pre-change values.
4. **Later corroboration creates a revision, not a mutation:** Evidence above horizon H₁ that corroborates an existing claim yields, at horizon H₂ > H₁, a new content-addressed assertion revision with expanded provenance and recomputed confidence, while the snapshot pinned at H₁ still returns the original revision byte-identically (shared with ADR-0014 invariant 10).
5. No operation mutates or deletes Evidence; assertion revisions accumulate monotonically (new revisions appear at later horizons; none is edited or removed).
6. Snapshot membership follows validity exactly: a snapshot at T contains a revision iff its half-open interval contains T; for T ≥ `validTo` the revision is **absent** from the active snapshot at T while snapshots pinned at earlier T values still contain it unchanged; closing an interval at a later horizon does not change the revision's freshness classification at any earlier T. (The `superseded` temporal state is reserved for a post-M1 history route and appears in no M1 response.)
7. `recordedSequence` values are unique, strictly increasing integers within 1…2^53 − 1; validation rejects duplicates, zero, negatives, non-integers, and values above `Number.MAX_SAFE_INTEGER` (safe-integer boundary test, including acceptance at exactly 2^53 − 1 and rejection at 2^53). Two Evidence records with **equal `recordedAt`** still order deterministically and pin deterministically by their distinct sequences (equal-recordedAt test).
8. Equal-`observedAt` Evidence produces identical reconciliation output regardless of fixture-file declaration order (total-order test via `recordedSequence`).
9. No temporal computation reads wall-clock time (injected clock only).
10. Relationship disappearance scenarios show aging freshness classifications at later as-of times while the same revisions still classify `current` at earlier as-of times.

**Acceptance evidence at review time:** this document plus the staleness/as-of/appearance-disappearance fixture scenarios in [docs/m1-plan.md](../m1-plan.md).

## Dependencies on Other Proposed ADRs

- **ADR-0014** supplies the subject, content-addressed assertion-revision, and Evidence shapes these semantics govern; its SHA-256 content addressing uses this ADR's canonical serialization.
- **ADR-0015** consumes the total order and emits the revisions whose validity intervals these semantics interpret.
- **ADR-0017** exposes as-of and snapshot queries with exactly these semantics, including the (T, H, V) identity in pinned reads (diffs are deferred beyond M1, above).
- **ADR-0015** supplies the derivation policy (`m1-v1`) whose version is the V component of snapshot identity.
- **ADR-0018** must support interval and ordered-scan access patterns efficiently enough for synthetic scale.

## Why This Fits Atlast

- **Time native, not bolted on:** the anti-pattern is structurally excluded — there is no current-state table to bolt history onto.
- **Honest degradation over time:** aging is computed, visible, and reproducible at any historical viewpoint.
- **Determinism:** ordering, tie-breaks, and clocks are all explicit; "ordering luck" has no surface to act on.

## Conditions That Would Justify Changing This Decision

- Measured snapshot-computation cost at M2 interactive scale exceeding interactive latency budgets — triggers materialization (an ADR-0018 evolution, not a semantics change).
- A committed requirement for full bitemporal query combinations — would expand ADR-0017's surface against this same model.
- The evidence-retention decision (deferred) choosing compaction — would need explicit rules for how compaction preserves snapshot reproducibility at pinned horizons.
