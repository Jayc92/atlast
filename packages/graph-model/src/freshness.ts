/**
 * Query-time freshness classification (accepted ADR-0022 § 13; ADR-0015
 * thresholds): a pure function of age at `asOf` under the `m1-v1`
 * thresholds. Freshness is response data — it never enters immutable
 * GraphAssertion content (ADR-0014) — and composing it into snapshot/read
 * responses is S6/S7, not S5.
 */
import { utcMillisecondTimestampSchema } from "@atlast/shared";
import type { Freshness } from "@atlast/shared";
import type { M1V1DerivationPolicy } from "./derivation-policy.ts";

const MILLISECONDS_PER_DAY = 86_400_000;

function parseCanonicalTimestamp(
  candidateTimestamp: string,
  roleDescription: string,
): number {
  const validationResult =
    utcMillisecondTimestampSchema.safeParse(candidateTimestamp);
  if (!validationResult.success) {
    throw new RangeError(
      `${roleDescription} must be a canonical UTC millisecond timestamp; received ${JSON.stringify(candidateTimestamp)}`,
    );
  }
  return Date.parse(candidateTimestamp);
}

/**
 * Classify a revision's freshness at an explicit `asOf`:
 * `current` iff age < 7 days, `stale` iff 7 ≤ age < 30 days, `historical`
 * iff age ≥ 30 days — with age = asOf − latestSupportingObservedAt in
 * milliseconds over canonical timestamps.
 *
 * An `asOf` earlier than the latest supporting observation throws a
 * deterministic RangeError: a correctly composed S6/S7 read can never
 * classify supporting Evidence from the future (event-time-bounded
 * provenance and validity intervals guarantee it), so a negative age can
 * only mean temporal leakage in the composing layer — rejected loudly,
 * never hidden behind a plausible "current".
 */
export function classifyFreshness(
  latestSupportingObservedAt: string,
  asOf: string,
  policy: M1V1DerivationPolicy,
): Freshness {
  const observedMilliseconds = parseCanonicalTimestamp(
    latestSupportingObservedAt,
    "latestSupportingObservedAt",
  );
  const asOfMilliseconds = parseCanonicalTimestamp(asOf, "asOf timestamp");

  const ageMilliseconds = asOfMilliseconds - observedMilliseconds;
  if (ageMilliseconds < 0) {
    throw new RangeError(
      `asOf ${asOf} precedes the latest supporting observation ${latestSupportingObservedAt} — negative freshness age indicates temporal leakage in the composing read`,
    );
  }

  const staleThreshold = policy.freshness.staleAfterDays * MILLISECONDS_PER_DAY;
  const historicalThreshold =
    policy.freshness.historicalAfterDays * MILLISECONDS_PER_DAY;
  if (ageMilliseconds < staleThreshold) {
    return "current";
  }
  if (ageMilliseconds < historicalThreshold) {
    return "stale";
  }
  return "historical";
}
