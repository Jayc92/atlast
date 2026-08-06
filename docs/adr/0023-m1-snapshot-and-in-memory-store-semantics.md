# ADR-0023: M1 Snapshot Construction and In-Memory Repository Semantics — Closing the S6 Implementation Gaps

**Status:** Accepted — amends ADR-0016, ADR-0018, and ADR-0019 (metadata-only notices; their accepted decision text is preserved)
**Date:** 2026-08-05 (drafted, revised three times after the first, second, and third independent reviews, and accepted, all 2026-08-05)

> **Approval note (2026-08-05):** ADR-0023 was **explicitly accepted by Joseph Carfagno on 2026-08-05 after three independent-review and remediation passes** (the first pass corrected cursor-bound continuation semantics, identity-scoped referential integrity, caller-input protection, the `m1-v2` seed proof obligation, empty-Evidence-store behavior, machine-readable error codes/reasons, and status accuracy; the second corrected semantic horizon validity above the watermark, the `ZodError`/`EvidenceAppendError` boundary, known-but-not-visible assertion classification, and exact error property contracts; the third distinguished graph from Evidence cursors and unusable cursors from binding mismatches). **Acceptance settles the nine S6 implementation-critical decisions in §§ 1–9 below.** **Acceptance does not authorize M1 Slice S6 implementation** — S6 remains gated pending a separate, explicit human release recorded in [TASKS.md](../../TASKS.md), exactly as [HANDOFF.md](../../HANDOFF.md) and [docs/milestones.md](../milestones.md) require.

## Context

Slice S5 (merged PR #19) delivered the pure `m1-v1` reconciliation function and its helpers under accepted [ADR-0022](0022-m1-reconciliation-policy-and-assertion-derivation.md). Slice S6 — "snapshot layer plus fixture-backed in-memory `EvidenceStore`/`TopologyGraphStore` implementations, with the reusable S2 contract suite passing end-to-end" ([docs/m1-plan.md § 4](../m1-plan.md#4-proposed-implementation-slices)) — is the first slice where interfaces meet implementation. ADR-0022 § "Exact S5/S6 Boundary" is explicit that S6 "begins where state begins," and several accepted documents deliberately deferred S6-implementation-critical decisions to this point, exactly as ADR-0022 itself did for S5's gaps in ADR-0015: "each … choice is a place where two correct-looking implementations produce different bytes … discovering the divergence in S6's contract run would be far costlier than deciding now" (ADR-0022 § "Alternatives Considered"). This ADR performs the same closing pass for S6 that ADR-0022 performed for S5.

This is a pre-release architecture review, not an implementation. No code, test, or fixture changes accompany it.

## Problem

Determine whether the accepted ADRs (0012, 0014–0022) and the merged S1/S2/S4/S5 contracts specify every behavior S6 needs to implement deterministically, without S6 inventing policy. Where they do not, specify the missing behavior precisely enough that independent implementations of the in-memory `EvidenceStore`/`TopologyGraphStore` pair produce byte-identical snapshot checksums, agree on error behavior, and pass the S2 contract suite for the same reasons — while adding no new runtime dependency, no S1/S2 interface change, and no authorization for S6 itself.

## Audit Summary

Nine of the eighteen assigned audit points are **already fully specified** by the accepted set and require no new decision (cited below for the record). Nine are **genuine, implementation-critical gaps**: a correct-looking S6 implementation could resolve each one two different ways and produce different bytes, different error behavior, or different mutation-safety guarantees, with no accepted document to arbitrate. This ADR resolves those nine in §§ 1–9 below.

### Already fully specified — no new decision needed

- **Which assertion revision is visible at a requested `asOf`.** `isTimestampWithinValidity` (S4, `packages/graph-model/src/validity-membership.ts`) evaluates half-open membership exactly; S6 calls it per assertion. No gap.
- **Entity inventory and claim-level `entityType` filtering.** [ADR-0020](0020-m1-inventory-and-search-semantics.md) § 1 plus `entityInventoryFilterSchema` and the six ADR-0020 contract-suite cases fully define match-by-any-visible-claim semantics, snapshot-pinning, and rejection. No gap.
- **Complete canonical-identifier search.** ADR-0020 § 3 plus `searchQuerySchema`/`normalizeSearchQuery` and their contract-suite cases fully define substring matching, ASCII-only normalization, and locale independence. No gap.
- **Evidence lookup, provenance retrieval, and deterministic ordering.** `repositories.ts` docstrings plus the ADR-0016 total order fully define `getEvidenceByIdentifier`, `getEvidenceChain`, and `listEvidence` ordering. No gap.
- **Treatment of conflicting, ambiguous, and stale facts.** ADR-0014/0015/0022 fix conflict/ambiguity in-band serialization; the S5 `classifyFreshness` helper (`packages/graph-model/src/freshness.ts`) is a pure function S6 calls per revision with `latestSupportingObservedAt` derived as the maximum `observedAt` among the revision's own (already standing-source-filtered) provenance. No gap.
- **Treatment of missing facts.** `repositories.ts`: "Rejects with an explicit error if the subject does not exist in the graph at that identity." The rejection obligation itself is fully specified; _which error class_ expresses it — including for a known assertion revision that is simply not visible at the resolved identity — is part of the error-taxonomy gap and is fixed in § 9.
- **Repository reset/initialization semantics.** The contract suite's `RepositoryFactory.createRepositories(seedEvidence)` (`contract-suite.ts`) already gives every case a fresh, isolated instance; "reset" is construction of a new instance, and S2's frozen interfaces have no reset method to add one to. No gap.
- **Whether the S2 contract suite is complete enough to prove both stores.** It is comprehensive for _observable behavior through the interfaces_ — 23 cases spanning every read family, cursor binding, referential integrity as a _property_, and snapshot reproducibility. It is not, and cannot be, sufficient to force convergent _internal_ choices that are invisible through the interface (checksum payload shape) or not exercised by the accepted fixture catalog (a referential-integrity violation, which the catalog cannot produce by construction). That is exactly why this ADR exists.
- **Exact S6 authorized paths and the S6/S7 boundary.** Already consistent across ADR-0022 § 14, ADR-0021 § 6, and [docs/m1-plan.md § 5](../m1-plan.md#5-package-and-application-boundaries): `packages/graph-model/src/**` plus `TASKS.md` for factual progress notes; no `packages/shared`, fixture, `apps/api`, `apps/web`, script, manifest, or lockfile change. § 10 below restates this exactly for this ADR's own scope.

### Genuine gaps this ADR resolves

1. Clock injection and cursorless "latest" `asOf`/`derivationVersion` resolution.
2. Cursor-bound continuation-read binding and validation, for both graph and Evidence cursors.
3. Unsupported `derivationVersion` handling for pinned reads, and the `m1-v2` fixture seed's exact proof obligation.
4. Snapshot content-addressing payload shape.
5. Snapshot checksum construction, canonical ordering, semantic horizon validity (empty store, before-first-Evidence, above-watermark), and empty-snapshot behavior.
6. Relationship-endpoint referential-integrity enforcement mechanics, scoped to the resolved read identity.
7. Caller-input protection and returned-value mutation isolation.
8. `appendEvidence` batch atomicity and its exact boundary against shared-schema validation.
9. Repository-layer error taxonomy with machine-readable codes, closed reason literals, and exact property contracts.

The initial draft counted eight gaps and ten fully-specified points; the first independent review showed that cursor _binding semantics_ (as distinct from cursor _encoding_, which remains fully delegated — § 2) is a genuine gap, moving one audit point from the fully-specified list into § 2. The second independent review's four findings refine existing gaps rather than adding new ones, so the count stays at nine: future-horizon (above-watermark) rejection completes the read-coordinate validity rules already carried by gap 5, and the `ZodError`/`EvidenceAppendError` boundary, known-but-not-visible classification, and exact error property contracts all refine gaps 8–9's taxonomy. The third independent review's two findings — distinguishing graph cursors from Evidence cursors, and unusable cursors from binding mismatches — likewise refine the existing cursor gap (gap 2) and its § 9 error contract, so the count remains nine.

## Decision (Accepted 2026-08-05)

All decisions below apply exclusively within `packages/graph-model/src/**`, as new S6-internal implementation code. **None requires, and none may make, any change to `packages/shared`** (the frozen S1/S2 contract), **any fixture file**, or any new third-party dependency. Every mechanism specified is plain TypeScript over `node:crypto`-backed primitives already available from S4.

### 1. Clock injection and cursorless "latest" resolution

- S6 defines a `Clock` type: `() => string`, returning a value that validates against the shared `utcMillisecondTimestampSchema`. This is an S6-internal type, not an addition to the S2 interfaces.
- Every concrete in-memory `TopologyGraphStore`/`EvidenceStore` construction path (the class constructor, or the `RepositoryFactory` implementation S6 registers the contract suite against) takes an explicit `Clock` as a required parameter. **No code path in `packages/graph-model` may call `Date.now()` or argument-less `new Date()`** — this restates and makes concrete ADR-0016 invariant 9 ("no temporal computation reads wall-clock time") and [GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards) ("Determinism is injected") for the one place M1 storage resolves a real notion of "now": a `latest`-mode read.
- A **cursorless** `latest` read resolves the injected `Clock`, the current watermark, and the active derivation version **exactly once per request**, at the moment the request is served: `asOf` from the injected `Clock`; `horizon` from `EvidenceStore.getCurrentWatermark()`; `derivationVersion` from the hardcoded active policy token (§ 3). The fully resolved `(asOf, horizon, derivationVersion)` identity is echoed on the result (as the S2 contracts already require) and is bound into any continuation cursor the response returns (§ 2). This composes ADR-0017 § "Pinned and latest reads" exactly as written, closing only the previously unspecified injection and resolution-point mechanism.
- Supplying the real system clock at application boot is an **S7 composition-root concern**, out of S6's scope; S6 ships no default clock and no fallback to system time.

### 2. Cursor-bound continuation reads

- The S2 `read-contract.ts` docstring delegates cursor _content_ to the implementation ("an implementation concern"), and ADR-0017 defines no total-count concept; those two facts remain unchanged and fully specified. What no accepted document fixes is the **binding semantics** of a continuation read — in particular whether a `latest`-mode continuation re-resolves "now" per page. Two correct-looking implementations diverge observably here: one paginates a single consistent snapshot, the other tears across identities when Evidence arrives mid-pagination.
- **Two cursor kinds exist, because the frozen S2 contract exposes two cursor-bearing repository surfaces with different coordinate systems.** Every issued cursor is one of exactly these kinds, and binds, at creation:
  - **Graph collection cursors** (`cursorKind: "graph"`) — issued by the `TopologyGraphStore` collection reads `listEntities`, `searchSubjects`, and `getEvidenceChain`. Each binds:
    - the **complete resolved `SnapshotIdentity`** `(asOf, horizon, derivationVersion)`;
    - the **originating operation/family** (a `listEntities` cursor is not replayable against `searchSubjects`, and vice versa);
    - the operation-specific **filters or search query** (the `entityInventoryFilterSchema` value, the normalized search query, or the evidence-chain subject/assertion coordinates);
    - the deterministic **ordering**;
    - the **page size**;
    - the **continuation position**.
  - **Evidence cursors** (`cursorKind: "evidence"`) — issued by `EvidenceStore.listEvidence`. Each binds:
    - the requested **Evidence horizon**;
    - the deterministic **Evidence ordering** (the ADR-0016 total order);
    - the **page size**;
    - the **continuation position**.
      Evidence cursors carry **no `asOf` and no `derivationVersion`** — the Evidence store has no snapshot identity — and an Evidence continuation **never invokes the `Clock`**. A continuation must use the **cursor-bound horizon** even if the Evidence store's watermark advances after the first page: a paginated Evidence listing observes one horizon end-to-end.
- **Decision — binding is authoritative for both kinds.** For any request carrying a continuation cursor:
  - the complete coordinates bound into the cursor (the resolved `SnapshotIdentity` for a graph cursor; the Evidence horizon for an Evidence cursor) are **authoritative**;
  - a `latest`-mode graph continuation **continues at the cursor-bound identity without invoking the `Clock` and without rereading the current watermark** — a paginated `latest` read therefore observes one consistent snapshot end-to-end, even if Evidence is appended or the injected clock advances between pages;
  - a **pinned**-mode graph continuation must **exactly match** the cursor-bound identity;
  - an Evidence continuation must **exactly match** the cursor-bound horizon where the request restates one;
  - the request's operation, filters/query, ordering, and page size must also exactly match those bound at cursor creation;
  - **any conflict with a valid cursor's bindings rejects** with `InvalidReadCoordinateError` carrying the `CURSOR_BINDING_MISMATCH` reason and the exact mismatched fields (§ 9);
  - a token that passes the shared printable-token schema but **cannot be decoded, is not recognized as an issued cursor shape, has an invalid internal position, or otherwise cannot supply its required binding metadata** rejects with `InvalidReadCoordinateError` carrying the `INVALID_CURSOR` reason (§ 9) — an unusable cursor is a different failure from a usable cursor replayed against conflicting parameters, and the two must be distinguishable without message parsing.
- This ADR deliberately does **not** prescribe a cursor encoding. The cursor's bytes remain an implementation concern, exactly as the S2 docstring states; only the two kinds' binding semantics above are fixed.

### 3. Derivation-version resolution and unsupported versions

- Exactly one derivation policy exists in M1: `M1_V1_DERIVATION_POLICY` (`packages/graph-model/src/derivation-policy.ts`). S6 defines a small internal lookup — conceptually `{ "m1-v1": M1_V1_DERIVATION_POLICY }` — mapping a `derivationVersion` token to its policy.
- `latest`-mode reads always resolve `derivationVersion` to `"m1-v1"` (the only active policy).
- A **pinned** read or a `getSnapshotSummary` call naming any `derivationVersion` other than `"m1-v1"` (the shared schema constrains the token to a lowercase kebab-case string but does not constrain it to a _known_ policy) **must reject loudly** with `InvalidReadCoordinateError` carrying the `UNSUPPORTED_DERIVATION_VERSION` reason (§ 9) — never silently substitute `m1-v1`, never return an empty or default snapshot.
- **The `m1-v2` fixture seed** ([fixtures/demo-company/catalog.json](../../fixtures/demo-company/catalog.json), [README.md](../../fixtures/demo-company/README.md) § "Catalog contract") is a **valid, identity-shaped future-policy seed**. Its meaning under this ADR is exact:
  - M1 currently supports only `m1-v1`, so any repository read pinned to `m1-v2` rejects as above;
  - the seed proves that `derivationVersion` **participates in snapshot identity and in the canonical checksum payload input** (§ 4 includes it in the digested payload);
  - a future _implemented_ `m1-v2` must produce **independently addressable snapshots** — distinct pinned identities with independently computed checksums at the same `(asOf, horizon)`;
  - **S6 must not implement `m1-v2`.**
  - Rejection alone does **not** satisfy the seed's distinct-snapshots requirement. That requirement is proven at the **pure checksum-builder level**: changing only the `derivationVersion` field of the exact § 4 payload changes the resulting digest (testable invariant 4), demonstrated without ever serving an unsupported policy through the repository.

### 4. Snapshot content-addressing payload

- Snapshot construction, given a resolved `(asOf, horizon, derivationVersion)`:
  1. Call the S5 `reconcileEvidenceAtHorizon(storedEvidence, horizon, policy)` to obtain `{ subjects, assertions }` — the complete revision history at that horizon.
  2. Filter to **visible** assertions: those for which `isTimestampWithinValidity(assertion.validity, asOf)` is `true` (S4).
  3. Visible subjects are exactly those with at least one visible assertion (ADR-0014: no bare subjects) — derived, never stored separately.
- **The identifying payload digested for the snapshot checksum is exactly:**

  ```
  {
    derivationVersion,
    asOf,
    horizon,
    visibleAssertionIdentifiers   // sortIdentifiers() of the visible assertions' identifiers
  }
  ```

  Serialized with the S4 `canonicalizeToUtf8Bytes` and digested with `sha256HexOfBytes`, exactly as GraphAssertion identifiers are computed (ADR-0016 § "Canonical serialization": "Checksum: SHA-256 over the UTF-8 bytes of this canonical form … the same algorithm content-addressing assertion identifiers").

- **Subject identifiers, subject count, and the assertions' full content are deliberately excluded from the hashed payload.** This is not a weakening of content addressing: every visible assertion identifier is _itself_ a content-addressed digest over that assertion's complete identifying content (ADR-0014 § "Identity"), so the sorted list of visible assertion identifiers already uniquely determines the complete visible subject set and every visible assertion's content, transitively. This mirrors the precedent ADR-0022 § 11 set for excluding top-level `confidence` from the assertion's own identifying payload: a value "fully determined by" already-included content adds no discriminating power to a digest, and excluding it does not weaken determinism.
- `SnapshotSummary.subjectCount` (required by the existing `snapshotSummarySchema`) is reported as the count of distinct subject identifiers implied by the visible assertion set — computed alongside the checksum, not hashed into it, exactly as `confidence` sits beside (never inside) an assertion's content-addressed payload.
- The checksum builder is a **pure function of the exact payload above**, testable in isolation: altering any single payload field — including `derivationVersion` alone (§ 3) — changes the digest.

### 5. Checksum construction, canonical ordering, and empty stores versus empty snapshots

- `visibleAssertionIdentifiers` is sorted via the S4 `sortIdentifiers` helper (ADR-0021 § 3/§ 6: "S6 must use and test these helpers when constructing snapshot canonical payloads"). No other collection-ordering rule is needed because § 4's payload names no other array.
- **Semantic horizon validity is a complete, closed rule.** Exact behavior:
  - **An empty Evidence store has no valid graph-read horizon at all.** `EvidenceStore.getCurrentWatermark()` returns `0` for an empty store (no Evidence has been appended). A **cursorless `latest`** `TopologyGraphStore` read against an empty Evidence store **cannot form a schema-valid snapshot identity** — there is no retained Evidence sequence for `horizon` to name — and **must reject** with `InvalidReadCoordinateError` carrying the `EMPTY_EVIDENCE_STORE` reason (§ 9).
  - **For a non-empty store, a pinned horizon is valid exactly when `firstRecordedSequence ≤ horizon ≤ currentWatermark`**, where `firstRecordedSequence` is the lowest retained Evidence `recordedSequence` and `currentWatermark` is `getCurrentWatermark()`.
  - A horizon **below `firstRecordedSequence`** rejects with `InvalidReadCoordinateError`, reason `HORIZON_BEFORE_FIRST_EVIDENCE` (§ 9).
  - A horizon **above `currentWatermark`** rejects with `InvalidReadCoordinateError`, reason `HORIZON_AFTER_CURRENT_WATERMARK` (§ 9). **The store must never accept a future horizon and silently treat it as the current watermark.** Doing so would violate pinned replay (ADR-0016): a pinned identity's result must be immutable, but Evidence appended _later_ with a `recordedSequence ≤` the previously requested future horizon would then be selected by `recordedSequence ≤ horizon` on replay — the "same" pinned read would change results as the store grows, which is exactly the mutation-of-a-pinned-past that pinned identities exist to make impossible.
  - A horizon **between retained sequence values** (valid range, but matching no stored record's exact sequence) is **valid** and selects all Evidence with `recordedSequence ≤ horizon`, exactly per the S4 `selectEvidenceAtHorizon` rule.
  - **Horizon `0` is never a valid `SnapshotIdentity`** and is never served, echoed, or bound into a cursor. The watermark value `0` is a store-level "nothing appended yet" sentinel, not a read coordinate.
- **A valid _empty snapshot_ is a different thing entirely**, and requires no special-case construction: it is a **valid, nonzero retained horizon** whose requested `asOf` has **zero visible assertions** (e.g., an `asOf` before any retained Evidence's validity opens). It produces `visibleAssertionIdentifiers: []`; `canonicalizeToUtf8Bytes` serializes this exactly as any other value (`[]` is valid JCS output); the checksum is the deterministic empty-assertion digest of that canonical § 4 payload; and `subjectCount` is `0`. Nothing in the accepted contract (`snapshotSummarySchema.subjectCount: z.number().int().min(0, …)`) prohibits zero.
- Two `getSnapshotSummary` calls at an identical pinned identity return identical checksums and `subjectCount` by construction — including for a valid empty snapshot — satisfying the existing contract-suite reproducibility case without any further rule.

### 6. Relationship-endpoint referential integrity — scoped to the resolved read identity

- ADR-0019 § 4 states the obligation ("every relationship claim's source and target identifiers resolve to existing Entity subjects") and its ownership split ("S2 defines, S6 proves") but does not state what an implementation must _do_ when a claim's constructed endpoint identifier fails to resolve — a state ADR-0022 § 6 explicitly permits S5 to produce, since S5 "resolution is syntactic" and existence-checking is deliberately deferred to S6.
- **This condition cannot arise from the accepted S3 fixture catalog** (verified for this audit): every relationship's endpoints have their own Entity Evidence whose validity is open before or exactly at the relationship revision's own opening, for every scenario in the catalog. It is nonetheless a general-purpose in-memory store's responsibility to have defined behavior for it, since S6 is not fixture-specific code.
- **Decision:** referential integrity is evaluated against the **complete resolved `(asOf, horizon, derivationVersion)` identity** — never per horizon alone — because both inputs to the check vary with the full identity: assertion _visibility_ varies with `asOf` (a relationship revision visible at one `asOf` may be closed at another, and an endpoint's entity assertion may open later), and both visibility and endpoint _existence_ potentially vary with `derivationVersion` (a different policy may derive different assertions from the same Evidence). The in-memory `TopologyGraphStore` validates, at most once per distinct resolved identity it serves, that every **visible** relationship claim's `sourceEntityIdentifier` and `targetEntityIdentifier` resolve to a subject carrying at least one **visible** entity assertion at that **same resolved identity**.
- **A violation is a data-integrity defect of that exact resolved identity, not a query-time condition and not a defect of the whole horizon**: it rejects **every graph read at that exact resolved `(asOf, horizon, derivationVersion)` identity** with `ReferentialIntegrityError` (§ 9), naming the offending assertion identifier, the unresolved endpoint role, and the resolved identity coordinates. It **must not poison a different `asOf` or `derivationVersion` at the same horizon, nor a later horizon** where additional Evidence resolves the endpoint — those identities are checked and served (or rejected) on their own facts. The store must never silently exclude just the offending relationship revision — silent exclusion would violate "no read can return a cleaned-up graph" (ADR-0017) — and must never serve the violating identity anyway, which would violate "fail honest" (GUARDRAILS.md § 1.2). Rejecting exactly the affected resolved identities is the only option consistent with both.

### 7. Caller-input protection and returned-value mutation isolation

- No accepted document states whether a repository read may return the same in-memory object reference on two different calls, whether it must return an isolated copy so caller mutation cannot corrupt subsequent reads or the store's internal state, or how the store must treat objects the _caller_ still owns. ADR-0021 § 4's non-mutation rule governs S4 helpers' treatment of _caller-supplied input_; it does not address repository storage or repository-returned values, which are distinct concerns S6 is the first slice to raise.
- **Decision — caller-owned input is never frozen or mutated.** `appendEvidence` and every fixture-loading path must:
  - **validate and deep-copy** incoming Evidence **before retaining it** — the store retains only its own copies;
  - **recursively freeze only the store-owned copy** (`Object.freeze`, applied recursively, following the existing `deepFreeze` convention in `derivation-policy.ts`), once, at retention time;
  - **never freeze and never mutate caller-owned input** — freezing an object the caller still holds is itself a mutation of caller state, and is prohibited for exactly the reasons ADR-0021 § 4 prohibits input mutation in S4 helpers.
- **Decision — returned values cannot mutate store state.** Store-owned derived objects (subjects, assertion revisions, retained Evidence copies) are deep-frozen once at storage or derivation, so returning those references is safe. Every **containing structure a read returns** — result envelopes, arrays, page metadata, and cursor structures — must be either **newly created per call or itself deeply frozen**, so that no mutation of any returned value, at any depth, can reach or alter store state or a subsequent read. Reusing frozen internal leaf objects (e.g., the same frozen assertion revision on two reads) is permitted **only** under that condition: all containing returned structures are newly created or themselves frozen.
- Both directions are independently testable invariants (invariants 8a/8b below): input non-mutation (a caller's Evidence array and records are byte-identical and unfrozen after `appendEvidence`) and output isolation (mutating anything a read returned changes no subsequent read).

### 8. `appendEvidence` batch atomicity

- `repositories.ts` already specifies per-record append rejection rules ("reject any record whose `recordedSequence` is not strictly greater than the current watermark, and any duplicate identifier"), but is silent on **atomicity across one `appendEvidence(evidenceRecords)` call carrying more than one record**: whether an invalid record partway through a batch leaves the valid records ahead of it committed, or voids the whole call.
- **Decision:** `appendEvidence` is all-or-nothing, with one exact validation boundary:
  1. The store **first validates the entire append input through the shared Evidence collection schema** (`evidenceCollectionSchema`, S1). Any shared-schema validation failure — malformed record, intra-batch duplicate the collection schema already rejects, empty or otherwise schema-invalid batch as the shared schema already determines — surfaces **unchanged as `ZodError`**. This ADR does not redefine what the shared collection schema accepts or rejects; an empty batch, in particular, follows whatever `evidenceCollectionSchema` already determines.
  2. **Only a schema-valid batch that violates a repository state invariant throws `EvidenceAppendError`** (§ 9). Exactly two such repository-specific conditions exist — an identifier collision against already-stored Evidence (`DUPLICATE_EVIDENCE_IDENTIFIER`) and a `recordedSequence` not strictly increasing within the batch and above the current watermark (`NON_INCREASING_RECORDED_SEQUENCE`) — because they are the only append conditions the shared schema, which cannot see store state, is structurally unable to express.
- All validation — both phases — completes **before anything is appended** (and before the § 7 deep-copy is retained). **Atomicity applies to both failure kinds: neither a `ZodError` nor an `EvidenceAppendError` rejection may partially modify state** — the store's watermark and identifier set are completely unchanged on any rejection. This avoids a store state that depends on which records in a batch happen to sort first.

### 9. Repository-layer error taxonomy

- ADR-0017 § "Validation and errors" fixes the **API-layer** (S7) HTTP error codes (400/404/422) but nothing accepted fixes what the **repository layer** (S6) throws, leaving S7 to either invent ad hoc string-matching against error messages or re-derive a taxonomy unilaterally — exactly the kind of two-correct-looking-implementations divergence this ADR exists to close.
- **Decision:** S6 defines a small, closed set of named `Error` subclasses in `packages/graph-model`, thrown in place of generic `Error`/`TypeError`/`RangeError` for every repository-layer failure mode the contract suite already exercises. Every class carries an **exact structural contract**: stable, `readonly`, machine-readable properties with the exact names and types below (`SnapshotIdentity` denotes the shared resolved-identity shape `(asOf, horizon, derivationVersion)` already required on every S2 read result; `?` marks a property present only when its condition applies, per the notes on each class):

  - **`UnknownIdentifierError`** — an identifier that does not resolve to a returnable record:

    ```
    readonly code: "UNKNOWN_IDENTIFIER"
    readonly identifierKind: "subject" | "assertion" | "evidence"
    readonly identifier: string
    readonly resolvedIdentity?: SnapshotIdentity
    ```

    Thrown by `getSubject`, `getAssertionRevision`, and `getEvidenceByIdentifier` (and any read rejecting per the `repositories.ts` missing-facts rule). **This class covers both absence conditions the frozen S2 contract names**: a **globally unknown** identifier (no such subject, assertion revision, or Evidence exists at any coordinate — `resolvedIdentity` absent for Evidence lookups, which are not identity-scoped), and a **known assertion revision that is not visible at the resolved identity** — identity-scoped absence, with `identifier` set to the assertion identifier and `resolvedIdentity` populated with the exact resolved coordinates. Treating known-but-not-visible as `UNKNOWN_IDENTIFIER` is deliberate and aligns with the M1 read surface: revisions outside their validity at the resolved `asOf` are simply not returned, and M1 exposes no history route through which "exists but not now" would be a distinguishable, actionable condition (ADR-0017; ADR-0020 § 1's snapshot-pinning). S7 maps both to ADR-0017's 404 — from the API's view the resource does not exist at the requested coordinate; 422 remains reserved for semantically unusable coordinates (`InvalidReadCoordinateError`), not for absence.

  - **`InvalidReadCoordinateError`** — a syntactically valid but semantically unusable read coordinate:

    ```
    readonly code: "INVALID_READ_COORDINATE"
    readonly reason:
      | "EMPTY_EVIDENCE_STORE"
      | "HORIZON_BEFORE_FIRST_EVIDENCE"
      | "HORIZON_AFTER_CURRENT_WATERMARK"
      | "UNSUPPORTED_DERIVATION_VERSION"
      | "INVALID_CURSOR"
      | "CURSOR_BINDING_MISMATCH"
    readonly requestedIdentity?: SnapshotIdentity
    readonly cursorBoundIdentity?: SnapshotIdentity
    readonly cursorKind?: "graph" | "evidence"
    readonly requestedHorizon?: number
    readonly cursorBoundHorizon?: number
    readonly mismatchFields?: readonly (
      | "operation"
      | "identity"
      | "horizon"
      | "filter"
      | "searchQuery"
      | "ordering"
      | "pageSize"
    )[]
    readonly firstRecordedSequence?: number
    readonly currentWatermark?: number
    readonly unsupportedDerivationVersion?: string
    ```

    Non-cursor reasons map exactly to §§ 3 and 5: `"EMPTY_EVIDENCE_STORE"` (cursorless `latest` against an empty store — `requestedIdentity` absent, no identity could be formed), `"HORIZON_BEFORE_FIRST_EVIDENCE"` (pinned horizon below `firstRecordedSequence` — both sequence bounds populated), `"HORIZON_AFTER_CURRENT_WATERMARK"` (pinned horizon above `currentWatermark` — both sequence bounds populated), and `"UNSUPPORTED_DERIVATION_VERSION"` (`unsupportedDerivationVersion` populated with the rejected token).

    Cursor reasons map exactly to § 2, with exact population rules:
    - `"INVALID_CURSOR"` — an unusable token (undecodable, not an issued cursor shape, invalid internal position, or missing required binding metadata): `cursorKind` is populated **when its kind can be determined** and absent otherwise; no requested or cursor-bound identity/horizon is required; `mismatchFields` is **absent** (an unusable cursor has no bindings to mismatch).
    - `"CURSOR_BINDING_MISMATCH"` on a **graph** cursor: `cursorKind: "graph"`; `cursorBoundIdentity` is **required**; `requestedIdentity` is required **only for pinned mode** and is **absent for `latest` mode**, because a `latest` continuation never resolves a new identity (§ 2) — there is no second identity to report, only conflicting operation/filter/ordering/page-size parameters; `mismatchFields` is **non-empty and exact** (every mismatched field listed, nothing else).
    - `"CURSOR_BINDING_MISMATCH"` on an **Evidence** cursor: `cursorKind: "evidence"`; `requestedHorizon` and `cursorBoundHorizon` are **required**; `requestedIdentity` and `cursorBoundIdentity` are **absent** (Evidence cursors carry no snapshot identity); `mismatchFields` is **non-empty and exact**.

    **The raw cursor token is never retained on, or exposed by, any error.**

  - **`ReferentialIntegrityError`** — the § 6 dangling-endpoint condition:

    ```
    readonly code: "REFERENTIAL_INTEGRITY"
    readonly assertionIdentifier: string
    readonly endpointRole: "source" | "target"
    readonly endpointIdentifier: string
    readonly resolvedIdentity: SnapshotIdentity
    ```

  - **`EvidenceAppendError`** — a **schema-valid** batch violating a repository state invariant (§ 8; shared-schema failures are `ZodError`, never this class):

    ```
    readonly code: "EVIDENCE_APPEND"
    readonly reason:
      | "DUPLICATE_EVIDENCE_IDENTIFIER"
      | "NON_INCREASING_RECORDED_SEQUENCE"
    readonly evidenceIdentifiers: readonly string[]
    readonly recordedSequences: readonly number[]
    readonly currentWatermark: number
    ```

    `evidenceIdentifiers` and `recordedSequences` name exactly the offending record(s) — the colliding identifiers, or the records whose sequences violate strict increase — never the whole batch.

- The human-readable `Error.message` on every class **remains deterministic but is not an API contract**: S7 and tests bind to the `readonly` structural properties above, never to message text.
- **Errors carry only safe, deterministic, bounded metadata** — identifiers, sequences, identity coordinates, endpoint role, and similar scalar fields, exactly as typed above. **No error retains or exposes a complete Evidence record** or any Evidence content payload.
- These `code` and `reason` literals are the deterministic surface S7 will map to ADR-0017 HTTP codes — no string-matching on human-readable messages, ever. Zod validation failures on shared schemas continue to surface as `ZodError` unchanged; this taxonomy covers only repository-specific conditions the shared schemas cannot express.

### 10. Slice boundary — exact authorized S6 paths (restated for this ADR's scope)

Consistent with ADR-0022 § 14 and [docs/m1-plan.md § 5](../m1-plan.md#5-package-and-application-boundaries), and unchanged by this ADR: **upon S6's own explicit future release**, S6 may change only:

- `packages/graph-model/src/**` — the snapshot-construction module, the in-memory `EvidenceStore`/`TopologyGraphStore` implementations, the `Clock` type, the derivation-version lookup, and the cursor-binding continuation validation (§§ 1–3), the referential-integrity check and error taxonomy (§§ 6, 9), the contract-suite registration module (`registerRepositoryContractSuite` invocation wiring the S3 fixture catalog through an injected loader, following the existing `reconciliation.test.ts` pattern), and their colocated tests;
- `TASKS.md`, solely for factual S6 progress reporting.

**No package-manifest or lockfile change is authorized or expected**: every mechanism in §§ 1–9 is composed from S4/S5 primitives and plain TypeScript/`node:crypto`, already available in `packages/graph-model`'s existing dependencies.

**S6 must NOT implement or modify, per this ADR or otherwise:** `packages/shared` or any S1/S2 contract; fixture JSON under `fixtures/demo-company/`; a second derivation policy (`m1-v2` or otherwise, § 3); API routes or any `apps/api` change (S7); frontend behavior; connectors, authentication, deployment, or real-system access; any S7–S8 or M2+ work; any new third-party dependency or version upgrade; `scripts/verify.sh` or `scripts/bootstrap.sh`.

**Accepting this ADR does not itself authorize S6 implementation.** Acceptance settles the S6 design gaps identified here exactly as ADR-0022 settled S5's; S6 implementation still requires its own separate, explicit human release recorded in `TASKS.md`, per the standing checkpoint rule ([HANDOFF.md § 7](../../HANDOFF.md), [CLAUDE.md](../../CLAUDE.md)).

## Alternatives Considered

- **Leave every § 1–9 gap to S6 implementation-time judgment.** Fastest start, and the path ADR-0022 itself rejected for S5's analogous gaps ("discovering the divergence in S6's contract run would be far costlier than deciding now"). Rejected for the same reason here: none of these nine choices is observable-and-testable through the S2 contract suite alone (several are pure internal-representation choices; one — referential-integrity violation — the accepted fixture catalog cannot even exercise), so an undecided implementation would ship with unreviewed, silently-chosen behavior in exactly the places GUARDRAILS.md most wants a decision on record.
- **Re-resolve the `latest` identity on every continuation page (§ 2).** Rejected: a paginated read would tear across snapshot identities whenever Evidence arrives or the clock advances mid-pagination, silently mixing two graphs in one result sequence — indistinguishable, to the caller, from corruption.
- **Treat an empty Evidence store as a valid horizon-`0` empty snapshot (§ 5).** Rejected: it invents a snapshot identity no retained Evidence supports and no schema-valid horizon names; a "graph as of nothing" served as data is exactly the kind of fabricated certainty "fail honest" prohibits. The empty _snapshot_ (valid nonzero horizon, zero visible assertions) covers every legitimate empty-result need.
- **Accept a pinned horizon above the current watermark and serve it as the watermark (§ 5).** Rejected: it silently converts a pinned identity into a moving target — Evidence appended later with a `recordedSequence ≤` the requested future horizon would change the "same" pinned read's result on replay, violating the immutability pinned identities exist to guarantee (ADR-0016). Loud rejection with `HORIZON_AFTER_CURRENT_WATERMARK` is the only replay-safe answer.
- **Give known-but-not-visible assertion revisions their own error class distinct from `UnknownIdentifierError` (§ 9).** Rejected for M1: through the M1 read surface the two conditions are indistinguishable in consequence — the revision is not returnable at the resolved identity and no history route exists to act on the difference — and a separate class would push S7 toward exposing an existence oracle ADR-0017's 404 mapping does not want. The populated `resolvedIdentity` field already preserves the diagnostic distinction without a second class.
- **Fold the snapshot-payload decision (§§ 4–5) into a metadata-only amendment of ADR-0016 while this document was still Proposed.** Rejected: amendment notices in this project's established discipline (ADR-0019/0020/0021/0022) are applied _with acceptance_ of the amending ADR, not while it is Proposed. Stamping a notice onto an accepted ADR before this document had been reviewed would have misrepresented the accepted set's state. The notices were applied with this ADR's acceptance on 2026-08-05 — see § "Relationship to Accepted ADRs" below.
- **Include subject identifiers and full assertion content in the snapshot checksum payload (§ 4), for readability.** Rejected: it duplicates already-content-addressed information into the hash for no discriminating power, exactly the reasoning ADR-0022 § 11 used to exclude top-level `confidence` from an assertion's own payload — consistency with that precedent favored the minimal payload.
- **Silently drop a relationship revision with a dangling endpoint instead of rejecting the affected resolved identity (§ 6).** Rejected: ADR-0017 requires that no read return a "cleaned-up" graph; silent exclusion is exactly that, dressed as safety.
- **Reject the entire horizon (all `asOf`/`derivationVersion` combinations) on a referential-integrity violation (§ 6).** The initial draft chose this; independent review rejected it as wrongly scoped: visibility and endpoint existence vary with `asOf` and potentially `derivationVersion`, so a violation at one resolved identity says nothing about a different `asOf` at the same horizon — or a later horizon where new Evidence resolves the endpoint. Poisoning identities whose own facts are sound is a false negative dressed as caution.
- **Let S7 detect repository failure kinds by inspecting error messages (§ 9).** Rejected: string-matching is exactly the kind of implicit, drift-prone contract this project's ADR discipline exists to avoid; a named, closed taxonomy with literal `code`/`reason` fields is cheap to define now and expensive to retrofit once S7 exists.
- **Add a `reset()` method to the S2 interfaces for deterministic tests.** Rejected: unnecessary (the factory-per-case pattern already isolates every contract case) and out of scope (S2 is frozen; amending it is not this ADR's authorized action).

## Tradeoffs

- **Chosen:** every S6-implementation-critical choice this audit found is pinned to one deterministic answer before any S6 code exists, at the cost of a document nearly as dense as the S5-completing ADR-0022 it mirrors.
- **Given up:** implementation flexibility on nine points that were, in principle, implementation details — accepted here because "in principle a detail" is exactly how ADR-0022 itself characterized the S5 gaps it closed, and the byte-identity and fail-honest guarantees this project makes depend on those details being decided once, in review, rather than once per implementer.

## Consequences

- With this ADR accepted, S6's future release can proceed directly to implementation against §§ 1–9 without a mid-slice design pause; the S2 contract suite's existing 23 cases remain unchanged and sufficient to prove the _observable_ behavior this ADR does not alter. Acceptance settles design only — the release itself remains a separate explicit human decision.
- The `m1-v2` fixture seed's proof obligation is discharged in two testable parts (§ 3): repository reads pinned to the unimplemented `m1-v2` reject deterministically, and the pure checksum builder demonstrably changes its digest when only the payload's `derivationVersion` field changes — proving `derivationVersion` participates in snapshot identity and checksum input without any second policy being implemented. A future implemented `m1-v2` must produce independently addressable snapshots under its own review.
- S7's future error-mapping work (translating repository failures to ADR-0017 HTTP codes) inherits a fixed, named taxonomy with machine-readable `code`/`reason` literals (§ 9) rather than needing to invent one against whatever S6 happens to throw.

## Risks

- **A tenth gap surfaces during S6 implementation that this audit missed.** Mitigation: the same discipline applies — a genuinely new implementation-critical ambiguity found during S6 is a reviewed follow-up (a new ADR, now that this one is accepted), never an implementation-time judgment call.
- **The referential-integrity decision (§ 6) is still conservative** (rejecting every graph read at an affected resolved identity for one bad relationship, rather than just reads that would touch it). Accepted for M1: the condition cannot arise from the accepted fixture catalog, so the choice costs nothing at synthetic scale; scoping rejection to the exact resolved identity (rather than the whole horizon, as the initial draft did) already bounds the blast radius to precisely the coordinates whose facts are actually violated.
- **Fourth amendment-adjacent ADR in the set**, following the ADR-0019/0020/0021/0022 pattern of filling gaps a predecessor ADR left open. Mitigation: as with ADR-0022's relationship to ADR-0015, this is characterized as a completion of deliberately deferred decisions, not a revision of any accepted decision text — the amendment notices applied at acceptance are metadata-only, and every amended ADR's decision text is preserved verbatim.

## Testable Invariants and Acceptance Evidence

The future S6 implementation must prove, at minimum:

1. No code path in `packages/graph-model` calls `Date.now()` or argument-less `new Date()`; a cursorless `latest`-mode read resolves the injected `Clock`, the current watermark, and the active derivation version exactly once per request, and its resolved `asOf` is traceable to that single injected `Clock` call (§ 1).
2. Cursor binding holds for both cursor kinds (§ 2), at minimum:
   - a `latest`-mode **graph** cursor walk remains on one resolved identity end-to-end, invoking neither the `Clock` nor `getCurrentWatermark()` after the first page — appending Evidence and advancing the injected clock between pages does not change the identity echoed on subsequent pages;
   - an **Evidence** cursor walk remains on the cursor-bound horizon after new Evidence is appended and the watermark advances;
   - a **pinned graph** continuation whose parameters conflict with the cursor rejects with `reason: "CURSOR_BINDING_MISMATCH"`, `cursorKind: "graph"`, the required `cursorBoundIdentity` and `requestedIdentity`, and an exact non-empty `mismatchFields`;
   - a **`latest` graph** continuation with a mismatched filter or page size rejects the same way **without any `requestedIdentity`** (no new identity is resolved in `latest` mode);
   - an **Evidence** continuation with a mismatched horizon or page size rejects with `cursorKind: "evidence"`, the required `requestedHorizon`/`cursorBoundHorizon`, no identity fields, and an exact non-empty `mismatchFields`;
   - a token that passes the shared printable-token schema but cannot be decoded (or is otherwise unusable) rejects with `reason: "INVALID_CURSOR"` and no `mismatchFields`.
3. A pinned read or `getSnapshotSummary` call naming a `derivationVersion` other than `"m1-v1"` — including the fixture seed's `m1-v2` — rejects with `InvalidReadCoordinateError` and `reason: "UNSUPPORTED_DERIVATION_VERSION"`; `latest`-mode always resolves to `"m1-v1"`; no code path serves any policy other than `m1-v1` (§ 3).
4. Recomputing a snapshot's checksum from its resolved identity and the store's visible assertion set (§ 4's exact payload) reproduces the reported checksum byte-for-byte; altering any visible assertion's identifier changes the checksum (content-addressing test, mirroring ADR-0014 invariant 9); and, **at the pure checksum-builder level**, changing only the `derivationVersion` field of the exact § 4 payload changes the digest — proven without serving an unsupported policy through the repository (§§ 3–4).
5. Two `getSnapshotSummary` calls at an identical pinned identity return identical checksums and `subjectCount` — including for a valid empty snapshot: a valid nonzero retained horizon whose requested `asOf` has zero visible assertions returns `subjectCount: 0` and the deterministic empty-assertion checksum (§ 5).
6. Semantic horizon validity is exhaustively enforced (§ 5): against an empty Evidence store, `getCurrentWatermark()` returns `0` and a cursorless `latest` graph read rejects with `InvalidReadCoordinateError` and `reason: "EMPTY_EVIDENCE_STORE"`; for a non-empty store, a pinned horizon below `firstRecordedSequence` rejects with `reason: "HORIZON_BEFORE_FIRST_EVIDENCE"` and a pinned horizon above `currentWatermark` rejects with `reason: "HORIZON_AFTER_CURRENT_WATERMARK"` (both carrying `firstRecordedSequence` and `currentWatermark`) — a future horizon is never silently served as the current watermark; a horizon between retained sequence values succeeds and selects all Evidence with `recordedSequence ≤ horizon`; and horizon `0` never appears in any served, echoed, or cursor-bound `SnapshotIdentity`.
7. A constructed relationship claim with an endpoint unresolvable at a resolved identity causes every graph read at that exact `(asOf, horizon, derivationVersion)` to reject with `ReferentialIntegrityError` naming the assertion, endpoint role, endpoint identifier, and identity coordinates — while a read at a different `asOf` or `derivationVersion` at the same horizon, and at a later horizon where additional Evidence resolves the endpoint, succeeds or fails on its own facts (§ 6).
8. Mutation isolation, in both directions (§ 7):
   - **(a) Input non-mutation:** after `appendEvidence` (and after fixture loading), the caller's Evidence array and every record in it are structurally unchanged and **not frozen** — the caller can still mutate their own objects without affecting the store.
   - **(b) Output isolation:** mutating any returned result envelope, array, page metadata, or cursor structure (where not prevented by freezing) changes no store state and no subsequent read; mutation attempts on frozen returned objects fail without effect.
9. `appendEvidence` validation respects the exact § 8 boundary and is atomic across both failure kinds: a batch failing the shared `evidenceCollectionSchema` rejects with `ZodError` unchanged; a schema-valid batch violating a repository state invariant rejects with `EvidenceAppendError` carrying `reason: "DUPLICATE_EVIDENCE_IDENTIFIER"` or `reason: "NON_INCREASING_RECORDED_SEQUENCE"` and the offending `evidenceIdentifiers`/`recordedSequences` plus `currentWatermark`; and **either** rejection leaves the store's watermark and identifier set completely unchanged (§ 8).
10. Every repository-layer failure already exercised by the S2 contract suite's rejection cases is an instance of one of the § 9 named error classes carrying the exact `readonly` structural properties § 9 defines — including its literal `code` and, where the class defines them, a closed `reason` literal — never a bare `Error`; a known assertion revision requested outside its visibility at the resolved identity rejects with `UnknownIdentifierError` carrying `identifierKind: "assertion"`, the assertion `identifier`, and the populated `resolvedIdentity`; test and S7 bindings use only those structural properties, never `Error.message` text; and no thrown error exposes a complete Evidence record or Evidence content payload (§ 9).

**Acceptance evidence at review time:** this document read against ADR-0012, ADR-0014, ADR-0016 (as amended by ADR-0021), ADR-0017 (as amended by ADR-0020), ADR-0018, ADR-0019, ADR-0021, and ADR-0022, plus the merged S1/S2/S4/S5 sources cited throughout §§ 1–9 and the Audit Summary — demonstrating that every decision here fills a gap those documents left open rather than contradicting anything they settled.

## Relationship to Accepted ADRs

**This ADR was accepted 2026-08-05, and with that acceptance amends ADR-0016, ADR-0018, and ADR-0019 via metadata-only notices** — applied with acceptance, never speculatively, consistent with the project's standing discipline (ADR-0019 § 5, ADR-0020 § 4, ADR-0021 § "Consequences", ADR-0022 § "Relationship to Accepted ADRs"). Every amended ADR's accepted decision text is preserved verbatim; the notices point here:

- **ADR-0016** — §§ 4–5 close the exact snapshot content-addressing payload, checksum construction, and complete semantic horizon validity (empty-store, before-first-Evidence, and above-watermark rules) that ADR-0016 § "Snapshots" described only in general form ("the state of subjects-with-their-valid-assertions … Checksum: SHA-256 over the UTF-8 bytes of this canonical form").
- **ADR-0018** — §§ 1–2 and 7–9 close storage-implementation specifics (injected-clock resolution, graph/Evidence cursor continuation semantics, append atomicity, input/output isolation, and the repository error taxonomy) within the in-memory strategy ADR-0018 already chose but did not detail to this depth.
- **ADR-0019** — § 6 closes the identity-scoped relationship-endpoint referential-integrity enforcement mechanics that ADR-0019 § 4 assigned to S6 ("S2 defines, S6 proves") without specifying what enforcement means operationally.

## Exact S6 Boundary (restated)

Unchanged from ADR-0022 § "Exact S5/S6 Boundary": S5 ends at the pure derivation function and its helpers; S6 begins where state begins — in-memory stores implementing the S2 interfaces, snapshot computation and identity, replay across restarts, checksums-on-snapshots, and the end-to-end S2 contract-suite run. This ADR adds no new slice boundary; it specifies the internals S6 needs to cross that boundary deterministically. S6 ends at working repository implementations passing the contract suite and serving snapshot summaries; S7 begins at API routes, HTTP error-code mapping from this ADR's § 9 taxonomy, and supplying a concrete production `Clock` at the application composition root.

## Conditions That Would Justify Changing This Decision

- A later finding that any § 1–9 rule contradicts an accepted contract not identified here — would require a reviewed superseding or amending ADR, exactly as the three pre-acceptance correction passes responded to the first, second, and third independent reviews.
- S6's actual contract-suite run demonstrating that the § 4 payload shape, once implemented, fails to reproduce checksums independently — would require revisiting the payload definition before S6 can be approved, never a silent implementation-time reinterpretation.
- A future fixture scenario deliberately constructing a dangling relationship endpoint (to test § 6's error path) — would exercise, not change, this decision.
- A future need for a second derivation policy (`m1-v2`) actually being implemented — would extend § 3's lookup table under its own review and must produce independently addressable snapshots (§ 3), never a relaxation of the rejection rule for unknown versions.
