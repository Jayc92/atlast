/**
 * In-process contract tests for the S7 composition root (ADR-0024 § 12):
 * `GET /health` against the fully-wired application, and the
 * `initializeApplication` async-initialization invariants themselves — no
 * request can be served before ingestion completes, an ingestion failure
 * propagates as a rejection with no application ever produced, and
 * independent calls with different deterministic seeds produce fully
 * isolated stores, each visible only through its own application's routes.
 */
import {
  CURRENT_SCHEMA_VERSION,
  entityPageSchema,
  type Evidence,
} from "@atlast/shared";
import { InMemoryEvidenceStore } from "@atlast/graph-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeApplication } from "./app.ts";
import { loadFullDemoCompanyOverlayFrames } from "./test-support/demo-company-fixture.ts";
import { parseJsonBody } from "./test-support/parse-response.ts";

const FIXED_TEST_CLOCK = () => "2026-08-11T00:00:00.000Z";

describe("GET /health", () => {
  it("returns 200 with the deterministic health payload from a fully initialized application", async () => {
    const application = await initializeApplication(
      FIXED_TEST_CLOCK,
      [],
      loadFullDemoCompanyOverlayFrames(),
    );
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

/** A deferred promise the test controls externally — resolved or rejected on demand, from outside `initializeApplication`. */
function createDeferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function buildSingleEntitySeedEvidence(
  evidenceOrdinal: string,
  entityNativeId: string,
): Evidence {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: `atlast:evidence:test/initialization-isolation/${evidenceOrdinal}`,
    observedAt: "2026-08-11T00:00:00.000Z",
    recordedAt: "2026-08-11T00:00:00.000Z",
    recordedSequence: 1,
    sourceScopedIdentity: {
      source: "test-source",
      sourceNativeId: entityNativeId,
    },
    observation: { observationKind: "entity", entityType: "service" },
    detail: {},
  };
}

describe("initializeApplication", () => {
  // Every test in this block spies on the real InMemoryEvidenceStore's
  // prototype method; restoring after each is load-bearing so no other
  // test in this file or process sees the mocked implementation.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not resolve, and yields no application, until appendEvidence resolves", async () => {
    const ingestionGate = createDeferred<undefined>();
    vi.spyOn(
      InMemoryEvidenceStore.prototype,
      "appendEvidence",
    ).mockImplementation(() => ingestionGate.promise);

    let observedApplication: Awaited<
      ReturnType<typeof initializeApplication>
    > | null = null;
    const initializationPromise = initializeApplication(
      FIXED_TEST_CLOCK,
      [],
      loadFullDemoCompanyOverlayFrames(),
    ).then((application) => {
      observedApplication = application;
      return application;
    });

    // Let every pending microtask and a real macrotask tick run — if
    // initializeApplication could resolve before appendEvidence does, it
    // would have done so well within this window.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(observedApplication).toBeNull();

    ingestionGate.resolve(undefined);
    const application = await initializationPromise;
    try {
      expect(observedApplication).toBe(application);
      const response = await application.inject({
        method: "GET",
        url: "/health",
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await application.close();
    }
  });

  it("rejects, yielding no application, when appendEvidence rejects", async () => {
    const ingestionFailure = new Error("simulated seed-ingestion failure");
    vi.spyOn(
      InMemoryEvidenceStore.prototype,
      "appendEvidence",
    ).mockRejectedValue(ingestionFailure);

    let observedApplication: unknown = "not-yet-settled";
    await expect(
      initializeApplication(
        FIXED_TEST_CLOCK,
        [],
        loadFullDemoCompanyOverlayFrames(),
      ).then((application) => {
        observedApplication = application;
        return application;
      }),
    ).rejects.toThrow("simulated seed-ingestion failure");

    // The rejection must propagate before any assignment to
    // observedApplication ever runs — no application was ever produced.
    expect(observedApplication).toBe("not-yet-settled");
  });

  it("produces fully isolated stores across two calls with different deterministic seeds, each visible only through its own application", async () => {
    const seedA = buildSingleEntitySeedEvidence("0001", "entity-a");
    const seedB = buildSingleEntitySeedEvidence("0002", "entity-b");

    const applicationA = await initializeApplication(
      FIXED_TEST_CLOCK,
      [seedA],
      loadFullDemoCompanyOverlayFrames(),
    );
    const applicationB = await initializeApplication(
      FIXED_TEST_CLOCK,
      [seedB],
      loadFullDemoCompanyOverlayFrames(),
    );
    try {
      const responseA = await applicationA.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      const responseB = await applicationB.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      expect(responseA.statusCode).toBe(200);
      expect(responseB.statusCode).toBe(200);

      const identifiersA = parseJsonBody(responseA, entityPageSchema).items.map(
        (item) => item.subject.identifier,
      );
      const identifiersB = parseJsonBody(responseB, entityPageSchema).items.map(
        (item) => item.subject.identifier,
      );

      // Deterministic seed ingestion is visible through a real route...
      expect(identifiersA).toContain("atlast:entity:entity-a");
      expect(identifiersB).toContain("atlast:entity:entity-b");
      // ...and each application's store is fully isolated from the other's.
      expect(identifiersA).not.toContain("atlast:entity:entity-b");
      expect(identifiersB).not.toContain("atlast:entity:entity-a");
    } finally {
      await applicationA.close();
      await applicationB.close();
    }
  });
});
