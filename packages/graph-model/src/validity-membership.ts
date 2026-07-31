/**
 * Half-open validity-interval membership (ADR-0016 § "Immutability and
 * derivation"): a snapshot at as-of time T includes exactly the revisions
 * whose interval contains T — `validFrom ≤ T < validTo`, with an omitted
 * `validTo` treated as unbounded at that horizon.
 *
 * S4 evaluates membership only, on explicit timestamps supplied by the
 * caller (ADR-0021 §§ 6–7): nothing here creates, derives, closes, merges,
 * splits, or mutates an interval — interval derivation is S5. The interval
 * itself is validated through the shared `validityIntervalSchema` (the S1
 * single source of truth), so malformed bounds, equal or reversed bounds,
 * and unknown fields are rejected loudly before any comparison; the
 * canonical timestamp form is fixed-width UTC ISO 8601 with millisecond
 * precision, so raw string comparison of validated values is chronological
 * comparison.
 */
import {
  utcMillisecondTimestampSchema,
  validityIntervalSchema,
} from "@atlast/shared";
import type { ValidityInterval } from "@atlast/shared";

/**
 * Reject anything that is not a canonical UTC millisecond timestamp. String
 * comparison is only chronological for the one fixed textual form the shared
 * schema defines, so membership refuses to guess about any other input.
 */
function assertCanonicalTimestamp(
  candidateTimestamp: string,
  roleDescription: string,
): void {
  const validationResult =
    utcMillisecondTimestampSchema.safeParse(candidateTimestamp);
  if (!validationResult.success) {
    throw new RangeError(
      `${roleDescription} must be a canonical UTC millisecond timestamp (e.g. 2026-07-23T00:00:00.000Z); received ${JSON.stringify(candidateTimestamp)}`,
    );
  }
}

/**
 * Validate the complete interval through the shared S1 contract — the
 * strict-object, canonical-timestamp, `validTo > validFrom` schema — so an
 * equal-bound or reversed interval (which can never contain any instant),
 * a malformed bound, or an unknown field is a loud error, never a silently
 * false membership answer.
 */
function assertValidValidityInterval(
  candidateInterval: ValidityInterval,
): void {
  const validationResult = validityIntervalSchema.safeParse(candidateInterval);
  if (!validationResult.success) {
    throw new RangeError(
      `Validity interval failed the shared contract: ${validationResult.error.issues
        .map(
          (issue) =>
            `${issue.path.length > 0 ? issue.path.join(".") + ": " : ""}${issue.message}`,
        )
        .join("; ")}`,
    );
  }
}

/**
 * Evaluate whether the half-open interval `[validFrom, validTo)` contains
 * the explicit as-of timestamp: `validFrom ≤ asOf`, and `asOf < validTo`
 * when `validTo` is present (an absent `validTo` means the interval is open
 * at the pinned horizon, so any `asOf ≥ validFrom` is a member). At exactly
 * `validTo` the revision is absent — the boundary instant belongs to the
 * next interval, per the half-open convention (ADR-0016 invariant 6).
 *
 * Pure membership evaluation: the interval object is never modified, and no
 * clock is read — the caller supplies every instant.
 */
export function isTimestampWithinValidity(
  validityInterval: ValidityInterval,
  asOfTimestamp: string,
): boolean {
  assertValidValidityInterval(validityInterval);
  assertCanonicalTimestamp(asOfTimestamp, "asOf timestamp");

  if (asOfTimestamp < validityInterval.validFrom) {
    return false;
  }
  return (
    validityInterval.validTo === undefined ||
    asOfTimestamp < validityInterval.validTo
  );
}
