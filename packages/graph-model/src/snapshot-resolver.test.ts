/**
 * `SnapshotResolver` tests (S6-C2a, accepted ADR-0023 §§ 1, 3, 5): exact
 * `Clock`/`getCurrentWatermark` call counts per resolution path, empty-store
 * latest rejection, unsupported derivation version (including validation
 * before any store I/O), bounded multi-page Evidence loading, cache-key
 * completeness, single-build caching, single-flight concurrent resolution,
 * failure non-caching and cross-identity isolation, a
 * between-retained-sequences pinned horizon, and the absence of any mutable
 * collection in returned state.
 */
import { describe, expect, it } from "vitest";
import {
  evidenceCollectionSchema,
  type Evidence,
  type EvidenceStore,
  type PageRequest,
} from "@atlast/shared";
import type { Clock } from "./clock.ts";
import { InMemoryEvidenceStore } from "./evidence-store.ts";
import { InvalidReadCoordinateError } from "./repository-errors.ts";
import { SnapshotResolver } from "./snapshot-resolver.ts";

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

/**
 * Wraps a trusted `InMemoryEvidenceStore` and counts `getCurrentWatermark`
 * and `listEvidence` invocations, so tests can assert exact call counts
 * without reimplementing store semantics. Delegates every method
 * unchanged.
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

async function buildStoreWithEvidence(
  evidenceRecords: readonly Evidence[],
): Promise<CountingEvidenceStore> {
  const delegate = new InMemoryEvidenceStore(neverCallClock());
  if (evidenceRecords.length > 0) {
    await delegate.appendEvidence(evidenceRecords);
  }
  return new CountingEvidenceStore(delegate);
}

const TIMESTAMP = "2026-08-10T00:00:00.000Z";

describe("SnapshotResolver — latest resolution call counts", () => {
  it("invokes Clock exactly once and getCurrentWatermark exactly once", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const { clock, callCount } = countingClock(TIMESTAMP);
    const resolver = new SnapshotResolver(store, clock);

    const snapshot = await resolver.resolveLatestSnapshot();

    expect(callCount()).toBe(1);
    expect(store.watermarkCalls()).toBe(1);
    expect(snapshot.identity.asOf).toBe(TIMESTAMP);
    expect(snapshot.identity.horizon).toBe(1);
    expect(snapshot.identity.derivationVersion).toBe("m1-v1");
  });

  it("resolves derivationVersion to the active m1-v1 policy token", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const { clock } = countingClock(TIMESTAMP);
    const resolver = new SnapshotResolver(store, clock);

    const snapshot = await resolver.resolveLatestSnapshot();
    expect(snapshot.identity.derivationVersion).toBe("m1-v1");
  });

  it("validates the Clock reading, rejecting a malformed 'now'", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const malformedClock: Clock = () => "not-a-canonical-timestamp";
    const resolver = new SnapshotResolver(store, malformedClock);

    await expect(resolver.resolveLatestSnapshot()).rejects.toThrow(TypeError);
  });
});

describe("SnapshotResolver — pinned and cursor continuation Clock behavior", () => {
  it("resolvePinnedSnapshot invokes neither Clock nor getCurrentWatermark", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    const snapshot = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });

    expect(store.watermarkCalls()).toBe(0);
    expect(snapshot.identity.horizon).toBe(1);
  });

  it("resolveCursorBoundSnapshot invokes neither Clock nor getCurrentWatermark", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    const snapshot = await resolver.resolveCursorBoundSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });

    expect(store.watermarkCalls()).toBe(0);
    expect(snapshot.identity.horizon).toBe(1);
  });
});

describe("SnapshotResolver — empty-store latest rejection", () => {
  it("rejects with EMPTY_EVIDENCE_STORE before ever invoking Clock", async () => {
    const store = await buildStoreWithEvidence([]);
    const { clock, callCount } = countingClock(TIMESTAMP);
    const resolver = new SnapshotResolver(store, clock);

    let caught: unknown;
    try {
      await resolver.resolveLatestSnapshot();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).reason).toBe(
      "EMPTY_EVIDENCE_STORE",
    );
    expect(callCount()).toBe(0);
  });
});

describe("SnapshotResolver — unsupported derivation version", () => {
  it("rejects a pinned request naming a derivationVersion other than m1-v1, invoking no store or Clock methods", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    let caught: unknown;
    try {
      await resolver.resolvePinnedSnapshot({
        asOf: TIMESTAMP,
        horizon: 1,
        derivationVersion: "m1-v2",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).reason).toBe(
      "UNSUPPORTED_DERIVATION_VERSION",
    );
    expect(store.watermarkCalls()).toBe(0);
    expect(store.listEvidenceCalls()).toBe(0);
  });

  it("rejects resolveCursorBoundSnapshot naming a derivationVersion other than m1-v1, invoking no store or Clock methods", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    await expect(
      resolver.resolveCursorBoundSnapshot({
        asOf: TIMESTAMP,
        horizon: 1,
        derivationVersion: "m1-v2",
      }),
    ).rejects.toBeInstanceOf(InvalidReadCoordinateError);
    expect(store.watermarkCalls()).toBe(0);
    expect(store.listEvidenceCalls()).toBe(0);
  });

  it("rejects UNSUPPORTED_DERIVATION_VERSION even when the same identity's horizon is also otherwise invalid, before any EvidenceStore or Clock call (regression)", async () => {
    // An empty store: horizon 1 would additionally be semantically invalid
    // (no retained Evidence at all), but derivation-version validation must
    // still win — and win first, with zero I/O — because it is checked
    // before any store call is made for this identity.
    const store = await buildStoreWithEvidence([]);
    const { clock, callCount } = countingClock(TIMESTAMP);
    const resolver = new SnapshotResolver(store, clock);

    let caught: unknown;
    try {
      await resolver.resolvePinnedSnapshot({
        asOf: TIMESTAMP,
        horizon: 999,
        derivationVersion: "m1-v2",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).reason).toBe(
      "UNSUPPORTED_DERIVATION_VERSION",
    );
    expect(store.watermarkCalls()).toBe(0);
    expect(store.listEvidenceCalls()).toBe(0);
    expect(callCount()).toBe(0);
  });

  it("does not cache an unsupported-derivation-version rejection", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const identity = {
      asOf: TIMESTAMP,
      horizon: 1,
      derivationVersion: "m1-v2",
    } as const;

    await expect(resolver.resolvePinnedSnapshot(identity)).rejects.toThrow();
    await expect(resolver.resolvePinnedSnapshot(identity)).rejects.toThrow();
    // Both attempts made zero EvidenceStore calls — the rejection was never
    // an in-flight or settled cache entry to begin with.
    expect(store.watermarkCalls()).toBe(0);
    expect(store.listEvidenceCalls()).toBe(0);
  });

  it("preserves latest-mode behavior, which always resolves to the active m1-v1 policy", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const { clock } = countingClock(TIMESTAMP);
    const resolver = new SnapshotResolver(store, clock);

    const snapshot = await resolver.resolveLatestSnapshot();
    expect(snapshot.identity.derivationVersion).toBe("m1-v1");
  });
});

describe("SnapshotResolver — bounded multi-page Evidence loading", () => {
  it("loads Evidence across multiple listEvidence pages and includes every record in the built snapshot", async () => {
    // Build enough Entity Evidence records that the default/maximum page
    // size forces multiple listEvidence pages, proving the resolver walks
    // every page rather than reading only the first.
    const recordCount = 150;
    const evidenceRecords: Evidence[] = [];
    for (let index = 1; index <= recordCount; index += 1) {
      evidenceRecords.push(
        buildEntityEvidence(
          index,
          TIMESTAMP,
          "deployment-inventory",
          `service-${String(index).padStart(4, "0")}`,
          "service",
        ),
      );
    }
    evidenceCollectionSchema.parse(evidenceRecords);

    const store = await buildStoreWithEvidence(evidenceRecords);
    const resolver = new SnapshotResolver(store, neverCallClock());

    const snapshot = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: recordCount,
      derivationVersion: "m1-v1",
    });

    expect(snapshot.subjectCount).toBe(recordCount);
    expect(store.listEvidenceCalls()).toBeGreaterThan(1);
  });
});

describe("SnapshotResolver — cache key includes all three identity coordinates", () => {
  it("treats two identities differing only in asOf as distinct cache entries", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    const first = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });
    const second = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-02T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });
    expect(first).not.toBe(second);
    // Both are still built from the identical visible-assertion set, so
    // both report the same subjectCount, even though the checksum itself
    // differs (asOf participates in the ADR-0023 § 4 checksum payload).
    expect(first.subjectCount).toBe(second.subjectCount);
    expect(first.checksum).not.toBe(second.checksum);
  });

  it("treats two identities differing only in horizon as distinct cache entries", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
      buildEntityEvidence(
        2,
        "2026-08-11T00:00:00.000Z",
        "deployment-inventory",
        "payments",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    const atHorizon1 = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });
    const atHorizon2 = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 2,
      derivationVersion: "m1-v1",
    });
    expect(atHorizon1.subjectCount).toBe(1);
    expect(atHorizon2.subjectCount).toBe(2);
  });

  it("treats two identities differing only in derivationVersion as distinct cache entries (unsupported version still rejects independently)", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    const m1v1Snapshot = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });
    expect(m1v1Snapshot.identity.derivationVersion).toBe("m1-v1");

    await expect(
      resolver.resolvePinnedSnapshot({
        asOf: "2026-09-01T00:00:00.000Z",
        horizon: 1,
        derivationVersion: "m1-v2",
      }),
    ).rejects.toBeInstanceOf(InvalidReadCoordinateError);

    // The m1-v1 entry remains cached and unaffected by the m1-v2 rejection.
    const cachedAgain = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });
    expect(cachedAgain).toBe(m1v1Snapshot);
  });
});

describe("SnapshotResolver — identical identity builds once", () => {
  it("returns the same Snapshot reference on repeated resolution of one identity, loading Evidence only once", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const identity = {
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;

    const first = await resolver.resolvePinnedSnapshot(identity);
    const listEvidenceCallsAfterFirst = store.listEvidenceCalls();
    const second = await resolver.resolvePinnedSnapshot({ ...identity });

    expect(second).toBe(first);
    expect(store.listEvidenceCalls()).toBe(listEvidenceCallsAfterFirst);
  });
});

describe("SnapshotResolver — single-flight concurrent resolution (concurrent cache race regression)", () => {
  it("Promise.all over simultaneous identical resolutions performs one Evidence pagination/build and returns the same Snapshot reference", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const identity = {
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;

    // Both calls are issued before either is awaited, so they race for the
    // same not-yet-cached identity.
    const firstCall = resolver.resolvePinnedSnapshot(identity);
    const secondCall = resolver.resolvePinnedSnapshot({ ...identity });
    const [first, second] = await Promise.all([firstCall, secondCall]);

    expect(first).toBe(second);
    // A single-page store resolved once, not twice — proof that the second
    // concurrent caller shared the first caller's in-flight build rather
    // than starting its own.
    expect(store.listEvidenceCalls()).toBe(1);
  });

  it("three-way concurrent resolution of the same identity also shares exactly one build", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const identity = {
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;

    const results = await Promise.all([
      resolver.resolvePinnedSnapshot(identity),
      resolver.resolvePinnedSnapshot({ ...identity }),
      resolver.resolvePinnedSnapshot({ ...identity }),
    ]);

    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
    expect(store.listEvidenceCalls()).toBe(1);
  });

  it("concurrent failed resolutions of the same identity are single-flight — one build attempt, both callers see the same rejection", async () => {
    // A relationship whose endpoints never resolve to a visible entity
    // assertion — a referential-integrity failure at this exact identity.
    const relationshipEvidence: Evidence = {
      schemaVersion: "atlast-domain-v1",
      identifier: "atlast:evidence:demo/trace-index/0001",
      observedAt: TIMESTAMP,
      recordedAt: TIMESTAMP,
      recordedSequence: 1,
      sourceScopedIdentity: {
        source: "trace-index",
        sourceNativeId: "checkout-payment-call",
      },
      observation: {
        observationKind: "relationship",
        relationshipType: "calls",
        sourceEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "checkout",
        },
        targetEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "payments",
        },
      },
      detail: null,
    };
    const store = await buildStoreWithEvidence([relationshipEvidence]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const identity = {
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;

    const firstCall = resolver.resolvePinnedSnapshot(identity);
    const secondCall = resolver.resolvePinnedSnapshot({ ...identity });
    const results = await Promise.allSettled([firstCall, secondCall]);

    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("rejected");
    // Exactly one build attempt was made for the concurrent pair.
    expect(store.listEvidenceCalls()).toBe(1);
  });

  it("a failed single-flight entry is removed and a later retry rebuilds successfully once the underlying data is fixed", async () => {
    const relationshipEvidence: Evidence = {
      schemaVersion: "atlast-domain-v1",
      identifier: "atlast:evidence:demo/trace-index/0001",
      observedAt: TIMESTAMP,
      recordedAt: TIMESTAMP,
      recordedSequence: 1,
      sourceScopedIdentity: {
        source: "trace-index",
        sourceNativeId: "checkout-payment-call",
      },
      observation: {
        observationKind: "relationship",
        relationshipType: "calls",
        sourceEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "checkout",
        },
        targetEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "payments",
        },
      },
      detail: null,
    };
    const store = await buildStoreWithEvidence([relationshipEvidence]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const failingIdentity = {
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;

    const firstCall = resolver.resolvePinnedSnapshot(failingIdentity);
    const secondCall = resolver.resolvePinnedSnapshot({ ...failingIdentity });
    await Promise.allSettled([firstCall, secondCall]);
    await expect(firstCall).rejects.toThrow();
    await expect(secondCall).rejects.toThrow();

    // Fix the data: append the missing entity, forming a valid identity at
    // the new horizon.
    await store.appendEvidence([
      buildEntityEvidence(
        2,
        "2026-08-11T00:00:00.000Z",
        "trace-index",
        "checkout",
        "service",
      ),
      buildEntityEvidence(
        3,
        "2026-08-12T00:00:00.000Z",
        "trace-index",
        "payments",
        "service",
      ),
    ]);
    const fixedIdentity = { ...failingIdentity, horizon: 3 };
    const snapshot = await resolver.resolvePinnedSnapshot(fixedIdentity);
    expect(snapshot.subjects.map((view) => view.subject.identifier)).toEqual([
      "atlast:entity:checkout",
      "atlast:entity:payments",
      "atlast:relationship:checkout-payment-call",
    ]);
  });

  it("concurrent resolution of two different identities remains independent — one failing, one succeeding, neither affects the other", async () => {
    // recordedSequence 1: an unrelated, self-sufficient entity — visible
    // and referentially sound on its own. recordedSequence 2: a
    // relationship whose endpoints never appear as entities anywhere in
    // this store — a dangling reference. A horizon-1 identity therefore
    // succeeds (only the entity is in scope); a horizon-2 identity at the
    // same asOf fails (the dangling relationship enters scope).
    const validEntity = buildEntityEvidence(
      1,
      TIMESTAMP,
      "deployment-inventory",
      "standalone-service",
      "service",
    );
    const relationshipEvidence: Evidence = {
      schemaVersion: "atlast-domain-v1",
      identifier: "atlast:evidence:demo/trace-index/0002",
      observedAt: "2026-08-11T00:00:00.000Z",
      recordedAt: "2026-08-11T00:00:00.000Z",
      recordedSequence: 2,
      sourceScopedIdentity: {
        source: "trace-index",
        sourceNativeId: "checkout-payment-call",
      },
      observation: {
        observationKind: "relationship",
        relationshipType: "calls",
        sourceEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "checkout",
        },
        targetEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "payments",
        },
      },
      detail: null,
    };
    const store = await buildStoreWithEvidence([
      validEntity,
      relationshipEvidence,
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    const succeedingIdentity = {
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;
    const failingIdentity = {
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 2,
      derivationVersion: "m1-v1",
    } as const;

    const [succeedingResult, failingResult] = await Promise.allSettled([
      resolver.resolvePinnedSnapshot(succeedingIdentity),
      resolver.resolvePinnedSnapshot(failingIdentity),
    ]);

    expect(succeedingResult.status).toBe("fulfilled");
    expect(failingResult.status).toBe("rejected");
    if (succeedingResult.status === "fulfilled") {
      expect(
        succeedingResult.value.subjects.map((view) => view.subject.identifier),
      ).toEqual(["atlast:entity:standalone"]);
    }

    // Retrying the failing identity still fails independently — its own
    // failure was never cached, and the other identity's success did not
    // paper over it.
    await expect(
      resolver.resolvePinnedSnapshot(failingIdentity),
    ).rejects.toThrow();
    // The successful identity's cached snapshot is still served without a
    // rebuild.
    const cachedAgain =
      await resolver.resolvePinnedSnapshot(succeedingIdentity);
    if (succeedingResult.status === "fulfilled") {
      expect(cachedAgain).toBe(succeedingResult.value);
    }
  });
});

describe("SnapshotResolver — failed snapshots are not cached", () => {
  it("does not cache a referential-integrity failure — retrying the same identity re-attempts the build", async () => {
    const relationshipOnly = buildEntityEvidence(
      1,
      TIMESTAMP,
      "deployment-inventory",
      "checkout",
      "service",
    );
    // Construct a relationship claim whose endpoint never resolves, by
    // hand-building relationship Evidence with a source Evidence store that
    // never records the target entity.
    const relationshipEvidence: Evidence = {
      schemaVersion: "atlast-domain-v1",
      identifier: "atlast:evidence:demo/trace-index/0002",
      observedAt: "2026-08-11T00:00:00.000Z",
      recordedAt: "2026-08-11T00:00:00.000Z",
      recordedSequence: 2,
      sourceScopedIdentity: {
        source: "trace-index",
        sourceNativeId: "checkout-payment-call",
      },
      observation: {
        observationKind: "relationship",
        relationshipType: "calls",
        sourceEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "checkout",
        },
        targetEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "payments",
        },
      },
      detail: null,
    };
    const store = await buildStoreWithEvidence([
      relationshipOnly,
      relationshipEvidence,
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const identity = {
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 2,
      derivationVersion: "m1-v1",
    } as const;

    const firstAttemptListEvidenceCalls = store.listEvidenceCalls();
    await expect(resolver.resolvePinnedSnapshot(identity)).rejects.toThrow();
    const callsAfterFirstFailure = store.listEvidenceCalls();
    expect(callsAfterFirstFailure).toBeGreaterThan(
      firstAttemptListEvidenceCalls,
    );

    // A second attempt at the identical identity still fails — the failure
    // itself is never cached; `assertReferentialIntegrity` is re-evaluated
    // fresh on every call, exactly as before ADR-0038-A (this is the actual
    // contractual property this test protects: no stale success, no
    // papered-over failure). What *is* now different, deliberately (ADR-0038
    // Complexity Boundary (B)): reconciliation at this same horizon
    // succeeded on the first attempt and is a pure function of
    // `(evidenceRecords, horizon, policy)` alone, independent of the
    // referential-integrity outcome — so `SnapshotResolver` correctly reuses
    // that cached `ReconciliationResult` instead of re-fetching Evidence and
    // re-reconciling from scratch merely to re-derive the identical
    // historical revisions a second time.
    await expect(resolver.resolvePinnedSnapshot(identity)).rejects.toThrow();
    expect(store.listEvidenceCalls()).toBe(callsAfterFirstFailure);
  });

  it("still re-fetches and re-reconciles at a genuinely new horizon after a failure at a different horizon", async () => {
    const relationshipOnly = buildEntityEvidence(
      1,
      TIMESTAMP,
      "deployment-inventory",
      "checkout",
      "service",
    );
    const relationshipEvidence: Evidence = {
      schemaVersion: "atlast-domain-v1",
      identifier: "atlast:evidence:demo/trace-index/0002",
      observedAt: "2026-08-11T00:00:00.000Z",
      recordedAt: "2026-08-11T00:00:00.000Z",
      recordedSequence: 2,
      sourceScopedIdentity: {
        source: "trace-index",
        sourceNativeId: "checkout-payment-call",
      },
      observation: {
        observationKind: "relationship",
        relationshipType: "calls",
        sourceEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "checkout",
        },
        targetEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "payments",
        },
      },
      detail: null,
    };
    const paymentsEntity = buildEntityEvidence(
      3,
      TIMESTAMP,
      "deployment-inventory",
      "payments",
      "service",
    );
    const store = await buildStoreWithEvidence([
      relationshipOnly,
      relationshipEvidence,
      paymentsEntity,
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    // horizon 2: "payments" has not yet been observed — referential
    // integrity fails.
    await expect(
      resolver.resolvePinnedSnapshot({
        asOf: "2026-09-01T00:00:00.000Z",
        horizon: 2,
        derivationVersion: "m1-v1",
      }),
    ).rejects.toThrow();
    const callsAfterHorizonTwoFailure = store.listEvidenceCalls();

    // horizon 3: "payments" now exists — a genuinely different horizon,
    // never before reconciled, must still be freshly fetched and
    // reconciled, not served from the horizon-2 cache entry.
    const succeeded = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 3,
      derivationVersion: "m1-v1",
    });
    expect(store.listEvidenceCalls()).toBeGreaterThan(
      callsAfterHorizonTwoFailure,
    );
    expect(succeeded.subjects.map((view) => view.subject.identifier)).toEqual([
      "atlast:entity:checkout",
      "atlast:entity:payments",
      "atlast:relationship:checkout-payment-call",
    ]);
  });
});

describe("SnapshotResolver — failure isolation between identities", () => {
  it("a failure at one identity does not affect a different identity's own successful resolution", async () => {
    const validEntity = buildEntityEvidence(
      1,
      TIMESTAMP,
      "deployment-inventory",
      "checkout",
      "service",
    );
    const store = await buildStoreWithEvidence([validEntity]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    await expect(
      resolver.resolvePinnedSnapshot({
        asOf: TIMESTAMP,
        horizon: 1,
        derivationVersion: "m1-v2",
      }),
    ).rejects.toBeInstanceOf(InvalidReadCoordinateError);

    const snapshot = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });
    expect(snapshot.subjectCount).toBe(1);
  });
});

describe("SnapshotResolver — pinned horizon between retained sequences", () => {
  it("resolves a pinned horizon lying strictly between retained sequences without invoking Clock or getCurrentWatermark, including only Evidence at or below it", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        5,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
      buildEntityEvidence(
        10,
        "2026-08-15T00:00:00.000Z",
        "deployment-inventory",
        "payments",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());

    const snapshot = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 7,
      derivationVersion: "m1-v1",
    });

    expect(store.watermarkCalls()).toBe(0);
    expect(snapshot.subjects.map((view) => view.subject.identifier)).toEqual([
      "atlast:entity:checkout",
    ]);
  });
});

describe("SnapshotResolver — appended Evidence above a pinned horizon does not alter its cached snapshot", () => {
  it("caches the pinned snapshot before the append and returns the identical cached result afterward", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const identity = {
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;

    const beforeAppend = await resolver.resolvePinnedSnapshot(identity);

    await store.appendEvidence([
      buildEntityEvidence(
        2,
        "2026-08-11T00:00:00.000Z",
        "deployment-inventory",
        "payments",
        "service",
      ),
    ]);

    const afterAppend = await resolver.resolvePinnedSnapshot(identity);
    expect(afterAppend).toBe(beforeAppend);
    expect(afterAppend.subjectCount).toBe(1);
  });
});

describe("SnapshotResolver — no mutable collection leaks from returned state", () => {
  it("the returned snapshot and its nested structures contain no Set, Map, or other mutable collection reachable and settable by a caller", async () => {
    function assertNoSetOrMapReachable(
      value: unknown,
      seen: Set<unknown>,
    ): void {
      if (value === null || typeof value !== "object") {
        return;
      }
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
      expect(value).not.toBeInstanceOf(Set);
      expect(value).not.toBeInstanceOf(Map);
      if (Array.isArray(value)) {
        for (const element of value) {
          assertNoSetOrMapReachable(element, seen);
        }
        return;
      }
      for (const propertyValue of Object.values(value)) {
        assertNoSetOrMapReachable(propertyValue, seen);
      }
    }

    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const snapshot = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });
    assertNoSetOrMapReachable(snapshot, new Set());
  });

  it("every reachable object in the returned snapshot is deeply frozen", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(store, neverCallClock());
    const snapshot = await resolver.resolvePinnedSnapshot({
      asOf: "2026-09-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    });

    function assertFrozen(value: unknown, seen: Set<unknown>): void {
      if (value === null || typeof value !== "object") {
        return;
      }
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
      expect(Object.isFrozen(value)).toBe(true);
      if (Array.isArray(value)) {
        for (const element of value) {
          assertFrozen(element, seen);
        }
        return;
      }
      for (const propertyValue of Object.values(value)) {
        assertFrozen(propertyValue, seen);
      }
    }
    assertFrozen(snapshot, new Set());
  });
});

/**
 * ADR-0038-A: eliminate unnecessary complete-history reconstruction from
 * ordinary current-state reads by caching the pure `ReconciliationResult`
 * by `(horizon, derivationVersion)` — never by `asOf`, and never using
 * wall-clock time as an invalidator. These tests prove: (A) a repeated
 * `"latest"` read at an unchanged horizon does not re-fetch or re-reconcile;
 * (B) newly appended Evidence — which advances the horizon — is reflected
 * on the very next `"latest"` read, never served stale; and (D) the visible
 * assertion/subject content a cache hit returns is identical to what a
 * fresh, uncached resolution of the same horizon would produce.
 */
function sequencedClock(readings: readonly string[]): Clock {
  let nextIndex = 0;
  return () => {
    const reading = readings[nextIndex];
    if (reading === undefined) {
      throw new Error(
        `sequencedClock exhausted: ${String(nextIndex)} calls made, only ${String(readings.length)} readings supplied`,
      );
    }
    nextIndex += 1;
    return reading;
  };
}

describe("SnapshotResolver — ADR-0038-A reconciliation-result caching", () => {
  it("does not re-fetch or re-reconcile on a second latest read at an unchanged horizon", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(
      store,
      sequencedClock(["2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.500Z"]),
    );

    const first = await resolver.resolveLatestSnapshot();
    const listEvidenceCallsAfterFirst = store.listEvidenceCalls();
    expect(listEvidenceCallsAfterFirst).toBeGreaterThan(0);

    const second = await resolver.resolveLatestSnapshot();

    // No new Evidence was appended between the two reads, so the horizon is
    // identical — the second read must not have re-fetched Evidence.
    expect(store.listEvidenceCalls()).toBe(listEvidenceCallsAfterFirst);
    // The two reads used different `asOf` values (distinct Snapshot
    // identities and checksums), but the underlying visible assertion/
    // subject content — reused from the cached `ReconciliationResult` — is
    // identical, proving the cache hit did not change the answer.
    expect(second.identity.asOf).not.toBe(first.identity.asOf);
    expect(second.subjects).toEqual(first.subjects);
    expect(second.subjectCount).toBe(first.subjectCount);
  });

  it("reflects newly appended Evidence on the very next latest read, never serving stale cached state", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
    ]);
    const resolver = new SnapshotResolver(
      store,
      sequencedClock(["2026-09-01T00:00:00.000Z", "2026-09-01T00:00:01.000Z"]),
    );

    const beforeAppend = await resolver.resolveLatestSnapshot();
    expect(
      beforeAppend.subjects.map((view) => view.subject.identifier),
    ).toEqual(["atlast:entity:checkout"]);

    await store.appendEvidence([
      buildEntityEvidence(
        2,
        "2026-09-01T00:00:00.500Z",
        "deployment-inventory",
        "payments",
        "service",
      ),
    ]);

    const afterAppend = await resolver.resolveLatestSnapshot();
    expect(afterAppend.subjects.map((view) => view.subject.identifier)).toEqual(
      ["atlast:entity:checkout", "atlast:entity:payments"],
    );
    expect(afterAppend.identity.horizon).toBeGreaterThan(
      beforeAppend.identity.horizon,
    );
  });

  it("a cache hit produces subjects/assertions identical to a fresh, uncached resolution of the same horizon", async () => {
    const store = await buildStoreWithEvidence([
      buildEntityEvidence(
        1,
        TIMESTAMP,
        "deployment-inventory",
        "checkout",
        "service",
      ),
      buildEntityEvidence(2, TIMESTAMP, "trace-index", "checkout", "service"),
    ]);

    const cachedPathResolver = new SnapshotResolver(
      store,
      sequencedClock(["2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.500Z"]),
    );
    await cachedPathResolver.resolveLatestSnapshot();
    const cacheHitSnapshot = await cachedPathResolver.resolveLatestSnapshot();

    // A second, independent resolver against the same store has never
    // reconciled this horizon — its own resolution is necessarily
    // uncached, a fresh, from-scratch computation.
    const freshResolver = new SnapshotResolver(
      store,
      sequencedClock(["2026-09-01T00:00:00.500Z"]),
    );
    const freshSnapshot = await freshResolver.resolveLatestSnapshot();

    expect(cacheHitSnapshot.subjects).toEqual(freshSnapshot.subjects);
    expect(cacheHitSnapshot.subjectCount).toBe(freshSnapshot.subjectCount);
    expect(cacheHitSnapshot.checksum).toBe(freshSnapshot.checksum);
  });
});
