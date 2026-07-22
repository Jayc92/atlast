# CLAUDE.md — AI Assistant Instructions for Atlast

Instructions for Claude (and any AI coding assistant) working in this repository. [GUARDRAILS.md](GUARDRAILS.md) is binding; this file tells you how to operate within it.

## What This Project Is

Atlast is an AI-powered Engineering Topology Platform: continuous system discovery, a living versioned dependency graph, operational health overlays, and change impact prediction. Read [PROJECT_SPEC.md](PROJECT_SPEC.md) for vision and scope, [docs/architecture.md](docs/architecture.md) for the conceptual design.

## Current Project State

**M0 Phase A — documentation only, pending human approval.** This repository contains draft documentation. There is no application code and no approved technology decisions; architectural positions are drafts requiring human approval and later ADRs.

The authorized milestone sequence ([docs/milestones.md](docs/milestones.md)) is synthetic-first:

- **M0** — Safe project foundation (TypeScript monorepo, web app + backend API shells, shared packages, automated lint/format/type-check/test/build/browser checks, `scripts/verify.sh`; synthetic data only)
- **M1** — Synthetic topology model (fixtures only; no real systems)
- **M2** — Interactive topology interface
- **M3** — Operational health overlays (synthetic states: healthy, degraded, down, disconnected, expiring certificate, latent downstream risk)
- **M4** — Change-impact simulation (deterministic before any LLM reasoning)
- **M5** — Read-only local Kubernetes connector (disposable local cluster such as Kind only — never an employer or production cluster)

Predictive AI, multi-cloud integrations, and multi-source enterprise reconciliation are post-M5 and unscheduled.

**Only M0 is authorized once the documentation is approved, and each later milestone requires its own explicit authorization. Until then, do NOT:**

- Scaffold applications or generate boilerplate (no `package.json`, framework init, Docker files, CI pipelines).
- Install or propose dependencies.
- Commit technology choices — tooling and storage selections are proposed as ADRs against the criteria in [docs/architecture.md § 6](docs/architecture.md#6-technology-selection-criteria-draft--human-approval-required) and require human approval.
- Write application or backend code.
- Modify `scripts/verify.sh`.
- Connect anything to a real system or handle real credentials — synthetic data only through M4; M5's only real target is a disposable local cluster.

When asked to do any of the above, point to this section and confirm the milestone gate has moved before proceeding.

## Hard Rules (from GUARDRAILS.md — never relax these)

1. **Scope is fixed by the spec.** Never implement anything that contradicts [PROJECT_SPEC.md § 7 Non-Goals](PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become): no monitoring/alerting features, no incident management workflow, no manual topology editing, and no executing deployments or remediation against observed systems, ever (advisory remediation *recommendations* are permitted as potential post-M5 scope).
2. **Read-only toward observed systems.** Never write code that mutates a system Atlast observes, and never design components that hold write-capable credentials to them.
3. **Provenance is mandatory.** Any code touching the graph model must preserve provenance, confidence, and freshness on every fact.
4. **No side doors.** Consumers (UI, AI engine, integrations) read the graph only through the query API.
5. **Explainability for AI features.** Any AI-driven analysis must cite its evidence; an unexplainable output is a defect.
6. **No secrets anywhere** — not in code, fixtures, docs, or examples.

## Conventions

- **Vocabulary:** use the domain language of [PROJECT_SPEC.md § 4](PROJECT_SPEC.md#4-core-concepts-domain-language) verbatim — Entity, Relationship, Evidence, Discovery source, Overlay, Snapshot, Impact query. No synonyms in model-layer code or docs.
- **Naming:** verbose, descriptive identifiers; full type annotations wherever the language supports them; comments explain *why*, not *what*.
- **Errors:** explicit handling only — no silent catch-alls, no empty-default returns on failure.
- **Determinism:** consume time, randomness, and I/O through injectable interfaces; all tests run against `fixtures/` with no live infrastructure.
- **Commits:** Conventional Commits (`docs:`, `feat:`, `fix:`, `test:`, `refactor:`, `chore:`), atomic, imperative, ≤ 72-char subject.
- **Docs:** single source of truth per fact — link, don't duplicate. Update affected docs in the same PR as the change. Significant decisions become ADRs in `docs/adr/`.

## Working Style

- Before changing anything, read the documents your change touches; keep the documentation set internally consistent (a contradiction between docs is a defect).
- Update [TASKS.md](TASKS.md) as work starts and completes — it is the only place in-flight work is tracked.
- Run `scripts/verify.sh` before declaring any change complete (once it has content).
- Flag security-sensitive or architecturally significant output explicitly for human review.
- If a request conflicts with these rules or GUARDRAILS.md, say so and ask — do not silently comply or silently refuse.

## Repository Map

```
README.md            Entry point and documentation map
PROJECT_SPEC.md      Vision, goals, principles, scope, non-goals (source of truth for scope)
TASKS.md             Active work breakdown
GUARDRAILS.md        Binding engineering standards
docs/architecture.md Architecture philosophy and conceptual design
docs/milestones.md   Authorized milestone sequence (M0–M5) with exit criteria
fixtures/            Synthetic test data (populated from M0 Phase B / M1)
scripts/             Dev tooling incl. verify.sh (populated in M0 Phase B)
tests/               Test suites (populated from M0 Phase B)
```
