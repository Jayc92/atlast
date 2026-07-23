# Atlast — Tasks

The single place in-flight work is tracked ([GUARDRAILS.md § 4](GUARDRAILS.md#4-documentation-standards)). Tasks are grouped by milestone ([docs/milestones.md](docs/milestones.md)); each milestone requires explicit authorization — **M0 is complete (2026-07-22). M1 implementation was explicitly authorized 2026-07-23** (plan approved, ADRs 0014–0018 Accepted) and is **active, slice-gated: only Slice S1 is currently authorized**; S2–S8 are each released explicitly after the preceding slice is reviewed and merged. **M2 and later milestones remain unauthorized.**

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (note the blocker)

---

## M0 — Safe Project Foundation (complete — 2026-07-22)

### Phase A — Documentation (approved 2026-07-22)

- [x] README.md — project overview and documentation map
- [x] PROJECT_SPEC.md — vision, goals, principles, scope, non-goals
- [x] docs/architecture.md — architecture philosophy and conceptual design (draft)
- [x] docs/milestones.md — authorized milestone sequence M0–M5 with exit criteria
- [x] GUARDRAILS.md — engineering/coding/repository/documentation/testing standards
- [x] CLAUDE.md — AI assistant working instructions
- [x] TASKS.md — this file
- [x] Human review and approval of the documentation set — _approved 2026-07-22 alongside ADRs 0001–0013 ([docs/adr/README.md](docs/adr/README.md))_
- [x] Non-goals ([PROJECT_SPEC.md § 7](PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become)) explicitly reviewed and accepted — _part of the 2026-07-22 documentation approval_
- [x] Owners assigned to open questions in [docs/architecture.md § 7](docs/architecture.md#7-open-questions) — _all four questions assigned 2026-07-22 to Joseph Carfagno (Founder/Maintainer), each with a named future decision gate (M1 graph/evidence, M1 storage/evidence, and M1 query API ADRs, plus the M4 planning ADR); ownership is accountability for producing the ADR, not approval of any answer_

### Phase B — Foundation build (complete — authorized 2026-07-22, finished 2026-07-22)

- [x] M0 tooling ADRs (monorepo tooling, lint/format/type-check/test/build/browser-check stack) drafted and human-approved — _ADRs 0001–0013 in [docs/adr/](docs/adr/README.md), formally approved 2026-07-22; acceptance authorizes M0 Phase B scaffolding only_
- [x] TypeScript monorepo established — _root pnpm/Node config and workspace skeleton committed; package-manager bootstrap operational (`scripts/bootstrap.sh` verifies Node 24 + pinned pnpm and runs a frozen install) and `pnpm-lock.yaml` generated; TypeScript 6.0.3 pinned at the workspace root; repository-wide linting (`pnpm lint`, ESLint + typescript-eslint strict type-aware config per ADR-0006) and formatting (`pnpm format` / `pnpm format:check`, Prettier per ADR-0007) operational; recursive package-level type checking operational (`pnpm typecheck` per ADR-0002, covering the four shared package shells plus `apps/api`, `apps/web`, and `tests/acceptance` including their colocated tests). The inert standalone `tests/unit` and `tests/integration` workspace placeholders (manifest-only, no tests or configs) were removed 2026-07-22 in favor of the accepted colocated-test convention: unit tests (ADR-0008) live with the code they exercise (`apps/web` component tests, and the API suite in `apps/api`, whose `fastify.inject()` tests are the current in-process API contract tests per ADR-0009), while browser acceptance (ADR-0010) keeps its dedicated `tests/acceptance` workspace for its distinct Playwright runner and service lifecycle; the `tests/*` workspace glob still discovers any future substantive test workspace_
- [x] Web application shell — _React + Vite client-rendered SPA in `apps/web` per ADR-0003: strict-TypeScript foundation page communicating the product vision and M0 status (no topology, graph exploration, search, routing, or query behavior — gated on M1/M2); dev and preview servers bind to `127.0.0.1` only; on load the page requests relative `/api/health`, proxied by Vite to the API shell's `GET /health` on `127.0.0.1:3001` (no CORS change in `apps/api`), validates the payload, and renders deterministic checking/online/unavailable states with visible degradation on failure or malformed responses; unit tests (Vitest + jsdom + Testing Library, stubbed `fetch`, no network, no fixed sleeps) cover primary content and the online/unavailable states; builds to git-ignored `dist/`; responsive at desktop and narrow-mobile widths with semantic HTML, visible focus, and reduced-motion support. All non-browser verification (lint, format, typecheck, tests, build, frozen-lockfile install, dev+preview proxy smoke test) passed 2026-07-22; reviewer browser inspection completed 2026-07-22, covering desktop at 1280x720, narrow mobile at 390x844, the connected and unavailable API states, no horizontal overflow, and no browser console warnings; the automated Playwright browser-acceptance harness (ADR-0010) now exists in `tests/acceptance`, running the primary shell journey against the built API and built web bundle in desktop (1280x720) and mobile (390x844) Chromium projects_
- [x] Backend API shell — _Fastify shell in `apps/api` per ADR-0004: `GET /health` with an explicit response schema returning `{"status":"ok","service":"atlast-api"}`; binds to `127.0.0.1` only with no code path to any other interface (no auth per the M0 exemption in [GUARDRAILS.md § 1.4](GUARDRAILS.md#14-security)); application construction (`src/app.ts`) separated from network startup (`src/server.ts`) so the Vitest suite drives it via `fastify.inject()` with zero sockets (ADR-0008/0009); dev loop uses Node 24 native type stripping (`node --watch`, no tsx, per ADR-0011); builds to git-ignored `dist/`; explicit startup-failure handling and clean SIGINT/SIGTERM shutdown; root `pnpm test` / `pnpm build` recursive scripts added. No graph, topology, evidence, entity, relationship, discovery, or query behavior — that remains gated on M1_
- [x] Shared packages structure — _compile-only package shells for `packages/shared`, `packages/graph-model`, `packages/connectors`, and `packages/ui`: per-package strict tsconfigs, `typecheck` scripts, and empty `export {}` entrypoints. These are **empty M0 package boundaries only** — domain schemas/contracts and the graph model remain gated on M1 authorization, connector implementation on M5, and UI components on the authorized web/UI work_
- [x] Automated linting, formatting, type checking, tests, builds, browser acceptance checks — _all six command families operational and passing 2026-07-22: `pnpm lint` (ESLint per ADR-0006), `pnpm format:check` (Prettier per ADR-0007), `pnpm typecheck` (recursive tsc per ADR-0002, now including `tests/acceptance`), `pnpm test` (Vitest unit suites per ADR-0008 plus the Playwright acceptance suite per ADR-0010, discovered recursively), `pnpm build` (recursive), and the browser acceptance suite in `tests/acceptance` (Chromium-only, desktop 1280x720 + mobile 390x844 projects, self-booting built API + built web preview via Playwright `webServer`, web-first assertions, no fixed sleeps, artifacts retained only on failure and git-ignored). `scripts/verify.sh` as the single entry point remains a separate open task below_
- [x] `scripts/verify.sh` populated as the single verification entry point — _populated 2026-07-22 per ADR-0013: seven fail-fast stages in cheapest-first order (git whitespace validation, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, non-browser Vitest suites, `pnpm build`, Playwright browser acceptance run exactly once); resolves the repository root so it runs from any directory; installs or upgrades no dependencies, never runs formatting in write mode, and does not intentionally modify tracked files, though its build and test stages create or update generated git-ignored artifacts such as `dist/`, `test-results/`, and Playwright failure reports (bootstrap and the one-time Chromium download are documented prerequisites, not stages); full pipeline passing locally 2026-07-22. CI wiring landed as the separate CI task below_
- [x] CI runs `scripts/verify.sh` and passes — _GitHub Actions workflow ([.github/workflows/verify.yml](.github/workflows/verify.yml)) per ADR-0013: one read-only Ubuntu `verify` job triggered by pull requests targeting `main`, pushes to `main`, and manual dispatch; installs the pinned Node (`.nvmrc`) and pnpm (`packageManager`), runs `scripts/bootstrap.sh` (frozen-lockfile install), installs the pinned Playwright Chromium with Linux dependencies, then runs exactly `./scripts/verify.sh`; third-party actions pinned to full commit SHAs on Node 24 action runtimes (PR #2 eliminated the Node 20 runtime deprecation warnings); no secrets, write permissions, artifacts, or deployments. Verified remotely 2026-07-22: PR #2 run [29977769566](https://github.com/Jayc92/atlast/actions/runs/29977769566) (success, 1m36s, zero annotations) and the final `main` run [29977876658](https://github.com/Jayc92/atlast/actions/runs/29977876658) at commit `783e95c` (success, 1m25s, zero annotations); the local verification contract also passes at the same commit_
- [x] Synthetic-data-only guarantee verified: repo holds no external connections or credentials — _static boundary audit of all Git-tracked content at commit `4111d24` completed and passed 2026-07-22: all authorized M0 product/runtime network paths are loopback-only (permitted developer tooling exceptions — package-manager and browser-download connections — are documented in the audit), the single environment variable affects only a local port, no credentials/sensitive files/employer material found, no product dependency provides external-system integration capability, fixtures documentation-only and fictional. Full evidence, method, exceptions, and stated limitations in [docs/audits/m0-synthetic-boundary-audit.md](docs/audits/m0-synthetic-boundary-audit.md); re-audit is warranted when M1 fixture data or the M5 connector lands_

---

## M1 — Synthetic Topology Model (implementation authorized 2026-07-23 — active, slice-gated)

### Planning (complete — approved 2026-07-23)

- [x] [docs/m1-plan.md](docs/m1-plan.md) — M1 architecture and implementation plan — _approved 2026-07-23 as the M1 implementation baseline_
- [x] ADR-0014 core topology domain model — _Accepted 2026-07-23_
- [x] ADR-0015 deterministic identity reconciliation — _Accepted 2026-07-23_
- [x] ADR-0016 temporal graph and snapshots — _Accepted 2026-07-23_
- [x] ADR-0017 M1 query API surface — _Accepted 2026-07-23_
- [x] ADR-0018 M1 storage strategy (mandatory per ADR-0012) — _Accepted 2026-07-23_

### Implementation (authorized 2026-07-23 — active, slice-gated per [docs/m1-plan.md § 4](docs/m1-plan.md))

**M1 implementation was explicitly authorized by human decision on 2026-07-23.** The authorization permits executing the approved plan **one slice at a time, each independently reviewed**:

- [ ] **S1 — Domain schemas in `packages/shared`** (Evidence incl. safe-integer `recordedSequence`, subjects, content-addressed GraphAssertion revisions, identifiers, `schemaVersion`, schema-rejection tests) — **the only currently authorized slice**; not started
- [!] S2 — Repository interfaces + contract-test suite skeleton — _gated: released only after S1 is reviewed and merged_
- [!] S3 — Fixture suite v1 in `fixtures/demo-company/` — _gated on slice release_
- [!] S4 — Temporal foundations in `packages/graph-model` — _gated on slice release_
- [!] S5 — Reconciliation engine (`m1-v1` derivation policy) — _gated on slice release_
- [!] S6 — Snapshot layer + in-memory stores; contract tests pass — _gated on slice release_
- [!] S7 — Query API v1 routes + integration tests — _gated on slice release_
- [!] S8 — Acceptance additions (if shell changes), M1 boundary re-audit, documentation closeout — _gated on slice release_

M1 exit criteria remain as approved ([docs/m1-plan.md § 11](docs/m1-plan.md), [docs/milestones.md](docs/milestones.md)):

- [ ] Model and query API run wholly from fixtures in CI with no external dependencies
- [ ] Every fact in the graph is traceable to its synthetic evidence via the API
- [x] Graph/evidence representation decisions recorded as ADRs and human-approved — _ADRs 0014–0018 Accepted 2026-07-23_
- [ ] No-real-systems constraint verified: M1 boundary re-audit passes (S8)

## M2 — Interactive Topology Interface (gated — not authorized)

- [ ] Graph exploration UI: navigation, search, entity detail
- [ ] Provenance/confidence/freshness view for every displayed fact
- [ ] Snapshot/history playback
- [ ] Browser acceptance checks for primary journeys

## M3 — Operational Health Overlays (gated — not authorized)

- [ ] Overlay model + synthetic state generator (healthy, degraded, down, disconnected, expiring certificate, latent downstream risk)
- [ ] Health-in-context queries and UI overlay toggles
- [ ] Unknown-entity overlays surface as gaps, not phantom nodes

## M4 — Change-Impact Simulation (gated — not authorized)

- [ ] Deterministic impact query API with change-type semantics
- [ ] Ranked blast radius with evidence path per claim
- [ ] Impact views in UI
- [ ] Synthetic scenario accuracy harness in CI
- [ ] Gate check: deterministic engine validated **before** any LLM-generated reasoning is considered

## M5 — Read-Only Local Kubernetes Connector (gated — not authorized)

- [ ] Read-only adapter targeting a disposable local cluster (e.g., Kind) only
- [ ] Adapter emits the same normalized evidence format as fixtures
- [ ] Freshness degradation verified when cluster dies/deletes
- [ ] Employer/production cluster connection structurally impossible without spec amendment

---

## Post-M5 (uncommitted)

Predictive AI, multi-cloud integrations, multi-source enterprise reconciliation, and advisory remediation recommendations — see [docs/milestones.md § Post-M5](docs/milestones.md#post-m5-directional-uncommitted). Executing remediation remains a permanent non-goal.

## Parking Lot

Ideas raised but not scheduled. Nothing here is committed; graduation requires a milestone home and spec compliance.

- (empty)
