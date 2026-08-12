# ADR-0026: M2 Browser Architecture and Query-API Boundary

**Status:** Proposed
**Date:** 2026-08-12

## Context

M1 delivered a React/Vite shell and a seven-route, fixture-backed query API. M2 must turn that into a navigable interface while preserving the architecture rule that every consumer reads through the query API. The current web package has no router, no graph dependency, and no shared runtime-contract dependency. Its Vite proxy supports `/api/health` by stripping `/api`; applying that rewrite to `/api/v1/*` would produce invalid backend paths.

The browser also needs multiple coordinated reads to describe one topology view. A cursorless latest call resolves its own snapshot identity, so independently issuing several latest calls can mix coordinates if time or the watermark advances between them.

## Decision

### 1. Keep the existing React/Vite SPA

M2 extends `apps/web`; it does not introduce server rendering, a second frontend, or a separate backend-for-frontend. The app remains loopback-only and synthetic-only.

### 2. Use URL-addressable client routing

Adopt React Router as the routing library for `/`, `/topology`, and `/entities/:entityId`. Search, traversal bounds, selected subject, view mode, and complete snapshot identity live in canonical URL query parameters. Browser back/forward is a required behavior, not an incidental one.

React Router is a proposed new direct dependency of `@atlast/web`; its exact version must be pinned at implementation time and recorded in the implementing PR. No other state-management library is selected: local React state plus route/search parameters are sufficient for M2.

### 3. Add a small validated API client in `apps/web`

The client:

- calls only relative loopback paths under `/api/v1` plus `/api/health`;
- uses `fetch` and `AbortController` rather than another HTTP dependency;
- validates every successful response against the exported `@atlast/shared` Zod schema before exposing it to components;
- validates error responses against the closed `errorResponseSchema`;
- maps malformed/unexpected responses to one redacted client-side internal failure;
- never imports `packages/graph-model`, fixtures, repositories, or API server modules;
- never parses opaque cursors.

`@atlast/web` therefore gains a direct workspace dependency on `@atlast/shared`. Typecheck/test may use an explicit source alias consistent with ADR-0024's workspace convention; production builds resolve the package's real entry point.

### 4. Freeze coordinated reads

The first successful cursorless latest graph response establishes the complete `resolvedIdentity` for the current exploration session. Every dependent inventory, detail, search, traversal, and evidence-chain graph read is pinned to that identity. Evidence lookup remains unpinned because its accepted route carries no snapshot coordinate.

One exploration coordinator owns latest resolution. Panels and route children cannot initiate cursorless latest graph reads independently: concurrent consumers await the same in-flight resolution promise, and only after it validates may they issue pinned dependent reads. A navigation or explicit refresh starts a new generation; obsolete generations cannot publish identity or data.

“Refresh latest” is an explicit action that performs a new latest read and adopts the new identity only after validation succeeds. A failed refresh leaves the prior result visible but clearly labeled as the previous snapshot, with the failure shown; it is never relabeled current.

Every request belongs to a monotonically increasing client generation. Aborted or late responses from an obsolete generation are ignored.

### 5. Enforce the browser import boundary

M2-A adds an ESLint restricted-import rule for `apps/web/src/**` that rejects imports from fixtures, `packages/graph-model`, repository implementations, and API server modules. Direct `@atlast/shared` HTTP schemas remain allowed. The rule and a directly corresponding configuration test or lint fixture must prove that a representative forbidden import fails.

### 6. Correct the local proxy exactly

Vite development and preview proxy rules distinguish:

- `/api/health` -> backend `/health` (legacy shell health alias);
- `/api/v1/*` -> backend `/api/v1/*` unchanged.

No catch-all rewrite strips the `/api` prefix from versioned routes. Browser acceptance must exercise a real versioned API request through the built preview server, not only the health route.

### 7. Keep caching bounded and transparent

M2 uses an in-memory request cache owned by the API-client layer; no new caching library or persistent browser database is introduced. Keys include operation, complete resolved identity, identifiers/filters/bounds, and cursor where applicable. Cache lifetime ends on page reload. The UI always exposes the snapshot identity behind cached graph data.

## Consequences

- The UI cannot bypass query contracts or silently trust malformed payloads.
- One visible workspace cannot mix multiple “latest” identities.
- Deep links and browser navigation are reproducible.
- React Router, `@atlast/shared`, and their lockfile changes require explicit approval with the M2 implementation release.
- The browser bundle includes the shared runtime schemas and Zod; bundle size must be measured during M2-A review.
- This ADR does not authorize implementation.

## Alternatives Rejected

- **Direct fixture or repository imports:** violates the no-side-door rule and M2 exit criteria.
- **Independent latest calls per panel:** can mix snapshot identities.
- **A bespoke router over `history.pushState`:** saves one dependency but recreates route matching, parameter decoding, focus restoration, and navigation semantics without product value.
- **A general data-fetching/cache framework:** unnecessary for the bounded M2 surface; it would add policy before a need is demonstrated.
- **Using `/api/api/v1/*` to preserve the old proxy rewrite:** leaks a development workaround into application paths and conflicts with the accepted API surface.

## Verification Obligations

- Runtime schema rejection tests for malformed success and error payloads.
- Complete-pin URL parser tests: all three identity fields or none.
- Latest-to-pinned coordination tests across multiple calls.
- Single-flight initial/latest-resolution tests proving concurrent panels share one cursorless graph request.
- Abort/late-response race tests.
- Lint-boundary proof rejecting representative fixture, graph-model, repository, and API-server imports from `apps/web/src/**`.
- Browser back/forward and copied-URL acceptance tests.
- Built preview -> real API tests for `/api/health` and at least one `/api/v1` route.
