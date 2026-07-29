/**
 * Evidence schema per ADR-0014 ("an immutable, timestamped observation …
 * the only input from which the graph may be derived") and ADR-0016 (two
 * time axes plus the `recordedSequence` ingestion ordinal). In M1 all
 * Evidence comes from synthetic fixtures, which declare every field —
 * including both timestamps and the sequence — explicitly.
 */
import { z } from "zod";
import { classificationTokenSchema } from "./classification.ts";
import { evidenceIdentifierSchema } from "./identifiers.ts";
import { jsonValueSchema } from "./json-value.ts";
import { schemaVersionSchema } from "./schema-version.ts";
import { utcMillisecondTimestampSchema } from "./timestamps.ts";

/**
 * Deterministic, unique, strictly increasing ingestion ordinal
 * (ADR-0016): an integer from 1 through Number.MAX_SAFE_INTEGER (2^53 − 1),
 * so every value is exactly representable in IEEE 754 doubles and JSON.
 * Zero, negatives, non-integers, and values above the safe-integer bound
 * are rejected with explicit errors. Uniqueness across a collection is a
 * cross-record property — see `evidenceCollectionSchema` below.
 */
export const recordedSequenceSchema = z
  .number()
  .int("recordedSequence must be an integer")
  .min(1, "recordedSequence must be at least 1")
  .max(
    Number.MAX_SAFE_INTEGER,
    "recordedSequence must not exceed Number.MAX_SAFE_INTEGER (2^53 − 1)",
  );

/**
 * Source-scoped identity as the discovery source expressed it
 * (ADR-0015 § "Identity keys"): `<source>:<source-native-id>`. Never merged
 * implicitly across sources; reconciliation (S5) resolves it to stable graph
 * identity. S1 validates only that both parts are present and the source
 * name is well-formed — the native id is opaque source data.
 */
export const sourceScopedIdentitySchema = z.strictObject({
  /** The discovery source that produced the observation, kebab-case. */
  source: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Discovery source name must be lowercase kebab-case",
    ),
  /** The identity claim exactly as the source expressed it — opaque. */
  sourceNativeId: z
    .string()
    .min(1, "sourceNativeId must be a non-empty string"),
});

export type SourceScopedIdentity = z.infer<typeof sourceScopedIdentitySchema>;

/**
 * The validated topology indication of one observation (ADR-0014:
 * "indication of entity or relationship X"): what kind of thing the source
 * saw, in normalized form, outside the opaque detail payload — so
 * reconciliation (S5) consumes a typed shape, never connector-specific JSON.
 *
 * Relationship endpoints are **source-scoped identities**, not stable
 * Atlast Entity identifiers: stable identity is reconciliation *output*
 * (ADR-0015), so Evidence — the pipeline's input — can only ever name
 * things the way its source did.
 */
export const entityObservationSchema = z.strictObject({
  observationKind: z.literal("entity"),
  /** The entity classification as observed, e.g. `service`, `database`. */
  entityType: classificationTokenSchema,
});

export const relationshipObservationSchema = z.strictObject({
  observationKind: z.literal("relationship"),
  /** The relationship type as observed, e.g. `calls`, `reads-from`. */
  relationshipType: classificationTokenSchema,
  /** Directed edge origin, as the source expressed it. */
  sourceEntityIdentity: sourceScopedIdentitySchema,
  /** Directed edge destination, as the source expressed it. */
  targetEntityIdentity: sourceScopedIdentitySchema,
});

export const observationSchema = z.discriminatedUnion("observationKind", [
  entityObservationSchema,
  relationshipObservationSchema,
]);

export type EntityObservation = z.infer<typeof entityObservationSchema>;
export type RelationshipObservation = z.infer<
  typeof relationshipObservationSchema
>;
export type Observation = z.infer<typeof observationSchema>;

/**
 * Strict object: an Evidence record carries exactly these fields. The
 * top-level `sourceScopedIdentity` is the source's identity for the observed
 * Entity or Relationship itself; the `observation` is the normalized
 * topology indication; `detail` is the only free-form region, constrained to
 * JSON-safe values — no connector-specific structure exists at this level
 * (ADR-0014 § "Explicitly out of scope").
 */
export const evidenceSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  identifier: evidenceIdentifierSchema,
  /** When the discovery source observed the fact (topology axis). */
  observedAt: utcMillisecondTimestampSchema,
  /** When the Evidence entered the evidence store (audit axis). */
  recordedAt: utcMillisecondTimestampSchema,
  recordedSequence: recordedSequenceSchema,
  /** The source's identity for the observed Entity or Relationship. */
  sourceScopedIdentity: sourceScopedIdentitySchema,
  /** The normalized topology indication of this observation. */
  observation: observationSchema,
  /** Source-native observation detail, opaque JSON ("detail D"). */
  detail: jsonValueSchema,
});

export type Evidence = z.infer<typeof evidenceSchema>;

/**
 * Collection-level validation for a batch of Evidence records (e.g. one
 * fixture file): each record validates individually, and both
 * `recordedSequence` values (ADR-0016 invariant 7) and Evidence identifiers
 * (ADR-0014: stable unique identifiers) must be unique across the
 * collection. This is pure data validation over the array in hand — it
 * reads no storage, so it belongs to S1 rather than to the repository layer.
 */
export const evidenceCollectionSchema = z
  .array(evidenceSchema)
  .superRefine((evidenceRecords, validationContext) => {
    const firstIndexBySequence = new Map<number, number>();
    const firstIndexByIdentifier = new Map<string, number>();
    for (const [index, record] of evidenceRecords.entries()) {
      const sequenceConflictIndex = firstIndexBySequence.get(
        record.recordedSequence,
      );
      if (sequenceConflictIndex === undefined) {
        firstIndexBySequence.set(record.recordedSequence, index);
      } else {
        validationContext.addIssue({
          code: "custom",
          path: [index, "recordedSequence"],
          message: `Duplicate recordedSequence ${String(record.recordedSequence)}: already used by the record at index ${String(sequenceConflictIndex)}`,
        });
      }

      const identifierConflictIndex = firstIndexByIdentifier.get(
        record.identifier,
      );
      if (identifierConflictIndex === undefined) {
        firstIndexByIdentifier.set(record.identifier, index);
      } else {
        validationContext.addIssue({
          code: "custom",
          path: [index, "identifier"],
          message: `Duplicate Evidence identifier "${record.identifier}": already used by the record at index ${String(identifierConflictIndex)}`,
        });
      }
    }
  });

export type EvidenceCollection = z.infer<typeof evidenceCollectionSchema>;
