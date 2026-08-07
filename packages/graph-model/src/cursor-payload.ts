/**
 * S6-internal graph and Evidence cursor payload types and deterministic
 * opaque encoding/decoding (accepted ADR-0023 § 2). Exactly two cursor
 * kinds exist, because the frozen S2 contract exposes two cursor-bearing
 * repository surfaces with different coordinate systems:
 *
 * - **Graph collection cursors** (`listEntities`, `searchSubjects`,
 *   `getEvidenceChain`) bind the complete resolved `SnapshotIdentity`, the
 *   originating operation, the operation-specific coordinates, the
 *   deterministic ordering, the page size, and the continuation position.
 * - **Evidence cursors** (`EvidenceStore.listEvidence`) bind the requested
 *   Evidence horizon, the deterministic Evidence ordering, the page size,
 *   and the continuation position — no `asOf` and no `derivationVersion`,
 *   since the Evidence store has no snapshot identity.
 *
 * This module fixes only the two kinds' shapes and a deterministic,
 * round-trippable encoding. It deliberately does not implement
 * request-binding comparison (matching a replayed request's parameters
 * against a decoded cursor) — that composition is S6-B repository-method
 * work. The cursor's bytes remain an implementation concern (the S2
 * `read-contract.ts` docstring); only decode-time structural validity is
 * enforced here, and every rejection is `InvalidReadCoordinateError` with
 * reason `INVALID_CURSOR`, never retaining the raw token.
 */
import {
  MAXIMUM_PAGE_LIMIT,
  snapshotIdentitySchema,
  type JsonValue,
  type PaginationCursor,
  type SnapshotIdentity,
} from "@atlast/shared";
import {
  canonicalizeToUtf8Bytes,
  toCanonicalJsonValue,
} from "./canonical-serialization.ts";
import { InvalidReadCoordinateError } from "./repository-errors.ts";

/** The three S2 repository operations that issue a graph collection cursor. */
export type GraphCursorOperation =
  "listEntities" | "searchSubjects" | "getEvidenceChain";

const GRAPH_CURSOR_OPERATIONS: readonly GraphCursorOperation[] = [
  "listEntities",
  "searchSubjects",
  "getEvidenceChain",
];

/** A graph collection cursor's complete binding (ADR-0023 § 2). */
export interface GraphCursorPayload {
  readonly cursorKind: "graph";
  readonly identity: SnapshotIdentity;
  readonly operation: GraphCursorOperation;
  /** The operation-specific filter, search query, or evidence-chain subject coordinate — opaque JSON to this module. */
  readonly coordinates: JsonValue;
  readonly ordering: string;
  readonly pageSize: number;
  readonly position: string;
}

/** An Evidence cursor's complete binding (ADR-0023 § 2) — no snapshot identity. */
export interface EvidenceCursorPayload {
  readonly cursorKind: "evidence";
  readonly horizon: number;
  readonly ordering: string;
  readonly pageSize: number;
  readonly position: string;
}

const CURSOR_ENCODING_VERSION = 1;

/** The exact allowed key set for an issued graph collection cursor envelope (ADR-0023 § 2). */
const GRAPH_CURSOR_ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  "cursorVersion",
  "cursorKind",
  "identity",
  "operation",
  "coordinates",
  "ordering",
  "pageSize",
  "position",
]);

/**
 * The exact allowed key set for an issued Evidence cursor envelope
 * (ADR-0023 § 2) — deliberately excludes `identity`, `asOf`, and
 * `derivationVersion`: the Evidence store has no snapshot identity.
 */
const EVIDENCE_CURSOR_ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  "cursorVersion",
  "cursorKind",
  "horizon",
  "ordering",
  "pageSize",
  "position",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * An envelope is a recognized issued cursor shape only when its own-key set
 * is exactly the allowed set for its kind — no missing key, and no
 * additional key (a forbidden field such as an Evidence envelope carrying
 * `identity` is rejected here, not merely ignored).
 */
function hasExactEnvelopeKeys(
  envelope: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): boolean {
  const ownKeys = Object.keys(envelope);
  if (ownKeys.length !== allowedKeys.size) {
    return false;
  }
  return ownKeys.every((key) => allowedKeys.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidPageSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAXIMUM_PAGE_LIMIT
  );
}

function isValidHorizon(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

/**
 * Build an `INVALID_CURSOR` error from a decoded envelope, populating
 * `cursorKind` only when the (otherwise unusable) envelope names a
 * recognizable one — never passing an explicit `undefined` under
 * `exactOptionalPropertyTypes`.
 */
function invalidCursorError(decodedValue: unknown): InvalidReadCoordinateError {
  if (!isPlainObject(decodedValue)) {
    return new InvalidReadCoordinateError({ reason: "INVALID_CURSOR" });
  }
  const { cursorKind } = decodedValue;
  return cursorKind === "graph" || cursorKind === "evidence"
    ? new InvalidReadCoordinateError({ reason: "INVALID_CURSOR", cursorKind })
    : new InvalidReadCoordinateError({ reason: "INVALID_CURSOR" });
}

/** Encode a cursor envelope deterministically to the opaque token alphabet. */
function encodeEnvelope(envelope: Record<string, JsonValue>): PaginationCursor {
  const canonicalBytes = canonicalizeToUtf8Bytes(envelope);
  return Buffer.from(canonicalBytes).toString("base64url");
}

/**
 * Decode a token to its raw envelope object, rejecting anything that cannot
 * be decoded, is not JSON, is not an object, or names an unrecognized
 * encoding version — all as `INVALID_CURSOR`, with `cursorKind` populated
 * only when the (otherwise unusable) envelope itself names one.
 */
function decodeEnvelope(token: string): Record<string, unknown> {
  let decodedText: string;
  try {
    const decodedBytes = Buffer.from(token, "base64url");
    decodedText = new TextDecoder("utf-8", { fatal: true }).decode(
      decodedBytes,
    );
  } catch {
    throw new InvalidReadCoordinateError({ reason: "INVALID_CURSOR" });
  }

  let decodedValue: unknown;
  try {
    decodedValue = JSON.parse(decodedText);
  } catch {
    throw new InvalidReadCoordinateError({ reason: "INVALID_CURSOR" });
  }

  if (!isPlainObject(decodedValue)) {
    throw new InvalidReadCoordinateError({ reason: "INVALID_CURSOR" });
  }
  if (decodedValue["cursorVersion"] !== CURSOR_ENCODING_VERSION) {
    throw invalidCursorError(decodedValue);
  }
  return decodedValue;
}

/**
 * Encode a graph collection cursor payload to its opaque token. Encoding is
 * deterministic: repeated calls over an equal payload produce a
 * byte-identical token, regardless of caller property-construction order.
 */
export function encodeGraphCursor(
  payload: GraphCursorPayload,
): PaginationCursor {
  return encodeEnvelope({
    cursorVersion: CURSOR_ENCODING_VERSION,
    cursorKind: "graph",
    identity: payload.identity,
    operation: payload.operation,
    coordinates: toCanonicalJsonValue(payload.coordinates),
    ordering: payload.ordering,
    pageSize: payload.pageSize,
    position: payload.position,
  });
}

/**
 * Decode a token as a graph collection cursor. Rejects, as `INVALID_CURSOR`,
 * a token that cannot be decoded, is not an issued cursor shape, is bound to
 * the Evidence kind instead, carries any key outside the exact graph
 * envelope shape (missing or additional), or is missing/malformed required
 * binding metadata (identity, operation, ordering, page size, or position).
 */
export function decodeGraphCursor(token: string): GraphCursorPayload {
  const envelope = decodeEnvelope(token);

  if (envelope["cursorKind"] !== "graph") {
    throw invalidCursorError(envelope);
  }

  if (!hasExactEnvelopeKeys(envelope, GRAPH_CURSOR_ENVELOPE_KEYS)) {
    throw new InvalidReadCoordinateError({
      reason: "INVALID_CURSOR",
      cursorKind: "graph",
    });
  }

  const identityResult = snapshotIdentitySchema.safeParse(envelope["identity"]);
  if (!identityResult.success) {
    throw new InvalidReadCoordinateError({
      reason: "INVALID_CURSOR",
      cursorKind: "graph",
    });
  }

  const { operation } = envelope;
  if (
    typeof operation !== "string" ||
    !GRAPH_CURSOR_OPERATIONS.includes(operation as GraphCursorOperation)
  ) {
    throw new InvalidReadCoordinateError({
      reason: "INVALID_CURSOR",
      cursorKind: "graph",
    });
  }

  let coordinates: JsonValue;
  try {
    coordinates = toCanonicalJsonValue(envelope["coordinates"]);
  } catch {
    throw new InvalidReadCoordinateError({
      reason: "INVALID_CURSOR",
      cursorKind: "graph",
    });
  }

  if (
    !isNonEmptyString(envelope["ordering"]) ||
    !isValidPageSize(envelope["pageSize"]) ||
    !isNonEmptyString(envelope["position"])
  ) {
    throw new InvalidReadCoordinateError({
      reason: "INVALID_CURSOR",
      cursorKind: "graph",
    });
  }

  return {
    cursorKind: "graph",
    identity: identityResult.data,
    operation: operation as GraphCursorOperation,
    coordinates,
    ordering: envelope["ordering"],
    pageSize: envelope["pageSize"],
    position: envelope["position"],
  };
}

/**
 * Encode an Evidence cursor payload to its opaque token. Encoding is
 * deterministic: repeated calls over an equal payload produce a
 * byte-identical token, regardless of caller property-construction order.
 */
export function encodeEvidenceCursor(
  payload: EvidenceCursorPayload,
): PaginationCursor {
  return encodeEnvelope({
    cursorVersion: CURSOR_ENCODING_VERSION,
    cursorKind: "evidence",
    horizon: payload.horizon,
    ordering: payload.ordering,
    pageSize: payload.pageSize,
    position: payload.position,
  });
}

/**
 * Decode a token as an Evidence cursor. Rejects, as `INVALID_CURSOR`, a
 * token that cannot be decoded, is not an issued cursor shape, is bound to
 * the graph kind instead, carries any key outside the exact Evidence
 * envelope shape (missing or additional — including a forbidden `identity`,
 * `asOf`, or `derivationVersion`), or is missing/malformed required binding
 * metadata (horizon, ordering, page size, or position).
 */
export function decodeEvidenceCursor(token: string): EvidenceCursorPayload {
  const envelope = decodeEnvelope(token);

  if (envelope["cursorKind"] !== "evidence") {
    throw invalidCursorError(envelope);
  }

  if (!hasExactEnvelopeKeys(envelope, EVIDENCE_CURSOR_ENVELOPE_KEYS)) {
    throw new InvalidReadCoordinateError({
      reason: "INVALID_CURSOR",
      cursorKind: "evidence",
    });
  }

  if (
    !isValidHorizon(envelope["horizon"]) ||
    !isNonEmptyString(envelope["ordering"]) ||
    !isValidPageSize(envelope["pageSize"]) ||
    !isNonEmptyString(envelope["position"])
  ) {
    throw new InvalidReadCoordinateError({
      reason: "INVALID_CURSOR",
      cursorKind: "evidence",
    });
  }

  return {
    cursorKind: "evidence",
    horizon: envelope["horizon"],
    ordering: envelope["ordering"],
    pageSize: envelope["pageSize"],
    position: envelope["position"],
  };
}
