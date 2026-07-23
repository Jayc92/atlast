# CLAUDE.md — AI Assistant Instructions for Atlast

Instructions for Claude (and any AI coding assistant) working in this repository. [GUARDRAILS.md](GUARDRAILS.md) is binding; this file tells you how to operate within it.

## What This Project Is

Atlast is an AI-powered Engineering Topology Platform: continuous system discovery, a living versioned dependency graph, operational health overlays, and change impact prediction. Read [PROJECT_SPEC.md](PROJECT_SPEC.md) for vision and scope, [docs/architecture.md](docs/architecture.md) for the conceptual design.

## Current Project State

**M0 complete (2026-07-22). M1 plan approved and ADRs 0014–0018 Accepted (2026-07-23); M1 implementation NOT authorized.** The documentation set is approved, the M0 tooling ADRs (0001–0013 in [docs/adr/](docs/adr/README.md)) are formally Accepted, and the full M0 foundation exists and passes CI: the monorepo workspace, the backend API shell (`apps/api`), the web application shell (`apps/web`), the shared package shells (`packages/*`), the browser acceptance suite (`tests/acceptance`), the verification tooling (`scripts/bootstrap.sh`, `scripts/verify.sh`), and the GitHub Actions workflow that runs it. The M1 architecture baseline is settled: [docs/m1-plan.md](docs/m1-plan.md) is approved and ADRs 0014–0018 are Accepted. See [TASKS.md](TASKS.md) for exact per-task status.

Permitted work right now, and nothing beyond it:

- **Maintenance and corrections to the completed M0 foundation** (bug fixes, documentation fixes, dependency/security maintenance within the accepted ADRs).
- **Maintenance of the approved M1 planning documents** (corrections and review responses to [docs/m1-plan.md](docs/m1-plan.md) and ADRs 0014–0018). Planning maintenance never writes domain code, fixtures, schemas, API routes, tests, or migrations.

**All M1 implementation is prohibited until a human explicitly authorizes it** — plan approval and ADR acceptance settle _what_ M1 will be; they are not the authorization to build it. When that authorization is given, it is recorded in TASKS.md and docs/milestones.md. M2+ milestones each remain gated on their own explicit authorization.

The authorized milestone sequence ([docs/milestones.md](docs/milestones.md)) is synthetic-first:

- **M0** — Safe project foundation (TypeScript monorepo, web app + backend API shells, shared packages, automated lint/format/type-check/test/build/browser checks, `scripts/verify.sh`; synthetic data only)
- **M1** — Synthetic topology model (fixtures only; no real systems)
- **M2** — Interactive topology interface
- **M3** — Operational health overlays (synthetic states: healthy, degraded, down, disconnected, expiring certificate, latent downstream risk)
- **M4** — Change-impact simulation (deterministic before any LLM reasoning)
- **M5** — Read-only local Kubernetes connector (disposable local cluster such as Kind only — never an employer or production cluster)

Predictive AI, multi-cloud integrations, and multi-source enterprise reconciliation are post-M5 and unscheduled.

**M0 is complete and no later milestone is authorized; each requires its own explicit authorization. Within that gate:**

- Maintenance and corrections to the completed M0 foundation are permitted, but only using the technologies the accepted ADRs name — dependencies beyond them still require justification and, if significant, a new ADR.
- Do NOT implement M1+ features (topology model, query API v1, exploration UI, overlays, impact simulation, connectors) before their milestone is authorized.
- Do NOT commit new technology choices outside the accepted ADRs — proposals go through ADRs against [docs/architecture.md § 6](docs/architecture.md#6-technology-selection-criteria-draft--human-approval-required) and require human approval.
- Do NOT connect anything to a real system or handle real credentials — synthetic data only through M4; M5's only real target is a disposable local cluster.

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
- `scripts/verify.sh` is the required completion gate: run it and see it pass before declaring any change complete.
- `scripts/verify.sh` is a protected verification contract ([ADR-0013](docs/adr/0013-ci-philosophy.md)): once its initial population is reviewed and committed, it defines what "verified" means for this repository. Never weaken, skip, rename, or remove its checks, and never edit it merely to make a failure pass — fix the code instead. Changes to the script are changes to the definition of "verified" and require their own explicit human review.
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
fixtures/            Synthetic test data (population gated on M1 authorization)
scripts/             Dev tooling incl. verify.sh
tests/               Test suites (browser acceptance in tests/acceptance)
```
