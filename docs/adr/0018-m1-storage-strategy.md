# ADR-0018: M1 Storage Strategy — Retain Fixture-Backed In-Memory Storage Behind the Repository Interfaces

**Status:** Accepted
**Date:** 2026-07-23

> **Approval note (2026-07-23):** Accepted by human review as part of the **M1 architecture baseline**; this is the storage decision ADR-0012 made mandatory for M1. Acceptance settles the M1 storage choice only — it does **not** authorize implementation. M1 implementation requires a separate, explicit human authorization ([docs/milestones.md](../milestones.md)).

## Context

ADR-0012 (accepted) scoped in-memory fixture-backed storage to M0 and made this ADR mandatory: M1 MUST explicitly decide between retaining the in-memory implementation or introducing SQLite/PostgreSQL behind the same repository interfaces — silently carrying M0 forward is not an option, and a dedicated graph database is not selectable without measured requirements. M1 remains synthetic-only ([docs/milestones.md M1](../milestones.md#m1--synthetic-topology-model-gated)): miniature fixture topologies, deterministic CI, no live infrastructure ([GUARDRAILS.md § 5](../../GUARDRAILS.md#5-testing-philosophy)). The temporal contract (ADR-0016) and query surface (ADR-0017) define what storage must serve.

## Problem

Choose M1 storage honestly among four options — (1) retain fixture-backed in-memory, (2) SQLite behind the repository interfaces, (3) PostgreSQL behind the repository interfaces, (4) a dedicated graph database — against M1's actual requirements, without letting convenience defer the decision (prohibited) or ambition front-run measurement (also prohibited).

## Decision (proposed)

**Retain fixture-backed in-memory storage for M1, behind the ADR-0012 repository interfaces, as a deliberate re-decision** — not a silent carry-forward. Two binding additions distinguish this from M0's arrangement:

1. **The interfaces gain their full M1 contract**: subject and content-addressed GraphAssertion-revision reads pinned by (asOf, horizon, derivationVersion) identity — with the horizon as a `recordedSequence` watermark (ADR-0014/0016) — bounded traversal (ADR-0017), conflict/ambiguity retrieval (ADR-0015), and evidence-chain lookup — all async, all bounded, defined in `packages/shared` and covered by a **storage-agnostic contract-test suite** that any future implementation must pass unchanged. The contract tests, not the in-memory engine, are the durable artifact of this decision.
2. **A scheduled forcing point replaces open-ended deferral**: M2 planning MUST re-evaluate this decision against measured M2 interactive query patterns (the first real read-pressure signal), and the change conditions below name concrete triggers rather than "later."

Persistence remains the fixture files themselves: the evidence store loads validated fixtures; derived assertions and snapshots are computed (ADR-0016) — losing process state loses nothing, which at synthetic scale is a feature, not a gap.

**Evidence-retention horizon** (the open question assigned to this ADR's gate): at M1 synthetic scale the proposed answer is **full retention, no compaction** — fixtures are small by design, and any compaction scheme would complicate snapshot reproducibility (ADR-0016) for zero measured benefit. The retention question is re-opened by the same M2 forcing point, with data.

## Honest Evaluation of the Four Options

Criteria: temporal/as-of semantics · deterministic fixture-driven tests · migration/operational burden · recursive traversal · persistence requirements · CI complexity · interface leakage · reversibility · what M1 can actually measure.

### Option 1 — Retain fixture-backed in-memory (proposed)

- **Temporal fit:** interval and as-of computation over in-memory structures is straightforward and exactly as fast as M1 needs; ADR-0016's on-demand snapshots need no cache layer at fixture scale.
- **Determinism:** perfect — no I/O, no engine version, no platform variance; replay tests compare pure computation.
- **Migration/operational burden:** zero. No schema migrations while the domain model is at its most volatile — the strongest argument: M1 is precisely when assertion shapes will churn, and every churn under SQL would be a migration.
- **Recursive traversal:** native object traversal with explicit depth bounds; no recursive-query dialect to learn or test.
- **Persistence:** fixture files only — sufficient because synthetic data is regenerable by definition (ADR-0012).
- **CI:** unchanged from M0 — nothing to provision.
- **Interface leakage risk:** the real cost. In-memory convenience can bake unbounded-scan or synchronous assumptions into consumers. Mitigation is structural: interfaces stay async with mandatory bounds, and the contract-test suite is written storage-agnostically.
- **Reversibility:** highest of all options — nothing to migrate away from except code behind an interface.
- **What M1 can measure:** honestly, almost nothing about real storage — fixture-scale numbers say nothing about production engines (ADR-0012). No option changes this; options 2–4 would generate equally meaningless measurements at this scale, which is the core reason not to pay for them yet.

### Option 2 — SQLite behind the repository interfaces

- **Temporal fit:** good — interval queries express naturally in SQL; as-of reads are indexed range scans.
- **Determinism:** very good (single-file, in-process), with small caveats: engine version pinning across contributor platforms and CI, and SQL query-planner behavior joining the test surface.
- **Migration burden:** the real cost — schema migrations begin exactly when the domain model is least stable, and every ADR-0014 shape iteration becomes a migration plus data-shape translation between Zod schemas and relational rows.
- **Recursive traversal:** recursive CTEs work but bring dialect-specific behavior into contract tests.
- **CI:** near-zero added complexity (embedded).
- **Interface leakage:** lower risk than option 1 in one respect (SQL disciplines unbounded access) but adds a different leakage: SQL-shaped thinking creeping into the interface.
- **Reversibility:** good, but strictly worse than option 1 — there is now a schema and data files to migrate away from.
- **Verdict:** the strongest alternative. It buys durability M1 doesn't need, at the cost of migration machinery during peak model churn. It is the expected _successor_ when persistence pressure or data volume arrives — the contract-test suite is designed to make that adoption cheap.

### Option 3 — PostgreSQL behind the repository interfaces

- **Temporal fit:** excellent (range types, rich indexing) — capabilities M1 cannot exercise.
- **Determinism/CI:** materially worse — a server process in local dev and CI, provisioning, readiness ordering, version pinning; this directly contradicts the no-live-infrastructure testing rule and would be M1's largest single source of nondeterminism for zero functional gain over SQLite at this scale.
- **Operational burden:** highest of the non-graph options; also collides with ADR-0011's no-containers local runtime.
- **Verdict:** a production-grade answer to a question M1 is not asking (ADR-0012's phrasing still holds). Its evaluation belongs at the first milestone with real persistence or concurrency requirements.

### Option 4 — Dedicated graph database

- **Prohibited on standing grounds:** ADR-0012 and [architecture § 6](../architecture.md#6-technology-selection-criteria-draft--human-approval-required) require measured query patterns, scale, and temporal-performance requirements before this selection, and M1 has none — fixture-scale traversals cannot distinguish a graph engine from a hash map. Choosing one now would additionally let a vendor's query model shape the contract before ADR-0017's purpose-built surface has proven what queries actually matter.
- **Verdict:** excluded for M1 by unmet preconditions, not by prejudice; the criteria that would open this evaluation are recorded in [architecture § 6](../architecture.md#6-technology-selection-criteria-draft--human-approval-required) and below.

## Alternatives Considered

The four options above, evaluated per criterion. Strongest alternative: **SQLite (option 2)** — rejected for M1 because its concrete benefit (durable persistence) addresses no M1 requirement while its concrete cost (migration machinery during peak domain-model churn) lands on M1's critical path. Additionally considered: **append-only JSON log files with on-boot replay** as a middle path — rejected because it reimplements durability half-way (worst of both) and ADR-0016 already gets rebuild-from-fixtures for free.

## Tradeoffs

- **Chosen:** zero infrastructure and zero migrations while the model stabilizes; perfect determinism; the storage-agnostic contract-test suite as the durable artifact; highest reversibility.
- **Given up:** durability beyond fixtures (not needed — regenerable), realistic storage performance signal (unobtainable at this scale under any option), and early operational experience with the eventual engine (deliberately deferred to a milestone that can measure).

## Consequences

- The contract-test suite becomes the most important storage artifact in the repository: any future engine (SQLite first, per the expected path) must pass it unchanged before swap-in.
- M2 planning inherits a mandatory storage re-evaluation with the first interactive-load measurements.
- Full evidence retention keeps ADR-0016's snapshot reproducibility unconditional through M1.

## Risks

- **Deferral drift, round two.** ADR-0012 mitigated it with this mandatory ADR; this ADR mitigates it with the named M2 forcing point and concrete change conditions — deferral now has a review-visible trail rather than inertia.
- **Interface leakage** (carried from ADR-0012, still the top technical risk). Mitigation: async-only, bounds-mandatory interfaces plus storage-agnostic contract tests reviewed as contract changes.
- **A surprise M1 requirement needing real persistence** (e.g., fixture suites too large for memory). Considered implausible at miniature-topology scale; if it materializes, the change conditions trigger early re-evaluation rather than workarounds.

## Testable Invariants and Acceptance Evidence

1. The contract-test suite runs entirely against the repository interfaces with no import of the in-memory implementation's internals (storage-agnosticism proven by construction).
2. All ADR-0014/0015/0016 invariants (evidence-linked facts, conflict preservation, replay determinism, as-of correctness) pass through the repository interfaces, not just unit-level functions.
3. No repository interface method permits an unbounded read (schema/type-level bounds on every collection access).
4. Process restart plus fixture reload reproduces identical snapshots for every pinned (T, H, V) identity (persistence sufficiency at M1 scale).
5. CI requires no storage provisioning beyond the existing pnpm install.

**Acceptance evidence at review time:** this document, including the per-criterion evaluation above, plus the test strategy in [docs/m1-plan.md](../m1-plan.md).

## Dependencies on Other Proposed ADRs

- **ADR-0014** defines the shapes stored; its schema-versioning rule governs fixture evolution instead of database migrations.
- **ADR-0015/0016** define the computation whose determinism this storage must not perturb; ADR-0016's evidence-history/derived-state boundary is what makes "persistence = fixtures" sufficient.
- **ADR-0017** defines the read patterns (bounded traversal, as-of reads, evidence chains) the contract tests must cover.

## Why This Fits Atlast

- **Delay the expensive decision until it can be informed:** the most reversible option, chosen at the moment of least information, preserving every future path.
- **Determinism is non-negotiable:** the only option adding zero nondeterminism to CI.
- **Boring core:** no new technology at all is the most boring available choice — and per ADR-0012, the durable artifact (the contract) is what actually matters.

## Conditions That Would Justify Changing This Decision

- **Scheduled:** the M2 planning re-evaluation against measured interactive query patterns (mandatory, named above).
- Fixture suites or M2 interactive latency measurably exceeding in-memory comfort (concrete trigger for the SQLite evaluation).
- A committed requirement for durable state beyond regenerable fixtures (e.g., human annotations, when that mechanism is approved) — introduces the first data that is _not_ rebuildable, which changes the persistence calculus fundamentally.
- Measured traversal/temporal query patterns at M2+ scale that relational or graph engines demonstrably serve better — the evidence [architecture § 6](../architecture.md#6-technology-selection-criteria-draft--human-approval-required) requires before any graph-database evaluation.
