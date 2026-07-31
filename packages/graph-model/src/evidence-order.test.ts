/**
 * Evidence total-order and horizon-selection tests (ADR-0016 §§ "Total order
 * and tie-breaks", "Snapshots"; ADR-0021 § 6): ordering by observedAt then
 * recordedSequence, deterministic under shuffled input, horizon boundaries
 * exact, invalid horizons rejected loudly, and no caller mutation anywhere.
 */
import { describe, expect, it } from "vitest";
import type { Evidence } from "@atlast/shared";
import {
  assertValidEvidenceHorizon,
  compareEvidenceByTotalOrder,
  selectEvidenceAtHorizon,
  sortEvidenceByTotalOrder,
} from "./evidence-order.ts";

/**
 * Build a schema-shaped Evidence record with declared timestamps and
 * sequence. Values are synthetic and deterministic — no clock is read.
 */
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

const EARLY_SEQ_2 = buildEvidence("2026-01-01T00:00:00.000Z", 2, "early-2");
const EARLY_SEQ_5 = buildEvidence("2026-01-01T00:00:00.000Z", 5, "early-5");
const MIDDLE_SEQ_1 = buildEvidence("2026-02-01T00:00:00.000Z", 1, "middle-1");
const LATE_SEQ_3 = buildEvidence("2026-03-01T00:00:00.000Z", 3, "late-3");

const TOTAL_ORDER = [EARLY_SEQ_2, EARLY_SEQ_5, MIDDLE_SEQ_1, LATE_SEQ_3];

describe("compareEvidenceByTotalOrder", () => {
  it("orders primarily by observedAt ascending", () => {
    expect(compareEvidenceByTotalOrder(EARLY_SEQ_5, MIDDLE_SEQ_1)).toBeLessThan(
      0,
    );
    expect(
      compareEvidenceByTotalOrder(MIDDLE_SEQ_1, EARLY_SEQ_5),
    ).toBeGreaterThan(0);
  });

  it("breaks equal-observedAt ties by recordedSequence ascending", () => {
    expect(compareEvidenceByTotalOrder(EARLY_SEQ_2, EARLY_SEQ_5)).toBeLessThan(
      0,
    );
    expect(
      compareEvidenceByTotalOrder(EARLY_SEQ_5, EARLY_SEQ_2),
    ).toBeGreaterThan(0);
  });

  it("returns zero only for an identical ordering key", () => {
    expect(compareEvidenceByTotalOrder(EARLY_SEQ_2, EARLY_SEQ_2)).toBe(0);
  });

  it("orders a late-old-observation record by its old observedAt, not its high sequence", () => {
    const lateOldObservation = buildEvidence(
      "2026-01-01T00:00:00.000Z",
      99,
      "late-old",
    );
    // Sequence 99 is far above MIDDLE_SEQ_1's, but the January observedAt
    // still sorts it before February (ADR-0016: observedAt is primary).
    expect(
      compareEvidenceByTotalOrder(lateOldObservation, MIDDLE_SEQ_1),
    ).toBeLessThan(0);
  });
});

describe("sortEvidenceByTotalOrder", () => {
  it("produces the identical total order for every input permutation", () => {
    const permutations: Evidence[][] = [
      [LATE_SEQ_3, EARLY_SEQ_5, MIDDLE_SEQ_1, EARLY_SEQ_2],
      [MIDDLE_SEQ_1, EARLY_SEQ_2, LATE_SEQ_3, EARLY_SEQ_5],
      [EARLY_SEQ_5, LATE_SEQ_3, EARLY_SEQ_2, MIDDLE_SEQ_1],
    ];
    for (const permutation of permutations) {
      expect(sortEvidenceByTotalOrder(permutation)).toEqual(TOTAL_ORDER);
    }
  });

  it("returns a new array and never mutates the caller's array or records", () => {
    const callerArray = [LATE_SEQ_3, EARLY_SEQ_5, MIDDLE_SEQ_1, EARLY_SEQ_2];
    const callerArraySnapshot = [...callerArray];
    const recordSnapshot = structuredClone(LATE_SEQ_3);

    const sorted = sortEvidenceByTotalOrder(callerArray);

    expect(sorted).not.toBe(callerArray);
    expect(callerArray).toEqual(callerArraySnapshot);
    expect(LATE_SEQ_3).toEqual(recordSnapshot);
    // Elements are carried by reference, not cloned.
    expect(sorted[0]).toBe(EARLY_SEQ_2);
  });
});

describe("assertValidEvidenceHorizon", () => {
  it.each([
    ["zero", 0],
    ["a negative integer", -1],
    ["a non-integer", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["above the safe-integer bound", Number.MAX_SAFE_INTEGER + 2],
  ])("rejects %s loudly", (_description: string, invalidHorizon: number) => {
    expect(() => {
      assertValidEvidenceHorizon(invalidHorizon);
    }).toThrow(RangeError);
  });

  it("accepts the domain boundaries 1 and 2^53 − 1", () => {
    expect(() => {
      assertValidEvidenceHorizon(1);
    }).not.toThrow();
    expect(() => {
      assertValidEvidenceHorizon(Number.MAX_SAFE_INTEGER);
    }).not.toThrow();
  });
});

describe("selectEvidenceAtHorizon", () => {
  it("includes exactly the records with recordedSequence ≤ horizon", () => {
    // Horizon 3 includes sequences 1, 2, 3 — and excludes 5 even though its
    // observedAt is earlier than sequence 3's (selection is by sequence).
    expect(selectEvidenceAtHorizon(TOTAL_ORDER, 3)).toEqual([
      EARLY_SEQ_2,
      MIDDLE_SEQ_1,
      LATE_SEQ_3,
    ]);
  });

  it("treats the horizon boundary as inclusive and horizon − 1 as exclusive", () => {
    expect(selectEvidenceAtHorizon(TOTAL_ORDER, 5)).toHaveLength(4);
    expect(selectEvidenceAtHorizon(TOTAL_ORDER, 4)).toHaveLength(3);
    expect(selectEvidenceAtHorizon(TOTAL_ORDER, 1)).toEqual([MIDDLE_SEQ_1]);
  });

  it("returns the selection in total order regardless of input order", () => {
    const shuffled = [LATE_SEQ_3, MIDDLE_SEQ_1, EARLY_SEQ_5, EARLY_SEQ_2];
    expect(selectEvidenceAtHorizon(shuffled, Number.MAX_SAFE_INTEGER)).toEqual(
      TOTAL_ORDER,
    );
  });

  it("rejects an invalid horizon instead of coercing it", () => {
    expect(() => selectEvidenceAtHorizon(TOTAL_ORDER, 0)).toThrow(RangeError);
    expect(() => selectEvidenceAtHorizon(TOTAL_ORDER, 2.5)).toThrow(RangeError);
  });

  it("never mutates the caller's array or its records", () => {
    const callerArray = [LATE_SEQ_3, EARLY_SEQ_5, EARLY_SEQ_2];
    const callerArraySnapshot = [...callerArray];
    const deepSnapshot = structuredClone(callerArray);

    selectEvidenceAtHorizon(callerArray, 3);

    expect(callerArray).toEqual(callerArraySnapshot);
    expect(callerArray).toEqual(deepSnapshot);
  });
});
