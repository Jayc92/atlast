/**
 * S7 HTTP-boundary contract additions (ADR-0024, accepted 2026-08-11 — the
 * binding S7 runtime contract): the route 7 snapshot-summary response
 * reshape (§ 6), the Evidence-lookup envelope (§ 7), and the complete closed
 * external error-response contract (§ 9). These schemas exist so
 * `apps/api`'s future S7-B route handlers validate their HTTP-facing shapes
 * against the same Zod single source of truth as every other contract
 * (ADR-0005) — nothing here changes any existing S1/S2 schema.
 *
 * Every field that mirrors a repository-level shape reuses the existing
 * bounded schema it mirrors — `recordedSequenceSchema`, `derivationVersionSchema`,
 * `snapshotIdentitySchema`, the identifier schemas — rather than a
 * permissive `z.string()`/`z.number()`, so this contract never claims less
 * precision than the repository error it fronts already guarantees
 * (ADR-0024 § 9).
 */
import { z } from "zod";
import { derivationVersionSchema } from "./assertions.ts";
import { evidenceSchema, recordedSequenceSchema } from "./evidence.ts";
import {
  assertionIdentifierSchema,
  entityIdentifierSchema,
  evidenceIdentifierSchema,
} from "./identifiers.ts";
import {
  resolvedReadMetadataSchema,
  snapshotIdentitySchema,
} from "./read-contract.ts";
import { snapshotSummarySchema } from "./read-results.ts";
import { schemaVersionSchema } from "./schema-version.ts";

/**
 * Route 7's `data` object (ADR-0024 § 6): the repository-level
 * `SnapshotSummary` carries its own `identity`/`schemaVersion` redundantly
 * with the envelope's `meta`, so the HTTP shape narrows `data` to only
 * `checksum`/`subjectCount`, taken directly from `snapshotSummarySchema`'s
 * own field schemas rather than restated.
 */
export const snapshotSummaryDataSchema = z.strictObject({
  checksum: snapshotSummarySchema.shape.checksum,
  subjectCount: snapshotSummarySchema.shape.subjectCount,
});

export type SnapshotSummaryData = z.infer<typeof snapshotSummaryDataSchema>;

/**
 * Route 7's complete response envelope (ADR-0024 § 6): the same
 * `data`/`meta` pattern every other single-item route uses, with `meta`
 * supplied verbatim by `resolvedReadMetadataSchema`. The repository-level
 * `snapshotSummarySchema` itself is unchanged — only this route's handler
 * restructures its already-validated result before sending.
 */
export const snapshotDetailResultSchema = z.strictObject({
  data: snapshotSummaryDataSchema,
  meta: resolvedReadMetadataSchema,
});

export type SnapshotDetailResult = z.infer<typeof snapshotDetailResultSchema>;

/**
 * Route 5's complete response envelope (ADR-0024 § 7): Evidence carries no
 * snapshot identity (it is a fact of ingestion, not a graph claim), so
 * `meta` here carries only `schemaVersion` — never a `resolvedIdentity`.
 */
export const evidenceDetailResultSchema = z.strictObject({
  data: evidenceSchema,
  meta: z.strictObject({ schemaVersion: schemaVersionSchema }),
});

export type EvidenceDetailResult = z.infer<typeof evidenceDetailResultSchema>;

/**
 * The closed `CursorMismatchField` vocabulary (ADR-0024 § 9), mirroring
 * `CursorMismatchField` (`packages/graph-model/src/repository-errors.ts`)
 * exactly — never a bare `z.array(z.string())`, which would let a mismatch
 * report name a field the repository error can never actually report.
 */
export const cursorMismatchFieldSchema = z.enum([
  "operation",
  "identity",
  "horizon",
  "filter",
  "searchQuery",
  "ordering",
  "pageSize",
]);

export type CursorMismatchField = z.infer<typeof cursorMismatchFieldSchema>;

/**
 * `UNKNOWN_IDENTIFIER`'s `details`, discriminated by `identifierKind`
 * (ADR-0024 § 9): each variant exposes the exact identifier shape that
 * kind's repository error guarantees, never a bare `string`. The `subject`
 * variant stays a plain `z.string()` because `SubjectIdentifier` is opaque
 * (entity- or relationship-shaped) even in this package itself — no single
 * existing schema narrows it further. The `evidence` variant carries no
 * `resolvedIdentity`: Evidence lookups are not identity-scoped (ADR-0023 § 9).
 */
export const unknownIdentifierDetailsSchema = z.discriminatedUnion(
  "identifierKind",
  [
    z.strictObject({
      identifierKind: z.literal("subject"),
      identifier: z.string(),
      resolvedIdentity: snapshotIdentitySchema.optional(),
    }),
    z.strictObject({
      identifierKind: z.literal("assertion"),
      identifier: assertionIdentifierSchema,
      resolvedIdentity: snapshotIdentitySchema.optional(),
    }),
    z.strictObject({
      identifierKind: z.literal("evidence"),
      identifier: evidenceIdentifierSchema,
    }),
  ],
);

export type UnknownIdentifierDetails = z.infer<
  typeof unknownIdentifierDetailsSchema
>;

/**
 * `INVALID_READ_COORDINATE`'s `details` (ADR-0024 § 9): an exact, closed
 * mirror of `InvalidReadCoordinateErrorParams`
 * (`packages/graph-model/src/repository-errors.ts`). Because the graph and
 * evidence `CURSOR_BINDING_MISMATCH` variants share the literal
 * `reason: "CURSOR_BINDING_MISMATCH"` (distinguished only by `cursorKind`),
 * this is a plain `z.union` of exact `z.strictObject`s rather than a single
 * `z.discriminatedUnion("reason", …)` with permissive optional fields — that
 * would let a client-facing type imply field combinations
 * (`cursorBoundHorizon` alongside `cursorBoundIdentity`) the internal union
 * already proves can never co-occur.
 *
 * `recordedSequenceSchema` is safe to reuse for `firstRecordedSequence`/
 * `currentWatermark`/`requestedHorizon`/`cursorBoundHorizon`: every
 * error-construction path populating these fields does so only for a
 * non-empty store or an already-issued Evidence cursor, both of which
 * guarantee a value in `recordedSequenceSchema`'s range — the sentinel `0`
 * never reaches any of these fields. `derivationVersionSchema` is safe to
 * reuse for `unsupportedDerivationVersion` because that token has already
 * passed the wire-level grammar check during coercion (§ 3) before
 * `resolveDerivationPolicy` rejects it as merely unsupported.
 */
export const invalidReadCoordinateDetailsSchema = z.union([
  z.strictObject({ reason: z.literal("EMPTY_EVIDENCE_STORE") }),
  z.strictObject({
    reason: z.literal("HORIZON_BEFORE_FIRST_EVIDENCE"),
    firstRecordedSequence: recordedSequenceSchema,
    currentWatermark: recordedSequenceSchema,
  }),
  z.strictObject({
    reason: z.literal("HORIZON_AFTER_CURRENT_WATERMARK"),
    firstRecordedSequence: recordedSequenceSchema,
    currentWatermark: recordedSequenceSchema,
  }),
  z.strictObject({
    reason: z.literal("UNSUPPORTED_DERIVATION_VERSION"),
    unsupportedDerivationVersion: derivationVersionSchema,
  }),
  z.strictObject({
    reason: z.literal("INVALID_CURSOR"),
    cursorKind: z.enum(["graph", "evidence"]).optional(),
  }),
  z.strictObject({
    reason: z.literal("CURSOR_BINDING_MISMATCH"),
    cursorKind: z.literal("graph"),
    cursorBoundIdentity: snapshotIdentitySchema,
    requestedIdentity: snapshotIdentitySchema.optional(),
    mismatchFields: z.array(cursorMismatchFieldSchema).min(1),
  }),
  z.strictObject({
    reason: z.literal("CURSOR_BINDING_MISMATCH"),
    cursorKind: z.literal("evidence"),
    requestedHorizon: recordedSequenceSchema,
    cursorBoundHorizon: recordedSequenceSchema,
    mismatchFields: z.array(cursorMismatchFieldSchema).min(1),
  }),
]);

export type InvalidReadCoordinateDetails = z.infer<
  typeof invalidReadCoordinateDetailsSchema
>;

/**
 * The complete external error-response contract (ADR-0024 § 9): one
 * discriminated union, one row per closed `code`, each with its exact
 * `details` shape. `REFERENTIAL_INTEGRITY`'s details are exposed
 * deliberately (ADR-0023 § 9 already restricts its fields to safe, bounded
 * metadata); `INTERNAL_ERROR`'s details are redacted unconditionally,
 * because an exception reaching that branch is by definition not one of the
 * closed, audited shapes above.
 */
export const errorResponseSchema = z.discriminatedUnion("code", [
  z.strictObject({
    code: z.literal("VALIDATION_ERROR"),
    message: z.string(),
    details: z.strictObject({
      issues: z.array(
        z.strictObject({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        }),
      ),
    }),
  }),
  z.strictObject({
    code: z.literal("MALFORMED_REQUEST"),
    message: z.string(),
    details: z.strictObject({}),
  }),
  z.strictObject({
    code: z.literal("ROUTE_NOT_FOUND"),
    message: z.string(),
    details: z.strictObject({ method: z.string(), path: z.string() }),
  }),
  z.strictObject({
    code: z.literal("UNKNOWN_IDENTIFIER"),
    message: z.string(),
    details: unknownIdentifierDetailsSchema,
  }),
  z.strictObject({
    code: z.literal("INVALID_READ_COORDINATE"),
    message: z.string(),
    details: invalidReadCoordinateDetailsSchema,
  }),
  z.strictObject({
    code: z.literal("REFERENTIAL_INTEGRITY"),
    message: z.string(),
    details: z.strictObject({
      assertionIdentifier: assertionIdentifierSchema,
      endpointRole: z.enum(["source", "target"]),
      endpointIdentifier: entityIdentifierSchema,
      resolvedIdentity: snapshotIdentitySchema,
    }),
  }),
  z.strictObject({
    code: z.literal("INTERNAL_ERROR"),
    message: z.string(),
    details: z.strictObject({}),
  }),
]);

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
