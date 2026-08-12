# Atlast — Handoff and Checkpoint Document

The canonical, model-neutral resume document for this project. A replacement conductor or implementation assistant — ChatGPT, Claude Chat, Claude Code, Codex, or a human engineer — must be able to read this file, follow its pointers, and continue the project safely without reconstructing history from conversation logs.

---

## 1. Document Control

- **Last updated:** 2026-08-12
- **Checkpoint name:** `m1-s8-candidate`
- **Latest merged checkpoint commit:** `a4c6a5d0a39af2b7ba76035a6449447cdfc5f216` (`docs: authorize M1 implementation slice S8 (#30)`) — the S8 authorization checkpoint, merged through [PR #30](https://github.com/Jayc92/atlast/pull/30) on 2026-08-12 with GitHub Actions `verify` passing. This authorization is now effective.
- **Latest merged product commit:** `a7624cd6328c097dc4f752bc47a6a4863d36e968` (`feat: add M1 query API v1 (#28)`) — M1 Slice S7, unchanged since the prior checkpoint. **S8 implementation output now exists as an unmerged release candidate** (below) — it is not yet the merged product state.
- **This document update records the S8 release candidate**, now including two further narrow remediation extensions Joseph Carfagno separately authorized: on branch `feat/m1-s8-boundary-closeout` (based on merged `main` at `a4c6a5d`), the authorized S8 scope was produced — the M1 synthetic-boundary re-audit ([docs/audits/m0-synthetic-boundary-audit.md § 14](docs/audits/m0-synthetic-boundary-audit.md), which found and then resolved one source-hygiene finding within this same candidate), factual M1 documentation closeout (this file and the others named in [TASKS.md](TASKS.md)'s S8 progress notes), the minimal `apps/web` shell-status correction with its corresponding test updates, the exhaustive API traceability integration test in `apps/api/src/routes/evidence.test.ts`, and the source-text-safe NUL correction in `packages/graph-model/src/reconciliation.ts`. **This candidate is not yet independently reviewed, PR-approved, or merged**; its own squash-merge SHA is intentionally not predicted here — always read the actual tip from Git, not from this file.
- **Branch state at this checkpoint:** `feat/m1-s8-boundary-closeout`, based on merged `main` at `a4c6a5d`, working tree carries the uncommitted S8 candidate changes, no stash entries.
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
  - [docs/adr/](docs/adr/README.md) — accepted ADRs 0001–0025 (index with amendment notes)
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
- **The S7 pre-release architecture and contract review is complete** — [ADR-0024](docs/adr/0024-m1-query-api-runtime-contract.md) was explicitly accepted by Joseph Carfagno on 2026-08-11, after the S7 pre-release review and three independent correction passes, settling fifteen genuine, implementation-critical HTTP-boundary and build-boundary gaps (and amending ADR-0017/0020 via metadata-only notices). **ADR-0024 is the binding S7 runtime contract and remains Accepted, unchanged.**
- **S7 is complete** — Joseph Carfagno explicitly authorized S7 on 2026-08-11, recorded in [TASKS.md](TASKS.md). An actual implementation attempt reproduced a genuine, implementation-critical contradiction between accepted ADR-0011 (`apps/api`'s `erasableSyntaxOnly: true`) and accepted ADR-0024 § 14 step 5 (the `@atlast/graph-model` typecheck/test source alias); [ADR-0025](docs/adr/0025-s7-source-alias-erasable-syntax-compatibility.md), explicitly accepted by Joseph Carfagno on 2026-08-11, resolved it by authorizing exactly one narrow, behavior-preserving refactor to `packages/graph-model/src/identity-normalization.ts` (amending ADR-0022/0024 via metadata-only notices). S7 was then implemented under accepted ADR-0024 as amended by ADR-0025, independently reviewed, and **merged to `main` through [PR #28](https://github.com/Jayc92/atlast/pull/28) at `a7624cd` on 2026-08-11 with GitHub Actions `verify` passing in 2m14s.** **S1–S7 are now complete.** Its closeout checkpoint merged through [PR #29](https://github.com/Jayc92/atlast/pull/29) at `9acfefa` on 2026-08-11. **Closing S7 did not authorize S8.**
- **S8 authorization is effective** — its authorization PR ([PR #30](https://github.com/Jayc92/atlast/pull/30)) merged to `main` at `a4c6a5d` on 2026-08-12 with GitHub Actions `verify` passing, and `main` is synchronized locally with a clean working tree, satisfying the standing checkpoint rule's condition for the authorization to take effect.
- **S8 implementation output now exists as a release candidate, not yet reviewed or merged** — on branch `feat/m1-s8-boundary-closeout`, the authorized scope was produced: the M1 synthetic-boundary re-audit ([docs/audits/m0-synthetic-boundary-audit.md § 14](docs/audits/m0-synthetic-boundary-audit.md), which found one source-hygiene finding — an embedded NUL byte in `packages/graph-model/src/reconciliation.ts` — and, under its own separate explicit narrow authorization, resolved it within this same candidate; no findings requiring remediation remain), factual M1 documentation closeout (this file and the others named in [TASKS.md](TASKS.md)), the minimal `apps/web` shell-status correction, and the exhaustive API traceability integration test in `apps/api/src/routes/evidence.test.ts`. **This candidate still requires independent review, complete local `./scripts/verify.sh` verification, PR approval, passing GitHub Actions `verify`, merge, and a final M1 closeout checkpoint before S8 — or M1 — can be called complete.**
- **M2–M5 remain unauthorized**, each gated on its own explicit human authorization.

**M1 slice purposes** ([docs/m1-plan.md § 4](docs/m1-plan.md#4-proposed-implementation-slices)):

| Slice | Purpose                                                                                                                                                                       | Status                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| S1    | Domain schemas in `packages/shared`: Evidence, identity-only subjects, claim union, content-addressed GraphAssertion revisions, identifiers, `schemaVersion`, rejection tests | Complete — merged via PR #7                                                           |
| S2    | Async repository interfaces (full M1 read contract) in `packages/shared` + storage-agnostic contract-test suite skeleton                                                      | Complete — merged via PR #10                                                          |
| S3    | Fixture suite v1 in `fixtures/demo-company/`: the § 6 scenario catalog as validated Evidence files with declared timestamps                                                   | Complete — merged via PR #13                                                          |
| S4    | Temporal foundations in `packages/graph-model`: Evidence total order, validity intervals, canonical serialization                                                             | Complete — merged via PR #16                                                          |
| S5    | Reconciliation engine in `packages/graph-model`: derivation policy `m1-v1` — matching, corroboration, confidence, conflict, ambiguity, rule traces                            | Complete — merged via PR #19                                                          |
| S6    | Snapshot layer + in-memory stores implementing the S2 interfaces; the contract suite passes end-to-end                                                                        | Complete — merged via PR #23                                                          |
| S7    | Query API v1 routes in `apps/api` with integration tests as executable specification                                                                                          | Complete — merged via PR #28                                                          |
| S8    | Acceptance additions (only if the shell changes), M1 boundary re-audit, documentation closeout                                                                                | Authorized and effective; implementation is a release candidate awaiting review/merge |

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
- **S7 (merged PR #28 at `a7624cd`, 2026-08-11):** the query API v1 in `apps/api` implementing accepted [ADR-0024](docs/adr/0024-m1-query-api-runtime-contract.md) as amended by [ADR-0025](docs/adr/0025-s7-source-alias-erasable-syntax-compatibility.md) — the additive `packages/shared` HTTP contracts (route 7's narrowed snapshot-summary envelope, route 5's Evidence-lookup envelope, the closed discriminated `errorResponseSchema` with its cursor-mismatch/unknown-identifier/invalid-read-coordinate detail shapes, and two HTTP query-coercion helper schemas) and the production-valid package-entry-point build plumbing for `packages/shared`/`packages/graph-model` (real `dist`/`main`/`types`/`exports`, with the typecheck/test-only source-alias convention retained by design per ADR-0024 § 14); the one authorized behavior-preserving refactor to `packages/graph-model/src/identity-normalization.ts` (`IdentityNormalizationError`'s constructor-parameter properties replaced with `declare readonly` fields plus explicit constructor assignment, resolving the `erasableSyntaxOnly`/source-alias contradiction ADR-0025 documents); and, in `apps/api`, request/query coercion (partial-pin rejection, wire-name mapping, strict numeric coercion), the closed and unconditionally redacted error-response contract (including a `mapFrameworkError` dispatch distinguishing genuinely malformed client input — `FST_ERR_BAD_URL`/`FST_ERR_MAX_PARAM_LENGTH` — from internal Fastify failures such as `FST_ERR_ASYNC_CONSTRAINT`, which redact to `INTERNAL_ERROR`), mandatory response-schema validation before every successful send, all seven accepted query routes (entity inventory, entity detail, identifier search, bounded traversal, Evidence lookup, the entity-scoped evidence chain, and pinned snapshot summary) plus the unchanged `GET /health`, and an asynchronous, fixture-backed `initializeApplication`/`buildApplication` composition root guaranteeing no request can be served before fixture ingestion completes.
- **Final S7 verification evidence:** 64 `apps/api` tests passing in 7 files (unchanged elsewhere: shared 373/373 in 14 files, graph-model 372/372 in 19 files, web 5/5); `pnpm typecheck`/`pnpm lint`/`pnpm format:check` clean repository-wide; `git diff --check` clean; a clean-build proof (`rm -rf` all three packages' `dist/`, then `pnpm build`) succeeded with every emitted relative import ending in `.js`; the compiled `apps/api/dist/server.js` and the raw `node apps/api/src/server.ts` dev-loop entrypoint each started, served `GET /health` and a representative query route with real fixture data, and stopped cleanly; the complete unmodified `./scripts/verify.sh` pipeline (all 7 stages, including browser acceptance 2/2) passed locally, and GitHub Actions `verify` passed on PR #28 in 2m14s.

**What does NOT exist yet** — do not let any document or prompt claim otherwise: any topology UI. S4 delivered serialization/ordering/membership **primitives**, S5 composed them into the `m1-v1` reconciliation engine with content-addressed GraphAssertions, S6 composed both into deterministic snapshot construction, identity, and checksums plus the in-memory repository implementations satisfying the S2 contract suite end-to-end, and **S7 wired all of it to a real HTTP query API** (inventory, entity detail, search, bounded traversal, Evidence lookup, the entity-scoped evidence chain, and pinned snapshot summary) — the M1 fixtures-to-query-API loop is now implemented end-to-end. M2's graph exploration UI remains unimplemented and unauthorized.

**Design note (no longer an open limitation):** `packages/graph-model` and `apps/api` still consume `@atlast/shared`/`@atlast/graph-model` as TypeScript source through tsconfig `paths` aliases and matching Vitest `resolve.alias` entries for typecheck and test — this is now the deliberate, ADR-0024 § 14-specified convention, not a stand-in for a missing capability: `scripts/verify.sh` runs `pnpm typecheck` before `pnpm build` (ADR-0013), so the aliases let typecheck/test run without requiring a prior build. Production builds resolve both packages through their real `main`/`types`/`exports` entry points instead, proven by S7's clean-build-then-run verification.

## 6. Current Git State (at this checkpoint)

Facts observed at this checkpoint:

- **PR #30 (commit `a4c6a5d0a39af2b7ba76035a6449447cdfc5f216`) is the latest merged change** — the S8 authorization checkpoint documentation, squash-merged to `main` on 2026-08-12 with GitHub Actions `verify` passing. **S1–S7 are complete; S8's authorization is effective, and S8 implementation output exists as an unmerged release candidate** (below). The S7 closeout merged through [PR #29](https://github.com/Jayc92/atlast/pull/29) at `9acfefa` on 2026-08-11 (immediately preceding); the S7 product commit merged through [PR #28](https://github.com/Jayc92/atlast/pull/28) at `a7624cd`.
- **This candidate's own delta lives on branch `feat/m1-s8-boundary-closeout`, based on merged `main` at `a4c6a5d`.** It has not been committed, pushed, reviewed, or merged; this artifact intentionally does not predict its eventual squash-merge SHA.
- At this checkpoint, `main`/`origin/main` are synchronized at `a4c6a5d`; the `feat/m1-s8-boundary-closeout` working tree carries the uncommitted candidate changes (this document among them), and no stash entries remain.
- The candidate delta touches exactly six documentation files ([TASKS.md](TASKS.md), this document, [CLAUDE.md](CLAUDE.md), [README.md](README.md), [docs/m1-plan.md](docs/m1-plan.md), [docs/milestones.md](docs/milestones.md)), the audit extension ([docs/audits/m0-synthetic-boundary-audit.md](docs/audits/m0-synthetic-boundary-audit.md)), the minimal shell correction (`apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`, `tests/acceptance/specs/shell.spec.ts`), and **two further narrow remediation extensions Joseph Carfagno separately authorized**: `apps/api/src/routes/evidence.test.ts` (exhaustive API traceability integration coverage) and `packages/graph-model/src/reconciliation.ts` (the one-line source-text-safe NUL-byte correction, § 7 below) — confirmed against `git diff --stat a4c6a5d`.

**A replacement conductor MUST inspect the actual Git state (`git status`, `git log --oneline --decorate -10`, `git remote -v`) and trust Git over any recorded prose — here or anywhere else.** A future handoff MUST replace this section with the state actually observed at its checkpoint, never copy Git facts forward.

## 7. Current Authorized Work

**Slice S8 — M1 synthetic-boundary re-audit and documentation closeout — is the only active authorized implementation slice, and its authorization is now effective** (PR #30 merged at `a4c6a5d`, `main` synchronized locally with a clean working tree, satisfying the standing checkpoint rule below). **S8 implementation output now exists as a release candidate on branch `feat/m1-s8-boundary-closeout`, produced within the authorized scope below — it is not yet independently reviewed, verified end-to-end, PR-approved, or merged.** **M1 must not be called complete until this candidate is reviewed, verified, merged, and formally closed.**

**S7 (context) is complete and formally closed.** S7 delivered the query API v1 in `apps/api` implementing accepted [ADR-0024](docs/adr/0024-m1-query-api-runtime-contract.md) as amended by [ADR-0025](docs/adr/0025-s7-source-alias-erasable-syntax-compatibility.md) — see [TASKS.md](TASKS.md) for the full delivery record. Merged through PR #28 at `a7624cd`; closeout merged through PR #29 at `9acfefa`. 64 `apps/api` tests passing in 7 files (shared 373/373 in 14 files, graph-model 372/372 in 19 files, web 5/5 unchanged).

**Authorized S8 implementation scope, and what the candidate delivered against it:**

1. **The M1 synthetic-boundary re-audit** — extending [docs/audits/m0-synthetic-boundary-audit.md](docs/audits/m0-synthetic-boundary-audit.md) to cover the M1 fixture data (`fixtures/demo-company/**`) and the complete S1–S7 delta, per that audit's own § 11 re-audit trigger and [docs/m1-plan.md § 9](docs/m1-plan.md#9-boundary-audit-requirements). **Delivered as § 14** of that document: no synthetic-boundary violation found; one source-hygiene finding (below) was found during the audit and then resolved within this same candidate.
2. **Factual M1 documentation and checkpoint closeout** — updating [TASKS.md](TASKS.md), this document, [docs/milestones.md](docs/milestones.md), and [docs/m1-plan.md](docs/m1-plan.md) to record the audit result and the final M1 exit-criteria status. **Delivered**, recorded as a candidate, not a completion.
3. **Browser acceptance additions in `tests/acceptance`, only if the existing M0 shell's displayed status changes as part of that factual closeout.** **Delivered as the minimal correction it authorized**: `apps/web/src/App.tsx`'s milestone route now shows M0 as delivered and M1 as the distinct **core delivered** status (M1's own closeout is not yet formally complete) rather than gated, and its current-state section names the delivered fixture-driven model/reconciliation/snapshot/query-API core instead of claiming no topology exists; `apps/web/src/App.test.tsx` and `tests/acceptance/specs/shell.spec.ts` gained the directly corresponding assertions. No graph data, search, navigation, routing, visualization, or new `apps/web` API consumption was added — the page still makes only the pre-existing `/api/health` request.

**Two further narrow remediation extensions, each separately and explicitly authorized by Joseph Carfagno, both now delivered within this same S8 candidate:**

4. **Exhaustive API traceability integration coverage** — `apps/api/src/routes/evidence.test.ts` gained an integration test sweeping 18 read coordinates derived from the complete valid fixture catalog (every distinct `observedAt` paired with the full retained horizon 20, plus the catalog's declared supported snapshot identity), fully paginating `GET /api/v1/entities` and `GET /api/v1/search` at each coordinate, collecting every provenance/competing-claim/rule-trace Evidence identifier across 15 distinct visible subjects (both Entity and Relationship kinds) and 21 distinct assertion revisions, and dereferencing all of them through `GET /api/v1/evidence/{evidenceId}` — the union equals, by strict set equality, all 20 valid Evidence records, with all seven valid scenarios contributing non-vacuously. This is the evidence [docs/audits/m0-synthetic-boundary-audit.md § 14.11](docs/audits/m0-synthetic-boundary-audit.md) row 2 now cites for M1 exit criterion 2.
5. **The source-text-safe NUL correction** — `packages/graph-model/src/reconciliation.ts`'s `draftKey` composite-key builder had one literal embedded NUL byte (found by § 14's corrected, byte-safe audit sweep) replaced with the six-character source escape `` `\u0000` ``, preserving the exact runtime U+0000 delimiter and behavior — verified byte-safe (zero `0x00` bytes remain in the file or anywhere in the 180-file tracked tree) and runtime-equivalent (the fixed expression evaluates to a `length === 3` string with `codePointAt(1) === 0`, identical to the pre-fix delimiter). The unchanged 372-test `packages/graph-model` suite continues to pass. No other production line, schema, fixture, dependency, or scope changed.

**S8 did NOT implement, and the candidate confirms it did not, beyond the two narrowly authorized exceptions named in items 4–5 above:** any topology exploration UI or other M2 behavior; new frontend features, graph visualization, or `apps/web` API consumption beyond the named text correction; changes to S1–S7 production _behavior_ (item 5's fix is explicitly behavior-preserving — `reconciliation.ts`'s reconciliation logic is unchanged, only one delimiter's literal source-text representation changed); changes to domain schemas, repository contracts, fixtures, or snapshot/storage behavior; connectors, authentication, infrastructure, deployment, or real-system access; new dependencies, upgrades, package-manifest changes, or lockfile changes; or changes to `scripts/verify.sh`/`scripts/bootstrap.sh`.

**Permitted work now:** independent review, verification, and merge of this S8 candidate; maintenance and corrections of the merged M0 foundation and the merged S1–S7 slices; maintenance of the approved planning and checkpoint documentation. Nothing else — no M2+ work of any kind, including "preparatory" implementation.

**Next-agent preflight** (run before acting on this checkpoint): `git status` (confirm branch and the candidate's uncommitted state), `git log --oneline --decorate -10` (confirm position against this document), then read [TASKS.md](TASKS.md) before any work.

**The checkpoint/slice cycle, in order:**

> human release → bounded implementation prompt → tests/verifier (`scripts/verify.sh`) → human review → PR/CI → merge → HANDOFF.md update → next slice decision

**Checkpoint rule** (binding; also recorded in [CLAUDE.md](CLAUDE.md)): a checkpoint is not closed and the next slice is not released until —

1. the preceding PR is merged;
2. `main` is synchronized with `origin/main` and the working tree is clean;
3. verification status (local `scripts/verify.sh` and GitHub CI) is recorded;
4. HANDOFF.md reflects the merged repository state;
5. the next slice receives explicit human authorization recorded in TASKS.md.

This checkpoint records conditions 1–4 for **S8's authorization** (satisfied: PR #30 merged, `main` synchronized with a clean working tree, verification recorded, this document updated) — **the authorization is effective.** Condition 5 (the next slice's authorization) does not yet apply: S8 implementation is still an unreviewed, unmerged candidate, so no "next slice" question arises until this candidate's own checkpoint closes.

## 8. Prohibited Work

**S8 is the only authorized implementation slice, and this candidate stayed inside its scope** (§ 7). Everything else remains prohibited, in particular:

- **Committing, pushing, opening a PR for, merging, or tagging this candidate** without the explicit human review step this checklist calls for — that step is outside this task's scope; this task only produces and locally verifies the candidate.
- Any S8 work outside the authorized scope in § 7 — including any topology exploration UI or other M2 behavior, new frontend features, graph visualization, or `apps/web` API consumption, any change to S1–S7 production behavior, domain schemas, repository contracts, fixtures, reconciliation, snapshot/storage behavior, or query API behavior, connectors/authentication/infrastructure/deployment/real-system access, new dependencies/upgrades/manifest/lockfile changes, or changes to `scripts/verify.sh`/`scripts/bootstrap.sh`.
- **Declaring S8 or M1 complete before this candidate is independently reviewed, verified, merged, and formally closed.**
- **Frontend changes of any kind beyond the narrowly bounded shell-status correction this candidate made** (§ 7 item 3) — no broader UI, layout, or design change.
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
- Current slice state: S1–S7 are complete and merged (S7, the
  query API v1 routes in apps/api, merged through PR #28 at
  a7624cd on 2026-08-11 after independent review, implementing
  accepted ADR-0024 as amended by ADR-0025; its closeout checkpoint
  merged through PR #29 at 9acfefa). Joseph Carfagno then explicitly
  authorized Slice S8 in the conductor conversation on 2026-08-11
  (recorded in TASKS.md); that authorization's own documentation PR
  merged through PR #30 at a4c6a5d on 2026-08-12 with main
  synchronized locally and a clean working tree, so the S8
  authorization is now effective. S8 implementation output exists
  as an unreviewed, unmerged release candidate on branch
  feat/m1-s8-boundary-closeout — verify its actual review/merge
  state in Git before treating S8 as closed. The authorization did
  not approve that output in advance; it still requires independent
  review, verification, PR approval, merge, and a final M1 closeout
  checkpoint. M1 must not be called complete until S8 closes.
  M2+ remain gated, each on its own explicit human release
  recorded in TASKS.md.
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
- **A usable query API now exists, but no topology UI does.** S7 delivered the complete query API v1 (inventory, entity detail, search, bounded traversal, Evidence lookup, the entity-scoped evidence chain, and pinned snapshot summary) against real fixture data, verified end-to-end via both `fastify.inject()` and a running compiled server. M2's graph exploration UI remains unimplemented and unauthorized — expectation management still matters when demonstrating progress, since only `curl`/`fastify.inject()` currently reach the graph.
- **Workspace source-alias convention, now implemented as designed.** `apps/api` and `packages/graph-model` consume their workspace dependencies as TypeScript source through tsconfig `paths` mappings and matching Vitest aliases for typecheck/test only (ADR-0024 § 14); production builds resolve through real `main`/`types`/`exports` entry points instead, proven by S7's clean-build-then-run verification. No further action needed unless a future, separately reviewed change adopts a different convention.
- **Same-model coder/reviewer independence risk.** If Claude Chat conducts while Claude Code implements, both roles share a model family and may share blind spots; the human review gate is the compensating control and should be strictest exactly then.
- **Implementation attempts keep surfacing gaps design review alone did not catch — a pattern, not a one-off.** The ADR-0022/0023/0024/0025 lineage found four such gaps in succession (most recently the `erasableSyntaxOnly`/source-alias contradiction ADR-0025 resolved, and, within S7-B itself, a Fastify `frameworkErrors`-routing gap for `FST_ERR_ASYNC_CONSTRAINT` found and fixed during S7's own review-remediation pass). All are now resolved and merged; the mitigation going forward is unchanged — treat every slice's implementation attempt as part of this project's review process, not merely its execution, and budget review time accordingly for S8's re-audit and beyond.
- **S8 is the final M1 gate — do not let a partial audit or a documentation-only pass be mistaken for M1 completion.** S8's authorized scope is narrow by design (re-audit plus factual closeout, with a shell-status change permitted only if strictly necessary); the temptation to skip the boundary re-audit because "nothing looks different" is exactly the failure mode GUARDRAILS' fail-honest principle exists to prevent. M1 exit criteria in [docs/milestones.md](docs/milestones.md) and [TASKS.md](TASKS.md) stay unchecked until this candidate's own review, verification, and merge close it.
- **An unreviewed candidate is not a merged fact.** [docs/audits/m0-synthetic-boundary-audit.md § 14](docs/audits/m0-synthetic-boundary-audit.md) found no boundary violation, but that finding binds to an unmerged commit on `feat/m1-s8-boundary-closeout` — per its own stated caveat, a brief revalidation against the real merge commit is required before the final M1 closeout checkpoint treats it as closed, mirroring how § 13 revalidated the M0 audit against the real M0 closure commit rather than trusting the pre-merge branch state.
