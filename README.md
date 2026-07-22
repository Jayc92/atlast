# Atlast

**An AI-powered Engineering Topology Platform.**

Atlast continuously discovers the systems your organization runs, builds a living dependency graph of how they connect, overlays real-time operational health, and predicts the downstream impact of technical changes before they happen.

> **Status: M0 Phase B — foundation build.** The documentation set and tooling ADRs are approved; the repository holds the monorepo workspace skeleton and bootstrap tooling. No application code exists yet. Read [PROJECT_SPEC.md](PROJECT_SPEC.md) before contributing anything.

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

| Document                                     | Purpose                                                                                                                                                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PROJECT_SPEC.md](PROJECT_SPEC.md)           | Vision, goals, guiding principles, scope, and non-goals                                                                                                                                                                       |
| [docs/architecture.md](docs/architecture.md) | Architecture philosophy and conceptual system design                                                                                                                                                                          |
| [docs/milestones.md](docs/milestones.md)     | Synthetic-first delivery plan (M0 foundation → M1 synthetic topology model → M2 interactive interface → M3 health overlays → M4 change-impact simulation → M5 read-only local Kubernetes connector); predictive AI is post-M5 |
| [TASKS.md](TASKS.md)                         | Current work breakdown and task tracking                                                                                                                                                                                      |
| [GUARDRAILS.md](GUARDRAILS.md)               | Engineering, coding, repository, documentation, and testing standards                                                                                                                                                         |
| [CLAUDE.md](CLAUDE.md)                       | Working instructions for AI coding assistants in this repository                                                                                                                                                              |

## Local Setup

1. **Install Node.js 24.15.0** with your version manager — [.nvmrc](.nvmrc) pins the exact version, so `nvm install && nvm use` (or the fnm/mise equivalent) selects it automatically.
2. **If `pnpm` is not on your PATH**, enable it via Corepack: `corepack enable pnpm`. If that fails with a permission error (the default install directory is not writable), point Corepack at a writable directory instead — it must already be on your PATH, since Corepack only places the shim there: `corepack enable --install-directory "$HOME/.npm-global/bin" pnpm`. Corepack usually ships with Node.js 24 but is not present in every installation; if the command is missing, install it first with `npm install --global corepack`.
3. **Run `./scripts/bootstrap.sh`** from anywhere in the repository. It verifies the Node and pnpm versions, then installs the workspace with `pnpm install --frozen-lockfile`. On any mismatch it prints the exact command to fix it and exits.

The exact pnpm version is pinned in [package.json](package.json)'s `packageManager` field ([ADR-0001](docs/adr/0001-monorepo-package-manager.md)), and `pnpm-lock.yaml` is a committed, reviewed artifact — every contributor and CI run installs identically.

## Development Commands

Repository-wide linting ([ADR-0006](docs/adr/0006-linting.md)) and formatting ([ADR-0007](docs/adr/0007-formatting.md)) run from the repository root:

- `pnpm lint` — run ESLint across the repository
- `pnpm format:check` — verify formatting without modifying files (what verification runs)
- `pnpm format` — apply Prettier formatting
- `pnpm typecheck` — run TypeScript type checking recursively across workspace packages ([ADR-0002](docs/adr/0002-monorepo-task-runner.md)); packages without a `typecheck` script are skipped

TypeScript 6.0.3 and the strict shared base configuration ([tsconfig.base.json](tsconfig.base.json)) are installed, and package-level type checking currently covers the four shared package shells (`packages/shared`, `packages/graph-model`, `packages/connectors`, `packages/ui`). Type checking for the application packages (`apps/*`) and test suites arrives with those shells.

## Contributing

Application code has not started. Until it does, contributions take the form of documentation review and refinement. All contributions — documentation or code — must comply with [GUARDRAILS.md](GUARDRAILS.md).

## License

TBD — to be decided before the first public release.
