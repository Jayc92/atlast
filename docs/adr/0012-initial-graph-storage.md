# ADR-0012: Initial Graph Storage Strategy (M0 only) — In-Process Model over Fixture Files, Behind a Repository Interface

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

Through M4 Atlast runs on synthetic data only; topologies are miniature fixtures ([GUARDRAILS.md § 5](../../GUARDRAILS.md#5-testing-philosophy)), and [architecture § 6](../architecture.md#6-technology-selection-criteria-draft--human-approval-required) explicitly anticipates that "in-process/synthetic-backed storage may suffice" through M1–M4 — while also noting that graph-storage evaluation must eventually weigh dedicated graph databases against relational modeling honestly. A standing constraint of this phase: **no graph database commitment yet**. The known project-killer to avoid: a current-state-only model with history bolted on later ([architecture § 5](../architecture.md#5-explicit-anti-patterns)).

## Problem

Provide storage for the M0 foundation that (a) carries the full model semantics — provenance, confidence, freshness, versioned snapshots — from the first commit, (b) requires zero infrastructure, and (c) defers the expensive, hard-to-reverse database decision until real query patterns exist to evaluate it against.

## Decision

**This decision is scoped to M0 only.** It does not commit M1–M4 to memory-only storage; the M1 storage question is explicitly reopened below.

- **Storage engine (M0): an in-process, in-memory model loaded from versioned fixture files** (JSON in `fixtures/`, validated by the shared domain schemas per ADR-0005). No database — graph, relational, or embedded — is adopted in M0.
- **Access exclusively through repository interfaces** defined in the shared domain package: an append-only `EvidenceStore` interface and a `TopologyGraphStore` interface whose read operations *require* as-of-time parameters and *return* provenance, confidence, and freshness. Consumers — including the query API implementation — depend only on these interfaces. This is the enforcement point for "no side doors."
- **The model is temporal from day one:** the repository contract carries snapshot and as-of-time semantics from its first version, so any storage implementation — this one or a successor — must satisfy an already-defined temporal contract rather than shape it.
- **Persistence at this stage is the fixture files themselves** — the graph is derived and rebuildable from evidence by design ([architecture § 1.1](../architecture.md#11-evidence-in-assertions-out)), so losing in-memory state loses nothing.
- **The M1 storage decision is mandatory and explicit:** M1 MUST decide, through a new ADR, whether to (a) retain the in-memory implementation for the synthetic milestones, or (b) introduce SQLite or PostgreSQL behind the same repository interfaces. Silently carrying this M0 arrangement forward is not an option. A dedicated graph database is not selected in either case until measured requirements (observed query patterns, scale, temporal-query performance) justify it.

## Alternatives Considered

- **SQLite (embedded) from M0** — the strongest alternative: real persistence, real query planning, zero server. Rejected *for M0* because it front-loads schema-migration machinery and SQL modeling decisions before the domain model has stabilized, and its benefits (durability, scale) address problems fixture-scale synthetic data does not have. It is a leading candidate, alongside PostgreSQL, in the mandatory M1 storage ADR.
- **A dedicated graph database (Neo4j, etc.) now** — explicitly prohibited this phase, and rightly: choosing one before the query API exists would let a vendor's query model shape our contract instead of the reverse; it also adds a server dependency, violating no-infrastructure.
- **Postgres now** — a production-grade answer to a question we haven't finished asking, plus local/CI infrastructure burden the milestone forbids.
- **Flat event-log files with on-boot replay as the *permanent* strategy** — attractive purity (evidence-first), but this ADR only needs to cover M0; committing to replay-only persistence long-term is a real storage decision that belongs to the M1 ADR's evaluation.

## Tradeoffs

- **Chosen:** zero infrastructure, perfectly deterministic tests, total freedom to iterate on the domain model while it is cheapest to change, and a storage-agnostic contract as the durable artifact.
- **Given up:** durability beyond fixture files (not needed — synthetic data is regenerable by definition), realistic performance signals (fixture-scale numbers say nothing about production storage anyway), and any early validation of a specific database's fit (deliberately deferred).

## Consequences

- The real storage decision lands at **M1, as its own mandatory ADR** choosing between retaining the in-memory implementation for the synthetic milestones or introducing SQLite/PostgreSQL behind the same interfaces — made with the domain model and repository contract in hand, a strictly better-informed decision.
- The repository interfaces become part of the core contract surface and get the contract-level test treatment (ADR-0009).
- Fixture design gains weight: fixtures must exercise conflicting evidence, staleness, and ambiguous identity from M1 so the interfaces are proven against the messy cases, not just the happy path.

## Risks

- **Interface leakage:** in-memory convenience (synchronous access, unbounded scans) can quietly bake assumptions into the interface that no real database can honor. Mitigation: repository methods are async from day one, and traversal operations take explicit bounds (depth, confidence floor) matching the query families in [architecture § 3.6](../architecture.md#36-query-api).
- **Deferral drift:** "later" becomes "never" and M4-scale features strain an in-memory model. Mitigation: the M1 storage ADR is mandatory (see Decision), and the M1 exit criteria already require graph/evidence representation ADRs — the decision has a scheduled forcing point.

## Why This Fits Atlast

- **Boring core, delayed commitment:** the most expensive-to-reverse decision in the system is made last, with the most information.
- **Time as a native dimension:** versioning lives in the model and its contract now — the anti-pattern of bolted-on history is structurally avoided regardless of the eventual database.
- **Synthetic-first and deterministic:** memory + fixtures is the only storage with literally zero nondeterminism and zero setup.

## Conditions That Would Justify Changing This Decision

- **Scheduled and mandatory:** the M1 storage ADR decides retain-in-memory vs. SQLite/PostgreSQL behind the same interfaces, superseding or extending this one — that is the intended lifecycle, not a failure of this decision.
- Fixture suites growing past what in-memory handling keeps fast within M0 itself (would pull the M1 evaluation earlier).
- A domain-model requirement emerging that cannot be expressed behind the repository interfaces (would mean the abstraction is wrong — fix it before choosing storage).
