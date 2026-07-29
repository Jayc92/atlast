/**
 * Tests for the canonical timestamp form (ADR-0016 § "Canonical
 * serialization"): exactly millisecond precision, UTC, `Z` suffix. Every
 * rejected variant below is an alternate spelling of a valid instant —
 * admitting any of them would break byte-identical replay.
 */
import { describe, expect, it } from "vitest";
import { utcMillisecondTimestampSchema } from "./timestamps.ts";

describe("utcMillisecondTimestampSchema", () => {
  it("accepts the canonical UTC millisecond form", () => {
    expect(
      utcMillisecondTimestampSchema.safeParse("2026-07-23T00:00:00.000Z")
        .success,
    ).toBe(true);
  });

  it("accepts a leap-day instant", () => {
    expect(
      utcMillisecondTimestampSchema.safeParse("2024-02-29T23:59:59.999Z")
        .success,
    ).toBe(true);
  });

  it.each([
    ["missing milliseconds", "2026-07-23T00:00:00Z"],
    ["microsecond precision", "2026-07-23T00:00:00.000000Z"],
    ["two fractional digits", "2026-07-23T00:00:00.00Z"],
    ["missing Z suffix", "2026-07-23T00:00:00.000"],
    ["lowercase z suffix", "2026-07-23T00:00:00.000z"],
    ["numeric UTC offset", "2026-07-23T00:00:00.000+00:00"],
    ["date only", "2026-07-23"],
    ["space separator", "2026-07-23 00:00:00.000Z"],
    ["impossible month", "2026-13-01T00:00:00.000Z"],
    ["impossible day", "2026-02-30T00:00:00.000Z"],
    ["impossible hour", "2026-07-23T24:00:00.000Z"],
    ["empty string", ""],
  ])("rejects %s", (_description: string, malformedTimestamp: string) => {
    expect(
      utcMillisecondTimestampSchema.safeParse(malformedTimestamp).success,
    ).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(utcMillisecondTimestampSchema.safeParse(1753228800000).success).toBe(
      false,
    );
    expect(utcMillisecondTimestampSchema.safeParse(new Date(0)).success).toBe(
      false,
    );
  });
});
