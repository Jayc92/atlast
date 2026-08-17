# Atlast M3 Implementation Plan - Operational Health Overlays

**Status:** Approved - M3 implementation baseline; M3-A through M3-D complete; M3-E separately authorized pending activation
**Date:** 2026-08-16

> **Approval and authorization boundary (2026-08-16):** Joseph Carfagno explicitly accepted ADRs 0029-0031 and approved this plan as the M3 implementation baseline after independent architecture review, correction, and focused re-review. Approval becomes operational only after this record merges to `main` and local `main` is synchronized cleanly. It authorizes no product implementation, dependency, fixture, schema, API, or UI change. M3-A requires a separate bounded slice release. M4+ remain unauthorized.

> **Review state:** Independent architecture review and correction completed on 2026-08-16 against the merged M1/M2 contracts and implementation. Joseph Carfagno then explicitly approved the corrected baseline. Neither review completion nor baseline approval releases M3-A.

> **M3-A release and closeout (2026-08-16):** After the accepted baseline merged through PR #53 at `b85be38`, Joseph Carfagno explicitly authorized M3-A within the exact boundary in § 6. The authorization merged through PR #54 at `e5da808`; the independently reviewed implementation merged through PR #55 at `e9afcd5` with GitHub Actions and the complete local verifier passing. M3-A is complete. M3-B through M3-F and M4+ remain unauthorized.

> **M3-B release (2026-08-16):** After the M3-A closeout merged through PR #56 at `a767c93` and local `main` synchronized cleanly, Joseph Carfagno explicitly authorized M3-B within the exact provider-and-projector boundary in § 6. The release becomes operational only after its authorization record merges to `main` and local `main` is synchronized cleanly. M3-C through M3-F and M4+ remain unauthorized.

> **M3-B closeout (2026-08-16):** The authorization merged through PR #57 at `8213d7d`; the independently reviewed implementation merged through PR #58 at `98beb46` with GitHub Actions and the complete local verifier passing. M3-B is complete. No implementation slice is active. M3-C through M3-F and M4+ remain unauthorized.

> **M3-C release (2026-08-16):** After the M3-B closeout merged through PR #59 at `b932539` and local `main` synchronized cleanly, Joseph Carfagno explicitly authorized M3-C within the exact health-in-context API boundary in § 6. The release becomes operational only after its authorization record merges to `main` and local `main` is synchronized cleanly. M3-D through M3-F and M4+ remain unauthorized.

> **M3-C closeout (2026-08-16):** The authorization merged through PR #60 at `8695a2b`; the independently reviewed implementation merged through PR #61 at `e177fc0` with GitHub Actions and the complete local verifier passing. M3-C is complete. No implementation slice is active. M3-D through M3-F and M4+ remain unauthorized.

> **M3-D release (2026-08-16):** After the M3-C closeout merged through PR #62 at `5f2d038` and local `main` synchronized cleanly, Joseph Carfagno explicitly authorized M3-D within the exact topology-overlay UI boundary in § 6. The release becomes operational only after its authorization record merges to `main` and local `main` is synchronized cleanly. M3-E through M3-F and M4+ remain unauthorized.

> **M3-D closeout (2026-08-17):** The authorization merged through PR #63 at `3b55c05`; the independently reviewed implementation merged through PR #64 at `a2c2d92` with GitHub Actions and the complete local verifier passing. Joseph Carfagno explicitly approved human browser QA. M3-D is complete.

> **M3-E release (2026-08-17):** After M3-D merged and local `main` synchronized cleanly, Joseph Carfagno explicitly authorized M3-E within the exact accessibility, history, and failure-hardening boundary in § 6. The release becomes operational only after the combined M3-D closeout/M3-E authorization record merges to `main` and local `main` is synchronized cleanly. M3-F and M4+ remain unauthorized.

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

## 3. Approved Architecture

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

Frame and entry identifiers use the closed ASCII forms `atlast:overlay-frame:demo-company/<frame-slug>` and `atlast:overlay-entry:demo-company/<frame-slug>/<entry-slug>`, where slugs are lowercase kebab case and `scenarioIdentifier` is the literal `demo-company`. A strict frame contains exactly `schemaVersion`, `identifier`, `scenarioIdentifier`, `effectiveAt`, and `entries`; a strict entry contains exactly `identifier`, `targetEntityIdentifier`, and `directCondition`. A frame contains 1-100 entries, its entry identifiers and target Entity identifiers are unique, and every entry identifier's frame slug matches its containing frame. Entries are stored in raw UTF-16 order by `(targetEntityIdentifier, identifier)`. Frames are stored in raw UTF-16 order by `(effectiveAt, identifier)`; equal effective times are valid and the identifier is the deterministic tie-breaker. Duplicate frame identifiers are rejected.

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
4. treats the origin and returned Entity targets as already proven, then validates each remaining frame target through `TopologyGraphStore.getSubject` at the already resolved identity, classifying only `UNKNOWN_IDENTIFIER` as a gap;
5. projects health through `packages/overlay-model` using the origin identifier, validated traversal bounds, traversal result, selected frame, and known/unknown target partition;
6. returns the unchanged traversal subjects and metadata, one projection for the origin plus every returned Entity, and frame-wide gaps in one validated envelope.

A successful traversal already proves that the origin and returned Entities exist at the resolved identity, so no in-scope target is read a second time. The remaining exact existence reads are bounded by the frame's 100-entry cap. Projections are ordered by Entity identifier; gaps are ordered by `(targetEntityIdentifier, entryIdentifier)`, all using raw UTF-16 code-unit order.

No browser-side join is authoritative. No existing route changes semantics.

### 3.5 Browser integration

The M2 topology workspace gains:

- a canonical master health-overlay toggle;
- canonical state-emphasis filters in fixed enum order;
- graph node treatments using text/icon/pattern plus color;
- an equivalent structured health view;
- a visible gap panel;
- direct-versus-derived explanation, including the canonical downstream path for latent risk;
- explicit topology snapshot and overlay frame identity;
- historical coordination with M2 snapshot playback;
- loading, retained-update, empty, unavailable, invalid-coordinate, and retry states.

The graph remains usable when overlays are hidden or unavailable. State filters only emphasize matching projections: nonmatching and unreported Entities remain visible with neutral treatment, gaps remain listed, and no topology node, edge, structured row, or API projection is removed.

## 4. Deterministic Health Semantics

Each known Entity has at most one direct condition in a frame. Frame validation rejects duplicate target entries. Direct condition severity order is:

`down > disconnected > degraded > expiring-certificate > healthy`

The order is presentation and contextual-risk policy only; it is not topology confidence and does not alter graph assertions.

Latent downstream risk is derived only for an Entity whose direct condition is `healthy`. The projection scope is the origin Entity plus every returned Entity subject. An eligible directed edge is one returned Relationship assertion revision whose claim is a Relationship claim, whose confidence meets the validated request floor, and whose source and target are both in scope. The projector follows the claim's actual source-to-target direction regardless of the root traversal direction, does not perform a second traversal, and never treats nested `conflictState.competingClaims` as traversal edges. Derivation uses only direct conditions, never recursively derived risk, so cycles cannot amplify state. Each path step records source Entity, target Entity, Relationship subject, and assertion revision identifiers. The result includes the triggering path with the fewest edges; ties prefer the more severe target condition, then target Entity identifier, then the raw UTF-16 lexicographic sequence of `(sourceEntityIdentifier, targetEntityIdentifier, relationshipIdentifier, assertionIdentifier)` step tuples. A truncated traversal is labeled as incomplete context and never presented as proof that no latent risk exists outside the loaded subgraph.

An Entity without a frame entry is `unreported`, not healthy. `unreported` is an absence state shown by the UI and is not one of the six M3 operational states. Unknown overlay targets are gaps and cannot trigger latent risk.

## 5. Temporal and Identity Semantics

- Overlay frames are immutable and identified independently from topology snapshots.
- A frame has one `effectiveAt` UTC millisecond timestamp.
- Without `overlayFrame`, the API selects the greatest frame by `(effectiveAt, frame identifier)` whose `effectiveAt` is less than or equal to the resolved topology `asOf`.
- An explicit frame must exist and must not be later than topology `asOf`.
- A pinned historical URL with overlays enabled carries the complete topology pin plus `overlayFrame`.
- The HTTP route supports an unpinned latest request for non-browser consumers. In the browser, latest mode first uses the M2 single-flight coordinator to establish one topology identity and then issues the health-context request pinned to that identity; the URL remains unpinned while the UI displays the returned topology and frame identities.
- Refresh latest starts a new coordinated generation. Failed refresh retains the prior labeled result and never relabels it current.
- Overlay frames have no Evidence horizon and do not modify topology checksums.

## 6. Exact Implementation Slices

The baseline is approved, M3-A through M3-D are complete, and M3-E is separately authorized subject to the combined closeout/authorization record merge and clean-synchronization activation gate. Every successor slice remains dormant until separately released.

### M3-A - contracts and fixture catalog

- Add shared overlay/frame/projection/gap/HTTP schemas and tests.
- Add the read-only overlay-store interface.
- Add the separate synthetic overlay catalog and validation tests.
- No API route, projection engine, or UI behavior.

### M3-B - overlay provider and deterministic projection

- Add `packages/overlay-model` with the in-memory store and pure projector.
- Prove immutability, the 100-entry bound, total frame/entry ordering and selection, origin projection, revision-qualified scope-relative latent-risk paths, cycles, missing direct state, and gaps.
- No API or browser behavior.

### M3-C - health-in-context API

- Add the exact route, query coercion, response validation, dependency injection, closed errors, and integration tests.
- Prove one traversal resolution, one frame resolution, no redundant in-scope target reads, at most 100 exact out-of-scope target-existence reads at the same identity, deterministic ordering, historical compatibility, and no topology mutation.
- No browser behavior.

### M3-D - topology overlay UI

- Add validated client support, canonical URL state, graph/structured overlay rendering, state-emphasis filters, explanations, and gaps.
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

- schema rejection tests for duplicate frame, entry, and target identifiers; mismatched frame slugs; malformed identifiers; invalid timestamps; unknown states; and unsorted output;
- pure determinism tests across input permutations;
- latent-risk tests for the origin, depth bounds, root direction, revision-level confidence-qualified directed paths within the returned subgraph, competing claims, cycles, severity/total tie ordering, and truncated traversal;
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

1. this plan and ADRs 0029-0031 are independently reviewed - complete 2026-08-16;
2. every blocking finding is corrected and re-reviewed - complete 2026-08-16;
3. Joseph Carfagno explicitly approves the complete M3 baseline - complete 2026-08-16;
4. the approval record merges to `main` and local `main` is synchronized cleanly - complete through PR #53 at `b85be38`;
5. M3-A receives a separate explicit implementation authorization - complete through PR #54 at `e5da808` on 2026-08-16.

M3-A subsequently merged through PR #55 at `e9afcd5` and closed through PR #56 at `a767c93`. M3-B was separately released through PR #57, merged through PR #58 at `98beb46`, and closed through PR #59 at `b932539`. M3-C was separately released through PR #60, merged through PR #61 at `e177fc0`, and closed through PR #62 at `5f2d038`. M3-D was separately released through PR #63, independently reviewed and human-QA-approved, and merged through PR #64 at `a2c2d92`. The separate M3-E release above becomes operational only after its record merges and `main` synchronizes cleanly. Completion of M3-E will not release M3-F; M3-F and M4+ remain unauthorized.
