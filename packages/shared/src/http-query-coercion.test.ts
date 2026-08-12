/**
 * Focused tests proving the two HTTP query-coercion helper schemas
 * (ADR-0024 §§ 3-5) coerce and reject exactly as specified: strict integer
 * and decimal coercion, rejecting non-integer, empty, non-numeric, and
 * negative strings, and — being built on `z.string()` — rejecting an array
 * value (the shape a repeated query key takes).
 */
import { describe, expect, it } from "vitest";
import {
  strictDecimalQueryParameterSchema,
  strictIntegerQueryParameterSchema,
} from "./http-query-coercion.ts";

describe("strictIntegerQueryParameterSchema", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["25", 25],
    ["9007199254740991", 9007199254740991],
  ])("coerces %s to %d", (input, expected) => {
    const result = strictIntegerQueryParameterSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(expected);
    }
  });

  it.each([
    ["an empty string", ""],
    ["a non-integer decimal", "1.5"],
    ["a non-numeric string", "abc"],
    ["a negative number", "-1"],
    ["a plus-prefixed number", "+1"],
    ["whitespace-padded digits", " 1 "],
  ])("rejects %s", (_description, input) => {
    expect(strictIntegerQueryParameterSchema.safeParse(input).success).toBe(
      false,
    );
  });

  it("rejects an array value (a repeated query key's shape)", () => {
    expect(
      strictIntegerQueryParameterSchema.safeParse(["1", "2"]).success,
    ).toBe(false);
  });
});

describe("strictDecimalQueryParameterSchema", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["0.5", 0.5],
    ["0.75", 0.75],
  ])("coerces %s to %d", (input, expected) => {
    const result = strictDecimalQueryParameterSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(expected);
    }
  });

  it.each([
    ["an empty string", ""],
    ["a non-numeric string", "abc"],
    ["a negative number", "-0.5"],
    ["a trailing-dot number", "1."],
  ])("rejects %s", (_description, input) => {
    expect(strictDecimalQueryParameterSchema.safeParse(input).success).toBe(
      false,
    );
  });

  it("rejects an array value (a repeated query key's shape)", () => {
    expect(
      strictDecimalQueryParameterSchema.safeParse(["0.5", "0.6"]).success,
    ).toBe(false);
  });
});
