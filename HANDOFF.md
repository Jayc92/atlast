# Atlast — Handoff and Checkpoint Document

The canonical, model-neutral resume document for this project. A replacement conductor or implementation assistant — ChatGPT, Claude Chat, Claude Code, Codex, or a human engineer — must be able to read this file, follow its pointers, and continue the project safely without reconstructing history from conversation logs.

---

## 1. Document Control

- **Last updated:** 2026-08-15
- **Checkpoint name:** `m2-e-history-playback-merged`
- **Latest merged checkpoint commit:** `62eb684` (`feat: add M2 snapshot history playback (#49)`) — M2-E, squash-merged through [PR #49](https://github.com/Jayc92/atlast/pull/49) on 2026-08-15 with GitHub Actions `verify` passing in 3m16s.
- **Latest merged product commit:** `62eb684` — M2-E is the latest implemented product checkpoint.
- **M2-E is complete and closed. This closeout releases the already pre-authorized M2-F boundary as the next active implementation slice only from synchronized `main` containing the closeout.** M3 planning remains dormant until M2 closes. M3 product implementation requires an independently reviewed, explicitly human-approved baseline and separate release. **M3 product implementation and M4+ remain unauthorized.**
- **Branch state at this checkpoint:** `docs/m2-e-closeout`, based on synchronized, clean `main` at `62eb684` before these documentation-only edits.
- **Version history:** this file is updated in place at every checkpoint; Git history preserves every previous checkpoint version. Do not append old checkpoints to this file — retrieve them with `git log -- HANDOFF.md`.
- **Precedence:** the repository source-of-truth documents ([PROJECT_SPEC.md](PROJECT_SPEC.md), [GUARDRAILS.md](GUARDRAILS.md), [docs/milestones.md](docs/milestones.md), [docs/m1-plan.md](docs/m1-plan.md), [docs/m2-plan.md](docs/m2-plan.md), the accepted ADRs in [docs/adr/](docs/adr/README.md), [TASKS.md](TASKS.md), and [CLAUDE.md](CLAUDE.md)) **override this document wherever they conflict**. HANDOFF.md summarizes; it never supersedes.

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
  - [docs/m1-plan.md](docs/m1-plan.md) — the approved, completed M1 implementation baseline
  - [docs/m2-plan.md](docs/m2-plan.md) — the human-approved M2 baseline and slice boundaries; M2-A through M2-E complete, M2-F released by this closeout
  - [docs/adr/](docs/adr/README.md) — accepted ADRs 0001–0025 (index with amendment notes)
  - [docs/audits/](docs/audits/m0-synthetic-boundary-audit.md) — boundary audits
  - `packages/shared` — the merged S1 domain schemas, S2 repository contract surface, S3 fixture-catalog validation suite, S7 HTTP contracts, M2-A browser health contract, and M2-E bounded snapshot-anchor contract
  - `packages/graph-model` — the merged S4 temporal foundations (Evidence ordering, horizon selection, validity membership, RFC 8785 canonical serialization, collection ordering, SHA-256 digests) and the merged S5 reconciliation engine (the `m1-v1` derivation policy, identity normalization, event-time reconciliation, freshness classification)
  - `apps/api` — the M1 query API v1 plus M2-E's bounded snapshot-anchor route; `apps/web` — the M0 shell plus the M2-A–E interactive topology interface, trust inspector, and history playback; `tests/acceptance` — shell, proxy, graph, and snapshot-history built-preview checks; `scripts/` — repository verification tooling
  - `fixtures/demo-company/` — the merged S3 synthetic fixture catalog ([fixtures/demo-company/README.md](fixtures/demo-company/README.md) documents the scenarios)

This document contains **no credentials, tokens, machine secrets, or private employer data**, and none may ever be added to it.

## 4. Current Roadmap Position

Factual state at this checkpoint:

- **M0 is complete** (2026-07-22).
- **M1 is formally complete** (2026-08-12). Implementation was authorized 2026-07-23 and executed one independently reviewed slice at a time through S8's final closeout; all four M1 exit criteria are now satisfied and closed as project facts (below).
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
- **S8 authorization became effective** when its authorization PR ([PR #30](https://github.com/Jayc92/atlast/pull/30)) merged to `main` at `a4c6a5d` on 2026-08-12.
- **S8 is complete** — the M1 synthetic-boundary re-audit ([docs/audits/m0-synthetic-boundary-audit.md § 14](docs/audits/m0-synthetic-boundary-audit.md); one source-hygiene finding — an embedded NUL byte in `packages/graph-model/src/reconciliation.ts` — found and resolved under its own separate explicit narrow authorization), the exhaustive API traceability integration test in `apps/api/src/routes/evidence.test.ts`, the minimal `apps/web` shell-status correction, and factual M1 documentation closeout were all implemented, independently reviewed, verified, and **merged to `main` through [PR #31](https://github.com/Jayc92/atlast/pull/31) at `0477cbd` on 2026-08-12 with GitHub Actions `verify` passing in 2m27s.** An independent post-merge revalidation ([docs/audits/m0-synthetic-boundary-audit.md § 15](docs/audits/m0-synthetic-boundary-audit.md)) then confirmed, directly against the real merge commit: zero literal NUL bytes across all 180 tracked files, the merged changed-file scope matching exactly what was authorized, and no real-system boundary introduced.
- **S1–S8 are now complete. M1 is formally complete as of 2026-08-12 — checkpoint `m1-complete`.**
- **M2 was separately and explicitly authorized by Joseph Carfagno on 2026-08-12**, after M1's closeout merged through PR #32 at `cff0545`; the authorization record merged through PR #33 at `b547ec2`. The independently reviewed M2 baseline merged through PR #34 at `106b1e7`. M2-A through M2-E were separately authorized, implemented, independently reviewed, verified, merged, and closed; M2-E merged through PR #49 at `62eb684` on 2026-08-15. Joseph pre-authorized M2-F and M3 planning on 2026-08-13. This closeout releases M2-F only after it merges and `main` is synchronized cleanly; M3 planning remains dormant until M2 closes. **M3 product implementation and M4–M5 remain gated and unauthorized.**

**M1 slice purposes** ([docs/m1-plan.md § 4](docs/m1-plan.md#4-proposed-implementation-slices)):

| Slice | Purpose                                                                                                                                                                       | Status                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| S1    | Domain schemas in `packages/shared`: Evidence, identity-only subjects, claim union, content-addressed GraphAssertion revisions, identifiers, `schemaVersion`, rejection tests | Complete — merged via PR #7  |
| S2    | Async repository interfaces (full M1 read contract) in `packages/shared` + storage-agnostic contract-test suite skeleton                                                      | Complete — merged via PR #10 |
| S3    | Fixture suite v1 in `fixtures/demo-company/`: the § 6 scenario catalog as validated Evidence files with declared timestamps                                                   | Complete — merged via PR #13 |
| S4    | Temporal foundations in `packages/graph-model`: Evidence total order, validity intervals, canonical serialization                                                             | Complete — merged via PR #16 |
| S5    | Reconciliation engine in `packages/graph-model`: derivation policy `m1-v1` — matching, corroboration, confidence, conflict, ambiguity, rule traces                            | Complete — merged via PR #19 |
| S6    | Snapshot layer + in-memory stores implementing the S2 interfaces; the contract suite passes end-to-end                                                                        | Complete — merged via PR #23 |
| S7    | Query API v1 routes in `apps/api` with integration tests as executable specification                                                                                          | Complete — merged via PR #28 |
| S8    | Acceptance additions (only if the shell changes), M1 boundary re-audit, documentation closeout                                                                                | Complete — merged via PR #31 |

**Milestone purposes** ([docs/milestones.md](docs/milestones.md)):

| Milestone | Purpose                                                                                                                                | Status                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| M0        | Safe project foundation: TypeScript monorepo, API + web shells, shared packages, full verification tooling and CI, synthetic data only | Complete (2026-07-22)                            |
| M1        | Synthetic topology model: the core domain modeled and queryable, driven entirely by fixtures                                           | Complete (2026-08-12)                            |
| M2        | Interactive topology interface: graph exploration UI reading exclusively through the query API                                         | M2-A/B/C/D/E complete; M2-F next                 |
| M3        | Operational health overlays: synthetic states (healthy, degraded, down, disconnected, expiring certificate, latent downstream risk)    | Planning pre-authorized; dormant until M2 closes |
| M4        | Change-impact simulation: deterministic, explainable blast-radius analysis — validated before any LLM reasoning                        | Unauthorized                                     |
| M5        | Read-only local Kubernetes connector: disposable local cluster (e.g., Kind) only — never an employer or production cluster             | Unauthorized                                     |

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
- **S8 (merged PR #31 at `0477cbd`, 2026-08-12):** the M1 synthetic-boundary re-audit ([docs/audits/m0-synthetic-boundary-audit.md § 14](docs/audits/m0-synthetic-boundary-audit.md)) covering the complete S1–S7 delta and the now-populated `fixtures/demo-company/` catalog; an exhaustive API-boundary traceability integration test in `apps/api/src/routes/evidence.test.ts` proving, via `GET /api/v1/evidence/{evidenceId}` alone, that all 20 valid Evidence records in the catalog are dereferenceable from the provenance/competing-claim/rule-trace identifiers of every subject visible across an 18-coordinate sweep of the complete fixture catalog (15 visible subjects of both kinds, 21 assertion revisions, all seven valid scenarios contributing non-vacuously); one source-hygiene finding (an embedded NUL byte in `packages/graph-model/src/reconciliation.ts`'s `draftKey` builder, the same defect class the S6 review fixed in `snapshot-resolver.ts`) found by the audit's corrected byte-safe sweep and resolved under its own separate explicit narrow authorization — the literal byte replaced with the source-text escape for U+0000, preserving the exact runtime delimiter, verified byte-safe and runtime-equivalent; and a minimal `apps/web` shell-status correction (M1 now shown as delivered rather than gated/core-delivered) with its directly corresponding `apps/web`/`tests/acceptance` assertions.
- **Final S8 / M1 closeout verification evidence:** 65 `apps/api` tests passing in 7 files (unchanged elsewhere: shared 373/373 in 14 files, graph-model 372/372 in 19 files, web 6/6); the complete unmodified `./scripts/verify.sh` pipeline (all 7 stages, including browser acceptance 2/2) passed locally both pre-merge and, independently, again post-merge directly against `0477cbd`; GitHub Actions `verify` passed on PR #31 in 2m27s. A fresh byte-safe NUL sweep of all 180 tracked files at the merge commit found zero literal `0x00` bytes anywhere.
- **M2-A (merged PR #36 at `fa38812`, 2026-08-12):** additive browser-facing health response validation in `packages/shared`; a validated browser query client covering health and all seven accepted v1 routes with closed/redacted client errors; a bounded in-memory request cache; retry-safe, generation-aware single-flight latest-resolution coordination; complete-pin URL parsing, deterministic serialization, and canonicalization; React Router foundations for `/`, `/topology`, and `/entities/:entityId`; exact Vite proxy separation for `/api/health` and `/api/v1/*`; an ESLint-enforced no-side-door browser import boundary; pinned `react-router` plus the direct `@atlast/shared` dependency; and built-preview browser acceptance proving both health and a real v1 route reach the fixture-backed API. No visible topology feature assigned to M2-B+ landed.
- **Final M2-A verification evidence:** independent review found and remediated retry handling after thrown/rejected latest resolution, unknown/repeated/empty URL canonicalization, and genuine history-delta back/forward coverage. The complete local `./scripts/verify.sh` passed all seven stages: shared 384/384, graph-model 372/372, API 65/65, web 79/79, production builds, and browser acceptance 6/6. GitHub Actions `verify` passed on PR #36 in 2m36s.
- **M2-B (merged PR #39 at `9dd507b`, 2026-08-12):** the visible topology application shell and prominent homepage entry point; fixture-backed Entity inventory with opaque bounded pagination; canonical-identifier search that presents Entity and Relationship results honestly; entity-focused detail; canonical URL correction and query-state synchronization; generation-aware latest-to-pinned request coordination; bounded caching; and explicit loading, empty, expected-error, redacted-error, retry, and invalid-URL states. The structured interface is responsive and keyboard reachable and reads only through the accepted query API.
- **Final M2-B verification evidence:** independent review found and remediated a React Strict Mode shared-probe cancellation deadlock, browser-history search-input desynchronization, and acceptance of dependent responses carrying the wrong resolved snapshot identity. Human browser QA then passed inventory, detail, search, Back/Forward synchronization, and direct-refresh checks. The complete local `./scripts/verify.sh` passed all seven stages: shared 384/384, graph-model 372/372, API 65/65, web 120/120, production builds, and browser acceptance 6/6. GitHub Actions `verify` passed on PR #39 in 3m0s.
- **M2-C (merged PR #42 at `a43b0c5`, 2026-08-13):** query-API-only bounded upstream/downstream traversal; a deterministic pure domain-to-view projection preserving separate candidate edges and explicit boundary references; fixed-option ELK layout; a lazy React Flow graph viewport; an equivalent keyboard-operable structured view; shared canonical URL selection and focus; explicit ambiguity/conflict labels; responsive and reduced-motion behavior; and the exact pinned `@xyflow/react@12.11.3` and `elkjs@0.12.0` dependencies.
- **Final M2-C verification evidence:** independent review found and remediated silent latest-to-pinned URL conversion, missing direct viewport/workspace tests, incomplete accessible ambiguity/conflict labels, and a weak acceptance URL assertion. Manual browser QA passed graph/structured equivalence, direction changes, selection persistence, URL state, Back/Forward, and responsive overflow; focused re-review found no blockers. The complete local `./scripts/verify.sh` passed all seven stages: shared 384/384, graph-model 372/372, API 65/65, web 133/133 in 19 files, production builds, and browser acceptance 8/8. GitHub Actions `verify` passed on PR #42 in 3m22s. The lazy graph chunk is approximately 501.46 kB gzip and remains explicitly tracked for M2-F review.
- **M2-D (merged PR #45 at `a41d799`, 2026-08-13):** query-API-only Entity and Relationship trust entry points; exact Relationship rehydration through accepted identifier search; complete assertion and competing-claim presentation; labeled numeric confidence, snapshot-tied freshness, half-open validity, conflict, ambiguity, and ordered rule traces; complete inspectable/copyable snapshot identity; deduplicated direct Evidence dereferencing with independent loading/error/retry states; traversal-truncation honesty; and accessible focus movement and return behavior. No shared contract, API behavior, graph-model behavior, fixture, dependency, lockfile, accepted ADR, verification-tooling, or browser-acceptance change landed.
- **Final M2-D verification evidence:** independent review found no blocker and identified targeted coverage/presentation gaps, all remediated before approval: absent/API-error/internal-error Relationship rehydration, genuine Evidence API-error/retry, explicit latest-mode preservation, confidence labels, snapshot-tied freshness explanation, open-validity wording, and one-unit snapshot-identity copy. Human browser QA passed Entity and exact-Relationship entry, heading focus, focus return, complete trust semantics, copy feedback, Evidence loading, and 390×844 responsive overflow. The complete local `./scripts/verify.sh` passed all seven stages: shared 384/384, graph-model 372/372, API 65/65, web 146/146 in 22 files, production builds, and browser acceptance 8/8. GitHub Actions `verify` passed on PR #45 in 3m6s. The eager bundle measured 412.60 kB JS (124.67 kB gzip) and 14.83 kB CSS (3.56 kB gzip); the lazy graph chunk remained unchanged at 1,615.03 kB JS (501.46 kB gzip) plus 15.41 kB CSS (2.56 kB gzip).
- **M2-E (merged PR #49 at `62eb684`, 2026-08-15):** the additive bounded snapshot-anchor shared contract and read-only `GET /api/v1/snapshot-anchors` route; API-only complete-pin history playback on topology and entity pages; copied-link/reload reproducibility; honest loading, truncation, invalid-pin, and failed-pinned-read states; an explicit genuinely new latest generation on return; and stale-coordinate rendering protection. The implementation changed no dependencies, lockfile, fixtures, graph-model/repository/reconciliation/storage behavior, accepted ADRs, verification scripts, or CI.
- **Final M2-E verification evidence:** a reviewer-style contract, wiring, URL-state, and scope audit found no blockers; human desktop/mobile browser QA passed anchor discovery, complete-pin selection, reload persistence, historical graph/detail behavior, invalid-pin honesty, and explicit return to latest. The complete local `./scripts/verify.sh` passed all seven stages: shared 387/387 in 15 files, graph-model 372/372 in 19 files, API 69/69 in 7 files, web 153/153 in 23 files, production builds, and browser acceptance 12/12. GitHub Actions `verify` passed on PR #49 in 3m16s. The unchanged fixture catalog contains 20 Evidence records and 17 distinct observation anchors; the route returned all 17, `truncated: false`, at horizon 20. Direct built-API calls measured 80.44 ms cold and 1.57–1.87 ms warm; the built-preview journey measured 83 ms, with sampled API RSS 100,496 KiB. Eager output measured 416.01 kB JS (125.41 kB gzip) and 15.89 kB CSS (3.74 kB gzip); the lazy graph payload remained 1,615.03 kB JS (501.46 kB gzip) plus 15.41 kB CSS (2.56 kB gzip).

**What does NOT exist yet** — do not let any document or prompt claim otherwise: final M2-F accessibility/responsive hardening, browser-acceptance expansion, audit, ADR-0018 storage decision, and M2 milestone closeout; an approved M3 product baseline; M3 product implementation; or any M4+ work.

**Design note (no longer an open limitation):** `packages/graph-model` and `apps/api` still consume `@atlast/shared`/`@atlast/graph-model` as TypeScript source through tsconfig `paths` aliases and matching Vitest `resolve.alias` entries for typecheck and test — this is now the deliberate, ADR-0024 § 14-specified convention, not a stand-in for a missing capability: `scripts/verify.sh` runs `pnpm typecheck` before `pnpm build` (ADR-0013), so the aliases let typecheck/test run without requiring a prior build. Production builds resolve both packages through their real `main`/`types`/`exports` entry points instead, proven by S7's clean-build-then-run verification.

## 6. Current Git State (at this checkpoint)

Facts observed at this checkpoint:

- **PR #49 (commit `62eb684`) is the latest merged change** — "feat: add M2 snapshot history playback," squash-merged to `main` on 2026-08-15 after passing GitHub Actions `verify` in 3m16s.
- **This checkpoint's own work lives on branch `docs/m2-e-closeout`, based on synchronized, clean `main` at `62eb684`.** It is documentation-only and records the merged M2-E state plus the conditional release of M2-F.
- At this checkpoint, `main`, `origin/main`, and `origin/HEAD` were synchronized at `62eb684`, and the working tree was clean before these closeout edits began.
- **The merged M2-E implementation delta** (PR #49) touched exactly `TASKS.md`; `apps/api/src/routes/snapshots.ts` and `.test.ts`; `apps/web/src/api/client.ts` and `.test.ts`; `apps/web/src/styles.css`; `apps/web/src/topology/EntityDetailPage.tsx`, `TopologyPage.tsx`, `SnapshotHistory.tsx` and `.test.tsx`, and `use-async-query.ts` and `.test.tsx`; `packages/shared/src/http-contract.ts` and `.test.ts` plus `packages/shared/src/index.ts`; and `tests/acceptance/specs/snapshot-history.spec.ts`. No dependency, lockfile, fixture, graph-model/repository/reconciliation/storage behavior, accepted ADR, verification script, bootstrap script, or CI workflow changed.

**A replacement conductor MUST inspect the actual Git state (`git status`, `git log --oneline --decorate -10`, `git remote -v`) and trust Git over any recorded prose — here or anywhere else.** A future handoff MUST replace this section with the state actually observed at its checkpoint, never copy Git facts forward.

## 7. Current Authorized Work

**M1 is formally complete, the accepted M2 baseline is operational through PR #34 at `106b1e7`, and M2-A through M2-E are complete.** M2-F is released by this closeout and becomes the only active implementation slice after the closeout merges and `main` is synchronized cleanly. M3 planning is contingently pre-authorized but dormant until M2 closes. M3 product implementation and M4+ remain gated and unauthorized.

**S7 (context) is complete and formally closed.** S7 delivered the query API v1 in `apps/api` implementing accepted [ADR-0024](docs/adr/0024-m1-query-api-runtime-contract.md) as amended by [ADR-0025](docs/adr/0025-s7-source-alias-erasable-syntax-compatibility.md) — see [TASKS.md](TASKS.md) for the full delivery record. Merged through PR #28 at `a7624cd`; closeout merged through PR #29 at `9acfefa`.

**What S8 delivered, against its authorized scope:**

1. **The M1 synthetic-boundary re-audit** — extending [docs/audits/m0-synthetic-boundary-audit.md](docs/audits/m0-synthetic-boundary-audit.md) to cover the M1 fixture data (`fixtures/demo-company/**`) and the complete S1–S7 delta, per that audit's own § 11 re-audit trigger and [docs/m1-plan.md § 9](docs/m1-plan.md#9-boundary-audit-requirements). Delivered as § 14 (the pre-merge candidate audit, preserved as historical record) and **§ 15 (the post-merge revalidation against the real `0477cbd` commit, which is now the binding audit conclusion)**: no synthetic-boundary violation, in either pass.
2. **Factual M1 documentation and checkpoint closeout** — [TASKS.md](TASKS.md), this document, [docs/milestones.md](docs/milestones.md), and [docs/m1-plan.md](docs/m1-plan.md) all record the final, closed M1 exit-criteria status.
3. **The minimal shell-status correction** — `apps/web/src/App.tsx`'s milestone route now shows M0 and M1 both as **delivered** (M1's own closeout is now formally complete, so its earlier distinct "core delivered" status has been retired), and its current-state section names the delivered fixture-driven model/reconciliation/snapshot/query-API core. `apps/web/src/App.test.tsx` and `tests/acceptance/specs/shell.spec.ts` carry the directly corresponding assertions. No graph data, search, navigation, routing, visualization, or new `apps/web` API consumption exists — the page still makes only the pre-existing `/api/health` request.
4. **Exhaustive API traceability integration coverage**, a narrow extension separately authorized mid-slice — `apps/api/src/routes/evidence.test.ts` sweeps 18 read coordinates derived from the complete valid fixture catalog, fully paginates `GET /api/v1/entities` and `GET /api/v1/search` at each, collects every provenance/competing-claim/rule-trace Evidence identifier across 15 distinct visible subjects (both Entity and Relationship kinds) and 21 distinct assertion revisions, and dereferences all of them through `GET /api/v1/evidence/{evidenceId}` — the union equals, by strict set equality, all 20 valid Evidence records, with all seven valid scenarios contributing non-vacuously. This is the evidence [docs/audits/m0-synthetic-boundary-audit.md § 14.11](docs/audits/m0-synthetic-boundary-audit.md) row 2 cites for the now-closed M1 exit criterion 2.
5. **The source-text-safe NUL correction**, a second narrow extension separately authorized mid-slice — `packages/graph-model/src/reconciliation.ts`'s `draftKey` composite-key builder had one literal embedded NUL byte (found by the audit's corrected, byte-safe sweep) replaced with the six-character source escape `` `\u0000` ``, preserving the exact runtime delimiter and behavior — verified byte-safe and runtime-equivalent both pre-merge and again, independently, in § 15's post-merge revalidation. The unchanged 372-test `packages/graph-model` suite continues to pass.

**S8 did NOT implement, beyond the two narrowly authorized exceptions named in items 4–5 above:** any topology exploration UI or other M2 behavior; new frontend features, graph visualization, or `apps/web` API consumption beyond the named text correction; changes to S1–S7 production _behavior_ (item 5's fix is explicitly behavior-preserving); changes to domain schemas, repository contracts, fixtures, or snapshot/storage behavior; connectors, authentication, infrastructure, deployment, or real-system access; new dependencies, upgrades, package-manifest changes, or lockfile changes; or changes to `scripts/verify.sh`/`scripts/bootstrap.sh`.

**Permitted work now:** this documentation-only M2-E closeout; then, only from synchronized `main` containing it, M2-F implementation inside [the exact M2-F contingent authorization boundary](docs/m2-plan.md#exact-m2-f-contingent-authorization-boundary); and maintenance or factual corrections to completed state. M3 planning cannot begin before M2 closes. **M3 product implementation and M4+ remain unauthorized.**

**Next-agent preflight** (run before acting on this checkpoint): `git status`, `git log --oneline --decorate -10`, then read [TASKS.md](TASKS.md), [docs/m2-plan.md](docs/m2-plan.md), and Accepted ADRs 0026–0028. Confirm local `main` is clean, synchronized, and contains this closeout before beginning M2-F. **M2-A through M2-E are complete; only M2-F is operational after that preflight. M3 planning remains dormant until M2 closes; M3 product implementation and M4+ remain unauthorized.**

**The checkpoint/slice cycle, in order:**

> human release → bounded implementation prompt → tests/verifier (`scripts/verify.sh`) → human review → PR/CI → merge → HANDOFF.md update → next slice decision

**Checkpoint rule** (binding; also recorded in [CLAUDE.md](CLAUDE.md)): a checkpoint is not closed and the next slice is not released until —

1. the preceding PR is merged;
2. `main` is synchronized with `origin/main` and the working tree is clean;
3. verification status (local `scripts/verify.sh` and GitHub CI) is recorded;
4. HANDOFF.md reflects the merged repository state;
5. the next slice receives explicit human authorization recorded in TASKS.md.

**M2-E satisfied all five conditions: it was authorized through PR #47 at `f9d441e`, independently reviewed with no blockers, fully verified and human-QA approved, merged through PR #49 at `62eb684`, and closed by this checkpoint. M2-F's contingent pre-authorization becomes operational only from synchronized `main` containing this closeout. M3 planning remains dormant until M2 closes.**

## 8. Prohibited Work

**Only M2-F is operational after this closeout is merged and synchronized.** In particular:

- **Any M2-F work outside its exact contingent boundary.**
- **Any M3 planning before M2 formally closes, or any M3 product implementation before an independently reviewed baseline is explicitly approved and separately released.**
- Any change to the now-complete S1–S8 production behavior, domain schemas, repository contracts, fixtures, reconciliation, snapshot/storage behavior, or query API behavior, outside an explicitly authorized maintenance correction.
- Connectors, authentication, infrastructure, deployment, or real-system access of any kind — M5 is the first and only permitted real-system contact, and remains unauthorized.
- New dependencies, upgrades, package-manifest changes, or lockfile changes without their own justification and, if significant, a new ADR.
- Changes to `scripts/verify.sh` or `scripts/bootstrap.sh` without their own explicit human review (ADR-0013).
- **M4 or later milestone work of any kind** until separately authorized.
- Real systems, employer data, credentials, or proprietary names — synthetic, fictional data only.
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
- Current milestone state: M0 and M1 are complete; M1 closed through PR #32
  at cff0545 on 2026-08-12. Joseph Carfagno then explicitly authorized M2,
  recorded through PR #33 at b547ec2. docs/m2-plan.md and ADRs 0026–0028 were
  independently reviewed, corrected, re-reviewed without remaining blockers,
  and explicitly accepted by Joseph Carfagno on 2026-08-12. Their approval
  record merged through PR #34 at 106b1e7. Joseph then explicitly authorized
  M2-A through PR #35 at c3c661a. M2-A was implemented, independently reviewed
  and remediated, merged through PR #36 at fa38812, and closed through PR #37 at
  2bbf13b with CI passing. M2-B was then separately authorized, implemented,
  independently reviewed and remediated, manually approved, and merged through
  PR #39 at 9dd507b with CI passing and closed through PR #40 at 6e87aeb. M2-C
  was separately authorized, implemented, independently reviewed and remediated,
  manually QA-tested, and merged through PR #42 at a43b0c5 with CI passing in
  3m22s, then closed through PR #43 at 751d47c. M2-D was separately authorized,
  implemented, independently reviewed and remediated, human-QA approved, and
  merged through PR #45 at a41d799 with CI passing in 3m6s and closed through
  PR #46 at 452f60f. M2-E was authorized through PR #47 at f9d441e,
  independently reviewed with no blockers, human-QA approved, fully verified,
  and merged through PR #49 at 62eb684 with CI passing in 3m16s; this checkpoint
  closes it. M2-F is released only from synchronized main containing this
  closeout. M3 planning remains dormant until M2 formally closes. M3 product
  implementation and M4+ remain unauthorized.
  Verify the actual Git state before treating this as current; if a later
  checkpoint exists, trust it over this prompt.
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
- **A usable query API now exists, but no topology UI does.** S7 delivered the complete query API v1 (inventory, entity detail, search, bounded traversal, Evidence lookup, the entity-scoped evidence chain, and pinned snapshot summary) against real fixture data, verified end-to-end via both `fastify.inject()` and a running compiled server. M2 is authorized, but its graph exploration UI remains unimplemented and implementation remains gated behind the released planning and architecture-review phase. Expectation management still matters when demonstrating progress, since only `curl`/`fastify.inject()` currently reach the graph.
- **Workspace source-alias convention, now implemented as designed.** `apps/api` and `packages/graph-model` consume their workspace dependencies as TypeScript source through tsconfig `paths` mappings and matching Vitest aliases for typecheck/test only (ADR-0024 § 14); production builds resolve through real `main`/`types`/`exports` entry points instead, proven by S7's clean-build-then-run verification. No further action needed unless a future, separately reviewed change adopts a different convention.
- **Same-model coder/reviewer independence risk.** If Claude Chat conducts while Claude Code implements, both roles share a model family and may share blind spots; the human review gate is the compensating control and should be strictest exactly then.
- **Implementation attempts keep surfacing gaps design review alone did not catch — a pattern, not a one-off.** The ADR-0022/0023/0024/0025 lineage found four such gaps in succession (most recently the `erasableSyntaxOnly`/source-alias contradiction ADR-0025 resolved, and, within S7-B itself, a Fastify `frameworkErrors`-routing gap for `FST_ERR_ASYNC_CONSTRAINT` found and fixed during S7's own review-remediation pass). All are now resolved and merged (including a fifth, within S8 itself: the `reconciliation.ts` NUL byte the corrected boundary re-audit found and fixed under its own narrow authorization); the mitigation going forward is unchanged — treat every slice's or milestone's implementation attempt as part of this project's review process, not merely its execution, and budget review time accordingly throughout M2 planning and later implementation.
- **S8 closed the final M1 gate — this is now a closed project fact, not a candidate finding.** The temptation the fail-honest principle guards against — letting a partial audit or a documentation-only pass be mistaken for completion — did not materialize here: [docs/audits/m0-synthetic-boundary-audit.md § 15](docs/audits/m0-synthetic-boundary-audit.md) independently revalidated the merged S8 state directly against the real `0477cbd` commit (byte-safe NUL sweep, changed-file scope, full `./scripts/verify.sh`) before this checkpoint declared M1 complete — mirroring how § 13 revalidated the M0 audit against the real M0 closure commit rather than trusting the pre-merge branch state. **Future milestones should repeat this discipline**: a pre-merge candidate finding is not a merged fact until independently reconfirmed against the real merge commit.
- **M1's completion is a milestone-level fact, not an M2 authorization signal.** The single most important discipline for whoever reads this checkpoint next: M1 being formally complete answers only "is the synthetic topology core done," never "may M2 begin." M2 requires its own separate, explicit human authorization, exactly as every prior slice and milestone required one — do not let the satisfaction of closing M1 create pressure, implied or otherwise, to treat M2 as pre-approved.
