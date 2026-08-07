/**
 * `Clock` validation tests (accepted ADR-0023 § 1, invariant 1): a returned
 * value must validate through `utcMillisecondTimestampSchema`, and this
 * module ships no default clock — every reading is caller-injected.
 */
import { describe, expect, it } from "vitest";
import { assertValidClockReading, type Clock } from "./clock.ts";

describe("assertValidClockReading", () => {
  it("accepts a canonical UTC millisecond timestamp and returns it unchanged", () => {
    expect(assertValidClockReading("2026-08-07T12:34:56.789Z")).toBe(
      "2026-08-07T12:34:56.789Z",
    );
  });

  it("rejects a non-canonical timestamp (missing milliseconds)", () => {
    expect(() => assertValidClockReading("2026-08-07T12:34:56Z")).toThrow(
      TypeError,
    );
  });

  it("rejects a timestamp with an explicit offset instead of Z", () => {
    expect(() =>
      assertValidClockReading("2026-08-07T12:34:56.789+00:00"),
    ).toThrow(TypeError);
  });

  it("rejects a non-string value", () => {
    expect(() => assertValidClockReading(12345 as unknown as string)).toThrow(
      TypeError,
    );
  });

  it("a Clock is an injected function — repeated calls may return distinct valid readings", () => {
    const readings = ["2026-08-07T00:00:00.000Z", "2026-08-07T00:00:01.000Z"];
    let callIndex = 0;
    const clock: Clock = () => {
      const reading = readings[callIndex];
      callIndex += 1;
      if (reading === undefined) {
        throw new Error("test clock exhausted");
      }
      return reading;
    };
    expect(assertValidClockReading(clock())).toBe("2026-08-07T00:00:00.000Z");
    expect(assertValidClockReading(clock())).toBe("2026-08-07T00:00:01.000Z");
  });
});
