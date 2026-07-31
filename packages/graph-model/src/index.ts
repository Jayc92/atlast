/**
 * Package boundary for `@atlast/graph-model`: the S4 temporal foundations —
 * deterministic, pure, non-mutating primitives per ADR-0016 as amended by
 * accepted ADR-0021.
 *
 * S4 exports primitives only: Evidence total ordering and horizon
 * selection, half-open validity-interval membership evaluation, RFC 8785
 * canonical serialization through the S1 JSON-value boundary, collection-
 * ordering helpers, and SHA-256 canonical digests. Reconciliation (S5),
 * GraphAssertion derivation and payload builders (S5), snapshot
 * construction/replay and repository implementations (S6), and API routes
 * (S7) arrive with their own explicitly released slices.
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
