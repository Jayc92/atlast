/**
 * S6-internal `Clock` injection (accepted ADR-0023 § 1): the one place M1
 * storage resolves a real notion of "now" — a cursorless `latest` read —
 * takes an explicit `Clock` as a required constructor parameter. This
 * restates ADR-0016 invariant 9 ("no temporal computation reads wall-clock
 * time") concretely: no code path in `packages/graph-model` may call
 * `Date.now()` or argument-less `new Date()`, and this module ships no
 * default clock and no fallback to system time. Supplying the real system
 * clock at application boot is an S7 composition-root concern.
 */
import { utcMillisecondTimestampSchema } from "@atlast/shared";

/**
 * Returns the current instant as a canonical UTC millisecond timestamp.
 * Callers must validate the returned value through
 * {@link utcMillisecondTimestampSchema} — {@link assertValidClockReading}
 * does exactly that.
 */
export type Clock = () => string;

/**
 * Validate a `Clock` reading against the shared canonical timestamp
 * contract, rejecting loudly rather than passing a malformed "now" deeper
 * into the store.
 */
export function assertValidClockReading(clockReading: string): string {
  const validationResult =
    utcMillisecondTimestampSchema.safeParse(clockReading);
  if (!validationResult.success) {
    throw new TypeError(
      `Clock reading is not a canonical UTC millisecond timestamp: ${JSON.stringify(clockReading)}`,
    );
  }
  return validationResult.data;
}
