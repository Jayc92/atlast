# ADR-0002: Monorepo Task Runner — pnpm Workspace Scripts (no dedicated runner yet)

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

The M0 monorepo has three to five packages: a web application shell, a backend API shell, and shared packages ([docs/milestones.md M0](../milestones.md#m0--safe-project-foundation-active)). Each package needs lint, format-check, type-check, test, and build tasks, all invoked through the single entry point `scripts/verify.sh`. The guiding principles demand simplicity over cleverness and minimal operational burden.

## Problem

We need a way to run tasks across workspace packages in dependency order (shared packages build before their consumers) without adding orchestration machinery a repo of this size does not need.

## Decision

Use **pnpm's built-in recursive script execution** (`pnpm --recursive run <task>`, with `--filter` for targeted runs) as the task runner. pnpm executes recursive scripts in workspace topological order, which covers the only ordering constraint we have (shared packages first). `scripts/verify.sh` composes these invocations into the one-command verification pipeline. **No dedicated task-runner dependency (Turborepo, Nx) is adopted at M0.**

## Alternatives Considered

- **Turborepo** — remote/local caching and task-graph parallelism. The strongest alternative: minimal config, widely used. Rejected *for now* because with fewer than ~6 small packages, full verification is fast enough that caching infrastructure is premature; it adds a dependency, a config file, and cache-invalidation semantics to debug for no present gain.
- **Nx** — powerful, but its plugin ecosystem, generators, and daemon are a large conceptual surface aimed at repos with dozens of projects. Directly conflicts with "simplicity over cleverness."
- **Make / shell scripts per task** — no new dependency, but reimplements topological ordering that pnpm already provides, and Make is a weaker fit for Windows contributors.

## Tradeoffs

- **Chosen:** zero additional dependencies, zero extra configuration, one fewer tool to learn; ordering semantics come from the workspace graph we already maintain.
- **Given up:** task-output caching and fine-grained parallelism. Verification re-runs everything every time — acceptable while everything is small, wasteful later.

## Consequences

- `scripts/verify.sh` (authored in Phase B, after ADR approval) is the orchestration layer; it stays a readable, linear script.
- CI has no cache to consume; CI time grows linearly with the codebase.
- Adopting a task runner later is low-cost: package scripts remain the unit of execution, so Turborepo/Nx can wrap them without restructuring.

## Risks

- We outgrow this quietly: verification creeps past a tolerable duration and nobody revisits the decision. Mitigation: the change condition below names a concrete threshold.
- Sequential recursive runs hide per-package failures in long output. Mitigation: verify.sh runs tasks with clear per-step boundaries and fails fast.

## Why This Fits Atlast

- **Simplicity over cleverness / boring core:** the boring option here is *no tool* — the package manager already does the job.
- **Minimize operational burden:** nothing to configure, cache, or invalidate.
- **One-command verification:** a thin shell script over pnpm keeps `scripts/verify.sh` fully transparent — you can read exactly what "verified" means.

## Conditions That Would Justify Changing This Decision

- Full `scripts/verify.sh` runtime exceeds ~5 minutes locally or ~10 minutes in CI.
- Package count grows to the point where "run everything" is mostly redundant work (roughly >10 packages).
- Contributors demonstrably wait on repeated unaffected rebuilds daily. Any of these triggers a follow-up ADR proposing Turborepo (the pre-identified successor).
