# Atlast — Tasks

The single place in-flight work is tracked ([GUARDRAILS.md § 4](GUARDRAILS.md#4-documentation-standards)). Tasks are grouped by milestone ([docs/milestones.md](docs/milestones.md)); each milestone requires explicit authorization — **only M0 is authorized once the documentation set is approved**.

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (note the blocker)

---

## M0 — Safe Project Foundation (active)

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
- [ ] Owners assigned to open questions in [docs/architecture.md § 7](docs/architecture.md#7-open-questions)

### Phase B — Foundation build (active — authorized 2026-07-22)

- [x] M0 tooling ADRs (monorepo tooling, lint/format/type-check/test/build/browser-check stack) drafted and human-approved — _ADRs 0001–0013 in [docs/adr/](docs/adr/README.md), formally approved 2026-07-22; acceptance authorizes M0 Phase B scaffolding only_
- [~] TypeScript monorepo established — _root pnpm/Node config and workspace skeleton committed; package-manager bootstrap operational (`scripts/bootstrap.sh` verifies Node 24 + pinned pnpm and runs a frozen install) and `pnpm-lock.yaml` generated; TypeScript 6.0.3 pinned at the workspace root; repository-wide linting (`pnpm lint`, ESLint + typescript-eslint strict type-aware config per ADR-0006) and formatting (`pnpm format` / `pnpm format:check`, Prettier per ADR-0007) operational; recursive package-level type checking operational (`pnpm typecheck` per ADR-0002, covering the four shared package shells plus `apps/api` and `apps/web` including their colocated tests; standalone `tests/*` type checking remains pending with those shells)_
- [x] Web application shell — _React + Vite client-rendered SPA in `apps/web` per ADR-0003: strict-TypeScript foundation page communicating the product vision and M0 status (no topology, graph exploration, search, routing, or query behavior — gated on M1/M2); dev and preview servers bind to `127.0.0.1` only; on load the page requests relative `/api/health`, proxied by Vite to the API shell's `GET /health` on `127.0.0.1:3001` (no CORS change in `apps/api`), validates the payload, and renders deterministic checking/online/unavailable states with visible degradation on failure or malformed responses; unit tests (Vitest + jsdom + Testing Library, stubbed `fetch`, no network, no fixed sleeps) cover primary content and the online/unavailable states; builds to git-ignored `dist/`; responsive at desktop and narrow-mobile widths with semantic HTML, visible focus, and reduced-motion support. All non-browser verification (lint, format, typecheck, tests, build, frozen-lockfile install, dev+preview proxy smoke test) passed 2026-07-22; reviewer browser inspection completed 2026-07-22, covering desktop at 1280x720, narrow mobile at 390x844, the connected and unavailable API states, no horizontal overflow, and no browser console warnings; the **automated Playwright browser-acceptance harness (ADR-0010) remains pending** as the next separately reviewed M0 task_
- [x] Backend API shell — _Fastify shell in `apps/api` per ADR-0004: `GET /health` with an explicit response schema returning `{"status":"ok","service":"atlast-api"}`; binds to `127.0.0.1` only with no code path to any other interface (no auth per the M0 exemption in [GUARDRAILS.md § 1.4](GUARDRAILS.md#14-security)); application construction (`src/app.ts`) separated from network startup (`src/server.ts`) so the Vitest suite drives it via `fastify.inject()` with zero sockets (ADR-0008/0009); dev loop uses Node 24 native type stripping (`node --watch`, no tsx, per ADR-0011); builds to git-ignored `dist/`; explicit startup-failure handling and clean SIGINT/SIGTERM shutdown; root `pnpm test` / `pnpm build` recursive scripts added. No graph, topology, evidence, entity, relationship, discovery, or query behavior — that remains gated on M1_
- [x] Shared packages structure — _compile-only package shells for `packages/shared`, `packages/graph-model`, `packages/connectors`, and `packages/ui`: per-package strict tsconfigs, `typecheck` scripts, and empty `export {}` entrypoints. These are **empty M0 package boundaries only** — domain schemas/contracts and the graph model remain gated on M1 authorization, connector implementation on M5, and UI components on the authorized web/UI work_
- [ ] Automated linting, formatting, type checking, tests, builds, browser acceptance checks
- [ ] `scripts/verify.sh` populated as the single verification entry point
- [ ] Synthetic-data-only guarantee verified: repo holds no external connections or credentials

---

## M1 — Synthetic Topology Model (gated — not authorized)

High-level breakdown; expand when M0 closes and M1 is authorized:

- [ ] ADRs: graph/evidence representation (per [architecture.md § 6](docs/architecture.md#6-technology-selection-criteria-draft--human-approval-required))
- [ ] Entity/Relationship/Evidence model with provenance, confidence, freshness
- [ ] Versioning/snapshots with as-of-time queries
- [ ] Query API v1 (inventory, search, traversal, time travel)
- [ ] Synthetic fixture suite in `fixtures/` incl. conflict/staleness/ambiguity cases
- [ ] No-real-systems constraint verified in CI

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
