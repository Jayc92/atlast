# Atlast M2 Implementation Plan — Interactive Topology Interface

**Status:** Complete — 2026-08-16; checkpoint `m2-complete`
**Date:** 2026-08-12

> **Approval and authorization boundary:** Joseph Carfagno explicitly approved this plan and accepted ADRs 0026–0028 on 2026-08-12 after independent architecture review, correction, and focused re-review found no remaining blockers. M2-A through M2-F are complete. M2-F merged through PR #51 at `5aeb11d` on 2026-08-16 with GitHub Actions `verify` passing in 3m9s; the post-merge revalidation in the boundary audit and checkpoint `m2-complete` formally close M2. Joseph's contingent authorization now releases M3 planning and pre-release architecture/ADR review only. M3 product implementation and M4+ remain gated and unauthorized.

## 1. Objective

M2 turns the completed M1 fixture-backed topology and query API into an interface that a person can explore without writing HTTP requests. It must preserve the core trust contract: every displayed fact remains visibly tied to confidence, freshness, conflict/ambiguity state, snapshot identity, and dereferenceable Evidence.

The M2 exit criteria remain those in [docs/milestones.md](milestones.md):

1. A user can navigate a synthetic topology, search for entities, and inspect the Evidence behind any edge from the UI alone.
2. The UI reads exclusively through the query API, with no fixture, repository, graph-model, or storage side door.

## 2. M2 Scope

### In scope

- A responsive application shell for topology exploration.
- Identifier search across Entity and Relationship subjects.
- Entity inventory and entity detail.
- Bounded upstream/downstream traversal with explicit depth and confidence controls.
- A graph viewport plus an equivalent accessible structured view.
- Relationship inspection, including all visible claims rather than a silently selected winner.
- Confidence, freshness, conflict, ambiguity, validity, provenance, and rule-trace presentation.
- Evidence inspection through `GET /api/v1/evidence/{evidenceId}`.
- Reproducible latest and historical snapshot navigation.
- URL-addressable exploration state and browser back/forward behavior.
- Loading, empty, truncated, stale, historical, conflict, ambiguity, validation, unavailable, and unexpected-failure states.
- Browser acceptance coverage for the primary desktop and mobile journeys.

### Out of scope

- M3 health overlays, M4 impact simulation, or M5 connectors.
- Authentication, deployment, external hosting, or non-loopback access.
- Any real system, credential, employer data, or non-synthetic source.
- Topology editing, annotations, mutation routes, or write-capable UI.
- Ownership, names, free-text labels, generic status, or other claims M1 does not define.
- A relationship-detail API route, assertion route, bulk-Evidence route, or query-language endpoint unless separately proposed and approved.
- Entity-type inventory filtering in the initial M2 UI. The accepted API filter remains available, but it is not part of the M2 exit criteria or canonical URL contract and may be proposed later from measured use.
- Reconciliation, snapshot, fixture, repository, or existing M1 query semantics changes.

## 3. Existing Contract Baseline

M2 consumes the seven accepted M1 routes from ADR-0024:

| UI need               | Existing route                              | Contract note                                                             |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Inventory             | `GET /api/v1/entities`                      | Entity-only, bounded, paginated; optional claim-level `entityType` filter |
| Entity detail         | `GET /api/v1/entities/{entityId}`           | Entity identifier only                                                    |
| Search                | `GET /api/v1/search?q=...`                  | Complete canonical identifier substring; Entity and Relationship results  |
| Graph neighborhood    | `GET /api/v1/entities/{entityId}/traversal` | Explicit direction, depth 1–5, confidence floor, 500-subject budget       |
| Evidence record       | `GET /api/v1/evidence/{evidenceId}`         | No snapshot identity; Evidence is an ingestion fact                       |
| Entity evidence chain | `GET /api/v1/entities/{entityId}/evidence`  | Entity-scoped only, bounded and paginated                                 |
| Snapshot verification | `GET /api/v1/snapshots`                     | Requires a complete `(asOf, horizon, derivationVersion)` identity         |

Every successful graph response includes `meta.resolvedIdentity`. Every subject arrives with at least one assertion revision, and each revision includes query-time freshness, confidence, provenance, conflict state, ambiguity state, validity, and rule trace.

### Contract gaps exposed by M2

1. **Snapshot playback discovery:** the API validates a known snapshot identity but does not enumerate usable historical coordinates. The UI cannot derive a truthful timeline from fixtures or repository internals without violating the no-side-door rule. ADR-0028 therefore proposes one bounded, read-only snapshot-anchor route.
2. **Browser proxy path:** the current Vite proxy rewrites every `/api/*` request by stripping `/api`, which supports `/api/health -> /health` but would turn `/api/v1/entities` into the nonexistent `/v1/entities`. ADR-0026 proposes an exact proxy split that preserves both health and versioned API paths.
3. **Relationship deep links:** no relationship-detail route exists by design. A direct relationship selection must rehydrate through identifier search, require an exact identifier match, and fail honestly if absent. It must not invent a route.

### ADR-0018 storage forcing-point re-evaluation

ADR-0018 required M2 to re-evaluate fixture-backed in-memory storage against measured interactive query patterns. M2-A through M2-F recorded fixture cardinality, retained Evidence count, result cardinalities, traversal truncation, snapshot-anchor candidate count, route latency, process memory, browser heap signals, and bundle measurements. The independent M2-F review compared those measurements with every ADR-0018 change condition and reached **Outcome 1: retain the accepted in-memory implementation for the measured M2 workload**. The catalog remains 20 Evidence records and 11 entities; measured server-side routes remain comfortably interactive; state remains fixture-regenerable; and no measured traversal or temporal pattern warrants a relational or graph engine. Joseph Carfagno explicitly approved that conclusion on 2026-08-16. No storage ADR or migration slice is required for M2.

## 4. Primary Journeys

### Journey A — Explore from inventory

1. Open `/topology` in latest mode.
2. Load the first entity page and expose visible pagination.
3. Select an Entity.
4. Load its detail and bounded traversal at the same resolved snapshot identity.
5. Display its neighborhood in both graph and structured views.

### Journey B — Search and focus

1. Enter at least two characters of a canonical identifier.
2. Show exact API results, preserving Entity/Relationship kind.
3. Selecting an Entity focuses the topology and opens entity detail.
4. Selecting a Relationship rehydrates the exact subject through search, highlights its endpoints if visible, and opens relationship trust detail.
5. No display-name or fuzzy-search behavior is implied.

### Journey C — Explain an edge

1. Select a Relationship in the graph or structured view.
2. Show every visible assertion and competing claim; never pick a winner.
3. Display confidence, freshness, validity, ambiguity, and named rule trace.
4. Dereference every provenance identifier through `GET /api/v1/evidence/{evidenceId}`.
5. Show unavailable Evidence as a visible error attached to that citation, not as missing provenance.

### Journey D — Change traversal bounds

1. Choose upstream or downstream.
2. Choose depth 1–5 and confidence floor 0–1.
3. Commit the change to the URL.
4. Abort stale requests, retain the prior view with an updating indication, and replace it only with a response validated at the requested identity.
5. Surface `traversal.truncated` and its budget explicitly.

### Journey E — Reproduce and replay history

1. The initial latest read resolves one complete snapshot identity.
2. The client pins subsequent coordinated reads to that identity.
3. The history control loads bounded snapshot anchors from the proposed M2 route.
4. Selecting an anchor writes all three identity components to the URL and reloads every graph read in pinned mode.
5. “Return to latest” performs a new latest read and visibly adopts its newly resolved identity.

### Journey F — Recover honestly

- Invalid URL state is replaced with a safe canonical state and an accessible explanation.
- Expected API errors render a specific recoverable state.
- Unexpected or malformed responses render a redacted failure state.
- Empty inventory/search/traversal are distinct states.
- The previous successful view is never relabeled as current after a failed refresh.

## 5. Information Architecture and URL Contract

Proposed routes:

| Browser route         | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `/`                   | Existing product/status landing page, updated to link into topology |
| `/topology`           | Inventory, search, traversal controls, graph/structured views       |
| `/entities/:entityId` | Entity-focused topology and detail                                  |

Canonical query parameters:

- `q`: search text.
- `direction`: `upstream` or `downstream`.
- `depth`: integer 1–5.
- `minConfidence`: decimal 0–1.
- `view`: `graph` or `list`.
- `selected`: optional exact subject identifier for an inspector.
- `asOf`, `horizon`, `derivationVersion`: present together or absent together.

Pagination cursors remain ephemeral request state and are not durable browser URLs. A copied URL represents the exploration coordinate, not an in-progress page walk.

The accepted inventory `entityType` filter is intentionally not exposed in the initial M2 URL or primary journeys; that omission is a product-scope decision, not an API gap.

## 6. Read Consistency

- The first cursorless latest response establishes a session snapshot identity.
- All dependent reads are reissued as pinned reads at that identity.
- Pagination follows the API cursor unchanged and never parses it.
- A user action that explicitly requests latest discards the prior identity and establishes a new one from the next successful response.
- Responses whose request generation is obsolete are ignored even if network cancellation races.
- Cache keys include operation, complete snapshot identity, identifier/filter/bounds, and page cursor where applicable.
- No UI code imports fixtures, `packages/graph-model`, repository implementations, or server modules.
- M2-A adds an ESLint restricted-import boundary for `apps/web/src/**` covering fixtures, `packages/graph-model`, repository implementations, and API server modules; review prose alone is not sufficient enforcement.

## 7. Trust Presentation Rules

These are semantic requirements, not styling suggestions:

- **Confidence:** show the numeric value and a text label; color alone is insufficient.
- **Freshness:** show `current`, `stale`, or `historical` verbatim with an explanation tied to the selected snapshot.
- **Conflict:** show the primary assertion and every `competingClaim`; never use “resolved,” “winner,” or equivalent language.
- **Ambiguity:** show every `nearMatchSubjectIdentifier` and reason; do not merge identities visually.
- **Validity:** display the half-open interval `[validFrom, validTo)` accurately; open intervals say “no recorded end.”
- **Provenance:** every Evidence identifier is an actionable citation and its lookup state is visible.
- **Rule trace:** show ordered rule names and Evidence citations; optional detail is explanatory, never authoritative replacement text.
- **Snapshot identity:** the complete identity is always inspectable and copied as one unit.

## 8. Graph and Accessible Structured View

- Entity subjects render as nodes.
- Relationship claims render as directed edges only when both endpoints are present in the loaded neighborhood.
- A Relationship subject with conflicting endpoint/type claims renders each claim honestly and receives an explicit conflict treatment; the UI never collapses claims into one invented edge.
- Missing endpoints render in the inspector as an incomplete visible neighborhood, not as phantom nodes.
- The graph is not the sole representation. The structured view exposes the same loaded subjects and relationships as keyboard-operable semantic controls.
- Selection, focus, and inspector state remain synchronized between both views.
- Layout input is identifier-sorted before the layout engine runs; layout output is presentational and never changes graph semantics.

## 9. Responsive and Accessibility Baseline

- Desktop uses a topology workspace with controls, viewport, and inspector.
- Narrow screens use one primary pane at a time with explicit navigation between results, topology, and inspector; no tiny desktop graph is forced into mobile.
- All operations are keyboard reachable without interacting with the graph canvas.
- Focus moves deliberately when opening/closing the inspector and returns to the invoking subject.
- Status and errors use live regions only when an announcement is useful; routine content does not become noisy.
- Motion respects `prefers-reduced-motion`.
- Text, icons, patterns, and labels jointly communicate state; color never carries meaning alone.
- M2 routes target WCAG 2.2 Level AA. Touch targets, zoom controls, inspector actions, focus behavior, semantics, contrast, reflow, and status communication are verified against the applicable success criteria at the mobile and desktop acceptance viewports.

## 10. Proposed Implementation Slices

M2-A through M2-F are complete. M2-F merged through PR #51 at `5aeb11d` on 2026-08-16 and passed post-merge revalidation before checkpoint `m2-complete` closed the milestone.

| Slice | Deliverable                                                                                             | Primary paths                                                                |
| ----- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| M2-A  | Shared browser/API contracts, validated query client, exact proxy correction, URL state foundation      | `packages/shared`, `apps/web`, directly corresponding tests/config           |
| M2-B  | Application shell, routing, inventory, identifier search, canonical loading/empty/error states          | `apps/web/src/**`                                                            |
| M2-C  | Traversal workspace, graph adapter/layout, structured equivalent, selection synchronization             | `apps/web/src/**`, approved dependency manifests/lockfile                    |
| M2-D  | Entity/Relationship trust inspector, Evidence dereferencing, conflict/ambiguity/freshness presentation  | `apps/web/src/**`                                                            |
| M2-E  | Bounded snapshot-anchor API extension and history playback                                              | additive shared/API contracts and `apps/web/src/**`, exact ADR-0028 boundary |
| M2-F  | Browser acceptance, accessibility/responsive hardening, ADR-0018 storage re-evaluation, audit, closeout | tests, measurements, audit, factual docs                                     |

Each slice requires its own bounded implementation prompt, independent review, full verifier pass, PR/CI, merge, checkpoint update, and next-slice release.

## 11. Verification Strategy

### Unit/component tests

- Runtime response validation and closed error mapping.
- URL parsing/canonicalization and complete-pin enforcement.
- Latest-to-pinned coordination and stale-response suppression.
- Subject-to-node/edge projection, including conflicts and missing endpoints.
- Trust-state rendering and Evidence lookup failures.
- Keyboard focus and structured-view equivalence.

### API integration tests

- Proposed snapshot-anchor route cap, truncation, ordering, identity validity, empty-store behavior, and no mutation.
- Every returned anchor accepted by the existing snapshot-summary route.

### Storage forcing-point evidence

- Record retained Evidence and snapshot-anchor candidate counts, result cardinalities, traversal truncation, route latency, and peak process/browser memory for the primary journeys.
- Re-run the storage-agnostic repository contract suite unchanged for any proposed replacement.
- Complete an independent retain-or-migrate review against ADR-0018 before M2-F can close.

### Browser acceptance

- Desktop: inventory -> entity -> traversal -> relationship -> Evidence.
- Mobile: search -> entity -> structured topology -> trust inspector -> back navigation.
- Historical: latest identity -> earlier anchor -> pinned URL reload -> return to latest.
- Honest failure: API unavailable or deterministic intercepted error renders a visible, non-stale failure state.

Existing `scripts/verify.sh` remains the only repository verification entry point.

## 12. Required Decisions Before Implementation

The accepted ADRs accompanying this plan are:

- [ADR-0026](adr/0026-m2-browser-architecture-and-api-boundary.md): browser architecture, query-only boundary, runtime validation, routing, proxy, and coordinated reads.
- [ADR-0027](adr/0027-m2-graph-rendering-and-accessibility.md): graph rendering/layout choice and accessible equivalent.
- [ADR-0028](adr/0028-m2-snapshot-navigation-and-trust-contract.md): snapshot-anchor API addition, URL/history semantics, and trust presentation.

Before M2-A may be released:

1. [x] This plan and ADRs 0026–0028 received independent architecture review.
2. [x] Every identified correction was applied while the ADRs remained Proposed, and focused re-review found no remaining blocker.
3. [x] Joseph Carfagno explicitly accepted the final ADR set and approved this plan on 2026-08-12.
4. [x] The approval record merged through PR #34 at `106b1e7`, CI passed, and the local repository was synchronized cleanly.
5. [x] Joseph Carfagno separately released M2-A with the exact scope recorded below on 2026-08-12; the authorization record merged through PR #35 at `c3c661a`, and `main` was synchronized cleanly before implementation began.

### Exact M2-A authorization boundary

**Implementation status:** complete. The bounded M2-A implementation was independently reviewed and remediated, passed the complete local `./scripts/verify.sh`, and merged through PR #36 at `fa38812` with GitHub Actions `verify` passing in 2m36s. This completion does not authorize M2-B.

M2-A may implement only:

- additive browser-facing HTTP/runtime contracts and directly corresponding tests/exports in `packages/shared/src/**`, without changing accepted M1 domain or repository semantics;
- a validated `fetch`/`AbortController` query client, closed error mapping, request cache, single-flight latest-resolution coordinator, complete-pin URL parsing/canonicalization, and routing foundation in `apps/web/src/**`, with directly corresponding tests;
- the exact `/api/health` versus `/api/v1/*` Vite proxy correction in `apps/web/vite.config.ts`;
- the ADR-0026 restricted-import ESLint boundary in `eslint.config.mjs` and a directly corresponding proof that representative forbidden imports fail;
- React Router as the one new pinned third-party dependency, the direct `@atlast/shared` workspace dependency, necessary `apps/web` manifest/TypeScript configuration, and the resulting `pnpm-lock.yaml` changes;
- browser acceptance coverage proving the built preview reaches both `/api/health` and at least one real `/api/v1` route, limited to `tests/acceptance/**`; and
- factual M2-A progress updates in `TASKS.md`, including the required before/after browser bundle size and every ADR-0018 measurement that becomes meaningful in this slice.

M2-A must not implement visible topology application features assigned to M2-B, graph rendering/layout or `@xyflow/react`/`elkjs` from M2-C, the M2-D trust inspector, the M2-E snapshot-anchor API/history UI, M2-F closeout work, API-server production changes, new API routes, fixtures, graph-model/repository/reconciliation/storage changes, connectors, authentication, deployment, real-system access, or M3+ work. It must not alter `scripts/verify.sh`, `scripts/bootstrap.sh`, or accepted ADR text. Implementation output still requires independent review, the complete repository verifier, PR/CI approval, merge, and checkpoint update before any next-slice decision.

### Exact M2-B authorization boundary

**Implementation status:** complete. The bounded M2-B implementation was independently reviewed and remediated, passed the complete local `./scripts/verify.sh`, passed human browser QA, and merged through PR #39 at `9dd507b` with GitHub Actions `verify` passing in 3m0s. This completion does not authorize M2-C.

M2-B may implement only:

- the visible application shell for `/topology` and `/entities/:entityId` in `apps/web/src/**`, replacing the M2-A inert placeholders without changing the existing `/` foundation page beyond navigation needed to enter the topology application;
- Entity inventory and canonical-identifier search using only the M2-A validated query client and the accepted query API, including bounded pagination and opaque cursor handling;
- entity-focused routing and selection using the existing canonical URL state, complete-pin parsing/serialization, React Router foundation, request cache, and single-flight latest-resolution coordinator;
- coordinated latest-to-pinned inventory, search, and entity-detail reads that preserve one complete resolved snapshot identity for the current exploration generation;
- canonical loading, empty, expected API-error, redacted internal-error, retry, and invalid-URL-correction states required by Journey F, with accessible status communication and no stale result relabeled current;
- responsive, keyboard-reachable shell/navigation and structured Entity inventory/search/detail presentation without a graph canvas, traversal workspace, trust inspector, or history controls;
- directly corresponding `apps/web/src/**` unit/component tests and factual M2-B progress updates in `TASKS.md`, including measurements that become meaningful in this slice.

M2-B must not add or upgrade dependencies; change package manifests, the lockfile, shared contracts, API production code/routes, graph-model/repository/reconciliation/storage behavior, fixtures, accepted ADR text, `scripts/verify.sh`, `scripts/bootstrap.sh`, or CI; implement traversal, Relationship graph projection, graph rendering/layout, `@xyflow/react`, `elkjs`, the M2-D trust inspector/Evidence dereferencing/conflict or ambiguity presentation, the M2-E snapshot-anchor API/history playback, M2-F hardening/audit/closeout, connectors, authentication, deployment, real-system access, or M3+ work. Implementation output still requires independent review, the complete repository verifier, PR/CI approval, merge, and checkpoint update before any next-slice decision.

### Exact M2-C authorization boundary

**Implementation status:** complete. The bounded M2-C implementation was independently reviewed and remediated, passed manual browser QA and the complete local `./scripts/verify.sh`, and merged through PR #42 at `a43b0c5` with GitHub Actions `verify` passing in 3m22s. This completion does not authorize M2-D.

M2-C may implement only:

- traversal controls for `direction` (`upstream`/`downstream`), `depth` (1–5), and `minConfidence` (0–1), canonicalized through the existing URL-state foundation, plus bounded traversal reads through the existing validated M2-A query client at the M2-B exploration session's complete resolved snapshot identity;
- a pure domain-to-view adapter that converts validated traversal results into canonically ordered Entity nodes, directed Relationship-claim candidate edges, selection records, missing-endpoint boundary references, and explicit traversal-truncation records without choosing a winning claim or altering domain meaning;
- deterministic layered layout through `elkjs`, with fixed options, canonical adapter input ordering, presentation-only coordinates, and focused determinism/non-mutation tests;
- an interactive viewport through `@xyflow/react` for pan, zoom, node/edge rendering, and selection, without placing domain decisions in React Flow components;
- the normative, keyboard-operable structured topology equivalent required by ADR-0027, covering the same loaded entities, relationships, missing endpoints, and truncation state as the graph viewport;
- one shared selection/focus model across graph and structured views, preserving selected subject, snapshot identity, and traversal bounds when switching `view=graph|list`, with deliberate focus movement and visible controls outside the canvas;
- responsive pane behavior, visible keyboard/touch alternatives, non-color state communication, and `prefers-reduced-motion` handling directly required by ADR-0027 for this slice's surface;
- exact pinned versions of the already-approved `@xyflow/react` and `elkjs` dependencies in `apps/web/package.json`, only the directly resulting `pnpm-lock.yaml` changes, and any necessary `apps/web` TypeScript/test configuration for those packages — no other new dependency or upgrade;
- directly corresponding `apps/web/src/**` unit/component tests, browser acceptance under `tests/acceptance/**` for the primary desktop/mobile traversal journey, and factual M2-C progress and required before/after bundle/latency/memory/cardinality/truncation measurements in `TASKS.md`.

M2-C must not change shared contracts, API production code/routes, graph-model/repository/reconciliation/storage behavior, fixtures, accepted ADR text, `scripts/verify.sh`, `scripts/bootstrap.sh`, or CI; implement the M2-D trust inspector, Evidence dereferencing, detailed assertion/confidence/freshness/validity/rule-trace presentation, or conflict/ambiguity explanation beyond the labels and separate candidate edges needed for honest graph/list rendering; implement M2-E snapshot-anchor API/history playback; perform M2-F hardening/audit/closeout; add connectors, authentication, deployment, real-system access, or M3+ work. Implementation output still requires independent review, the complete repository verifier, human browser/accessibility review, PR/CI approval, merge, and checkpoint update before any next-slice decision.

### Exact M2-D authorization boundary

**Implementation status:** complete. The bounded M2-D implementation was independently reviewed and remediated, passed human browser QA and the complete local `./scripts/verify.sh`, and merged through PR #45 at `a41d799` with GitHub Actions `verify` passing in 3m6s. This completion does not authorize M2-E.

M2-D may implement only:

- an Entity/Relationship trust inspector in `apps/web/src/**`, opened from the existing Entity detail, graph, structured, and exact-Relationship-search surfaces without adding a Relationship API route;
- complete presentation of every selected assertion revision's exact claim kind and fields, numeric confidence, query-time freshness, half-open `[validFrom, validTo)` validity, uncontested/conflicted state and every competing claim, unambiguous/ambiguous state and every near match, and ordered rule trace, without selecting or implying a winning claim;
- provenance citations for the selected assertion, every competing claim, and rule trace, with each Evidence identifier dereferenced individually through the existing validated `GET /api/v1/evidence/{evidenceId}` client function and the resulting Evidence rendered without a fixture, repository, graph-model, or storage side door;
- Relationship rehydration only through the already accepted exact-identifier search/traversal path, accepting only an exact identifier match and failing honestly when absent;
- accessible inspector semantics, deliberate focus movement on open, focus return to the invoking subject on close, keyboard/touch operation, responsive presentation, non-color trust-state communication, and useful status announcements without making routine content noisy;
- canonical loading, partial-Evidence-loading, empty, unavailable, expected API-error, redacted internal-error, retry, and stale-data states that never hide conflict, ambiguity, stale/historical state, truncation, or a failed Evidence citation;
- directly corresponding `apps/web/src/**` unit/component tests and factual M2-D progress plus bundle/latency/memory/Evidence-cardinality measurements in `TASKS.md`.

M2-D must not add or change shared contracts, API production code/routes, graph-model/repository/reconciliation/storage behavior, fixtures, accepted ADR text, dependencies, package manifests, the lockfile, `tests/acceptance/**`, `scripts/verify.sh`, `scripts/bootstrap.sh`, or CI; implement the M2-E snapshot-anchor API/history playback or manufacture historical coordinates; perform M2-F browser-acceptance expansion, hardening, audit, storage decision, or closeout; add connectors, authentication, deployment, real-system access, or M3+ work. Implementation output still requires independent review, the complete repository verifier, human browser/accessibility review, PR/CI approval, merge, and checkpoint update before any next-slice decision.

### Exact M2-E authorization boundary

**Implementation status:** complete. M2-E was independently reviewed with no blockers, passed human desktop/mobile browser QA and the complete repository verifier, and merged through PR #49 at `62eb684` on 2026-08-15 with GitHub Actions `verify` passing in 3m16s. Its closeout through PR #50 subsequently released M2-F.

M2-E may implement only:

- additive shared HTTP schemas and browser client validation for the accepted ADR-0028 `GET /api/v1/snapshot-anchors` request/response contract;
- the one read-only, query-parameter-free `GET /api/v1/snapshot-anchors` API route, composed only from the existing public `EvidenceStore` and `TopologyGraphStore` interfaces exactly as ADR-0028 specifies: one current-watermark read, bounded paging at that fixed horizon, at most 101 snapshot-summary candidate resolutions, newest-first output capped at 100, and honest truncation/empty-store/error behavior;
- API-only history controls in `apps/web/src/**` that load those anchors, display checksum and subject count, select a complete `asOf`/`horizon`/`derivationVersion` pin for every coordinated graph read, preserve copied-link and reload reproducibility, and perform a genuinely new latest request when returning to latest;
- honest historical loading, stale-data, truncation, invalid-copied-coordinate, and failed-pinned-read states that keep the requested identity visible and never silently substitute latest or another snapshot;
- directly corresponding shared/API/web tests plus browser acceptance for complete-pin copied links, historical Relationship-to-Evidence traceability, and no silent latest fallback; and factual fixture cardinality, retained-Evidence count, anchor count/truncation, route latency, result-cardinality, traversal, bundle, and process/browser-memory measurements in `TASKS.md`.

M2-E must not add a repository method; alter graph-model/repository/reconciliation/storage behavior or private implementation fields; expose Evidence or fixture metadata through the anchor route; add Relationship detail, assertion, evidence-chain, or bulk-Evidence routes; change fixtures, accepted ADR text, dependencies, package manifests, the lockfile, `scripts/verify.sh`, `scripts/bootstrap.sh`, or CI; manufacture timeline coordinates or treat anchors as freshness-transition history; perform M2-F hardening, audit, storage decision, or milestone closeout; add connectors, authentication, deployment, real-system access, or M3+ work. Implementation output still requires independent review, the complete repository verifier, human browser/accessibility review, PR/CI approval, merge, and checkpoint update before any next-slice decision.

### Exact M2-F contingent authorization boundary

**Implementation status:** complete. M2-F was independently reviewed and remediated, passed complete local verification and human keyboard, reduced-motion, responsive, failure-recovery, and VoiceOver QA, and merged through PR #51 at `5aeb11d` on 2026-08-16 with GitHub Actions `verify` passing in 3m9s. Post-merge revalidation reran the complete verifier and boundary checks directly against that merge commit.

M2-F became operational only after the M2-E closeout merged and `main` synchronized cleanly. Its completed work was limited to:

- browser-acceptance expansion for the accepted M2 primary journeys, complete-pin history playback, trust inspection, honest failures, keyboard operation, responsive behavior, and reduced motion across the supported desktop and mobile viewports;
- accessibility and responsive hardening of the existing M2 interface without adding new product capabilities or widening the query API;
- final bundle, latency, retained-Evidence/anchor cardinality, traversal-truncation, and process/browser-memory measurements, including explicit review of the tracked lazy graph payload;
- the mandatory independent ADR-0018 retain-or-migrate storage review using recorded M2-A through M2-E measurements, with any migration requiring a new ADR and separate authorization rather than implementation inside M2-F;
- the final synthetic-boundary and no-side-door audit, factual exit-criterion updates, M2 milestone closeout, and directly corresponding tests and documentation.

M2-F did not change domain semantics, repository/reconciliation/snapshot behavior, fixtures, accepted ADR text, dependencies, package manifests, the lockfile, query API behavior, scripts, or CI. It added no product feature, route, connector, authentication, deployment, infrastructure, real-system access, or M3+ behavior. Independent review, the full verifier, human browser/accessibility QA, PR/CI approval, merge, post-merge audit, and checkpoint update have all succeeded. M3 planning is now operational; M3 product implementation still requires its own approved baseline and explicit release.

## 13. Exit Criteria for M2-P

- [x] Existing API capabilities and M2 gaps are accurately inventoried.
- [x] Primary journeys, information architecture, URL model, and snapshot coordination are settled.
- [x] Graph rendering, layout, accessibility, and responsive strategy are settled.
- [x] Trust metadata and failure-state presentation are settled.

- [x] Snapshot playback has an API-only, bounded design.
- [x] ADR-0018's mandatory M2 storage re-evaluation is accepted with an explicit measurement and closeout decision gate.
- [x] Proposed slices and verification obligations were independently reviewed.
- [x] ADRs 0026–0028 and this plan were explicitly human-approved on 2026-08-12.

## 14. M2 Closeout

M2 formally closed on 2026-08-16 at checkpoint `m2-complete` after PR #51 merged at `5aeb11d`, GitHub Actions passed, and the post-merge audit revalidated the exact merged scope, synthetic boundary, no-side-door rule, source hygiene, and complete verifier.

- [x] A user can navigate a synthetic topology, search for entities, and inspect the Evidence behind any edge from the UI alone — proven by the merged inventory, search, entity detail, graph/structured traversal, trust inspector, direct Evidence dereferencing, history playback, and 24 browser acceptance cases across desktop and mobile.
- [x] The UI reads exclusively through the query API, with no fixture, repository, graph-model, or storage side door — proven by the enforced browser import boundary, direct import audit, and post-merge revalidation in [the synthetic-boundary audit § 17](audits/m0-synthetic-boundary-audit.md).

No M2 implementation slice remains active. M3 planning and pre-release architecture/ADR review are authorized; M3 product implementation and M4+ remain unauthorized.
