# Architecture Decision Records

Binding decisions are made only through human-approved ADRs ([GUARDRAILS.md § 1.3](../../GUARDRAILS.md#13-change-discipline)). Format: `NNNN-short-title.md` with Context, Problem, Decision, Alternatives Considered, Tradeoffs, Consequences, Risks, fit rationale, and change conditions. Statuses: **Proposed → Accepted → Superseded** (or **Rejected**).

## Index

### Accepted (M0 — approved 2026-07-22)

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

### Accepted (M1 planning decisions — approved 2026-07-23)

| ADR                                                   | Decision                                                                             | Status                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| [0014](0014-core-topology-domain-model.md)            | Core topology domain model — stable subjects, content-addressed assertion revisions  | Accepted; amended by ADR-0019 |
| [0015](0015-deterministic-identity-reconciliation.md) | Identity reconciliation — rules-first, deterministic, conflict-preserving            | Accepted; amended by ADR-0019 |
| [0016](0016-temporal-graph-and-snapshots.md)          | Temporal graph and snapshots — bitemporal records, derived snapshots, exact replay   | Accepted                      |
| [0017](0017-m1-query-api-surface.md)                  | M1 query API surface — purpose-built, bounded, evidence-linked REST contract         | Accepted                      |
| [0018](0018-m1-storage-strategy.md)                   | M1 storage strategy — retain fixture-backed in-memory storage behind the interfaces  | Accepted                      |
| [0019](0019-subject-identity-and-assertion-claims.md) | Subjects carry identity only; canonical claims own type/endpoints (amends 0014/0015) | Accepted                      |

**Approval note (2026-07-23):** ADRs 0014–0018 were accepted by human review as the **M1 architecture baseline**, alongside approval of [docs/m1-plan.md](../m1-plan.md). Acceptance settles the M1 planning decisions only — **it does not authorize M1 implementation**, which requires its own separate, explicit human authorization per [docs/milestones.md](../milestones.md).

**Approval note (2026-07-23, ADR-0019):** ADR-0019's identity-only subject decision was **accepted by human review**, resolving the internal contradiction between ADR-0014's typed-subject clauses and ADR-0015's coexisting-conflicting-claims requirement. It amends **only** those identified clauses (metadata-only amendment notices on ADR-0014/0015; their accepted decision text is preserved). Acceptance **unblocks Slice S1** — it does not authorize S2–S8 or M2+, which remain gated as before.
