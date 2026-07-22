# ADR-0007: Formatting — Prettier

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

M0 requires automated formatting checks in `scripts/verify.sh`. Formatting must cover TypeScript, JSON, Markdown (this repository is documentation-heavy and documentation is a deliverable per [GUARDRAILS.md § 4](../../GUARDRAILS.md#4-documentation-standards)), YAML, and CSS. The goal is zero human time spent on style — in authoring or in review.

## Problem

Pick one formatter, applied identically by editors, `verify.sh`, and CI, so that formatting is never a review topic and diffs contain only meaning.

## Decision

Use **Prettier** with near-default configuration (deviations, if any, limited to a handful of explicit options in one root config file). `verify.sh` runs `prettier --check`; writing happens via editor integration or an explicit format script. Linting (ADR-0006) has all stylistic rules off, so the two tools cannot fight.

## Alternatives Considered

- **Biome (format)** — the strongest alternative: much faster, Prettier-compatible output for TS/JSON/CSS. Rejected *for now* solely for coverage: Markdown and YAML support has not reached Prettier's maturity, and this repo's documentation weight makes Markdown formatting first-class, not incidental. If we later adopt Biome for linting (see ADR-0006's change conditions), formatting would consolidate with it.
- **dprint** — fast and pluggable, but a smaller community and a plugin-configuration surface that is more machinery than the problem deserves.
- **No enforced formatter (editor discretion)** — guarantees style churn in diffs and review nitpicks; rejected outright.

## Tradeoffs

- **Chosen:** the ecosystem's settled default — every editor integrates it, every contributor knows it, output is uncontroversial by definition; full coverage of all file types in the repo.
- **Given up:** speed (Prettier is slower than Biome/dprint; irrelevant at this repo size) and configurability (a feature — fewer decisions to litigate).

## Consequences

- Formatting disputes are closed permanently; the config is the arbiter.
- `--check` in verification means unformatted code fails CI rather than getting silently rewritten — the pipeline never mutates the working tree.
- Markdown documentation (including these ADRs) is format-checked, keeping docs diffs clean.

## Risks

- Prettier major-version updates occasionally change output, causing one-time reformat commits. Mitigation: pin the version; upgrades are deliberate, isolated `chore:` commits so reformat noise never mixes with meaning.

## Why This Fits Atlast

- **Simplicity over cleverness:** default Prettier is the single most boring formatting decision available in this ecosystem.
- **Excellent developer experience:** save-on-format everywhere, zero style review comments.
- **Docs are a deliverable:** one tool formats code *and* the documentation set to the same standard.

## Conditions That Would Justify Changing This Decision

- Consolidation opportunity: Biome adopted for linting with Markdown/YAML formatting at parity → move formatting there and retire a dependency.
- Prettier maintenance stalls (its funding/maintenance model has wobbled before; currently healthy).
- Formatting time somehow becomes a verification bottleneck (implausible before the codebase is very large).
