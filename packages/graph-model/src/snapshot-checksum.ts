/**
 * Pure snapshot-checksum construction (accepted ADR-0023 §§ 4–5): the
 * snapshot content-addressing payload is exactly
 * `{ derivationVersion, asOf, horizon, visibleAssertionIdentifiers }`,
 * canonicalized and digested through the existing S4 primitives. Subject
 * identifiers, subject count, and assertion bodies are deliberately
 * excluded — every visible assertion identifier is itself a content-addressed
 * digest over that assertion's complete identifying content, so the sorted
 * list of visible assertion identifiers already uniquely determines the
 * complete visible subject set and every visible assertion's content,
 * transitively.
 *
 * This module builds only the checksum from an already-resolved identity and
 * an already-computed visible-assertion-identifier set; snapshot
 * construction (reconciliation, visibility filtering) is S6-B work.
 */
import { sha256HexOfCanonicalJson } from "./canonical-digest.ts";
import { sortIdentifiers } from "./collection-order.ts";

export interface SnapshotChecksumInput {
  readonly derivationVersion: string;
  readonly asOf: string;
  readonly horizon: number;
  readonly visibleAssertionIdentifiers: readonly string[];
}

/**
 * Compute the lowercase SHA-256 snapshot checksum for the exact ADR-0023 § 4
 * payload. Pure and deterministic: repeated calls over an equal input
 * (irrespective of the input array's order) reproduce the same digest
 * byte-for-byte, and the caller's `visibleAssertionIdentifiers` array is
 * never mutated (`sortIdentifiers` returns a new array).
 */
export function buildSnapshotChecksum(input: SnapshotChecksumInput): string {
  return sha256HexOfCanonicalJson({
    derivationVersion: input.derivationVersion,
    asOf: input.asOf,
    horizon: input.horizon,
    visibleAssertionIdentifiers: sortIdentifiers(
      input.visibleAssertionIdentifiers,
    ),
  });
}
