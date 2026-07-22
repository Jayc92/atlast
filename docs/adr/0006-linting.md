# ADR-0006: Linting — ESLint with typescript-eslint (type-aware, strict)

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

M0 requires automated linting wired into `scripts/verify.sh` ([docs/milestones.md M0](../milestones.md#m0--safe-project-foundation-active)). Several guardrails are lintable properties: no silent catch-alls, no floating promises, explicit types on public interfaces, no unused escape hatches. [Architecture § 6](../architecture.md#6-technology-selection-criteria-draft--human-approval-required) directs us to the most boring, widely supported option.

## Problem

Choose a linter that can enforce _semantic_ correctness rules (which require type information — e.g., detecting an unawaited Promise or an unsafe `any` flow), applied uniformly across all workspace packages.

## Decision

Use **ESLint (flat config) with typescript-eslint's type-aware rule sets** (`strictTypeChecked` as the baseline), one shared config at the repo root that packages extend. Rules with special weight for Atlast, enabled from day one:

- `no-floating-promises`, `no-misused-promises` — a dropped promise is a silently swallowed failure, banned by [GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards).
- `no-explicit-any` and the `no-unsafe-*` family — "strongest typing the language offers."
- `explicit-module-boundary-types` — public interfaces fully typed.
- Restrictions on empty catch blocks and non-specific error swallowing.

Formatting rules are **disabled entirely** — formatting belongs to the formatter (ADR-0007), and mixing the two is a known tarpit.

## Alternatives Considered

- **Biome (lint)** — one fast tool for lint + format. The strongest alternative. Biome v2 does support type-aware linting, so capability is no longer the disqualifier. ESLint is preferred instead for maturity and fit: typescript-eslint's rule set is deeper and longer-proven on exactly the semantic rules our guardrails depend on; the plugin ecosystem is far broader (React rules, import hygiene, comment-justified disables); custom architectural rules (e.g., enforcing "no side doors" import boundaries later) have an established authoring path; and staying on the ecosystem default carries the lowest migration risk for a project that prizes boring stability over toolchain speed.
- **oxlint** — extremely fast, but a young rule set without type-aware analysis; same disqualifier.
- **No linter (rely on the compiler + review)** — the compiler cannot flag floating promises or `any` propagation patterns, and review-only enforcement of mechanical rules wastes reviewer attention on what machines do better.

## Tradeoffs

- **Chosen:** the deepest, most battle-tested TypeScript rule ecosystem; type-aware analysis that turns several guardrails from review conventions into CI failures.
- **Given up:** speed — type-aware linting is the slowest tool in the verify pipeline. Accepted at M0 scale; revisit thresholds are named below.

## Consequences

- Lint failures block verification and CI; there is no "warning" tier for the guardrail-enforcing rules (they are errors).
- Every `eslint-disable` requires a justification comment — an undocumented disable is itself a lint error (`eslint-comments` enforcement).
- One root config keeps rule drift between packages impossible.

## Risks

- Type-aware lint time grows with the codebase and could dominate `verify.sh`. Mitigation: it parallelizes per package; if it exceeds the ADR-0002 time thresholds, scope type-aware rules to changed packages in local runs while CI runs everything.
- Strict rule sets can push contributors toward suppression comments. Mitigation: justification-required disables make suppression visible in review.

## Why This Fits Atlast

- **Errors are handled explicitly:** the promise and catch-block rules are the automated enforcement of the single most safety-relevant coding guardrail.
- **Production-quality engineering:** semantic linting catches the class of bug (silent async failure) that would otherwise surface as a silently stale graph — Atlast's worst failure mode.
- **Boring, stable:** ESLint + typescript-eslint is the ecosystem default with a decade of stability.

## Conditions That Would Justify Changing This Decision

- Biome's type-aware rules, plugin breadth (React, import hygiene), and support for custom architectural rules reach practical parity with the typescript-eslint ecosystem — at that point consolidating lint + format into one fast tool would simplify the toolchain and should be proposed.
- Lint time becomes the bottleneck of verification and cannot be mitigated by scoping/parallelism.
- typescript-eslint's flat-config or rule APIs churn destructively across majors (no current sign).
