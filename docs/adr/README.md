# Architecture Decision Records

Binding decisions are made only through human-approved ADRs ([GUARDRAILS.md § 1.3](../../GUARDRAILS.md#13-change-discipline)). Format: `NNNN-short-title.md` with Context, Problem, Decision, Alternatives Considered, Tradeoffs, Consequences, Risks, fit rationale, and change conditions. Statuses: **Proposed → Accepted → Superseded** (or **Rejected**).

## Index

| ADR                                          | Decision                                                                                                                 | Status   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| [0001](0001-monorepo-package-manager.md)     | Monorepo package manager — pnpm                                                                                          | Accepted |
| [0002](0002-monorepo-task-runner.md)         | Task runner — pnpm workspace scripts (no dedicated runner)                                                               | Accepted |
| [0003](0003-frontend-framework.md)           | Frontend framework — React + Vite (client-rendered SPA)                                                                  | Accepted |
| [0004](0004-backend-api-framework.md)        | Backend API framework — Fastify                                                                                          | Accepted |
| [0005](0005-shared-validation-and-typing.md) | Shared validation/typing — strict TypeScript + Zod in a shared package                                                   | Accepted |
| [0006](0006-linting.md)                      | Linting — ESLint + typescript-eslint (type-aware)                                                                        | Accepted |
| [0007](0007-formatting.md)                   | Formatting — Prettier                                                                                                    | Accepted |
| [0008](0008-unit-testing.md)                 | Unit testing — Vitest                                                                                                    | Accepted |
| [0009](0009-integration-testing.md)          | Integration testing — in-process API contract tests over fixtures                                                        | Accepted |
| [0010](0010-browser-acceptance-testing.md)   | Browser acceptance testing — Playwright                                                                                  | Accepted |
| [0011](0011-local-development-runtime.md)    | Local development runtime — Node.js LTS, no containers                                                                   | Accepted |
| [0012](0012-initial-graph-storage.md)        | Initial graph storage (M0 only) — in-process model over fixtures, behind repository interfaces; M1 storage ADR mandatory | Accepted |
| [0013](0013-ci-philosophy.md)                | CI philosophy — CI runs exactly `scripts/verify.sh`, hermetically                                                        | Accepted |

**Approval note (2026-07-22):** ADRs 0001–0013 were formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only** — it does not authorize M1 or later milestone work, each of which requires its own explicit authorization per [docs/milestones.md](../milestones.md).
