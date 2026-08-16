# ADR-0029: M3 Overlay Model and Temporal Semantics

**Status:** Accepted
**Date:** 2026-08-16

> **Approval note (2026-08-16):** Explicitly accepted by Joseph Carfagno after independent architecture review, correction, and focused re-review. Acceptance establishes the M3 overlay-model and temporal-semantics decision and approves it as part of the [M3 implementation baseline](../m3-plan.md). It becomes operational only after the acceptance record merges to `main` and local `main` is synchronized cleanly. Acceptance does not release M3-A or authorize M4+.

> **Implementation authorization note (2026-08-16):** After the accepted baseline merged through PR #53 at `b85be38`, Joseph Carfagno separately authorized M3-A only within [the plan's exact contract-and-fixture boundary](../m3-plan.md#m3-a---contracts-and-fixture-catalog). That release becomes operational only after its authorization record merges and local `main` is synchronized cleanly. This metadata note does not alter the decision below. M3-B through M3-F and M4+ remain unauthorized.

## Context

M3 must represent six synthetic operational states without putting health into the versioned topology graph. Topology is Evidence-derived, historical, and durable. Operational overlays are ephemeral projections with a separate lifecycle. Treating an overlay as an Entity claim or Evidence record would corrupt provenance, checksums, and the guarantee that losing overlays loses no topology.

M2 also made snapshot identity visible and reproducible. M3 therefore needs an equally explicit overlay coordinate rather than silently joining a wall-clock value to a historical graph.

## Decision

### 1. Keep overlays in a separate domain

Add strict shared contracts for immutable `OverlayFrame` values. A frame contains exactly:

- schema version `atlast-overlay-v1`;
- stable frame identifier;
- scenario identifier;
- `effectiveAt` UTC millisecond timestamp;
- canonically ordered direct entries.

The exact frame fields are `schemaVersion`, `identifier`, `scenarioIdentifier`, `effectiveAt`, and `entries`. The exact entry fields are `identifier`, `targetEntityIdentifier`, and `directCondition`; unknown fields are rejected at both levels. `scenarioIdentifier` is the literal `demo-company`, and slugs are lowercase kebab case. Frame identifiers match `atlast:overlay-frame:demo-company/<frame-slug>` and entry identifiers match `atlast:overlay-entry:demo-company/<frame-slug>/<entry-slug>`. Each frame contains 1-100 entries, entry identifiers and target Entity identifiers are unique within it, and every entry identifier's frame slug matches its containing frame. A direct condition is exactly one of `healthy`, `degraded`, `down`, `disconnected`, or `expiring-certificate`.

Entries are stored in ascending raw UTF-16 code-unit order by `(targetEntityIdentifier, identifier)`. Frames are stored in ascending raw UTF-16 code-unit order by `(effectiveAt, identifier)`. Equal effective times are valid and frame identifier is the deterministic tie-breaker. Duplicate frame identifiers are rejected.

No overlay field is added to Evidence, GraphSubject, GraphAssertion, SnapshotIdentity, or a topology repository interface.

### 2. Separate direct conditions from effective state

The contextual result preserves the direct condition and separately reports an effective state. `latent-downstream-risk` is effective state derived from topology context, never a direct source condition.

An Entity with no direct entry is `unreported`; absence is not rewritten as healthy. An overlay entry targeting an Entity absent at the topology snapshot becomes an `UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT` gap.

### 3. Define deterministic contextual policy

Direct severity order is `down`, `disconnected`, `degraded`, `expiring-certificate`, then `healthy`.

Only a directly healthy Entity may derive latent downstream risk. The projection scope is the origin Entity plus each Entity subject returned by traversal. An eligible directed edge is one returned Relationship assertion revision whose claim is a Relationship claim, whose confidence meets the validated request floor, and whose source and target Entity identifiers are both in scope. The projector follows each eligible claim's actual source-to-target direction regardless of the root traversal direction, never expands beyond the supplied result, and never traverses nested `conflictState.competingClaims`.

Derivation reads direct conditions only, not other derived results. It records the triggering path with the fewest edges as a nonempty sequence of strict steps containing `sourceEntityIdentifier`, `targetEntityIdentifier`, `relationshipIdentifier`, and `assertionIdentifier`. Ties prefer condition severity, then target Entity identifier, then the raw UTF-16 lexicographic sequence of `(sourceEntityIdentifier, targetEntityIdentifier, relationshipIdentifier, assertionIdentifier)` step tuples. Projections are ordered by Entity identifier and gaps by `(targetEntityIdentifier, entryIdentifier)`, using the same comparator. Truncation marks every projection's context incomplete and prevents a no-risk result from being described as globally complete.

Disconnected is an observed operational condition; it does not delete topology edges. Expiring certificate is a synthetic operational warning; M3 performs no certificate scan.

### 4. Use immutable frame-time semantics

Frames are append-only fixture values. Without an exact frame identifier, resolution chooses the greatest frame by `(effectiveAt, identifier)` among frames with `effectiveAt <= topology asOf`. Exact lookup rejects an unknown frame and a frame later than the topology snapshot.

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

- Strict schema, duplicate frame/entry/target rejection, containing-frame slug, and total-order tests.
- Input mutation isolation and returned-value isolation.
- Frame ordering and latest-at-or-before selection tests.
- Direct/effective distinction and all six-state coverage.
- Origin-inclusive, revision-qualified, confidence-floor, competing-claim, cycle-safe latent-risk path, and total tie-order tests.
- Unknown-target gap tests proving no graph subject is created.
- Topology checksum and subject-count invariance with overlays present, absent, or removed.

## Change Conditions

Revisit before any real overlay source, mutable frame, persistent overlay store, conflicting source reconciliation, streaming transport, or health-derived topology proposal. Each requires a new ADR and separate milestone authorization.

This Accepted ADR does not authorize implementation. M3-A requires a separate explicit release.
