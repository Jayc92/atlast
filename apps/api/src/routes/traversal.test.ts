/**
 * Integration tests for route 4 (ADR-0024 §§ 1-2): bounded traversal from
 * one Entity, driven through `fastify.inject()` over the real application
 * seeded with the `demo-company` fixture catalog.
 */
import type { FastifyInstance } from "fastify";
import { errorResponseSchema, traversalResultSchema } from "@atlast/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeApplication } from "../app.ts";
import {
  FIXED_TEST_CLOCK,
  loadFullDemoCompanySeedEvidence,
} from "../test-support/demo-company-fixture.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";

describe("GET /api/v1/entities/{entityId}/traversal", () => {
  let application: FastifyInstance;

  beforeEach(async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
    );
  });

  afterEach(async () => {
    await application.close();
  });

  it("traverses downstream, mixing reached Entity and traversed Relationship subjects, with visible truncation reporting", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/traversal?direction=downstream&depth=2",
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, traversalResultSchema);
    expect(body.items.length).toBeGreaterThan(0);
    const subjectKinds = body.items.map((item) => item.subject.subjectKind);
    expect(subjectKinds).toEqual(
      expect.arrayContaining(["entity", "relationship"]),
    );
    expect(typeof body.traversal.truncated).toBe("boolean");
    expect(typeof body.traversal.subjectCount).toBe("number");
  });

  it("filters by minConfidence, mapping the wire name to the internal field", async () => {
    const permissive = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/traversal?direction=downstream&depth=2&minConfidence=0",
    });
    const strict = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/traversal?direction=downstream&depth=2&minConfidence=0.99",
    });
    expect(permissive.statusCode).toBe(200);
    expect(strict.statusCode).toBe(200);
    expect(
      parseJsonBody(strict, traversalResultSchema).traversal.subjectCount,
    ).toBeLessThanOrEqual(
      parseJsonBody(permissive, traversalResultSchema).traversal.subjectCount,
    );
  });

  it("requires direction, rejecting its absence with VALIDATION_ERROR naming the wire field", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/traversal?depth=2",
    });
    expect(response.statusCode).toBe(400);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("VALIDATION_ERROR");
    if (body.code === "VALIDATION_ERROR") {
      expect(body.details.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["query", "direction"] }),
        ]),
      );
    }
  });

  it("requires depth, rejecting its absence with VALIDATION_ERROR naming the wire field", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/traversal?direction=downstream",
    });
    expect(response.statusCode).toBe(400);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("VALIDATION_ERROR");
    if (body.code === "VALIDATION_ERROR") {
      expect(body.details.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["query", "depth"] }),
        ]),
      );
    }
  });

  it("rejects a depth outside the 1-5 bound with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/traversal?direction=downstream&depth=6",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("reports a non-numeric minConfidence with VALIDATION_ERROR naming the wire field minConfidence", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/traversal?direction=downstream&depth=2&minConfidence=abc",
    });
    expect(response.statusCode).toBe(400);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("VALIDATION_ERROR");
    if (body.code === "VALIDATION_ERROR") {
      expect(body.details.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["query", "minConfidence"] }),
        ]),
      );
    }
  });

  it("rejects limit and cursor, which traversal never accepts (bounded by depth and the result budget instead)", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/traversal?direction=downstream&depth=2&limit=10",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects a malformed origin entity identifier at the path parameter", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/Not-Valid/traversal?direction=downstream&depth=2",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects an unknown origin entity with UNKNOWN_IDENTIFIER", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:does-not-exist/traversal?direction=downstream&depth=1",
    });
    expect(response.statusCode).toBe(404);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "UNKNOWN_IDENTIFIER",
    );
  });
});
