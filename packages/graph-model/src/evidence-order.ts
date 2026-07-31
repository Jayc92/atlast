/**
 * Evidence total order and horizon selection (ADR-0016 § "Total order and
 * tie-breaks", § "Snapshots"): the deterministic ordering key is
 * (`observedAt`, `recordedSequence`), compared lexicographically. The
 * canonical timestamp form is fixed-width UTC ISO 8601, so raw string
 * comparison of `observedAt` is chronological comparison; `recordedSequence`
 * is unique by construction, making the order total with no further
 * tie-break.
 *
 * Every helper here is pure: no clock, no randomness, no I/O, no mutation of
 * caller-owned arrays or Evidence objects. Sorting always returns a new
 * array (ADR-0021 § 1: any array sorting operates on a copy).
 */
import type { Evidence } from "@atlast/shared";
import { compareUtf16CodeUnits } from "./utf16-comparator.ts";

/**
 * Compare two Evidence records by the ADR-0016 total order: `observedAt`
 * ascending (fixed-width canonical timestamps compare correctly as raw
 * strings), then `recordedSequence` ascending. Returns a negative number,
 * zero, or a positive number in the usual comparator convention; zero occurs
 * only for records with identical (observedAt, recordedSequence) keys, which
 * a valid Evidence collection never contains (sequences are unique).
 */
export function compareEvidenceByTotalOrder(
  first: Evidence,
  second: Evidence,
): number {
  const observedAtComparison = compareUtf16CodeUnits(
    first.observedAt,
    second.observedAt,
  );
  if (observedAtComparison !== 0) {
    return observedAtComparison;
  }
  return first.recordedSequence - second.recordedSequence;
}

/**
 * Return a new array of the given Evidence records sorted by the ADR-0016
 * total order. The caller's array and its Evidence objects are never
 * mutated; the result contains the same object references in deterministic
 * order regardless of input order.
 */
export function sortEvidenceByTotalOrder(
  evidenceRecords: readonly Evidence[],
): Evidence[] {
  return [...evidenceRecords].sort(compareEvidenceByTotalOrder);
}

/**
 * An evidence horizon is an append-only Evidence-store watermark expressed
 * as a `recordedSequence` value (ADR-0016 § "Snapshots"): horizon H includes
 * exactly the records with `recordedSequence ≤ H`. The horizon shares the
 * `recordedSequence` domain — an integer from 1 through
 * `Number.MAX_SAFE_INTEGER` — and anything else is rejected loudly rather
 * than coerced (GUARDRAILS.md § 2: no silent coercion).
 */
export function assertValidEvidenceHorizon(horizon: number): void {
  if (
    typeof horizon !== "number" ||
    !Number.isInteger(horizon) ||
    horizon < 1 ||
    horizon > Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError(
      `Evidence horizon must be an integer from 1 through Number.MAX_SAFE_INTEGER (2^53 − 1); received ${String(horizon)}`,
    );
  }
}

/**
 * Select the Evidence records visible at the given horizon
 * (`recordedSequence ≤ horizon`) and return them as a new array in the
 * ADR-0016 total order. Rejects invalid horizons via
 * {@link assertValidEvidenceHorizon}; never mutates the caller's array or
 * its Evidence objects. Late Evidence (higher sequence) can never enter an
 * earlier horizon — even when its `observedAt` is old — because selection is
 * by sequence alone (ADR-0016 invariant 2).
 */
export function selectEvidenceAtHorizon(
  evidenceRecords: readonly Evidence[],
  horizon: number,
): Evidence[] {
  assertValidEvidenceHorizon(horizon);
  return sortEvidenceByTotalOrder(
    evidenceRecords.filter(
      (evidenceRecord) => evidenceRecord.recordedSequence <= horizon,
    ),
  );
}
