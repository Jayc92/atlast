# Atlast — Architecture

**Status:** Current. M0, M1, and M2 are implemented and complete; M2 closed through PR #52 at checkpoint `m2-complete`. Joseph Carfagno explicitly accepted ADRs 0029-0031 and approved [m3-plan.md](m3-plan.md) as the M3 implementation baseline on 2026-08-16 after independent review and correction. Baseline acceptance does not release M3-A; M3-A and M4+ remain gated. This document defines the architecture _philosophy_ and conceptual system shape; design positions bind only through human-approved ADRs in `docs/adr/`, and tooling choices require approval before use.

---

## 1. Architecture Philosophy

Six commitments shape every structural decision. They restate the guiding principles of [PROJECT_SPEC.md](../PROJECT_SPEC.md) as architectural consequences.

### 1.1 Evidence in, assertions out

Atlast is a pipeline from **raw observations** to **confident assertions**. Discovery sources emit immutable, timestamped _evidence_; a reconciliation layer aggregates evidence into graph _facts_ (entities and relationships) with computed confidence. Nothing enters the graph without evidence behind it, and every fact can be traced back to the observations that produced it.

Consequence: the evidence store and the graph are **separate concerns**. Evidence is append-only and dumb; the graph is derived and rebuildable. If reconciliation logic improves, the graph can be recomputed from retained evidence.

### 1.2 The graph is the core; everything else is a plugin or a view

There is exactly one non-negotiable component: the versioned dependency graph and its query interface. Discovery sources are **adapters** that feed it. Health overlays are **projections** onto it. The AI impact engine is a **consumer** of it. The UI is a **view** of it.

Consequence: the core must be stable and small; the edges of the system are where variety lives. Adding a discovery source, overlay, or analysis must never require modifying the core model — only conforming to its contracts.

### 1.3 Read-only, permanently

Atlast holds read credentials only. There is no code path — present or future — that mutates an observed system. This constraint is architectural, not procedural: components are not given write-capable clients, and the threat model assumes Atlast itself may be compromised, so it must be _incapable_ of causing changes, not merely _instructed_ not to.

### 1.4 Honest degradation

Every component must have a defined behavior for missing, stale, or conflicting input, and that behavior is always "degrade visibly," never "guess silently." Freshness and confidence are part of every read path's return type, not optional metadata.

### 1.5 Boring core, isolated intelligence

The graph, ingestion, and query layers use the most conservative technology that meets requirements — they are consulted during incidents and must out-survive the systems they map. AI capability is isolated in a distinct analysis layer that consumes the graph through the same API as everyone else. If the AI layer is down, the map still works. The AI layer can be ambitious _because_ the core is boring.

### 1.6 Time is a dimension, not an afterthought

Topology questions are frequently historical ("what changed before this incident?") or predictive ("what will this look like after the migration?"). The graph model is versioned from the first commit — retrofitting history onto a current-state-only model is a known project-killer.

---

## 2. Conceptual System Overview

The diagram shows the _target_ shape. Delivery is staged ([milestones.md](milestones.md)): through M4 the discovery layer is synthetic fixtures only; M5 adds one read-only local Kubernetes adapter; the remaining adapters and the predictive parts of the AI engine are post-M5.

```
        ┌──────────────────────────────────────────────────────────┐
        │                     DISCOVERY LAYER                      │
        │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
        │  │ Tracing  │ │ Cloud /  │ │ Config & │ │  Code &    │  │
        │  │ adapter  │ │ infra    │ │ network  │ │  deploy    │  │
        │  │          │ │ adapter  │ │ adapter  │ │  adapter   │  │
        │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
        └───────┼────────────┼────────────┼─────────────┼─────────┘
                ▼            ▼            ▼             ▼
        ┌──────────────────────────────────────────────────────────┐
        │              EVIDENCE STORE (append-only)                │
        └───────────────────────────┬──────────────────────────────┘
                                    ▼
        ┌──────────────────────────────────────────────────────────┐
        │   RECONCILIATION ENGINE                                  │
        │   identity resolution · confidence scoring · conflict    │
        │   handling · fact aging                                  │
        └───────────────────────────┬──────────────────────────────┘
                                    ▼
        ┌──────────────────────────────────────────────────────────┐
        │   TOPOLOGY GRAPH (versioned; entities + relationships,   │
        │   each with provenance, confidence, and freshness)       │
        └──────────┬─────────────────────────────────┬─────────────┘
                   ▼                                 │
        ┌────────────────────┐                       │
        │  OVERLAY LAYER     │                       │
        │  alerts · SLOs ·   │──── projections ─────►│
        │  incidents ·       │                       │
        │  deploys · owners  │                       │
        └────────────────────┘                       ▼
                              ┌──────────────────────────────────┐
                              │           QUERY API              │
                              │  (single read contract for all   │
                              │   consumers, incl. history)      │
                              └──────┬──────────────┬────────────┘
                                     ▼              ▼
                        ┌──────────────────┐  ┌──────────────────┐
                        │  AI IMPACT &     │  │  EXPLORATION UI  │
                        │  ANALYSIS ENGINE │  │  (graph views,   │
                        │  blast radius ·  │  │   health, search,│
                        │  risk scoring ·  │  │   impact results)│
                        │  fragility       │  └──────────────────┘
                        └──────────────────┘
```

## 3. Layer Responsibilities

### 3.1 Discovery layer

A set of independent **adapters**, one per signal type. Delivery is deliberately narrow: through M4 the only "source" is synthetic fixtures; the first real adapter is M5's read-only connector to a disposable local Kubernetes cluster, and further adapters (cloud APIs, tracing, config, code analysis) are post-M5. Each adapter:

- Speaks one external protocol (e.g., the Kubernetes API; later: tracing backends, cloud provider APIs, config repositories, deploy metadata, code analysis).
- Emits **evidence** in a single normalized format: _"at time T, source S observed indication of entity/relationship X, with source-native detail D."_
- Owns its own scheduling, rate limiting, and failure handling.
- Is individually deployable, disableable, and testable against fixtures (`fixtures/`).

Adapters never write to the graph directly and never see each other. The discovery contract is the system's most important extension point.

### 3.2 Evidence store

Append-only, immutable, timestamped observations. Design intent:

- Evidence is retained long enough to rebuild the graph and audit any fact's provenance.
- No business logic. Its only jobs are durability, ordering, and replay.

### 3.3 Reconciliation engine

The hardest problem in the system and the reason evidence and graph are separated. Full multi-source **enterprise** reconciliation is post-M5 work; through M5 the engine handles synthetic fixtures and a single real source, but its contracts are designed for the multi-source future from the start. Responsibilities:

- **Identity resolution** — deciding that "checkout-svc" in traces, "checkout" in the cloud inventory, and "svc-checkout" in deploy metadata are the same entity.
- **Confidence scoring** — combining corroborating evidence into a confidence value per fact; more independent sources → higher confidence.
- **Conflict handling** — when sources disagree, the graph records the conflict rather than silently picking a winner.
- **Fact aging** — facts without fresh supporting evidence age in freshness: their staleness classification degrades visibly as query time advances, while confidence tracks provenance only and changes solely when supporting evidence or reconciliation rules change ([ADR-0015](adr/0015-deterministic-identity-reconciliation.md)). Nothing is silently deleted — topology history is data.

### 3.4 Topology graph

The product's core asset. Model requirements:

- Typed entities and directed, typed relationships (vocabulary in [PROJECT_SPEC.md § 4](../PROJECT_SPEC.md#4-core-concepts-domain-language)).
- Every fact carries **provenance** (evidence links), **confidence**, and **freshness**.
- **Versioned**: any query can be asked "as of" a point in time; diffs between snapshots are first-class.
- Schema evolves additively; entity/relationship types are extensible without migration of the core.

### 3.5 Overlay layer

Projects operational state onto graph entities. Through M4, overlay state is **synthetic**, generated to cover at minimum: healthy, degraded, down, disconnected, expiring certificate, and latent downstream risk ([milestones.md M3](milestones.md#m3--operational-health-overlays-gated)). Real overlay sources (alerting, SLOs, incidents, deploys) are post-M5. Overlays:

- Are ephemeral or externally sourced — losing an overlay loses no topology.
- Never create or modify entities or relationships. An overlay referencing an unknown entity is a _signal_ for discovery, not a graph write.

### 3.6 Query API

The single read contract through which **every** consumer — UI, AI engine, external integrations — accesses the graph. Core query families:

- Inventory and search ("all databases owned by team X").
- Traversal ("everything downstream of Y, N hops, minimum confidence C").
- Time travel ("this subgraph as of last Tuesday"; "what changed since?").
- Health-in-context (topology joined with overlays).

There is deliberately no side door: if the AI engine needs a query the API can't express, the API grows — the AI never reaches around it.

### 3.7 AI impact & analysis engine

A consumer of the query API, isolated per § 1.5. Capabilities (in maturity order, matching [docs/milestones.md](milestones.md)):

1. **Deterministic change-impact simulation (M4)** — graph traversal with confidence-weighted ranking over synthetic topologies. No ML; this must exist and be validated as the explainable baseline **before any LLM-generated reasoning is added**. Any LLM use considered within M4 only explains deterministic results and requires human approval.
2. **Risk-scored impact prediction (post-M5, unscheduled)** — enriches traversal with change type, historical incident correlation, entity criticality, and deploy history.
3. **Fragility analysis (post-M5, unscheduled)** — SPOF detection, circular dependencies, unowned critical entities, drift between declared intent and observed reality.

Hard requirement carried from Principle 5: every output includes the evidence path and reasoning that produced it. A prediction the API cannot explain is a bug, not a feature.

### 3.8 Exploration UI

A view over the query API — graph navigation, search, health overlay toggles, impact-query results, and history playback. The UI holds no state the API cannot serve; anything the UI can display, an API consumer can fetch.

---

## 4. Cross-Cutting Concerns

- **Security.** Read-only credentials per adapter, scoped minimally (least privilege). The graph itself is sensitive — it is a map of the organization's attack surface — so the first externally reachable or real-system-connected query API requires authentication and authorization boundaries, governed by a separately approved authentication ADR. The M0 local API shell is exempt: it binds to localhost by default, serves synthetic data only, and implements no identity mechanism ([GUARDRAILS.md § 1.4](../GUARDRAILS.md#14-security)).
- **Multi-tenancy of trust.** Provenance answers "why should I believe this edge?" — treated as a security property, not just UX.
- **Operability.** Atlast instruments itself (freshness lag per source, reconciliation queue depth, query latency) and exposes those signals to _external_ monitoring — it never becomes its own monitoring system (see non-goals).
- **Determinism for tests.** All components consume time and randomness through injectable interfaces so fixture-driven tests are reproducible.

---

## 5. Explicit Anti-Patterns

Rejected designs, recorded so they are not re-litigated:

- **Writing discovery output directly into the graph.** Skipping the evidence layer destroys provenance, rebuildability, and conflict handling.
- **A current-state-only graph with history bolted on later.** Versioning must be native to the model.
- **The UI or AI engine querying storage directly.** All reads go through the query API.
- **Manual topology editing.** Humans annotate (ownership, notes, criticality labels); they never author entities or relationships.
- **A monolithic "collector" that speaks every protocol.** One adapter per signal, isolated failure domains.

---

## 6. Technology Selection Criteria (draft — human approval required)

The one settled direction is a **TypeScript monorepo** containing a web application, a backend API, and shared packages, established in M0 Phase B. Everything else below is a _criterion_, not a decision: each concrete choice is proposed as an ADR in `docs/adr/` and requires human approval before use (see [GUARDRAILS.md](../GUARDRAILS.md)).

1. **M0 tooling** — linting, formatting, type checking, test runner, build, and browser acceptance checks: prefer the most boring, widely supported option in the TypeScript ecosystem; all wired into `scripts/verify.sh` as the single entry point.
2. **Graph storage** — must support typed property graphs, temporal/versioned queries (natively or via modeling), and horizontal read scaling. Evaluate dedicated graph databases against relational modeling honestly; choose the most boring option that meets the temporal requirement. (Through M1–M4, in-process/synthetic-backed storage may suffice — that too is an ADR.)
3. **Evidence store** — append-only, high-write, replayable. Log/stream-oriented storage is the natural shape.
4. **AI components (post-M5)** — the model/provider must expose enough reasoning structure to satisfy explainability. A capability that cannot cite evidence fails the bar regardless of accuracy.

---

## 7. Open Questions

Tracked here until resolved into ADRs. Each question has an assigned owner and a decision gate — the ADR in which it must be resolved. Ownership is accountability for producing that ADR when its milestone is authorized; it is **not** approval of any particular answer, which still requires the ADR's own human review. The three M1-gated questions were **resolved 2026-07-23** by the Accepted M1 planning ADRs ([docs/m1-plan.md](m1-plan.md)); the M4 question remains open.

| Open question                                                                                                                                          | Owner                                | Decision gate           | Resolution                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity resolution strategy: rules-first with ML assist, or probabilistic from the start? (Leaning rules-first for explainability.)                   | Joseph Carfagno — Founder/Maintainer | M1 graph/evidence ADR   | **Resolved** — [ADR-0015](adr/0015-deterministic-identity-reconciliation.md) (Accepted 2026-07-23): rules-first, deterministic, no ML in M1               |
| Evidence retention horizon: full history vs. rolling window with snapshot compaction?                                                                  | Joseph Carfagno — Founder/Maintainer | M1 storage/evidence ADR | **Resolved for M1** — [ADR-0018](adr/0018-m1-storage-strategy.md) (Accepted 2026-07-23): full retention, no compaction; re-opened at the M2 forcing point |
| Graph query surface: expose a standard graph query language, a purpose-built API, or both?                                                             | Joseph Carfagno — Founder/Maintainer | M1 query API ADR        | **Resolved** — [ADR-0017](adr/0017-m1-query-api-surface.md) (Accepted 2026-07-23): purpose-built bounded REST; query languages deferred                   |
| How is prediction accuracy measured before real incident data accumulates? (Candidate: retrospective replay against historical incidents in fixtures.) | Joseph Carfagno — Founder/Maintainer | M4 planning ADR         | Open — M4 planning not begun                                                                                                                              |
