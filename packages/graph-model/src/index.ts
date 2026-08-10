/**
 * Package boundary for `@atlast/graph-model`: the S4 temporal foundations
 * (deterministic, pure, non-mutating primitives per ADR-0016 as amended by
 * accepted ADR-0021) plus the S5 reconciliation engine (the binding `m1-v1`
 * contract per accepted ADR-0022) — the deeply frozen derivation policy,
 * identity normalization and stable identifier construction, event-time
 * standing-claim reconciliation with content-addressed GraphAssertion
 * revision history, and the query-time freshness classifier — plus the S6-A
 * pure repository and snapshot foundations (accepted ADR-0023 §§ 1–5, 9):
 * the injected `Clock` type, the derivation-version lookup, the repository
 * error taxonomy, graph/Evidence cursor payload encoding, and the pure
 * snapshot-checksum builder.
 *
 * plus the S6-B in-memory `EvidenceStore` (accepted ADR-0023 §§ 1–2, 5, 7–9):
 * atomic, schema-validated append; the current watermark; identifier
 * lookup; and cursor-bound, horizon-pinned Evidence listing.
 *
 * The in-memory `TopologyGraphStore` implementation, graph cursor-bound
 * request-binding comparison, referential-integrity enforcement, snapshot
 * construction, and contract-suite registration (S6-C onward) and API
 * routes (S7) arrive with their own explicitly released slices.
 */
export { compareUtf16CodeUnits } from "./utf16-comparator.ts";
export {
  assertValidEvidenceHorizon,
  compareEvidenceByTotalOrder,
  selectEvidenceAtHorizon,
  sortEvidenceByTotalOrder,
} from "./evidence-order.ts";
export { isTimestampWithinValidity } from "./validity-membership.ts";
export {
  canonicalizeToJcsString,
  canonicalizeToUtf8Bytes,
  toCanonicalJsonValue,
} from "./canonical-serialization.ts";
export { sortByIdentifier, sortIdentifiers } from "./collection-order.ts";
export {
  sha256HexOfBytes,
  sha256HexOfCanonicalJson,
} from "./canonical-digest.ts";
export {
  M1_V1_DERIVATION_POLICY,
  type AliasEntry,
  type M1V1DerivationPolicy,
} from "./derivation-policy.ts";
export {
  buildEntityIdentifier,
  buildRelationshipIdentifier,
  IdentityNormalizationError,
  normalizeIdentityKey,
} from "./identity-normalization.ts";
export { classifyFreshness } from "./freshness.ts";
export {
  reconcileEvidenceAtHorizon,
  type ReconciliationResult,
} from "./reconciliation.ts";
export { assertValidClockReading, type Clock } from "./clock.ts";
export {
  ACTIVE_DERIVATION_VERSION,
  resolveDerivationPolicy,
} from "./derivation-version-lookup.ts";
export {
  EvidenceAppendError,
  InvalidReadCoordinateError,
  ReferentialIntegrityError,
  UnknownIdentifierError,
  type CursorKind,
  type CursorMismatchField,
  type EndpointRole,
  type EvidenceAppendErrorParams,
  type EvidenceAppendErrorReason,
  type IdentifierKind,
  type InvalidReadCoordinateErrorParams,
  type InvalidReadCoordinateReason,
  type ReferentialIntegrityErrorParams,
  type UnknownIdentifierErrorParams,
} from "./repository-errors.ts";
export {
  decodeEvidenceCursor,
  decodeGraphCursor,
  encodeEvidenceCursor,
  encodeGraphCursor,
  type EvidenceCursorPayload,
  type GraphCursorOperation,
  type GraphCursorPayload,
} from "./cursor-payload.ts";
export {
  buildSnapshotChecksum,
  type SnapshotChecksumInput,
} from "./snapshot-checksum.ts";
export { InMemoryEvidenceStore } from "./evidence-store.ts";
