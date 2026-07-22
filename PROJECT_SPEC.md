# Atlast — Project Specification

**Version:** 0.2.0 (pre-implementation)
**Date:** 2026-07-21
**Status:** Draft — pending human approval. This document defines intent before implementation; architectural positions referenced here are drafts requiring later ADRs, not final decisions.

---

## 1. Vision

### 1.1 The Problem

Modern engineering organizations run hundreds or thousands of interconnected systems. The knowledge of *what exists*, *how it connects*, and *what happens when it changes* is scattered across stale wikis, tribal memory, and half-maintained service catalogs. This produces three chronic, expensive failure modes:

- **Blind changes.** Engineers modify or decommission systems without knowing who depends on them. Outages follow.
- **Slow incidents.** During an incident, responders spend the first critical minutes reconstructing topology instead of fixing the problem.
- **Frozen architecture.** When impact is unknowable, the rational response is to change nothing. Technical debt compounds because nobody can prove a migration is safe.

### 1.2 The Vision

Atlast is the **continuously accurate, machine-derived map of an engineering organization** — a living dependency graph that observes reality, overlays operational health, and answers the question every engineer asks before every change:

> *"If I change this, what breaks?"*

The long-term ambition, in order of increasing capability:

1. **See** — a complete, always-current inventory and dependency graph, derived from observation rather than declaration.
2. **Understand** — operational health, ownership, criticality, and change history projected onto that graph.
3. **Predict** — AI-driven blast-radius analysis and risk scoring for proposed changes, grounded in the graph and historical outcomes.
4. **Advise** — proactive identification of fragility: single points of failure, circular dependencies, unowned critical systems, and drift between intended and actual architecture.

Atlast succeeds when impact analysis stops being a meeting and becomes a query.

### 1.3 Who It Serves

| Audience | Primary need |
|---|---|
| Engineers making changes | "What is the blast radius of this change?" |
| Incident responders | "What is upstream/downstream of the failing system, right now?" |
| Platform & SRE teams | "Where is our architecture fragile?" |
| Engineering leadership | "What do we actually run, who owns it, and how healthy is it?" |

---

## 2. Goals

### 2.1 Product Goals

- **G1 — Truthful inventory.** Discover and maintain a system inventory whose accuracy is measured against observed reality, not manual attestation.
- **G2 — Living graph.** Represent dependencies as a versioned graph that updates automatically as systems change, with full history ("what did the topology look like last Tuesday?").
- **G3 — Health in context.** Overlay operational signals (alerts, SLOs, incidents, deployments) onto topology so health is never viewed without its dependency context.
- **G4 — Predictive impact.** For a proposed change, produce a ranked, explainable blast-radius prediction with confidence levels.
- **G5 — Explainability.** Every edge in the graph and every prediction must be traceable to its evidence. No unexplainable assertions.

### 2.2 Engineering Goals

- **E1 — Evidence-first data model.** Every fact in the graph carries provenance: what observed it, when, and with what confidence.
- **E2 — Pluggable discovery.** Discovery sources (tracing, network, config, code, cloud APIs) are independent adapters behind a common contract. Adding a source never requires touching the core.
- **E3 — Graceful degradation.** Partial data produces a partial-but-honest graph, never a wrong one. Confidence is always surfaced.
- **E4 — Boring reliability.** Atlast is consulted during incidents; it must be dramatically simpler and more reliable than the systems it maps.
- **E5 — Testable from day one.** Every component is testable against fixtures without live infrastructure (see `fixtures/`).

### 2.3 Success Criteria (long-term)

- Graph accuracy: independently audited dependency edges are ≥ 95% correct.
- Freshness: topology reflects a real-world change within minutes, not days.
- Adoption signal: engineers consult Atlast *before* changes, not only during postmortems.
- Prediction value: predicted blast radius demonstrably overlaps actual incident impact.

---

## 3. Guiding Principles

These principles resolve design disputes. When two options conflict, the principle wins.

1. **Observed truth over declared truth.** The graph is derived from evidence (traffic, config, deploys, code). Human declarations are annotations on the graph, never its source of record.
2. **Confidence is a first-class value.** Atlast says "probably" when it means probably. Every fact carries confidence and provenance; the UI and API always expose them.
3. **Read-only by design.** Atlast observes and advises. It never mutates the systems it maps. This is a permanent architectural constraint, not a phase-one limitation.
4. **The graph is the product.** Every feature is a view, overlay, or query on the graph. If a feature can't be expressed in terms of the graph, it belongs in another product.
5. **Explainable AI or no AI.** AI features must show their reasoning and evidence. A prediction that can't be interrogated is worse than no prediction.
6. **Incremental usefulness.** Atlast must be valuable with one discovery source and ten systems, and scale to dozens of sources and thousands of systems. No big-bang value cliff.
7. **Simplicity over completeness.** A smaller, correct, understandable model beats a comprehensive one nobody trusts. Prefer deleting features to complicating the core.
8. **Fail honest.** When discovery is stale, degraded, or conflicting, Atlast surfaces that state prominently. A confidently wrong map is the worst possible outcome.

---

## 4. Core Concepts (Domain Language)

Consistent vocabulary for all documentation, code, and discussion:

- **Entity** — anything Atlast tracks: a service, database, queue, scheduled job, external SaaS dependency, load balancer, etc. Entities have a type, identity, and lifecycle.
- **Relationship (edge)** — a directed, typed connection between entities (e.g., `calls`, `reads-from`, `publishes-to`, `deployed-on`), with provenance and confidence.
- **Evidence** — an observation supporting an entity or relationship: a trace span, a config reference, a connection log, a code import. Evidence is immutable and timestamped.
- **Discovery source** — an adapter that produces evidence from an external signal (tracing backend, cloud API, service config, repository analysis).
- **Overlay** — a projection of external state (alerts, SLOs, incidents, deploys, ownership) onto graph entities. Overlays never alter topology.
- **Snapshot** — the state of the graph at a point in time. The graph is versioned; history is queryable.
- **Impact query** — a question of the form "if entity X changes in way Y, what is affected?" answered with a ranked, evidence-linked result set.

---

## 5. Scope

### 5.1 In Scope

- Continuous, multi-source discovery of entities and relationships.
- Versioned dependency graph with provenance, confidence, and time-travel queries.
- Operational health overlays from existing monitoring/incident/deploy tooling.
- Change impact prediction and blast-radius analysis.
- Fragility analysis: single points of failure, unowned criticals, drift detection.
- A query API and a visual graph exploration interface.

**Staging note.** Delivery is deliberately synthetic-first ([docs/milestones.md](docs/milestones.md)): M0–M4 build the foundation, topology model, interactive interface, health overlays, and deterministic change-impact simulation entirely on synthetic data; M5 adds a single read-only connector to a disposable local Kubernetes cluster. Predictive AI, multi-cloud integrations, and multi-source enterprise reconciliation are post-M5 and unscheduled.

### 5.2 Out of Scope (see § 7 for the permanent list)

- Producing alerts, collecting metrics, or paging anyone.
- Executing deployments, remediations, or any mutation of observed systems.
- Being a manually curated system of record.

---

## 6. Constraints & Assumptions

- **Constraint:** Atlast requires only read access to the signals it consumes. Any design requiring write access to observed systems is rejected by definition.
- **Constraint:** All discovery must be resilient to source outage — a dead source degrades freshness, never correctness of already-established facts (which age visibly).
- **Assumption:** Organizations adopting Atlast already have at least one machine-readable signal (tracing, cloud API, structured config, or deploy metadata).
- **Constraint:** Through M0–M4, Atlast runs on **synthetic data only** — no connection to, or credentials for, any real system. The first real-system contact is M5's read-only connector to a disposable local Kubernetes cluster; connecting to an employer, shared, or production cluster is out of scope without an explicit, human-approved spec amendment.
- **Assumption:** The core stack is TypeScript (monorepo with a web application, backend API, and shared packages), established in M0 Phase B. Specific tooling and storage choices are **draft positions requiring human approval and ADRs** — nothing beyond the TypeScript-monorepo direction is decided by this spec.

---

## 7. Non-Goals — What Atlast Will NOT Become

These are permanent boundaries, not deferred features. Each exists to protect the core product.

| Non-goal | Why it is excluded |
|---|---|
| **A monitoring/observability platform** | Atlast consumes health signals; it never produces them. Building collection competes with the tools it must integrate with, and bloats the core. |
| **An incident management tool** | Atlast informs responders with topology and impact context. Paging, escalation, and incident workflow belong to dedicated tools. |
| **A hand-edited CMDB** | Manual curation is precisely the failure mode Atlast replaces. Humans annotate; they never author topology. |
| **A deployment or orchestration platform** | Read-only is a founding constraint (Principle 3). Atlast predicts impact; it never applies changes. |
| **An autonomous remediation engine** | Permanent exclusion, by human decision. Atlast MAY (post-M5, if scheduled) *recommend* or *generate* remediation plans as advisory output, but it MUST NOT execute changes against observed systems or hold write-capable credentials — ever. "AI-powered" means AI-assisted analysis and recommendation, never action. |
| **A general-purpose data warehouse or BI tool** | Atlast answers topology and impact questions. Arbitrary analytics on ingested data is scope creep away from the graph. |
| **A security scanner / compliance auditor** | Topology data may *inform* security tooling via the API, but vulnerability scanning and compliance workflows are separate products. |
| **A code-quality or static-analysis product** | Code is read only as a discovery signal for dependencies, never to judge or lint it. |

**The test for scope creep:** if a proposed feature would still make sense with the dependency graph removed, it does not belong in Atlast.

---

## 8. Risks (Initial Register)

| Risk | Impact | Mitigation direction |
|---|---|---|
| Graph accuracy insufficient to earn trust | Adoption failure — one wrong answer costs ten right ones | Evidence-first model, visible confidence, accuracy measured against synthetic fixtures from M1 |
| Real-system contact before the core is proven | Fragile foundation, unearned risk | Synthetic-first sequencing: M0–M4 on fixtures only; a single read-only local connector arrives at M5 |
| AI predictions perceived as a black box | Predictions ignored or, worse, blindly trusted | Explainability is a hard requirement (Principle 5), not a polish item |
| Scope creep toward monitoring/CMDB/deployment | Identity loss, unbounded surface | § 7 non-goals + the scope-creep test, enforced in review |
| Stale data presented as current | Confidently wrong map — the worst failure mode | Freshness metadata on every fact; visible degradation (Principle 8) |

---

## 9. Related Documents

- [docs/architecture.md](docs/architecture.md) — architecture philosophy and conceptual design
- [docs/milestones.md](docs/milestones.md) — phased delivery plan
- [TASKS.md](TASKS.md) — active work breakdown
- [GUARDRAILS.md](GUARDRAILS.md) — engineering and repository standards
- [CLAUDE.md](CLAUDE.md) — AI assistant working instructions
