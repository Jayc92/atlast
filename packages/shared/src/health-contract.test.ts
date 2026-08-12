/**
 * `GET /health` response-contract tests (ADR-0004's fixed payload, validated
 * additively for M2-A per ADR-0026 § 3).
 */
import { describe, expect, it } from "vitest";
import { healthCheckResultSchema } from "./health-contract.ts";

describe("healthCheckResultSchema", () => {
  it("accepts the exact deterministic payload", () => {
    expect(
      healthCheckResultSchema.safeParse({
        status: "ok",
        service: "atlast-api",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a different status", { status: "degraded", service: "atlast-api" }],
    [
      "a different service name",
      { status: "ok", service: "not-the-atlast-api" },
    ],
    ["an extra field", { status: "ok", service: "atlast-api", extra: true }],
    ["a missing field", { status: "ok" }],
    ["an empty object", {}],
  ])("rejects %s", (_description: string, payload: unknown) => {
    expect(healthCheckResultSchema.safeParse(payload).success).toBe(false);
  });

  it.each([null, undefined, "ok", 1, []])(
    "rejects the non-object value %j",
    (value: unknown) => {
      expect(healthCheckResultSchema.safeParse(value).success).toBe(false);
    },
  );
});
