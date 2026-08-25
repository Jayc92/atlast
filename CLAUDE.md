# CLAUDE.md — AI Assistant Instructions for Atlast

Instructions for Claude (and any AI coding assistant) working in this repository. [GUARDRAILS.md](GUARDRAILS.md) is binding; this file tells you how to operate within it.

## What This Project Is

Atlast is an AI-powered Engineering Topology Platform: continuous system discovery, a living versioned dependency graph, operational health overlays, and change impact prediction. Read [PROJECT_SPEC.md](PROJECT_SPEC.md) for vision and scope, [docs/architecture.md](docs/architecture.md) for the conceptual design.

## Current Project State

**M0 through M5 are complete.** M4-E's boundary re-audit, enforcement fix, and factual measurements merged through PR #82 and PR #83; checkpoint `m4-complete` formally closed M4. M5 — the read-only local Kubernetes connector — was subsequently authorized and implemented (M5-A live ingestion, PR #89; the source-loss freshness proof, PR #91), and closed after the mandatory ADR-0018 storage reassessment: condition 2 fired on the real M5 workload and was resolved by [ADR-0038](docs/adr/0038-m5-reconciliation-scaling-remedy.md)'s reconciliation-algorithm remedy (PRs #92–#95), not a storage-engine change. **All three M5 exit criteria and all four M5 verification obligations evaluated PASS. Checkpoint `m5-complete` formally closes M5.** See [TASKS.md](TASKS.md), [HANDOFF.md](HANDOFF.md), and [docs/milestones.md](docs/milestones.md).

Permitted work right now, and nothing beyond it:

- **Maintenance and corrections to the completed M0 foundation and the merged, formally complete S1–S8 slices** (bug fixes, documentation fixes, dependency/security maintenance within the accepted ADRs) — the S1/S2 contract surface, S3 fixture catalog, S4 temporal foundations, S5 reconciliation engine, S6 snapshot layer and in-memory repositories, S7 query API v1 routes and error contract in `apps/api`, and S8's boundary re-audit, exhaustive API traceability test, and documentation closeout.
- **Maintenance of the approved M1 planning documents** (corrections and review responses to [docs/m1-plan.md](docs/m1-plan.md) and ADRs 0014–0025) and of the checkpoint documentation ([HANDOFF.md](HANDOFF.md), per the checkpoint protocol below).
- **Maintenance and corrections to completed M2 and M3 work** within accepted ADRs 0026-0031 and without extending product behavior.
- **Maintenance and factual checkpoint documentation for completed M4-A through M4-E** within accepted ADRs 0032-0035 and without extending product behavior.
- **Maintenance and factual checkpoint documentation for completed M5** (M5-A live ingestion, the source-loss freshness proof, and the ADR-0018/ADR-0038 storage-decision reassessment) within accepted ADRs 0036-0038 and without extending product behavior.
- **Checkpoint documentation maintenance** that keeps merged facts, verification evidence, and milestone gates accurate.

**M0 through M5 are complete. M5-B and M5-C were not required for M5 closure, were not authorized, and remain unimplemented, deferred future-expansion proposals. Post-M5 work — including M5-B, M5-C, and every later milestone — remains unauthorized**, with one narrow exception recorded here for accuracy: **Joseph Carfagno has explicitly accepted the complete M6 architecture/product baseline** — [docs/m6-plan.md](docs/m6-plan.md) plus ADR-0039, ADR-0040, and ADR-0041 — after both an adversarial review and a genuinely independent final review found no substantive blocker (ADR-0042 was drafted and rejected, folded into [docs/m6-plan.md § 8](docs/m6-plan.md#8-connectscan-experience); it is historical record only, not part of the accepted set). **This acceptance authorizes NO M6 implementation, no expansion of the M5 real-system safety boundary, and no M6-A/B/C activation** — implementation still requires this acceptance record to merge, local `main` to synchronize cleanly, and a separate, explicit human authorization of M6-A specifically, exactly as every prior milestone's first slice required.

The authorized milestone sequence ([docs/milestones.md](docs/milestones.md)) is synthetic-first:

- **M0** — Safe project foundation (TypeScript monorepo, web app + backend API shells, shared packages, automated lint/format/type-check/test/build/browser checks, `scripts/verify.sh`; synthetic data only)
- **M1** — Synthetic topology model (fixtures only; no real systems)
- **M2** — Interactive topology interface
- **M3** — Operational health overlays (synthetic states: healthy, degraded, down, disconnected, expiring certificate, latent downstream risk)
- **M4** — Change-impact simulation (deterministic before any LLM reasoning)
- **M5** — Read-only local Kubernetes connector (disposable local cluster such as Kind only — never an employer or production cluster)

Predictive AI, multi-cloud integrations, and multi-source enterprise reconciliation are post-M5 and unscheduled.

**M0 through M5 are complete; checkpoint `m5-complete` is the current project boundary:**

- Maintenance, corrections, and explicitly released slice work are permitted, but only using the technologies the accepted ADRs name — dependencies beyond them still require justification and, if significant, a new ADR (Zod, named by accepted ADR-0005, was introduced in S1 with its justification-at-PR).
- **M1 through M5 are formally complete and merged.** Do NOT plan or implement M5-B, M5-C, or any post-M5 work without separate explicit authorization.
- Do NOT commit new technology choices outside the accepted ADRs — proposals go through ADRs against [docs/architecture.md § 6](docs/architecture.md#6-technology-selection-criteria-draft--human-approval-required) and require human approval.
- Do NOT connect anything to a real system or handle real credentials — M5's completed connector targeted only a disposable local cluster (now deleted); no further real-system connection is authorized until a future milestone is separately authorized.

When asked to do any of the above, point to this section and confirm the milestone gate has moved before proceeding.

## Hard Rules (from GUARDRAILS.md — never relax these)

1. **Scope is fixed by the spec.** Never implement anything that contradicts [PROJECT_SPEC.md § 7 Non-Goals](PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become): no monitoring/alerting features, no incident management workflow, no manual topology editing, and no executing deployments or remediation against observed systems, ever (advisory remediation _recommendations_ are permitted as potential post-M5 scope).
2. **Read-only toward observed systems.** Never write code that mutates a system Atlast observes, and never design components that hold write-capable credentials to them.
3. **Provenance is mandatory.** Any code touching the graph model must preserve provenance, confidence, and freshness on every fact.
4. **No side doors.** Consumers (UI, AI engine, integrations) read the graph only through the query API.
5. **Explainability for AI features.** Any AI-driven analysis must cite its evidence; an unexplainable output is a defect.
6. **No secrets anywhere** — not in code, fixtures, docs, or examples.

## Conventions

- **Vocabulary:** use the domain language of [PROJECT_SPEC.md § 4](PROJECT_SPEC.md#4-core-concepts-domain-language) verbatim — Entity, Relationship, Evidence, Discovery source, Overlay, Snapshot, Impact query. No synonyms in model-layer code or docs.
- **Naming:** verbose, descriptive identifiers; full type annotations wherever the language supports them; comments explain _why_, not _what_.
- **Errors:** explicit handling only — no silent catch-alls, no empty-default returns on failure.
- **Determinism:** consume time, randomness, and I/O through injectable interfaces; all tests run against `fixtures/` with no live infrastructure.
- **Commits:** Conventional Commits (`docs:`, `feat:`, `fix:`, `test:`, `refactor:`, `chore:`), atomic, imperative, ≤ 72-char subject.
- **Docs:** single source of truth per fact — link, don't duplicate. Update affected docs in the same PR as the change. Significant decisions become ADRs in `docs/adr/`.

## Working Style

- Before changing anything, read the documents your change touches; keep the documentation set internally consistent (a contradiction between docs is a defect).
- Update [TASKS.md](TASKS.md) as work starts and completes — it is the only place in-flight work is tracked.
- **Checkpoint protocol:** [HANDOFF.md](HANDOFF.md) is the canonical, model-neutral checkpoint and resume document. It MUST be updated after every merged slice or checkpoint and before the next slice is released. A checkpoint is not closed and the next slice is not released until: (1) the preceding PR is merged; (2) `main` is synchronized with `origin/main` and the working tree is clean; (3) verification status (local `scripts/verify.sh` and GitHub CI) is recorded; (4) HANDOFF.md reflects the merged repository state; and (5) the next slice receives explicit human authorization recorded in TASKS.md. HANDOFF.md summarizes and never overrides the source-of-truth documents; where they conflict, the source documents win.
- `scripts/verify.sh` is the required completion gate: run it and see it pass before declaring any change complete.
- `scripts/verify.sh` is a protected verification contract ([ADR-0013](docs/adr/0013-ci-philosophy.md)): once its initial population is reviewed and committed, it defines what "verified" means for this repository. Never weaken, skip, rename, or remove its checks, and never edit it merely to make a failure pass — fix the code instead. Changes to the script are changes to the definition of "verified" and require their own explicit human review.
- Flag security-sensitive or architecturally significant output explicitly for human review.
- If a request conflicts with these rules or GUARDRAILS.md, say so and ask — do not silently comply or silently refuse.

## Repository Map

```
README.md            Entry point and documentation map
PROJECT_SPEC.md      Vision, goals, principles, scope, non-goals (source of truth for scope)
TASKS.md             Active work breakdown
HANDOFF.md           Canonical checkpoint and model-neutral handoff document
GUARDRAILS.md        Binding engineering standards
docs/architecture.md Architecture philosophy and conceptual design
docs/milestones.md   Authorized milestone sequence (M0–M5) with exit criteria
fixtures/            Synthetic test data (the M1 Slice S3 catalog in fixtures/demo-company/ — merged via PR #13, 2026-07-30)
scripts/             Dev tooling incl. verify.sh
tests/               Test suites (browser acceptance in tests/acceptance)
```
