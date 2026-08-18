# ADR-0033: M4 Impact Query API Contract

**Status:** Accepted
**Date:** 2026-08-17

> **Approval note (2026-08-17):** Drafted under Joseph Carfagno's 2026-08-17 authorization of M4 planning and pre-release architecture/ADR review only ([TASKS.md](../../TASKS.md), [HANDOFF.md](../../HANDOFF.md)), depending on [ADR-0032](0032-m4-change-impact-domain-model.md)'s domain model, independently reviewed and corrected, then **explicitly accepted by Joseph Carfagno on 2026-08-17** as part of the M4 implementation baseline alongside [docs/m4-plan.md](../m4-plan.md) and ADRs 0032/0034/0035. Acceptance becomes operational only after this record merges to `main` and local `main` is synchronized cleanly. Acceptance does not release M4-B and does not authorize M5+.

## Context

The browser may read graph facts only through the query API ([GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards), "no side doors"). ADR-0030 already established the pattern for a server-composed read that joins one bounded traversal with one additional deterministic engine and returns everything the browser needs in one validated envelope, without letting the browser recompute domain policy. ADR-0032's impact engine is the same shape of composition: one traversal, one pure deterministic transform, one response.

## Decision

### 1. Add one composed read route

Add:

`GET /api/v1/entities/{entityId}/impact`

The route accepts:

- required `direction` and `depth`, with the existing traversal bounds and wire coercion (ADR-0024 §§ 3–4) unchanged;
- optional `minConfidence`, with the existing wire semantics and internal `minimumConfidence` mapping unchanged;
- required `changeType`, one of `removal`, `degradation`, `interface-change` (ADR-0032 § 2), coerced from a scalar query string through a new closed-enum coercion helper following the existing `asOptionalScalarString`/`parseOrThrow` pattern — except `changeType` is **required**, not optional, because it completes PROJECT_SPEC's "entity X changes in way Y" question even though ADR-0032 deliberately keeps it out of ranking math;
- the existing all-or-none `asOf`, `horizon`, and `derivationVersion` pin.

No `limit` or `cursor` key is accepted — impact results are bounded by the same 500-subject traversal budget as traversal itself, exactly as the existing traversal route accepts neither key (ADR-0024 § 2). Unknown and repeated query keys are rejected per the existing `rejectUnknownQueryKeys` boundary. The route is loopback-only, read-only, and exposes no mutation, bulk, or fixture endpoint.

### 2. Compose one traversal with one pure ranking pass

The handler resolves topology by exactly one `TopologyGraphStore.traverse` call, identical to the traversal and health-context routes. It performs no second traversal and no additional repository read — the impact engine (`packages/impact-model`, ADR-0032) is a pure function over the traversal result, the origin identifier, and validated bounds. The handler validates and echoes `changeType` but does not pass it into the engine. The engine needs no store access at all, which is a stricter (simpler) composition boundary than health-context's, since health-context also resolves and validates an overlay frame.

The exact response envelope is:

```ts
{
  data: {
    originEntityIdentifier: EntityIdentifier;
    changeType: ImpactChangeType;
    items: SubjectReadResult[];
    results: ImpactResult[];
  };
  traversal: TraversalResultMetadata;
  meta: ResolvedReadMetadata;
}
```

`items` and `traversal` are the unchanged traversal output, reused exactly as ADR-0030 reuses them; as the repository contract already guarantees, `items` excludes the origin. `results` is the ranked list ADR-0032 § 3–4 defines:

```ts
{
  entityIdentifier: EntityIdentifier;
  rankScore: number;       // [0, 1], the selected path's bottleneck confidence
  pathEdgeCount: number;   // integer >= 1 and exactly equal to path.length
  path: ImpactPathStep[];  // nonempty, ordered
}
```

Each `ImpactPathStep` is the identical strict shape ADR-0029 already defined for latent-risk derivation: `{ sourceEntityIdentifier, targetEntityIdentifier, relationshipIdentifier, assertionIdentifier }`. `rankScore` is finite and within `[0, 1]`; `path` is nonempty; and `pathEdgeCount` is an integer at least 1 that must equal `path.length`. `results` is ordered exactly per ADR-0032 § 4. `meta` is the existing `ResolvedReadMetadata` shape, unchanged — no overlay-style metadata extension is needed, since impact carries no second temporal coordinate (unlike health-context's overlay-frame identity).

An empty `results` array is a valid `200` response, never an error (ADR-0032 § 5). Relationship subjects appearing in `items` receive no impact ranking of their own — ranking is Entity-scoped only (ADR-0032 § 1); Relationship subjects remain available as path evidence exactly as they are for health-context.

### 3. Keep the ranking server-authoritative

The API, not the browser, computes eligible edges, path search, rank scores, and ordering. The browser validates and presents the result without recomputing it — the identical authority split ADR-0030 § 3 established for health-context. The endpoint never calls a private repository implementation, fixture path, or graph-model internal, and `packages/impact-model` is never imported directly by `apps/web` (enforced by extending the existing ESLint restricted-import boundary, ADR-0026, to also cover `@atlast/impact-model` and `packages/impact-model`, exactly as it already covers `@atlast/overlay-model`).

`initializeApplication` requires no new store dependency: `packages/impact-model` is a pure function module, not a store, so it is imported directly by the route handler (or a thin composition helper) rather than injected as a dependency — this is a narrower composition than health-context's, which does require an injected `OperationalOverlayStore`.

### 4. Reuse the closed error boundary exactly, with one narrow addition

No new error code is introduced by the ranking computation itself. An impact query can fail in the same ways as the underlying pinned or latest traversal: `UNKNOWN_IDENTIFIER`, `HORIZON_BEFORE_FIRST_EVIDENCE`, `HORIZON_AFTER_CURRENT_WATERMARK`, `UNSUPPORTED_DERIVATION_VERSION`, and `MALFORMED_REQUEST` for schema-invalid input. `INVALID_CURSOR` and `CURSOR_BINDING_MISMATCH` are unreachable because this route accepts no cursor. `changeType` validation failure (missing, unknown token, or repeated key) is `MALFORMED_REQUEST`, mapped through the identical `sendValidatedError`/`errorResponseSchema` path every other malformed parameter already uses — no new `code` literal is added to the closed error union. This is a smaller error surface than ADR-0030 introduced for health-context because impact has no second temporal coordinate to validate.

### 5. Preserve latest and pinned behavior identically to traversal

The route supports an unpinned latest request for non-browser consumers, resolving one traversal identity exactly as the existing traversal route does. The browser does not use the cursorless composition path directly: in latest URL mode, it first uses the existing M2 single-flight coordinator to establish one latest topology identity (or reuses an already-established one, e.g. from an open trust inspector), then issues the impact request pinned to that identity, exactly as ADR-0030 § 5 requires for health-context. Before publishing impact data, the browser validates that the response's resolved identity matches the identity it pinned against; a mismatch is an impact-query failure, and the already-rendered topology remains visible and retryable — the identical honesty rule ADR-0030 § 5 and ADR-0031 § 1 already establish for health-context.

## Consequences

- The API surface grows by one route; per [CLAUDE.md](../../CLAUDE.md), this requires explicit baseline approval and a separately released slice, exactly as every prior M2/M3 route addition did.
- Impact responses can be as large as a full traversal response plus a ranked list bounded by the same subject count — no new payload-size risk class is introduced, but M4-B must measure it exactly as M3-C measured health-context's cost (ADR-0030 § Consequences).
- Because ranking requires no repository read of its own, this route is strictly cheaper to compose than health-context, at the cost of the widest-path search's higher algorithmic complexity than health-context's fixed-path derivation (bounded by the same 500-subject budget either way).
- A caller cannot ask "what is affected across every change type at once" in one request; each request names exactly one `changeType`. This keeps the response shape simple and matches PROJECT_SPEC § 4's singular "if entity X changes in way Y" framing; a caller wanting multiple change types issues multiple requests.

## Alternatives Rejected

- **Add impact fields to the existing traversal route:** widens a stable M1/M2 contract and makes basic traversal depend on a required `changeType` parameter it has no use for; rejected for the same reason ADR-0030 rejected widening every topology route with health fields.
- **Optional `changeType` with a default:** there is no non-arbitrary default among `removal`/`degradation`/`interface-change`; requiring it is more honest than silently picking one.
- **A bulk "impact of removing any of these N entities" batch route:** unbounded fan-out risk and no established product need; rejected as premature scope, consistent with M2/M3's repeated rejection of unbounded or bulk routes.
- **Paginate `results`:** the ranked list is already bounded by the existing 500-subject traversal budget; adding a second pagination mechanism duplicates `traversal.truncated`'s existing truncation signal for no benefit.
- **Let the browser compute ranking from a plain traversal response:** creates a second, non-authoritative ranking engine in the client, exactly the anti-pattern ADR-0030 § Alternatives Rejected already rejected for health projection.

## Verification Obligations

- Exact parameter matrix, repeated-key, unknown-key, and coercion tests for `direction`, `depth`, `minConfidence`, and the new `changeType` enum.
- Latest, complete pin, and unknown-origin tests, reusing the existing traversal test fixtures.
- Exact envelope and `ImpactResult` schema validation, including finite `[0, 1]` scores, nonempty paths, `pathEdgeCount === path.length`, empty-`results`, single-path, and multi-path scenarios.
- One-traversal-call, zero-additional-repository-read assertions (a stricter version of ADR-0030's "no redundant in-scope target reads" obligation).
- Closed error mapping tests: `changeType` missing, unknown, or repeated — all `MALFORMED_REQUEST`; plus `UNKNOWN_IDENTIFIER`, both horizon-boundary errors, and `UNSUPPORTED_DERIVATION_VERSION`; cursor errors remain unreachable.
- `changeType`-invariance tests at the HTTP boundary (ADR-0032 § Verification Obligations), proving the wire contract does not leak change-type-dependent ranking.
- Clean built-server runtime proof with the fully assembled application (including the new route), exactly as ADR-0024 § 14's build/runtime strategy already requires of the whole application.
- Tests proving existing routes, topology checksums, and the traversal route's own behavior are unchanged.

## Change Conditions

Revisit before: a batch/bulk impact route; pagination of `results`; any second temporal coordinate for impact (there is none today, unlike health-context's overlay frame); an LLM-generated natural-language explanation layer over impact results (requires its own ADR and separate human approval per docs/architecture.md § 3.7); or a Relationship-origin impact query.

This Accepted ADR does not authorize implementation. M4-B (§ [docs/m4-plan.md](../m4-plan.md)) requires a separate, explicit implementation release.
