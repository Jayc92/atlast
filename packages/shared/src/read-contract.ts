/**
 * Read-contract schemas for the M1 repository interfaces (S2): pinned
 * snapshot identity, explicit read modes, freshness classification, bounded
 * pagination, opaque cursors, the entity-inventory filter, search-query
 * bounds and normalization, and traversal bounds.
 *
 * Sources of truth: ADR-0016 fixes the (asOf, horizon, derivationVersion)
 * snapshot identity and the freshness states; ADR-0017 fixes the exact M1
 * limits (page default 25 / max 100, traversal depth 1–5, traversal budget
 * 500, search length 2–256) — "limits are not deferred to implementation";
 * ADR-0017 as amended by ADR-0020 fixes inventory as entity-only with an
 * optional claim-level `entityType` filter and search as identifier-only
 * with locale-independent ASCII query normalization. These schemas make
 * every bound structural: no repository read can be requested unbounded,
 * and no partially pinned read can be expressed.
 */
import { z } from "zod";
import { derivationVersionSchema } from "./assertions.ts";
import { classificationTokenSchema } from "./classification.ts";
import { recordedSequenceSchema } from "./evidence.ts";
import { schemaVersionSchema } from "./schema-version.ts";
import { utcMillisecondTimestampSchema } from "./timestamps.ts";

/**
 * The complete pinned snapshot identity (ADR-0016): as-of time on the
 * observedAt axis, the evidence horizon as a recordedSequence watermark,
 * and the derivation-policy version. Strict object: all three components
 * are required — a partially pinned identity is not a snapshot identity
 * and is rejected at validation, never defaulted (ADR-0017 invariant 5).
 */
export const snapshotIdentitySchema = z.strictObject({
  asOf: utcMillisecondTimestampSchema,
  horizon: recordedSequenceSchema,
  derivationVersion: derivationVersionSchema,
});

export type SnapshotIdentity = z.infer<typeof snapshotIdentitySchema>;

/**
 * The two explicit read modes (ADR-0017 § "Pinned and latest reads"),
 * discriminated so a caller must say which one it means:
 *
 * - `pinned` — carries the complete snapshot identity; the reproducibility
 *   contract (identical pinned reads return identical results).
 * - `latest` — carries no identity components at all; the repository
 *   resolves asOf to the injected current time, horizon to the store's
 *   watermark, and derivationVersion to the active policy.
 *
 * Both branches are strict objects, so a "latest" read smuggling a partial
 * pin (e.g. only `asOf`) is rejected rather than half-honored — the union
 * has no representation for partial pinning.
 */
export const readModeSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("pinned"),
    identity: snapshotIdentitySchema,
  }),
  z.strictObject({
    mode: z.literal("latest"),
  }),
]);

export type ReadMode = z.infer<typeof readModeSchema>;

/**
 * Every read result reports the fully resolved snapshot identity and the
 * schema version its shapes validate under, so any latest read can be
 * re-issued later as a pinned read of exactly what was seen (ADR-0017:
 * "meta carrying the fully resolved snapshot identity … and the
 * schemaVersion"). `schemaVersion` reuses the single shared source of
 * truth — an unknown version is rejected here exactly as on any document.
 */
export const resolvedReadMetadataSchema = z.strictObject({
  resolvedIdentity: snapshotIdentitySchema,
  schemaVersion: schemaVersionSchema,
});

export type ResolvedReadMetadata = z.infer<typeof resolvedReadMetadataSchema>;

/**
 * Query-time freshness classification (ADR-0014/0015): response data
 * computed from a revision's latest supporting observation and the resolved
 * asOf — never stored on the revision. The reserved temporal state
 * `superseded` (ADR-0016) is deliberately NOT a member: no M1 read returns
 * revisions outside their validity, so freshness can never express
 * supersession.
 */
export const freshnessSchema = z.enum(["current", "stale", "historical"]);

export type Freshness = z.infer<typeof freshnessSchema>;

/** The exact M1 read bounds (ADR-0017) — changing one is a contract change. */
export const DEFAULT_PAGE_LIMIT = 25 as const;
export const MAXIMUM_PAGE_LIMIT = 100 as const;
export const MINIMUM_TRAVERSAL_DEPTH = 1 as const;
export const MAXIMUM_TRAVERSAL_DEPTH = 5 as const;
export const MAXIMUM_TRAVERSAL_RESULT_BUDGET = 500 as const;
export const MINIMUM_SEARCH_QUERY_LENGTH = 2 as const;
export const MAXIMUM_SEARCH_QUERY_LENGTH = 256 as const;

/**
 * Opaque pagination cursor: a non-empty printable token whose content is an
 * implementation concern. The contract binds a cursor to the snapshot
 * identity plus the originating request's filters, ordering, and page size
 * (ADR-0017) — consumers never parse it, and an implementation must reject
 * a cursor replayed with mismatched parameters. S1..S2 validate only the
 * token's form; binding enforcement is proven through the contract suite.
 */
export const paginationCursorSchema = z
  .string()
  .min(1, "Pagination cursor must be a non-empty token")
  .max(4096, "Pagination cursor exceeds the maximum token length")
  .regex(
    /^[A-Za-z0-9._~-]+$/,
    "Pagination cursor must be an opaque URL-safe token",
  );

export type PaginationCursor = z.infer<typeof paginationCursorSchema>;

/**
 * Bounded page request: `limit` is always present after validation (default
 * 25, maximum 100 — ADR-0017); `cursor` continues a prior walk. Zero,
 * negative, fractional, and over-maximum limits are rejected.
 */
export const pageRequestSchema = z.strictObject({
  limit: z
    .number()
    .int("Page limit must be an integer")
    .min(1, "Page limit must be at least 1")
    .max(
      MAXIMUM_PAGE_LIMIT,
      `Page limit must not exceed ${String(MAXIMUM_PAGE_LIMIT)}`,
    )
    .default(DEFAULT_PAGE_LIMIT),
  cursor: paginationCursorSchema.optional(),
});

export type PageRequest = z.infer<typeof pageRequestSchema>;

/**
 * Page metadata on every collection result: `nextCursor` is present exactly
 * when more results exist under the same pinned walk; `hasMore` makes
 * truncation visible rather than inferable.
 */
export const pageResultMetadataSchema = z
  .strictObject({
    hasMore: z.boolean(),
    nextCursor: paginationCursorSchema.optional(),
  })
  .refine(
    (pageMetadata): boolean =>
      pageMetadata.hasMore === (pageMetadata.nextCursor !== undefined),
    "nextCursor must be present exactly when hasMore is true",
  );

export type PageResultMetadata = z.infer<typeof pageResultMetadataSchema>;

/**
 * Entity-inventory filter (ADR-0020 § 1): the one filterable claim field M1
 * defines. An empty object is the unfiltered inventory; `entityType` reuses
 * the S1 classification-token schema, so a malformed token is a validation
 * error, never a silent empty result. The strict object is load-bearing:
 * there is deliberately no generic "status" field here, and none may be
 * added — freshness, conflict state, ambiguity state, and validity are
 * distinct concepts that must never be combined or renamed "status"
 * (ADR-0020 § 2). Match semantics are match-by-any-visible-claim, evaluated
 * under the resolved snapshot identity — never a winning type
 * (contract-suite obligation, proven by the implementing slice).
 */
export const entityInventoryFilterSchema = z.strictObject({
  entityType: classificationTokenSchema.optional(),
});

export type EntityInventoryFilter = z.infer<typeof entityInventoryFilterSchema>;

/**
 * Search-query normalization (ADR-0020 § 3): exactly the character-by-
 * character ASCII case mapping U+0041–U+005A → U+0061–U+007A and nothing
 * else. No locale-sensitive lowercasing (`toLowerCase()` is avoided so the
 * Turkish dotted/dotless-I family behaves identically under every runtime
 * locale), no Unicode case folding (U+0130 "İ" passes through unchanged),
 * no diacritic stripping, no trimming. Characters outside the identifier
 * alphabet are preserved — they simply never match any identifier; they are
 * not an error.
 */
export function normalizeSearchQuery(searchQueryText: string): string {
  let normalizedQuery = "";
  for (const character of searchQueryText) {
    const codePoint = character.codePointAt(0);
    normalizedQuery +=
      codePoint !== undefined && codePoint >= 0x41 && codePoint <= 0x5a
        ? String.fromCodePoint(codePoint + 0x20)
        : character;
  }
  return normalizedQuery;
}

/**
 * Search query bounds and normalization (ADR-0017 as amended by ADR-0020):
 * schema-enforced 2–256 characters, then the locale-independent ASCII
 * normalization above, applied here at the shared contract boundary so
 * every consumer and implementation sees one already-normalized query —
 * the single source of the normalization rule. The match semantics
 * (deterministic substring over complete canonical subject identifiers
 * only — never claim content, source-native identity, or nonexistent
 * display names) are the implementation's obligation, exercised by the
 * contract suite.
 */
export const searchQuerySchema = z
  .string()
  .min(
    MINIMUM_SEARCH_QUERY_LENGTH,
    `Search query must be at least ${String(MINIMUM_SEARCH_QUERY_LENGTH)} characters`,
  )
  .max(
    MAXIMUM_SEARCH_QUERY_LENGTH,
    `Search query must be at most ${String(MAXIMUM_SEARCH_QUERY_LENGTH)} characters`,
  )
  .transform(normalizeSearchQuery);

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/**
 * Traversal bounds (ADR-0017): explicit direction, required depth 1–5, a
 * confidence floor in [0, 1], and the fixed 500-subject result budget.
 * Depth has no default — the caller must state how far it intends to walk.
 */
export const traversalDirectionSchema = z.enum(["upstream", "downstream"]);

export type TraversalDirection = z.infer<typeof traversalDirectionSchema>;

export const traversalRequestBoundsSchema = z.strictObject({
  direction: traversalDirectionSchema,
  depth: z
    .number()
    .int("Traversal depth must be an integer")
    .min(
      MINIMUM_TRAVERSAL_DEPTH,
      `Traversal depth must be at least ${String(MINIMUM_TRAVERSAL_DEPTH)}`,
    )
    .max(
      MAXIMUM_TRAVERSAL_DEPTH,
      `Traversal depth must not exceed ${String(MAXIMUM_TRAVERSAL_DEPTH)}`,
    ),
  minimumConfidence: z
    .number()
    .min(0, "Confidence floor must be at least 0")
    .max(1, "Confidence floor must be at most 1")
    .default(0),
});

export type TraversalRequestBounds = z.infer<
  typeof traversalRequestBoundsSchema
>;

/**
 * Traversal result metadata: truncation against the 500-subject budget is
 * reported explicitly — visible, never silent (ADR-0017).
 */
export const traversalResultMetadataSchema = z.strictObject({
  truncated: z.boolean(),
  subjectCount: z
    .number()
    .int("Traversal subject count must be an integer")
    .min(0, "Traversal subject count cannot be negative")
    .max(
      MAXIMUM_TRAVERSAL_RESULT_BUDGET,
      `Traversal results must not exceed the ${String(MAXIMUM_TRAVERSAL_RESULT_BUDGET)}-subject budget`,
    ),
});

export type TraversalResultMetadata = z.infer<
  typeof traversalResultMetadataSchema
>;
