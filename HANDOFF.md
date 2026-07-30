# Atlast — Handoff and Checkpoint Document

The canonical, model-neutral resume document for this project. A replacement conductor or implementation assistant — ChatGPT, Claude Chat, Claude Code, Codex, or a human engineer — must be able to read this file, follow its pointers, and continue the project safely without reconstructing history from conversation logs.

---

## 1. Document Control

- **Last updated:** 2026-07-30
- **Checkpoint name:** `m1-s3-fixture-suite-authorized`
- **Last merged checkpoint commit:** `a7a997de5678fac0231a45d92d4aebe3905a88e5` (`docs: establish canonical project handoff checkpoint (#11)`) — the S2 checkpoint/HANDOFF protocol, merged through [PR #11](https://github.com/Jayc92/atlast/pull/11). The last merged **product** change remains `4bb5b1b774c02c8f12325233589f6b58aa608307` ([PR #10](https://github.com/Jayc92/atlast/pull/10) — M1 Slice S2, human-approved 2026-07-29, merged with GitHub Actions `verify` passing).
- **This S3 authorization itself lands through a later documentation PR**, so the tip of `main` will move past the SHA above; this document does not attempt to predict that PR's squash-merge SHA — always read the actual tip from Git, not from this file.
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
  - [docs/adr/](docs/adr/README.md) — accepted ADRs 0001–0020 (index with amendment notes)
  - [docs/audits/](docs/audits/m0-synthetic-boundary-audit.md) — boundary audits
  - `packages/shared` — the merged S1 domain schemas and S2 repository contract surface
  - `apps/api`, `apps/web`, `tests/acceptance`, `scripts/` — the M0 foundation
  - `fixtures/` — empty until the S3 implementation lands (S3 authorized 2026-07-30, effective on merge of the authorization PR)

This document contains **no credentials, tokens, machine secrets, or private employer data**, and none may ever be added to it.

## 4. Current Roadmap Position

Factual state at this checkpoint:

- **M0 is complete** (2026-07-22).
- **M1 is active and slice-gated** (implementation authorized 2026-07-23; one independently reviewed slice at a time).
- **S1 is complete** — human-reviewed and merged through PR #7 (2026-07-29).
- **S2 is complete** — human-approved 2026-07-29 and merged through PR #10.
- **The S2 checkpoint/HANDOFF protocol merged through PR #11** at `a7a997d` (2026-07-30).
- **S3 was explicitly human-authorized by Joseph Carfagno on 2026-07-30.** The authorization is effective for implementation **only after the documentation PR recording it merges to `main` and `main` is synchronized locally** — no S3 file may be created before that. Once merged, **S3 is the only active authorized implementation slice.**
- **S4–S8 remain gated and unauthorized**, each on the preceding slice's merge and its own explicit release.
- **M2–M5 remain unauthorized**, each gated on its own explicit human authorization.

**M1 slice purposes** ([docs/m1-plan.md § 4](docs/m1-plan.md#4-proposed-implementation-slices)):

| Slice | Purpose                                                                                                                                                                       | Status                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| S1    | Domain schemas in `packages/shared`: Evidence, identity-only subjects, claim union, content-addressed GraphAssertion revisions, identifiers, `schemaVersion`, rejection tests | Complete — merged via PR #7                                        |
| S2    | Async repository interfaces (full M1 read contract) in `packages/shared` + storage-agnostic contract-test suite skeleton                                                      | Complete — merged via PR #10                                       |
| S3    | Fixture suite v1 in `fixtures/demo-company/`: the § 6 scenario catalog as validated Evidence files with declared timestamps                                                   | Authorized 2026-07-30 — effective on merge of the authorization PR |
| S4    | Temporal foundations in `packages/graph-model`: Evidence total order, validity intervals, canonical serialization                                                             | Gated                                                              |
| S5    | Reconciliation engine in `packages/graph-model`: derivation policy `m1-v1` — matching, corroboration, confidence, conflict, ambiguity, rule traces                            | Gated                                                              |
| S6    | Snapshot layer + in-memory stores implementing the S2 interfaces; the contract suite passes end-to-end                                                                        | Gated                                                              |
| S7    | Query API v1 routes in `apps/api` with integration tests as executable specification                                                                                          | Gated                                                              |
| S8    | Acceptance additions (only if the shell changes), M1 boundary re-audit, documentation closeout                                                                                | Gated                                                              |

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
- **Final S2 verification evidence:** 297 shared-package tests passing in 11 files, 23 storage-agnostic contract cases, complete `scripts/verify.sh` pass, and passing GitHub Actions CI (`verify`) on PR #10.

**What does NOT exist yet** — do not let any document or prompt claim otherwise: no repository implementation (in-memory or otherwise), no fixtures, no canonical serialization or hashing, no temporal algorithms, no reconciliation engine, no snapshot computation, no query API routes beyond `GET /health`, and no topology UI. The contract suite's behavioral cases first execute in S6.

## 6. Current Git State (at this checkpoint)

Facts that hold both before and after the documentation PR recording this authorization merges:

- **PR #11 (commit `a7a997de5678fac0231a45d92d4aebe3905a88e5`) is the last merged checkpoint before this authorization** — it introduced HANDOFF.md and the checkpoint protocol. **PR #10 (commit `4bb5b1b774c02c8f12325233589f6b58aa608307`) remains the last merged product change.**
- **This S3 authorization is the checkpoint update being introduced by the current documentation PR.** Until that PR merges, the authorization exists only on its documentation branch and S3 implementation may not begin; after it merges, the tip of `main` is that merge's own SHA, which this artifact does not attempt to predict.
- No implementation branch is active and no S3 files exist yet; any open branches are documentation branches for this authorization.

**A replacement conductor MUST inspect the actual Git state (`git status`, `git log --oneline --decorate -10`, `git remote -v`) and trust Git over any recorded prose — here or anywhere else.** A future handoff MUST replace this section with the state actually observed at its checkpoint, never copy Git facts forward.

## 7. Current Authorized Work

**Slice S3 — synthetic fixture suite v1 — was explicitly human-authorized by Joseph Carfagno on 2026-07-30**, recorded here and in [TASKS.md](TASKS.md). The authorization is effective for implementation **only after the documentation PR recording it merges to `main` and `main` is synchronized locally**; once merged, S3 is the only active authorized implementation slice.

**Authorized S3 scope** (per [docs/m1-plan.md](docs/m1-plan.md) §§ 4, 5, 6, and 8):

- Validated synthetic Evidence fixtures under `fixtures/demo-company/`.
- Scenario documentation and a deterministic fixture catalog/manifest.
- The seven approved scenarios ([docs/m1-plan.md § 6](docs/m1-plan.md#6-synthetic-fixture-scenario-catalog)): (1) corroborating evidence; (2) late corroboration as a new revision seed; (3) conflicting evidence; (4) stale evidence; (5) ambiguous identity; (6) relationship appearance and disappearance; (7) historical/as-of topology changes.
- The approved edge cases: equal `recordedAt` with distinct `recordedSequence`; late-old-observation Evidence; equal-`observedAt` ordering through `recordedSequence`; duplicate and non-positive `recordedSequence` rejection; unknown `schemaVersion` rejection; derivation-version pinning seeds; half-open interval-boundary seeds.
- Every valid fixture must parse through the existing S1 Evidence schemas; fixtures use declared timestamps and deterministic, unique `recordedSequence` values; fixtures remain pipeline **inputs**, never pre-reconciled graph state.
- The catalog must provide the non-vacuous seeds the S2 contract suite's loud preconditions demand: conflicting entity-type claims, relationship claims, and multi-entity topologies.
- One narrowly scoped fixture-validation test may be added under `packages/shared/src/` **only** to validate the fixture catalog with existing schemas — no production behavior, reconciliation, temporal computation, or storage.
- Scenario documentation must distinguish fixture **facts** from future **expected reconciliation outcomes**, which are not executable until later slices (S5/S6).

**S3 implementation path boundary** — after the authorization PR merges, the S3 implementation may change only:

- `fixtures/demo-company/**`
- one narrowly scoped fixture-validation test under `packages/shared/src/`
- `TASKS.md` for factual S3 progress reporting

Any additional path requires separate human approval before editing.

**The checkpoint/slice cycle, in order:**

> human release → bounded implementation prompt → tests/verifier (`scripts/verify.sh`) → human review → PR/CI → merge → HANDOFF.md update → next slice decision

**Checkpoint rule** (binding; also recorded in [CLAUDE.md](CLAUDE.md)): a checkpoint is not closed and the next slice is not released until —

1. the preceding PR is merged;
2. `main` is synchronized with `origin/main` and the working tree is clean;
3. verification status (local `scripts/verify.sh` and GitHub CI) is recorded;
4. HANDOFF.md reflects the merged repository state;
5. the next slice receives explicit human authorization recorded in TASKS.md.

## 8. Prohibited Work

**Before the S3 authorization PR merges:** no S3 implementation of any kind, including "preparatory" fixture drafting.

**After the S3 authorization PR merges, all work outside the § 7 S3 scope and path boundary remains prohibited.** S3 does NOT authorize:

- Changes to existing S1 schemas or S2 repository contracts.
- Production source changes under `packages/shared/src/` (the one narrowly scoped fixture-validation test is the sole exception).
- Repository or storage implementations.
- Canonical serialization or hashing.
- Temporal algorithms or validity computation.
- Reconciliation or confidence computation.
- Snapshot generation.
- API routes.
- Frontend changes.
- Connector work.
- New dependencies or lockfile changes.
- Real systems, employer data, credentials, or proprietary names — synthetic, fictional data only.
- S4–S8 or M2+ work.
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
- Current slice state: S1 and S2 are complete and merged. S3 (synthetic
  fixture suite v1, scope and path boundary in HANDOFF.md § 7) was
  human-authorized 2026-07-30 and, once the PR recording that authorization
  has merged to main, is the SOLE active authorized implementation slice.
  If that authorization PR has not merged, no implementation slice is active.
  S4–S8 and M2+ remain gated regardless.
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
- **Fixtures must exercise non-vacuous contract cases.** The S2 contract suite fails loudly when a seed lacks a required scenario (conflicting-type entity, relationship claims, multi-entity cursors). S3's fixture catalog must supply those scenarios, or S6's contract run will (correctly) fail on seed adequacy rather than behavior.
- **Temporal and reconciliation complexity remains ahead.** S4–S6 implement the hardest parts — canonical serialization, content addressing, the `m1-v1` derivation policy, snapshot replay — against already-fixed contracts; contract-to-implementation mismatches will surface there.
- **No usable topology product exists until later M1 slices.** Through S2 the repository contains contracts and shells only; expectation management matters when demonstrating progress.
- **Same-model coder/reviewer independence risk.** If Claude Chat conducts while Claude Code implements, both roles share a model family and may share blind spots; the human review gate is the compensating control and should be strictest exactly then.
