/**
 * Package boundary for `@atlast/graph-model`: the S4 temporal foundations
 * (deterministic, pure, non-mutating primitives per ADR-0016 as amended by
 * accepted ADR-0021) plus the S5 reconciliation engine (the binding `m1-v1`
 * contract per accepted ADR-0022) — the deeply frozen derivation policy,
 * identity normalization and stable identifier construction, event-time
 * standing-claim reconciliation with content-addressed GraphAssertion
 * revision history, and the query-time freshness classifier.
 *
 * Snapshot construction/replay and repository implementations (S6) and API
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
