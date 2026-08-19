/**
 * The validated `fetch`/`AbortController` query client (ADR-0026 § 3). One
 * function per accepted route plus `/health`. Every function:
 *
 * - calls only a relative loopback path under `/api/v1` or `/api/health`;
 * - takes an `AbortSignal` the caller owns, so requests are always abortable;
 * - validates a successful response against the route's exact
 *   `@atlast/shared` schema, and an unsuccessful one against the closed
 *   `errorResponseSchema`, before returning anything to a caller;
 * - collapses any network failure, non-JSON body, or schema mismatch into
 *   one redacted `client-internal-failure` (ADR-0026 § 3) — never a raw
 *   exception message;
 * - never parses an opaque pagination cursor: `cursor` is threaded through
 *   as an opaque string, exactly as received from a prior page.
 *
 * This module never imports `packages/graph-model`, fixtures, repository
 * implementations, or `apps/api` — it reaches the graph only over HTTP,
 * through schemas exported by the already-approved `@atlast/shared`
 * dependency (GUARDRAILS.md § 2: no side doors).
 */
import {
  entityPageSchema,
  errorResponseSchema,
  evidenceChainResultSchema,
  evidenceDetailResultSchema,
  healthCheckResultSchema,
  healthContextResultSchema,
  impactResultEnvelopeSchema,
  snapshotAnchorsResultSchema,
  snapshotDetailResultSchema,
  subjectDetailResultSchema,
  subjectPageSchema,
  traversalResultSchema,
  type EntityPage,
  type EvidenceChainResult,
  type EvidenceDetailResult,
  type HealthCheckResult,
  type HealthContextResult,
  type ImpactChangeType,
  type ImpactResultEnvelope,
  type OverlayFrameIdentifier,
  type SnapshotDetailResult,
  type SnapshotAnchorsResult,
  type SnapshotIdentity,
  type SubjectDetailResult,
  type SubjectPage,
  type TraversalResult,
} from "@atlast/shared";
import { isAbortError, type ClientQueryResult } from "./errors.ts";

/**
 * The minimal shape every response schema this module consumes must have —
 * satisfied by any Zod schema's `safeParse`, without this module needing its
 * own `zod` dependency; every schema used here already lives inside
 * `@atlast/shared`, which does depend on `zod` (mirrors the identical
 * `ParseableSchema` pattern `apps/api/src/http/query-coercion.ts` uses for
 * the same reason on the server side).
 */
interface ParseableSchema<Output> {
  safeParse(
    value: unknown,
  ): { success: true; data: Output } | { success: false };
}

/**
 * The fixed wire query-parameter names (ADR-0024 § 4) this client constructs
 * requests with — the same accepted vocabulary `apps/api`'s
 * `WIRE_QUERY_PARAM` uses, restated here rather than imported, since
 * `apps/web` must never import an `apps/api` module (GUARDRAILS.md § 2).
 */
const WIRE_QUERY_PARAM = {
  q: "q",
  entityType: "entityType",
  direction: "direction",
  depth: "depth",
  minConfidence: "minConfidence",
  limit: "limit",
  cursor: "cursor",
  asOf: "asOf",
  horizon: "horizon",
  derivationVersion: "derivationVersion",
  overlayFrame: "overlayFrame",
  changeType: "changeType",
} as const;

/** Stable identifiers contain literal `/` and `:` (ADR-0024 § 5); every path segment is percent-encoded individually, never the whole path. */
function encodeIdentifierPathSegment(identifier: string): string {
  return encodeURIComponent(identifier);
}

function appendPin(
  params: URLSearchParams,
  identity: SnapshotIdentity | undefined,
): void {
  if (identity === undefined) {
    return;
  }
  params.set(WIRE_QUERY_PARAM.asOf, identity.asOf);
  params.set(WIRE_QUERY_PARAM.horizon, String(identity.horizon));
  params.set(WIRE_QUERY_PARAM.derivationVersion, identity.derivationVersion);
}

function appendPage(
  params: URLSearchParams,
  page: { readonly limit?: number; readonly cursor?: string } | undefined,
): void {
  if (page?.limit !== undefined) {
    params.set(WIRE_QUERY_PARAM.limit, String(page.limit));
  }
  if (page?.cursor !== undefined) {
    // Opaque: passed through verbatim, never decoded or inspected.
    params.set(WIRE_QUERY_PARAM.cursor, page.cursor);
  }
}

async function fetchValidated<Data>(
  path: string,
  successSchema: ParseableSchema<Data>,
  signal: AbortSignal,
): Promise<ClientQueryResult<Data>> {
  let response: Response;
  try {
    response = await fetch(path, { signal });
  } catch (caughtError) {
    if (isAbortError(caughtError)) {
      return { ok: false, error: { kind: "aborted" } };
    }
    return { ok: false, error: { kind: "client-internal-failure" } };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: { kind: "client-internal-failure" } };
  }

  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(payload);
    if (!parsedError.success) {
      return { ok: false, error: { kind: "client-internal-failure" } };
    }
    return { ok: false, error: { kind: "api-error", error: parsedError.data } };
  }

  const parsedSuccess = successSchema.safeParse(payload);
  if (!parsedSuccess.success) {
    return { ok: false, error: { kind: "client-internal-failure" } };
  }
  return { ok: true, data: parsedSuccess.data };
}

/** `GET /health` — the M0 endpoint, validated the same way as every M1 route (ADR-0026 § 3). */
export function fetchHealth(
  signal: AbortSignal,
): Promise<ClientQueryResult<HealthCheckResult>> {
  return fetchValidated("/api/health", healthCheckResultSchema, signal);
}

export interface EntityInventoryParams {
  readonly entityType?: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly identity?: SnapshotIdentity;
}

/** `GET /api/v1/entities` (route 1). */
export function fetchEntityInventory(
  params: EntityInventoryParams,
  signal: AbortSignal,
): Promise<ClientQueryResult<EntityPage>> {
  const query = new URLSearchParams();
  if (params.entityType !== undefined) {
    query.set(WIRE_QUERY_PARAM.entityType, params.entityType);
  }
  appendPage(query, params);
  appendPin(query, params.identity);
  return fetchValidated(
    `/api/v1/entities?${query.toString()}`,
    entityPageSchema,
    signal,
  );
}

/** `GET /api/v1/entities/{entityId}` (route 2). */
export function fetchEntityDetail(
  entityId: string,
  identity: SnapshotIdentity | undefined,
  signal: AbortSignal,
): Promise<ClientQueryResult<SubjectDetailResult>> {
  const query = new URLSearchParams();
  appendPin(query, identity);
  return fetchValidated(
    `/api/v1/entities/${encodeIdentifierPathSegment(entityId)}?${query.toString()}`,
    subjectDetailResultSchema,
    signal,
  );
}

export interface SearchParams {
  readonly q: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly identity?: SnapshotIdentity;
}

/** `GET /api/v1/search` (route 3). */
export function fetchSearch(
  params: SearchParams,
  signal: AbortSignal,
): Promise<ClientQueryResult<SubjectPage>> {
  const query = new URLSearchParams();
  query.set(WIRE_QUERY_PARAM.q, params.q);
  appendPage(query, params);
  appendPin(query, params.identity);
  return fetchValidated(
    `/api/v1/search?${query.toString()}`,
    subjectPageSchema,
    signal,
  );
}

export interface TraversalParams {
  readonly direction: "upstream" | "downstream";
  readonly depth: number;
  readonly minConfidence?: number;
  readonly identity?: SnapshotIdentity;
}

/** `GET /api/v1/entities/{entityId}/traversal` (route 4) — no `limit`/`cursor`: bounded by `depth` and the 500-subject budget instead (ADR-0024 § 2). */
export function fetchTraversal(
  entityId: string,
  params: TraversalParams,
  signal: AbortSignal,
): Promise<ClientQueryResult<TraversalResult>> {
  const query = new URLSearchParams();
  query.set(WIRE_QUERY_PARAM.direction, params.direction);
  query.set(WIRE_QUERY_PARAM.depth, String(params.depth));
  if (params.minConfidence !== undefined) {
    query.set(WIRE_QUERY_PARAM.minConfidence, String(params.minConfidence));
  }
  appendPin(query, params.identity);
  return fetchValidated(
    `/api/v1/entities/${encodeIdentifierPathSegment(entityId)}/traversal?${query.toString()}`,
    traversalResultSchema,
    signal,
  );
}

/** `GET /api/v1/evidence/{evidenceId}` (route 5) — no pinning parameters at all: Evidence carries no snapshot identity (ADR-0024 § 7). */
export function fetchEvidence(
  evidenceId: string,
  signal: AbortSignal,
): Promise<ClientQueryResult<EvidenceDetailResult>> {
  return fetchValidated(
    `/api/v1/evidence/${encodeIdentifierPathSegment(evidenceId)}`,
    evidenceDetailResultSchema,
    signal,
  );
}

export interface EntityEvidenceChainParams {
  readonly limit?: number;
  readonly cursor?: string;
  readonly identity?: SnapshotIdentity;
}

/** `GET /api/v1/entities/{entityId}/evidence` (route 6) — entity-scoped only; no relationship-scoped evidence-chain route exists (ADR-0024 § 1). */
export function fetchEntityEvidenceChain(
  entityId: string,
  params: EntityEvidenceChainParams,
  signal: AbortSignal,
): Promise<ClientQueryResult<EvidenceChainResult>> {
  const query = new URLSearchParams();
  appendPage(query, params);
  appendPin(query, params.identity);
  return fetchValidated(
    `/api/v1/entities/${encodeIdentifierPathSegment(entityId)}/evidence?${query.toString()}`,
    evidenceChainResultSchema,
    signal,
  );
}

/** `GET /api/v1/snapshots` (route 7) — always pinned; no latest mode exists (ADR-0024 § 2). */
export function fetchSnapshotSummary(
  identity: SnapshotIdentity,
  signal: AbortSignal,
): Promise<ClientQueryResult<SnapshotDetailResult>> {
  const query = new URLSearchParams();
  appendPin(query, identity);
  return fetchValidated(
    `/api/v1/snapshots?${query.toString()}`,
    snapshotDetailResultSchema,
    signal,
  );
}

export interface HealthContextParams {
  readonly direction: "upstream" | "downstream";
  readonly depth: number;
  readonly minConfidence?: number;
  readonly identity?: SnapshotIdentity;
  readonly overlayFrame?: OverlayFrameIdentifier;
}

/**
 * `GET /api/v1/entities/{entityId}/health-context` (M3-C/ADR-0030) — composes
 * one bounded traversal with one immutable overlay frame server-side; this
 * client never joins topology and health itself (GUARDRAILS.md § 1.4/M3-D
 * scope: no browser-computed health policy).
 */
export function fetchHealthContext(
  entityId: string,
  params: HealthContextParams,
  signal: AbortSignal,
): Promise<ClientQueryResult<HealthContextResult>> {
  const query = new URLSearchParams();
  query.set(WIRE_QUERY_PARAM.direction, params.direction);
  query.set(WIRE_QUERY_PARAM.depth, String(params.depth));
  if (params.minConfidence !== undefined) {
    query.set(WIRE_QUERY_PARAM.minConfidence, String(params.minConfidence));
  }
  appendPin(query, params.identity);
  if (params.overlayFrame !== undefined) {
    query.set(WIRE_QUERY_PARAM.overlayFrame, params.overlayFrame);
  }
  return fetchValidated(
    `/api/v1/entities/${encodeIdentifierPathSegment(entityId)}/health-context?${query.toString()}`,
    healthContextResultSchema,
    signal,
  );
}

export interface ImpactParams {
  readonly direction: "upstream" | "downstream";
  readonly depth: number;
  readonly minConfidence?: number;
  readonly changeType: ImpactChangeType;
  readonly identity?: SnapshotIdentity;
}

/**
 * `GET /api/v1/entities/{entityId}/impact` (M4-B route, ADR-0033) — the
 * server resolves one bounded traversal and computes deterministic,
 * evidence-derived ranked impact server-side; `changeType` is validated and
 * echoed but never affects ranking (ADR-0032 § 3), and this client never
 * recomputes `results` (ADR-0034 § 2).
 */
export function fetchImpact(
  entityId: string,
  params: ImpactParams,
  signal: AbortSignal,
): Promise<ClientQueryResult<ImpactResultEnvelope>> {
  const query = new URLSearchParams();
  query.set(WIRE_QUERY_PARAM.direction, params.direction);
  query.set(WIRE_QUERY_PARAM.depth, String(params.depth));
  if (params.minConfidence !== undefined) {
    query.set(WIRE_QUERY_PARAM.minConfidence, String(params.minConfidence));
  }
  query.set(WIRE_QUERY_PARAM.changeType, params.changeType);
  appendPin(query, params.identity);
  return fetchValidated(
    `/api/v1/entities/${encodeIdentifierPathSegment(entityId)}/impact?${query.toString()}`,
    impactResultEnvelopeSchema,
    signal,
  );
}

/** `GET /api/v1/snapshot-anchors` — bounded discovery with no query parameters. */
export function fetchSnapshotAnchors(
  signal: AbortSignal,
): Promise<ClientQueryResult<SnapshotAnchorsResult>> {
  return fetchValidated(
    "/api/v1/snapshot-anchors",
    snapshotAnchorsResultSchema,
    signal,
  );
}
