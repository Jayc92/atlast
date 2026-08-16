/**
 * Integration tests for route 7 (ADR-0024 §§ 1-2, 6, 9): snapshot summary —
 * always pinned, no latest mode, no pagination — driven through
 * `fastify.inject()` over the real application. Several `INVALID_READ_COORDINATE`
 * reasons are exercised through the real in-memory store by choosing seed
 * Evidence and identity components deliberately, rather than a stub,
 * per ADR-0024 § 12's preference for the real stores wherever they can be
 * coerced into the failure directly.
 */
import type { FastifyInstance } from "fastify";
import {
  errorResponseSchema,
  MAXIMUM_PAGE_LIMIT,
  snapshotAnchorsResultSchema,
  snapshotDetailResultSchema,
  type Evidence,
  type SnapshotIdentity,
} from "@atlast/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApplication, initializeApplication } from "../app.ts";
import {
  FIXED_TEST_CLOCK,
  FULL_CATALOG_SNAPSHOT_IDENTITY,
  UNSUPPORTED_DERIVATION_VERSION_IDENTITY,
  loadDemoCompanySeedEvidenceForScenarios,
  loadFullDemoCompanySeedEvidence,
} from "../test-support/demo-company-fixture.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";
import {
  createStubEvidenceStore,
  createStubTopologyGraphStore,
} from "../test-support/stub-repositories.ts";

function snapshotUrl(identity: {
  readonly asOf?: string;
  readonly horizon?: number;
  readonly derivationVersion?: string;
}): string {
  const params = new URLSearchParams();
  if (identity.asOf !== undefined) params.set("asOf", identity.asOf);
  if (identity.horizon !== undefined)
    params.set("horizon", String(identity.horizon));
  if (identity.derivationVersion !== undefined)
    params.set("derivationVersion", identity.derivationVersion);
  return `/api/v1/snapshots?${params.toString()}`;
}

describe("GET /api/v1/snapshots", () => {
  let application: FastifyInstance;

  afterEach(async () => {
    await application.close();
  });

  it("returns exactly the narrowed checksum/subjectCount envelope for a complete pinned identity", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
    );
    const response = await application.inject({
      method: "GET",
      url: snapshotUrl(FULL_CATALOG_SNAPSHOT_IDENTITY),
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, snapshotDetailResultSchema);
    expect(body.data.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof body.data.subjectCount).toBe("number");
    expect(body.meta.resolvedIdentity).toStrictEqual(
      FULL_CATALOG_SNAPSHOT_IDENTITY,
    );
  });

  it("is byte-identical across replays of the identical pinned identity", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
    );
    const url = snapshotUrl(FULL_CATALOG_SNAPSHOT_IDENTITY);
    const first = await application.inject({ method: "GET", url });
    const second = await application.inject({ method: "GET", url });
    expect(parseJsonBody(second, snapshotDetailResultSchema)).toStrictEqual(
      parseJsonBody(first, snapshotDetailResultSchema),
    );
  });

  it("rejects a missing identity component as an ordinary VALIDATION_ERROR, never a latest resolution", async () => {
    application = await initializeApplication(FIXED_TEST_CLOCK, []);
    const response = await application.inject({
      method: "GET",
      url: snapshotUrl({
        asOf: FULL_CATALOG_SNAPSHOT_IDENTITY.asOf,
        horizon: FULL_CATALOG_SNAPSHOT_IDENTITY.horizon,
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects limit/cursor, which snapshots never accept", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
    );
    const response = await application.inject({
      method: "GET",
      url: `${snapshotUrl(FULL_CATALOG_SNAPSHOT_IDENTITY)}&limit=1`,
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects an unsupported derivation version with INVALID_READ_COORDINATE", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
    );
    const response = await application.inject({
      method: "GET",
      url: snapshotUrl(UNSUPPORTED_DERIVATION_VERSION_IDENTITY),
    });
    expect(response.statusCode).toBe(422);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    if (
      body.code === "INVALID_READ_COORDINATE" &&
      body.details.reason === "UNSUPPORTED_DERIVATION_VERSION"
    ) {
      expect(body.details.unsupportedDerivationVersion).toBe("m1-v2");
    } else {
      throw new Error("expected UNSUPPORTED_DERIVATION_VERSION");
    }
  });

  it("rejects a horizon above the current watermark with INVALID_READ_COORDINATE", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
    );
    const response = await application.inject({
      method: "GET",
      url: snapshotUrl({
        asOf: FULL_CATALOG_SNAPSHOT_IDENTITY.asOf,
        horizon: 21,
        derivationVersion: "m1-v1",
      }),
    });
    expect(response.statusCode).toBe(422);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    if (
      body.code === "INVALID_READ_COORDINATE" &&
      body.details.reason === "HORIZON_AFTER_CURRENT_WATERMARK"
    ) {
      expect(body.details.currentWatermark).toBe(20);
    } else {
      throw new Error("expected HORIZON_AFTER_CURRENT_WATERMARK");
    }
  });

  it("rejects a horizon before the first recorded Evidence with INVALID_READ_COORDINATE", async () => {
    // Scenario 7 alone spans recordedSequence 14-20, so horizon=5 precedes
    // its first record without a stub.
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadDemoCompanySeedEvidenceForScenarios(["historical-as-of-topology"]),
    );
    const response = await application.inject({
      method: "GET",
      url: snapshotUrl({
        asOf: FULL_CATALOG_SNAPSHOT_IDENTITY.asOf,
        horizon: 5,
        derivationVersion: "m1-v1",
      }),
    });
    expect(response.statusCode).toBe(422);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    if (
      body.code === "INVALID_READ_COORDINATE" &&
      body.details.reason === "HORIZON_BEFORE_FIRST_EVIDENCE"
    ) {
      expect(body.details.firstRecordedSequence).toBe(14);
    } else {
      throw new Error("expected HORIZON_BEFORE_FIRST_EVIDENCE");
    }
  });
});

describe("GET /api/v1/snapshot-anchors", () => {
  let application: FastifyInstance;

  afterEach(async () => {
    await application.close();
  });

  it("returns real retained observation anchors newest-first and every anchor is accepted by snapshot summary", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
    );
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/snapshot-anchors",
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, snapshotAnchorsResultSchema);
    const expectedInstants = [
      ...new Set(
        loadFullDemoCompanySeedEvidence().map((item) => item.observedAt),
      ),
    ].sort((left, right) => right.localeCompare(left));
    expect(body.items.map((item) => item.identity.asOf)).toStrictEqual(
      expectedInstants,
    );
    expect(body.meta).toStrictEqual({
      schemaVersion: "atlast-domain-v1",
      resolvedHorizon: 20,
      derivationVersion: "m1-v1",
    });
    expect(body.truncated).toBe(false);

    for (const anchor of body.items) {
      const summaryResponse = await application.inject({
        method: "GET",
        url: snapshotUrl(anchor.identity),
      });
      expect(summaryResponse.statusCode).toBe(200);
      const summary = parseJsonBody(
        summaryResponse,
        snapshotDetailResultSchema,
      );
      expect(summary.data).toStrictEqual({
        checksum: anchor.checksum,
        subjectCount: anchor.subjectCount,
      });
      expect(summary.meta.resolvedIdentity).toStrictEqual(anchor.identity);
    }
  });

  it("reads the watermark once, pages at the maximum size, resolves at most 101 candidates, and returns only 100", async () => {
    const template = loadFullDemoCompanySeedEvidence()[0] as Evidence;
    const candidates = Array.from({ length: 102 }, (_, index) =>
      new Date(Date.UTC(2026, 7, 13, 12, 0, 0) - index * 60_000).toISOString(),
    );
    const evidence = candidates.map((observedAt, index) => ({
      ...template,
      identifier: `atlast:evidence:anchor/${String(index + 1)}`,
      observedAt,
      recordedSequence: index + 1,
    })) as readonly Evidence[];
    const getCurrentWatermark = vi.fn(() => Promise.resolve(102));
    const listEvidence = vi.fn(
      (
        horizon: number,
        request: { readonly limit: number; readonly cursor?: string },
      ) => {
        expect(horizon).toBe(102);
        expect(request.limit).toBe(MAXIMUM_PAGE_LIMIT);
        return Promise.resolve(
          request.cursor === undefined
            ? {
                items: evidence.slice(0, 100),
                page: { hasMore: true as const, nextCursor: "page-2" },
              }
            : {
                items: evidence.slice(100),
                page: { hasMore: false as const },
              },
        );
      },
    );
    const getSnapshotSummary = vi.fn((identity: SnapshotIdentity) =>
      Promise.resolve({
        identity,
        checksum: identity.asOf
          .replaceAll(/[^0-9a-f]/g, "")
          .padEnd(64, "0")
          .slice(0, 64),
        subjectCount: 1,
        schemaVersion: "atlast-domain-v1" as const,
      }),
    );
    application = buildApplication({
      evidenceStore: createStubEvidenceStore({
        getCurrentWatermark,
        listEvidence,
      }),
      topologyGraphStore: createStubTopologyGraphStore({ getSnapshotSummary }),
    });

    const response = await application.inject({
      method: "GET",
      url: "/api/v1/snapshot-anchors",
    });
    const body = parseJsonBody(response, snapshotAnchorsResultSchema);
    expect(response.statusCode).toBe(200);
    expect(getCurrentWatermark).toHaveBeenCalledTimes(1);
    expect(listEvidence).toHaveBeenCalledTimes(2);
    expect(getSnapshotSummary).toHaveBeenCalledTimes(101);
    expect(body.items).toHaveLength(100);
    expect(body.truncated).toBe(true);
    expect(body.items[0]?.identity.asOf).toBe(candidates[0]);
    expect(body.items.at(-1)?.identity.asOf).toBe(candidates[99]);
  });

  it("rejects empty Evidence with the existing closed error", async () => {
    application = await initializeApplication(FIXED_TEST_CLOCK, []);
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/snapshot-anchors",
    });
    expect(response.statusCode).toBe(422);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    expect(body.details).toStrictEqual({ reason: "EMPTY_EVIDENCE_STORE" });
  });

  it("rejects unknown and repeated query parameters", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
    );
    for (const url of [
      "/api/v1/snapshot-anchors?limit=1",
      "/api/v1/snapshot-anchors?unused=1&unused=2",
    ]) {
      const response = await application.inject({ method: "GET", url });
      expect(response.statusCode).toBe(400);
      expect(parseJsonBody(response, errorResponseSchema).code).toBe(
        "VALIDATION_ERROR",
      );
    }
  });
});
