# M1 Implementation Plan — Synthetic Topology Model

**Status:** Approved — the M1 implementation baseline (approved 2026-07-23)
**Date:** 2026-07-23

> **M1 IMPLEMENTATION AUTHORIZED (2026-07-23), SLICE-GATED.** This plan is approved as the M1 implementation baseline, ADRs 0014–0022 are Accepted (ADR-0014/0015 as amended by ADR-0019 and [ADR-0022](adr/0022-m1-reconciliation-policy-and-assertion-derivation.md), ADR-0017 as amended by [ADR-0020](adr/0020-m1-inventory-and-search-semantics.md), and ADR-0016 as amended by [ADR-0021](adr/0021-jcs-canonicalization-clarifications.md), below), and a human explicitly authorized M1 implementation on 2026-07-23 — recorded in [TASKS.md](../TASKS.md) and [docs/milestones.md](milestones.md). The authorization permits executing **this plan, one slice at a time**: work is slice-driven and independently reviewed, and each slice remains unauthorized until its preceding slice is reviewed, merged, and the next slice is explicitly released. M2 and later milestones remain unauthorized.
>
> **Slice status (2026-08-05): S1, S2, S3, S4, and S5 complete; no implementation slice is currently active.** S1 (domain schemas) was human-reviewed and merged through PR #7 on 2026-07-29. S2 (async repository interfaces in `packages/shared` carrying the full M1 repository contract — reads pinned by (asOf, horizon, derivationVersion), bounded collection reads and traversal, Evidence lookup and evidence-chain contracts, subject and GraphAssertion revision reads, conflict and ambiguity retrieval, and the relationship endpoint referential-integrity obligations (ADR-0019 § 4) — plus the reusable, storage-agnostic contract-test suite skeleton) was released 2026-07-29, human-approved 2026-07-29 after ADR-0020 remediation, and **merged through PR #10 on 2026-07-30**; the S2 checkpoint/HANDOFF protocol merged through PR #11 at `a7a997d`. S3 (fixture suite v1 per §§ 4–6 and 8 of this plan) is complete — independently reviewed and approved, merged through PR #13 at `003bccc` on 2026-07-30 with GitHub Actions `verify` passing (311 shared-package tests passing in 12 files); its closeout checkpoint merged through PR #14 at `1eca85f` on 2026-07-31. **S4 (temporal foundations per § 4 of this plan) is complete — authorized through PR #15 at `98d2abf` with [ADR-0021](adr/0021-jcs-canonicalization-clarifications.md) (the pre-release canonicalization clarification amending ADR-0016) accepted through the same PR; implemented, independently reviewed and remediated, and merged through PR #16 at `63bdfab` on 2026-07-31 with GitHub Actions `verify` passing**: Evidence total ordering and horizon selection, validated half-open validity-interval membership evaluation, RFC 8785 canonical serialization through the S1 `jsonValueSchema`, copied-array collection-ordering helpers, and lowercase-hex SHA-256 digest primitives in `packages/graph-model` (82 graph-model tests passing in 5 files; current checkpoint in [HANDOFF.md](../HANDOFF.md)). **Closing S4 did not authorize S5.** S5 (reconciliation engine, `m1-v1`) was human-authorized in principle on 2026-07-31, released when **[ADR-0022](adr/0022-m1-reconciliation-policy-and-assertion-derivation.md) — the binding `m1-v1` reconciliation specification — was explicitly accepted by Joseph Carfagno on 2026-08-05 after independent review** (acceptance record merged through PR #18 at `f50f0d7`), and **is now complete: implemented under accepted ADR-0022 within its §§ 1–14 scope and paths (`packages/graph-model/src/**` plus factual TASKS.md notes), independently reviewed with no blocking findings (the independent reviewer reran `./scripts/verify.sh` successfully), and merged through PR #19 at `0923e9c` on 2026-08-05 with GitHub Actions `verify` passing** (129 graph-model tests passing, 47 of them S5 tests; current checkpoint `m1-s5-reconciliation-engine-merged` in [HANDOFF.md](../HANDOFF.md)). **Closing S5 does not authorize S6 — the next permitted action is an S6 pre-release architecture and authorization review, not S6 implementation.** **S6–S8 remain gated** on their own explicit per-slice releases.
>
> **Contract clarification (2026-07-29): [ADR-0020](adr/0020-m1-inventory-and-search-semantics.md) Accepted.** S2 human review surfaced two contradictions between ADR-0017's query-family wording and the accepted domain model (ADR-0014 as amended by ADR-0019): the inventory phrase "filter by type and status" (entity type is claim-level with defined conflict semantics; no "status" concept exists in M1) and the search phrase "identifiers and names" (M1 defines no name claim). ADR-0020, **accepted by human review 2026-07-29**, resolves both — entity-only inventory with an optional claim-level `entityType` filter (match-by-any-claim under conflict, never implying a winner), no generic "status" filter, and identifier-only search over complete canonical identifiers with locale-independent normalization — amending only that ADR-0017 wording (metadata-only notice; accepted text preserved). **Its acceptance releases only the remaining S2 contract corrections** (ADR-0020 § 5), which must land as S2 remediation before S2 can be approved; ADR-0020 itself approves no slice and moves no gate — at its acceptance on 2026-07-29, **S3–S8 and M2+ remained gated** exactly as above. (S3 was subsequently and separately human-authorized on 2026-07-30 and is now complete — merged through PR #13; S4 was later separately released on 2026-07-31 and S5 on 2026-08-05, both now complete — see the slice-status note above; **S6–S8 and M2+ remain gated and unauthorized**.) The § 7 journey wording ("find `checkout` by search") already reads consistently with identifier-only search.
>
> **Architecture amendment (2026-07-23): [ADR-0019](adr/0019-subject-identity-and-assertion-claims.md) Accepted.** ADR-0019 resolved an internal contradiction between ADR-0014's typed-subject clauses and ADR-0015's coexisting-conflicting-claims requirement: **S1 implements ADR-0014 as amended by ADR-0019** — identity-only subjects (`schemaVersion`, `identifier`, `subjectKind`) with type and endpoints in the assertion's canonical claim, and S1 limited to schema validation (endpoint existence checking belongs to the S2 repository contract, proven by S6, per ADR-0019 § 4). Its acceptance unblocked S1 and changed **no slice gate**: S1 stayed the only authorized slice at that time (current slice status in the note above), and M2+ remained gated.

## 1. Objective and Visible Outcome

Build the core domain — Entity, Relationship, Evidence, provenance, confidence, freshness, Snapshot — modeled and queryable, driven entirely by synthetic fixtures ([docs/milestones.md M1](milestones.md#m1--synthetic-topology-model-gated)).

**Visible outcome when M1 completes:** a reviewer can load the synthetic `demo-company` fixtures, query the local API for inventory, entity detail, search, bounded traversal, evidence chains, and snapshots — including as-of-time queries — and see every returned fact carry provenance, confidence, and freshness, with conflicts and ambiguity visibly preserved. All of it deterministic, loopback-only, and covered by the verification contract.

## 2. Scope

### In scope

- Domain schemas in `packages/shared` (per ADR-0014, mechanism per accepted ADR-0005).
- Deterministic reconciliation in `packages/graph-model` (per ADR-0015).
- Temporal/snapshot semantics (per ADR-0016) behind the ADR-0012 repository interfaces.
- In-memory fixture-backed storage (per ADR-0018) with a storage-agnostic contract-test suite.
- Query API v1 in `apps/api` (per ADR-0017).
- Synthetic fixture suite in `fixtures/demo-company/` covering the scenario catalog in § 6.
- Updated boundary audit (§ 10).

### Non-goals for M1

- No UI beyond the existing M0 shell (graph exploration UI is M2; the shell's health check is unchanged).
- No overlays (M3), no impact queries (M4), no connectors or real systems (M5), no predictive AI (post-M5).
- No authentication (separate ADR required before any non-loopback exposure; M1 stays under the localhost exemption in [GUARDRAILS.md § 1.4](../GUARDRAILS.md#14-security)).
- No database, no migrations, no new runtime dependencies beyond those the accepted ADRs already name — Zod is the one anticipated addition, named by accepted ADR-0005; it was introduced in S1 under the justification-at-PR rule (PR #7, 2026-07-29).
- No human annotation mechanism, no manual topology editing (permanent non-goal).

## 3. ADR Dependency Order

Review and accept in this order — each depends on its predecessors:

1. **ADR-0014** (domain model) — defines the subjects, assertions, and shapes everything else uses.
2. **ADR-0016** (temporal semantics) — defines the Evidence total order, validity, snapshot identity (asOf, horizon, derivationVersion), and canonical serialization that reconciliation consumes.
3. **ADR-0015** (reconciliation) — produces the assertions using ADR-0016's ordering and supplies the derivation policy (`m1-v1`) that ADR-0016's snapshot identity pins. **ADR-0015 and ADR-0016 require a joint consistency review**: the ordering/policy interlock means a change to either must be checked against the other before acceptance.
4. **ADR-0017** (query API) — exposes what 0014–0016 define, including pinned/latest read semantics.
5. **ADR-0018** (storage) — implements the interfaces everything above reads through; depends on all four for its requirements.

A change during review to any earlier ADR requires re-checking each later one for contradiction before acceptance.

## 4. Proposed Implementation Slices

Each slice is independently reviewable, lands with its tests, and keeps `scripts/verify.sh` green. Order is dependency-driven; no dates or estimates are attached.

| Slice | Content                                                                                                                                                                                                                                                                                          | Depends on                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| S1    | Domain schemas in `packages/shared`: Evidence (incl. `recordedSequence`, safe-integer-bounded 1…2^53 − 1), Entity/Relationship subjects, content-addressed GraphAssertion revisions (rule trace, validity, conflict/ambiguity state), identifiers, `schemaVersion` — plus schema-rejection tests | ADR-0014 as amended by ADR-0019; both accepted |
| S2    | Repository interfaces (full M1 contract: pinned (asOf, horizon, derivationVersion) reads, bounded traversal, evidence chains) in `packages/shared` + the storage-agnostic contract-test suite skeleton                                                                                           | S1, ADRs 0016–0018 accepted                    |
| S3    | Fixture suite v1 in `fixtures/demo-company/`: scenario catalog of § 6 as validated Evidence files with declared timestamps                                                                                                                                                                       | S1, ADRs 0014–0016 accepted                    |
| S4    | Temporal foundations in `packages/graph-model`: Evidence total order, validity intervals, canonical serialization                                                                                                                                                                                | S1, ADR-0016 accepted                          |
| S5    | Reconciliation engine in `packages/graph-model`: derivation policy `m1-v1` (normalization, aliases, confidence formula, staleness thresholds), matching, corroboration, conflict, ambiguity, rule traces                                                                                         | S1–S4, ADRs 0015–0016 accepted                 |
| S6    | Snapshot layer in `packages/graph-model`: (asOf, horizon, derivationVersion) identity, checksums, replay; in-memory stores implementing the S2 interfaces; contract-test suite passes end-to-end                                                                                                 | S2, S4, S5, ADRs 0016 + 0018 accepted          |
| S7    | Query API v1 routes in `apps/api` with pinned/latest modes, identity-bound cursors, shared response schemas, and error semantics; integration tests as executable specification                                                                                                                  | S6, ADR-0017 accepted                          |
| S8    | Browser acceptance additions only if the M0 shell's displayed status changes; M1 boundary re-audit; documentation closeout                                                                                                                                                                       | S7                                             |

**Rollback points:** every slice boundary is a rollback point — each lands as an independent PR that can be reverted without breaking earlier slices (later slices depend on earlier ones, never the reverse). Fixture-only (S3) and schema-only (S1) slices are trivially revertible; S6 is the first slice where interfaces meet implementation, so S2's contract tests gate it.

## 5. Package and Application Boundaries

| Location                | M1 role                                                                                                                   | Must not contain                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/shared`       | Zod schemas + inferred types for all domain shapes; repository **interfaces**; API request/response schemas; error schema | Behavior, storage, reconciliation logic                                                        |
| `packages/graph-model`  | Reconciliation, temporal computation, in-memory stores implementing the shared interfaces                                 | HTTP anything; direct fixture-path knowledge beyond injected loaders                           |
| `apps/api`              | Query API v1 routes; wiring interfaces to Fastify; validation at the boundary                                             | Storage access except through repository interfaces; graph logic                               |
| `apps/web`              | Unchanged M0 shell                                                                                                        | Any import of `packages/graph-model`; any graph data path except the query API (no side doors) |
| `packages/connectors`   | **Untouched** — remains an empty M5-gated shell                                                                           | Anything                                                                                       |
| `packages/ui`           | Untouched in M1                                                                                                           | —                                                                                              |
| `fixtures/demo-company` | Validated synthetic Evidence files + scenario documentation                                                               | Anything real; any pre-reconciled graph state (fixtures are pipeline inputs, per ADR-0014)     |
| `tests/acceptance`      | Existing browser suite; extended only if the shell UI changes                                                             | M1 domain logic tests (those are colocated)                                                    |

## 6. Synthetic Fixture Scenario Catalog

Each scenario is a named, documented Evidence set with declared timestamps (both `observedAt` and `recordedAt`, per ADR-0016) and an expected-outcome description reviewers can check by hand:

1. **Corroborating evidence** — two synthetic sources observe the same service under rule-matchable names; expected: one stable Entity subject, one assertion revision whose confidence follows the `m1-v1` formula (two sources → `0.7`), provenance citing both (ADR-0015 invariant 6).
2. **Late corroboration as revision** — a third source corroborates the same claim with `recordedSequence` above a previously pinned horizon H₁; expected: at horizon H₂, a **new content-addressed assertion revision** (expanded provenance, confidence `0.8`, new identifier) exists, while the snapshot pinned at H₁ still returns the two-source revision **byte-identically** (ADR-0014 invariant 10, ADR-0016 invariant 4, ADR-0015 invariant 8).
3. **Conflicting evidence** — two sources assert mutually exclusive claims (e.g., different entity types) for one subject; expected: a visible conflict structure, both revisions retained against the same subject with per-revision confidence, no winner (ADR-0014 invariant 5, ADR-0015 invariant 4).
4. **Stale evidence** — a source stops observing an entity; as the injected query time advances across the `m1-v1` thresholds (7 days, 30 days), expected: staleness classification transitions `current` → `stale` → `historical` **while the revision's confidence and identifier are unchanged** (orthogonality; freshness is response data), nothing deleted (ADR-0014 invariant 6, ADR-0015 invariants 6–7).
5. **Ambiguous identity** — two near-matching identities (weak normalization or a one-directional policy alias); expected: two stable Entity subjects, both revisions flagged ambiguous, never merged (ADR-0015 invariant 5).
6. **Relationship appearance and disappearance** — a `calls` Relationship subject appears in evidence, persists, then stops being observed; expected: validity interval opens; later as-of queries show aging classifications while the same revisions still classify `current` at earlier as-of times; once superseding Evidence closes the interval, the revision is **absent** from active snapshots at `asOf ≥ validTo`, while pinned snapshots at earlier `asOf` values still return it byte-identically with its freshness classification unchanged; the subject never appears without a valid revision (ADR-0014 invariant 3, ADR-0016 invariant 6, ADR-0016 invariant 10).
7. **Historical/as-of queries** — a topology that changes shape across three declared time points; expected: as-of queries at each point return the distinct historical shapes; snapshots pinned by the full (asOf, horizon, derivationVersion) identity are byte-identical across replays and restarts (ADR-0016 invariants 1–3).

Edge cases carried by the same catalog: **equal-`recordedAt` Evidence with distinct `recordedSequence`** (deterministic ordering and pinning, ADR-0016 invariant 7), **late-old-observation Evidence** (a record with old `observedAt` but high `recordedSequence` cannot enter an old horizon, ADR-0016 invariant 2), equal-`observedAt` ordering via `recordedSequence` (ADR-0016 invariant 8), duplicate/non-positive `recordedSequence` rejection (ADR-0016 invariant 7), unknown `schemaVersion` rejection (ADR-0014 invariant 7), derivation-version pinning (a policy change produces a new version and leaves existing pinned snapshots unchanged, ADR-0016 invariant 3), and interval-boundary (half-open) behavior.

## 7. API Journeys and Acceptance Checks

Journeys the integration suite must express end-to-end over the fixture catalog (each maps to ADR-0017 invariants):

1. **Inventory → detail → evidence:** list entities, open one, follow every provenance link on its assertions to a real Evidence record that supports it; verify no subject appears without a supporting assertion (traceability — the M1 exit criterion).
2. **Search → traversal:** find `checkout` by search; traverse downstream depth 2 with a confidence floor; verify deterministic ordering, enforcement of the exact ADR-0017 limits, and visible truncation flags.
3. **Conflict visibility:** fetch the conflicted entity from scenario 3 and verify both revisions serialize in-band with their conflict state.
4. **Time travel, pinned and latest:** run the same inventory unpinned (latest) and capture the resolved (asOf, horizon, derivationVersion) from `meta`; re-issue it pinned and verify byte-identical results; run it at three as-of times from scenario 7 and verify the three distinct shapes; verify snapshot SHA-256 checksums stable across replay and that snapshot endpoints reject incomplete identities.
5. **Revision stability across horizons:** using scenario 2, fetch the entity pinned at H₁ and at H₂ and verify the two responses carry different revision identifiers with different provenance/confidence, while repeating the H₁ read remains byte-identical after the H₂ Evidence lands.
6. **Pagination stability:** begin a pinned paginated walk, record additional Evidence (higher `recordedSequence`) mid-walk, and verify the remaining pages are unchanged; verify a cursor replayed with mismatched parameters is rejected.
7. **Degradation honesty and supersession absence:** fetch the stale entity of scenario 4 at increasing as-of times and verify visible staleness classification changes while confidence and revision identifier stay constant; using scenario 6, verify the closed revision is absent from active snapshots at `asOf ≥ validTo` while a pinned earlier-`asOf` read still returns it unchanged (no M1 route returns superseded revisions — that history route is deferred beyond M1).
8. **Error semantics:** schema-invalid requests, unknown IDs, and out-of-range time parameters produce the structured errors ADR-0017 defines — no empty defaults.

## 8. Test Strategy

- **Unit tests** (colocated, Vitest per accepted ADR-0008): schema validation/rejection (subjects and assertion revisions separately, including `recordedSequence` uniqueness and the safe-integer boundary — accept 1 and 2^53 − 1; reject zero, negatives, non-integers, duplicates, and 2^53), content-addressed identifier derivation, normalization rules, the exact `m1-v1` confidence formula and staleness thresholds, confidence/freshness orthogonality, validity/freshness separation (absence after `validTo`; `superseded` reserved, unused in M1), canonical serialization rules (RFC 8785 profile + Atlast collection ordering, SHA-256 checksums), interval arithmetic, ordering via `recordedSequence`.
- **Contract tests** (the ADR-0018 suite): every ADR-0014/0015/0016 invariant exercised through the repository interfaces only — the suite any future storage engine must pass unchanged.
- **Integration tests** (in-process `fastify.inject()` per accepted ADR-0009): the § 7 journeys as the query API's executable specification, unhappy paths first-class.
- **Browser acceptance** (Playwright per accepted ADR-0010): unchanged unless the shell UI changes; no M1 domain assertions belong here.
- **Determinism discipline:** injected clock everywhere; no test reads wall-clock time or randomness; fixture files declare all timestamps; replay tests run the pipeline twice and compare byte-identical output.
- All suites run through the existing unmodified `scripts/verify.sh`.

## 9. Boundary-Audit Requirements

The M0 audit ([docs/audits/m0-synthetic-boundary-audit.md](audits/m0-synthetic-boundary-audit.md)) names M1 fixture data as a re-audit trigger. M1 must therefore end with a documented re-audit covering: fixture content (fictional, no real identifiers/domains/credentials), any new dependency surface (expected: Zod only), the unchanged loopback-only posture of the API with its new routes, and confirmation that no connector, credential, or external-system code path was introduced. The audit lands in `docs/audits/` before M1 is declared complete.

## 10. Protected Files and Prohibited Actions During M1 Implementation

**Protected (unchanged rules carry forward):** `scripts/verify.sh` (protected verification contract per ADR-0013 — changes require their own human review), `scripts/bootstrap.sh`, `GUARDRAILS.md` and `PROJECT_SPEC.md` (amendment process only), accepted ADRs (superseded, never edited).

**Prohibited throughout M1:** connecting to any real system; holding any credential; write-capable clients of any kind; mutation endpoints on graph resources; manual topology editing mechanisms; ML/probabilistic identity; unbounded queries; new dependencies beyond justified, ADR-covered ones; weakening any verify.sh check.

## 11. Completion Criteria (mapped to docs/milestones.md M1 exit criteria)

| Milestone exit criterion                                                         | Satisfied by                                                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Model and query API run wholly from fixtures in CI with no external dependencies | Slices S1–S7 green under unmodified `scripts/verify.sh` in GitHub Actions; ADR-0018 invariant 5 (no storage provisioning in CI) |
| Every fact in the graph is traceable to its synthetic evidence via the API       | Journey 1 (§ 7) as a passing integration test over every fixture scenario; ADR-0017 invariant 7                                 |
| Graph/evidence representation decisions recorded as ADRs and human-approved      | ADRs 0014–0019 moved from Proposed to Accepted by human review (0014/0015 amended by ADR-0019)                                  |

Plus the standing constraint verified at close: the § 9 boundary re-audit passes.

## 12. Human Approval Checklist

Approvals required, in order — none is implied by any other:

- [x] This plan (docs/m1-plan.md) reviewed and approved as the M1 implementation baseline — _approved 2026-07-23_.
- [x] ADR-0014 reviewed → Accepted — _2026-07-23_.
- [x] ADR-0016 reviewed → Accepted — _2026-07-23, joint consistency review with 0015_.
- [x] ADR-0015 reviewed → Accepted — _2026-07-23, joint consistency review with 0016_.
- [x] ADR-0017 reviewed → Accepted — _2026-07-23_.
- [x] ADR-0018 reviewed → Accepted — _2026-07-23_.
- [x] **M1 implementation explicitly authorized** — _given 2026-07-23; recorded in TASKS.md and docs/milestones.md. Execution is slice-gated, each slice released explicitly after the preceding slice is reviewed and merged: S1 (domain schemas) is complete — merged through PR #7 on 2026-07-29; S2 (repository contract surface) is complete — human-approved 2026-07-29, merged through PR #10 on 2026-07-30; and S3 (fixture suite v1) is complete — independently reviewed and approved, merged through PR #13 at `003bccc` on 2026-07-30. **S4 (temporal foundations) is complete — authorized through PR #15 with ADR-0021 accepted through the same PR, independently reviewed and remediated, merged through PR #16 at `63bdfab` on 2026-07-31.** **S5 (reconciliation engine, `m1-v1`) is complete — human-authorized 2026-07-31 with ADR-0022 explicitly accepted 2026-08-05 (acceptance record merged through PR #18 at `f50f0d7`), implemented, independently reviewed with no blocking findings, and merged through PR #19 at `0923e9c` on 2026-08-05.** No implementation slice is currently active; S6–S8 remain gated on their own explicit releases._
- [x] (During implementation) Zod dependency introduction justified at PR per GUARDRAILS.md § 2 — _justified and merged through PR #7 on 2026-07-29 (Zod 4.4.3, exact-pinned in `packages/shared`)._
- [ ] (At close) M1 boundary re-audit reviewed; M1 exit criteria checked in docs/milestones.md; M2 remains gated pending its own authorization.
