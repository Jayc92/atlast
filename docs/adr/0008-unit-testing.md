# ADR-0008: Unit Testing — Vitest

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

[GUARDRAILS.md § 5](../../GUARDRAILS.md#5-testing-philosophy) sets a demanding bar: fixture-first, contract-focused, unhappy-path-heavy, and strictly deterministic — no wall-clock time, no network, no ordering luck. All components consume time and randomness through injectable interfaces ([architecture § 4](../architecture.md#4-cross-cutting-concerns)), so the test runner must make controlling those trivially easy. Tests run in every package of the monorepo (shared domain, backend, frontend) through `scripts/verify.sh`.

## Problem

Choose one unit-test runner usable across all workspace packages — including frontend component code — with first-class TypeScript/ESM support and built-in determinism aids (fake timers, module mocking).

## Decision

Use **Vitest** as the unit test runner in every package, with a shared base configuration. Determinism conventions enforced from the first test:

- Fake timers for anything time-dependent; the injectable clock interface is the primary mechanism, fake timers the backstop.
- No network access in unit tests — there is nothing to call anyway (synthetic data only through M4), and any accidental egress is a test bug.
- Test data comes from `fixtures/`, validated by the shared domain schemas (ADR-0005), so tests can't pass on data production would reject.

## Alternatives Considered

- **Node's built-in `node:test`** — the strongest alternative on "boring" grounds: zero dependencies, part of the platform. Rejected *at M0* because TypeScript/ESM ergonomics still require loader plumbing, its mocking/fake-timer facilities are less mature, and it cannot run browser-oriented frontend component tests — which would force a second runner and split the testing story.
- **Jest** — the long-time incumbent, but its ESM support remains the painful part of an otherwise mature tool, and its transform pipeline is legacy weight Vitest sheds; Vitest is its practical successor with a near-identical API.
- **Different runners per package** (e.g., `node:test` backend + something browser-capable for frontend) — two tools, two configs, two sets of conventions; violates simplicity for no benefit.

## Tradeoffs

- **Chosen:** one runner everywhere; native TS/ESM with no transform configuration; built-in fake timers, mocking, and coverage; Jest-compatible API (universally familiar).
- **Given up:** platform purity of `node:test`; Vitest couples us to the Vite ecosystem (already accepted in ADR-0003, so the marginal coupling is nil).

## Consequences

- One `test` script shape per package; `verify.sh` runs them all via the workspace runner (ADR-0002).
- Coverage reporting is available out of the box — used as a smell detector, never a target, per guardrails.
- Frontend component tests and backend logic tests share conventions, helpers, and reviewer expectations.

## Risks

- Vitest releases move faster than Jest historically did; majors occasionally adjust config. Mitigation: pinned versions, deliberate upgrades.
- Watch-mode/worker quirks occasionally differ between local and CI environments. Mitigation: CI runs the plain single-pass mode; verify.sh mirrors CI exactly.

## Why This Fits Atlast

- **Determinism is non-negotiable:** first-class fake timers and mock control make the injectable-time/randomness pattern cheap to test properly.
- **Fixture-first:** fast in-process runs over `fixtures/` with zero infrastructure matches the testing philosophy exactly.
- **One tool, whole monorepo:** the same runner tests the domain package, the API, and UI components — one set of habits protecting trust in the graph.

## Conditions That Would Justify Changing This Decision

- `node:test` reaching ergonomic parity (TS loading, timers, mocking) *and* a solved frontend-component story — the zero-dependency option should win when it's actually equivalent.
- Vitest maintenance faltering or a destructive breaking change without a migration path.
- Evidence that runner behavior differences (local vs CI) are causing nondeterminism the project cannot tolerate.
