# Atlast — Handoff and Checkpoint Document

The canonical, model-neutral resume document for this project. A replacement conductor or implementation assistant — ChatGPT, Claude Chat, Claude Code, Codex, or a human engineer — must be able to read this file, follow its pointers, and continue the project safely without reconstructing history from conversation logs.

---

## 1. Document Control

- **Last updated:** 2026-08-10
- **Checkpoint name:** `m1-s6-snapshot-stores-merged`
- **Latest merged checkpoint and product commit:** `9bf7f09ea2bd9c755f76dc09710a3bb5e0bf715c` (`feat: add M1 snapshot and in-memory repositories (#23)`) — M1 Slice S6, implemented under accepted [ADR-0023](docs/adr/0023-m1-snapshot-and-in-memory-store-semantics.md), independently reviewed (a final release-candidate audit found and corrected one source-hygiene defect — embedded NUL bytes in `packages/graph-model/src/snapshot-resolver.ts`, replaced with a `|` separator and confirmed text-safe — with no behavioral, contract, or test defect found elsewhere), and squash-merged through [PR #23](https://github.com/Jayc92/atlast/pull/23) to `main` at `9bf7f09` on 2026-08-10 with GitHub Actions `verify` passing in 2m12s.
- **This checkpoint records S6's completion and merge.** S1–S6 are now complete. **No implementation slice is currently active** — closing S6 does not authorize S7. S7–S8 and M2+ remain gated, each on its own explicit human release recorded in [TASKS.md](TASKS.md).
- **Branch state at this checkpoint:** `main` synchronized with `origin/main`, clean working tree.
- **Version history:** this file is updated in place at every checkpoint; Git history preserves every previous checkpoint version. Do not append old checkpoints to this file — retrieve them with `git log -- HANDOFF.md`.
- **Precedence:** the repository source-of-truth documents ([PROJECT_SPEC.md](PROJECT_SPEC.md), [GUARDRAILS.md](GUARDRAILS.md), [docs/milestones.md](docs/milestones.md), [docs/m1-plan.md](docs/m1-plan.md), the accepted ADRs in [docs/adr/](docs/adr/README.md), [TASKS.md](TASKS.md), and [CLAUDE.md](CLAUDE.md)) **override this document wherever they conflict**. HANDOFF.md summarizes; it never supersedes.

## 2. Product Summary

**Atlast is an AI-powered Engineering Topology Platform**: continuous system discovery, a living versioned dependency graph, operational health overlays, and change-impact prediction.

**The user problem:** engineering organizations lose the ability to answer three questions quickly and confidently — _what do we actually run?_, _what depends on what?_, and _what breaks if we change this?_ Catalogs go stale, dependency knowledge lives in people's heads, and impact analysis is guesswork ([PROJECT_SPEC.md § 1](PROJECT_SPEC.md#1-vision)).

**Long-term outcome:** a continuously accurate, machine-derived map of an engineering organization — see, understand, predict, advise — where impact analysis stops being a meeting and becomes a query.

**Non-negotiable principles** (full statements in [PROJECT_SPEC.md § 3](PROJECT_SPEC.md#3-guiding-principles) and [GUARDRAILS.md](GUARDRAILS.md); these resolve all design disputes):

1. **Evidence-first.** Every fact in the graph carries provenance, confidence, and freshness; nothing enters the graph without evidence behind it.
2. **The graph is the source of truth and the product.** Every feature is a view, overlay, or query on the graph; consumers read only through the query API (no side doors).
3. **Deterministic before AI.** Deterministic engines are complete and validated before any LLM reasoning is added; AI output must cite evidence or it is a defect.
4. **Read-only toward observed systems, permanently.** No component may mutate an observed system or hold write-capable credentials to one.
5. **Synthetic-first.** M0–M4 run entirely on synthetic fixtures; the first real contact is M5's read-only connector to a disposable local Kubernetes cluster.
6. **Fail honestly.** Missing, stale, or conflicting input degrades visibly — silent guessing, silent conflict resolution, and silent deletion are defects of the highest severity.

## 3. Locations

- **Local repository:** `/Users/joseph.carfagno/joseph.carfagno/apps/atlast`
- **GitHub:** <https://github.com/Jayc92/atlast> (remote `origin`; PRs target `main`)
- **Key documents and directories:**
  - [README.md](README.md) — entry point and documentation map
  - [PROJECT_SPEC.md](PROJECT_SPEC.md) — vision, goals, principles, scope, non-goals (source of truth for scope)
  - [GUARDRAILS.md](GUARDRAILS.md) — binding engineering standards
  - [CLAUDE.md](CLAUDE.md) — AI assistant working instructions, including the checkpoint protocol
  - [TASKS.md](TASKS.md) — the only place in-flight work is tracked
  - [docs/architecture.md](docs/architecture.md) — architecture philosophy and conceptual design
  - [docs/milestones.md](docs/milestones.md) — authorized milestone sequence M0–M5 with exit criteria
  - [docs/m1-plan.md](docs/m1-plan.md) — the approved M1 implementation baseline (slices S1–S8, fixture catalog, journeys)
  - [docs/adr/](docs/adr/README.md) — accepted ADRs 0001–0023 (index with amendment notes)
  - [docs/audits/](docs/audits/m0-synthetic-boundary-audit.md) — boundary audits
  - `packages/shared` — the merged S1 domain schemas, S2 repository contract surface, and the S3 fixture-catalog validation suite
  - `packages/graph-model` — the merged S4 temporal foundations (Evidence ordering, horizon selection, validity membership, RFC 8785 canonical serialization, collection ordering, SHA-256 digests) and the merged S5 reconciliation engine (the `m1-v1` derivation policy, identity normalization, event-time reconciliation, freshness classification)
  - `apps/api`, `apps/web`, `tests/acceptance`, `scripts/` — the M0 foundation
  - `fixtures/demo-company/` — the merged S3 synthetic fixture catalog ([fixtures/demo-company/README.md](fixtures/demo-company/README.md) documents the scenarios)

This document contains **no credentials, tokens, machine secrets, or private employer data**, and none may ever be added to it.

## 4. Current Roadmap Position

Factual state at this checkpoint:

- **M0 is complete** (2026-07-22).
- **M1 is active and slice-gated** (implementation authorized 2026-07-23; one independently reviewed slice at a time).
- **S1 is complete** — human-reviewed and merged through PR #7 (2026-07-29).
- **S2 is complete** — human-approved 2026-07-29 and merged through PR #10.
- **The S2 checkpoint/HANDOFF protocol merged through PR #11** at `a7a997d` (2026-07-30).
- **S3 is complete** — independently reviewed and approved, merged through PR #13 at `003bccc` on 2026-07-30 with GitHub Actions `verify` passing; its closeout checkpoint merged through PR #14 at `1eca85f` on 2026-07-31.
- **S4 is complete** — authorized through PR #15 (with ADR-0021 accepted through the same PR), implemented, independently reviewed and remediated before approval, and merged through PR #16 at `63bdfab` on 2026-07-31 with GitHub Actions `verify` passing.
- **S5 is complete and closed** — human-authorized in principle 2026-07-31, released by Joseph Carfagno's explicit acceptance of [ADR-0022](docs/adr/0022-m1-reconciliation-policy-and-assertion-derivation.md) (the binding `m1-v1` reconciliation specification) on 2026-08-05 after independent review (acceptance record merged through PR #18 at `f50f0d7`), implemented under accepted ADR-0022, independently reviewed with **no blocking findings** (the reviewer reran `./scripts/verify.sh` successfully), and merged through PR #19 at `0923e9c` on 2026-08-05 with GitHub Actions `verify` passing.
- **The S6 pre-release architecture and authorization review is complete** — [ADR-0023](docs/adr/0023-m1-snapshot-and-in-memory-store-semantics.md) was explicitly accepted by Joseph Carfagno on 2026-08-05 after three independent-review correction passes, settling all nine identified S6 design gaps (and amending ADR-0016/0018/0019 via metadata-only notices). **ADR-0023 is the binding S6 clarification and remains Accepted, unchanged**.
- **S6 is complete** — Joseph Carfagno explicitly authorized S6 on 2026-08-05, recorded in [TASKS.md](TASKS.md); S6 was implemented under accepted ADR-0023, independently reviewed, and merged to `main` through [PR #23](https://github.com/Jayc92/atlast/pull/23) at `9bf7f09` on 2026-08-10 with GitHub Actions `verify` passing. **No implementation slice is currently active — closing S6 does not authorize S7.**
- **S7–S8 remain gated and unauthorized**, each on the preceding slice's merge and its own explicit release. No S7 query/API, S8 closeout, frontend, connector, infrastructure, or dependency work is authorized.
- **M2–M5 remain unauthorized**, each gated on its own explicit human authorization.

**M1 slice purposes** ([docs/m1-plan.md § 4](docs/m1-plan.md#4-proposed-implementation-slices)):

| Slice | Purpose                                                                                                                                                                       | Status                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| S1    | Domain schemas in `packages/shared`: Evidence, identity-only subjects, claim union, content-addressed GraphAssertion revisions, identifiers, `schemaVersion`, rejection tests | Complete — merged via PR #7  |
| S2    | Async repository interfaces (full M1 read contract) in `packages/shared` + storage-agnostic contract-test suite skeleton                                                      | Complete — merged via PR #10 |
| S3    | Fixture suite v1 in `fixtures/demo-company/`: the § 6 scenario catalog as validated Evidence files with declared timestamps                                                   | Complete — merged via PR #13 |
| S4    | Temporal foundations in `packages/graph-model`: Evidence total order, validity intervals, canonical serialization                                                             | Complete — merged via PR #16 |
| S5    | Reconciliation engine in `packages/graph-model`: derivation policy `m1-v1` — matching, corroboration, confidence, conflict, ambiguity, rule traces                            | Complete — merged via PR #19 |
| S6    | Snapshot layer + in-memory stores implementing the S2 interfaces; the contract suite passes end-to-end                                                                        | Complete — merged via PR #23 |
| S7    | Query API v1 routes in `apps/api` with integration tests as executable specification                                                                                          | Gated                        |
| S8    | Acceptance additions (only if the shell changes), M1 boundary re-audit, documentation closeout                                                                                | Gated                        |

**Milestone purposes** ([docs/milestones.md](docs/milestones.md)):

| Milestone | Purpose                                                                                                                                | Status                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| M0        | Safe project foundation: TypeScript monorepo, API + web shells, shared packages, full verification tooling and CI, synthetic data only | Complete (2026-07-22) |
| M1        | Synthetic topology model: the core domain modeled and queryable, driven entirely by fixtures                                           | Active, slice-gated   |
| M2        | Interactive topology interface: graph exploration UI reading exclusively through the query API                                         | Unauthorized          |
| M3        | Operational health overlays: synthetic states (healthy, degraded, down, disconnected, expiring certificate, latent downstream risk)    | Unauthorized          |
| M4        | Change-impact simulation: deterministic, explainable blast-radius analysis — validated before any LLM reasoning                        | Unauthorized          |
| M5        | Read-only local Kubernetes connector: disposable local cluster (e.g., Kind) only — never an employer or production cluster             | Unauthorized          |

Predictive AI, multi-cloud integrations, and multi-source enterprise reconciliation are post-M5 and unscheduled.

## 5. Completed Capabilities

What actually exists in the repository through this checkpoint:

- **M0 foundation:** pnpm/TypeScript monorepo; Fastify API shell (`apps/api`, loopback-only, `GET /health`); responsive React + Vite web shell (`apps/web`, API-connectivity states, desktop + mobile); colocated Vitest suites; Playwright browser acceptance (`tests/acceptance`); `scripts/bootstrap.sh` and `scripts/verify.sh`; GitHub Actions CI running exactly `verify.sh` (ADRs 0001–0013).
- **S1 (merged PR #7):** Zod domain schemas + inferred types in `packages/shared` implementing ADR-0014 as amended by ADR-0019 — the identity-only subject model (subjects carry exactly `schemaVersion`, `identifier`, `subjectKind`; entity type and relationship endpoints live in the assertion's canonical claim), Evidence, content-addressed GraphAssertion revisions, identifiers, `schemaVersion` rejection, rejection-first tests.
- **S2 (merged PR #10):** async `EvidenceStore`/`TopologyGraphStore` repository interfaces in `packages/shared` with strict read contracts (no unbounded or partially pinned read is expressible); reads pinned by (asOf, horizon, derivationVersion); complete resolved metadata plus `schemaVersion` structurally on every graph-read result family including `SnapshotSummary`; subject/assertion binding (no result pairs a subject with an assertion about a different subject); entity-only inventory with the match-by-any-visible-claim `entityType` filter; identifier-only search with locale-independent ASCII normalization; the relationship endpoint referential-integrity obligation (ADR-0019 § 4 — defined in S2, proven by the implementing slice); and the reusable, storage-agnostic contract-test suite skeleton.
- **ADR-0020 (accepted 2026-07-29):** resolved two ADR-0017 wording contradictions found in S2 review — entity-only inventory with a claim-level `entityType` filter (no "status" concept), and identifier-only search (no name claim exists in M1).
- **S3 (merged PR #13, 2026-07-30):** one deterministic manifest-driven fixture catalog in `fixtures/demo-company/` covering the seven approved synthetic scenarios of [docs/m1-plan.md § 6](docs/m1-plan.md#6-synthetic-fixture-scenario-catalog) with 20 valid Evidence records and four deliberately invalid fixtures; strict manifest and file-declaration validation (unknown keys and undeclared files rejected); exact ordering, temporal, horizon, as-of, interval-boundary, and derivation-version seeds; Relationship endpoint-integrity validation; and recursive protection against precomputed derived graph output (fixtures remain pipeline inputs, never pre-reconciled graph state). Scenario documentation in [fixtures/demo-company/README.md](fixtures/demo-company/README.md) distinguishes fixture facts from future expected reconciliation outcomes (executable in S5/S6).
- **Final S3 verification evidence:** 311 shared-package tests passing in 12 files, complete unmodified `scripts/verify.sh` pass, and passing GitHub Actions CI (`verify`) on PR #13. S3 changed no dependencies, lockfiles, production schemas, repository contracts, graph algorithms, reconciliation, storage implementation, API behavior, frontend behavior, connectors, real-system access, or S4+ work.
- **ADR-0021 (accepted 2026-07-31, through PR #15):** amends ADR-0016's canonical-serialization clauses ahead of any implementation — RFC 8785 property names sort as raw UTF-16 code units (not Unicode code points); generic JCS preserves explicit `null` (consistent with the merged S1 `jsonValueSchema`) while absent optional domain fields remain omitted by payload builders; the serialization token stays `jcs-rfc8785`; and the S4 helper / S5–S6 payload-builder composition boundary is fixed.
- **S4 (merged PR #16 at `63bdfab`, 2026-07-31):** temporal-foundation primitives in `packages/graph-model` per ADR-0016 as amended by ADR-0021 — the single locale-free raw UTF-16 code-unit comparator; Evidence total ordering by `observedAt` then `recordedSequence` with pure copied-array sorting; horizon selection by `recordedSequence ≤ horizon` with loud invalid-horizon rejection; **validated half-open validity-interval membership evaluation only** (the complete interval passes the shared `validityIntervalSchema` before comparison; no interval creation, derivation, closure, merging, splitting, or mutation); RFC 8785 canonical serialization whose public boundary validates unknown runtime input through the S1 `jsonValueSchema` with recursive lone-surrogate rejection, explicit-null preservation, loud invalid-runtime-input rejection (`undefined`, sparse holes, `BigInt`, functions, symbols, `NaN`, infinities), raw-UTF-16 property ordering, generic array-order preservation, and BOM-free compact UTF-8; pure copied-array identifier-ordering helpers; and lowercase-hex SHA-256 canonical digest primitives over `node:crypto`. Independent review drove a remediation pass before approval: complete `validityIntervalSchema` validation (equal-bound, reversed, malformed, and unknown-field intervals rejected), removal of every undefined-to-null fallback (an impossible internal `undefined` throws), one identifier extraction per element in `sortByIdentifier` (decorate–sort–undecorate, stable), and the exact RFC 8785 § 3.2.3 seven-property sorting vector asserted byte-for-byte.
- **Final S4 verification evidence:** 82 graph-model tests passing in 5 files; existing totals unchanged (shared 311, API 1, web 5, browser acceptance 2); complete local `./scripts/verify.sh` pass before merge and passing GitHub Actions CI (`verify`) on PR #16. No S5+ behavior and no unauthorized path landed: no reconciliation, confidence/freshness computation, derivation policy, GraphAssertion or snapshot payload builders, interval derivation, snapshot construction/replay, storage, repository implementation, API, frontend, or connector change.
- **S5 (merged PR #19 at `0923e9c`, 2026-08-05):** the reconciliation engine in `packages/graph-model` implementing accepted ADR-0022 — the deeply frozen `m1-v1` derivation policy; deterministic identity normalization and type-free stable identifier construction; event-time standing-claim reconciliation; standing-source-filtered provenance; confidence and symmetric conflict derivation; ambiguity handling with no dangling near-match references; complete assertion revision history with derived validity; schema-valid rule traces; content-addressed GraphAssertion construction through the S4 RFC 8785/SHA-256 primitives; the pure reconciliation function; and the query-time freshness classification helper. Implemented within the ADR-0022 § 14 boundary (`packages/graph-model/src/**` only; no manifest, lockfile, or dependency change), independently reviewed with no blocking findings, and verified by the reviewer's own successful `./scripts/verify.sh` rerun.
- **Final S5 verification evidence:** 129 graph-model tests passing (47 of them S5 tests); existing totals unchanged (shared 311, API 1, web 5, browser acceptance 2); complete local `./scripts/verify.sh` pass before merge and passing GitHub Actions CI (`verify`) on PR #19.
- **S6 (merged PR #23 at `9bf7f09`, 2026-08-10):** the snapshot layer and in-memory repositories in `packages/graph-model` implementing accepted [ADR-0023](docs/adr/0023-m1-snapshot-and-in-memory-store-semantics.md) — deterministic snapshot construction and content-addressed snapshot identity, checksums, and canonical ordering; the derivation-version lookup with loud rejection of any unsupported policy (including the `m1-v2` fixture seed); an injected `Clock` type with no wall-clock reads anywhere in `packages/graph-model`; graph and Evidence cursor issuance, binding, and continuation validation (`CURSOR_BINDING_MISMATCH` vs. `INVALID_CURSOR`); identity-scoped relationship referential-integrity enforcement; caller-input protection and returned-value mutation isolation; atomic `appendEvidence` batches; the closed repository-layer error taxonomy from ADR-0023 § 9; the in-memory `EvidenceStore` and `TopologyGraphStore` implementing all seven frozen `TopologyGraphStore` methods (`getSubject`, `getAssertionRevision`, `listEntities`, `searchSubjects`, `traverse`, `getEvidenceChain`, `getSnapshotSummary`) with bounded historical reads, pagination, bounded traversal, and Evidence-chain construction; and the existing S2 storage-agnostic repository contract suite registered and passing end-to-end (all 23 frozen contract cases, unmodified) against the real S6 implementations via an injected fixture loader over the S3 `demo-company` catalog.
- **Final S6 verification evidence:** 372 graph-model tests passing in 19 files; graph-model typecheck clean; `pnpm format:check` and `pnpm lint` clean repository-wide; `git diff --check` clean against `origin/main`; the complete unmodified `./scripts/verify.sh` pipeline (all 7 stages, including browser acceptance 2/2) passing locally; GitHub Actions `verify` passing on PR #23 in 2m12s. A final independent release-candidate audit of the complete S6 branch delta against accepted ADR-0023 found and corrected one source-hygiene defect — `snapshot-resolver.ts`'s `identityCacheKey` contained two literal NUL bytes (functionally inert at runtime, but causing Git to classify the file as binary, invisible to diff/review/text-search tooling), replaced with a `|` separator — with no behavioral, contract, or test defect found elsewhere in the audited scope.

**What does NOT exist yet** — do not let any document or prompt claim otherwise: no query API routes beyond `GET /health`, and no topology UI. S4 delivered serialization/ordering/membership **primitives**, S5 composed them into the `m1-v1` reconciliation engine with content-addressed GraphAssertions, and S6 composed both into deterministic snapshot construction, identity, and checksums plus the in-memory repository implementations satisfying the S2 contract suite end-to-end. Query API routes (S7) and any topology UI (M2) remain unimplemented and unauthorized.

**Known limitation (deferred, not to be solved in documentation passes):** `packages/graph-model` consumes `@atlast/shared` as TypeScript source through local aliases (a tsconfig `paths` mapping plus a matching Vitest `resolve.alias`), because workspace packages do not yet expose build entry points. A future reviewed change may add proper package entry points; until then the aliases are the working convention.

## 6. Current Git State (at this checkpoint)

Facts observed at this checkpoint:

- **PR #23 (commit `9bf7f09ea2bd9c755f76dc09710a3bb5e0bf715c`) is the latest merged product change** — M1 Slice S6, squash-merged to `main` on 2026-08-10 with GitHub Actions `verify` passing in 2m12s. It is the product state this checkpoint captures. The ADR-0023 acceptance record merged through PR #21 at `70df8c2`; the S6 authorization documentation merged through PR #22 at `dc55363` on 2026-08-06 (historical context only); S5's closeout checkpoint through PR #20 at `afb2359`; S5's authorization packet through PR #18 at `f50f0d7`.
- **This documentation closeout is the checkpoint record for S6's completion and merge.** It lands through its own documentation PR against `main` at `9bf7f09` — the base this checkpoint captures.
- At the checkpoint, `main` is synchronized with `origin/main` and the working tree is clean.
- **No implementation slice is currently active.** S1–S6 are complete and merged; S7–S8 and M2+ remain gated, each on its own explicit human release recorded in [TASKS.md](TASKS.md). Closing S6 does not authorize S7.

**A replacement conductor MUST inspect the actual Git state (`git status`, `git log --oneline --decorate -10`, `git remote -v`) and trust Git over any recorded prose — here or anywhere else.** A future handoff MUST replace this section with the state actually observed at its checkpoint, never copy Git facts forward.

## 7. Current Authorized Work

**No implementation slice is currently active.** S1–S6 are complete and merged; closing S6 does not authorize S7. The next slice (S7) requires its own separate, explicit human release recorded in [TASKS.md](TASKS.md) before any implementation work on it may begin.

**S6 (context) is complete. What S6 delivered** (details in [TASKS.md](TASKS.md) and `packages/graph-model/src/`), implementing accepted [ADR-0023](docs/adr/0023-m1-snapshot-and-in-memory-store-semantics.md):

- Deterministic snapshot construction and content-addressed snapshot identity, payload, and checksum construction, with canonical ordering via the S4 `sortIdentifiers` helper.
- The derivation-version lookup, with loud `UNSUPPORTED_DERIVATION_VERSION` rejection of any pinned read or `getSnapshotSummary` call naming a policy other than `m1-v1` (including the `m1-v2` fixture seed).
- An injected `Clock` type — no code path in `packages/graph-model` calls `Date.now()` or argument-less `new Date()`.
- Graph and Evidence cursor issuance, binding, and continuation validation, distinguishing `CURSOR_BINDING_MISMATCH` from `INVALID_CURSOR` for both cursor kinds.
- Identity-scoped relationship-endpoint referential-integrity enforcement, scoped to the exact resolved `(asOf, horizon, derivationVersion)` identity.
- Caller-input protection (deep-copy and freeze only the store-owned copy) and returned-value mutation isolation.
- Atomic `appendEvidence` batches, with the exact `ZodError`/`EvidenceAppendError` boundary.
- The closed repository-layer error taxonomy from ADR-0023 § 9 (`UnknownIdentifierError`, `InvalidReadCoordinateError`, `ReferentialIntegrityError`, `EvidenceAppendError`).
- The in-memory `EvidenceStore` and `TopologyGraphStore`, implementing all seven frozen `TopologyGraphStore` methods with bounded historical reads, pagination, bounded traversal, and Evidence-chain construction.
- Registration of the existing S2 repository contract suite (all 23 frozen cases, unmodified) against the real S6 implementations via an injected fixture loader over the S3 `demo-company` catalog.
- 372 graph-model tests passing in 19 files.

**S6 stayed within its authorized scope** (`packages/graph-model/src/**` plus `TASKS.md`): no change to `packages/shared`, `fixtures/demo-company/**`, package manifests or lockfiles, `apps/api`, `apps/web`, `scripts/verify.sh`, `scripts/bootstrap.sh`, `m1-v2` or any second derivation policy, or any S7, S8, M2, or later work.

**Permitted work now:** maintenance and corrections of the merged M0 foundation and the merged S1–S6 slices; maintenance of the approved planning and checkpoint documentation. Nothing else — no S7–S8 or M2+ work of any kind, including "preparatory" implementation, until the human explicitly releases the next slice.

**Next-agent preflight** (run before acting on this checkpoint): `git status` (clean tree required), `git log --oneline --decorate -10` (confirm position against this document — S6's merge commit `9bf7f09` should be at or behind the tip of `main`), then read [TASKS.md](TASKS.md) before any work. No implementation slice currently has an explicit human release recorded in TASKS.md; S7–S8 remain gated.

**The checkpoint/slice cycle, in order:**

> human release → bounded implementation prompt → tests/verifier (`scripts/verify.sh`) → human review → PR/CI → merge → HANDOFF.md update → next slice decision

**Checkpoint rule** (binding; also recorded in [CLAUDE.md](CLAUDE.md)): a checkpoint is not closed and the next slice is not released until —

1. the preceding PR is merged;
2. `main` is synchronized with `origin/main` and the working tree is clean;
3. verification status (local `scripts/verify.sh` and GitHub CI) is recorded;
4. HANDOFF.md reflects the merged repository state;
5. the next slice receives explicit human authorization recorded in TASKS.md.

This checkpoint satisfies conditions 1–4 for S6's close. Condition 5 (the next slice's explicit release) has not occurred — S7 remains gated and unauthorized.

## 8. Prohibited Work

**No implementation slice is currently authorized.** S7 in particular is not authorized by S6's completion or merge. Everything beyond maintenance of the merged M0–S6 foundation and approved documentation remains prohibited, in particular:

- Any S7 implementation (query API v1 routes, HTTP error-code mapping, or a production `Clock` at the composition root) before its own separate, explicit human release recorded in TASKS.md.
- Any S8 work (acceptance additions, M1 boundary re-audit, documentation closeout) before its own release.
- Changes to existing S1 schemas, S2 repository contracts, the merged S3 fixture catalog, the merged S4 temporal foundations, the merged S5 reconciliation engine, or the merged S6 snapshot/storage layer beyond maintenance corrections.
- Frontend changes.
- Connector or infrastructure work.
- New third-party dependencies, version upgrades, or lockfile changes.
- Real systems, employer data, credentials, or proprietary names — synthetic, fictional data only.
- M2+ work of any kind.
- Deployment or external publication.

Standing prohibitions regardless of slice: never weaken `scripts/verify.sh` (protected verification contract, ADR-0013); never edit accepted ADRs (supersede or amend via a new ADR); never bypass the query-API-only read path; never implement anything contradicting [PROJECT_SPEC.md § 7 Non-Goals](PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become); no autonomous production behavior of any kind.

## 9. Verification and Resume Commands

From the repository root:

```bash
git status                      # confirm branch and cleanliness — always first
git log --oneline --decorate -10  # confirm position against this document
./scripts/bootstrap.sh          # verify Node/pnpm toolchain + frozen-lockfile install
pnpm --filter @atlast/tests-acceptance browser:install  # one-time Playwright Chromium download
./scripts/verify.sh             # the full verification pipeline
```

`scripts/verify.sh` runs, fail-fast: git whitespace validation → `pnpm format:check` → `pnpm lint` → `pnpm typecheck` → non-browser Vitest suites → `pnpm build` → Playwright browser acceptance. **`verify.sh` locally and GitHub Actions (which runs exactly the same script) are the objective gates** — a change is not "verified" by anyone's assertion, only by their pass. CI must pass on every PR before merge.

## 10. Role Handoff

Three roles operate this project:

- **Conductor** (historically ChatGPT): owns roadmap sequencing, architecture consistency, scope enforcement, independent review of implementation output, and authoring the next bounded implementation prompt. The conductor does not write implementation code.
- **Claude Code**: the implementation engineer — executes one bounded, explicitly released task at a time; self-verifies with tests and `scripts/verify.sh`; reports honestly, including failures; never expands scope.
- **Human (Joseph Carfagno, Founder/Maintainer)**: the sole source of authorization — releases slices and milestones, reviews and approves PRs, merges, and makes every production-sensitive or irreversible decision.

**Conductor substitution:** Claude Chat can replace ChatGPT as conductor if ChatGPT usage is unavailable, while Claude Code remains the implementation engineer. When conductor and implementer are the same model family, the independence of review is weakened — see § 12 — so the human's review becomes correspondingly more important.

## 11. Ready-to-Paste Replacement-Conductor Prompt

```text
You are taking over as the conductor for Atlast, an AI-powered Engineering
Topology Platform, at the repository
/Users/joseph.carfagno/joseph.carfagno/apps/atlast
(GitHub: https://github.com/Jayc92/atlast).

Before anything else:

1. Read HANDOFF.md in full, then the source-of-truth documents it names:
   PROJECT_SPEC.md, GUARDRAILS.md, CLAUDE.md, TASKS.md, docs/architecture.md,
   docs/milestones.md, docs/m1-plan.md, and the ADR index in docs/adr/README.md.
   Those documents override HANDOFF.md wherever they conflict.
2. Inspect the actual Git state: git status, git log --oneline --decorate -10,
   git remote -v. Never trust stale status text over what Git shows; if they
   disagree, investigate before acting.

Operating rules, non-negotiable:

- Preserve the slice and milestone gates exactly as documented. Work proceeds
  one explicitly released slice at a time; only the human releases slices or
  milestones. Do not authorize, imply, or begin gated work.
- Current slice state: S1–S6 are complete and merged (S6, the
  snapshot layer and in-memory repositories, merged through PR #23
  at 9bf7f09 on 2026-08-10 after independent review, implementing
  accepted ADR-0023). No implementation slice is currently active —
  closing S6 does not authorize S7. S7–S8 and M2+ remain gated, each
  on its own explicit human release recorded in TASKS.md.
- Review implementation output independently against the accepted ADRs and
  GUARDRAILS.md before recommending human approval.
- Assign one bounded task at a time, with explicit scope, prohibited actions,
  and verification steps.
- Require scripts/verify.sh to pass locally and GitHub Actions CI to pass on
  the PR before considering any task complete.
- Never access, or direct anything to access, real systems, employer data, or
  credentials. Synthetic data only through M4.
- Follow the checkpoint rule in HANDOFF.md § 7: no checkpoint closes and no
  next slice is released until the PR is merged, main is clean and
  synchronized, verification is recorded, HANDOFF.md is updated, and the human
  has explicitly authorized the next slice.

Begin by reporting your understanding of the project state, the current
checkpoint, and the next authorized decision — do not write or commission any
code until the human confirms your understanding and explicitly releases work.
```

## 12. Open Risks

- **Trustworthy graph correctness is the product risk.** One confidently wrong answer costs more trust than many right ones earn; every honesty mechanism (provenance, confidence, freshness, visible conflict) exists to mitigate it and must survive every slice.
- **Fixtures must keep exercising non-vacuous contract cases.** The S2 contract suite fails loudly when a seed lacks a required scenario (conflicting-type entity, relationship claims, multi-entity cursors). The merged S3 catalog supplies those scenarios with per-scenario adequacy checks, and S6's contract run (all 23 cases, unmodified) now proves this against the real in-memory implementations; any future fixture maintenance must preserve that adequacy.
- **No usable topology product exists until later M1 slices.** Through S6 the repository contains contracts, shells, fixture data, temporal primitives, the reconciliation engine, and the snapshot/storage layer — no query routes or topology visualization; expectation management matters when demonstrating progress. Query API routes are S7's scope, not yet authorized.
- **Workspace source-alias convention.** `packages/graph-model` consumes `@atlast/shared` as TypeScript source through a tsconfig `paths` mapping and matching Vitest alias because workspace packages expose no build entry points yet; a future reviewed change may formalize entry points, and until then new intra-workspace consumers must replicate the alias pattern.
- **Same-model coder/reviewer independence risk.** If Claude Chat conducts while Claude Code implements, both roles share a model family and may share blind spots; the human review gate is the compensating control and should be strictest exactly then.
