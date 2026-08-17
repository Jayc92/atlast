/**
 * Integration tests for routes 1 and 2 (ADR-0024 §§ 1-2): entity inventory
 * and entity detail, driven through `fastify.inject()` over the real,
 * fully-wired application (ADR-0009) seeded with the actual `demo-company`
 * fixture catalog.
 */
import type { FastifyInstance } from "fastify";
import {
  entityPageSchema,
  errorResponseSchema,
  subjectDetailResultSchema,
} from "@atlast/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeApplication } from "../app.ts";
import {
  FIXED_TEST_CLOCK,
  FULL_CATALOG_SNAPSHOT_IDENTITY,
  loadFullDemoCompanyOverlayFrames,
  loadFullDemoCompanySeedEvidence,
} from "../test-support/demo-company-fixture.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";

describe("GET /api/v1/entities", () => {
  let application: FastifyInstance;

  beforeEach(async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
  });

  afterEach(async () => {
    await application.close();
  });

  it("returns the unfiltered entity inventory with resolved read metadata", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities",
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, entityPageSchema);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.meta.resolvedIdentity.derivationVersion).toBe("m1-v1");
    expect(body.meta.schemaVersion).toBe("atlast-domain-v1");
    expect(typeof body.page.hasMore).toBe("boolean");
  });

  it("filters entities by entityType with match-by-any-claim, keeping conflicted entities visible under each claimed type", async () => {
    const serviceResponse = await application.inject({
      method: "GET",
      url: "/api/v1/entities?entityType=service",
    });
    const databaseResponse = await application.inject({
      method: "GET",
      url: "/api/v1/entities?entityType=database",
    });
    expect(serviceResponse.statusCode).toBe(200);
    expect(databaseResponse.statusCode).toBe(200);

    const serviceBody = parseJsonBody(serviceResponse, entityPageSchema);
    const databaseBody = parseJsonBody(databaseResponse, entityPageSchema);

    const serviceIdentifiers = serviceBody.items.map(
      (item) => item.subject.identifier,
    );
    const databaseIdentifiers = databaseBody.items.map(
      (item) => item.subject.identifier,
    );

    // scenario 3 (conflicting-evidence): "orders" carries conflicting
    // service/database claims and must appear under both filters, with both
    // conflicting revisions serialized in-band.
    expect(serviceIdentifiers).toContain("atlast:entity:orders");
    expect(databaseIdentifiers).toContain("atlast:entity:orders");

    const ordersFromService = serviceBody.items.find(
      (item) => item.subject.identifier === "atlast:entity:orders",
    );
    expect(ordersFromService?.assertions.length).toBeGreaterThanOrEqual(2);
    expect(
      ordersFromService?.assertions.some(
        (assertion) => assertion.revision.conflictState.status === "conflicted",
      ),
    ).toBe(true);
  });

  it("rejects a malformed entityType filter token with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities?entityType=Not_Valid!",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("resolves latest, then reproduces byte-identical results when re-issued pinned with the resolved identity", async () => {
    const latestResponse = await application.inject({
      method: "GET",
      url: "/api/v1/entities",
    });
    const latestBody = parseJsonBody(latestResponse, entityPageSchema);
    const resolvedIdentity = latestBody.meta.resolvedIdentity;

    const pinnedResponse = await application.inject({
      method: "GET",
      url: `/api/v1/entities?asOf=${encodeURIComponent(resolvedIdentity.asOf)}&horizon=${String(resolvedIdentity.horizon)}&derivationVersion=${resolvedIdentity.derivationVersion}`,
    });

    expect(pinnedResponse.statusCode).toBe(200);
    expect(parseJsonBody(pinnedResponse, entityPageSchema)).toStrictEqual(
      latestBody,
    );
  });

  it("rejects an unknown query key with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities?bogus=1",
    });
    expect(response.statusCode).toBe(400);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("VALIDATION_ERROR");
    if (body.code === "VALIDATION_ERROR") {
      expect(body.details.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["query", "bogus"] }),
        ]),
      );
    }
  });

  it("rejects a non-integer limit with VALIDATION_ERROR naming the query field", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities?limit=abc",
    });
    expect(response.statusCode).toBe(400);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("VALIDATION_ERROR");
    if (body.code === "VALIDATION_ERROR") {
      expect(body.details.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["query", "limit"] }),
        ]),
      );
    }
  });

  it("rejects a repeated query key (array value) with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities?limit=25&limit=50",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects a partial pin, naming every missing component, identically whether or not a cursor is present", async () => {
    const withoutCursor = await application.inject({
      method: "GET",
      url: "/api/v1/entities?asOf=2026-04-20T12:00:00.000Z",
    });
    const withCursor = await application.inject({
      method: "GET",
      url: "/api/v1/entities?asOf=2026-04-20T12:00:00.000Z&cursor=irrelevant-token",
    });

    for (const response of [withoutCursor, withCursor]) {
      expect(response.statusCode).toBe(400);
      const body = parseJsonBody(response, errorResponseSchema);
      expect(body.code).toBe("VALIDATION_ERROR");
      if (body.code === "VALIDATION_ERROR") {
        const paths = body.details.issues.map((issue) => issue.path.join("."));
        expect(paths).toEqual(
          expect.arrayContaining(["query.horizon", "query.derivationVersion"]),
        );
      }
    }
  });

  it("continues a paginated walk via cursor with no duplicate or dropped items across pages", async () => {
    const firstPage = await application.inject({
      method: "GET",
      url: "/api/v1/entities?limit=1",
    });
    expect(firstPage.statusCode).toBe(200);
    const firstBody = parseJsonBody(firstPage, entityPageSchema);
    expect(firstBody.page.hasMore).toBe(true);
    expect(typeof firstBody.page.nextCursor).toBe("string");

    const secondPage = await application.inject({
      method: "GET",
      url: `/api/v1/entities?limit=1&cursor=${encodeURIComponent(firstBody.page.nextCursor ?? "")}`,
    });
    expect(secondPage.statusCode).toBe(200);
    const secondBody = parseJsonBody(secondPage, entityPageSchema);
    expect(secondBody.items[0]?.subject.identifier).not.toBe(
      firstBody.items[0]?.subject.identifier,
    );
  });

  it("rejects a cursor replayed against a different pinned identity with CURSOR_BINDING_MISMATCH naming identity", async () => {
    const firstPage = await application.inject({
      method: "GET",
      url: "/api/v1/entities?limit=1",
    });
    const cursor =
      parseJsonBody(firstPage, entityPageSchema).page.nextCursor ?? "";

    const mismatchedResponse = await application.inject({
      method: "GET",
      url: `/api/v1/entities?limit=1&cursor=${encodeURIComponent(cursor)}&asOf=${encodeURIComponent(FULL_CATALOG_SNAPSHOT_IDENTITY.asOf)}&horizon=${String(FULL_CATALOG_SNAPSHOT_IDENTITY.horizon)}&derivationVersion=${FULL_CATALOG_SNAPSHOT_IDENTITY.derivationVersion}`,
    });

    expect(mismatchedResponse.statusCode).toBe(422);
    const body = parseJsonBody(mismatchedResponse, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    if (
      body.code === "INVALID_READ_COORDINATE" &&
      body.details.reason === "CURSOR_BINDING_MISMATCH"
    ) {
      expect(body.details.cursorKind).toBe("graph");
      expect(body.details.mismatchFields).toEqual(
        expect.arrayContaining(["identity"]),
      );
    } else {
      throw new Error("expected a CURSOR_BINDING_MISMATCH reason");
    }
  });

  it("rejects a cursor replayed against a different operation with CURSOR_BINDING_MISMATCH naming operation", async () => {
    const firstPage = await application.inject({
      method: "GET",
      url: "/api/v1/entities?limit=1",
    });
    const cursor =
      parseJsonBody(firstPage, entityPageSchema).page.nextCursor ?? "";

    const crossOperationResponse = await application.inject({
      method: "GET",
      url: `/api/v1/search?q=checkout&limit=1&cursor=${encodeURIComponent(cursor)}`,
    });

    expect(crossOperationResponse.statusCode).toBe(422);
    const body = parseJsonBody(crossOperationResponse, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    if (
      body.code === "INVALID_READ_COORDINATE" &&
      body.details.reason === "CURSOR_BINDING_MISMATCH"
    ) {
      expect(body.details.mismatchFields).toEqual(
        expect.arrayContaining(["operation"]),
      );
    } else {
      throw new Error("expected a CURSOR_BINDING_MISMATCH reason");
    }
  });

  it("rejects an undecodable cursor token with INVALID_CURSOR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities?cursor=not-a-real-cursor-token",
    });
    expect(response.statusCode).toBe(422);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    if (body.code === "INVALID_READ_COORDINATE") {
      expect(body.details.reason).toBe("INVALID_CURSOR");
    }
  });

  it("rejects a cursorless latest read against an empty Evidence store with INVALID_READ_COORDINATE (EMPTY_EVIDENCE_STORE)", async () => {
    const emptyApplication = await initializeApplication(
      FIXED_TEST_CLOCK,
      [],
      loadFullDemoCompanyOverlayFrames(),
    );
    try {
      const response = await emptyApplication.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      expect(response.statusCode).toBe(422);
      const body = parseJsonBody(response, errorResponseSchema);
      expect(body.code).toBe("INVALID_READ_COORDINATE");
      if (body.code === "INVALID_READ_COORDINATE") {
        expect(body.details.reason).toBe("EMPTY_EVIDENCE_STORE");
      }
    } finally {
      await emptyApplication.close();
    }
  });
});

describe("GET /api/v1/entities/{entityId}", () => {
  let application: FastifyInstance;

  beforeEach(async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
  });

  afterEach(async () => {
    await application.close();
  });

  it("returns one entity with its supporting revisions and resolved read metadata", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout",
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, subjectDetailResultSchema);
    expect(body.data.subject.identifier).toBe("atlast:entity:checkout");
    expect(body.data.assertions.length).toBeGreaterThan(0);
    expect(body.meta.resolvedIdentity).toBeDefined();
  });

  it("reproduces byte-identical results for identical fully pinned requests", async () => {
    const pinnedUrl = `/api/v1/entities/atlast:entity:checkout?asOf=${encodeURIComponent(FULL_CATALOG_SNAPSHOT_IDENTITY.asOf)}&horizon=${String(FULL_CATALOG_SNAPSHOT_IDENTITY.horizon)}&derivationVersion=${FULL_CATALOG_SNAPSHOT_IDENTITY.derivationVersion}`;
    const first = await application.inject({ method: "GET", url: pinnedUrl });
    const second = await application.inject({ method: "GET", url: pinnedUrl });
    expect(first.statusCode).toBe(200);
    expect(parseJsonBody(second, subjectDetailResultSchema)).toStrictEqual(
      parseJsonBody(first, subjectDetailResultSchema),
    );
  });

  it("rejects an unknown entity identifier with UNKNOWN_IDENTIFIER, echoing the requested identifier", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:does-not-exist",
    });
    expect(response.statusCode).toBe(404);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("UNKNOWN_IDENTIFIER");
    if (body.code === "UNKNOWN_IDENTIFIER") {
      expect(body.details.identifierKind).toBe("subject");
      if (body.details.identifierKind === "subject") {
        expect(body.details.identifier).toBe("atlast:entity:does-not-exist");
        expect(body.details.resolvedIdentity).toBeDefined();
      }
    }
  });

  it("rejects a malformed entity identifier with VALIDATION_ERROR on the path parameter", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/Not-Valid",
    });
    expect(response.statusCode).toBe(400);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("VALIDATION_ERROR");
    if (body.code === "VALIDATION_ERROR") {
      expect(body.details.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["params", "entityId"] }),
        ]),
      );
    }
  });

  it("can never resolve a Relationship subject, rejecting a relationship identifier at the path-parameter shape", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:relationship:checkout-payment-call",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects a partial pin naming every missing component", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout?horizon=20",
    });
    expect(response.statusCode).toBe(400);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("VALIDATION_ERROR");
    if (body.code === "VALIDATION_ERROR") {
      const paths = body.details.issues.map((issue) => issue.path.join("."));
      expect(paths).toEqual(
        expect.arrayContaining(["query.asOf", "query.derivationVersion"]),
      );
    }
  });

  it("rejects limit/cursor query keys, which entity detail never accepts", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout?limit=1",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });
});
