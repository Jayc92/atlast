/**
 * `InMemoryTopologyGraphStore` tests (S6-C2b, accepted ADR-0023 §§ 2, 4, 6,
 * 9): every frozen interface method, pinned/latest/cursor-bound resolution,
 * gap/duplicate-free pagination, cursor binding mismatch and malformed
 * cursor handling, conflict-honest entity filtering, identifier-only
 * search, traversal direction/depth/confidence/cycles/truncation,
 * Evidence-chain ordering, unknown and known-but-not-visible identifiers,
 * freshness boundaries, output isolation, snapshot-summary stability, and
 * single-build concurrent resolution.
 */
import { describe, expect, it } from "vitest";
import {
  entityPageSchema,
  evidenceChainResultSchema,
  subjectDetailResultSchema,
  subjectPageSchema,
  traversalResultSchema,
  type Evidence,
  type EvidenceStore,
  type PageRequest,
} from "@atlast/shared";
import type { Clock } from "./clock.ts";
import { InMemoryEvidenceStore } from "./evidence-store.ts";
import {
  InvalidReadCoordinateError,
  UnknownIdentifierError,
} from "./repository-errors.ts";
import { decodeGraphCursor, encodeGraphCursor } from "./cursor-payload.ts";
import { InMemoryTopologyGraphStore } from "./topology-graph-store.ts";

function neverCallClock(): Clock {
  return () => {
    throw new Error("Clock must never be invoked for this resolution path");
  };
}

function countingClock(reading: string): {
  clock: Clock;
  callCount: () => number;
} {
  let calls = 0;
  return {
    clock: () => {
      calls += 1;
      return reading;
    },
    callCount: () => calls,
  };
}

function buildEntityEvidence(
  recordedSequence: number,
  observedAt: string,
  source: string,
  sourceNativeId: string,
  entityType: string,
): Evidence {
  return {
    schemaVersion: "atlast-domain-v1",
    identifier: `atlast:evidence:demo/${source}/${String(recordedSequence).padStart(4, "0")}`,
    observedAt,
    recordedAt: observedAt,
    recordedSequence,
    sourceScopedIdentity: { source, sourceNativeId },
    observation: { observationKind: "entity", entityType },
    detail: null,
  };
}

function buildRelationshipEvidence(
  recordedSequence: number,
  observedAt: string,
  source: string,
  sourceNativeId: string,
  relationshipType: string,
  sourceEntityNativeId: string,
  targetEntityNativeId: string,
): Evidence {
  return {
    schemaVersion: "atlast-domain-v1",
    identifier: `atlast:evidence:demo/${source}/${String(recordedSequence).padStart(4, "0")}`,
    observedAt,
    recordedAt: observedAt,
    recordedSequence,
    sourceScopedIdentity: { source, sourceNativeId },
    observation: {
      observationKind: "relationship",
      relationshipType,
      sourceEntityIdentity: { source, sourceNativeId: sourceEntityNativeId },
      targetEntityIdentity: { source, sourceNativeId: targetEntityNativeId },
    },
    detail: null,
  };
}

async function buildStore(
  evidenceRecords: readonly Evidence[],
  clock: Clock = () => "2026-06-01T00:00:00.000Z",
): Promise<{
  evidenceStore: InMemoryEvidenceStore;
  topologyGraphStore: InMemoryTopologyGraphStore;
}> {
  const evidenceStore = new InMemoryEvidenceStore(neverCallClock());
  if (evidenceRecords.length > 0) {
    await evidenceStore.appendEvidence(evidenceRecords);
  }
  const topologyGraphStore = new InMemoryTopologyGraphStore(
    evidenceStore,
    clock,
  );
  return { evidenceStore, topologyGraphStore };
}

/**
 * Wraps a trusted `InMemoryEvidenceStore` and counts `getCurrentWatermark`
 * and `listEvidence` invocations, so a test can assert that a rejected
 * cursor-bound request performed zero store I/O (Finding 2) without
 * reimplementing store semantics. Delegates every method unchanged.
 */
class CountingEvidenceStore implements EvidenceStore {
  private readonly delegate: InMemoryEvidenceStore;
  private watermarkCallCount = 0;
  private listEvidenceCallCount = 0;

  constructor(delegate: InMemoryEvidenceStore) {
    this.delegate = delegate;
  }

  async appendEvidence(evidenceRecords: readonly Evidence[]): Promise<void> {
    return this.delegate.appendEvidence(evidenceRecords);
  }

  async getEvidenceByIdentifier(evidenceIdentifier: string): Promise<Evidence> {
    return this.delegate.getEvidenceByIdentifier(evidenceIdentifier);
  }

  async getCurrentWatermark(): Promise<number> {
    this.watermarkCallCount += 1;
    return this.delegate.getCurrentWatermark();
  }

  async listEvidence(horizon: number, pageRequest: PageRequest) {
    this.listEvidenceCallCount += 1;
    return this.delegate.listEvidence(horizon, pageRequest);
  }

  watermarkCalls(): number {
    return this.watermarkCallCount;
  }

  listEvidenceCalls(): number {
    return this.listEvidenceCallCount;
  }
}

async function buildCountingStore(
  evidenceRecords: readonly Evidence[],
  clock: Clock = () => "2026-06-01T00:00:00.000Z",
): Promise<{
  evidenceStore: CountingEvidenceStore;
  topologyGraphStore: InMemoryTopologyGraphStore;
}> {
  const delegate = new InMemoryEvidenceStore(neverCallClock());
  if (evidenceRecords.length > 0) {
    await delegate.appendEvidence(evidenceRecords);
  }
  const evidenceStore = new CountingEvidenceStore(delegate);
  const topologyGraphStore = new InMemoryTopologyGraphStore(
    evidenceStore,
    clock,
  );
  return { evidenceStore, topologyGraphStore };
}

const LATEST_READ = { mode: "latest" } as const;
const T0 = "2026-01-01T00:00:00.000Z";

/** A demo-company-shaped topology: two entities plus a relationship between them. */
const CHECKOUT_EVIDENCE = buildEntityEvidence(
  1,
  T0,
  "deployment-inventory",
  "checkout",
  "service",
);
const PAYMENTS_EVIDENCE = buildEntityEvidence(
  2,
  "2026-01-02T00:00:00.000Z",
  "deployment-inventory",
  "payments",
  "service",
);
const CHECKOUT_CALLS_PAYMENTS_EVIDENCE = buildRelationshipEvidence(
  3,
  "2026-01-03T00:00:00.000Z",
  "trace-index",
  "checkout-payment-call",
  "calls",
  "checkout",
  "payments",
);
const BASIC_TOPOLOGY: readonly Evidence[] = [
  CHECKOUT_EVIDENCE,
  PAYMENTS_EVIDENCE,
  CHECKOUT_CALLS_PAYMENTS_EVIDENCE,
];

describe("InMemoryTopologyGraphStore — getSubject", () => {
  it("returns a subject with every visible assertion revision and complete resolved metadata", async () => {
    const { topologyGraphStore } = await buildStore(
      BASIC_TOPOLOGY,
      countingClock("2026-06-01T00:00:00.000Z").clock,
    );
    const result = await topologyGraphStore.getSubject(
      "atlast:entity:checkout",
      LATEST_READ,
    );
    expect(subjectDetailResultSchema.safeParse(result).success).toBe(true);
    expect(result.data.subject.identifier).toBe("atlast:entity:checkout");
    expect(result.data.assertions).toHaveLength(1);
    expect(result.meta.resolvedIdentity.derivationVersion).toBe("m1-v1");
  });

  it("resolves a pinned identity without invoking Clock", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const result = await topologyGraphStore.getSubject(
      "atlast:entity:checkout",
      {
        mode: "pinned",
        identity: {
          asOf: "2026-06-01T00:00:00.000Z",
          horizon: 3,
          derivationVersion: "m1-v1",
        },
      },
    );
    expect(result.data.subject.identifier).toBe("atlast:entity:checkout");
  });

  it("rejects an unknown subject with UnknownIdentifierError carrying resolvedIdentity", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    let caught: unknown;
    try {
      await topologyGraphStore.getSubject(
        "atlast:entity:does-not-exist",
        LATEST_READ,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnknownIdentifierError);
    const error = caught as UnknownIdentifierError;
    expect(error.identifierKind).toBe("subject");
    expect(error.resolvedIdentity).toBeDefined();
  });

  it("rejects a subject that is known at a later asOf but not yet visible at the requested one, as UnknownIdentifierError", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    await expect(
      topologyGraphStore.getSubject("atlast:entity:payments", {
        mode: "pinned",
        identity: { asOf: T0, horizon: 3, derivationVersion: "m1-v1" },
      }),
    ).rejects.toBeInstanceOf(UnknownIdentifierError);
  });

  it("does not mutate caller input and returns a frozen result", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const readMode = {
      mode: "pinned" as const,
      identity: {
        asOf: "2026-06-01T00:00:00.000Z",
        horizon: 3,
        derivationVersion: "m1-v1" as const,
      },
    };
    const before = structuredClone(readMode);
    const result = await topologyGraphStore.getSubject(
      "atlast:entity:checkout",
      readMode,
    );
    expect(readMode).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("InMemoryTopologyGraphStore — getAssertionRevision", () => {
  it("returns the revision with its freshness and complete resolved metadata", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const subjectResult = await topologyGraphStore.getSubject(
      "atlast:entity:checkout",
      {
        mode: "pinned",
        identity: {
          asOf: "2026-06-01T00:00:00.000Z",
          horizon: 3,
          derivationVersion: "m1-v1",
        },
      },
    );
    const assertionIdentifier =
      subjectResult.data.assertions[0]?.revision.identifier;
    expect(assertionIdentifier).toBeDefined();

    const result = await topologyGraphStore.getAssertionRevision(
      assertionIdentifier as string,
      {
        mode: "pinned",
        identity: {
          asOf: "2026-06-01T00:00:00.000Z",
          horizon: 3,
          derivationVersion: "m1-v1",
        },
      },
    );
    expect(result.data.revision.identifier).toBe(assertionIdentifier);
    expect(["current", "stale", "historical"]).toContain(result.data.freshness);
  });

  it("rejects a globally unknown assertion identifier", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    await expect(
      topologyGraphStore.getAssertionRevision(
        `atlast:assertion:${"0".repeat(64)}`,
        LATEST_READ,
      ),
    ).rejects.toBeInstanceOf(UnknownIdentifierError);
  });

  it("rejects a known revision that is not visible at the resolved identity, with resolvedIdentity populated", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const laterResult = await topologyGraphStore.getSubject(
      "atlast:entity:payments",
      {
        mode: "pinned",
        identity: {
          asOf: "2026-06-01T00:00:00.000Z",
          horizon: 3,
          derivationVersion: "m1-v1",
        },
      },
    );
    const paymentsAssertionIdentifier =
      laterResult.data.assertions[0]?.revision.identifier;
    expect(paymentsAssertionIdentifier).toBeDefined();

    let caught: unknown;
    try {
      await topologyGraphStore.getAssertionRevision(
        paymentsAssertionIdentifier as string,
        {
          mode: "pinned",
          identity: { asOf: T0, horizon: 3, derivationVersion: "m1-v1" },
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnknownIdentifierError);
    const error = caught as UnknownIdentifierError;
    expect(error.identifierKind).toBe("assertion");
    expect(error.resolvedIdentity).toBeDefined();
  });
});

describe("InMemoryTopologyGraphStore — listEntities", () => {
  it("returns entity subjects only, with complete envelope validation", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const page = await topologyGraphStore.listEntities({}, LATEST_READ, {
      limit: 25,
    });
    expect(entityPageSchema.safeParse(page).success).toBe(true);
    expect(page.items.map((item) => item.subject.identifier)).toEqual([
      "atlast:entity:checkout",
      "atlast:entity:payments",
    ]);
  });

  it("resolves latest, invoking Clock and getCurrentWatermark exactly once", async () => {
    const { clock, callCount } = countingClock("2026-06-01T00:00:00.000Z");
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY, clock);
    await topologyGraphStore.listEntities({}, LATEST_READ, { limit: 25 });
    expect(callCount()).toBe(1);
  });

  it("paginates without gaps or duplicates across multiple pages", async () => {
    const manyEntities: Evidence[] = [];
    for (let index = 1; index <= 5; index += 1) {
      manyEntities.push(
        buildEntityEvidence(
          index,
          T0,
          "deployment-inventory",
          `entity-${String(index).padStart(2, "0")}`,
          "service",
        ),
      );
    }
    const { topologyGraphStore } = await buildStore(manyEntities);
    const identifiers: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await topologyGraphStore.listEntities({}, LATEST_READ, {
        limit: 2,
        ...(cursor === undefined ? {} : { cursor }),
      });
      identifiers.push(...page.items.map((item) => item.subject.identifier));
      cursor = page.page.nextCursor;
    } while (cursor !== undefined);

    expect(identifiers).toHaveLength(5);
    expect(new Set(identifiers).size).toBe(5);
    expect(identifiers).toEqual([...identifiers].sort());
  });

  it("filters by entityType with match-by-any-visible-claim semantics under a real conflict", async () => {
    // Two sources disagree on checkout's type: "service" and "queue".
    const conflictingType = buildEntityEvidence(
      2,
      "2026-01-02T00:00:00.000Z",
      "trace-index",
      "checkout",
      "queue",
    );
    const { topologyGraphStore } = await buildStore([
      CHECKOUT_EVIDENCE,
      conflictingType,
    ]);
    const identity = {
      asOf: "2026-06-01T00:00:00.000Z",
      horizon: 2,
      derivationVersion: "m1-v1" as const,
    };

    const servicePage = await topologyGraphStore.listEntities(
      { entityType: "service" },
      { mode: "pinned", identity },
      { limit: 25 },
    );
    const queuePage = await topologyGraphStore.listEntities(
      { entityType: "queue" },
      { mode: "pinned", identity },
      { limit: 25 },
    );
    expect(servicePage.items.map((item) => item.subject.identifier)).toEqual([
      "atlast:entity:checkout",
    ]);
    expect(queuePage.items.map((item) => item.subject.identifier)).toEqual([
      "atlast:entity:checkout",
    ]);
    // The conflict is visible in-band on both filtered results — every
    // conflicting revision rides along, never a winner selected.
    expect(servicePage.items[0]?.assertions.length).toBeGreaterThanOrEqual(2);
    const hasConflictMarker = servicePage.items[0]?.assertions.some(
      (assertion) => assertion.revision.conflictState.status === "conflicted",
    );
    expect(hasConflictMarker).toBe(true);
  });

  it("returns an empty page for an entityType no visible revision claims", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const page = await topologyGraphStore.listEntities(
      { entityType: "unclaimed-type" },
      LATEST_READ,
      { limit: 25 },
    );
    expect(page.items).toEqual([]);
    expect(page.page.hasMore).toBe(false);
  });

  it("resolves a latest-mode continuation to the cursor-bound identity without invoking Clock again", async () => {
    const manyEntities: Evidence[] = [];
    for (let index = 1; index <= 3; index += 1) {
      manyEntities.push(
        buildEntityEvidence(
          index,
          T0,
          "deployment-inventory",
          `entity-${String(index).padStart(2, "0")}`,
          "service",
        ),
      );
    }
    const { clock, callCount } = countingClock("2026-06-01T00:00:00.000Z");
    const { topologyGraphStore, evidenceStore } = await buildStore(
      manyEntities,
      clock,
    );
    const firstPage = await topologyGraphStore.listEntities({}, LATEST_READ, {
      limit: 1,
    });
    expect(callCount()).toBe(1);
    expect(firstPage.page.nextCursor).toBeDefined();

    // Append Evidence above the cursor-bound horizon between pages.
    await evidenceStore.appendEvidence([
      buildEntityEvidence(
        4,
        "2026-01-04T00:00:00.000Z",
        "deployment-inventory",
        "entity-04",
        "service",
      ),
    ]);

    const secondPage = await topologyGraphStore.listEntities({}, LATEST_READ, {
      limit: 1,
      cursor: firstPage.page.nextCursor,
    });
    expect(callCount()).toBe(1);
    expect(secondPage.meta.resolvedIdentity).toEqual(
      firstPage.meta.resolvedIdentity,
    );
    // The newly appended entity is not visible in this walk.
    const allIdentifiers = [...firstPage.items, ...secondPage.items].map(
      (item) => item.subject.identifier,
    );
    expect(allIdentifiers).not.toContain("atlast:entity:entity-04");
  });

  it("rejects a cursor replayed with a mismatched page size", async () => {
    const manyEntities: Evidence[] = [];
    for (let index = 1; index <= 3; index += 1) {
      manyEntities.push(
        buildEntityEvidence(
          index,
          T0,
          "deployment-inventory",
          `entity-${String(index).padStart(2, "0")}`,
          "service",
        ),
      );
    }
    const { topologyGraphStore } = await buildStore(manyEntities);
    const firstPage = await topologyGraphStore.listEntities({}, LATEST_READ, {
      limit: 1,
    });
    let caught: unknown;
    try {
      await topologyGraphStore.listEntities({}, LATEST_READ, {
        limit: 2,
        cursor: firstPage.page.nextCursor,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("CURSOR_BINDING_MISMATCH");
    expect(error.mismatchFields).toContain("pageSize");
  });

  it("rejects a cursor replayed with a mismatched filter", async () => {
    const manyEntities: Evidence[] = [];
    for (let index = 1; index <= 3; index += 1) {
      manyEntities.push(
        buildEntityEvidence(
          index,
          T0,
          "deployment-inventory",
          `entity-${String(index).padStart(2, "0")}`,
          "service",
        ),
      );
    }
    const { topologyGraphStore } = await buildStore(manyEntities);
    const firstPage = await topologyGraphStore.listEntities({}, LATEST_READ, {
      limit: 1,
    });
    let caught: unknown;
    try {
      await topologyGraphStore.listEntities(
        { entityType: "different-type" },
        LATEST_READ,
        { limit: 1, cursor: firstPage.page.nextCursor },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).mismatchFields).toContain(
      "filter",
    );
  });

  it("rejects a valid, decodable cursor from a different operation as CURSOR_BINDING_MISMATCH, not INVALID_CURSOR (Finding 1)", async () => {
    // A second corroborating Evidence record for "checkout" so
    // getEvidenceChain has two supporting records and yields a multi-page
    // cursor with limit: 1.
    const corroboratingEvidence = buildEntityEvidence(
      4,
      "2026-01-04T00:00:00.000Z",
      "trace-index",
      "checkout",
      "service",
    );
    const { topologyGraphStore } = await buildStore([
      ...BASIC_TOPOLOGY,
      corroboratingEvidence,
    ]);
    const chainPage = await topologyGraphStore.getEvidenceChain(
      "atlast:entity:checkout",
      LATEST_READ,
      { limit: 1 },
    );
    expect(chainPage.page.nextCursor).toBeDefined();

    let caught: unknown;
    try {
      await topologyGraphStore.listEntities({}, LATEST_READ, {
        limit: 1,
        cursor: chainPage.page.nextCursor,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.code).toBe("INVALID_READ_COORDINATE");
    expect(error.reason).toBe("CURSOR_BINDING_MISMATCH");
    expect(error.cursorKind).toBe("graph");
    expect(error.cursorBoundIdentity).toBeDefined();
    // A latest-mode request never resolves a second identity to conflict
    // with, so requestedIdentity is absent — even though this cursor was
    // issued for a different operation.
    expect(error.requestedIdentity).toBeUndefined();
    expect("requestedIdentity" in error).toBe(false);
    // Every mismatched binding field is named: the operation itself
    // differs (getEvidenceChain vs. listEntities), the coordinates differ
    // (a subject identifier vs. an inventory filter), and the ordering
    // token differs (Evidence total order vs. identifier-ascending).
    expect(error.mismatchFields).toEqual(
      expect.arrayContaining(["operation", "filter", "ordering"]),
    );
    expect(error.mismatchFields).toHaveLength(3);
  });

  it("rejects a valid cross-operation cursor replayed under a pinned request, reporting the requested identity", async () => {
    const corroboratingEvidence = buildEntityEvidence(
      4,
      "2026-01-04T00:00:00.000Z",
      "trace-index",
      "checkout",
      "service",
    );
    const { topologyGraphStore } = await buildStore([
      ...BASIC_TOPOLOGY,
      corroboratingEvidence,
    ]);
    const chainPage = await topologyGraphStore.getEvidenceChain(
      "atlast:entity:checkout",
      LATEST_READ,
      { limit: 1 },
    );
    expect(chainPage.page.nextCursor).toBeDefined();
    const pinnedIdentity = chainPage.meta.resolvedIdentity;

    let caught: unknown;
    try {
      await topologyGraphStore.listEntities(
        {},
        { mode: "pinned", identity: pinnedIdentity },
        { limit: 1, cursor: chainPage.page.nextCursor },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("CURSOR_BINDING_MISMATCH");
    // A pinned request's own declared identity happens to match the
    // cursor's bound identity here, but every other binding field still
    // mismatches, so requestedIdentity is populated and mismatchFields
    // never includes "identity".
    expect(error.requestedIdentity).toEqual(pinnedIdentity);
    expect(error.mismatchFields).not.toContain("identity");
    expect(error.mismatchFields).toEqual(
      expect.arrayContaining(["operation", "filter", "ordering"]),
    );
  });

  it("rejects a malformed cursor with INVALID_CURSOR", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    let caught: unknown;
    try {
      await topologyGraphStore.listEntities({}, LATEST_READ, {
        limit: 1,
        cursor: "not-a-real-cursor",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).reason).toBe(
      "INVALID_CURSOR",
    );
  });

  it("rejects a cursor replayed with a pinned identity that both differs from the cursor and is outside the Evidence horizon, as CURSOR_BINDING_MISMATCH with zero store resolution work (Finding 2)", async () => {
    const manyEntities: Evidence[] = [];
    for (let index = 1; index <= 3; index += 1) {
      manyEntities.push(
        buildEntityEvidence(
          index,
          T0,
          "deployment-inventory",
          `entity-${String(index).padStart(2, "0")}`,
          "service",
        ),
      );
    }
    const { topologyGraphStore } = await buildStore(manyEntities);
    const firstPage = await topologyGraphStore.listEntities({}, LATEST_READ, {
      limit: 1,
    });
    expect(firstPage.page.nextCursor).toBeDefined();

    // A fresh counting store + store-backed graph store sharing the exact
    // same Evidence, so the cursor decoded above remains structurally
    // valid, but the pinned identity below both differs from the cursor's
    // bound identity AND names a horizon (999) far outside this store's
    // retained Evidence — independently invalid on its own terms.
    const {
      evidenceStore: countingStore,
      topologyGraphStore: countingGraphStore,
    } = await buildCountingStore(manyEntities);

    let caught: unknown;
    try {
      await countingGraphStore.listEntities(
        {},
        {
          mode: "pinned",
          identity: {
            asOf: "2030-01-01T00:00:00.000Z",
            horizon: 999,
            derivationVersion: "m1-v1",
          },
        },
        { limit: 1, cursor: firstPage.page.nextCursor },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    // The rejection is the cursor-binding conflict, never the horizon
    // problem — binding is checked, and rejected, before any snapshot
    // resolution (and therefore before horizon validation) is attempted.
    expect(error.reason).toBe("CURSOR_BINDING_MISMATCH");
    expect(error.reason).not.toBe("HORIZON_AFTER_CURRENT_WATERMARK");
    expect(error.requestedIdentity).toEqual({
      asOf: "2030-01-01T00:00:00.000Z",
      horizon: 999,
      derivationVersion: "m1-v1",
    });
    expect(error.cursorBoundIdentity).toEqual(firstPage.meta.resolvedIdentity);
    expect(error.mismatchFields).toEqual(expect.arrayContaining(["identity"]));
    // Zero snapshot/store resolution work: neither getCurrentWatermark nor
    // listEvidence was ever called for this rejected request.
    expect(countingStore.watermarkCalls()).toBe(0);
    expect(countingStore.listEvidenceCalls()).toBe(0);
  });

  it("returns deeply frozen, isolated results whose mutation does not affect a subsequent read", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const firstPage = await topologyGraphStore.listEntities({}, LATEST_READ, {
      limit: 25,
    });
    expect(Object.isFrozen(firstPage)).toBe(true);
    expect(Object.isFrozen(firstPage.items)).toBe(true);
    // The result is frozen, so any mutation attempt throws rather than
    // silently succeeding — itself proof that a caller cannot reach store
    // state or a subsequent read through this returned structure.
    expect(() => {
      (firstPage.items as unknown[]).push("injected");
    }).toThrow(TypeError);

    const secondPage = await topologyGraphStore.listEntities({}, LATEST_READ, {
      limit: 25,
    });
    expect(secondPage.items).toHaveLength(2);
  });

  it("repeated identical pinned reads are byte-identical (deterministic)", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const identity = {
      asOf: "2026-06-01T00:00:00.000Z",
      horizon: 3,
      derivationVersion: "m1-v1" as const,
    };
    const first = await topologyGraphStore.listEntities(
      {},
      { mode: "pinned", identity },
      { limit: 25 },
    );
    const second = await topologyGraphStore.listEntities(
      {},
      { mode: "pinned", identity },
      { limit: 25 },
    );
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("InMemoryTopologyGraphStore — searchSubjects", () => {
  it("matches complete canonical identifiers only", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const page = await topologyGraphStore.searchSubjects(
      "checkout",
      LATEST_READ,
      { limit: 25 },
    );
    expect(subjectPageSchema.safeParse(page).success).toBe(true);
    // "checkout" is a substring of both the entity identifier and the
    // relationship identifier (atlast:relationship:checkout-payment-call)
    // — matching is over the raw identifier string, with no claim-content
    // or type-based involvement, so both legitimately match.
    expect(page.items.map((item) => item.subject.identifier)).toEqual([
      "atlast:entity:checkout",
      "atlast:relationship:checkout-payment-call",
    ]);
  });

  it("finds subjects across both entity and relationship namespaces", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const page = await topologyGraphStore.searchSubjects(
      "atlast:relationship:",
      LATEST_READ,
      { limit: 25 },
    );
    expect(page.items.map((item) => item.subject.identifier)).toEqual([
      "atlast:relationship:checkout-payment-call",
    ]);
  });

  it("does not match claim content that is absent from the identifier", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    // "queue" never appears in any identifier in this fixture.
    const page = await topologyGraphStore.searchSubjects(
      "nonexistent-substring",
      LATEST_READ,
      { limit: 25 },
    );
    expect(page.items).toEqual([]);
  });

  it("paginates search results without gaps or duplicates", async () => {
    const manyEntities: Evidence[] = [];
    for (let index = 1; index <= 5; index += 1) {
      manyEntities.push(
        buildEntityEvidence(
          index,
          T0,
          "deployment-inventory",
          `matching-${String(index).padStart(2, "0")}`,
          "service",
        ),
      );
    }
    const { topologyGraphStore } = await buildStore(manyEntities);
    const identifiers: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await topologyGraphStore.searchSubjects(
        "matching",
        LATEST_READ,
        { limit: 2, ...(cursor === undefined ? {} : { cursor }) },
      );
      identifiers.push(...page.items.map((item) => item.subject.identifier));
      cursor = page.page.nextCursor;
    } while (cursor !== undefined);
    expect(identifiers).toHaveLength(5);
    expect(new Set(identifiers).size).toBe(5);
  });
});

describe("InMemoryTopologyGraphStore — traverse", () => {
  it("traverses downstream one hop, exposing both the Relationship subject and the reached Entity, excluding the origin", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const result = await topologyGraphStore.traverse(
      "atlast:entity:checkout",
      { direction: "downstream", depth: 1, minimumConfidence: 0 },
      LATEST_READ,
    );
    expect(traversalResultSchema.safeParse(result).success).toBe(true);
    expect(result.items.map((item) => item.subject.identifier)).toEqual([
      "atlast:entity:payments",
      "atlast:relationship:checkout-payment-call",
    ]);
    expect(result.items.map((item) => item.subject.subjectKind)).toEqual([
      "entity",
      "relationship",
    ]);
    expect(result.traversal.truncated).toBe(false);
    expect(result.traversal.subjectCount).toBe(result.items.length);
  });

  it("traverses upstream one hop, exposing both the reached Entity and the same Relationship subject", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const result = await topologyGraphStore.traverse(
      "atlast:entity:payments",
      { direction: "upstream", depth: 1, minimumConfidence: 0 },
      LATEST_READ,
    );
    expect(result.items.map((item) => item.subject.identifier)).toEqual([
      "atlast:entity:checkout",
      "atlast:relationship:checkout-payment-call",
    ]);
  });

  it("keeps relationship assertions bound to their containing Relationship subject in a traversal result", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const result = await topologyGraphStore.traverse(
      "atlast:entity:checkout",
      { direction: "downstream", depth: 1, minimumConfidence: 0 },
      LATEST_READ,
    );
    const relationshipItem = result.items.find(
      (item) => item.subject.subjectKind === "relationship",
    );
    expect(relationshipItem).toBeDefined();
    for (const assertion of relationshipItem?.assertions ?? []) {
      expect(assertion.revision.subjectIdentifier).toBe(
        relationshipItem?.subject.identifier,
      );
      expect(assertion.revision.claim.claimKind).toBe("relationship");
    }
  });

  it("respects a confidence floor, excluding low-confidence edges (and their Relationship subjects) entirely", async () => {
    // Single-source relationship claims have confidence 0.5 under m1-v1
    // (base=0.5, span=0.4, distinctSourceCount=1). A floor above that
    // excludes the edge — and its Relationship subject — entirely.
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const result = await topologyGraphStore.traverse(
      "atlast:entity:checkout",
      { direction: "downstream", depth: 1, minimumConfidence: 0.9 },
      LATEST_READ,
    );
    expect(result.items).toEqual([]);
  });

  it("does not loop forever on a cycle and deduplicates both Entity and Relationship subjects", async () => {
    const backEdge = buildRelationshipEvidence(
      4,
      "2026-01-04T00:00:00.000Z",
      "trace-index",
      "payments-checkout-call",
      "calls",
      "payments",
      "checkout",
    );
    const { topologyGraphStore } = await buildStore([
      ...BASIC_TOPOLOGY,
      backEdge,
    ]);
    const result = await topologyGraphStore.traverse(
      "atlast:entity:checkout",
      { direction: "downstream", depth: 5, minimumConfidence: 0 },
      LATEST_READ,
    );
    const identifiers = result.items.map((item) => item.subject.identifier);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(identifiers.sort()).toEqual(
      [
        "atlast:entity:payments",
        "atlast:relationship:checkout-payment-call",
        "atlast:relationship:payments-checkout-call",
      ].sort(),
    );
  });

  it("truncates deterministically at the 500-subject budget with truncated: true", async () => {
    // A star topology: origin connects to 501 distinct downstream entities.
    const evidenceRecords: Evidence[] = [
      buildEntityEvidence(1, T0, "deployment-inventory", "hub", "service"),
    ];
    let sequence = 2;
    for (let index = 0; index < 501; index += 1) {
      const nativeId = `leaf-${String(index).padStart(4, "0")}`;
      evidenceRecords.push(
        buildEntityEvidence(
          sequence,
          T0,
          "deployment-inventory",
          nativeId,
          "service",
        ),
      );
      sequence += 1;
      evidenceRecords.push(
        buildRelationshipEvidence(
          sequence,
          T0,
          "trace-index",
          `hub-calls-${nativeId}`,
          "calls",
          "hub",
          nativeId,
        ),
      );
      sequence += 1;
    }
    const { topologyGraphStore } = await buildStore(evidenceRecords);
    const result = await topologyGraphStore.traverse(
      "atlast:entity:hub",
      { direction: "downstream", depth: 1, minimumConfidence: 0 },
      LATEST_READ,
    );
    expect(result.items.length).toBeLessThanOrEqual(500);
    expect(result.traversal.truncated).toBe(true);
    expect(result.traversal.subjectCount).toBe(result.items.length);
    // The budget is enforced against the complete returned collection —
    // Relationship and Entity subjects together, since each leaf entity in
    // this fixture is reached only alongside its own connecting
    // Relationship subject.
    const relationshipCount = result.items.filter(
      (item) => item.subject.subjectKind === "relationship",
    ).length;
    const entityCount = result.items.filter(
      (item) => item.subject.subjectKind === "entity",
    ).length;
    expect(relationshipCount).toBeGreaterThan(0);
    expect(entityCount).toBeGreaterThan(0);
    expect(relationshipCount + entityCount).toBe(result.items.length);
  });

  it("returns deterministic ordering across repeated calls", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const first = await topologyGraphStore.traverse(
      "atlast:entity:checkout",
      { direction: "downstream", depth: 1, minimumConfidence: 0 },
      LATEST_READ,
    );
    const second = await topologyGraphStore.traverse(
      "atlast:entity:checkout",
      { direction: "downstream", depth: 1, minimumConfidence: 0 },
      LATEST_READ,
    );
    expect(first.items.map((item) => item.subject.identifier)).toEqual(
      second.items.map((item) => item.subject.identifier),
    );
  });

  it("rejects an unknown origin identifier", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    await expect(
      topologyGraphStore.traverse(
        "atlast:entity:does-not-exist",
        { direction: "downstream", depth: 1, minimumConfidence: 0 },
        LATEST_READ,
      ),
    ).rejects.toBeInstanceOf(UnknownIdentifierError);
  });
});

describe("InMemoryTopologyGraphStore — getEvidenceChain", () => {
  it("returns every Evidence record supporting the subject's visible revisions, in Evidence total order", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const chain = await topologyGraphStore.getEvidenceChain(
      "atlast:entity:checkout",
      LATEST_READ,
      { limit: 25 },
    );
    expect(evidenceChainResultSchema.safeParse(chain).success).toBe(true);
    expect(chain.items.map((record) => record.identifier)).toEqual([
      CHECKOUT_EVIDENCE.identifier,
    ]);
  });

  it("deduplicates Evidence shared across multiple revisions and orders by observedAt then recordedSequence", async () => {
    const corroboratingEvidence = buildEntityEvidence(
      4,
      "2026-01-04T00:00:00.000Z",
      "trace-index",
      "payments",
      "service",
    );
    const { topologyGraphStore } = await buildStore([
      ...BASIC_TOPOLOGY,
      corroboratingEvidence,
    ]);
    const chain = await topologyGraphStore.getEvidenceChain(
      "atlast:entity:payments",
      LATEST_READ,
      { limit: 25 },
    );
    const identifiers = chain.items.map((record) => record.identifier);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    const observedAts = chain.items.map((record) => record.observedAt);
    expect(observedAts).toEqual([...observedAts].sort());
  });

  it("paginates the evidence chain without gaps or duplicates", async () => {
    const evidenceRecords: Evidence[] = [
      buildEntityEvidence(1, T0, "deployment-inventory", "checkout", "service"),
    ];
    for (let index = 2; index <= 6; index += 1) {
      evidenceRecords.push(
        buildEntityEvidence(
          index,
          `2026-01-0${String(index)}T00:00:00.000Z`,
          `source-${String(index)}`,
          "checkout",
          "service",
        ),
      );
    }
    const { topologyGraphStore } = await buildStore(evidenceRecords);
    const identifiers: string[] = [];
    let cursor: string | undefined;
    do {
      const chain = await topologyGraphStore.getEvidenceChain(
        "atlast:entity:checkout",
        LATEST_READ,
        { limit: 2, ...(cursor === undefined ? {} : { cursor }) },
      );
      identifiers.push(...chain.items.map((record) => record.identifier));
      cursor = chain.page.nextCursor;
    } while (cursor !== undefined);
    expect(identifiers).toHaveLength(6);
    expect(new Set(identifiers).size).toBe(6);
  });

  it("rejects an unknown subject", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    await expect(
      topologyGraphStore.getEvidenceChain(
        "atlast:entity:does-not-exist",
        LATEST_READ,
        { limit: 25 },
      ),
    ).rejects.toBeInstanceOf(UnknownIdentifierError);
  });

  it("issues cursors bound to the Evidence total-order token, not identifier-ascending (Finding 5)", async () => {
    const corroboratingEvidence = buildEntityEvidence(
      4,
      "2026-01-04T00:00:00.000Z",
      "trace-index",
      "checkout",
      "service",
    );
    const { topologyGraphStore } = await buildStore([
      ...BASIC_TOPOLOGY,
      corroboratingEvidence,
    ]);
    const chain = await topologyGraphStore.getEvidenceChain(
      "atlast:entity:checkout",
      LATEST_READ,
      { limit: 1 },
    );
    expect(chain.page.nextCursor).toBeDefined();
    const decoded = decodeGraphCursor(chain.page.nextCursor as string);
    expect(decoded.ordering).toBe("observed-at-then-recorded-sequence");
    expect(decoded.ordering).not.toBe("identifier-ascending");
  });

  it("rejects a structurally valid cursor whose bound position is the chain's own terminal Evidence identifier, as INVALID_CURSOR (Finding 4)", async () => {
    const corroboratingEvidence = buildEntityEvidence(
      4,
      "2026-01-04T00:00:00.000Z",
      "trace-index",
      "checkout",
      "service",
    );
    const { topologyGraphStore } = await buildStore([
      ...BASIC_TOPOLOGY,
      corroboratingEvidence,
    ]);
    const fullChain = await topologyGraphStore.getEvidenceChain(
      "atlast:entity:checkout",
      LATEST_READ,
      { limit: 25 },
    );
    const terminalIdentifier = fullChain.items.at(-1)?.identifier;
    expect(terminalIdentifier).toBeDefined();

    // Construct a structurally valid, correctly bound cursor whose
    // position is the chain's own final record — a position that
    // `getEvidenceChain` itself could never have issued, since
    // `paginateSorted` only binds a `nextPosition` when items remain
    // after it.
    const forgedCursor = encodeGraphCursor({
      cursorKind: "graph",
      identity: fullChain.meta.resolvedIdentity,
      operation: "getEvidenceChain",
      coordinates: "atlast:entity:checkout",
      ordering: "observed-at-then-recorded-sequence",
      pageSize: 25,
      position: terminalIdentifier as string,
    });

    let caught: unknown;
    try {
      await topologyGraphStore.getEvidenceChain(
        "atlast:entity:checkout",
        LATEST_READ,
        { limit: 25, cursor: forgedCursor },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.code).toBe("INVALID_READ_COORDINATE");
    expect(error.reason).toBe("INVALID_CURSOR");
    expect(error.cursorKind).toBe("graph");
    expect(error.mismatchFields).toBeUndefined();
    expect("mismatchFields" in error).toBe(false);
  });
});

describe("InMemoryTopologyGraphStore — getSnapshotSummary", () => {
  it("returns identical checksums and subjectCount across repeated calls at one identity", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const identity = {
      asOf: "2026-06-01T00:00:00.000Z",
      horizon: 3,
      derivationVersion: "m1-v1" as const,
    };
    const first = await topologyGraphStore.getSnapshotSummary(identity);
    const second = await topologyGraphStore.getSnapshotSummary(identity);
    expect(first.checksum).toBe(second.checksum);
    expect(first.subjectCount).toBe(second.subjectCount);
    expect(first.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(first.identity).toEqual(identity);
  });

  it("does not build the underlying snapshot twice for concurrent identical requests", async () => {
    const { topologyGraphStore, evidenceStore } =
      await buildStore(BASIC_TOPOLOGY);
    let listEvidenceCalls = 0;
    const originalListEvidence = evidenceStore.listEvidence.bind(evidenceStore);
    evidenceStore.listEvidence = async (horizon, pageRequest) => {
      listEvidenceCalls += 1;
      return originalListEvidence(horizon, pageRequest);
    };
    const identity = {
      asOf: "2026-06-01T00:00:00.000Z",
      horizon: 3,
      derivationVersion: "m1-v1" as const,
    };
    const [first, second] = await Promise.all([
      topologyGraphStore.getSnapshotSummary(identity),
      topologyGraphStore.getSnapshotSummary(identity),
    ]);
    expect(first.checksum).toBe(second.checksum);
    expect(listEvidenceCalls).toBe(1);
  });
});

describe("InMemoryTopologyGraphStore — freshness at injected-clock boundaries", () => {
  it("classifies exactly at the current/stale and stale/historical boundaries", async () => {
    const { topologyGraphStore } = await buildStore(BASIC_TOPOLOGY);
    const justBeforeStale = await topologyGraphStore.getSubject(
      "atlast:entity:checkout",
      {
        mode: "pinned",
        identity: {
          asOf: "2026-01-07T23:59:59.999Z",
          horizon: 3,
          derivationVersion: "m1-v1",
        },
      },
    );
    expect(justBeforeStale.data.assertions[0]?.freshness).toBe("current");

    const exactlyStale = await topologyGraphStore.getSubject(
      "atlast:entity:checkout",
      {
        mode: "pinned",
        identity: {
          asOf: "2026-01-08T00:00:00.000Z",
          horizon: 3,
          derivationVersion: "m1-v1",
        },
      },
    );
    expect(exactlyStale.data.assertions[0]?.freshness).toBe("stale");

    const exactlyHistorical = await topologyGraphStore.getSubject(
      "atlast:entity:checkout",
      {
        mode: "pinned",
        identity: {
          asOf: "2026-01-31T00:00:00.000Z",
          horizon: 3,
          derivationVersion: "m1-v1",
        },
      },
    );
    expect(exactlyHistorical.data.assertions[0]?.freshness).toBe("historical");
  });
});
