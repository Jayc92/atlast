/**
 * Freshness-classification tests (ADR-0022 § 13, invariant 14): the exact
 * scenario 4 anchors at the 7- and 30-day boundaries, and deterministic
 * RangeError for negative age (temporal-leakage detection).
 */
import { describe, expect, it } from "vitest";
import { M1_V1_DERIVATION_POLICY } from "./derivation-policy.ts";
import { classifyFreshness } from "./freshness.ts";

// Scenario 4's single observation instant.
const OBSERVED_AT = "2026-02-01T00:00:00.000Z";

function classify(asOf: string): string {
  return classifyFreshness(OBSERVED_AT, asOf, M1_V1_DERIVATION_POLICY);
}

describe("classifyFreshness", () => {
  it("classifies the exact scenario 4 anchors", () => {
    expect(classify("2026-02-07T23:59:59.999Z")).toBe("current"); // 7 d − 1 ms
    expect(classify("2026-02-08T00:00:00.000Z")).toBe("stale"); // exactly 7 d
    expect(classify("2026-03-03T00:00:00.000Z")).toBe("historical"); // exactly 30 d
  });

  it("classifies the last millisecond before the 30-day boundary as stale", () => {
    expect(classify("2026-03-02T23:59:59.999Z")).toBe("stale");
  });

  it("classifies zero age as current", () => {
    expect(classify(OBSERVED_AT)).toBe("current");
  });

  it("throws a deterministic RangeError when asOf precedes the latest supporting observation", () => {
    expect(() => classify("2026-01-31T23:59:59.999Z")).toThrow(RangeError);
    expect(() => classify("2026-01-31T23:59:59.999Z")).toThrow(
      /temporal leakage/,
    );
  });

  it("rejects malformed timestamps on either side instead of comparing them", () => {
    expect(() =>
      classifyFreshness("2026-02-01", OBSERVED_AT, M1_V1_DERIVATION_POLICY),
    ).toThrow(RangeError);
    expect(() =>
      classifyFreshness(
        OBSERVED_AT,
        "not-a-timestamp",
        M1_V1_DERIVATION_POLICY,
      ),
    ).toThrow(RangeError);
  });
});
