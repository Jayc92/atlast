import type { FastifyInstance } from "fastify";
import {
  CURRENT_SCHEMA_VERSION,
  errorResponseSchema,
  healthContextResultSchema,
  overlayFrameSchema,
  snapshotDetailResultSchema,
  traversalResultSchema,
  type EntityIdentifier,
  type OverlayFrame,
  type SnapshotIdentity,
  type TraversalResult,
} from "@atlast/shared";
import {
  InMemoryTopologyGraphStore,
  UnknownIdentifierError,
} from "@atlast/graph-model";
import { InMemoryOperationalOverlayStore } from "@atlast/overlay-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApplication, initializeApplication } from "../app.ts";
import {
  FIXED_TEST_CLOCK,
  FULL_CATALOG_SNAPSHOT_IDENTITY,
  loadFullDemoCompanyOverlayFrames,
  loadFullDemoCompanySeedEvidence,
} from "../test-support/demo-company-fixture.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";
import {
  createStubEvidenceStore,
  createStubOperationalOverlayStore,
  createStubTopologyGraphStore,
} from "../test-support/stub-repositories.ts";

const ROUTE = "/api/v1/entities/atlast:entity:checkout/health-context";

function pinnedQuery(identity: SnapshotIdentity): string {
  return `asOf=${encodeURIComponent(identity.asOf)}&horizon=${String(identity.horizon)}&derivationVersion=${identity.derivationVersion}`;
}

function emptyTraversal(
  identity: SnapshotIdentity,
  truncated = false,
): TraversalResult {
  return traversalResultSchema.parse({
    items: [],
    traversal: { truncated, subjectCount: 0 },
    meta: {
      resolvedIdentity: identity,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
  });
}

function frameWithTargets(
  targets: readonly EntityIdentifier[],
  effectiveAt = FULL_CATALOG_SNAPSHOT_IDENTITY.asOf,
): OverlayFrame {
  return overlayFrameSchema.parse({
    schemaVersion: "atlast-overlay-v1",
    identifier: "atlast:overlay-frame:demo-company/test-frame",
    scenarioIdentifier: "demo-company",
    effectiveAt,
    entries: targets.map((targetEntityIdentifier, index) => ({
      identifier: `atlast:overlay-entry:demo-company/test-frame/target-${String(index).padStart(3, "0")}`,
      targetEntityIdentifier,
      directCondition: "degraded",
    })),
  });
}

describe("GET /api/v1/entities/{entityId}/health-context", () => {
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
    vi.restoreAllMocks();
  });

  it("composes latest topology with the latest eligible frame, projections, latent risk, and an unknown-target gap", async () => {
    const response = await application.inject({
      method: "GET",
      url: `${ROUTE}?direction=downstream&depth=1`,
    });

    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, healthContextResultSchema);
    expect(body.meta.overlay).toStrictEqual({
      schemaVersion: "atlast-overlay-v1",
      frameIdentifier: "atlast:overlay-frame:demo-company/active-conditions",
      effectiveAt: "2026-04-20T12:00:00.000Z",
    });
    expect(body.data.originEntityIdentifier).toBe("atlast:entity:checkout");
    expect(
      body.data.projections.map((projection) => projection.entityIdentifier),
    ).toStrictEqual(
      [
        "atlast:entity:checkout",
        ...body.data.items
          .filter((item) => item.subject.subjectKind === "entity")
          .map((item) => item.subject.identifier),
      ].sort(),
    );
    expect(body.data.projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityIdentifier: "atlast:entity:checkout",
          effectiveState: "latent-downstream-risk",
        }),
        expect.objectContaining({
          entityIdentifier: "atlast:entity:fulfillment",
          effectiveState: "down",
        }),
      ]),
    );
    expect(body.data.gaps).toStrictEqual([
      {
        entryIdentifier:
          "atlast:overlay-entry:demo-company/active-conditions/retired-billing",
        targetEntityIdentifier: "atlast:entity:retired-billing",
        directCondition: "disconnected",
        reason: "UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT",
      },
    ]);
  });

  it("performs one traversal and one frame resolution, skips in-scope targets, and reuses the exact resolved identity for out-of-scope checks", async () => {
    const traverse = vi.spyOn(InMemoryTopologyGraphStore.prototype, "traverse");
    const getSubject = vi.spyOn(
      InMemoryTopologyGraphStore.prototype,
      "getSubject",
    );
    const selectFrame = vi.spyOn(
      InMemoryOperationalOverlayStore.prototype,
      "getLatestFrameAtOrBefore",
    );
    const exactFrame = vi.spyOn(
      InMemoryOperationalOverlayStore.prototype,
      "getFrameByIdentifier",
    );

    const response = await application.inject({
      method: "GET",
      url: `${ROUTE}?direction=downstream&depth=1`,
    });
    const body = parseJsonBody(response, healthContextResultSchema);

    expect(traverse).toHaveBeenCalledTimes(1);
    expect(selectFrame).toHaveBeenCalledTimes(1);
    expect(exactFrame).not.toHaveBeenCalled();
    expect(getSubject).toHaveBeenCalledTimes(2);
    expect(
      getSubject.mock.calls.map(([identifier]) => identifier),
    ).toStrictEqual(["atlast:entity:orders", "atlast:entity:retired-billing"]);
    for (const [, readMode] of getSubject.mock.calls) {
      expect(readMode).toStrictEqual({
        mode: "pinned",
        identity: body.meta.resolvedIdentity,
      });
    }
  });

  it("supports a complete historical pin and byte-identical deterministic replay", async () => {
    const url = `${ROUTE}?direction=downstream&depth=2&${pinnedQuery(FULL_CATALOG_SNAPSHOT_IDENTITY)}`;
    const first = await application.inject({ method: "GET", url });
    const second = await application.inject({ method: "GET", url });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.body).toBe(first.body);
    expect(
      parseJsonBody(first, healthContextResultSchema).meta.resolvedIdentity,
    ).toStrictEqual(FULL_CATALOG_SNAPSHOT_IDENTITY);
  });

  it("selects one explicit eligible frame without changing topology identity", async () => {
    const exactFrame = vi.spyOn(
      InMemoryOperationalOverlayStore.prototype,
      "getFrameByIdentifier",
    );
    const selectFrame = vi.spyOn(
      InMemoryOperationalOverlayStore.prototype,
      "getLatestFrameAtOrBefore",
    );
    const response = await application.inject({
      method: "GET",
      url: `${ROUTE}?direction=downstream&depth=1&overlayFrame=atlast%3Aoverlay-frame%3Ademo-company%2Fbaseline`,
    });

    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, healthContextResultSchema);
    expect(body.meta.overlay.frameIdentifier).toBe(
      "atlast:overlay-frame:demo-company/baseline",
    );
    expect(body.meta.resolvedIdentity.horizon).toBe(20);
    expect(exactFrame).toHaveBeenCalledTimes(1);
    expect(selectFrame).not.toHaveBeenCalled();
  });

  it.each([
    ["missing direction", `${ROUTE}?depth=1`],
    ["missing depth", `${ROUTE}?direction=downstream`],
    ["invalid depth", `${ROUTE}?direction=downstream&depth=6`],
    [
      "invalid confidence",
      `${ROUTE}?direction=downstream&depth=1&minConfidence=not-a-number`,
    ],
    ["unknown key", `${ROUTE}?direction=downstream&depth=1&limit=1`],
    [
      "repeated key",
      `${ROUTE}?direction=downstream&direction=upstream&depth=1`,
    ],
    [
      "partial pin",
      `${ROUTE}?direction=downstream&depth=1&asOf=2026-04-20T12%3A00%3A00.000Z`,
    ],
    [
      "malformed frame",
      `${ROUTE}?direction=downstream&depth=1&overlayFrame=baseline`,
    ],
  ])("rejects %s through the validation boundary", async (_label, url) => {
    const response = await application.inject({ method: "GET", url });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("maps an unknown explicit frame to the exact closed 404", async () => {
    const overlayFrame = "atlast:overlay-frame:demo-company/does-not-exist";
    const response = await application.inject({
      method: "GET",
      url: `${ROUTE}?direction=downstream&depth=1&overlayFrame=${encodeURIComponent(overlayFrame)}`,
    });
    expect(response.statusCode).toBe(404);
    expect(parseJsonBody(response, errorResponseSchema)).toStrictEqual({
      code: "OVERLAY_FRAME_NOT_FOUND",
      message: "The requested overlay frame does not exist.",
      details: { overlayFrame },
    });
  });

  it("rejects latest frame selection when no frame is eligible", async () => {
    const identity = {
      ...FULL_CATALOG_SNAPSHOT_IDENTITY,
      asOf: "2026-04-01T08:00:00.000Z",
    } as const;
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/entities/atlast:entity:api/health-context?direction=downstream&depth=1&${pinnedQuery(identity)}`,
    });
    expect(response.statusCode).toBe(422);
    expect(parseJsonBody(response, errorResponseSchema)).toStrictEqual({
      code: "INVALID_OVERLAY_COORDINATE",
      message: "No overlay frame exists at or before this topology snapshot.",
      details: {
        reason: "NO_FRAME_AT_OR_BEFORE_SNAPSHOT",
        topologyAsOf: identity.asOf,
      },
    });
  });

  it("rejects an explicit frame later than the topology snapshot", async () => {
    const identity = {
      ...FULL_CATALOG_SNAPSHOT_IDENTITY,
      asOf: "2026-04-01T08:00:00.000Z",
    } as const;
    const overlayFrame = "atlast:overlay-frame:demo-company/baseline";
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/entities/atlast:entity:api/health-context?direction=downstream&depth=1&${pinnedQuery(identity)}&overlayFrame=${encodeURIComponent(overlayFrame)}`,
    });
    expect(response.statusCode).toBe(422);
    expect(parseJsonBody(response, errorResponseSchema)).toStrictEqual({
      code: "INVALID_OVERLAY_COORDINATE",
      message:
        "The requested overlay frame is later than the topology snapshot.",
      details: {
        reason: "FRAME_AFTER_TOPOLOGY_SNAPSHOT",
        topologyAsOf: identity.asOf,
        overlayFrame,
        frameEffectiveAt: "2026-04-01T12:00:00.000Z",
      },
    });
  });

  it("propagates traversal truncation to every projection", async () => {
    const frame = frameWithTargets(["atlast:entity:checkout"]);
    const traversal = emptyTraversal(FULL_CATALOG_SNAPSHOT_IDENTITY, true);
    const truncatedApplication = buildApplication({
      evidenceStore: createStubEvidenceStore(),
      topologyGraphStore: createStubTopologyGraphStore({
        traverse: () => Promise.resolve(traversal),
      }),
      operationalOverlayStore: createStubOperationalOverlayStore({
        getLatestFrameAtOrBefore: () => Promise.resolve(frame),
      }),
    });
    try {
      const response = await truncatedApplication.inject({
        method: "GET",
        url: `${ROUTE}?direction=downstream&depth=1`,
      });
      expect(response.statusCode).toBe(200);
      const body = parseJsonBody(response, healthContextResultSchema);
      expect(body.traversal.truncated).toBe(true);
      expect(
        body.data.projections.every(
          (projection) => projection.contextCompleteness === "truncated",
        ),
      ).toBe(true);
    } finally {
      await truncatedApplication.close();
    }
  });

  it("caps frame-wide out-of-scope existence reads at the schema maximum of 100", async () => {
    const targets = Array.from(
      { length: 100 },
      (_, index) => `atlast:entity:unknown-${String(index).padStart(3, "0")}`,
    );
    const frame = frameWithTargets(targets);
    const getSubject = vi.fn((identifier: string) =>
      Promise.reject(
        new UnknownIdentifierError({
          identifierKind: "subject",
          identifier,
          resolvedIdentity: FULL_CATALOG_SNAPSHOT_IDENTITY,
        }),
      ),
    );
    const boundedApplication = buildApplication({
      evidenceStore: createStubEvidenceStore(),
      topologyGraphStore: createStubTopologyGraphStore({
        traverse: () =>
          Promise.resolve(emptyTraversal(FULL_CATALOG_SNAPSHOT_IDENTITY)),
        getSubject,
      }),
      operationalOverlayStore: createStubOperationalOverlayStore({
        getLatestFrameAtOrBefore: () => Promise.resolve(frame),
      }),
    });
    try {
      const response = await boundedApplication.inject({
        method: "GET",
        url: `${ROUTE}?direction=downstream&depth=1`,
      });
      expect(response.statusCode).toBe(200);
      expect(getSubject).toHaveBeenCalledTimes(100);
      expect(
        parseJsonBody(response, healthContextResultSchema).data.gaps,
      ).toHaveLength(100);
    } finally {
      await boundedApplication.close();
    }
  });

  it("redacts unexpected overlay failures", async () => {
    const brokenApplication = buildApplication({
      evidenceStore: createStubEvidenceStore(),
      topologyGraphStore: createStubTopologyGraphStore({
        traverse: () =>
          Promise.resolve(emptyTraversal(FULL_CATALOG_SNAPSHOT_IDENTITY)),
      }),
      operationalOverlayStore: createStubOperationalOverlayStore({
        getLatestFrameAtOrBefore: () =>
          Promise.reject(new Error("secret provider failure")),
      }),
    });
    try {
      const response = await brokenApplication.inject({
        method: "GET",
        url: `${ROUTE}?direction=downstream&depth=1`,
      });
      expect(response.statusCode).toBe(500);
      expect(parseJsonBody(response, errorResponseSchema)).toStrictEqual({
        code: "INTERNAL_ERROR",
        message: "An unexpected internal error occurred.",
        details: {},
      });
      expect(response.body).not.toContain("secret provider failure");
    } finally {
      await brokenApplication.close();
    }
  });

  it("does not mutate the topology snapshot checksum or subject count", async () => {
    const snapshotUrl = `/api/v1/snapshots?${pinnedQuery(FULL_CATALOG_SNAPSHOT_IDENTITY)}`;
    const before = await application.inject({
      method: "GET",
      url: snapshotUrl,
    });
    const health = await application.inject({
      method: "GET",
      url: `${ROUTE}?direction=downstream&depth=2&${pinnedQuery(FULL_CATALOG_SNAPSHOT_IDENTITY)}`,
    });
    const after = await application.inject({ method: "GET", url: snapshotUrl });

    expect(health.statusCode).toBe(200);
    expect(parseJsonBody(after, snapshotDetailResultSchema)).toStrictEqual(
      parseJsonBody(before, snapshotDetailResultSchema),
    );
  });
});
