/**
 * Pure snapshot-construction tests (S6-C1, accepted ADR-0023 §§ 4–6, 9):
 * deterministic construction and input non-mutation, semantic horizon
 * validity (empty/below/above/between), unsupported derivation version,
 * exact half-open validity-boundary filtering, no bare subjects,
 * deterministic ordering, checksum reproduction and sensitivity,
 * subjectCount exclusion from the checksum payload, source/target
 * referential-integrity failures, identity-scoped isolation, and output
 * deep-freezing.
 */
import { describe, expect, it } from "vitest";
import type { Evidence } from "@atlast/shared";
import { sha256HexOfCanonicalJson } from "./canonical-digest.ts";
import { sortIdentifiers } from "./collection-order.ts";
import {
  InvalidReadCoordinateError,
  ReferentialIntegrityError,
} from "./repository-errors.ts";
import { buildSnapshot } from "./snapshot-construction.ts";

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

const CHECKOUT_EVIDENCE = buildEntityEvidence(
  1,
  "2026-01-01T00:00:00.000Z",
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

const VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE: readonly Evidence[] = [
  CHECKOUT_EVIDENCE,
  PAYMENTS_EVIDENCE,
  CHECKOUT_CALLS_PAYMENTS_EVIDENCE,
];

const IDENTITY_AT_HORIZON_3 = {
  asOf: "2026-06-01T00:00:00.000Z",
  horizon: 3,
  derivationVersion: "m1-v1",
} as const;

describe("buildSnapshot — deterministic construction and input non-mutation", () => {
  it("produces byte-identical checksum and subjectCount across repeated calls over equal input", () => {
    const first = buildSnapshot(
      VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE,
      IDENTITY_AT_HORIZON_3,
    );
    const second = buildSnapshot(
      [...VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE],
      { ...IDENTITY_AT_HORIZON_3 },
    );
    expect(first.checksum).toBe(second.checksum);
    expect(first.subjectCount).toBe(second.subjectCount);
  });

  it("does not mutate or freeze the caller's Evidence array or its records", () => {
    const callerArray = [
      structuredClone(CHECKOUT_EVIDENCE),
      structuredClone(PAYMENTS_EVIDENCE),
      structuredClone(CHECKOUT_CALLS_PAYMENTS_EVIDENCE),
    ];
    const snapshotBefore = structuredClone(callerArray);
    buildSnapshot(callerArray, IDENTITY_AT_HORIZON_3);
    expect(callerArray).toEqual(snapshotBefore);
    expect(Object.isFrozen(callerArray)).toBe(false);
    expect(Object.isFrozen(callerArray[0])).toBe(false);
  });
});

describe("buildSnapshot — semantic horizon validity (ADR-0023 § 5)", () => {
  it("rejects an empty Evidence collection with EMPTY_EVIDENCE_STORE", () => {
    let caught: unknown;
    try {
      buildSnapshot([], IDENTITY_AT_HORIZON_3);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.code).toBe("INVALID_READ_COORDINATE");
    expect(error.reason).toBe("EMPTY_EVIDENCE_STORE");
    expect(error.firstRecordedSequence).toBeUndefined();
    expect(error.currentWatermark).toBeUndefined();
  });

  it("rejects a horizon below firstRecordedSequence with exact bounds", () => {
    const evidence = [
      buildEntityEvidence(
        5,
        "2026-01-01T00:00:00.000Z",
        "deployment-inventory",
        "checkout",
        "service",
      ),
      buildEntityEvidence(
        8,
        "2026-01-02T00:00:00.000Z",
        "deployment-inventory",
        "payments",
        "service",
      ),
    ];
    let caught: unknown;
    try {
      buildSnapshot(evidence, { ...IDENTITY_AT_HORIZON_3, horizon: 4 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("HORIZON_BEFORE_FIRST_EVIDENCE");
    expect(error.firstRecordedSequence).toBe(5);
    expect(error.currentWatermark).toBe(8);
  });

  it("rejects a horizon above currentWatermark with exact bounds", () => {
    const evidence = [
      buildEntityEvidence(
        5,
        "2026-01-01T00:00:00.000Z",
        "deployment-inventory",
        "checkout",
        "service",
      ),
      buildEntityEvidence(
        8,
        "2026-01-02T00:00:00.000Z",
        "deployment-inventory",
        "payments",
        "service",
      ),
    ];
    let caught: unknown;
    try {
      buildSnapshot(evidence, { ...IDENTITY_AT_HORIZON_3, horizon: 9 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("HORIZON_AFTER_CURRENT_WATERMARK");
    expect(error.firstRecordedSequence).toBe(5);
    expect(error.currentWatermark).toBe(8);
  });

  it("succeeds for a horizon strictly between retained sequences", () => {
    const evidence = [
      buildEntityEvidence(
        5,
        "2026-01-01T00:00:00.000Z",
        "deployment-inventory",
        "checkout",
        "service",
      ),
      buildEntityEvidence(
        10,
        "2026-01-05T00:00:00.000Z",
        "deployment-inventory",
        "payments",
        "service",
      ),
    ];
    // Horizon 7 matches no stored record's exact sequence but lies strictly
    // between the retained sequences 5 and 10.
    const snapshot = buildSnapshot(evidence, {
      ...IDENTITY_AT_HORIZON_3,
      horizon: 7,
    });
    expect(snapshot.subjects.map((view) => view.subject.identifier)).toEqual([
      "atlast:entity:checkout",
    ]);
  });
});

describe("buildSnapshot — unsupported derivation version", () => {
  it("rejects a derivationVersion other than m1-v1, including the m1-v2 fixture seed", () => {
    let caught: unknown;
    try {
      buildSnapshot(VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE, {
        ...IDENTITY_AT_HORIZON_3,
        derivationVersion: "m1-v2",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("UNSUPPORTED_DERIVATION_VERSION");
    expect(error.unsupportedDerivationVersion).toBe("m1-v2");
  });
});

describe("buildSnapshot — validity filtering at exact half-open boundaries", () => {
  it("excludes an assertion whose validFrom is exactly the requested asOf plus 1ms (not yet open)", () => {
    const snapshotJustBefore = buildSnapshot(
      VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE,
      { ...IDENTITY_AT_HORIZON_3, asOf: "2026-01-02T23:59:59.999Z" },
    );
    // At this asOf, "payments" (validFrom 2026-01-02T00:00:00.000Z) is open,
    // but the relationship (validFrom 2026-01-03T00:00:00.000Z) is not yet.
    expect(
      snapshotJustBefore.subjects.map((view) => view.subject.identifier),
    ).toEqual(["atlast:entity:checkout", "atlast:entity:payments"]);
  });

  it("includes an assertion at the exact instant its validFrom opens", () => {
    const snapshotAtOpen = buildSnapshot(
      VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE,
      { ...IDENTITY_AT_HORIZON_3, asOf: "2026-01-03T00:00:00.000Z" },
    );
    expect(
      snapshotAtOpen.subjects.map((view) => view.subject.identifier),
    ).toEqual([
      "atlast:entity:checkout",
      "atlast:entity:payments",
      "atlast:relationship:checkout-payment-call",
    ]);
  });

  it("excludes every assertion at an asOf before any retained Evidence's validity opens (valid empty snapshot)", () => {
    const snapshot = buildSnapshot(VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE, {
      ...IDENTITY_AT_HORIZON_3,
      asOf: "2025-12-31T00:00:00.000Z",
    });
    expect(snapshot.subjects).toEqual([]);
    expect(snapshot.subjectCount).toBe(0);
  });
});

describe("buildSnapshot — no bare subjects", () => {
  it("never includes a subject with zero visible assertions", () => {
    // At this asOf only "checkout" is open; "payments" and the relationship
    // are not — proving a subject absent from the visible assertion set
    // never rides along bare.
    const snapshot = buildSnapshot(VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE, {
      ...IDENTITY_AT_HORIZON_3,
      asOf: "2026-01-01T12:00:00.000Z",
    });
    expect(snapshot.subjects).toHaveLength(1);
    expect(snapshot.subjects[0]?.subject.identifier).toBe(
      "atlast:entity:checkout",
    );
    for (const subjectView of snapshot.subjects) {
      expect(subjectView.assertions.length).toBeGreaterThan(0);
    }
  });
});

describe("buildSnapshot — deterministic subject/assertion ordering", () => {
  it("returns subjects sorted by subject identifier regardless of Evidence append order", () => {
    const scrambled = [
      CHECKOUT_CALLS_PAYMENTS_EVIDENCE,
      PAYMENTS_EVIDENCE,
      CHECKOUT_EVIDENCE,
    ];
    const snapshot = buildSnapshot(scrambled, IDENTITY_AT_HORIZON_3);
    expect(snapshot.subjects.map((view) => view.subject.identifier)).toEqual([
      "atlast:entity:checkout",
      "atlast:entity:payments",
      "atlast:relationship:checkout-payment-call",
    ]);
  });

  it("returns each subject's assertions sorted by assertion identifier", () => {
    const snapshot = buildSnapshot(
      VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE,
      IDENTITY_AT_HORIZON_3,
    );
    for (const subjectView of snapshot.subjects) {
      const identifiers = subjectView.assertions.map(
        (assertion) => assertion.identifier,
      );
      expect(identifiers).toEqual(sortIdentifiers(identifiers));
    }
  });
});

describe("buildSnapshot — checksum reproduction and sensitivity", () => {
  it("reproduces the exact ADR-0023 § 4 payload checksum", () => {
    const snapshot = buildSnapshot(
      VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE,
      IDENTITY_AT_HORIZON_3,
    );
    const visibleAssertionIdentifiers = sortIdentifiers(
      snapshot.subjects.flatMap((view) =>
        view.assertions.map((assertion) => assertion.identifier),
      ),
    );
    const expectedChecksum = sha256HexOfCanonicalJson({
      derivationVersion: IDENTITY_AT_HORIZON_3.derivationVersion,
      asOf: IDENTITY_AT_HORIZON_3.asOf,
      horizon: IDENTITY_AT_HORIZON_3.horizon,
      visibleAssertionIdentifiers,
    });
    expect(snapshot.checksum).toBe(expectedChecksum);
  });

  it("changes the checksum when the visible assertion identifier set changes (different asOf)", () => {
    const snapshotAll = buildSnapshot(
      VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE,
      IDENTITY_AT_HORIZON_3,
    );
    const snapshotFewer = buildSnapshot(
      VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE,
      { ...IDENTITY_AT_HORIZON_3, asOf: "2026-01-01T12:00:00.000Z" },
    );
    expect(snapshotAll.checksum).not.toBe(snapshotFewer.checksum);
  });

  it("changes the checksum when only derivationVersion would differ (proven at the pure builder level per ADR-0023 § 3)", () => {
    const evidence = [CHECKOUT_EVIDENCE];
    const snapshot = buildSnapshot(evidence, {
      ...IDENTITY_AT_HORIZON_3,
      horizon: 1,
    });
    const checksumWithDifferentVersion = sha256HexOfCanonicalJson({
      derivationVersion: "m1-v2",
      asOf: IDENTITY_AT_HORIZON_3.asOf,
      horizon: 1,
      visibleAssertionIdentifiers: sortIdentifiers(
        snapshot.subjects.flatMap((view) =>
          view.assertions.map((assertion) => assertion.identifier),
        ),
      ),
    });
    expect(checksumWithDifferentVersion).not.toBe(snapshot.checksum);
  });
});

describe("buildSnapshot — subjectCount excluded from checksum input", () => {
  it("two snapshots with the same visible assertions but constructed independently report equal subjectCount without it affecting the checksum", () => {
    const first = buildSnapshot(
      VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE,
      IDENTITY_AT_HORIZON_3,
    );
    const second = buildSnapshot(
      [...VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE].reverse(),
      IDENTITY_AT_HORIZON_3,
    );
    expect(first.subjectCount).toBe(3);
    expect(second.subjectCount).toBe(3);
    expect(first.checksum).toBe(second.checksum);

    // Confirm the checksum payload itself never names subjectCount: the
    // exact same visible-assertion-identifier set with a different
    // (impossible-in-practice) subjectCount must still produce this digest.
    const expectedChecksum = sha256HexOfCanonicalJson({
      derivationVersion: IDENTITY_AT_HORIZON_3.derivationVersion,
      asOf: IDENTITY_AT_HORIZON_3.asOf,
      horizon: IDENTITY_AT_HORIZON_3.horizon,
      visibleAssertionIdentifiers: sortIdentifiers(
        first.subjects.flatMap((view) =>
          view.assertions.map((assertion) => assertion.identifier),
        ),
      ),
    });
    expect(first.checksum).toBe(expectedChecksum);
  });
});

describe("buildSnapshot — referential-integrity failures", () => {
  it("rejects a visible relationship whose source endpoint never resolves to a visible entity assertion", () => {
    const relationshipOnly = buildRelationshipEvidence(
      1,
      "2026-01-01T00:00:00.000Z",
      "trace-index",
      "checkout-payment-call",
      "calls",
      "checkout",
      "payments",
    );
    let caught: unknown;
    try {
      buildSnapshot([relationshipOnly], {
        ...IDENTITY_AT_HORIZON_3,
        horizon: 1,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReferentialIntegrityError);
    const error = caught as ReferentialIntegrityError;
    expect(error.code).toBe("REFERENTIAL_INTEGRITY");
    expect(error.endpointRole).toBe("source");
    expect(error.endpointIdentifier).toBe("atlast:entity:checkout");
    // Assertion identifiers are content-addressed digests, not subject
    // identifiers — assert the form and that it names the relationship
    // revision's own content address, not a fixed literal.
    expect(error.assertionIdentifier).toMatch(
      /^atlast:assertion:[0-9a-f]{64}$/,
    );
    expect(error.resolvedIdentity).toEqual({
      ...IDENTITY_AT_HORIZON_3,
      horizon: 1,
    });
  });

  it("rejects a visible relationship whose target endpoint never resolves to a visible entity assertion", () => {
    const sourceOnlyEntity = buildEntityEvidence(
      1,
      "2026-01-01T00:00:00.000Z",
      "deployment-inventory",
      "checkout",
      "service",
    );
    const relationship = buildRelationshipEvidence(
      2,
      "2026-01-02T00:00:00.000Z",
      "trace-index",
      "checkout-payment-call",
      "calls",
      "checkout",
      "payments",
    );
    let caught: unknown;
    try {
      buildSnapshot([sourceOnlyEntity, relationship], {
        ...IDENTITY_AT_HORIZON_3,
        horizon: 2,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReferentialIntegrityError);
    const error = caught as ReferentialIntegrityError;
    expect(error.endpointRole).toBe("target");
    expect(error.endpointIdentifier).toBe("atlast:entity:payments");
  });
});

describe("buildSnapshot — identity-scoped integrity behavior", () => {
  it("a violation at one asOf does not poison a different asOf at the same horizon where the endpoint is not yet visible", () => {
    const relationshipOnly = buildRelationshipEvidence(
      1,
      "2026-02-01T00:00:00.000Z",
      "trace-index",
      "checkout-payment-call",
      "calls",
      "checkout",
      "payments",
    );
    // Before the relationship's own validity opens, it is not visible, so no
    // relationship claim exists to check — this identity succeeds on its
    // own facts even though a later asOf at the same horizon would fail.
    const earlierAsOfIdentity = {
      asOf: "2026-01-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;
    const snapshot = buildSnapshot([relationshipOnly], earlierAsOfIdentity);
    expect(snapshot.subjects).toEqual([]);

    const laterAsOfIdentity = {
      asOf: "2026-03-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;
    expect(() => buildSnapshot([relationshipOnly], laterAsOfIdentity)).toThrow(
      ReferentialIntegrityError,
    );
  });

  it("a violation at one horizon does not poison a later horizon where additional Evidence resolves the endpoint", () => {
    const relationshipOnly = buildRelationshipEvidence(
      1,
      "2026-01-01T00:00:00.000Z",
      "trace-index",
      "checkout-payment-call",
      "calls",
      "checkout",
      "payments",
    );
    const bothEntities = [
      relationshipOnly,
      buildEntityEvidence(
        2,
        "2026-01-01T00:00:00.000Z",
        "deployment-inventory",
        "checkout",
        "service",
      ),
      buildEntityEvidence(
        3,
        "2026-01-01T00:00:00.000Z",
        "deployment-inventory",
        "payments",
        "service",
      ),
    ];
    const identityAtHorizon1 = {
      asOf: "2026-06-01T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;
    expect(() => buildSnapshot(bothEntities, identityAtHorizon1)).toThrow(
      ReferentialIntegrityError,
    );

    const identityAtHorizon3 = { ...identityAtHorizon1, horizon: 3 };
    const snapshot = buildSnapshot(bothEntities, identityAtHorizon3);
    expect(snapshot.subjects.map((view) => view.subject.identifier)).toEqual([
      "atlast:entity:checkout",
      "atlast:entity:payments",
      "atlast:relationship:checkout-payment-call",
    ]);
  });
});

describe("buildSnapshot — returned snapshot deeply frozen", () => {
  it("freezes the snapshot, its subjects array, each subject view, and each assertion", () => {
    const snapshot = buildSnapshot(
      VALID_TWO_ENTITY_ONE_RELATIONSHIP_EVIDENCE,
      IDENTITY_AT_HORIZON_3,
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.subjects)).toBe(true);
    expect(Object.isFrozen(snapshot.identity)).toBe(true);
    for (const subjectView of snapshot.subjects) {
      expect(Object.isFrozen(subjectView)).toBe(true);
      expect(Object.isFrozen(subjectView.subject)).toBe(true);
      expect(Object.isFrozen(subjectView.assertions)).toBe(true);
      for (const assertion of subjectView.assertions) {
        expect(Object.isFrozen(assertion)).toBe(true);
      }
    }
    expect(() => {
      (snapshot as { subjectCount: number }).subjectCount = 999;
    }).toThrow(TypeError);
  });
});
