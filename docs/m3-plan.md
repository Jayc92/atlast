# Atlast M3 Implementation Plan - Operational Health Overlays

**Status:** Proposed - planning candidate; implementation not authorized
**Date:** 2026-08-16

> **Authorization boundary:** M3 planning and pre-release architecture/ADR review are authorized after checkpoint `m2-complete`. This plan and ADRs 0029-0031 are Proposed. They authorize no product implementation, dependency, fixture, schema, API, or UI change. M3 implementation requires independent review, explicit human approval of the complete baseline, and a separate bounded slice release. M4+ remain unauthorized.

## 1. Objective

M3 projects deterministic synthetic operational health onto the completed, versioned topology without turning health into graph truth or turning Atlast into a monitoring system. A user must be able to view direct synthetic conditions, understand contextual downstream risk, inspect the exact topology snapshot and overlay frame behind the view, and see unknown overlay targets as explicit discovery gaps rather than invented entities.

The milestone exit criteria remain those in [docs/milestones.md](milestones.md):

1. Healthy, degraded, down, disconnected, expiring-certificate, and latent-downstream-risk states are representable, visually distinguishable without color alone, and queryable in topology context.
2. Removing all overlay data leaves topology unchanged and fully usable.

## 2. Binding Invariants

1. **Overlays never author topology.** They cannot create, modify, type, connect, or delete a graph subject or assertion.
2. **Unknown targets become gaps.** An overlay entry whose Entity is absent at the resolved topology snapshot is returned separately and never becomes a phantom graph node.
3. **Synthetic only.** M3 reads only committed demo-company overlay fixtures. It introduces no alerting, certificate, SLO, incident, deploy, cloud, cluster, or employer-system connector.
4. **Query-API only browser.** The web app consumes validated HTTP contracts and never imports overlay fixtures, provider internals, graph-model internals, or API modules.
5. **Two coordinates stay explicit.** Every result names both the complete topology snapshot identity and the immutable overlay frame identity used for the join.
6. **No hidden winner.** Direct source state and derived contextual state remain distinguishable. A derived risk never overwrites or masquerades as a direct observation.
7. **Deterministic projection.** Equal topology, frame, and bounds produce byte-equivalent ordered health results.
8. **Fail honestly.** Missing frames, invalid frame/topology combinations, unknown targets, truncation, and unavailable data remain visible.

## 3. Proposed Architecture

### 3.1 Shared contracts

`packages/shared` defines strict Zod contracts for:

- overlay schema version `atlast-overlay-v1`;
- immutable overlay frame and frame identifier;
- direct conditions: `healthy`, `degraded`, `down`, `disconnected`, and `expiring-certificate`;
- effective states: the five direct conditions plus `latent-downstream-risk`;
- direct and derived health projections;
- unknown-target gap records;
- the health-in-context HTTP response and its metadata;
- an asynchronous, read-only `OperationalOverlayStore` interface.

Frame and entry identifiers use the closed ASCII forms `atlast:overlay-frame:demo-company/<frame-slug>` and `atlast:overlay-entry:demo-company/<frame-slug>/<entry-slug>`, where slugs are lowercase kebab case. A frame contains 1-100 entries, and target Entity identifiers are unique within it.

No existing M1 graph subject, assertion, Evidence, repository, snapshot, or HTTP schema is widened to carry health.

### 3.2 Overlay model package

A new workspace package, `packages/overlay-model`, implements the shared interface with no external dependency beyond `@atlast/shared`. It owns:

- immutable in-memory frame loading;
- frame validation, isolation, ordering, and exact lookup;
- latest-at-or-before frame selection;
- deterministic direct-state projection;
- deterministic latent downstream risk derivation over a bounded traversal result;
- unknown-target gap classification.

It does not import fixtures by path at runtime, call graph repositories, expose a write API, or mutate topology. The API composition root supplies validated frames and topology results.

### 3.3 Synthetic overlay fixture catalog

`fixtures/demo-company/overlays/` contains a separate overlay catalog and immutable frames. It is deliberately separate from the M1 Evidence catalog because overlays are ephemeral projections, not Evidence and not inputs to reconciliation.

The catalog must cover:

- every direct condition at least once;
- at least one healthy Entity that derives latent downstream risk from a reachable non-healthy downstream Entity;
- at least one unknown target that becomes a gap;
- at least two frame times so historical selection and return-to-latest can be proven;
- deterministic expected counts and identifiers.

### 3.4 API composition

The API adds one read-only route:

`GET /api/v1/entities/{entityId}/health-context`

It accepts the existing required traversal bounds (`direction`, `depth`, optional `minConfidence`), the existing all-or-none topology pin, and optional `overlayFrame`. The handler:

1. resolves one bounded topology traversal through `TopologyGraphStore`;
2. resolves one immutable frame through `OperationalOverlayStore`;
3. rejects a frame later than the topology `asOf`;
4. validates each of the frame's at most 100 targets through `TopologyGraphStore.getSubject` at the already resolved identity, classifying only `UNKNOWN_IDENTIFIER` as a gap;
5. projects health through `packages/overlay-model`;
6. returns topology subjects, traversal metadata, health projections, and gaps in one validated envelope.

No browser-side join is authoritative. No existing route changes semantics.

### 3.5 Browser integration

The M2 topology workspace gains:

- a canonical master health-overlay toggle;
- canonical state filters in fixed enum order;
- graph node treatments using text/icon/pattern plus color;
- an equivalent structured health view;
- a visible gap panel;
- direct-versus-derived explanation, including the canonical downstream path for latent risk;
- explicit topology snapshot and overlay frame identity;
- historical coordination with M2 snapshot playback;
- loading, retained-update, empty, unavailable, invalid-coordinate, and retry states.

The graph remains usable when overlays are hidden or unavailable. Overlay state never removes a topology node or edge.

## 4. Deterministic Health Semantics

Each known Entity has at most one direct condition in a frame. Frame validation rejects duplicate target entries. Direct condition severity order is:

`down > disconnected > degraded > expiring-certificate > healthy`

The order is presentation and contextual-risk policy only; it is not topology confidence and does not alter graph assertions.

Latent downstream risk is derived only for an Entity whose direct condition is `healthy`. It is present when that Entity has a directed path, within the returned bounded subgraph, to an Entity with a direct condition other than `healthy`. This is scope-relative regardless of whether the root request traversed upstream or downstream: the projector follows the actual Relationship direction among subjects already returned and never performs a second traversal. Derivation uses only direct conditions, never recursively derived risk, so cycles cannot amplify state. The result includes the shortest triggering path; ties prefer the more severe target condition, then target Entity identifier, then Relationship identifier using the existing canonical ordering rules. A truncated traversal is labeled as incomplete context and never presented as proof that no latent risk exists outside the loaded subgraph.

An Entity without a frame entry is `unreported`, not healthy. `unreported` is an absence state shown by the UI and is not one of the six M3 operational states. Unknown overlay targets are gaps and cannot trigger latent risk.

## 5. Temporal and Identity Semantics

- Overlay frames are immutable and identified independently from topology snapshots.
- A frame has one `effectiveAt` UTC millisecond timestamp.
- Without `overlayFrame`, the API selects the newest frame whose `effectiveAt` is less than or equal to the resolved topology `asOf`.
- An explicit frame must exist and must not be later than topology `asOf`.
- A pinned historical URL with overlays enabled carries the complete topology pin plus `overlayFrame`.
- Latest topology mode may omit both coordinate families; the UI displays the resolved topology and frame identities returned by the API.
- Refresh latest starts a new coordinated generation. Failed refresh retains the prior labeled result and never relabels it current.
- Overlay frames have no Evidence horizon and do not modify topology checksums.

## 6. Exact Implementation Slices

Implementation remains dormant until the baseline is approved and the first slice is separately released.

### M3-A - contracts and fixture catalog

- Add shared overlay/frame/projection/gap/HTTP schemas and tests.
- Add the read-only overlay-store interface.
- Add the separate synthetic overlay catalog and validation tests.
- No API route, projection engine, or UI behavior.

### M3-B - overlay provider and deterministic projection

- Add `packages/overlay-model` with the in-memory store and pure projector.
- Prove immutability, the 100-entry bound, frame ordering/selection, severity, scope-relative latent-risk paths, cycles, missing direct state, and gaps.
- No API or browser behavior.

### M3-C - health-in-context API

- Add the exact route, query coercion, response validation, dependency injection, closed errors, and integration tests.
- Prove one traversal resolution, one frame resolution, at most 100 exact target-existence reads at the same identity, deterministic ordering, historical compatibility, and no topology mutation.
- No browser behavior.

### M3-D - topology overlay UI

- Add validated client support, canonical URL state, graph/structured overlay rendering, state filters, explanations, and gaps.
- Preserve the M2 coordinator, trust inspector, history playback, and no-side-door lint boundary.
- No new data source or API behavior.

### M3-E - accessibility, history, and failure hardening

- Add built-preview desktop/mobile journeys for all six states, gaps, historical frames, retry, keyboard operation, structured equivalence, reduced motion, zoom/reflow, and non-color semantics.
- Complete representative VoiceOver QA and record factual measurements.

### M3-F - audit and milestone closeout

- Re-run the synthetic-boundary and no-side-door audits.
- Prove overlay removal loses no topology.
- Record bundle, latency, memory, frame, gap, and result cardinalities.
- Correct documentation and close M3 only after implementation merges and post-merge verification passes.

## 7. Verification Strategy

Every slice runs the unchanged `./scripts/verify.sh`. M3 adds:

- schema rejection tests for duplicate targets, malformed identifiers, invalid timestamps, unknown states, and unsorted output;
- pure determinism tests across input permutations;
- latent-risk tests for depth bounds, root direction, directed paths within the returned subgraph, confidence-filtered edges, cycles, severity/canonical tie ordering, and truncated traversal;
- contract tests proving unknown targets are gaps and never graph subjects;
- API tests for latest, complete pin, exact frame, no eligible frame, unknown frame, frame-after-snapshot, and closed unexpected failures;
- browser tests proving graph/structured equivalence, all six non-color labels, canonical URL behavior, historical playback, retry, and overlay-off topology continuity;
- static import-boundary tests proving the browser cannot access overlay fixtures or model internals;
- a fixture mutation test proving the topology snapshot checksum and subject count are unchanged when overlay frames are added, removed, or unavailable.

## 8. Dependencies and Technology

No new third-party dependency is proposed. M3 reuses TypeScript, Zod, Fastify, React, React Router, React Flow, ELK, Vitest, and Playwright under their Accepted ADRs. `packages/overlay-model` is a new internal workspace boundary, not a new external technology.

## 9. Explicit Non-Goals

- Monitoring, alert evaluation, paging, incidents, SLO calculation, certificate scanning, deploy tracking, or remediation.
- Real-time streaming, polling daemons, WebSockets, background jobs, or persistent overlay storage.
- Real systems, credentials, employer data, or customer data.
- Health-derived topology edits, inferred relationships, phantom nodes, or reconciliation Evidence.
- M4 blast-radius simulation or predictive reasoning.
- Authentication, hosting, multi-user state, or M5 connectors.

## 10. Review and Release Gates

Before M3-A may begin:

1. this plan and ADRs 0029-0031 are independently reviewed;
2. every blocking finding is corrected and re-reviewed;
3. Joseph Carfagno explicitly approves the complete M3 baseline;
4. the approval record merges to `main` and local `main` is synchronized cleanly;
5. M3-A receives a separate explicit implementation authorization.

Approval of the baseline does not release M3-A. Completion of any slice does not release its successor. M4+ remain unauthorized.
