# Atlast

**An AI-powered Engineering Topology Platform.**

Atlast continuously discovers the systems your organization runs, builds a living dependency graph of how they connect, overlays real-time operational health, and predicts the downstream impact of technical changes before they happen.

> **Status: M0 through M3, M4-A, and M4-B complete; M4-C authorized behind its documentation merge gate.** M4-B merged through [PR #75](https://github.com/Jayc92/atlast/pull/75) at `b4f6fc4` after independent review and complete verification. Joseph Carfagno explicitly authorized **M4-C** on 2026-08-18 within the exact browser impact-panel boundary in [docs/m4-plan.md § 6](docs/m4-plan.md#6-proposed-implementation-slices) and accepted ADR-0034. It becomes operational only after this authorization record merges and local `main` synchronizes cleanly. **M4-D through M4-E and M5+ remain unauthorized.** Read [PROJECT_SPEC.md](PROJECT_SPEC.md), [TASKS.md](TASKS.md), and [HANDOFF.md](HANDOFF.md) before contributing.

---

## Why Atlast Exists

Every engineering organization eventually loses the ability to answer three questions quickly and confidently:

1. **What do we actually run?** Service catalogs go stale the day they are written.
2. **What depends on what?** Dependency knowledge lives in the heads of senior engineers and is lost when they leave.
3. **What breaks if we change this?** Impact analysis is guesswork, so changes are either reckless or overly cautious.

Atlast answers all three continuously, from observed reality rather than manually maintained records. The map is derived from the territory — never the other way around.

## What Atlast Does

- **Continuous discovery** — automatically finds services, data stores, queues, jobs, and infrastructure by observing traffic, configuration, deployment metadata, and code.
- **Living dependency graph** — maintains a versioned, queryable graph of every system and the relationships between them, updated as reality changes.
- **Operational health overlay** — projects alerts, SLO status, incident state, and deployment activity onto the graph so topology and health are one picture.
- **Change impact prediction** — given a proposed change ("upgrade this database", "deprecate this API", "deploy this service"), predicts the blast radius and ranks downstream risk.

## What Atlast Is Not

Atlast has deliberate boundaries. It is **not** a monitoring system, an incident management tool, a CMDB you edit by hand, a deployment platform, or an autonomous remediation engine. The full list of non-goals — and why they are non-goals — lives in [PROJECT_SPEC.md § Non-Goals](PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become).

## Documentation Map

| Document                                                   | Purpose                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PROJECT_SPEC.md](PROJECT_SPEC.md)                         | Vision, goals, guiding principles, scope, and non-goals                                                                                                                                                                       |
| [docs/architecture.md](docs/architecture.md)               | Architecture philosophy and conceptual system design                                                                                                                                                                          |
| [docs/milestones.md](docs/milestones.md)                   | Synthetic-first delivery plan (M0 foundation → M1 synthetic topology model → M2 interactive interface → M3 health overlays → M4 change-impact simulation → M5 read-only local Kubernetes connector); predictive AI is post-M5 |
| [docs/m3-plan.md](docs/m3-plan.md)                         | Completed M3 operational-health-overlay architecture baseline and slice record; M3-A through M3-F are complete at checkpoint `m3-complete`, and later milestones remain gated                                                 |
| [TASKS.md](TASKS.md)                                       | Current work breakdown and task tracking                                                                                                                                                                                      |
| [HANDOFF.md](HANDOFF.md)                                   | Canonical checkpoint and model-neutral handoff document — how a replacement assistant or engineer resumes the project safely                                                                                                  |
| [GUARDRAILS.md](GUARDRAILS.md)                             | Engineering, coding, repository, documentation, and testing standards                                                                                                                                                         |
| [CLAUDE.md](CLAUDE.md)                                     | Working instructions for AI coding assistants in this repository                                                                                                                                                              |
| [docs/audits/](docs/audits/m0-synthetic-boundary-audit.md) | Boundary audits — M0 synthetic-data and external-connection audit                                                                                                                                                             |

## Local Setup

1. **Install Node.js 24.15.0** with your version manager — [.nvmrc](.nvmrc) pins the exact version, so `nvm install && nvm use` (or the fnm/mise equivalent) selects it automatically.
2. **If `pnpm` is not on your PATH**, enable it via Corepack: `corepack enable pnpm`. If that fails with a permission error (the default install directory is not writable), point Corepack at a writable directory instead — it must already be on your PATH, since Corepack only places the shim there: `corepack enable --install-directory "$HOME/.npm-global/bin" pnpm`. Corepack usually ships with Node.js 24 but is not present in every installation; if the command is missing, install it first with `npm install --global corepack`.
3. **Run `./scripts/bootstrap.sh`** from anywhere in the repository. It verifies the Node and pnpm versions, then installs the workspace with `pnpm install --frozen-lockfile`. On any mismatch it prints the exact command to fix it and exits.

The exact pnpm version is pinned in [package.json](package.json)'s `packageManager` field ([ADR-0001](docs/adr/0001-monorepo-package-manager.md)), and `pnpm-lock.yaml` is a committed, reviewed artifact — every contributor and CI run installs identically.

## Verifying the Repository

The normal working sequence is:

1. `./scripts/bootstrap.sh` — verify the toolchain and install the workspace (once per clone, and after dependency changes)
2. `pnpm --filter @atlast/tests-acceptance browser:install` — one-time download of the pinned Playwright Chromium build (needed before the first verification run, and again only when the Playwright version changes)
3. `./scripts/verify.sh` — run the full verification pipeline

`scripts/verify.sh` is the single verification entry point ([GUARDRAILS.md § 5](GUARDRAILS.md#5-testing-philosophy), [ADR-0013](docs/adr/0013-ci-philosophy.md)): CI runs exactly this script, so a local pass and a CI pass mean the same thing.

### Continuous integration

GitHub Actions ([.github/workflows/verify.yml](.github/workflows/verify.yml)) runs `scripts/verify.sh` for every pull request targeting `main` and every push to `main` (plus manual dispatch). The workflow is a thin shell around the verification contract per [ADR-0013](docs/adr/0013-ci-philosophy.md): it checks out the repository, installs the pinned Node (from [.nvmrc](.nvmrc)) and pnpm (from [package.json](package.json)'s `packageManager` field), runs `./scripts/bootstrap.sh` for the frozen-lockfile install, installs the pinned Playwright Chromium build, and then runs `./scripts/verify.sh` — nothing else. It holds no secrets, has read-only repository access, and uploads no artifacts, so a CI failure always reproduces locally with the same script. It runs, in order: git whitespace validation, formatting checks (`pnpm format:check`), linting (`pnpm lint`), type checking (`pnpm typecheck`), non-browser tests (all workspace Vitest suites), production builds (`pnpm build`), and browser acceptance (the Playwright suite in `tests/acceptance`). It stops at the first failure and requires no interaction. It never installs or upgrades dependencies, never runs formatting in write mode, and does not intentionally modify tracked source, tests, configuration, documentation, manifests, or lockfiles — though its build and test stages do create or update generated, git-ignored artifacts such as `dist/`, `test-results/`, and Playwright failure reports.

## Development Commands

Repository-wide linting ([ADR-0006](docs/adr/0006-linting.md)) and formatting ([ADR-0007](docs/adr/0007-formatting.md)) run from the repository root:

- `pnpm lint` — run ESLint across the repository
- `pnpm format:check` — verify formatting without modifying files (what verification runs)
- `pnpm format` — apply Prettier formatting
- `pnpm typecheck` — run TypeScript type checking recursively across workspace packages ([ADR-0002](docs/adr/0002-monorepo-task-runner.md)); packages without a `typecheck` script are skipped
- `pnpm test` — run package test suites recursively (Vitest per [ADR-0008](docs/adr/0008-unit-testing.md)); packages without a `test` script are skipped
- `pnpm build` — run package builds recursively; packages without a `build` script are skipped

TypeScript 6.0.3 and the strict shared base configuration ([tsconfig.base.json](tsconfig.base.json)) are installed. Package-level type checking covers the four shared package shells (`packages/shared`, `packages/graph-model`, `packages/connectors`, `packages/ui`), the backend API (`apps/api`), the web application (`apps/web`), and the browser acceptance suite (`tests/acceptance`), including each package's colocated tests. Unit tests ([ADR-0008](docs/adr/0008-unit-testing.md)) and in-process API contract tests ([ADR-0009](docs/adr/0009-integration-testing.md)) are colocated with the packages they exercise (`apps/web` and `apps/api`), so they are type-checked and run as part of those packages. `tests/acceptance` remains a dedicated workspace because it has a distinct browser runner (Playwright) and its own service lifecycle (it builds and boots the API and web bundle itself).

### Backend API (`apps/api`)

The M0 backend API shell ([ADR-0004](docs/adr/0004-backend-api-framework.md)): a Fastify server that binds to `127.0.0.1` only, serves no data beyond operational metadata, and implements no authentication ([GUARDRAILS.md § 1.4](GUARDRAILS.md#14-security) — the M0 local shell is exempt; there is no code path to bind any other interface). Its only route is:

- `GET /health` → `200` with body `{"status":"ok","service":"atlast-api"}`

Commands (run from the repository root with `pnpm --filter @atlast/api <script>`, or inside `apps/api`):

- `pnpm --filter @atlast/api dev` — start the API from TypeScript source with Node's built-in watch mode ([ADR-0011](docs/adr/0011-local-development-runtime.md); no `tsx` needed — Node 24 runs the source via native type stripping)
- `pnpm --filter @atlast/api test` — run the in-process API tests (Vitest + `fastify.inject()`, no network sockets, per [ADR-0009](docs/adr/0009-integration-testing.md))
- `pnpm --filter @atlast/api typecheck` — type-check sources and tests
- `pnpm --filter @atlast/api build` — compile to git-ignored `apps/api/dist/`
- `pnpm --filter @atlast/api start` — run the built server from `dist/`

The port defaults to `3001` and can be overridden with the `ATLAST_API_PORT` environment variable; the bind address is not configurable.

### Web application (`apps/web`)

The M0 web application shell ([ADR-0003](docs/adr/0003-frontend-framework.md)): a client-rendered React + Vite single-page application that renders the Atlast foundation page and checks connectivity to the local API shell. **This is the M0 shell, not the M2 exploration UI** — it contains no topology data, graph exploration, search, or query behavior; those remain gated on M1/M2 authorization ([docs/milestones.md](docs/milestones.md)).

Commands (run from the repository root with `pnpm --filter @atlast/web <script>`, or inside `apps/web`):

- `pnpm --filter @atlast/web dev` — start the Vite dev server on `http://127.0.0.1:5173`
- `pnpm --filter @atlast/web test` — run the component tests (Vitest + jsdom; `fetch` is stubbed, no network access, per [ADR-0008](docs/adr/0008-unit-testing.md))
- `pnpm --filter @atlast/web typecheck` — type-check sources, tests, and the Vite config
- `pnpm --filter @atlast/web build` — build the static bundle into git-ignored `apps/web/dist/`
- `pnpm --filter @atlast/web preview` — serve the built bundle on `http://127.0.0.1:4173`

Both the dev and preview servers bind to `127.0.0.1` only. The page requests the relative path `/api/health` on load; Vite's dev/preview proxy forwards it to the API shell's `GET /health` at `http://127.0.0.1:3001`, so the API needs no CORS configuration and the browser bundle contains no API host. Start the API first (`pnpm --filter @atlast/api dev`) to see the "Local API connected" state; without it the page shows "Local API unavailable".

### Browser acceptance tests (`tests/acceptance`)

The M0 browser acceptance suite ([ADR-0010](docs/adr/0010-browser-acceptance-testing.md)): Playwright drives the primary shell journey against the fully assembled system — the real built API server and the real built web bundle behind the Vite preview proxy, over genuine HTTP in a real browser. The suite is Chromium-only at M0 and runs the same journey in two projects:

- `desktop-chromium` — 1280×720 viewport
- `mobile-chromium` — 390×844 viewport

One-time browser installation (downloads the Chromium build pinned by the Playwright package version):

- `pnpm --filter @atlast/tests-acceptance browser:install`

Running the suite:

- `pnpm --filter @atlast/tests-acceptance test` — run the acceptance suite (also discovered by the root `pnpm test`)

The tests boot everything themselves through Playwright's `webServer` lifecycle: they build `@atlast/api` and start its built server on `http://127.0.0.1:3001`, build `@atlast/web` and serve the bundle with `vite preview` on `http://127.0.0.1:4173`, wait on each server's readiness URL, and tear both processes down after the run — no manually started processes or pre-existing `dist/` output are used, and everything stays on the loopback interface. Assertions are web-first (auto-waiting) with no fixed sleeps.

Playwright writes generated artifacts — traces and screenshots (retained only on failure) under `test-results/`, plus any `playwright-report/` and `blob-report/` output — which are git-ignored and never committed.

## Contributing

M0 through M3, M4-A, and M4-B are complete ([TASKS.md](TASKS.md)); checkpoint `m4-b-impact-api-harness-merged` records the merged M4-B implementation and verification evidence. M4-C is authorized only within the exact accepted browser impact-panel boundary, effective after this documentation merge/synchronization gate. See [docs/milestones.md](docs/milestones.md), [TASKS.md](TASKS.md), and [HANDOFF.md](HANDOFF.md). **M4-D through M4-E and M5+ remain unauthorized.** All contributions must comply with [GUARDRAILS.md](GUARDRAILS.md).

## License

TBD — to be decided before the first public release.
