# ADR-0017: M1 Query API Surface — Purpose-Built, Bounded, Evidence-Linked REST Contract

**Status:** Accepted
**Date:** 2026-07-23

> **Approval note (2026-07-23):** Accepted by human review as part of the **M1 architecture baseline**. Acceptance settles the M1 query-API design only — it does **not** authorize implementation. M1 implementation requires a separate, explicit human authorization ([docs/milestones.md](../milestones.md)).

## Context

The query API is the single read contract for every consumer — "no side doors" is a hard rule ([GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards), [architecture § 3.6](../architecture.md#36-query-api)). M1's exit criteria require query API v1: inventory, search, traversal, time travel, with every fact traceable to its synthetic evidence via the API ([docs/milestones.md M1](../milestones.md#m1--synthetic-topology-model-gated)). The open question "expose a standard graph query language, a purpose-built API, or both?" is assigned to this ADR ([architecture § 7](../architecture.md#7-open-questions)). The M0 API shell (Fastify per ADR-0004, schema-per-route) and the shared-schema mechanism (ADR-0005) are the accepted foundation. The M0 localhost authentication exemption ([GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security)) carries through M1: the API remains loopback-only, synthetic-data-only, and unauthenticated until the separately approved authentication ADR that must precede any externally reachable deployment.

## Problem

Define the M1 read contract precisely enough that integration tests can serve as its executable specification, bounded enough that no request can degrade the service or bypass honesty metadata, and shaped so consumers (the M2 UI first) never need a side door.

## Decision (proposed)

### Style: purpose-built REST, JSON, versioned path prefix

A purpose-built HTTP/JSON API under `/api/v1/`, one Fastify route per query family, request and response shapes defined as Zod schemas in `packages/shared` (ADR-0005) and validated on both directions. **No GraphQL, no Cypher/Gremlin/openCypher endpoint, no generic query-expression parameter in M1** (rationale under Alternatives).

### Query families (the complete M1 surface)

| Family           | Shape (proposed)                                                                | Purpose                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Inventory        | `GET /api/v1/entities`                                                          | List entities; filter by type and status; paginated                                                               |
| Entity detail    | `GET /api/v1/entities/{entityId}`                                               | One entity with full provenance, confidence, freshness, conflicts, ambiguity                                      |
| Search           | `GET /api/v1/search?q=…`                                                        | Deterministic normalized-substring match over identifiers and names; paginated                                    |
| Traversal        | `GET /api/v1/entities/{entityId}/traversal`                                     | Upstream/downstream within explicit `direction`, `depth`, `minConfidence` bounds                                  |
| Evidence lookup  | `GET /api/v1/evidence/{evidenceId}`; `GET /api/v1/entities/{entityId}/evidence` | Provenance chain for any fact                                                                                     |
| Snapshots        | `GET /api/v1/snapshots?asOf=…&horizon=…&derivationVersion=…`                    | Snapshot checksum and summary; **requires the complete (asOf, horizon, derivationVersion) identity** per ADR-0016 |
| As-of everywhere | `asOf`, `horizon`, `derivationVersion` accepted by every graph read             | Time travel is a parameter of every family, not a separate API                                                    |

### Pinned and latest reads

Every graph read runs in one of two explicit modes:

- **Latest (unpinned) convenience reads** — no pin parameters supplied. The server resolves `asOf` to the injected current time, `horizon` to the evidence store's current watermark (the highest `recordedSequence`, per ADR-0016), and `derivationVersion` to the active policy version. Convenient for interactive use; **not reproducible by contract**, since later Evidence changes what "latest" resolves to.
- **Pinned (reproducible) reads** — the request supplies (or a cursor binds, below) `asOf`, `horizon`, and `derivationVersion`. Pinned reads are the reproducibility contract: identical fully pinned requests return **byte-identical** responses.

In **both** modes, every response's `meta` returns the fully **resolved** (asOf, horizon, derivationVersion) triple, so any latest read can be re-issued later as a pinned read of exactly what was seen. Snapshot endpoints accept no unpinned mode: they require the complete identity.

### Bounds — nothing unbounded, by schema

- **Pagination is mandatory** on every collection response: cursor-based, with schema-enforced limits. **Cursors bind the complete snapshot identity (asOf, horizon, derivationVersion) plus the request's filters, ordering, and page size** — a paginated walk is a walk over one pinned snapshot, so Evidence arriving mid-walk cannot change, duplicate, or drop results, and a cursor presented with mismatched parameters is rejected with a structured error.
- **Traversal depth is required and capped**, and traversal responses report whether the cap truncated the result — truncation is visible, never silent.
- Search queries have schema-enforced minimum/maximum lengths.
- The exact M1 limits, enforced by the shared schemas:
  - **Page size:** default **25**, maximum **100** items per page.
  - **Traversal depth:** required, minimum **1**, maximum **5** hops.
  - **Traversal result budget:** maximum **500** subjects per traversal response (truncation flagged).
  - **Search query length:** minimum **2**, maximum **256** characters.

  Changing a limit is a contract change reviewed like any schema change; limits are not deferred to implementation.

### Response envelope — stable and honest

Every response uses one envelope shape: `data`, `page` (cursor metadata where applicable), and `meta` carrying the fully resolved snapshot identity (`asOf`, `horizon`, `derivationVersion`), the `schemaVersion`, and the snapshot checksum when applicable. Within `data`:

- **Subjects are serialized with their supporting GraphAssertion revisions (ADR-0014) — never bare.** Every revision carries its content-addressed identifier, confidence, rule trace, conflict/ambiguity state, and provenance links — the Evidence lookup URLs for its supporting Evidence — and is accompanied by its **query-time freshness classification**, computed at the resolved `asOf` (response data, not part of the immutable revision). **Every M1 graph route returns only revisions whose validity interval contains the resolved `asOf`** — time travel is performed by pinning different `asOf` values, and no M1 response ever contains a superseded revision. A response missing any of this cannot validate against the response schema; the guardrail is structural.
- **Conflicts and ambiguity markers (ADR-0015) are serialized in-band**, not filtered out — a consumer cannot receive a cleaned-up graph.
- **Deterministic ordering:** every collection is totally ordered by a documented key (default: identifier ascending after any explicit sort), so identical requests return identical bytes — this is what makes the acceptance suite meaningful.

### Validation and errors

- Requests failing schema validation → `400` with a structured body naming each invalid field. Unknown entity/evidence IDs → `404` with the requested identifier echoed. Semantically invalid time parameters (e.g., horizon before first Evidence) → `422` with explanation. **No empty-default responses on failure** ([GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards)); errors are explicit, structured, and per-field.
- Error responses share a single structured error schema (code, message, details) defined in `packages/shared`.

### Consumers and the no-side-door rule

- The web application consumes **only** these routes through the existing loopback proxy; `apps/web` gains no direct import of `packages/graph-model` and no alternative data path. The dependency direction is enforceable in review and lintable later.
- The API implementation itself reads only through the ADR-0012 repository interfaces — the API is a consumer of the contract, not of storage.

### Explicitly deferred

Overlay queries (M3), impact queries (M4), mutation of any kind (never, for observed systems), authentication (separate ADR before any non-loopback exposure), any generic graph-query language, and **a dedicated assertion-history route** (returning superseded revisions outside their validity, marked with the reserved `superseded` temporal state per ADR-0016). The history route is deferred beyond M1: the seven families above are the complete M1 surface, and M1 time travel is pinned-snapshot queries at different `asOf` values. M2 history playback is the expected trigger for adding the bounded history route.

## Alternatives Considered

- **GraphQL** — the strongest alternative: typed schema, client-shaped responses, one round trip for nested provenance. Rejected for M1: arbitrary client-composed queries make cost bounding and deterministic-bytes guarantees materially harder; resolver-level N+1 discipline adds complexity; and the honest-metadata rule ("you cannot ask for the graph without its confidence") is easier to enforce when the server shapes every response. Re-evaluate when a second, independently evolving consumer exists.
- **A standard graph query language endpoint (Cypher/Gremlin/openCypher)** — expressive power without bespoke routes, but it couples the public contract to a query-engine choice before ADR-0018 has even selected storage, cannot be schema-bounded the way fixed routes can, and would let consumers express traversals the honesty envelope can't annotate. Deferred until measured query patterns demand it (the architecture already prescribes: if the API can't express a needed query, the API grows).
- **Both (REST + query language)** — doubles the contract surface and test burden at M1 for zero additional consumers.
- **RPC-style verbs (`/queries/traverse` POST bodies)** — equivalent power, slightly better for complex parameters, but plain resource GETs are more boring, cacheable, and curl-able; complex parameter growth would trigger revisiting this shape.

## Tradeoffs

- **Chosen:** a small, fully schema-validated, fully bounded contract whose integration tests are its executable specification; honesty metadata structurally unavoidable; deterministic responses.
- **Given up:** client query flexibility (consumers get exactly seven families), response-shape tailoring (envelope is fixed), and single-round-trip nested fetches (provenance is linked, not embedded beyond one level — a deliberate bias toward small bounded payloads).

## Consequences

- The M2 UI's data needs must be expressible through these families; gaps discovered during M2 grow this API via contract-first review rather than side doors.
- Every route's schema lives in `packages/shared`, making API evolution visible in the most-reviewed package.
- The integration suite (ADR-0009) doubles as the API's executable specification, including error and bound-violation cases.

## Risks

- **Surface too small for M2.** Likely in places; the mitigation is the established one — grow the API, never bypass it. Traversal and search parameters are the expected pressure points.
- **Bounded traversal makes some questions multi-request.** Accepted: visible truncation plus cursoring beats unbounded queries that can't be capacity-planned.
- **Envelope rigidity.** A fixed envelope resists ad-hoc needs; that friction is the point, but it must not become an excuse to smuggle data through `meta` — review guards this.

## Testable Invariants and Acceptance Evidence

1. Every assertion revision in every response carries its content-addressed identifier, confidence, rule trace, conflict/ambiguity state, at least one provenance link, and an accompanying query-time freshness classification; no subject appears without a supporting revision (response-schema validation in contract tests).
2. No route returns an unbounded collection; the exact page-size, traversal-depth, traversal-budget, and search-length limits above are enforced and truncation is flagged.
3. Identical **fully pinned** requests (equal `asOf`, `horizon`, `derivationVersion`, filters, ordering, page size) return byte-identical responses; every response's `meta` carries the resolved triple, in both pinned and latest modes.
4. A paginated walk started from a pinned first page is unaffected by Evidence recorded after its horizon: no result changes, duplicates, or drops mid-walk; a cursor replayed with mismatched parameters is rejected with a structured error.
5. Snapshot endpoints reject requests missing any component of the (asOf, horizon, derivationVersion) identity.
6. Conflicted and ambiguous assertions appear in responses with their markers; no query family filters them silently.
7. Every assertion's provenance links dereference to Evidence records that support it (round-trip traceability — the M1 exit criterion, tested).
8. Schema-invalid requests yield structured `400`s naming each invalid field; no route returns an empty default on failure.
9. The server binds to `127.0.0.1` only, unchanged from M0; no route mutates anything (the API defines no write verbs on graph resources); all data remains synthetic.

**Acceptance evidence at review time:** this document plus the API journeys and acceptance checks in [docs/m1-plan.md](../m1-plan.md).

## Dependencies on Other Proposed ADRs

- **ADR-0014** supplies the subject and GraphAssertion shapes and identifier scheme serialized here.
- **ADR-0015** supplies conflict/ambiguity/confidence semantics this contract must expose unfiltered.
- **ADR-0016** supplies the (asOf, horizon, derivationVersion) snapshot identity and canonical serialization; the pin parameters' meanings are defined there, not here.
- **ADR-0018** must make bounded traversal and as-of reads efficient enough at synthetic scale; this contract deliberately avoids assuming any storage capability beyond the ADR-0012 interfaces.

## Why This Fits Atlast

- **No side doors, structurally:** one contract, schema-enforced, consumed identically by UI, tests, and future integrations.
- **Confidence is a first-class value:** the envelope makes it impossible to read the graph without its honesty metadata.
- **Boring core:** seven REST families a reviewer can hold in their head, deferring query-language ambition until evidence demands it.

## Conditions That Would Justify Changing This Decision

- A second independent consumer whose needs demonstrably outgrow server-shaped responses — the GraphQL re-evaluation trigger.
- Measured query patterns (M2+) that fixed families express only awkwardly — grows this API or, at sustained pressure, justifies a query-language endpoint as an addition governed by its own ADR.
- The authentication ADR (pre-external exposure) — will wrap this surface and may adjust error semantics for authorization failures.
