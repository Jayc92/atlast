# Atlast M2 Implementation Plan — Interactive Topology Interface

**Status:** Approved and operational through PR #34 at `106b1e7`; M2-A separately authorized on 2026-08-12, pending its authorization-record merge
**Date:** 2026-08-12

> **Approval and authorization boundary:** Joseph Carfagno explicitly approved this plan and accepted ADRs 0026–0028 on 2026-08-12 after independent architecture review, correction, and focused re-review found no remaining blockers. The approval record merged through PR #34 at `106b1e7`, and `main` was synchronized locally with a clean working tree. Joseph then separately authorized M2-A on 2026-08-12. That release becomes operational only after its own documentation record merges and `main` is again synchronized cleanly. M2-B through M2-F and M3+ remain gated and unauthorized.

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

ADR-0018 requires M2 planning to re-evaluate fixture-backed in-memory storage against measured interactive query patterns. The planning decision is to **retain the accepted in-memory implementation provisionally through M2**: all state remains synthetic and regenerable, every existing collection read is bounded, the repository contract suite remains storage-agnostic, and M2 introduces no durable writes or concurrency requirement that currently justifies SQLite or another engine.

That conclusion is conditional rather than open-ended. M2-A through M2-E must record the fixture catalog size, retained Evidence count, result cardinalities, traversal truncation, snapshot-anchor candidate count, route latency, and peak process/browser memory for the primary desktop and mobile journeys. ADR-0028's retained-Evidence scan is an explicit measurement target. Before M2-F closeout, an independent storage review must compare those measurements with ADR-0018's change conditions and record one of two outcomes:

1. retain in-memory storage for the measured M2 workload, with the evidence recorded in the M2 closeout; or
2. propose a separate storage ADR and explicitly authorized migration slice before M2 can close.

Durable non-regenerable state, fixture or interactive latency/memory exceeding comfortable local use, or measured traversal/temporal patterns materially better served by another engine trigger option 2. A storage migration is not authorized by this plan.

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

M2-A was separately and explicitly authorized by Joseph Carfagno on 2026-08-12. Its release becomes operational only after the documentation record of that authorization merges and `main` is synchronized locally with a clean working tree. M2-B through M2-F remain gated.

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
5. [x] Joseph Carfagno separately released M2-A with the exact scope recorded below on 2026-08-12; that release becomes operational only after its authorization record merges and `main` is synchronized cleanly.

### Exact M2-A authorization boundary

M2-A may implement only:

- additive browser-facing HTTP/runtime contracts and directly corresponding tests/exports in `packages/shared/src/**`, without changing accepted M1 domain or repository semantics;
- a validated `fetch`/`AbortController` query client, closed error mapping, request cache, single-flight latest-resolution coordinator, complete-pin URL parsing/canonicalization, and routing foundation in `apps/web/src/**`, with directly corresponding tests;
- the exact `/api/health` versus `/api/v1/*` Vite proxy correction in `apps/web/vite.config.ts`;
- the ADR-0026 restricted-import ESLint boundary in `eslint.config.mjs` and a directly corresponding proof that representative forbidden imports fail;
- React Router as the one new pinned third-party dependency, the direct `@atlast/shared` workspace dependency, necessary `apps/web` manifest/TypeScript configuration, and the resulting `pnpm-lock.yaml` changes;
- browser acceptance coverage proving the built preview reaches both `/api/health` and at least one real `/api/v1` route, limited to `tests/acceptance/**`; and
- factual M2-A progress updates in `TASKS.md`, including the required before/after browser bundle size and every ADR-0018 measurement that becomes meaningful in this slice.

M2-A must not implement visible topology application features assigned to M2-B, graph rendering/layout or `@xyflow/react`/`elkjs` from M2-C, the M2-D trust inspector, the M2-E snapshot-anchor API/history UI, M2-F closeout work, API-server production changes, new API routes, fixtures, graph-model/repository/reconciliation/storage changes, connectors, authentication, deployment, real-system access, or M3+ work. It must not alter `scripts/verify.sh`, `scripts/bootstrap.sh`, or accepted ADR text. Implementation output still requires independent review, the complete repository verifier, PR/CI approval, merge, and checkpoint update before any next-slice decision.

## 13. Exit Criteria for M2-P

- [x] Existing API capabilities and M2 gaps are accurately inventoried.
- [x] Primary journeys, information architecture, URL model, and snapshot coordination are settled.
- [x] Graph rendering, layout, accessibility, and responsive strategy are settled.
- [x] Trust metadata and failure-state presentation are settled.
- [x] Snapshot playback has an API-only, bounded design.
- [x] ADR-0018's mandatory M2 storage re-evaluation is accepted with an explicit measurement and closeout decision gate.
- [x] Proposed slices and verification obligations were independently reviewed.
- [x] ADRs 0026–0028 and this plan were explicitly human-approved on 2026-08-12.
