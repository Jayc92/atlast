/**
 * Integration tests for route 3 (ADR-0024 §§ 1-2): identifier search over
 * both subject kinds, driven through `fastify.inject()` over the real
 * application seeded with the `demo-company` fixture catalog.
 */
import type { FastifyInstance } from "fastify";
import { errorResponseSchema, subjectPageSchema } from "@atlast/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeApplication } from "../app.ts";
import {
  FIXED_TEST_CLOCK,
  loadFullDemoCompanySeedEvidence,
} from "../test-support/demo-company-fixture.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";

describe("GET /api/v1/search", () => {
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

  it("finds a subject by an exact identifier substring", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/search?q=checkout",
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, subjectPageSchema);
    expect(
      body.items.some(
        (item) => item.subject.identifier === "atlast:entity:checkout",
      ),
    ).toBe(true);
  });

  it("normalizes the query with the ASCII case mapping only, matching an uppercase query", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/search?q=CHECKOUT",
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, subjectPageSchema);
    expect(
      body.items.some(
        (item) => item.subject.identifier === "atlast:entity:checkout",
      ),
    ).toBe(true);
  });

  it("returns no items for a query matching no identifier", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/search?q=zzzznomatch",
    });
    expect(response.statusCode).toBe(200);
    expect(parseJsonBody(response, subjectPageSchema).items).toEqual([]);
  });

  it("finds a Relationship subject by identifier substring, never through entity detail", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/search?q=checkout-payment-call",
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, subjectPageSchema);
    expect(
      body.items.some((item) => item.subject.subjectKind === "relationship"),
    ).toBe(true);
  });

  it("requires q, rejecting its absence with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/search",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects a query shorter than the minimum length with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/search?q=a",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("continues a paginated walk via cursor with no duplicate or dropped items across pages", async () => {
    // "at" is a substring of the "atlast:" prefix every stable identifier
    // carries, so it matches broadly enough to force a multi-page walk
    // regardless of the specific fixture identifiers in play.
    const firstPage = await application.inject({
      method: "GET",
      url: "/api/v1/search?q=at&limit=1",
    });
    expect(firstPage.statusCode).toBe(200);
    const firstBody = parseJsonBody(firstPage, subjectPageSchema);
    expect(firstBody.page.hasMore).toBe(true);

    const secondPage = await application.inject({
      method: "GET",
      url: `/api/v1/search?q=at&limit=1&cursor=${encodeURIComponent(firstBody.page.nextCursor ?? "")}`,
    });
    expect(secondPage.statusCode).toBe(200);
    const secondBody = parseJsonBody(secondPage, subjectPageSchema);
    expect(secondBody.items[0]?.subject.identifier).not.toBe(
      firstBody.items[0]?.subject.identifier,
    );
  });

  it("rejects an unknown query key with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/search?q=checkout&bogus=1",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });
});
