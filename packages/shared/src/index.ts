/**
 * Package boundary for `@atlast/shared`: the M1 Slice S1 domain schemas —
 * the Zod single source of truth for every domain shape (ADR-0005), per
 * ADR-0014 as amended by ADR-0019, with temporal fields per ADR-0016.
 *
 * S1 exports schema validation only. Repository interfaces (S2), canonical
 * serialization and hashing (S4/S6), and reconciliation (S5) arrive with
 * their own slices once each is explicitly released.
 */
export {
  CURRENT_SCHEMA_VERSION,
  schemaVersionSchema,
  type SchemaVersion,
} from "./schema-version.ts";
export {
  utcMillisecondTimestampSchema,
  type UtcMillisecondTimestamp,
} from "./timestamps.ts";
export { jsonValueSchema, type JsonValue } from "./json-value.ts";
export {
  classificationTokenSchema,
  type ClassificationToken,
} from "./classification.ts";
export {
  assertionIdentifierSchema,
  entityIdentifierSchema,
  evidenceIdentifierSchema,
  relationshipIdentifierSchema,
  type AssertionIdentifier,
  type EntityIdentifier,
  type EvidenceIdentifier,
  type RelationshipIdentifier,
} from "./identifiers.ts";
export {
  entityObservationSchema,
  evidenceCollectionSchema,
  evidenceSchema,
  observationSchema,
  recordedSequenceSchema,
  relationshipObservationSchema,
  sourceScopedIdentitySchema,
  type EntityObservation,
  type Evidence,
  type EvidenceCollection,
  type Observation,
  type RelationshipObservation,
  type SourceScopedIdentity,
} from "./evidence.ts";
export {
  entitySubjectSchema,
  graphSubjectSchema,
  relationshipSubjectSchema,
  type EntitySubject,
  type GraphSubject,
  type RelationshipSubject,
} from "./subjects.ts";
export {
  canonicalClaimSchema,
  entityClaimSchema,
  relationshipClaimSchema,
  type CanonicalClaim,
  type EntityClaim,
  type RelationshipClaim,
} from "./claims.ts";
export {
  ambiguityStateSchema,
  competingClaimSchema,
  confidenceSchema,
  conflictStateSchema,
  derivationVersionSchema,
  graphAssertionSchema,
  provenanceSchema,
  ruleTraceEntrySchema,
  ruleTraceSchema,
  validityIntervalSchema,
  type AmbiguityState,
  type CompetingClaim,
  type Confidence,
  type ConflictState,
  type DerivationVersion,
  type GraphAssertion,
  type Provenance,
  type RuleTrace,
  type RuleTraceEntry,
  type ValidityInterval,
} from "./assertions.ts";
