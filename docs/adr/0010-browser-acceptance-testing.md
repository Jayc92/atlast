# ADR-0010: Browser Acceptance Testing — Playwright

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

M0's exit criteria include automated **browser acceptance checks** wired into `scripts/verify.sh`, and M2's exit criteria hinge on them: a user must be able to navigate a synthetic topology, search, and inspect evidence *from the UI alone* ([docs/milestones.md](../milestones.md)). These tests are the only layer that exercises the full assembled system — real browser, real frontend bundle, real backend server, real HTTP — and they must still be deterministic ([GUARDRAILS.md § 5](../../GUARDRAILS.md#5-testing-philosophy)).

## Problem

Choose a browser automation tool that can drive the real application end to end, run headless in CI with no flake, and boot/tear down the full stack itself so acceptance remains part of one-command verification.

## Decision

Use **Playwright** (with `@playwright/test`) for browser acceptance tests:

- Playwright's `webServer` option boots the real backend (fixture-loaded, synthetic data) and the built frontend; tests run against genuine HTTP.
- **Chromium-only at M0** — one browser keeps CI fast and flake-free; cross-browser coverage is a deliberate later expansion, not a default cost.
- Determinism rules: tests use web-first assertions (auto-waiting) — **no fixed sleeps ever**; the backend serves fixture data so every run sees identical topology; anything time-displaying uses the injected clock.
- Scope discipline: acceptance tests cover the *primary user journeys* only (M0: the shells boot and render, the app talks to the API end to end). Component-level UI behavior belongs in unit tests (ADR-0008).

## Alternatives Considered

- **Cypress** — the strongest alternative; mature, excellent DX. Rejected because its architecture (running inside the browser) limits multi-tab/multi-context control, its parallelization is dashboard-oriented (a paid external service — an operational and data dependency we don't want), and Playwright has become the ecosystem default with a stronger determinism story (auto-waiting, tracing).
- **WebdriverIO / Selenium** — the most standards-based option, but a heavier protocol stack with a historically higher flake floor; the W3C-standard benefit matters for broad device grids we don't need.
- **Testing-library + jsdom only (no real browser)** — not an alternative but a temptation: it cannot satisfy "browser acceptance checks" because jsdom is not a browser; layout, real network, and rendering are exactly what this layer exists to prove.

## Tradeoffs

- **Chosen:** the strongest anti-flake toolkit available (auto-waiting, trace viewer for post-mortem debugging of any CI failure), first-class TypeScript, self-managed server lifecycle.
- **Given up:** Cypress's interactive time-travel DX; multi-browser assurance at M0 (consciously deferred); browser binary downloads make CI setup slightly heavier (cached in practice).

## Consequences

- `verify.sh` gains a step that builds the frontend, boots the backend against fixtures, and runs the journey suite — the closing proof of the one-command verification story.
- Playwright's trace/screenshot artifacts on failure become the debugging record for acceptance regressions.
- The acceptance suite grows only when milestones add journeys (M2 exploration, M3 overlay toggles, M4 impact views) — it is intentionally the smallest test layer.

## Risks

- E2E suites are the classic flake source. Mitigation: fixture-served data, auto-waiting assertions, no-sleep rule, single browser, small journey-scoped suite; a flaky test is fixed or deleted immediately per guardrails.
- Browser download/version skew between local and CI. Mitigation: Playwright pins browser builds to its package version — pinning the package pins the browser.

## Why This Fits Atlast

- **Trust in the graph is proven at the surface:** M2's promise — provenance, confidence, and freshness visible for every displayed fact — can only be verified in a real browser.
- **One-command verification:** self-booting server management keeps the full end-to-end proof inside `scripts/verify.sh`.
- **Deterministic testing:** Playwright is the current best-in-class answer to E2E determinism, the guardrail this layer most endangers.

## Conditions That Would Justify Changing This Decision

- Persistent flake that survives the determinism rules above — would trigger re-evaluation of the layer's design, not just the tool.
- A hard cross-browser support requirement (e.g., enterprise Safari/Firefox mandates) shifting weight toward standards-based drivers — though Playwright likely still covers it by enabling more engines.
- Playwright maintenance regressing (no realistic sign; heavily invested ecosystem).
