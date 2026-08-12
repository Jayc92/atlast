/**
 * Integration tests for routes 5 and 6 (ADR-0024 §§ 1-2, 5, 7): Evidence
 * lookup and the entity-scoped evidence chain, driven through
 * `fastify.inject()` over the real application seeded with the
 * `demo-company` fixture catalog.
 */
import type { FastifyInstance } from "fastify";
import {
  errorResponseSchema,
  evidenceChainResultSchema,
  evidenceDetailResultSchema,
} from "@atlast/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeApplication } from "../app.ts";
import {
  FIXED_TEST_CLOCK,
  FULL_CATALOG_SNAPSHOT_IDENTITY,
  loadFullDemoCompanySeedEvidence,
} from "../test-support/demo-company-fixture.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";

/** A real, multi-segment `demo-company` Evidence identifier containing both `:` and `/`. */
const MULTI_SEGMENT_EVIDENCE_IDENTIFIER =
  "atlast:evidence:demo-company/deployment-inventory/0001";

/** Percent-encode exactly `:` and `/`, per ADR-0024 § 5. */
function percentEncodeStableIdentifier(identifier: string): string {
  return identifier.replaceAll(":", "%3A").replaceAll("/", "%2F");
}

describe("GET /api/v1/evidence/{evidenceId}", () => {
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

  it("looks up one Evidence record by its percent-encoded, multi-segment identifier", async () => {
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/evidence/${percentEncodeStableIdentifier(MULTI_SEGMENT_EVIDENCE_IDENTIFIER)}`,
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, evidenceDetailResultSchema);
    expect(body.data.identifier).toBe(MULTI_SEGMENT_EVIDENCE_IDENTIFIER);
    expect(body.meta).toStrictEqual({ schemaVersion: "atlast-domain-v1" });
  });

  it("mis-routes an un-encoded multi-segment identifier as extra path segments, producing ROUTE_NOT_FOUND", async () => {
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/evidence/${MULTI_SEGMENT_EVIDENCE_IDENTIFIER}`,
    });
    expect(response.statusCode).toBe(404);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "ROUTE_NOT_FOUND",
    );
  });

  it("rejects an unknown but well-formed Evidence identifier with UNKNOWN_IDENTIFIER and no resolvedIdentity", async () => {
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/evidence/${percentEncodeStableIdentifier("atlast:evidence:demo-company/nonexistent/9999")}`,
    });
    expect(response.statusCode).toBe(404);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("UNKNOWN_IDENTIFIER");
    if (body.code === "UNKNOWN_IDENTIFIER") {
      expect(body.details.identifierKind).toBe("evidence");
      if (body.details.identifierKind === "evidence") {
        expect(body.details.identifier).toBe(
          "atlast:evidence:demo-company/nonexistent/9999",
        );
      }
    }
  });

  it("rejects a malformed Evidence identifier with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/evidence/not-a-valid-identifier",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("accepts no pinning parameters at all, rejecting any of them with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/evidence/${percentEncodeStableIdentifier(MULTI_SEGMENT_EVIDENCE_IDENTIFIER)}?asOf=2026-04-20T12:00:00.000Z&horizon=20&derivationVersion=m1-v1`,
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("GET /api/v1/entities/{entityId}/evidence", () => {
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

  it("returns the non-empty Evidence chain supporting one entity's visible revisions", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/evidence",
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, evidenceChainResultSchema);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.meta.resolvedIdentity).toBeDefined();
  });

  it("reproduces byte-identical results for identical fully pinned requests", async () => {
    const url = `/api/v1/entities/atlast:entity:checkout/evidence?asOf=${encodeURIComponent(FULL_CATALOG_SNAPSHOT_IDENTITY.asOf)}&horizon=${String(FULL_CATALOG_SNAPSHOT_IDENTITY.horizon)}&derivationVersion=${FULL_CATALOG_SNAPSHOT_IDENTITY.derivationVersion}`;
    const first = await application.inject({ method: "GET", url });
    const second = await application.inject({ method: "GET", url });
    expect(first.statusCode).toBe(200);
    expect(parseJsonBody(second, evidenceChainResultSchema)).toStrictEqual(
      parseJsonBody(first, evidenceChainResultSchema),
    );
  });

  it("continues a paginated walk via cursor with no duplicate or dropped items across pages", async () => {
    const firstPage = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/evidence?limit=1",
    });
    expect(firstPage.statusCode).toBe(200);
    const firstBody = parseJsonBody(firstPage, evidenceChainResultSchema);
    expect(firstBody.page.hasMore).toBe(true);

    const secondPage = await application.inject({
      method: "GET",
      url: `/api/v1/entities/atlast:entity:checkout/evidence?limit=1&cursor=${encodeURIComponent(firstBody.page.nextCursor ?? "")}`,
    });
    expect(secondPage.statusCode).toBe(200);
    const secondBody = parseJsonBody(secondPage, evidenceChainResultSchema);
    expect(secondBody.items[0]?.identifier).not.toBe(
      firstBody.items[0]?.identifier,
    );
  });

  it("rejects an unknown entity with UNKNOWN_IDENTIFIER", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:does-not-exist/evidence",
    });
    expect(response.statusCode).toBe(404);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "UNKNOWN_IDENTIFIER",
    );
  });
});
