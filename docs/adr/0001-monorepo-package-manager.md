# ADR-0001: Monorepo Package Manager — pnpm

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

M0 Phase B establishes a TypeScript monorepo containing a web application shell, a backend API shell, and shared packages ([docs/milestones.md M0](../milestones.md#m0--safe-project-foundation-active)). Every package manager decision propagates into lockfile format, dependency isolation, CI install time, and contributor onboarding. [Architecture § 6](../architecture.md#6-technology-selection-criteria-draft--human-approval-required) directs us toward the most boring, widely supported option, and [GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards) treats every dependency as a liability.

## Problem

We need one tool to install dependencies, link workspace packages (web app ↔ shared packages ↔ backend API), and produce a deterministic lockfile — with strict enough dependency resolution that packages cannot silently import dependencies they never declared.

## Decision

Use **pnpm** with native pnpm workspaces (`pnpm-workspace.yaml`) as the sole package manager. The exact pnpm version is **pinned in repository metadata** (the `packageManager` field in the root manifest) so every contributor and CI run resolves dependencies identically.

Corepack is **not** assumed: it is not guaranteed to be installed or enabled with a given Node.js installation. The M0 bootstrap documentation or bootstrap script (authored in Phase B) MUST verify that the pinned pnpm version can be invoked and, when it cannot, print an explicit setup command for the contributor to run — never silently proceed with a different version.

## Alternatives Considered

- **npm workspaces** — ships with Node.js, zero extra tooling. Rejected because its flat, hoisted `node_modules` allows phantom dependencies (importing packages never declared in `package.json`), which undermines the "dependencies are liabilities" guardrail in a multi-package repo.
- **Yarn (Berry)** — capable workspaces, but Plug'n'Play mode has ecosystem friction, and `node_modules` linker mode gives up its main differentiator. More concepts for no gain over pnpm.
- **Bun (as package manager)** — fast, but younger, and couples package management to an alternative runtime we are not adopting (see ADR-0011).

## Tradeoffs

- **Chosen:** strict, symlinked `node_modules` (undeclared imports fail loudly), content-addressable store (fast, disk-efficient installs), first-class workspace filtering (`pnpm --filter`).
- **Given up:** the zero-install-tooling simplicity of npm; occasional friction with poorly-packaged libraries that assume a hoisted layout (rare in 2026, and surfacing those is a feature for us).

## Consequences

- One additional tool for contributors to install. The `packageManager` pin makes version mismatch detectable, but installation itself is a documented onboarding step verified by the Phase B bootstrap check — not assumed to happen automatically.
- The lockfile (`pnpm-lock.yaml`) becomes a reviewed artifact; dependency changes are visible in PRs.
- All workspace scripts, the task runner (ADR-0002), and `scripts/verify.sh` will invoke pnpm.

## Risks

- Contributors unfamiliar with pnpm hit strictness errors that npm would have hidden. Mitigation: this is the tool working as intended; document the fix (declare the dependency) in the repo README when scaffolding lands.
- pnpm major-version upgrades occasionally change hoisting defaults. Mitigation: version pinned via `packageManager`; upgrades are deliberate PRs.

## Why This Fits Atlast

- **Boring, stable:** pnpm is a mature, widely adopted default for TypeScript monorepos with a long stability record.
- **Dependencies are liabilities:** strict resolution structurally enforces the guardrail that every dependency is declared and justified.
- **Determinism:** pinned version + lockfile = identical installs locally and in CI, supporting one-command verification.

## Conditions That Would Justify Changing This Decision

- npm workspaces gain strict, isolated resolution as a stable default, removing pnpm's core advantage.
- pnpm loses active maintenance or its security-response quality degrades.
- The monorepo collapses to a single package (unlikely given the M0 shape), making workspace tooling moot.
