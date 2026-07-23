# ADR-0014: Core Topology Domain Model — Stable Subjects, Content-Addressed Assertion Revisions, Mandatory Provenance, Confidence, and Freshness

**Status:** Accepted
**Date:** 2026-07-23

> **Approval note (2026-07-23):** Accepted by human review as part of the **M1 architecture baseline**. Acceptance settles the M1 domain-model design only — it does **not** authorize implementation. M1 implementation requires a separate, explicit human authorization ([docs/milestones.md](../milestones.md)).

## Context

M1's goal is the core domain — entities, relationships, evidence, provenance, confidence, freshness, snapshots — modeled and queryable, driven entirely by synthetic fixtures ([docs/milestones.md M1](../milestones.md#m1--synthetic-topology-model-gated)). The vocabulary is fixed by [PROJECT_SPEC.md § 4](../../PROJECT_SPEC.md#4-core-concepts-domain-language) and must be used verbatim. [Architecture § 1.1](../architecture.md#11-evidence-in-assertions-out) mandates the evidence-in/assertions-out pipeline; [GUARDRAILS.md § 1.2](../../GUARDRAILS.md#12-evidence-and-honesty-requirements) makes provenance, confidence, and freshness mandatory on every fact. ADR-0005 (accepted) fixes the mechanism: Zod schemas in a shared package as the single source of truth for shapes; ADR-0012 (accepted) fixes the access pattern: repository interfaces with temporal semantics from the first version.

## Problem

Define the exact conceptual boundaries among Entity, Relationship, Evidence, graph assertion, provenance, confidence, freshness, and Snapshot — precisely enough that the future schemas, stores, and query API can be reviewed against this document, and strictly enough that no fact can exist without evidence, no conflict can be silently resolved, and no history can be destructively lost.

## Decision (proposed)

### Concept boundaries

The model separates **stable subjects** (what a claim is about) from **assertions** (the evidence-derived claims about them):

- **Evidence** is an immutable, timestamped observation: _"at observation time T, discovery source S observed indication of entity or relationship X, with source-native detail D."_ Evidence is never updated or deleted, carries a stable unique identifier, and is the only input from which the graph may be derived. In M1 all Evidence comes from synthetic fixtures.
- An **Entity** is a **stable graph subject** with a stable identifier: a typed, identified thing Atlast tracks (service, database, queue, scheduled job, etc.). The Entity subject record carries only identity and type — everything else Atlast believes about it lives in assertions.
- A **Relationship** is a **stable graph subject** with a stable identifier: a **directed, typed** connection referencing exactly two **stable endpoint Entity identifiers** (e.g., `calls`, `reads-from`, `publishes-to`, `deployed-on`), never free-standing.
- A **GraphAssertion** is an **immutable, content-addressed, evidence-derived revision** of a claim about one subject, produced by reconciliation (ADR-0015). Its identifier is **deterministic from its content**: the derivation version, the subject identifier, the canonical claim, the validity interval as known at the pinned evidence horizon, the sorted provenance Evidence identifiers, the rule trace, and the conflict/ambiguity state. Two revisions with identical content have identical identifiers; any difference in that content is, by definition, a different revision with a different identifier.
- **Assertion revisions are never mutated.** When later Evidence adds provenance, changes confidence, closes a validity interval, or changes conflict/ambiguity state, reconciliation produces a **new assertion revision with a new identifier**; the earlier revision remains exactly as it was and stays reproducible through every snapshot horizon that pinned it (ADR-0016). The evolving belief about a subject is the sequence of its revisions across horizons, not edits to one record.
- **Subjects never appear without assertions:** no Entity or Relationship may appear in any read result without at least one supporting GraphAssertion revision valid under the query's pinned parameters. Subjects are not facts; they are the stable identity that assertion revisions attach to. A subject with no valid assertion at time T simply does not exist in the graph as of T.
- **Provenance** is the non-empty set of Evidence references supporting a GraphAssertion revision. A revision with zero Evidence references is structurally invalid — rejected at schema validation, not merely discouraged.
- **Confidence** is a value in `[0, 1]` computed deterministically by reconciliation (ADR-0015, which fixes the exact formula) from **that revision's provenance**. It is derived content of the revision, never hand-authored; a provenance change means a new revision with its own confidence — never an update in place.
- **Freshness** is **query-time response data, not part of any assertion revision or its identifier**: the staleness classification is computed at read time from the revision's latest supporting observation and the query's `asOf` (ADR-0015 fixes the thresholds), and returned alongside the revision by every read path. The same immutable revision classifies as `current` at one query time and `stale` at a later one without changing identity. Freshness is orthogonal to confidence.
- A **Snapshot** is the complete state of subjects-with-their-valid-assertions as of a point in time — a read-side construct over assertion validity, not a stored copy (ADR-0016 defines snapshot identity and as-of semantics).

### Identity

- Every Entity subject, Relationship subject, Evidence record, and Snapshot has a **stable, namespaced, human-readable identifier** with an explicit scheme, proposed as `atlast:<concept>:<segment>[/<segment>…]` (e.g., `atlast:entity:service/checkout`, `atlast:evidence:demo-company/traces/0001`). Identifiers are opaque to consumers beyond the scheme: no parsing identifiers to infer facts.
- **GraphAssertion identifiers are content-addressed**, not sequence-assigned: `atlast:assertion:<content-digest>`, where the digest is SHA-256 (ADR-0016's checksum algorithm) over the canonical serialization (ADR-0016) of the revision's identifying content — derivation version, subject identifier, canonical claim, validity interval at the pinned horizon, sorted provenance identifiers, rule trace, and conflict/ambiguity state. Content addressing makes the replay invariant structural: recomputation cannot produce "the same assertion with a different id" or "a changed assertion with the same id".
- Identifier construction rules (normalization, allowed characters, casing) are part of the schema contract and validated at runtime.

### Lifecycle without destructive deletion

- Subjects and assertion revisions are never deleted. An assertion whose supporting Evidence stops recurring **ages**: its query-time staleness classification (per the ADR-0015 thresholds) moves through explicit states (`current` → `stale` → `historical`) as the query's `asOf` advances, each visible on every read. Aging is response data only — it does not alter any revision or its confidence. Disappearance is itself information and remains queryable through history (ADR-0016).
- **Validity and freshness are separate dimensions.** An assertion revision's validity interval determines whether it belongs in a snapshot at all (it does when the half-open interval contains `asOf`); freshness classifies how recently a valid revision was observed. A revision whose interval has closed before `asOf` is simply absent from that active snapshot — in M1, superseded revisions are reached only by querying pinned snapshots at earlier `asOf` values. The **temporal state `superseded`** is a **reserved** marker for a future bounded assertion-history route (deferred beyond M1, per ADR-0017); it is defined here so the model never overloads the freshness classification to express supersession.
- **Conflicting assertions coexist.** When Evidence supports contradictory claims about one subject, reconciliation records a conflict structure holding both revisions and their provenance, and the read surface exposes the conflict. Silently picking a winner is a defect of the highest severity ([GUARDRAILS.md § 1.2](../../GUARDRAILS.md#12-evidence-and-honesty-requirements)).

### Validation and schema versioning

- All domain shapes are defined **once** as Zod schemas per ADR-0005, with types derived via inference. Validation applies at every trust boundary: fixture loading, repository writes, and API responses.
- Every serialized domain document (fixture files, API payloads) carries an explicit **`schemaVersion`** field. Schema evolution is additive within a version; breaking changes increment the version and are themselves ADR-worthy. Documents with unknown versions are rejected loudly, never coerced.

### Package boundaries

- **`packages/shared`** owns the contract surface: the Zod schemas and inferred types for Evidence, Entity and Relationship subjects, GraphAssertion (including status, rule trace, validity, and conflict/ambiguity state), conflict structure, Snapshot references, and identifier rules, plus the repository **interfaces** (`EvidenceStore`, `TopologyGraphStore` per ADR-0012).
- **`packages/graph-model`** owns behavior: reconciliation (ADR-0015), temporal/snapshot computation (ADR-0016), and the storage implementation selected by ADR-0018 — all behind the shared interfaces. Nothing outside `packages/graph-model` touches storage; consumers reach the graph only through the query API (ADR-0017).

### Explicitly out of scope for this ADR

Overlays (M3), impact analysis (M4), AI features (post-M5 for prediction), and real discovery connectors (M5) are not modeled here. The Evidence shape must not embed connector-specific structure beyond the source-native detail payload.

## Alternatives Considered

- **Entities/relationships as primary mutable records with an evidence audit log** — the conventional CMDB shape. Rejected: it inverts [architecture § 1.1](../architecture.md#11-evidence-in-assertions-out); the graph would no longer be rebuildable from evidence, and conflict handling degenerates into last-write-wins. The stable subjects proposed here are **not** mutable records — they carry identity and type only, hold no mutable attributes, and are invisible in reads without supporting assertions.
- **Subjects and assertions collapsed into one record** (an Entity _is_ its assertion) — fewer concepts, but then identity churns whenever claims change: conflicting claims about one thing become two things, validity intervals fragment identity, and consumers cannot ask "the history of this entity" without reconstructing identity heuristically. Separating stable subjects from time-bounded assertions keeps identity stable while claims change beneath it.
- **A single generic "node/edge" model with type as data** — maximally flexible, but discards the domain vocabulary guardrail and pushes shape validation from schema level into runtime conditionals. The strongest alternative on flexibility grounds; rejected because trust in the graph depends on strong shapes.
- **UUID-only identifiers** — simpler generation, but opaque IDs make fixtures, diffs, and reviews unreadable, and stable human-readable identity is cheap at synthetic scale. Revisit if identifier collisions or renaming pressure appear with real sources (M5+).
- **Storing freshness as a written field updated by a background process** — rejected: freshness must be derivable from Evidence plus an injected clock, or determinism and rebuildability are lost.

## Tradeoffs

- **Chosen:** structural enforcement of every honesty guardrail (no evidence → no fact; conflicts visible; nothing deleted); a rebuildable graph; reviewable fixtures.
- **Given up:** write-path convenience (every change flows through Evidence and reconciliation — there is deliberately no "just update the entity" path) and some storage compactness (retained history and conflict structures cost space; acceptable at synthetic scale, measured before M5).

## Consequences

- ADR-0015 (reconciliation), ADR-0016 (temporal semantics), ADR-0017 (query surface), and ADR-0018 (storage) all build on these boundaries; accepting this ADR fixes their shared vocabulary and constraints.
- `packages/shared` becomes contract-critical (as ADR-0005 anticipated); its review bar rises accordingly.
- Fixture design must express Evidence, not pre-reconciled graph state — fixtures are inputs to the pipeline, not dumps of its output.

## Risks

- **Model gold-plating before contact with reality.** The schema could over-fit synthetic cases. Mitigation: M1 models only what its fixtures exercise; extension is additive by design.
- **Conflict structures could sprawl** into a second graph. Mitigation: conflicts are scoped per assertion and carry only claims plus provenance references.
- **Identifier scheme churn** once real sources (M5) produce awkward native IDs. Mitigation: source-native IDs live in Evidence detail; graph identity is assigned by reconciliation, so the scheme can evolve behind it.

## Testable Invariants and Acceptance Evidence

Invariants any implementation must prove (via the fixture suite and contract tests when implementation is authorized):

1. No GraphAssertion revision validates without at least one Evidence reference and a subject reference (schema-level rejection test).
2. Every assertion revision returned by any read path carries provenance, confidence, rule trace, validity, and conflict/ambiguity state, accompanied by its query-time freshness classification (contract test over every query family).
3. No Entity or Relationship appears in any read result without a supporting assertion revision valid under the query's pinned parameters (subject-visibility test).
4. Every Relationship subject references two existing stable Entity identifiers (referential-integrity test).
5. Conflicting fixture Evidence yields a queryable conflict, never a single silently chosen claim.
6. Deleting nothing: no repository operation removes a subject, assertion revision, or Evidence record; disappearance manifests only as classification change at later query times.
7. A document with an unknown `schemaVersion` is rejected with an explicit error.
8. Recomputing the graph from identical Evidence under the same derivation policy reproduces byte-identical assertion revisions with identical content-addressed identifiers (shared with ADR-0016's replay invariant).
9. An assertion revision's identifier is exactly the SHA-256 digest of its canonical identifying content; altering any identifying component produces a different identifier (content-addressing test).
10. **Revision-not-mutation:** when later Evidence corroborates an existing claim, reconciliation at the new horizon yields a new revision (new provenance set, new confidence, new identifier) while a snapshot pinned at the earlier horizon still returns the earlier revision byte-identically.

**Acceptance evidence at review time:** this document plus the fixture scenario catalog in [docs/m1-plan.md](../m1-plan.md) demonstrating that every invariant has at least one planned fixture case.

## Dependencies on Other Proposed ADRs

- **ADR-0015** must define the reconciliation that produces assertions, confidence, and conflicts consistent with these boundaries.
- **ADR-0016** must define assertion validity, snapshot identity, and replay consistent with the lifecycle rules here.
- **ADR-0017** must expose exactly these concepts — no synonyms, no side-door shapes.
- **ADR-0018** must store these shapes behind the ADR-0012 interfaces without leaking storage detail into them.

## Why This Fits Atlast

- **Evidence in, assertions out, structurally:** the model makes the founding pipeline impossible to bypass rather than merely documented.
- **Honest degradation:** aging, conflict, and staleness are first-class states, not error paths.
- **Boring core:** plain typed shapes, one schema source, no clever abstractions.

## Conditions That Would Justify Changing This Decision

- Real-source evidence (M5) that cannot be expressed as source-scoped observations with native detail — would force an Evidence-shape revision.
- Measured storage or query cost of full conflict/history retention becoming material — would trigger the retention-horizon decision (ADR-0018's change conditions).
- The domain vocabulary itself changing in PROJECT_SPEC.md § 4 (spec change first, model follows).
