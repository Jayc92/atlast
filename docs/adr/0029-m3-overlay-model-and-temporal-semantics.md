# ADR-0029: M3 Overlay Model and Temporal Semantics

**Status:** Proposed
**Date:** 2026-08-16

## Context

M3 must represent six synthetic operational states without putting health into the versioned topology graph. Topology is Evidence-derived, historical, and durable. Operational overlays are ephemeral projections with a separate lifecycle. Treating an overlay as an Entity claim or Evidence record would corrupt provenance, checksums, and the guarantee that losing overlays loses no topology.

M2 also made snapshot identity visible and reproducible. M3 therefore needs an equally explicit overlay coordinate rather than silently joining a wall-clock value to a historical graph.

## Decision

### 1. Keep overlays in a separate domain

Add strict shared contracts for immutable `OverlayFrame` values. A frame contains:

- schema version `atlast-overlay-v1`;
- stable frame identifier;
- scenario identifier;
- `effectiveAt` UTC millisecond timestamp;
- canonically ordered direct entries.

Frame identifiers match `atlast:overlay-frame:demo-company/<frame-slug>` and entry identifiers match `atlast:overlay-entry:demo-company/<frame-slug>/<entry-slug>`, with lowercase kebab-case slugs. Each frame contains 1-100 entries. Each entry contains a stable entry identifier, a target Entity identifier, and exactly one direct condition: `healthy`, `degraded`, `down`, `disconnected`, or `expiring-certificate`. Target Entity identifiers are unique within a frame.

No overlay field is added to Evidence, GraphSubject, GraphAssertion, SnapshotIdentity, or a topology repository interface.

### 2. Separate direct conditions from effective state

The contextual result preserves the direct condition and separately reports an effective state. `latent-downstream-risk` is effective state derived from topology context, never a direct source condition.

An Entity with no direct entry is `unreported`; absence is not rewritten as healthy. An overlay entry targeting an Entity absent at the topology snapshot becomes an `UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT` gap.

### 3. Define deterministic contextual policy

Direct severity order is `down`, `disconnected`, `degraded`, `expiring-certificate`, then `healthy`.

Only a directly healthy Entity may derive latent downstream risk. It does so when the returned bounded subgraph contains a directed path from that Entity to a directly non-healthy Entity. This rule is independent of the root traversal direction and never expands beyond the subjects already returned. Derivation reads direct conditions only, not other derived results. It records the shortest triggering path; ties prefer condition severity, then canonical target and Relationship identifier order. Truncation marks the context incomplete and prevents a no-risk result from being described as globally complete.

Disconnected is an observed operational condition; it does not delete topology edges. Expiring certificate is a synthetic operational warning; M3 performs no certificate scan.

### 4. Use immutable frame-time semantics

Frames are append-only fixture values. Without an exact frame identifier, resolution chooses the newest frame with `effectiveAt <= topology asOf`. Exact lookup rejects an unknown frame and a frame later than the topology snapshot.

Topology snapshot identity and overlay frame identity are both returned. Overlay frames do not carry an Evidence horizon, participate in reconciliation, or affect topology checksums.

### 5. Add an internal overlay-model package

`packages/overlay-model` owns the in-memory read-only provider and pure projection. It depends only on `@atlast/shared` and adds no third-party package. The API supplies validated frames and topology results; the package never reads fixture paths or repositories directly.

## Consequences

- Health cannot create phantom topology or alter historical graph identity.
- Historical health views are reproducible by two explicit coordinates.
- Direct and inferred state remain distinguishable.
- Real overlay ingestion, persistence, conflict reconciliation, and streaming remain deferred beyond M5.
- A new internal package boundary adds modest workspace configuration but prevents overlay policy from leaking into API handlers or graph truth.

## Alternatives Rejected

- **Encode health as GraphAssertion claims:** violates overlay ephemerality and changes topology checksums.
- **Attach one status field to Entity subjects:** subjects are identity-only and health can vary independently.
- **Compute latent risk recursively:** cycles can amplify state and obscure the direct trigger.
- **Treat missing overlay as healthy:** converts absence into unjustified certainty.
- **Create placeholder entities for unknown targets:** directly violates the no-phantom-node invariant.
- **Put projection entirely in the browser:** creates a second domain engine and breaks query-API authority.

## Verification Obligations

- Strict schema and duplicate-target rejection tests.
- Input mutation isolation and returned-value isolation.
- Frame ordering and latest-at-or-before selection tests.
- Direct/effective distinction and all six-state coverage.
- Cycle-safe latent-risk path and canonical tie tests.
- Unknown-target gap tests proving no graph subject is created.
- Topology checksum and subject-count invariance with overlays present, absent, or removed.

## Change Conditions

Revisit before any real overlay source, mutable frame, persistent overlay store, conflicting source reconciliation, streaming transport, or health-derived topology proposal. Each requires a new ADR and separate milestone authorization.

This Proposed ADR authorizes no implementation.
