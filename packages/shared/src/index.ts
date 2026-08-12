/**
 * Package boundary for `@atlast/shared`: the M1 contract surface — the Zod
 * single source of truth for every domain shape (ADR-0005), per ADR-0014 as
 * amended by ADR-0019, with temporal fields per ADR-0016; plus the S2
 * repository contract: the async EvidenceStore/TopologyGraphStore
 * interfaces (ADR-0012/0018), their read-contract and read-result schemas
 * with the exact ADR-0017 bounds — inventory and search semantics per
 * ADR-0017 as amended by ADR-0020 (entity-only inventory with the optional
 * claim-level entityType filter; identifier-only search with
 * locale-independent normalization) — and the storage-agnostic
 * contract-test suite skeleton an implementation registers in S6.
 *
 * This package exports contracts only — no storage, reconciliation,
 * serialization, or hashing. Canonical serialization/hashing (S4/S6),
 * reconciliation (S5), and the repository implementation (S6) arrive with
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
export {
  DEFAULT_PAGE_LIMIT,
  MAXIMUM_PAGE_LIMIT,
  MAXIMUM_SEARCH_QUERY_LENGTH,
  MAXIMUM_TRAVERSAL_DEPTH,
  MAXIMUM_TRAVERSAL_RESULT_BUDGET,
  MINIMUM_SEARCH_QUERY_LENGTH,
  MINIMUM_TRAVERSAL_DEPTH,
  entityInventoryFilterSchema,
  freshnessSchema,
  normalizeSearchQuery,
  pageRequestSchema,
  pageResultMetadataSchema,
  paginationCursorSchema,
  readModeSchema,
  resolvedReadMetadataSchema,
  searchQuerySchema,
  snapshotIdentitySchema,
  traversalDirectionSchema,
  traversalRequestBoundsSchema,
  traversalResultMetadataSchema,
  type EntityInventoryFilter,
  type Freshness,
  type PageRequest,
  type PageResultMetadata,
  type PaginationCursor,
  type ReadMode,
  type ResolvedReadMetadata,
  type SearchQuery,
  type SnapshotIdentity,
  type TraversalDirection,
  type TraversalRequestBounds,
  type TraversalResultMetadata,
} from "./read-contract.ts";
export {
  assertionDetailResultSchema,
  assertionReadResultSchema,
  entityPageSchema,
  entityReadResultSchema,
  evidenceChainResultSchema,
  evidencePageSchema,
  snapshotSummarySchema,
  subjectDetailResultSchema,
  subjectPageSchema,
  subjectReadResultSchema,
  traversalResultSchema,
  type AssertionDetailResult,
  type AssertionReadResult,
  type EntityPage,
  type EntityReadResult,
  type EvidenceChainResult,
  type EvidencePage,
  type SnapshotSummary,
  type SubjectDetailResult,
  type SubjectPage,
  type SubjectReadResult,
  type TraversalResult,
} from "./read-results.ts";
export type {
  EvidenceStore,
  SubjectIdentifier,
  TopologyGraphStore,
} from "./repositories.ts";
export {
  ContractViolation,
  registerRepositoryContractSuite,
  repositoryContractCases,
  type ContractCaseContext,
  type ContractSuiteTestApi,
  type RepositoryContractCase,
  type RepositoryFactory,
} from "./contract-suite.ts";
export {
  cursorMismatchFieldSchema,
  errorResponseSchema,
  evidenceDetailResultSchema,
  invalidReadCoordinateDetailsSchema,
  snapshotDetailResultSchema,
  snapshotSummaryDataSchema,
  unknownIdentifierDetailsSchema,
  type CursorMismatchField,
  type ErrorResponse,
  type EvidenceDetailResult,
  type InvalidReadCoordinateDetails,
  type SnapshotDetailResult,
  type SnapshotSummaryData,
  type UnknownIdentifierDetails,
} from "./http-contract.ts";
export {
  strictDecimalQueryParameterSchema,
  strictIntegerQueryParameterSchema,
} from "./http-query-coercion.ts";
export {
  healthCheckResultSchema,
  type HealthCheckResult,
} from "./health-contract.ts";
