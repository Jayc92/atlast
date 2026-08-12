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
  snapshotDetailResultSchema,
} from "@atlast/shared";
import { afterEach, describe, expect, it } from "vitest";
import { initializeApplication } from "../app.ts";
import {
  FIXED_TEST_CLOCK,
  FULL_CATALOG_SNAPSHOT_IDENTITY,
  UNSUPPORTED_DERIVATION_VERSION_IDENTITY,
  loadDemoCompanySeedEvidenceForScenarios,
  loadFullDemoCompanySeedEvidence,
} from "../test-support/demo-company-fixture.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";

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
