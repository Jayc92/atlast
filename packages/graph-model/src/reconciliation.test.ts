/**
 * Reconciliation-engine tests (accepted ADR-0022 invariants 1–12): the seven
 * synthetic fixture scenarios exercised read-only through the pure engine —
 * event-time corroboration, horizon stability, conflict symmetry, ambiguity
 * without dangling references, the scenario 6 revision chain, the constructed
 * withdrawn-support vector, rule-trace and schema validity, content-address
 * recomputation, replay determinism, and caller non-mutation.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evidenceCollectionSchema, graphAssertionSchema } from "@atlast/shared";
import type { Evidence, GraphAssertion } from "@atlast/shared";
import { M1_V1_DERIVATION_POLICY } from "./derivation-policy.ts";
import { reconcileEvidenceAtHorizon } from "./reconciliation.ts";
import { sha256HexOfCanonicalJson } from "./canonical-digest.ts";

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

/** Every valid fixture record, in catalog order, validated once up front. */
const ALL_FIXTURE_EVIDENCE: readonly Evidence[] =
  evidenceCollectionSchema.parse(
    (loadFixtureJson("catalog.json") as Catalog).scenarios.flatMap(
      (scenario) => loadFixtureJson(scenario.evidenceFile) as unknown[],
    ),
  );

const MAX_HORIZON = 20;

function reconcileAt(
  horizon: number,
  evidence: readonly Evidence[] = ALL_FIXTURE_EVIDENCE,
): ReturnType<typeof reconcileEvidenceAtHorizon> {
  return reconcileEvidenceAtHorizon(evidence, horizon, M1_V1_DERIVATION_POLICY);
}

function assertionsFor(
  result: ReturnType<typeof reconcileEvidenceAtHorizon>,
  subjectIdentifier: string,
): GraphAssertion[] {
  return result.assertions.filter(
    (assertion) => assertion.subjectIdentifier === subjectIdentifier,
  );
}

/** Build a synthetic Evidence record for constructed (non-fixture) vectors. */
function buildEvidence(
  sequence: number,
  source: string,
  sourceNativeId: string,
  entityType: string,
  observedAt: string,
): Evidence {
  return {
    schemaVersion: "atlast-domain-v1",
    identifier: `atlast:evidence:constructed/${source}/${String(sequence).padStart(4, "0")}`,
    observedAt,
    recordedAt: observedAt,
    recordedSequence: sequence,
    sourceScopedIdentity: { source, sourceNativeId },
    observation: { observationKind: "entity", entityType },
    detail: null,
  };
}

describe("scenario 1 — equal-time atomic corroboration", () => {
  it("yields one two-source revision with confidence 0.7 and no zero-length intermediate", () => {
    const result = reconcileAt(2);
    const checkoutRevisions = assertionsFor(result, "atlast:entity:checkout");
    expect(checkoutRevisions).toHaveLength(1);
    const revision = checkoutRevisions[0];
    expect(revision?.provenance).toEqual([
      "atlast:evidence:demo-company/deployment-inventory/0001",
      "atlast:evidence:demo-company/service-registry/0002",
    ]);
    expect(revision?.confidence).toBe(0.7);
    expect(revision?.validity).toEqual({
      validFrom: "2026-01-10T09:00:00.000Z",
    });
    expect(revision?.conflictState).toEqual({ status: "uncontested" });
  });
});

describe("scenario 2 — late corroboration across horizons", () => {
  it("keeps H1 byte-identical while H2 adds the three-source successor history", () => {
    const atH1 = reconcileAt(2);
    const atH2 = reconcileAt(3);

    const h1Checkout = assertionsFor(atH1, "atlast:entity:checkout");
    expect(h1Checkout).toHaveLength(1);

    const h2Checkout = assertionsFor(atH2, "atlast:entity:checkout");
    expect(h2Checkout).toHaveLength(2);
    const closed = h2Checkout.find(
      (assertion) => assertion.validity.validTo !== undefined,
    );
    const open = h2Checkout.find(
      (assertion) => assertion.validity.validTo === undefined,
    );
    // The two-source revision closes at the corroborating instant; the
    // three-source successor (0.8) opens there.
    expect(closed?.provenance).toHaveLength(2);
    expect(closed?.confidence).toBe(0.7);
    expect(closed?.validity.validTo).toBe("2026-01-10T09:02:00.000Z");
    expect(open?.provenance).toHaveLength(3);
    expect(open?.confidence).toBe(0.8);
    expect(open?.validity.validFrom).toBe("2026-01-10T09:02:00.000Z");
    expect(open?.ruleTrace.map((entry) => entry.ruleName)).toContain(
      "distinct-source-corroboration",
    );

    // H1 replay after the H2 record exists is byte-identical: the third
    // record's sequence is above H1, so it can never enter that horizon.
    expect(JSON.stringify(reconcileAt(2))).toBe(JSON.stringify(atH1));
  });
});

describe("scenario 3 — conflict symmetry", () => {
  it("yields two alternatives-only symmetric revisions with no winner", () => {
    const result = reconcileAt(5);
    const ordersRevisions = assertionsFor(result, "atlast:entity:orders");
    expect(ordersRevisions).toHaveLength(2);
    for (const revision of ordersRevisions) {
      expect(revision.confidence).toBe(0.5);
      expect(revision.conflictState.status).toBe("conflicted");
      if (revision.conflictState.status !== "conflicted") {
        continue;
      }
      const competing = revision.conflictState.competingClaims;
      expect(competing).toHaveLength(1);
      // Alternatives only: the competitor is the OTHER claim, never its own.
      expect(competing[0]?.claim).not.toEqual(revision.claim);
      expect(competing[0]?.confidence).toBe(0.5);
      expect(competing[0]?.provenance).toHaveLength(1);
      // Competitor Evidence lives only in competingClaims, not in the
      // revision's own provenance or trace citations.
      for (const citedIdentifier of revision.ruleTrace.flatMap(
        (entry) => entry.evidenceIdentifiers,
      )) {
        expect(revision.provenance).toContain(citedIdentifier);
      }
    }
    const claimedTypes = ordersRevisions
      .map((revision) =>
        revision.claim.claimKind === "entity" ? revision.claim.entityType : "",
      )
      .sort();
    expect(claimedTypes).toEqual(["database", "service"]);
  });
});

describe("scenario 5 — ambiguity only when both subjects exist (H7/H8)", () => {
  it("keeps ledger-api unambiguous at H7 (ledger does not exist yet)", () => {
    const atH7 = reconcileAt(7);
    const ledgerApi = assertionsFor(atH7, "atlast:entity:ledger-api");
    expect(ledgerApi).toHaveLength(1);
    expect(ledgerApi[0]?.ambiguityState).toEqual({ status: "unambiguous" });
    expect(assertionsFor(atH7, "atlast:entity:ledger")).toHaveLength(0);
  });

  it("flags both subjects symmetrically at H8 with the exact reason text and no dangling references", () => {
    const atH8 = reconcileAt(8);
    const ledgerApiRevisions = assertionsFor(atH8, "atlast:entity:ledger-api");
    const ledgerRevisions = assertionsFor(atH8, "atlast:entity:ledger");

    // ledger's appearance at 14:01 changes ledger-api's identifying content:
    // its unambiguous revision closes there and an ambiguous successor opens.
    expect(ledgerApiRevisions).toHaveLength(2);
    const closedUnambiguous = ledgerApiRevisions.find(
      (revision) => revision.validity.validTo !== undefined,
    );
    const openAmbiguous = ledgerApiRevisions.find(
      (revision) => revision.validity.validTo === undefined,
    );
    expect(closedUnambiguous?.ambiguityState).toEqual({
      status: "unambiguous",
    });
    expect(closedUnambiguous?.validity.validTo).toBe(
      "2026-02-10T14:01:00.000Z",
    );
    expect(openAmbiguous?.ambiguityState).toEqual({
      status: "ambiguous",
      nearMatches: [
        {
          nearMatchSubjectIdentifier: "atlast:entity:ledger",
          reason: "one-directional-alias:ledger-api->ledger",
        },
      ],
    });

    expect(ledgerRevisions).toHaveLength(1);
    expect(ledgerRevisions[0]?.ambiguityState).toEqual({
      status: "ambiguous",
      nearMatches: [
        {
          nearMatchSubjectIdentifier: "atlast:entity:ledger-api",
          reason: "one-directional-alias:ledger-api->ledger",
        },
      ],
    });

    // No dangling references: every near-match names a derived subject.
    const subjectIdentifiers = new Set(
      atH8.subjects.map((subject) => subject.identifier),
    );
    for (const assertion of atH8.assertions) {
      if (assertion.ambiguityState.status === "ambiguous") {
        for (const nearMatch of assertion.ambiguityState.nearMatches) {
          expect(
            subjectIdentifiers.has(nearMatch.nearMatchSubjectIdentifier),
          ).toBe(true);
        }
      }
    }
    // Two separate subjects — never merged.
    expect(subjectIdentifiers.has("atlast:entity:ledger")).toBe(true);
    expect(subjectIdentifiers.has("atlast:entity:ledger-api")).toBe(true);
  });
});

describe("scenario 6 — relationship revision chain without future leakage", () => {
  it("produces the March 2 → March 5 → March 10 chain with duplicate-source counting", () => {
    const result = reconcileAt(13);
    const relationshipRevisions = assertionsFor(
      result,
      "atlast:relationship:checkout-payment-call",
    );
    expect(relationshipRevisions).toHaveLength(3);

    const byValidFrom = [...relationshipRevisions].sort((first, second) =>
      first.validity.validFrom < second.validity.validFrom ? -1 : 1,
    );
    const [march2, march5, march10] = byValidFrom;

    // March 2: one payments observation.
    expect(march2?.validity).toEqual({
      validFrom: "2026-03-02T00:00:00.000Z",
      validTo: "2026-03-05T00:00:00.000Z",
    });
    expect(march2?.provenance).toEqual([
      "atlast:evidence:demo-company/trace-index/0010",
    ]);
    expect(march2?.confidence).toBe(0.5);

    // March 5: provenance grows to two records, same single source → 0.5.
    expect(march5?.validity).toEqual({
      validFrom: "2026-03-05T00:00:00.000Z",
      validTo: "2026-03-10T00:00:00.000Z",
    });
    expect(march5?.provenance).toHaveLength(2);
    expect(march5?.confidence).toBe(0.5);
    // No future-Evidence leakage: the March 2 revision never carries the
    // March 5 record, and no revision cites Evidence past its own interval.
    expect(march2?.provenance).not.toContain(
      "atlast:evidence:demo-company/trace-index/0011",
    );

    // March 10: the fulfillment-target claim supersedes payments.
    expect(march10?.validity).toEqual({
      validFrom: "2026-03-10T00:00:00.000Z",
    });
    expect(
      march10?.claim.claimKind === "relationship"
        ? march10.claim.targetEntityIdentifier
        : "",
    ).toBe("atlast:entity:fulfillment");
    expect(march10?.ruleTrace.map((entry) => entry.ruleName)).toContain(
      "claim-supersession",
    );
    // claim-supersession appears only on the successor; the closed payments
    // revisions never carry it or import the superseding Evidence.
    for (const paymentsRevision of [march2, march5]) {
      expect(
        paymentsRevision?.ruleTrace.map((entry) => entry.ruleName),
      ).not.toContain("claim-supersession");
      expect(paymentsRevision?.provenance).not.toContain(
        "atlast:evidence:demo-company/trace-index/0013",
      );
    }
  });

  it("keeps late-old Evidence horizon-safe: fulfillment is invisible below 12, validFrom 2026-01-05 at ≥ 12", () => {
    const below = reconcileAt(11);
    expect(assertionsFor(below, "atlast:entity:fulfillment")).toHaveLength(0);

    const atOrAbove = reconcileAt(12);
    const fulfillment = assertionsFor(atOrAbove, "atlast:entity:fulfillment");
    expect(fulfillment).toHaveLength(1);
    expect(fulfillment[0]?.validity.validFrom).toBe("2026-01-05T00:00:00.000Z");

    // Earlier pinned horizons remain byte-identical after the late record.
    expect(JSON.stringify(reconcileAt(11))).toBe(JSON.stringify(below));
  });

  it("disappearance alone closes nothing: the fulfillment-target revision stays open at the max horizon", () => {
    const result = reconcileAt(MAX_HORIZON);
    const open = assertionsFor(
      result,
      "atlast:relationship:checkout-payment-call",
    ).filter((assertion) => assertion.validity.validTo === undefined);
    expect(open).toHaveLength(1);
  });
});

describe("constructed withdrawn-support vector (ADR-0022 invariant 7)", () => {
  const CLAIM_X_EVIDENCE = [
    buildEvidence(
      1,
      "source-a",
      "target",
      "service",
      "2026-01-01T00:00:00.000Z",
    ),
    buildEvidence(
      2,
      "source-b",
      "target",
      "service",
      "2026-01-01T00:00:00.000Z",
    ),
  ];
  const SOURCE_A_MOVES_TO_Y = buildEvidence(
    3,
    "source-a",
    "target",
    "database",
    "2026-01-02T00:00:00.000Z",
  );
  const VECTOR = [...CLAIM_X_EVIDENCE, SOURCE_A_MOVES_TO_Y];

  it("excludes the departed source's old Evidence from X's successor and drops confidence to 0.5", () => {
    const result = reconcileEvidenceAtHorizon(
      VECTOR,
      3,
      M1_V1_DERIVATION_POLICY,
    );
    const revisions = assertionsFor(result, "atlast:entity:target");
    // History: the two-source X revision (closed), X's one-source successor
    // (open, conflicted), and Y's revision (open, conflicted).
    expect(revisions).toHaveLength(3);

    const closedX = revisions.find(
      (revision) => revision.validity.validTo !== undefined,
    );
    expect(closedX?.provenance).toHaveLength(2);
    expect(closedX?.confidence).toBe(0.7);
    expect(closedX?.validity.validTo).toBe("2026-01-02T00:00:00.000Z");

    const openRevisions = revisions.filter(
      (revision) => revision.validity.validTo === undefined,
    );
    expect(openRevisions).toHaveLength(2);
    const successorX = openRevisions.find(
      (revision) =>
        revision.claim.claimKind === "entity" &&
        revision.claim.entityType === "service",
    );
    const claimY = openRevisions.find(
      (revision) =>
        revision.claim.claimKind === "entity" &&
        revision.claim.entityType === "database",
    );

    // X remains standing through B only: A's old X Evidence is excluded.
    expect(successorX?.provenance).toEqual([
      "atlast:evidence:constructed/source-b/0002",
    ]);
    expect(successorX?.confidence).toBe(0.5);

    // Y opens with A's Y Evidence. This step is a CONFLICT creation, not a
    // supersession: X never lost standing (B still stands on it), and
    // ADR-0022 § 10 rule 5 fires claim-supersession only when another value
    // lost its standing at the step.
    expect(claimY?.provenance).toEqual([
      "atlast:evidence:constructed/source-a/0003",
    ]);
    expect(claimY?.confidence).toBe(0.5);
    expect(claimY?.ruleTrace.map((entry) => entry.ruleName)).toContain(
      "mutually-exclusive-claim-conflict",
    );
    expect(claimY?.ruleTrace.map((entry) => entry.ruleName)).not.toContain(
      "claim-supersession",
    );

    // X and Y coexist as a symmetric alternatives-only conflict, and no
    // withdrawn support contributes to either side's confidence.
    for (const conflicted of [successorX, claimY]) {
      expect(conflicted?.conflictState.status).toBe("conflicted");
      if (conflicted?.conflictState.status === "conflicted") {
        expect(conflicted.conflictState.competingClaims).toHaveLength(1);
        expect(conflicted.conflictState.competingClaims[0]?.confidence).toBe(
          0.5,
        );
      }
    }
  });
});

describe("engine-wide invariants over the full fixture catalog", () => {
  it("validates every emitted subject and assertion through the merged shared schemas", () => {
    const result = reconcileAt(MAX_HORIZON);
    expect(result.subjects.length).toBeGreaterThan(0);
    expect(result.assertions.length).toBeGreaterThan(0);
    for (const assertion of result.assertions) {
      expect(graphAssertionSchema.safeParse(assertion).success).toBe(true);
    }
  });

  it("recomputes every content address from its identifying payload", () => {
    const result = reconcileAt(MAX_HORIZON);
    for (const assertion of result.assertions) {
      const recomputedDigest = sha256HexOfCanonicalJson({
        derivationVersion: assertion.derivationVersion,
        subjectIdentifier: assertion.subjectIdentifier,
        claim: assertion.claim,
        validity: assertion.validity,
        provenance: assertion.provenance,
        ruleTrace: assertion.ruleTrace,
        conflictState: assertion.conflictState,
        ambiguityState: assertion.ambiguityState,
      });
      expect(assertion.identifier).toBe(`atlast:assertion:${recomputedDigest}`);
    }
  });

  it("keeps every rule-trace citation inside the revision's own provenance and no revision provenance past its validFrom-era horizon", () => {
    const result = reconcileAt(MAX_HORIZON);
    const observedAtByIdentifier = new Map(
      ALL_FIXTURE_EVIDENCE.map((record) => [
        record.identifier,
        record.observedAt,
      ]),
    );
    for (const assertion of result.assertions) {
      const provenanceSet = new Set(assertion.provenance);
      for (const entry of assertion.ruleTrace) {
        for (const citedIdentifier of entry.evidenceIdentifiers) {
          expect(provenanceSet.has(citedIdentifier)).toBe(true);
        }
      }
      // No future-Evidence leakage anywhere: nothing observed after the
      // revision's own validFrom appears in its provenance.
      for (const evidenceIdentifier of assertion.provenance) {
        const observedAt = observedAtByIdentifier.get(evidenceIdentifier);
        expect(observedAt !== undefined).toBe(true);
        if (observedAt !== undefined) {
          expect(observedAt <= assertion.validity.validFrom).toBe(true);
        }
      }
    }
  });

  it("is deterministic under shuffled input order (replay invariant)", () => {
    const canonical = JSON.stringify(reconcileAt(MAX_HORIZON));
    const shuffles: Evidence[][] = [
      [...ALL_FIXTURE_EVIDENCE].reverse(),
      [...ALL_FIXTURE_EVIDENCE.slice(10), ...ALL_FIXTURE_EVIDENCE.slice(0, 10)],
    ];
    for (const shuffled of shuffles) {
      expect(JSON.stringify(reconcileAt(MAX_HORIZON, shuffled))).toBe(
        canonical,
      );
    }
  });

  it("returns identical output across repeated calls (byte identity)", () => {
    expect(JSON.stringify(reconcileAt(MAX_HORIZON))).toBe(
      JSON.stringify(reconcileAt(MAX_HORIZON)),
    );
  });

  it("never mutates caller-owned Evidence records or the input array", () => {
    const callerArray = ALL_FIXTURE_EVIDENCE.map((record) =>
      structuredClone(record),
    );
    const deepSnapshot = structuredClone(callerArray);
    reconcileEvidenceAtHorizon(
      callerArray,
      MAX_HORIZON,
      M1_V1_DERIVATION_POLICY,
    );
    expect(callerArray).toEqual(deepSnapshot);
  });

  it("rejects an invalid Evidence collection before any derivation", () => {
    const duplicateSequence = [
      buildEvidence(1, "a", "one", "service", "2026-01-01T00:00:00.000Z"),
      buildEvidence(1, "b", "two", "service", "2026-01-01T00:00:00.000Z"),
    ];
    expect(() =>
      reconcileEvidenceAtHorizon(duplicateSequence, 5, M1_V1_DERIVATION_POLICY),
    ).toThrow(TypeError);
  });

  it("rejects an invalid horizon loudly", () => {
    expect(() =>
      reconcileEvidenceAtHorizon(
        ALL_FIXTURE_EVIDENCE,
        0,
        M1_V1_DERIVATION_POLICY,
      ),
    ).toThrow(RangeError);
  });

  it("emits subjects and assertions in deterministic identifier order", () => {
    const result = reconcileAt(MAX_HORIZON);
    const subjectIdentifiers = result.subjects.map(
      (subject) => subject.identifier,
    );
    expect(subjectIdentifiers).toEqual([...subjectIdentifiers].sort());
    const assertionIdentifiers = result.assertions.map(
      (assertion) => assertion.identifier,
    );
    expect(assertionIdentifiers).toEqual([...assertionIdentifiers].sort());
  });

  it("omits the detail field from every rule-trace entry", () => {
    const result = reconcileAt(MAX_HORIZON);
    for (const assertion of result.assertions) {
      for (const entry of assertion.ruleTrace) {
        expect("detail" in entry).toBe(false);
      }
    }
  });
});
