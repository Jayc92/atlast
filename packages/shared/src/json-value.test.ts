/**
 * JSON-safety tests for the Evidence detail payload schema: every value
 * JSON cannot represent must be rejected, not coerced — a payload that
 * changes meaning on serialization would break canonicalization (ADR-0016).
 */
import { describe, expect, it } from "vitest";
import { jsonValueSchema } from "./json-value.ts";

describe("jsonValueSchema", () => {
  it.each([
    ["a string", "observed"],
    ["a finite number", 12.5],
    ["a boolean", true],
    ["null", null],
    ["an array", [1, "two", null, false]],
    ["a nested object", { spans: [{ sampled: true, reason: null }] }],
    ["an empty object", {}],
  ])("accepts %s", (_description: string, validValue: unknown) => {
    expect(jsonValueSchema.safeParse(validValue).success).toBe(true);
  });

  it.each([
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
    ["a Date object", new Date(0)],
    ["a function", () => 1],
  ])("rejects %s", (_description: string, invalidValue: unknown) => {
    expect(jsonValueSchema.safeParse(invalidValue).success).toBe(false);
  });

  it("rejects non-JSON values nested inside otherwise valid structures", () => {
    expect(jsonValueSchema.safeParse({ latency: Number.NaN }).success).toBe(
      false,
    );
    expect(jsonValueSchema.safeParse([1, undefined]).success).toBe(false);
    expect(jsonValueSchema.safeParse({ when: new Date(0) }).success).toBe(
      false,
    );
  });
});
