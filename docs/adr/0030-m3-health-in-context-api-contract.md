# ADR-0030: M3 Health-in-Context API Contract

**Status:** Accepted
**Date:** 2026-08-16

> **Approval note (2026-08-16):** Explicitly accepted by Joseph Carfagno after independent architecture review, correction, and focused re-review. Acceptance establishes the M3 health-in-context API contract and approves it as part of the [M3 implementation baseline](../m3-plan.md). It becomes operational only after the acceptance record merges to `main` and local `main` is synchronized cleanly. Acceptance does not release M3-A or authorize M4+.

## Context

The browser may read graph facts only through the query API. Returning raw overlay frames for browser-side joining would move contextual policy into the UI, permit mixed topology/frame coordinates, and make unknown-target behavior inconsistent. Existing traversal already provides the bounded, confidence-filtered topology context M3 needs.

## Decision

### 1. Add one composed read route

Add:

`GET /api/v1/entities/{entityId}/health-context`

The route accepts:

- required `direction` and `depth` with the existing traversal bounds;
- optional `minConfidence` with existing wire semantics;
- the existing all-or-none `asOf`, `horizon`, and `derivationVersion` pin;
- optional scalar `overlayFrame`.

Unknown and repeated query keys follow ADR-0024. The route is loopback-only, read-only, bounded by the existing 500-subject traversal budget, and exposes no mutation, bulk frame, or fixture endpoint.

### 2. Compose existing topology with one frame

The handler resolves topology by one `TopologyGraphStore.traverse` call. Successful traversal already proves the origin and every returned Entity exist at the resolved identity, so the handler does not read any in-scope target again. It then resolves one frame. To distinguish an actually unknown target from a known Entity outside the loaded neighborhood, it checks each remaining frame target with `TopologyGraphStore.getSubject` in pinned mode at the traversal's already resolved identity. The frame's 100-entry cap bounds those reads. Only `UNKNOWN_IDENTIFIER` becomes a gap; any other repository failure fails the request through the closed error boundary. Known targets outside the traversal are neither projections nor gaps. The handler invokes the pure projector with the origin identifier, validated traversal bounds, traversal result, selected frame, and known/unknown target partition.

The exact response envelope is:

```ts
{
  data: {
    originEntityIdentifier: EntityIdentifier;
    items: SubjectReadResult[];
    projections: HealthProjection[];
    gaps: OverlayGap[];
  };
  traversal: TraversalResultMetadata;
  meta: ResolvedReadMetadata & {
    overlay: {
      schemaVersion: "atlast-overlay-v1";
      frameIdentifier: OverlayFrameIdentifier;
      effectiveAt: UtcMillisecondTimestamp;
    };
  };
}
```

`items` and `traversal` are the unchanged traversal output; as specified by the repository contract, `items` excludes the origin. `projections` contains the origin and every Entity in `items`, ordered by Entity identifier. `gaps` contains frame-wide unknown targets ordered by `(targetEntityIdentifier, entryIdentifier)`. All ordering uses raw UTF-16 code-unit comparison.

`HealthProjection` is a strict discriminated union:

- unreported: `{ reportStatus: "unreported", entityIdentifier, contextCompleteness }`;
- reported direct: `{ reportStatus: "reported", entityIdentifier, directCondition, effectiveState: directCondition, contextCompleteness }`;
- reported latent risk: `{ reportStatus: "reported", entityIdentifier, directCondition: "healthy", effectiveState: "latent-downstream-risk", contextCompleteness, derivation }`.

`contextCompleteness` is `complete-within-requested-bounds` or `truncated`; a truncated traversal makes every projection `truncated`. A latent-risk `derivation` contains `triggerEntityIdentifier`, `triggerDirectCondition`, and a nonempty ordered `path`. Each strict path step contains `sourceEntityIdentifier`, `targetEntityIdentifier`, `relationshipIdentifier`, and `assertionIdentifier`. `OverlayGap` is the strict object `{ entryIdentifier, targetEntityIdentifier, directCondition, reason: "UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT" }`. The response therefore contains:

- the same ordered subject results and traversal metadata as traversal;
- one ordered projection for the origin and every returned Entity;
- ordered frame-wide unknown-target gaps proven against the same topology identity;
- metadata with the complete resolved topology identity, schema version, and selected overlay frame identity.

Relationship subjects receive no health state. They remain available as path evidence and graph edges.

### 3. Keep the join server-authoritative

The API, not the browser, applies direct/effective semantics, frame-time rules, path derivation, and gap classification. The browser validates and presents the result without recomputation.

The endpoint never calls a private repository implementation, fixture path, or graph-model internal. Application initialization receives an `OperationalOverlayStore` alongside the existing stores, seeds it before `buildApplication`, and always registers the same route set in tests and runtime.

### 4. Extend the closed error boundary narrowly

Add exact external errors:

- `OVERLAY_FRAME_NOT_FOUND` / 404 with details `{ overlayFrame }`;
- `INVALID_OVERLAY_COORDINATE` / 422 with either details `{ reason: "NO_FRAME_AT_OR_BEFORE_SNAPSHOT", topologyAsOf }` or `{ reason: "FRAME_AFTER_TOPOLOGY_SNAPSHOT", topologyAsOf, overlayFrame, frameEffectiveAt }`.

Malformed frame identifiers remain `MALFORMED_REQUEST`. Existing topology errors retain their accepted mapping. Unexpected exceptions remain redacted.

### 5. Preserve latest and pinned behavior

The topology read resolves first. Frame selection uses that resolved `asOf`. An explicit frame never changes the topology identity. A pinned topology request plus exact frame is reproducible. The HTTP route permits a latest request without a frame for non-browser consumers and resolves both identities once.

The browser does not use that cursorless composition path. In latest URL mode, it first uses the accepted M2 single-flight coordinator to establish one latest topology identity, then issues health-context as a dependent request with the complete topology pin while leaving the URL unpinned. Before publishing overlay data, it validates that the response resolved identity and ordered traversal subject identifiers exactly match the base M2 traversal for the same origin and bounds. A mismatch is an overlay failure: the already rendered topology remains visible and retryable.

## Consequences

- One response cannot mix independently resolved topology and health.
- The browser receives complete context without a fixture or model side door.
- The API surface grows from eight product routes to nine; this requires explicit baseline approval and a separately released slice.
- The composed route may repeat topology data already available to the browser, trading payload size for atomic semantic consistency. M3-C must measure the cost.
- The current in-memory repository may reconstruct a snapshot for each of the at most 100 exact target-existence reads. The bound prevents unbounded work, but M3-C must measure this path and may not hide an unacceptable result behind caching or a private repository shortcut.

## Alternatives Rejected

- **Raw `/health-overlays` endpoint plus browser join:** duplicates domain policy in the client.
- **Add health fields to every existing topology route:** widens stable M1/M2 contracts and makes overlay availability affect basic topology.
- **Server-sent events or WebSockets:** unnecessary for static synthetic frames and implies monitoring behavior.
- **Unbounded all-entity health endpoint:** conflicts with bounded-query requirements.
- **Persist health in TopologyGraphStore:** violates the separate overlay lifecycle.

## Verification Obligations

- Exact parameter matrix, repeated-key, unknown-key, and coercion tests.
- Latest, complete topology pin, exact frame, no eligible frame, unknown frame, and frame-after-snapshot tests.
- One traversal call, one frame resolution, no redundant in-scope target reads, at most 100 out-of-scope target-existence reads, and exact resolved-identity reuse assertions.
- Exact envelope and discriminated-union validation, origin projection, canonical ordering, revision-level path evidence, traversal truncation, and gap tests.
- Closed error mapping and redaction tests.
- Clean built-server runtime proof with the fully assembled application.
- Tests proving existing routes and topology checksums are unchanged.

## Change Conditions

Revisit before pagination, bulk overlay export, streaming, real sources, authentication, persistent storage, or a second health query family.

This Accepted ADR does not authorize implementation. M3-A requires a separate explicit release.
