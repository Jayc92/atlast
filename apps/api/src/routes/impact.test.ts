/**
 * Integration tests for the M4-B composed impact-query route (ADR-0033),
 * driven through `fastify.inject()` over the real application seeded with
 * the `demo-company` fixture catalog. The exact-match accuracy-harness
 * scoring suite over hand-authored scenarios lives separately in
 * `../test-support/impact-scenario-catalog.test.ts` (ADR-0035); these tests
 * cover the route's own parameter matrix, coercion, closed error mapping,
 * envelope invariants, and the one-traversal/zero-additional-repository-read
 * composition obligation ADR-0033 § 2 states.
 */
import type { FastifyInstance } from "fastify";
import {
  errorResponseSchema,
  impactResultEnvelopeSchema,
} from "@atlast/shared";
import {
  InMemoryEvidenceStore,
  InMemoryTopologyGraphStore,
} from "@atlast/graph-model";
import { InMemoryOperationalOverlayStore } from "@atlast/overlay-model";
import { afterEach, describe, expect, it } from "vitest";
import { buildApplication, initializeApplication } from "../app.ts";
import {
  createCallCountingTopologyGraphStore,
  type CallCountingTopologyGraphStore,
} from "../test-support/call-counting-topology-graph-store.ts";
import {
  FIXED_TEST_CLOCK,
  FULL_CATALOG_SNAPSHOT_IDENTITY,
  UNSUPPORTED_DERIVATION_VERSION_IDENTITY,
  loadDemoCompanySeedEvidenceForScenarios,
  loadFullDemoCompanyOverlayFrames,
  loadFullDemoCompanySeedEvidence,
} from "../test-support/demo-company-fixture.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";

function impactUrl(
  entityId: string,
  query: Readonly<Record<string, string | number | undefined>>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  return `/api/v1/entities/${entityId}/impact?${params.toString()}`;
}

function fullPinQuery(): Record<string, string | number> {
  return {
    asOf: FULL_CATALOG_SNAPSHOT_IDENTITY.asOf,
    horizon: FULL_CATALOG_SNAPSHOT_IDENTITY.horizon,
    derivationVersion: FULL_CATALOG_SNAPSHOT_IDENTITY.derivationVersion,
  };
}

describe("GET /api/v1/entities/{entityId}/impact", () => {
  let application: FastifyInstance;

  afterEach(async () => {
    await application.close();
  });

  it("composes one traversal with the pure impact engine, echoing changeType without ranking influence", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
        ...fullPinQuery(),
      }),
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, impactResultEnvelopeSchema);
    expect(body.data.originEntityIdentifier).toBe("atlast:entity:web");
    expect(body.data.changeType).toBe("removal");
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.results.map((result) => result.entityIdentifier)).toEqual([
      "atlast:entity:api",
      "atlast:entity:worker",
      "atlast:entity:archive",
    ]);
    for (const result of body.data.results) {
      expect(result.rankScore).toBeGreaterThanOrEqual(0);
      expect(result.rankScore).toBeLessThanOrEqual(1);
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.pathEdgeCount).toBe(result.path.length);
    }
  });

  it("echoes each changeType literally without altering ranking or the traversal it composes", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const changeTypes = ["removal", "degradation", "interface-change"] as const;
    const bodies = await Promise.all(
      changeTypes.map(async (changeType) => {
        const response = await application.inject({
          method: "GET",
          url: impactUrl("atlast:entity:web", {
            direction: "downstream",
            depth: 3,
            changeType,
            ...fullPinQuery(),
          }),
        });
        return parseJsonBody(response, impactResultEnvelopeSchema);
      }),
    );
    for (const [index, changeType] of changeTypes.entries()) {
      expect(bodies[index]?.data.changeType).toBe(changeType);
    }
    const [removal, degradation, interfaceChange] = bodies;
    expect(degradation?.data.results).toStrictEqual(removal?.data.results);
    expect(interfaceChange?.data.results).toStrictEqual(removal?.data.results);
    expect(degradation?.data.items).toStrictEqual(removal?.data.items);
    expect(degradation?.traversal).toStrictEqual(removal?.traversal);
  });

  it("returns an empty results array as a valid 200 when no eligible edge is reachable", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:orders", {
        direction: "downstream",
        depth: 2,
        changeType: "degradation",
        ...fullPinQuery(),
      }),
    });
    expect(response.statusCode).toBe(200);
    expect(
      parseJsonBody(response, impactResultEnvelopeSchema).data.results,
    ).toEqual([]);
  });

  it("requires direction, rejecting its absence with VALIDATION_ERROR naming the wire field", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        depth: 3,
        changeType: "removal",
      }),
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
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        changeType: "removal",
      }),
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

  it("filters by minConfidence, mapping the wire name to the internal field", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:checkout", {
        direction: "downstream",
        depth: 2,
        changeType: "removal",
        minConfidence: 0.6,
        ...fullPinQuery(),
      }),
    });
    expect(response.statusCode).toBe(200);
    expect(
      parseJsonBody(response, impactResultEnvelopeSchema).data.results,
    ).toEqual([]);
  });

  it("reports a non-numeric minConfidence with VALIDATION_ERROR naming the wire field minConfidence", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
        minConfidence: "abc",
      }),
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

  it("requires changeType, rejecting its absence with MALFORMED_REQUEST", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema)).toStrictEqual({
      code: "MALFORMED_REQUEST",
      message: "The request could not be parsed.",
      details: {},
    });
  });

  it("rejects an unknown changeType token with MALFORMED_REQUEST", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "upgrade",
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema)).toStrictEqual({
      code: "MALFORMED_REQUEST",
      message: "The request could not be parsed.",
      details: {},
    });
  });

  it("rejects a repeated changeType key with MALFORMED_REQUEST", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/entities/atlast:entity:web/impact?direction=downstream&depth=3&changeType=removal&changeType=degradation`,
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema)).toStrictEqual({
      code: "MALFORMED_REQUEST",
      message: "The request could not be parsed.",
      details: {},
    });
  });

  it("rejects limit and cursor, which impact never accepts (bounded by the traversal budget instead)", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const limitResponse = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
        limit: 10,
      }),
    });
    expect(limitResponse.statusCode).toBe(400);
    expect(parseJsonBody(limitResponse, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );

    const cursorResponse = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
        cursor: "opaque-cursor-token",
      }),
    });
    expect(cursorResponse.statusCode).toBe(400);
    expect(parseJsonBody(cursorResponse, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("resolves an unpinned latest request successfully, exactly as the traversal route does", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
      }),
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, impactResultEnvelopeSchema);
    expect(body.meta.resolvedIdentity.derivationVersion).toBe("m1-v1");
    expect(body.data.results.map((result) => result.entityIdentifier)).toEqual([
      "atlast:entity:api",
      "atlast:entity:worker",
      "atlast:entity:archive",
    ]);
  });

  it("rejects a malformed origin entity identifier at the path parameter", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("Not-Valid", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects an unknown origin entity with UNKNOWN_IDENTIFIER", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:does-not-exist", {
        direction: "downstream",
        depth: 1,
        changeType: "removal",
      }),
    });
    expect(response.statusCode).toBe(404);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "UNKNOWN_IDENTIFIER",
    );
  });

  it("rejects an unsupported derivation version with INVALID_READ_COORDINATE", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
        asOf: UNSUPPORTED_DERIVATION_VERSION_IDENTITY.asOf,
        horizon: UNSUPPORTED_DERIVATION_VERSION_IDENTITY.horizon,
        derivationVersion:
          UNSUPPORTED_DERIVATION_VERSION_IDENTITY.derivationVersion,
      }),
    });
    expect(response.statusCode).toBe(422);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    if (body.code === "INVALID_READ_COORDINATE") {
      expect(body.details.reason).toBe("UNSUPPORTED_DERIVATION_VERSION");
    }
  });

  it("rejects a horizon above the current watermark with INVALID_READ_COORDINATE", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
        asOf: FULL_CATALOG_SNAPSHOT_IDENTITY.asOf,
        horizon: 21,
        derivationVersion: "m1-v1",
      }),
    });
    expect(response.statusCode).toBe(422);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    if (body.code === "INVALID_READ_COORDINATE") {
      expect(body.details.reason).toBe("HORIZON_AFTER_CURRENT_WATERMARK");
    }
  });

  it("rejects a horizon before the first recorded Evidence with INVALID_READ_COORDINATE", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadDemoCompanySeedEvidenceForScenarios(["historical-as-of-topology"]),
      loadFullDemoCompanyOverlayFrames(),
    );
    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
        asOf: FULL_CATALOG_SNAPSHOT_IDENTITY.asOf,
        horizon: 5,
        derivationVersion: "m1-v1",
      }),
    });
    expect(response.statusCode).toBe(422);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INVALID_READ_COORDINATE");
    if (body.code === "INVALID_READ_COORDINATE") {
      expect(body.details.reason).toBe("HORIZON_BEFORE_FIRST_EVIDENCE");
    }
  });

  it("replays an identical pinned request byte-identically", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const url = impactUrl("atlast:entity:web", {
      direction: "downstream",
      depth: 3,
      changeType: "removal",
      ...fullPinQuery(),
    });
    const first = await application.inject({ method: "GET", url });
    const second = await application.inject({ method: "GET", url });
    expect(parseJsonBody(second, impactResultEnvelopeSchema)).toStrictEqual(
      parseJsonBody(first, impactResultEnvelopeSchema),
    );
  });

  it("composes exactly one traverse call and no other repository read", async () => {
    const evidenceStore = new InMemoryEvidenceStore(FIXED_TEST_CLOCK);
    await evidenceStore.appendEvidence(loadFullDemoCompanySeedEvidence());
    const realTopologyGraphStore = new InMemoryTopologyGraphStore(
      evidenceStore,
      FIXED_TEST_CLOCK,
    );
    const countingTopologyGraphStore: CallCountingTopologyGraphStore =
      createCallCountingTopologyGraphStore(realTopologyGraphStore);
    const operationalOverlayStore = new InMemoryOperationalOverlayStore(
      loadFullDemoCompanyOverlayFrames(),
    );

    application = buildApplication({
      evidenceStore,
      topologyGraphStore: countingTopologyGraphStore,
      operationalOverlayStore,
    });

    const response = await application.inject({
      method: "GET",
      url: impactUrl("atlast:entity:web", {
        direction: "downstream",
        depth: 3,
        changeType: "removal",
        ...fullPinQuery(),
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(countingTopologyGraphStore.callCounts).toStrictEqual({
      getSubject: 0,
      getAssertionRevision: 0,
      listEntities: 0,
      searchSubjects: 0,
      traverse: 1,
      getEvidenceChain: 0,
      getSnapshotSummary: 0,
    });
  });
});
