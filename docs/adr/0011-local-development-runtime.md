# ADR-0011: Local Development Runtime — Node.js LTS, No Containers

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

> **Correction note (2026-07-22):** The originally approved text misidentified the current Node.js LTS line as v22; as of this date the current LTS line is **v24**. This is a factual correction of the LTS version reference, not a new architecture decision — the accepted decision ("current Node.js LTS, no containers") is unchanged.

## Context

M0 needs a runtime story for local development: what executes the backend, builds the frontend, and runs the toolchain. Constraints for this phase are explicit — no Docker files, no deployment tooling, no production infrastructure, synthetic data only, and everything verifiable with one command on a contributor's machine.

## Problem

Choose the runtime and its management approach so that a fresh clone reaches a running, verifiable development environment with the minimum moving parts, identically for every contributor and CI.

## Decision

- **Node.js, current LTS (v24 line as of this writing)** is the sole runtime for the backend API, the frontend toolchain, and all scripts.
- The required version is pinned in **one place**: `.nvmrc` pins the exact preferred development version (read by nvm/fnm/mise and CI), while the `engines` field in the root manifest enforces the compatible Node 24 range so a mismatched runtime fails fast.
- **No containers for local development.** The dev environment is: install pinned Node LTS → `pnpm install` → run. The dev loop is the frontend dev server (Vite) plus the backend started directly with Node's built-in TypeScript-aware watch tooling (or `tsx` if needed — resolved at scaffold time within this ADR's scope).
- Native Node primitives are preferred over dependencies wherever adequate (`node:test` excepted per ADR-0008's reasoning; `fetch`, `node:crypto`, etc. used directly).

## Alternatives Considered

- **Bun** — the strongest alternative: dramatically faster installs and startup, native TypeScript execution. Rejected because the runtime is the last place Atlast can afford novelty — the backend must out-survive the systems it maps ([architecture § 1.5](../architecture.md#15-boring-core-isolated-intelligence)), and Bun's Node-compatibility surface still carries edge-case risk across the exact libraries we depend on.
- **Deno** — excellent security defaults (explicit permissions align with least-privilege thinking), but a smaller ecosystem and enough npm-interop friction to violate "boring" for a team standardizing on mainstream TypeScript tooling.
- **Docker-based dev environment** (devcontainers/compose) — maximum environment reproducibility, but explicitly out of scope for this phase (no Docker files), and overkill: the entire system through M4 is Node processes reading fixture files. Pinned Node + lockfile already gives the reproducibility that matters.

## Tradeoffs

- **Chosen:** zero infrastructure to install beyond Node and pnpm; sub-second dev-loop starts; the same runtime everywhere (dev, test, CI).
- **Given up:** container-level isolation of the dev environment (OS-level differences remain possible, though a fixture-driven Node app has very little OS surface) and Bun-class speed.

## Consequences

- Onboarding is: clone, install pinned Node, `pnpm install`, run verify — the entire environment story fits in a README paragraph.
- CI uses the identical pinned version, eliminating a whole class of works-on-my-machine drift.
- When deployment eventually becomes in-scope (post-M5 at the earliest), containerization is a _packaging_ decision layered on top — nothing here blocks it.

## Risks

- Node LTS transitions (~annual) require a coordinated bump. Mitigation: single-source version pin makes it a one-line, deliberate PR.
- Contributors without a Node version manager may run mismatched versions. Mitigation: `engines` + pnpm's engine-strict enforcement fails fast with a clear message instead of failing weird.

## Why This Fits Atlast

- **Boring core:** Node LTS is the most conservative possible runtime for a TypeScript system; nothing on the critical path is experimental.
- **Minimize operational burden:** no daemon, no VM, no image builds — the dev environment is a process.
- **Read-only philosophy & synthetic-first:** a plain local process with no container networking makes "nothing connects to any real system" easy to see and easy to audit.

## Conditions That Would Justify Changing This Decision

- Bun (or another runtime) reaching boring-by-consensus status with full compatibility across our dependency set — speed gains would then be free.
- The dev environment accreting real service dependencies (post-M5 storage, etc.) that make container orchestration genuinely simpler than native processes — revisited in the ADR that introduces the dependency.
- A Node platform decision (licensing, release cadence collapse) undermining LTS reliability (very low probability).
