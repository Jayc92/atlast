/**
 * In-process contract test for the M0 health endpoint: the assembled
 * application is driven via `fastify.inject()`, so no network port opens
 * (ADR-0008, ADR-0009).
 */
import { describe, expect, it } from "vitest";
import { buildApplication } from "./app.ts";

describe("GET /health", () => {
  it("returns 200 with the deterministic health payload", async () => {
    const application = buildApplication();
    try {
      const response = await application.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        status: "ok",
        service: "atlast-api",
      });
    } finally {
      await application.close();
    }
  });
});
