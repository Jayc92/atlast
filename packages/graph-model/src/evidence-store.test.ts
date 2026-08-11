/**
 * In-memory `EvidenceStore` tests (S6-B, accepted ADR-0023 §§ 1–2, 5, 7–9):
 * Clock injection without invocation, atomic schema-then-invariant append
 * validation, watermark behavior, identifier lookup, deterministic ordered
 * listing, horizon-pinned cursor continuation across an intervening append,
 * exact cursor binding-mismatch reporting, and caller/store mutation
 * isolation in both directions.
 */
import { describe, expect, it } from "vitest";
import { evidenceCollectionSchema, type Evidence } from "@atlast/shared";
import type { Clock } from "./clock.ts";
import { encodeEvidenceCursor } from "./cursor-payload.ts";
import { InMemoryEvidenceStore } from "./evidence-store.ts";
import {
  EvidenceAppendError,
  InvalidReadCoordinateError,
  UnknownIdentifierError,
} from "./repository-errors.ts";

/** A Clock that throws if ever invoked — proves Evidence operations never read wall-clock time. */
function neverCallClock(): Clock {
  return () => {
    throw new Error("Clock must never be invoked by EvidenceStore operations");
  };
}

/** A Clock that counts invocations, for tests that only need to prove zero calls. */
function countingClock(): { clock: Clock; callCount: () => number } {
  let calls = 0;
  return {
    clock: () => {
      calls += 1;
      return "2026-08-10T00:00:00.000Z";
    },
    callCount: () => calls,
  };
}

/**
 * `graph-model` has no direct dependency on `zod` (it consumes shared
 * schemas only through `@atlast/shared`), so tests recognize a `ZodError`
 * structurally — by its stable `name` — rather than importing the class.
 */
function isZodError(value: unknown): boolean {
  return value instanceof Error && value.name === "ZodError";
}

function buildEvidence(
  observedAt: string,
  recordedSequence: number,
  suffix: string,
): Evidence {
  return {
    schemaVersion: "atlast-domain-v1",
    identifier: `atlast:evidence:demo/${suffix}`,
    observedAt,
    recordedAt: "2026-03-01T00:00:00.000Z",
    recordedSequence,
    sourceScopedIdentity: {
      source: "deployment-inventory",
      sourceNativeId: `svc-${suffix}`,
    },
    observation: { observationKind: "entity", entityType: "service" },
    detail: { note: null },
  };
}

describe("InMemoryEvidenceStore — Clock injection", () => {
  it("never invokes the injected Clock across append, lookup, watermark, or listing", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
    ]);
    await store.getEvidenceByIdentifier("atlast:evidence:demo/a");
    await store.getCurrentWatermark();
    await store.listEvidence(2, { limit: 25 });
    // Reaching here without throwing proves the Clock was never called.
    expect(true).toBe(true);
  });

  it("does not invoke the Clock during a cursor continuation", async () => {
    const { clock, callCount } = countingClock();
    const store = new InMemoryEvidenceStore(clock);
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
      buildEvidence("2026-01-03T00:00:00.000Z", 3, "c"),
    ]);
    const firstPage = await store.listEvidence(3, { limit: 1 });
    expect(firstPage.page.nextCursor).toBeDefined();
    await store.listEvidence(3, {
      limit: 1,
      cursor: firstPage.page.nextCursor,
    });
    expect(callCount()).toBe(0);
  });
});

describe("InMemoryEvidenceStore — getCurrentWatermark", () => {
  it("returns 0 for an empty store", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    expect(await store.getCurrentWatermark()).toBe(0);
  });

  it("returns the greatest retained recordedSequence for a non-empty store", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-03T00:00:00.000Z", 3, "c"),
      buildEvidence("2026-01-02T00:00:00.000Z", 5, "b"),
    ]);
    expect(await store.getCurrentWatermark()).toBe(5);
  });

  it("advances the watermark across successive successful appends", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
    ]);
    expect(await store.getCurrentWatermark()).toBe(1);
    await store.appendEvidence([
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
    ]);
    expect(await store.getCurrentWatermark()).toBe(2);
  });
});

describe("InMemoryEvidenceStore — appendEvidence success", () => {
  it("accepts a valid batch and makes every record retrievable", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    const recordA = buildEvidence("2026-01-01T00:00:00.000Z", 1, "a");
    const recordB = buildEvidence("2026-01-02T00:00:00.000Z", 2, "b");
    await store.appendEvidence([recordA, recordB]);
    expect(await store.getEvidenceByIdentifier(recordA.identifier)).toEqual(
      recordA,
    );
    expect(await store.getEvidenceByIdentifier(recordB.identifier)).toEqual(
      recordB,
    );
  });

  it("accepts an empty batch as a no-op", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([]);
    expect(await store.getCurrentWatermark()).toBe(0);
  });
});

describe("InMemoryEvidenceStore — Zod failure atomicity", () => {
  it("surfaces a shared-schema validation failure unchanged as ZodError", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    const malformedRecord = {
      ...buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      recordedSequence: -1,
    };
    let caught: unknown;
    try {
      await store.appendEvidence([malformedRecord]);
    } catch (error) {
      caught = error;
    }
    expect(isZodError(caught)).toBe(true);
  });

  it("leaves the store completely unchanged after a ZodError rejection", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "seed"),
    ]);
    const malformedRecord = {
      ...buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
      identifier: "not-a-valid-identifier",
    };
    let caught: unknown;
    try {
      await store.appendEvidence([malformedRecord]);
    } catch (error) {
      caught = error;
    }
    expect(isZodError(caught)).toBe(true);
    expect(await store.getCurrentWatermark()).toBe(1);
    await expect(
      store.getEvidenceByIdentifier("atlast:evidence:demo/b"),
    ).rejects.toBeInstanceOf(UnknownIdentifierError);
  });

  it("rejects a batch with an intra-batch duplicate identifier via the shared schema (ZodError), never EvidenceAppendError", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    const recordA = buildEvidence("2026-01-01T00:00:00.000Z", 1, "dup");
    const recordB = { ...buildEvidence("2026-01-02T00:00:00.000Z", 2, "dup") };
    let caught: unknown;
    try {
      await store.appendEvidence([recordA, recordB]);
    } catch (error) {
      caught = error;
    }
    expect(isZodError(caught)).toBe(true);
    expect(caught).not.toBeInstanceOf(EvidenceAppendError);
  });
});

describe("InMemoryEvidenceStore — duplicate-identifier atomicity", () => {
  it("rejects re-appending an already-stored identifier with EvidenceAppendError", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    const original = buildEvidence("2026-01-01T00:00:00.000Z", 1, "a");
    await store.appendEvidence([original]);

    const duplicate = buildEvidence("2026-01-05T00:00:00.000Z", 2, "a");
    let caught: unknown;
    try {
      await store.appendEvidence([duplicate]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EvidenceAppendError);
    const error = caught as EvidenceAppendError;
    expect(error.code).toBe("EVIDENCE_APPEND");
    expect(error.reason).toBe("DUPLICATE_EVIDENCE_IDENTIFIER");
    expect(error.evidenceIdentifiers).toEqual([duplicate.identifier]);
    expect(error.recordedSequences).toEqual([2]);
    expect(error.currentWatermark).toBe(1);
  });

  it("populates only the exact offending identifiers/sequences, not the whole batch", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "existing"),
    ]);

    const goodRecord = buildEvidence("2026-01-02T00:00:00.000Z", 2, "fresh");
    const collidingRecord = buildEvidence(
      "2026-01-03T00:00:00.000Z",
      3,
      "existing",
    );
    let caught: unknown;
    try {
      await store.appendEvidence([goodRecord, collidingRecord]);
    } catch (error) {
      caught = error;
    }
    const error = caught as EvidenceAppendError;
    expect(error.evidenceIdentifiers).toEqual([collidingRecord.identifier]);
    expect(error.recordedSequences).toEqual([3]);
  });

  it("leaves the store completely unchanged after a duplicate-identifier rejection", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
    ]);

    await expect(
      store.appendEvidence([
        buildEvidence("2026-01-02T00:00:00.000Z", 5, "fresh"),
        buildEvidence("2026-01-03T00:00:00.000Z", 6, "a"),
      ]),
    ).rejects.toBeInstanceOf(EvidenceAppendError);

    expect(await store.getCurrentWatermark()).toBe(1);
    await expect(
      store.getEvidenceByIdentifier("atlast:evidence:demo/fresh"),
    ).rejects.toBeInstanceOf(UnknownIdentifierError);
  });
});

describe("InMemoryEvidenceStore — non-increasing-sequence atomicity", () => {
  it("rejects a batch whose sequence does not exceed the current watermark", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 5, "seed"),
    ]);

    const staleRecord = buildEvidence("2026-01-02T00:00:00.000Z", 5, "stale");
    let caught: unknown;
    try {
      await store.appendEvidence([staleRecord]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EvidenceAppendError);
    const error = caught as EvidenceAppendError;
    expect(error.reason).toBe("NON_INCREASING_RECORDED_SEQUENCE");
    expect(error.evidenceIdentifiers).toEqual([staleRecord.identifier]);
    expect(error.recordedSequences).toEqual([5]);
    expect(error.currentWatermark).toBe(5);
  });

  it("rejects a non-increasing sequence within a single batch (later record does not exceed an earlier one)", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    const first = buildEvidence("2026-01-01T00:00:00.000Z", 3, "first");
    const second = buildEvidence("2026-01-02T00:00:00.000Z", 2, "second");
    let caught: unknown;
    try {
      await store.appendEvidence([first, second]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EvidenceAppendError);
    const error = caught as EvidenceAppendError;
    expect(error.reason).toBe("NON_INCREASING_RECORDED_SEQUENCE");
    expect(error.evidenceIdentifiers).toEqual([second.identifier]);
    expect(error.recordedSequences).toEqual([2]);
  });

  it("names every offending record in a batch with multiple non-increasing sequences", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    const first = buildEvidence("2026-01-01T00:00:00.000Z", 5, "first");
    const secondOffender = buildEvidence(
      "2026-01-02T00:00:00.000Z",
      4,
      "second",
    );
    const thirdOffender = buildEvidence("2026-01-03T00:00:00.000Z", 3, "third");
    let caught: unknown;
    try {
      await store.appendEvidence([first, secondOffender, thirdOffender]);
    } catch (error) {
      caught = error;
    }
    const error = caught as EvidenceAppendError;
    expect(error.evidenceIdentifiers).toEqual([
      secondOffender.identifier,
      thirdOffender.identifier,
    ]);
    expect(error.recordedSequences).toEqual([4, 3]);
  });

  it("leaves the store completely unchanged after a non-increasing-sequence rejection", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 5, "seed"),
    ]);

    await expect(
      store.appendEvidence([
        buildEvidence("2026-01-02T00:00:00.000Z", 6, "fresh"),
        buildEvidence("2026-01-03T00:00:00.000Z", 4, "stale"),
      ]),
    ).rejects.toBeInstanceOf(EvidenceAppendError);

    expect(await store.getCurrentWatermark()).toBe(5);
    await expect(
      store.getEvidenceByIdentifier("atlast:evidence:demo/fresh"),
    ).rejects.toBeInstanceOf(UnknownIdentifierError);
  });
});

describe("InMemoryEvidenceStore — caller-input mutation isolation", () => {
  it("does not mutate or freeze the caller's Evidence array or its records after append", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    const callerRecord = buildEvidence("2026-01-01T00:00:00.000Z", 1, "a");
    const callerArray = [callerRecord];
    const snapshotBeforeAppend = structuredClone(callerArray);

    await store.appendEvidence(callerArray);

    expect(callerArray).toEqual(snapshotBeforeAppend);
    expect(Object.isFrozen(callerArray)).toBe(false);
    expect(Object.isFrozen(callerRecord)).toBe(false);
    // The caller can still mutate their own object without affecting the store.
    callerRecord.detail = { note: "mutated after append" };
    const storedRecord = await store.getEvidenceByIdentifier(
      callerRecord.identifier,
    );
    expect(storedRecord.detail).toEqual({ note: null });
  });
});

describe("InMemoryEvidenceStore — returned-value mutation isolation", () => {
  it("returns a frozen Evidence record from getEvidenceByIdentifier", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
    ]);
    const returned = await store.getEvidenceByIdentifier(
      "atlast:evidence:demo/a",
    );
    expect(Object.isFrozen(returned)).toBe(true);
    expect(() => {
      (returned as { recordedSequence: number }).recordedSequence = 999;
    }).toThrow(TypeError);
  });

  it("mutating a listEvidence result does not affect a subsequent read", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
    ]);
    const firstRead = await store.listEvidence(2, { limit: 25 });
    firstRead.items.push(
      buildEvidence("2026-01-03T00:00:00.000Z", 99, "injected"),
    );
    (firstRead.page as { hasMore: boolean }).hasMore = true;

    const secondRead = await store.listEvidence(2, { limit: 25 });
    expect(secondRead.items).toHaveLength(2);
    expect(secondRead.page.hasMore).toBe(false);
  });
});

describe("InMemoryEvidenceStore — getEvidenceByIdentifier unknown identifier", () => {
  it("throws UnknownIdentifierError with identifierKind 'evidence' and no resolvedIdentity", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    let caught: unknown;
    try {
      await store.getEvidenceByIdentifier(
        "atlast:evidence:demo/does-not-exist",
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnknownIdentifierError);
    const error = caught as UnknownIdentifierError;
    expect(error.code).toBe("UNKNOWN_IDENTIFIER");
    expect(error.identifierKind).toBe("evidence");
    expect(error.identifier).toBe("atlast:evidence:demo/does-not-exist");
    expect(error.resolvedIdentity).toBeUndefined();
    expect("resolvedIdentity" in error).toBe(false);
  });
});

describe("InMemoryEvidenceStore — deterministic list ordering", () => {
  it("returns Evidence sorted by observedAt regardless of ingestion (recordedSequence) order", async () => {
    // recordedSequence must strictly increase across appends (ADR-0023 § 8),
    // so ingestion order is fixed at 1, 2, 3 — but observedAt is scrambled
    // relative to that ingestion order, proving the list is genuinely sorted
    // by the ADR-0016 total order rather than merely returned in storage
    // (insertion) order.
    const store = new InMemoryEvidenceStore(neverCallClock());
    const ingestedFirst = buildEvidence("2026-01-03T00:00:00.000Z", 1, "late");
    const ingestedSecond = buildEvidence(
      "2026-01-01T00:00:00.000Z",
      2,
      "early",
    );
    const ingestedThird = buildEvidence(
      "2026-01-02T00:00:00.000Z",
      3,
      "middle",
    );
    await store.appendEvidence([ingestedFirst, ingestedSecond, ingestedThird]);

    const result = await store.listEvidence(3, { limit: 25 });
    expect(result.items.map((record) => record.identifier)).toEqual([
      ingestedSecond.identifier,
      ingestedThird.identifier,
      ingestedFirst.identifier,
    ]);
  });

  it("breaks equal-observedAt ties by recordedSequence ascending", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    const higherSeq = buildEvidence("2026-01-01T00:00:00.000Z", 5, "higher");
    const lowerSeq = buildEvidence("2026-01-01T00:00:00.000Z", 2, "lower");
    await store.appendEvidence([lowerSeq, higherSeq]);

    const result = await store.listEvidence(5, { limit: 25 });
    expect(result.items.map((record) => record.identifier)).toEqual([
      lowerSeq.identifier,
      higherSeq.identifier,
    ]);
  });
});

describe("InMemoryEvidenceStore — horizon selection", () => {
  it("excludes Evidence with recordedSequence above the requested horizon", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
      buildEvidence("2026-01-03T00:00:00.000Z", 3, "c"),
    ]);
    const result = await store.listEvidence(2, { limit: 25 });
    expect(result.items.map((record) => record.identifier)).toEqual([
      "atlast:evidence:demo/a",
      "atlast:evidence:demo/b",
    ]);
  });
});

describe("InMemoryEvidenceStore — pagination continuity after an intervening append", () => {
  it("a paginated walk observes the cursor-bound horizon end-to-end, unaffected by Evidence appended between pages", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
      buildEvidence("2026-01-03T00:00:00.000Z", 3, "c"),
    ]);

    const firstPage = await store.listEvidence(3, { limit: 2 });
    expect(firstPage.items.map((record) => record.identifier)).toEqual([
      "atlast:evidence:demo/a",
      "atlast:evidence:demo/b",
    ]);
    expect(firstPage.page.hasMore).toBe(true);
    expect(firstPage.page.nextCursor).toBeDefined();

    // Intervening append after the current watermark, before the continuation.
    await store.appendEvidence([
      buildEvidence("2026-01-04T00:00:00.000Z", 4, "d"),
    ]);

    const secondPage = await store.listEvidence(3, {
      limit: 2,
      cursor: firstPage.page.nextCursor,
    });
    // Still bound to horizon 3 — "d" (sequence 4) never appears.
    expect(secondPage.items.map((record) => record.identifier)).toEqual([
      "atlast:evidence:demo/c",
    ]);
    expect(secondPage.page.hasMore).toBe(false);
  });

  it("issues a usable nextCursor that continues correctly across three pages", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
      buildEvidence("2026-01-03T00:00:00.000Z", 3, "c"),
    ]);

    const firstPage = await store.listEvidence(3, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    const secondPage = await store.listEvidence(3, {
      limit: 1,
      cursor: firstPage.page.nextCursor,
    });
    expect(secondPage.items).toHaveLength(1);
    const thirdPage = await store.listEvidence(3, {
      limit: 1,
      cursor: secondPage.page.nextCursor,
    });
    expect(thirdPage.items).toHaveLength(1);
    expect(thirdPage.page.hasMore).toBe(false);

    const allIdentifiers = [firstPage, secondPage, thirdPage].flatMap((page) =>
      page.items.map((record) => record.identifier),
    );
    expect(allIdentifiers).toEqual([
      "atlast:evidence:demo/a",
      "atlast:evidence:demo/b",
      "atlast:evidence:demo/c",
    ]);
  });
});

describe("InMemoryEvidenceStore — malformed cursor rejection", () => {
  it("rejects a cursor that does not decode as an issued Evidence cursor with INVALID_CURSOR", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
    ]);
    let caught: unknown;
    try {
      await store.listEvidence(1, { limit: 25, cursor: "not-a-real-cursor" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("INVALID_CURSOR");
  });

  it("rejects a cursor whose position no longer resolves against the pinned horizon as INVALID_CURSOR", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
    ]);
    const forgedCursor = encodeEvidenceCursor({
      cursorKind: "evidence",
      horizon: 1,
      ordering: "observed-at-then-recorded-sequence",
      pageSize: 25,
      position: "atlast:evidence:demo/never-existed",
    });
    let caught: unknown;
    try {
      await store.listEvidence(1, { limit: 25, cursor: forgedCursor });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).reason).toBe(
      "INVALID_CURSOR",
    );
  });
});

describe("InMemoryEvidenceStore — exact cursor binding-mismatch reporting", () => {
  it("rejects a continuation whose horizon does not match the cursor-bound horizon", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
    ]);
    const firstPage = await store.listEvidence(2, { limit: 1 });
    let caught: unknown;
    try {
      await store.listEvidence(1, {
        limit: 1,
        cursor: firstPage.page.nextCursor,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("CURSOR_BINDING_MISMATCH");
    expect(error.cursorKind).toBe("evidence");
    expect(error.requestedHorizon).toBe(1);
    expect(error.cursorBoundHorizon).toBe(2);
    expect(error.mismatchFields).toEqual(["horizon"]);
  });

  it("rejects a continuation whose page size does not match the cursor-bound page size", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
    ]);
    const firstPage = await store.listEvidence(2, { limit: 1 });
    let caught: unknown;
    try {
      await store.listEvidence(2, {
        limit: 2,
        cursor: firstPage.page.nextCursor,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("CURSOR_BINDING_MISMATCH");
    expect(error.mismatchFields).toEqual(["pageSize"]);
  });

  it("rejects a continuation whose ordering does not match the fixed Evidence ordering token", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
    ]);
    const forgedCursor = encodeEvidenceCursor({
      cursorKind: "evidence",
      horizon: 2,
      ordering: "some-other-ordering",
      pageSize: 1,
      position: "atlast:evidence:demo/a",
    });
    let caught: unknown;
    try {
      await store.listEvidence(2, { limit: 1, cursor: forgedCursor });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("CURSOR_BINDING_MISMATCH");
    expect(error.mismatchFields).toEqual(["ordering"]);
  });

  it("reports every mismatched field together, not just the first found", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 1, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 2, "b"),
    ]);
    const forgedCursor = encodeEvidenceCursor({
      cursorKind: "evidence",
      horizon: 2,
      ordering: "some-other-ordering",
      pageSize: 1,
      position: "atlast:evidence:demo/a",
    });
    let caught: unknown;
    try {
      await store.listEvidence(1, { limit: 2, cursor: forgedCursor });
    } catch (error) {
      caught = error;
    }
    const error = caught as InvalidReadCoordinateError;
    expect(error.mismatchFields).toEqual(
      expect.arrayContaining(["horizon", "ordering", "pageSize"]),
    );
    expect(error.mismatchFields).toHaveLength(3);
  });

  it("never exposes evidenceCollectionSchema input mutation via evidenceCollectionSchema.parse", () => {
    // Sanity check that the shared schema itself does not mutate its input,
    // since appendEvidence relies on that guarantee before deep-copying.
    const records = [buildEvidence("2026-01-01T00:00:00.000Z", 1, "a")];
    const before = structuredClone(records);
    evidenceCollectionSchema.parse(records);
    expect(records).toEqual(before);
  });
});

describe("InMemoryEvidenceStore — semantic horizon validity (ADR-0023 § 5 regression)", () => {
  async function buildStoreWithFirstSequenceFive(): Promise<InMemoryEvidenceStore> {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 5, "first"),
      buildEvidence("2026-01-02T00:00:00.000Z", 8, "second"),
    ]);
    return store;
  }

  it("rejects a horizon below firstRecordedSequence with HORIZON_BEFORE_FIRST_EVIDENCE and the exact sequence bounds", async () => {
    const store = await buildStoreWithFirstSequenceFive();
    let caught: unknown;
    try {
      await store.listEvidence(4, { limit: 25 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.code).toBe("INVALID_READ_COORDINATE");
    expect(error.reason).toBe("HORIZON_BEFORE_FIRST_EVIDENCE");
    expect(error.firstRecordedSequence).toBe(5);
    expect(error.currentWatermark).toBe(8);
  });

  it("rejects a horizon above currentWatermark with HORIZON_AFTER_CURRENT_WATERMARK and the exact sequence bounds", async () => {
    const store = await buildStoreWithFirstSequenceFive();
    let caught: unknown;
    try {
      await store.listEvidence(9, { limit: 25 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("HORIZON_AFTER_CURRENT_WATERMARK");
    expect(error.firstRecordedSequence).toBe(5);
    expect(error.currentWatermark).toBe(8);
  });

  it("accepts a valid horizon strictly between retained sequences and selects all Evidence with recordedSequence <= horizon", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 5, "first"),
      buildEvidence("2026-01-03T00:00:00.000Z", 10, "third"),
    ]);
    // Horizon 7 matches no stored record's exact sequence but lies strictly
    // between the retained sequences 5 and 10 — a valid horizon per
    // ADR-0023 § 5's "between retained sequence values" rule.
    const result = await store.listEvidence(7, { limit: 25 });
    expect(result.items.map((record) => record.identifier)).toEqual([
      "atlast:evidence:demo/first",
    ]);
  });

  it("a future horizon cannot issue the first page of a cursor walk", async () => {
    const store = await buildStoreWithFirstSequenceFive();
    await expect(store.listEvidence(100, { limit: 25 })).rejects.toThrow(
      InvalidReadCoordinateError,
    );
  });

  it("a HORIZON_BEFORE_FIRST_EVIDENCE rejection does not alter the watermark or retained records", async () => {
    const store = await buildStoreWithFirstSequenceFive();
    await expect(store.listEvidence(1, { limit: 25 })).rejects.toThrow(
      InvalidReadCoordinateError,
    );
    expect(await store.getCurrentWatermark()).toBe(8);
    expect(
      await store.getEvidenceByIdentifier("atlast:evidence:demo/first"),
    ).toBeDefined();
    expect(
      await store.getEvidenceByIdentifier("atlast:evidence:demo/second"),
    ).toBeDefined();
  });

  it("a HORIZON_AFTER_CURRENT_WATERMARK rejection does not alter the watermark or retained records", async () => {
    const store = await buildStoreWithFirstSequenceFive();
    await expect(store.listEvidence(50, { limit: 25 })).rejects.toThrow(
      InvalidReadCoordinateError,
    );
    expect(await store.getCurrentWatermark()).toBe(8);
    expect(
      await store.getEvidenceByIdentifier("atlast:evidence:demo/first"),
    ).toBeDefined();
    expect(
      await store.getEvidenceByIdentifier("atlast:evidence:demo/second"),
    ).toBeDefined();
  });

  it("does not invoke the Clock while rejecting an out-of-range horizon", async () => {
    const { clock, callCount } = countingClock();
    const store = new InMemoryEvidenceStore(clock);
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 5, "first"),
    ]);
    await expect(store.listEvidence(1, { limit: 25 })).rejects.toThrow(
      InvalidReadCoordinateError,
    );
    await expect(store.listEvidence(100, { limit: 25 })).rejects.toThrow(
      InvalidReadCoordinateError,
    );
    expect(callCount()).toBe(0);
  });

  it("applies semantic validation to a cursor continuation's own horizon consistently with a fresh request", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 5, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 6, "b"),
      buildEvidence("2026-01-03T00:00:00.000Z", 7, "c"),
    ]);
    const firstPage = await store.listEvidence(7, { limit: 2 });
    expect(firstPage.page.hasMore).toBe(true);

    // A continuation carrying a horizon that now falls below
    // firstRecordedSequence is impossible to construct through this store's
    // own API (firstRecordedSequence never changes upward once set), so this
    // proves the continuation path re-runs the same semantic check rather
    // than skipping it: a forged cursor whose bound horizon is itself
    // out-of-range must still be rejected when replayed.
    const forgedCursor = encodeEvidenceCursor({
      cursorKind: "evidence",
      horizon: 100,
      ordering: "observed-at-then-recorded-sequence",
      pageSize: 2,
      position: "atlast:evidence:demo/a",
    });
    let caught: unknown;
    try {
      await store.listEvidence(100, { limit: 2, cursor: forgedCursor });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).reason).toBe(
      "HORIZON_AFTER_CURRENT_WATERMARK",
    );
  });

  it("preserves existing cursor-binding-mismatch behavior alongside the new semantic check", async () => {
    const store = new InMemoryEvidenceStore(neverCallClock());
    await store.appendEvidence([
      buildEvidence("2026-01-01T00:00:00.000Z", 5, "a"),
      buildEvidence("2026-01-02T00:00:00.000Z", 6, "b"),
    ]);
    const firstPage = await store.listEvidence(6, { limit: 1 });
    let caught: unknown;
    try {
      await store.listEvidence(5, {
        limit: 1,
        cursor: firstPage.page.nextCursor,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).reason).toBe(
      "CURSOR_BINDING_MISMATCH",
    );
  });

  it("HORIZON_BEFORE_FIRST_EVIDENCE carries no cursor-related or unrelated optional fields", async () => {
    const store = await buildStoreWithFirstSequenceFive();
    let caught: unknown;
    try {
      await store.listEvidence(1, { limit: 25 });
    } catch (error) {
      caught = error;
    }
    const error = caught as InvalidReadCoordinateError;
    expect(error.cursorKind).toBeUndefined();
    expect("cursorKind" in error).toBe(false);
    expect(error.mismatchFields).toBeUndefined();
    expect("mismatchFields" in error).toBe(false);
    expect(error.requestedIdentity).toBeUndefined();
    expect("requestedIdentity" in error).toBe(false);
    expect(error.cursorBoundIdentity).toBeUndefined();
    expect("cursorBoundIdentity" in error).toBe(false);
    expect(error.requestedHorizon).toBeUndefined();
    expect("requestedHorizon" in error).toBe(false);
    expect(error.cursorBoundHorizon).toBeUndefined();
    expect("cursorBoundHorizon" in error).toBe(false);
    expect(error.unsupportedDerivationVersion).toBeUndefined();
    expect("unsupportedDerivationVersion" in error).toBe(false);
  });

  it("HORIZON_AFTER_CURRENT_WATERMARK carries no cursor-related or unrelated optional fields", async () => {
    const store = await buildStoreWithFirstSequenceFive();
    let caught: unknown;
    try {
      await store.listEvidence(100, { limit: 25 });
    } catch (error) {
      caught = error;
    }
    const error = caught as InvalidReadCoordinateError;
    expect(error.cursorKind).toBeUndefined();
    expect("cursorKind" in error).toBe(false);
    expect(error.mismatchFields).toBeUndefined();
    expect("mismatchFields" in error).toBe(false);
    expect(error.requestedIdentity).toBeUndefined();
    expect("requestedIdentity" in error).toBe(false);
    expect(error.cursorBoundIdentity).toBeUndefined();
    expect("cursorBoundIdentity" in error).toBe(false);
  });
});
