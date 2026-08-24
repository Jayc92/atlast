/**
 * ADR-0038-B differential correctness harness: for identical Evidence
 * streams, `advanceOrFallback`'s incrementally-advanced result must equal,
 * at every horizon, what the unmodified, pure `reconcileEvidenceAtHorizon`
 * reference implementation produces from scratch over the same Evidence.
 * Covers required scenarios A-J: single-source corroboration (the M5
 * polling shape), multiple sources, conflicts, m1-v1 alias ambiguity,
 * withdrawals, relationship revision chains, multiple new records between
 * reads, deliberately late/out-of-order `observedAt`, the existing
 * late-old horizon-safety shape, and fallback followed by subsequent safe
 * monotonic Evidence.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evidenceCollectionSchema } from "@atlast/shared";
import type { Evidence } from "@atlast/shared";
import {
  advanceOrFallback,
  type IncrementalReconciliationState,
} from "./incremental-reconciliation.ts";
import { M1_V1_DERIVATION_POLICY } from "./derivation-policy.ts";
import { reconcileEvidenceAtHorizon } from "./reconciliation.ts";

const DERIVATION_VERSION = "m1-v1";

const FIXTURE_ROOT = fileURLToPath(
  new URL("../../../fixtures/demo-company/", import.meta.url),
);

interface CatalogScenario {
  readonly evidenceFile: string;
}
interface Catalog {
  readonly scenarios: readonly CatalogScenario[];
}

function loadFixtureJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(FIXTURE_ROOT + relativePath, "utf8"));
}

const ALL_FIXTURE_EVIDENCE: readonly Evidence[] =
  evidenceCollectionSchema.parse(
    (loadFixtureJson("catalog.json") as Catalog).scenarios.flatMap(
      (scenario) => loadFixtureJson(scenario.evidenceFile) as unknown[],
    ),
  );

function referenceResultAt(
  evidenceRecords: readonly Evidence[],
  horizon: number,
) {
  return reconcileEvidenceAtHorizon(
    evidenceRecords,
    horizon,
    M1_V1_DERIVATION_POLICY,
  );
}

/**
 * Drive `advanceOrFallback` across a sequence of horizons (not necessarily
 * one at a time), always passing the complete horizon-selected Evidence
 * (mirroring `SnapshotResolver`'s own contract), and compare the result at
 * every step against a fresh reference computation.
 */
function driveIncrementallyAndVerify(
  evidenceRecords: readonly Evidence[],
  horizons: readonly number[],
): readonly boolean[] {
  let state: IncrementalReconciliationState | undefined;
  const usedFastPathByHorizon: boolean[] = [];
  for (const horizon of horizons) {
    const horizonSelectedEvidence = evidenceRecords.filter(
      (record) => record.recordedSequence <= horizon,
    );
    const outcome = advanceOrFallback(
      state,
      horizonSelectedEvidence,
      horizon,
      DERIVATION_VERSION,
      M1_V1_DERIVATION_POLICY,
    );
    state = outcome.state;
    usedFastPathByHorizon.push(outcome.usedFastPath);

    const reference = referenceResultAt(horizonSelectedEvidence, horizon);
    expect(outcome.state.referenceResult.subjects).toEqual(reference.subjects);
    expect(outcome.state.referenceResult.assertions).toEqual(
      reference.assertions,
    );
  }
  return usedFastPathByHorizon;
}

function buildEvidence(
  sequence: number,
  source: string,
  sourceNativeId: string,
  entityType: string,
  observedAt: string,
): Evidence {
  return {
    schemaVersion: "atlast-domain-v1",
    identifier: `atlast:evidence:incremental/${source}/${String(sequence).padStart(4, "0")}`,
    observedAt,
    recordedAt: observedAt,
    recordedSequence: sequence,
    sourceScopedIdentity: { source, sourceNativeId },
    observation: { observationKind: "entity", entityType },
    detail: null,
  };
}

describe("ADR-0038-B — scenario A: single-source corroboration (M5 polling shape)", () => {
  it("matches the reference at every horizon and uses the fast path after the first revision", () => {
    const base = Date.parse("2026-08-20T18:45:40.319Z");
    const evidenceRecords: Evidence[] = [];
    for (let sequence = 1; sequence <= 12; sequence += 1) {
      evidenceRecords.push(
        buildEvidence(
          sequence,
          "kubernetes",
          "bench-pod",
          "kubernetes-pod",
          new Date(base + (sequence - 1) * 2000).toISOString(),
        ),
      );
    }
    const horizons = Array.from({ length: 12 }, (_, index) => index + 1);
    const usedFastPathByHorizon = driveIncrementallyAndVerify(
      evidenceRecords,
      horizons,
    );
    // Horizon 1 always falls back (no prior state exists yet for the
    // driver's first call); horizon 2 onward (pure continuing corroboration
    // of the same single-source claim) is fast-path eligible throughout.
    expect(usedFastPathByHorizon).toEqual([
      false,
      ...Array.from({ length: 11 }, () => true),
    ]);
  });
});

describe("ADR-0038-B — scenarios B/C/D/F: the real fixture catalog replayed incrementally", () => {
  it("matches the reference at every horizon, one new record at a time, across the complete demo-company catalog (multi-source, conflicts, alias ambiguity, and relationship chains)", () => {
    const horizons = Array.from(
      { length: ALL_FIXTURE_EVIDENCE.length },
      (_, index) => index + 1,
    );
    // No assertion on which horizons use the fast path: the catalog
    // deliberately contains conflicts, ambiguity, and relationship chains
    // this narrow fast path correctly declines and falls back for — the
    // only required property is that every horizon's result, however
    // obtained, is byte-identical to the reference.
    driveIncrementallyAndVerify(ALL_FIXTURE_EVIDENCE, horizons);
  });

  it("matches the reference when multiple horizons are skipped between reads (multiple new records at once)", () => {
    const horizons = [3, 7, 12, 20];
    driveIncrementallyAndVerify(ALL_FIXTURE_EVIDENCE, horizons);
  });
});

describe("ADR-0038-B — scenario E: withdrawal (a source changes its claim)", () => {
  it("falls back correctly and matches the reference when a source's claim for a subject changes, including through the reference's own one-step-only claim-supersession marker", () => {
    const evidenceRecords: Evidence[] = [
      buildEvidence(
        1,
        "source-a",
        "checkout",
        "service",
        "2026-01-01T00:00:00.000Z",
      ),
      buildEvidence(
        2,
        "source-a",
        "checkout",
        "worker",
        "2026-01-02T00:00:00.000Z",
      ),
      // The reference marks horizon 2's "worker" revision with
      // "claim-supersession" (service lost standing, worker gained it in
      // the same step) — valid for that one step only, so horizon 3 must
      // still fall back even though the claim itself does not change
      // again, then the marker naturally does not reappear and the fast
      // path resumes.
      buildEvidence(
        3,
        "source-a",
        "checkout",
        "worker",
        "2026-01-03T00:00:00.000Z",
      ),
      buildEvidence(
        4,
        "source-a",
        "checkout",
        "worker",
        "2026-01-04T00:00:00.000Z",
      ),
    ];
    const usedFastPathByHorizon = driveIncrementallyAndVerify(
      evidenceRecords,
      [1, 2, 3, 4],
    );
    expect(usedFastPathByHorizon[0]).toBe(false); // no prior state yet — always falls back
    expect(usedFastPathByHorizon[1]).toBe(false); // claim changed — must fall back
    expect(usedFastPathByHorizon[2]).toBe(false); // lingering claim-supersession marker — must fall back
    expect(usedFastPathByHorizon[3]).toBe(true); // marker naturally absent now — fast path resumes
  });

  it("refuses the fast path for an UNRELATED subject's Evidence while a different subject's claim-supersession marker is still pending, then correctly drops that marker on fallback", () => {
    // Subject A ("checkout") undergoes claim supersession at horizon 2.
    const evidenceRecords: Evidence[] = [
      buildEvidence(
        1,
        "source-a",
        "checkout",
        "service",
        "2026-01-01T00:00:00.000Z",
      ),
      buildEvidence(
        2,
        "source-a",
        "checkout",
        "worker",
        "2026-01-02T00:00:00.000Z",
      ),
      // Horizon 3's new Evidence concerns a completely unrelated subject B
      // ("payments") — never named by any policy alias, never previously
      // observed, and sharing no source, claim, or identity with subject A.
      // Subject A receives no new Evidence at all in this step.
      buildEvidence(
        3,
        "source-b",
        "payments",
        "service",
        "2026-01-03T00:00:00.000Z",
      ),
    ];
    const usedFastPathByHorizon = driveIncrementallyAndVerify(
      evidenceRecords,
      [1, 2, 3],
    );
    expect(usedFastPathByHorizon[0]).toBe(false); // no prior state yet
    expect(usedFastPathByHorizon[1]).toBe(false); // claim changed — must fall back
    // The unrelated subject B's Evidence at horizon 3 must still refuse the
    // fast path, purely because subject A's still-open revision from
    // horizon 2 carries "claim-supersession" — proving the global
    // precondition applies even when the new Evidence touches a different
    // subject entirely.
    expect(usedFastPathByHorizon[2]).toBe(false);

    const finalState = advanceOrFallback(
      undefined,
      evidenceRecords.slice(0, 2),
      2,
      DERIVATION_VERSION,
      M1_V1_DERIVATION_POLICY,
    ).state;
    const afterHorizonThree = advanceOrFallback(
      finalState,
      evidenceRecords,
      3,
      DERIVATION_VERSION,
      M1_V1_DERIVATION_POLICY,
    );
    const reference = referenceResultAt(evidenceRecords, 3);

    // Subject A's own complete revision history — untouched by any new
    // Evidence at this horizon — must nonetheless exactly match the
    // reference in full, including the now-closed horizon-2 revision,
    // which correctly and permanently retains "claim-supersession" as an
    // accurate record of what happened at that step (closed history is
    // never rewritten).
    const candidateSubjectA =
      afterHorizonThree.state.referenceResult.assertions.filter(
        (assertion) => assertion.subjectIdentifier === "atlast:entity:checkout",
      );
    const referenceSubjectA = reference.assertions.filter(
      (assertion) => assertion.subjectIdentifier === "atlast:entity:checkout",
    );
    expect(candidateSubjectA).toEqual(referenceSubjectA);

    // The NEWLY OPENED revision (validTo undefined) — re-derived fresh at
    // horizon 3 even though subject A received no new Evidence there — must
    // no longer carry "claim-supersession": the marker is one-step-only and
    // must not leak into the revision this checkpoint's fast path would
    // otherwise be tempted to treat as still-current.
    const openRevision = candidateSubjectA.find(
      (assertion) => assertion.validity.validTo === undefined,
    );
    expect(openRevision).toBeDefined();
    expect(
      openRevision?.ruleTrace.some(
        (entry) => entry.ruleName === "claim-supersession",
      ),
    ).toBe(false);
  });
});

describe("ADR-0038-B — scenario H: deliberately late/out-of-order observedAt", () => {
  it("falls back rather than trusting the fast path, and matches the reference exactly", () => {
    const evidenceRecords: Evidence[] = [
      buildEvidence(
        1,
        "source-a",
        "checkout",
        "service",
        "2026-01-10T00:00:00.000Z",
      ),
      buildEvidence(
        2,
        "source-a",
        "checkout",
        "service",
        "2026-01-20T00:00:00.000Z",
      ),
      // recordedSequence 3 arrives late (append order) but its observedAt
      // (2026-01-05) predates both already-processed steps above.
      buildEvidence(
        3,
        "source-a",
        "checkout",
        "service",
        "2026-01-05T00:00:00.000Z",
      ),
    ];
    const usedFastPathByHorizon = driveIncrementallyAndVerify(
      evidenceRecords,
      [1, 2, 3],
    );
    expect(usedFastPathByHorizon[0]).toBe(false); // no prior state yet — always falls back
    expect(usedFastPathByHorizon[1]).toBe(true);
    // The late-observedAt record must never be trusted to the fast path.
    expect(usedFastPathByHorizon[2]).toBe(false);
  });
});

describe("ADR-0038-B — scenario I: the existing late-old horizon-safety shape, driven incrementally", () => {
  it("reproduces reconciliation.test.ts's late-old horizon-safety result via advanceOrFallback", () => {
    // Mirrors reconciliation.test.ts scenario 6's real fixture shape: a
    // "fulfillment" relationship-target Evidence record recorded late
    // (high recordedSequence) whose observedAt places it chronologically
    // before evidence already visible at lower horizons.
    const horizons = [11, 12];
    const usedFastPathByHorizon = driveIncrementallyAndVerify(
      ALL_FIXTURE_EVIDENCE,
      horizons,
    );
    // Whatever the fast path decided at horizon 11, the transition to
    // horizon 12 — which introduces the late-old record — must match the
    // reference exactly (already asserted by driveIncrementallyAndVerify);
    // this test's own value is the explicit parity proof against the
    // established reference scenario, not a specific fast-path/fallback
    // classification.
    expect(usedFastPathByHorizon).toHaveLength(2);
  });
});

describe("ADR-0038-B — scenario J: fallback followed by subsequent safe monotonic Evidence", () => {
  it("resumes the fast path correctly after a forced fallback, matching the reference throughout", () => {
    const evidenceRecords: Evidence[] = [
      buildEvidence(
        1,
        "source-a",
        "checkout",
        "service",
        "2026-01-01T00:00:00.000Z",
      ),
      // A second, competing source creates a conflict at horizon 2 — unsafe
      // for the fast path (two standing claims).
      buildEvidence(
        2,
        "source-b",
        "checkout",
        "worker",
        "2026-01-02T00:00:00.000Z",
      ),
      // Source B now also asserts "service", superseding its own "worker"
      // claim — the conflict resolves back to one standing claim, itself a
      // claim-standing transition this narrow fast path does not attempt;
      // still unsafe, still falls back.
      buildEvidence(
        3,
        "source-b",
        "checkout",
        "service",
        "2026-01-03T00:00:00.000Z",
      ),
      // With exactly one standing, uncontested, unambiguous claim restored
      // by horizon 3's authoritative fallback, source A's continuing
      // corroboration is safe, pure corroboration once more — but only if
      // state was correctly rebuilt from that fallback's own result.
      buildEvidence(
        4,
        "source-a",
        "checkout",
        "service",
        "2026-01-04T00:00:00.000Z",
      ),
    ];
    const usedFastPathByHorizon = driveIncrementallyAndVerify(
      evidenceRecords,
      [1, 2, 3, 4],
    );
    expect(usedFastPathByHorizon[0]).toBe(false); // no prior state yet — always falls back
    expect(usedFastPathByHorizon[1]).toBe(false); // conflict introduced — forced fallback
    expect(usedFastPathByHorizon[2]).toBe(false); // conflict resolving — forced fallback
    // Subsequent safe, monotonic corroboration resumes the fast path.
    expect(usedFastPathByHorizon[3]).toBe(true);
  });
});

describe("ADR-0038-B — undefined prior state and non-advancing horizons", () => {
  it("falls back when no prior state exists", () => {
    const evidenceRecords = [
      buildEvidence(
        1,
        "source-a",
        "checkout",
        "service",
        "2026-01-01T00:00:00.000Z",
      ),
    ];
    const outcome = advanceOrFallback(
      undefined,
      evidenceRecords,
      1,
      DERIVATION_VERSION,
      M1_V1_DERIVATION_POLICY,
    );
    expect(outcome.usedFastPath).toBe(false);
    expect(outcome.state.referenceResult).toEqual(
      referenceResultAt(evidenceRecords, 1),
    );
  });

  it("falls back when the requested horizon does not exceed the prior state's own horizon", () => {
    const evidenceRecords = [
      buildEvidence(
        1,
        "source-a",
        "checkout",
        "service",
        "2026-01-01T00:00:00.000Z",
      ),
    ];
    const first = advanceOrFallback(
      undefined,
      evidenceRecords,
      1,
      DERIVATION_VERSION,
      M1_V1_DERIVATION_POLICY,
    );
    const repeated = advanceOrFallback(
      first.state,
      evidenceRecords,
      1,
      DERIVATION_VERSION,
      M1_V1_DERIVATION_POLICY,
    );
    expect(repeated.usedFastPath).toBe(false);
    expect(repeated.state.referenceResult).toEqual(
      referenceResultAt(evidenceRecords, 1),
    );
  });
});
