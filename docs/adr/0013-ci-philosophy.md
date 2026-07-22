# ADR-0013: CI Philosophy — CI Runs Exactly `scripts/verify.sh`, Hermetically

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

M0's exit criteria require `scripts/verify.sh` to run lint, format check, type check, tests, build, and browser acceptance checks — and pass in CI ([docs/milestones.md M0](../milestones.md#m0--safe-project-foundation-active)). [GUARDRAILS.md § 5](../../GUARDRAILS.md#5-testing-philosophy) requires verify.sh to be "the single entry point that runs everything CI runs." This ADR fixes the *philosophy*; it deliberately does **not** author any pipeline configuration (no GitHub Actions or other CI files are created in this session — pipeline authoring happens in Phase B scaffolding after these ADRs are approved, and the platform-specific config will be a thin shell around this contract).

## Problem

Define what CI is *for* and what it may do, so that pipeline configuration — whenever and wherever it is authored — is a mechanical transcription of policy rather than a place where policy accretes.

## Decision

1. **One source of truth for "verified."** The CI pipeline's job is: check out, install the pinned toolchain (Node per ADR-0011, pnpm per ADR-0001, frozen lockfile), run `scripts/verify.sh`, report. CI-only checks are forbidden — any check worth running is added to verify.sh so it also runs locally; the pipeline file never contains verification logic of its own.
2. **Hermetic and read-only.** CI touches no external system, holds no credentials beyond repository read access, and never deploys anything — there is nowhere to deploy and (through M4) nothing real to touch. This makes the milestone constraint "nothing in the repository connects to any external system" *observable*: a CI secret appearing in the pipeline is a review-blocking defect, not a convenience.
3. **Deterministic or broken.** A CI run's outcome is a function of the commit. No retries-on-red as policy, no flaky-test quarantining — a flaky check is fixed or deleted immediately (guardrails already say this; CI is where it bites).
4. **Fail fast, fail readable.** Cheap checks (format, lint, type check) run before expensive ones (build, tests, browser acceptance); every failure names the step and reproduces locally via the same script.
5. **Blocking and universal.** Every PR to `main` — documentation included — passes CI before merge. Green CI is a merge precondition, not advice.
6. **CI is not the deployment system, ever for observed systems.** When deployment tooling eventually becomes in-scope (post-M5 at the earliest, its own ADR), it will be a separate concern from verification — and per the permanent read-only constraint, no pipeline will ever hold write credentials to systems Atlast observes.

## Alternatives Considered

- **Rich native pipelines** (per-check pipeline jobs with platform-specific caching, matrices, conditional paths) — better parallelism and per-check UI granularity, but verification logic migrates into platform config, local/CI drift begins, and the pipeline becomes untestable policy. Rejected as the model; a pipeline may still *display* verify.sh's steps as stages so long as the script remains the source of truth.
- **Merge-queue/trunk automation with auto-merge** — valuable at high contributor volume; premature machinery for this project's size.
- **No CI until implementation lands** — rejected: M0's exit criteria explicitly require CI passage, and docs-only PRs already benefit from format checks.

## Tradeoffs

- **Chosen:** zero drift between local and CI by construction; the verification contract is portable across CI platforms (the platform choice becomes low-stakes); the whole policy is readable in one shell script.
- **Given up:** platform-native parallelism and granular caching (verify.sh runs as one job). Accepted at current scale; ADR-0002's time thresholds govern when to revisit.

## Consequences

- Choosing the CI *platform* is demoted to a minor Phase B implementation detail — any runner that can execute a shell script on pinned Node qualifies.
- `scripts/verify.sh` (authored in Phase B, currently untouched per this phase's constraints) becomes a guarded artifact: changes to it are changes to the definition of "verified" and reviewed accordingly.
- Contributors never learn a CI-specific debugging workflow; "reproduce the failure" is always the same local command.

## Risks

- Single-job CI time grows with the codebase. Mitigation: verify.sh can parallelize internally (workspace-level concurrency) long before pipeline-level splitting is needed; ADR-0002's thresholds trigger the revisit.
- Convenience pressure to add "just one" CI-only step (artifact upload, notifications). Mitigation: the rule is bright-line — side effects that aren't verification belong in separate, clearly-labeled non-blocking jobs, and verification logic never leaves the script.

## Why This Fits Atlast

- **One-command verification** is a founding principle of the milestone plan; this ADR makes CI its mirror rather than a second, divergent authority.
- **Read-only philosophy:** a credential-free, deploy-free pipeline extends the product's core constraint to its own build system.
- **Boring and portable:** the least clever CI design available, immune to platform lock-in and pipeline-DSL churn.

## Conditions That Would Justify Changing This Decision

- Verification time exceeding the ADR-0002 thresholds with in-script parallelism exhausted — would justify pipeline-level fan-out *of the same script's steps*, keeping the source-of-truth rule.
- The team growing to a contributor volume where merge queues and required-review automation pay for themselves.
- Post-M5 introduction of deployment (its own ADR) — deployment pipelines would be added *alongside*, never inside, the verification contract, and this ADR would be amended to reference that boundary.
