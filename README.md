# Atlast

**An AI-powered Engineering Topology Platform.**

Atlast continuously discovers the systems your organization runs, builds a living dependency graph of how they connect, overlays real-time operational health, and predicts the downstream impact of technical changes before they happen.

> **Status: M0 complete (2026-07-22); M1 implementation authorized (2026-07-23) and active, slice-gated.** The safe project foundation is finished: the approved documentation set and ADRs 0001–0013, the monorepo workspace, the backend API shell ([apps/api](apps/api), per [ADR-0004](docs/adr/0004-backend-api-framework.md)), the web application shell ([apps/web](apps/web), per [ADR-0003](docs/adr/0003-frontend-framework.md)), the shared package shells, the browser acceptance suite, and GitHub Actions CI running `scripts/verify.sh`. The [M1 plan](docs/m1-plan.md) is approved, ADRs 0014–0024 are Accepted (ADR-0014/0015 amended by [ADR-0019](docs/adr/0019-subject-identity-and-assertion-claims.md) and [ADR-0022](docs/adr/0022-m1-reconciliation-policy-and-assertion-derivation.md); ADR-0017 amended by [ADR-0020](docs/adr/0020-m1-inventory-and-search-semantics.md) and [ADR-0024](docs/adr/0024-m1-query-api-runtime-contract.md); ADR-0016 amended by [ADR-0021](docs/adr/0021-jcs-canonicalization-clarifications.md) and [ADR-0023](docs/adr/0023-m1-snapshot-and-in-memory-store-semantics.md); ADR-0018/0019 amended by ADR-0023; ADR-0020 amended by ADR-0024), and M1 implementation is explicitly authorized — executing one reviewed slice at a time. Slice S1 (the domain schemas in `packages/shared`) merged through PR #7 on 2026-07-29; Slice S2 (repository interfaces and the storage-agnostic contract-test suite skeleton) was human-approved and merged through PR #10 on 2026-07-30, and the S2 checkpoint/HANDOFF protocol merged through PR #11. Slice S3 (the synthetic fixture suite in `fixtures/demo-company/`) is complete — independently reviewed and approved, merged through PR #13 on 2026-07-30 with GitHub Actions verification passing; its closeout checkpoint merged through PR #14. **Slice S4 (temporal foundations in `packages/graph-model`) is complete — authorized through PR #15 with ADR-0021 accepted through the same PR, implemented, independently reviewed and remediated, and merged through PR #16 on 2026-07-31 with GitHub Actions verification passing.** **Slice S5 (reconciliation engine, `m1-v1`) is complete — human-authorized 2026-07-31 with [ADR-0022](docs/adr/0022-m1-reconciliation-policy-and-assertion-derivation.md) — the binding `m1-v1` reconciliation specification — explicitly accepted 2026-08-05, implemented under accepted ADR-0022, independently reviewed with no blocking findings, and merged through PR #19 on 2026-08-05 with GitHub Actions verification passing.** The S6 pre-release architecture and authorization review is complete — [ADR-0023](docs/adr/0023-m1-snapshot-and-in-memory-store-semantics.md) was explicitly accepted on 2026-08-05 after three independent-review correction passes, settling all nine identified S6 design gaps, and remains the binding S6 clarification. **Slice S6 (snapshot layer + in-memory stores) was explicitly authorized by Joseph Carfagno on 2026-08-05**, implemented under accepted ADR-0023, independently reviewed, and **merged to `main` through PR #23 at `9bf7f09` on 2026-08-10** with GitHub Actions verification passing in 2m12s. **S1–S6 are now complete. Closing S6 does not authorize S7.** The S7 pre-release architecture and runtime contract is separately settled: [ADR-0024](docs/adr/0024-m1-query-api-runtime-contract.md) was explicitly accepted by Joseph Carfagno on 2026-08-11, after the S7 pre-release review and three independent correction passes, settling fifteen HTTP-boundary and build-boundary gaps and amending ADR-0017/0020 via metadata-only notices. **Slice S7 (query API v1 routes in `apps/api`) was then explicitly authorized by Joseph Carfagno on 2026-08-11**, in a separate authorization decision recorded in [TASKS.md](TASKS.md): S7 is the only active authorized implementation slice, **effective only after the documentation PR recording the authorization merges to `main` and `main` is synchronized locally with a clean working tree**; the authorization does not approve future S7 implementation output, which still requires independent review, verification, PR approval, and merge. S8 remains gated, released explicitly only after its own explicit human release ([HANDOFF.md](HANDOFF.md) records the current checkpoint, `m1-s7-authorized`). Beyond the S1 domain schemas, the S2 contract surface, the S3 fixture catalog, the S4 temporal-foundation primitives (Evidence ordering, horizon selection, validity membership, RFC 8785 canonical serialization, SHA-256 digests), the S5 reconciliation engine (the `m1-v1` derivation policy, identity normalization, event-time reconciliation, content-addressed assertions, freshness classification), and the S6 snapshot layer and in-memory repositories (deterministic snapshot construction and identity, checksums, an injected `Clock`, cursor binding and continuation, structured repository errors, and the `EvidenceStore`/`TopologyGraphStore` implementations passing the S2 contract suite end-to-end), no further M1 behavior has landed yet: Atlast does not yet implement query routes or topology visualization; those descriptions below are the product vision, not current behavior. **M2 and later milestones remain unauthorized** ([docs/milestones.md](docs/milestones.md)). Read [PROJECT_SPEC.md](PROJECT_SPEC.md) before contributing anything.

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

The M0 foundation is complete — the backend API shell lives in [apps/api](apps/api) and the web application shell in [apps/web](apps/web) — and **M1 is active and slice-gated** ([TASKS.md](TASKS.md)). Slices S1–S6 are complete and merged (PRs #7, #10, #13, #16, #19, and #23). **Slice S6** — explicitly authorized by Joseph Carfagno on 2026-08-05 after the S6 pre-release architecture review completed ([ADR-0023](docs/adr/0023-m1-snapshot-and-in-memory-store-semantics.md) accepted 2026-08-05) — was implemented, independently reviewed, verified, and **merged to `main` through PR #23 at `9bf7f09` on 2026-08-10**. **Slice S7 (query API v1 routes in `apps/api`) is the only active authorized implementation slice** — its design was settled by [ADR-0024](docs/adr/0024-m1-query-api-runtime-contract.md) (accepted 2026-08-11 after the S7 pre-release review and three independent correction passes, amending ADR-0017/0020 via metadata-only notices), and Joseph Carfagno then explicitly authorized S7 on 2026-08-11, **effective only after the documentation PR recording the authorization merges to `main` and `main` is synchronized locally with a clean working tree**; its implementation output still requires independent review, verification, PR approval, and merge, and is bounded exactly by ADR-0024's Exact S7 Boundary. Other contributions are limited to maintenance and corrections of the existing foundation and merged slices ([HANDOFF.md § 7](HANDOFF.md)). S8 and M2+ remain gated on their own explicit releases ([docs/milestones.md](docs/milestones.md), [HANDOFF.md](HANDOFF.md)). All contributions — documentation or code — must comply with [GUARDRAILS.md](GUARDRAILS.md).

## License

TBD — to be decided before the first public release.
