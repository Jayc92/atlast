/**
 * `GET /health` response-contract tests (ADR-0004's fixed payload, validated
 * additively for M2-A per ADR-0026 § 3).
 */
import { describe, expect, it } from "vitest";
import { healthCheckResultSchema } from "./health-contract.ts";

describe("healthCheckResultSchema", () => {
  it("accepts the exact deterministic fixture-mode payload", () => {
    expect(
      healthCheckResultSchema.safeParse({
        status: "ok",
        service: "atlast-api",
        datasetMode: "fixture",
      }).success,
    ).toBe(true);
  });

  it("accepts the exact deterministic connector-mode payload (ADR-0040 § 1)", () => {
    expect(
      healthCheckResultSchema.safeParse({
        status: "ok",
        service: "atlast-api",
        datasetMode: "connector",
      }).success,
    ).toBe(true);
  });

  it.each([
    [
      "a different status",
      { status: "degraded", service: "atlast-api", datasetMode: "fixture" },
    ],
    [
      "a different service name",
      {
        status: "ok",
        service: "not-the-atlast-api",
        datasetMode: "fixture",
      },
    ],
    [
      "an invalid datasetMode value",
      { status: "ok", service: "atlast-api", datasetMode: "synthetic" },
    ],
    [
      "an extra field",
      {
        status: "ok",
        service: "atlast-api",
        datasetMode: "fixture",
        extra: true,
      },
    ],
    ["a missing datasetMode field", { status: "ok", service: "atlast-api" }],
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
