/**
 * Half-open validity-interval membership tests (ADR-0016 § "Immutability
 * and derivation", invariant 6; ADR-0021 §§ 6–7): validFrom ≤ T < validTo,
 * open-ended intervals unbounded, boundaries exact to the millisecond,
 * malformed timestamps rejected loudly, and the interval never mutated.
 */
import { describe, expect, it } from "vitest";
import type { ValidityInterval } from "@atlast/shared";
import { isTimestampWithinValidity } from "./validity-membership.ts";

const CLOSED_INTERVAL: ValidityInterval = {
  validFrom: "2026-02-01T00:00:00.000Z",
  validTo: "2026-03-10T00:00:00.000Z",
};

const OPEN_INTERVAL: ValidityInterval = {
  validFrom: "2026-02-01T00:00:00.000Z",
};

describe("isTimestampWithinValidity", () => {
  it("includes the validFrom boundary instant (closed start)", () => {
    expect(
      isTimestampWithinValidity(CLOSED_INTERVAL, "2026-02-01T00:00:00.000Z"),
    ).toBe(true);
  });

  it("excludes instants before validFrom", () => {
    expect(
      isTimestampWithinValidity(CLOSED_INTERVAL, "2026-01-31T23:59:59.999Z"),
    ).toBe(false);
  });

  it("includes the last millisecond before validTo and excludes validTo itself (open end)", () => {
    expect(
      isTimestampWithinValidity(CLOSED_INTERVAL, "2026-03-09T23:59:59.999Z"),
    ).toBe(true);
    expect(
      isTimestampWithinValidity(CLOSED_INTERVAL, "2026-03-10T00:00:00.000Z"),
    ).toBe(false);
  });

  it("excludes instants after validTo", () => {
    expect(
      isTimestampWithinValidity(CLOSED_INTERVAL, "2026-04-01T00:00:00.000Z"),
    ).toBe(false);
  });

  it("treats an omitted validTo as unbounded at the pinned horizon", () => {
    expect(
      isTimestampWithinValidity(OPEN_INTERVAL, "2026-02-01T00:00:00.000Z"),
    ).toBe(true);
    expect(
      isTimestampWithinValidity(OPEN_INTERVAL, "2099-12-31T23:59:59.999Z"),
    ).toBe(true);
    expect(
      isTimestampWithinValidity(OPEN_INTERVAL, "2026-01-01T00:00:00.000Z"),
    ).toBe(false);
  });

  it.each([
    ["a non-canonical offset form", "2026-02-01T01:00:00.000+01:00"],
    ["missing milliseconds", "2026-02-01T00:00:00Z"],
    ["a lowercase z suffix", "2026-02-01T00:00:00.000z"],
    ["an impossible calendar date", "2026-02-30T00:00:00.000Z"],
    ["arbitrary text", "not-a-timestamp"],
  ])(
    "rejects %s as the asOf timestamp instead of comparing it",
    (_description: string, malformedTimestamp: string) => {
      expect(() =>
        isTimestampWithinValidity(CLOSED_INTERVAL, malformedTimestamp),
      ).toThrow(RangeError);
    },
  );

  it("rejects a malformed interval bound instead of comparing it", () => {
    const malformedInterval = {
      validFrom: "2026-02-01",
    } as unknown as ValidityInterval;
    expect(() =>
      isTimestampWithinValidity(malformedInterval, "2026-02-01T00:00:00.000Z"),
    ).toThrow(RangeError);
  });

  it("rejects an equal-bound interval — an empty half-open interval contains no instant and is a data error", () => {
    const equalBoundInterval = {
      validFrom: "2026-02-01T00:00:00.000Z",
      validTo: "2026-02-01T00:00:00.000Z",
    } as ValidityInterval;
    expect(() =>
      isTimestampWithinValidity(equalBoundInterval, "2026-02-01T00:00:00.000Z"),
    ).toThrow(RangeError);
  });

  it("rejects a reversed interval instead of answering false", () => {
    const reversedInterval = {
      validFrom: "2026-03-10T00:00:00.000Z",
      validTo: "2026-02-01T00:00:00.000Z",
    } as ValidityInterval;
    expect(() =>
      isTimestampWithinValidity(reversedInterval, "2026-02-15T00:00:00.000Z"),
    ).toThrow(RangeError);
  });

  it("rejects an interval carrying an unknown field (strict shared contract)", () => {
    const intervalWithUnknownField = {
      validFrom: "2026-02-01T00:00:00.000Z",
      validTo: "2026-03-10T00:00:00.000Z",
      derivedBy: "not-allowed",
    } as unknown as ValidityInterval;
    expect(() =>
      isTimestampWithinValidity(
        intervalWithUnknownField,
        "2026-02-15T00:00:00.000Z",
      ),
    ).toThrow(RangeError);
  });

  it("rejects a malformed validTo bound even when validFrom is canonical", () => {
    const malformedValidTo = {
      validFrom: "2026-02-01T00:00:00.000Z",
      validTo: "2026-03-10T00:00:00Z",
    } as unknown as ValidityInterval;
    expect(() =>
      isTimestampWithinValidity(malformedValidTo, "2026-02-15T00:00:00.000Z"),
    ).toThrow(RangeError);
  });

  it("evaluates membership only — the caller's interval object is never mutated", () => {
    const interval: ValidityInterval = {
      validFrom: "2026-02-01T00:00:00.000Z",
      validTo: "2026-03-10T00:00:00.000Z",
    };
    const intervalSnapshot = structuredClone(interval);

    isTimestampWithinValidity(interval, "2026-02-15T00:00:00.000Z");

    expect(interval).toEqual(intervalSnapshot);
  });
});
