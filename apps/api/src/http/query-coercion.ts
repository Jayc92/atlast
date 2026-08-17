/**
 * HTTP request-side coercion helpers for the S7 query API (ADR-0024
 * §§ 2-5): wire query-parameter names, strict numeric coercion, the
 * `ReadMode` partial-pin rule, and the `minConfidence`-to-`minimumConfidence`
 * wire seam. These are route-registration concerns specific to `apps/api` —
 * no shared schema in `packages/shared` is needed beyond what ADR-0024 § 6/7/9
 * already name, because every rule here is either generic string-to-number
 * coercion with no route-specific knowledge, or depends on exactly which
 * query keys a given route accepts (ADR-0024 § 2's per-route matrix), which
 * is `apps/api` route-wiring, not a shared-schema concern.
 *
 * Every scalar field schema here is built on `z.string()`, so a repeated
 * query key — which Fastify's query-string parsing represents as an array —
 * fails that shape check and becomes an ordinary `VALIDATION_ERROR`,
 * exactly the verified behavioral contract ADR-0024 § 4 describes.
 */
import {
  pageRequestSchema,
  snapshotIdentitySchema,
  strictDecimalQueryParameterSchema as strictDecimalQueryString,
  strictIntegerQueryParameterSchema as strictIntegerQueryString,
  type PageRequest,
  type ReadMode,
  type SnapshotIdentity,
} from "@atlast/shared";
import { RequestValidationError, type ValidationIssue } from "./errors.ts";

/** The fixed wire query-parameter names (ADR-0024 § 4), named once so every route spells them identically. */
export const WIRE_QUERY_PARAM = {
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
} as const;

export { strictDecimalQueryString, strictIntegerQueryString };

/**
 * The minimal structural shape every schema this module consumes must
 * have — satisfied by any Zod schema's `safeParse`, without importing
 * `zod` itself: `apps/api` declares no direct dependency on `zod`
 * (ADR-0024 § 13 names only `@atlast/graph-model` and `@atlast/shared`), so
 * every schema used here is constructed inside one of those two packages
 * and consumed only through this result shape.
 */
export interface ParseableSchema<Output> {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: Output }
    | {
        readonly success: false;
        readonly error: {
          readonly issues: readonly {
            readonly path: readonly PropertyKey[];
            readonly message: string;
          }[];
        };
      };
}

/**
 * Parse `value` against `schema`, throwing a {@link RequestValidationError}
 * whose issue paths are `pathPrefix` followed by the failing schema's own
 * issue path — e.g. `["query", "depth"]` for a query-object member, or
 * `["params", "entityId"]` for a bare path-parameter schema (whose own issue
 * path is empty). This is the single primitive every request-side
 * validation call in this module and in `routes/*.ts` goes through, so
 * every rejection is a genuine Zod parse failure, never a hand-rolled check
 * (ADR-0024 § 11: "S7 validates ... through direct Zod calls").
 */
export function parseOrThrow<Output>(
  schema: ParseableSchema<Output>,
  value: unknown,
  pathPrefix: readonly (string | number)[],
): Output {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: [
      ...pathPrefix,
      ...issue.path.map((segment) =>
        typeof segment === "symbol" ? segment.toString() : segment,
      ),
    ],
    message: issue.message,
  }));
  throw new RequestValidationError(issues);
}

/**
 * Reject any query key outside a route's exact accepted set (ADR-0024 § 2:
 * "nothing beyond this table's Optional query column is ever accepted").
 * Every route calls this against its own closed key set before reading any
 * individual parameter.
 */
export function rejectUnknownQueryKeys(
  query: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): void {
  const unknownKeys = Object.keys(query).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new RequestValidationError(
      unknownKeys.map((key) => ({
        path: ["query", key],
        message: `Unrecognized query parameter "${key}".`,
      })),
    );
  }
}

/**
 * Read one query parameter as a single scalar string, rejecting a repeated
 * key's array value explicitly and immediately — the same outcome a
 * `z.string()`-typed schema field would reach, stated up front so the
 * caller always has a plain `string | undefined` to work with.
 */
export function asOptionalScalarString(
  value: unknown,
  wireParamName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new RequestValidationError([
      {
        path: ["query", wireParamName],
        message:
          "Expected a single value; a repeated query key is not permitted.",
      },
    ]);
  }
  return value;
}

/**
 * Run `thunk`, and if it throws a {@link RequestValidationError}, rewrite
 * any issue path segment matching a key of `segmentRenames` to its mapped
 * value before rethrowing. Used for the one wire-to-internal naming seam
 * ADR-0024 § 4 defines (`minConfidence` → `minimumConfidence`): the domain
 * schema's own issue path names the internal field, but the client sent the
 * wire name, so the reported path must say what the client actually wrote.
 */
export function withWireFieldNames<Output>(
  thunk: () => Output,
  segmentRenames: Readonly<Record<string, string>>,
): Output {
  try {
    return thunk();
  } catch (error) {
    if (error instanceof RequestValidationError) {
      throw new RequestValidationError(
        error.issues.map((issue) => ({
          path: issue.path.map((segment) =>
            typeof segment === "string"
              ? (segmentRenames[segment] ?? segment)
              : segment,
          ),
          message: issue.message,
        })),
      );
    }
    throw error;
  }
}

/**
 * Resolve the three optional pin query parameters into a `ReadMode`
 * (ADR-0024 § 3): none present resolves `latest`; all three present
 * validates through `snapshotIdentitySchema` and resolves `pinned`; one or
 * two present rejects `VALIDATION_ERROR` naming every **missing**
 * component — identically whether or not a `cursor` parameter is also
 * present (this function never inspects `cursor`, so cursor presence
 * cannot change its outcome).
 */
export function resolveGraphReadMode(
  asOfRaw: string | undefined,
  horizonRaw: string | undefined,
  derivationVersionRaw: string | undefined,
): ReadMode {
  if (
    asOfRaw === undefined &&
    horizonRaw === undefined &&
    derivationVersionRaw === undefined
  ) {
    return { mode: "latest" };
  }

  if (
    asOfRaw !== undefined &&
    horizonRaw !== undefined &&
    derivationVersionRaw !== undefined
  ) {
    const horizon = parseOrThrow(strictIntegerQueryString, horizonRaw, [
      "query",
      WIRE_QUERY_PARAM.horizon,
    ]);
    const identity = parseOrThrow(
      snapshotIdentitySchema,
      { asOf: asOfRaw, horizon, derivationVersion: derivationVersionRaw },
      ["query"],
    );
    return { mode: "pinned", identity };
  }

  const issues: ValidationIssue[] = [];
  if (asOfRaw === undefined) {
    issues.push({
      path: ["query", WIRE_QUERY_PARAM.asOf],
      message:
        "asOf is required when pinning a read: asOf, horizon, and derivationVersion must all be supplied together.",
    });
  }
  if (horizonRaw === undefined) {
    issues.push({
      path: ["query", WIRE_QUERY_PARAM.horizon],
      message:
        "horizon is required when pinning a read: asOf, horizon, and derivationVersion must all be supplied together.",
    });
  }
  if (derivationVersionRaw === undefined) {
    issues.push({
      path: ["query", WIRE_QUERY_PARAM.derivationVersion],
      message:
        "derivationVersion is required when pinning a read: asOf, horizon, and derivationVersion must all be supplied together.",
    });
  }
  throw new RequestValidationError(issues);
}

/**
 * Resolve the three pin query parameters for route 7 (snapshot summary),
 * where all three are simply **required** (ADR-0024 § 3) — an ordinary
 * missing-required-query-parameter rejection, never a "latest" resolution.
 * `snapshotIdentitySchema`'s own fields are all required (no `.optional()`),
 * so a missing component is reported by that same Zod parse, not a
 * hand-rolled presence check — only `horizon`'s string-to-number coercion
 * needs to happen first, and only when it is actually present.
 */
export function resolveRequiredSnapshotIdentity(
  asOfRaw: string | undefined,
  horizonRaw: string | undefined,
  derivationVersionRaw: string | undefined,
): SnapshotIdentity {
  const horizon =
    horizonRaw === undefined
      ? undefined
      : parseOrThrow(strictIntegerQueryString, horizonRaw, [
          "query",
          WIRE_QUERY_PARAM.horizon,
        ]);
  return parseOrThrow(
    snapshotIdentitySchema,
    {
      ...(asOfRaw !== undefined ? { asOf: asOfRaw } : {}),
      ...(horizon !== undefined ? { horizon } : {}),
      ...(derivationVersionRaw !== undefined
        ? { derivationVersion: derivationVersionRaw }
        : {}),
    },
    ["query"],
  );
}

/**
 * Resolve `limit`/`cursor` into a validated `PageRequest` (ADR-0024 § 2):
 * `limit` defaults to 25 (max 100) when absent; an already-coerced numeric
 * `limit` and the raw `cursor` string are validated together through the
 * shared `pageRequestSchema`.
 */
export function resolvePageRequest(
  limitRaw: string | undefined,
  cursorRaw: string | undefined,
): PageRequest {
  const limit =
    limitRaw === undefined
      ? undefined
      : parseOrThrow(strictIntegerQueryString, limitRaw, [
          "query",
          WIRE_QUERY_PARAM.limit,
        ]);
  return parseOrThrow(
    pageRequestSchema,
    {
      ...(limit !== undefined ? { limit } : {}),
      ...(cursorRaw !== undefined ? { cursor: cursorRaw } : {}),
    },
    ["query"],
  );
}
