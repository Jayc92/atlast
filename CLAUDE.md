# CLAUDE.md — AI Assistant Instructions for Atlast

Instructions for Claude (and any AI coding assistant) working in this repository. [GUARDRAILS.md](GUARDRAILS.md) is binding; this file tells you how to operate within it.

## What This Project Is

Atlast is an AI-powered Engineering Topology Platform: continuous system discovery, a living versioned dependency graph, operational health overlays, and change impact prediction. Read [PROJECT_SPEC.md](PROJECT_SPEC.md) for vision and scope, [docs/architecture.md](docs/architecture.md) for the conceptual design.

## Current Project State

**M0 complete (2026-07-22). M1 implementation explicitly authorized (2026-07-23) — active, slice-gated.** The documentation set is approved, the M0 tooling ADRs (0001–0013 in [docs/adr/](docs/adr/README.md)) are formally Accepted, and the full M0 foundation exists and passes CI: the monorepo workspace, the backend API shell (`apps/api`), the web application shell (`apps/web`), the shared package shells (`packages/*`), the browser acceptance suite (`tests/acceptance`), the verification tooling (`scripts/bootstrap.sh`, `scripts/verify.sh`), and the GitHub Actions workflow that runs it. The M1 architecture baseline is settled ([docs/m1-plan.md](docs/m1-plan.md) approved, ADRs 0014–0024 Accepted; ADR-0014/0015 amended by [ADR-0019](docs/adr/0019-subject-identity-and-assertion-claims.md) and [ADR-0022](docs/adr/0022-m1-reconciliation-policy-and-assertion-derivation.md), ADR-0017 amended by [ADR-0020](docs/adr/0020-m1-inventory-and-search-semantics.md) and [ADR-0024](docs/adr/0024-m1-query-api-runtime-contract.md), ADR-0016 amended by [ADR-0021](docs/adr/0021-jcs-canonicalization-clarifications.md) and [ADR-0023](docs/adr/0023-m1-snapshot-and-in-memory-store-semantics.md), ADR-0018/0019 amended by ADR-0023, ADR-0020 amended by ADR-0024), and M1 implementation is authorized to execute that plan. **Slice S1 (domain schemas in `packages/shared`) is complete — merged through PR #7 on 2026-07-29. Slice S2 (repository interfaces + storage-agnostic contract-test suite skeleton) is complete — human-approved 2026-07-29 and merged through PR #10; the S2 checkpoint/HANDOFF protocol merged through PR #11 at `a7a997d` (2026-07-30). Slice S3 (fixture suite v1 in `fixtures/demo-company/`) is complete — independently reviewed and approved, merged through PR #13 at `003bccc` on 2026-07-30 with GitHub Actions `verify` passing; its closeout checkpoint merged through PR #14 at `1eca85f` (2026-07-31). Slice S4 (temporal foundations in `packages/graph-model`) is complete — authorized through PR #15 with [ADR-0021](docs/adr/0021-jcs-canonicalization-clarifications.md) accepted through the same PR, implemented, independently reviewed and remediated, and merged through PR #16 at `63bdfab` on 2026-07-31 with GitHub Actions `verify` passing. Slice S5 (reconciliation engine, `m1-v1`) is complete — human-authorized 2026-07-31, released by Joseph Carfagno's explicit acceptance of [ADR-0022](docs/adr/0022-m1-reconciliation-policy-and-assertion-derivation.md) — the binding `m1-v1` reconciliation specification — on 2026-08-05 after independent review (acceptance record merged through PR #18 at `f50f0d7`), implemented under accepted ADR-0022, independently reviewed with no blocking findings (the independent reviewer reran `./scripts/verify.sh` successfully), and merged through PR #19 at `0923e9c` on 2026-08-05 with GitHub Actions `verify` passing — checkpoint `m1-s5-reconciliation-engine-merged`. The S6 pre-release architecture and authorization review is complete: [ADR-0023](docs/adr/0023-m1-snapshot-and-in-memory-store-semantics.md) was explicitly accepted by Joseph Carfagno on 2026-08-05 after three independent-review correction passes, settling all nine identified S6 design gaps — ADR-0023 is the binding S6 clarification and remains Accepted. **Slice S6 (snapshot layer + in-memory stores in `packages/graph-model`) was explicitly authorized by Joseph Carfagno on 2026-08-05** in a separate authorization decision recorded in [TASKS.md](TASKS.md), was implemented under accepted ADR-0023, independently reviewed, and **merged to `main` through PR #23 at `9bf7f09` on 2026-08-10** with GitHub Actions `verify` passing in 2m12s — checkpoint `m1-s6-snapshot-stores-merged`. **S1–S6 are now complete. Closing S6 does not authorize S7.** The S7 pre-release architecture and runtime contract is separately settled: [ADR-0024](docs/adr/0024-m1-query-api-runtime-contract.md) was explicitly accepted by Joseph Carfagno on 2026-08-11, after the S7 pre-release review and three independent correction passes, settling fifteen HTTP-boundary and build-boundary gaps and amending ADR-0017/0020 via metadata-only notices — **ADR-0024 is the binding S7 runtime contract and remains Accepted, unchanged.** **Slice S7 (query API v1 routes in `apps/api`) was then explicitly authorized by Joseph Carfagno on 2026-08-11** in a separate authorization decision recorded in [TASKS.md](TASKS.md): S7 is the only active authorized implementation slice, **effective only after the documentation PR recording the authorization merges to `main` and `main` is synchronized locally with a clean working tree**. The authorization does not approve future S7 implementation output — that output still requires independent review, verification, PR approval, and merge. See [TASKS.md](TASKS.md) for exact per-task status and [HANDOFF.md](HANDOFF.md) for the current checkpoint.

Permitted work right now, and nothing beyond it:

- **Maintenance and corrections to the completed M0 foundation and the merged S1/S2 contract surface, S3 fixture catalog, S4 temporal foundations, S5 reconciliation engine, and S6 snapshot layer and in-memory repositories** (bug fixes, documentation fixes, dependency/security maintenance within the accepted ADRs).
- **Maintenance of the approved M1 planning documents** (corrections and review responses to [docs/m1-plan.md](docs/m1-plan.md) and ADRs 0014–0024) and of the checkpoint documentation ([HANDOFF.md](HANDOFF.md), per the checkpoint protocol below).
- **Slice S7 is the only active authorized implementation slice** — explicitly authorized by Joseph Carfagno on 2026-08-11 (recorded in [TASKS.md](TASKS.md)), **effective only after the documentation PR recording the authorization merges to `main` and `main` is synchronized locally with a clean working tree** — no S7 implementation file may be created before that. The authorized S7 scope is exactly [ADR-0024's Exact S7 Boundary](docs/adr/0024-m1-query-api-runtime-contract.md#exact-s7-boundary-restated-for-this-adrs-scope): `apps/api/src/**` (`GET /health` plus exactly the seven accepted query routes; request/query coercion; the closed error mapping; response validation before every successful send; the asynchronous composition root; colocated `fastify.inject()` integration tests); `apps/api/tsconfig.json` (only the two new workspace source-alias `paths` entries); `apps/api/tsconfig.build.json` (only the build-time empty `paths` override); `apps/api/vitest.config.ts` (only the two matching `resolve.alias` entries); `apps/api/package.json` (direct workspace dependencies on `@atlast/graph-model` and `@atlast/shared`); `pnpm-lock.yaml` (only the deterministic importer-block changes those declarations cause); `packages/shared/src/**` (only the additive HTTP schemas and query-coercion helpers ADR-0024 names — no existing S1/S2 schema, type, or interface may change); `packages/shared/tsconfig.build.json` and `package.json` (only ADR-0024's build plumbing); `packages/graph-model/tsconfig.build.json` and `package.json` (only ADR-0024's identical build plumbing — `packages/graph-model`'s existing `tsconfig.json`/`vitest.config.ts` and all existing source runtime behavior remain frozen) — plus TASKS.md for factual progress notes. **S7 must NOT implement:** a relationship-detail route, a relationship-scoped evidence-chain route, a bulk Evidence-listing route, an assertion route, any existing S1/S2 domain or repository schema/interface change, any change to `packages/graph-model`'s or `packages/shared`'s existing `src/**` runtime behavior beyond the named additive schemas, the S6 cursor payload shape or its binding semantics, `fixtures/demo-company/**`, `apps/web` (no frontend work is authorized), authentication/connectors/deployment/infrastructure/real-system access, any new third-party dependency, `scripts/verify.sh`/`scripts/bootstrap.sh`, `pnpm-workspace.yaml`, or any S8/M2+ work. The authorization does not approve future S7 implementation output — that output still requires implementation under accepted ADR-0024, independent review, complete local `./scripts/verify.sh` verification, PR review, successful GitHub Actions `verify`, and merge. Work is slice-driven and independently reviewed: **S8 remains unauthorized** until explicitly released — do not start it, even preparatorily, without that release being recorded in TASKS.md.

**M2 and later milestones remain unauthorized**, each gated on its own explicit human authorization at the preceding milestone's close.

The authorized milestone sequence ([docs/milestones.md](docs/milestones.md)) is synthetic-first:

- **M0** — Safe project foundation (TypeScript monorepo, web app + backend API shells, shared packages, automated lint/format/type-check/test/build/browser checks, `scripts/verify.sh`; synthetic data only)
- **M1** — Synthetic topology model (fixtures only; no real systems)
- **M2** — Interactive topology interface
- **M3** — Operational health overlays (synthetic states: healthy, degraded, down, disconnected, expiring certificate, latent downstream risk)
- **M4** — Change-impact simulation (deterministic before any LLM reasoning)
- **M5** — Read-only local Kubernetes connector (disposable local cluster such as Kind only — never an employer or production cluster)

Predictive AI, multi-cloud integrations, and multi-source enterprise reconciliation are post-M5 and unscheduled.

**M0 is complete and M1 is the only authorized milestone (slice-gated as above); each later milestone requires its own explicit authorization. Within that gate:**

- Maintenance, corrections, and explicitly released M1 slice work are permitted, but only using the technologies the accepted ADRs name — dependencies beyond them still require justification and, if significant, a new ADR (Zod, named by accepted ADR-0005, was introduced in S1 with its justification-at-PR).
- Do NOT implement M1 Slice S7 (query API v1 routes) before the authorization PR recording its 2026-08-11 authorization has merged to `main` and `main` is synchronized locally with a clean working tree — S7 is explicitly authorized (recorded in TASKS.md) but that authorization is **not yet effective**; no S7 implementation file may be created before then, and even once effective, implementation is bounded exactly by [ADR-0024's Exact S7 Boundary](docs/adr/0024-m1-query-api-runtime-contract.md#exact-s7-boundary-restated-for-this-adrs-scope) (see the itemized scope above). Do NOT implement S8 — it remains gated on its own explicit release, not on S7's authorization or closure. Do NOT implement M2+ features (exploration UI, overlays, impact simulation, connectors) before their milestone is authorized.
- Do NOT commit new technology choices outside the accepted ADRs — proposals go through ADRs against [docs/architecture.md § 6](docs/architecture.md#6-technology-selection-criteria-draft--human-approval-required) and require human approval.
- Do NOT connect anything to a real system or handle real credentials — synthetic data only through M4; M5's only real target is a disposable local cluster.

When asked to do any of the above, point to this section and confirm the milestone gate has moved before proceeding.

## Hard Rules (from GUARDRAILS.md — never relax these)

1. **Scope is fixed by the spec.** Never implement anything that contradicts [PROJECT_SPEC.md § 7 Non-Goals](PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become): no monitoring/alerting features, no incident management workflow, no manual topology editing, and no executing deployments or remediation against observed systems, ever (advisory remediation _recommendations_ are permitted as potential post-M5 scope).
2. **Read-only toward observed systems.** Never write code that mutates a system Atlast observes, and never design components that hold write-capable credentials to them.
3. **Provenance is mandatory.** Any code touching the graph model must preserve provenance, confidence, and freshness on every fact.
4. **No side doors.** Consumers (UI, AI engine, integrations) read the graph only through the query API.
5. **Explainability for AI features.** Any AI-driven analysis must cite its evidence; an unexplainable output is a defect.
6. **No secrets anywhere** — not in code, fixtures, docs, or examples.

## Conventions

- **Vocabulary:** use the domain language of [PROJECT_SPEC.md § 4](PROJECT_SPEC.md#4-core-concepts-domain-language) verbatim — Entity, Relationship, Evidence, Discovery source, Overlay, Snapshot, Impact query. No synonyms in model-layer code or docs.
- **Naming:** verbose, descriptive identifiers; full type annotations wherever the language supports them; comments explain _why_, not _what_.
- **Errors:** explicit handling only — no silent catch-alls, no empty-default returns on failure.
- **Determinism:** consume time, randomness, and I/O through injectable interfaces; all tests run against `fixtures/` with no live infrastructure.
- **Commits:** Conventional Commits (`docs:`, `feat:`, `fix:`, `test:`, `refactor:`, `chore:`), atomic, imperative, ≤ 72-char subject.
- **Docs:** single source of truth per fact — link, don't duplicate. Update affected docs in the same PR as the change. Significant decisions become ADRs in `docs/adr/`.

## Working Style

- Before changing anything, read the documents your change touches; keep the documentation set internally consistent (a contradiction between docs is a defect).
- Update [TASKS.md](TASKS.md) as work starts and completes — it is the only place in-flight work is tracked.
- **Checkpoint protocol:** [HANDOFF.md](HANDOFF.md) is the canonical, model-neutral checkpoint and resume document. It MUST be updated after every merged slice or checkpoint and before the next slice is released. A checkpoint is not closed and the next slice is not released until: (1) the preceding PR is merged; (2) `main` is synchronized with `origin/main` and the working tree is clean; (3) verification status (local `scripts/verify.sh` and GitHub CI) is recorded; (4) HANDOFF.md reflects the merged repository state; and (5) the next slice receives explicit human authorization recorded in TASKS.md. HANDOFF.md summarizes and never overrides the source-of-truth documents; where they conflict, the source documents win.
- `scripts/verify.sh` is the required completion gate: run it and see it pass before declaring any change complete.
- `scripts/verify.sh` is a protected verification contract ([ADR-0013](docs/adr/0013-ci-philosophy.md)): once its initial population is reviewed and committed, it defines what "verified" means for this repository. Never weaken, skip, rename, or remove its checks, and never edit it merely to make a failure pass — fix the code instead. Changes to the script are changes to the definition of "verified" and require their own explicit human review.
- Flag security-sensitive or architecturally significant output explicitly for human review.
- If a request conflicts with these rules or GUARDRAILS.md, say so and ask — do not silently comply or silently refuse.

## Repository Map

```
README.md            Entry point and documentation map
PROJECT_SPEC.md      Vision, goals, principles, scope, non-goals (source of truth for scope)
TASKS.md             Active work breakdown
HANDOFF.md           Canonical checkpoint and model-neutral handoff document
GUARDRAILS.md        Binding engineering standards
docs/architecture.md Architecture philosophy and conceptual design
docs/milestones.md   Authorized milestone sequence (M0–M5) with exit criteria
fixtures/            Synthetic test data (the M1 Slice S3 catalog in fixtures/demo-company/ — merged via PR #13, 2026-07-30)
scripts/             Dev tooling incl. verify.sh
tests/               Test suites (browser acceptance in tests/acceptance)
```
