/**
 * Evidence schema tests (ADR-0014, ADR-0016): the safe-integer
 * recordedSequence boundary (accept 1 and 2^53 − 1; reject zero, negatives,
 * fractions, 2^53, duplicates) is the exact coverage docs/m1-plan.md § 8
 * names for S1, plus the normalized observation union and collection-level
 * uniqueness of both recordedSequence and Evidence identifiers. Collection
 * validation is pure data validation — no storage is read.
 */
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./schema-version.ts";
import {
  entityObservationSchema,
  evidenceCollectionSchema,
  evidenceSchema,
  observationSchema,
  recordedSequenceSchema,
  relationshipObservationSchema,
  sourceScopedIdentitySchema,
} from "./evidence.ts";

const validEntityObservation = {
  observationKind: "entity",
  entityType: "service",
} as const;

const validRelationshipObservation = {
  observationKind: "relationship",
  relationshipType: "calls",
  sourceEntityIdentity: {
    source: "synthetic-traces",
    sourceNativeId: "svc-checkout",
  },
  targetEntityIdentity: {
    source: "synthetic-traces",
    sourceNativeId: "svc-payments",
  },
} as const;

/** A fully valid Evidence document to mutate per test. */
const validEvidenceDocument = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  identifier: "atlast:evidence:demo-company/traces/0001",
  observedAt: "2026-07-23T00:00:00.000Z",
  recordedAt: "2026-07-23T00:05:00.000Z",
  recordedSequence: 1,
  sourceScopedIdentity: {
    source: "synthetic-traces",
    sourceNativeId: "svc-checkout",
  },
  observation: validEntityObservation,
  detail: {
    spanCount: 12,
    peerService: "payments",
    attributes: ["http", "grpc"],
    nested: { sampled: true, reason: null },
  },
} as const;

describe("recordedSequenceSchema", () => {
  it("accepts the lower bound 1", () => {
    expect(recordedSequenceSchema.safeParse(1).success).toBe(true);
  });

  it("accepts exactly Number.MAX_SAFE_INTEGER (2^53 − 1)", () => {
    expect(
      recordedSequenceSchema.safeParse(Number.MAX_SAFE_INTEGER).success,
    ).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["a negative integer", -1],
    ["a fractional value", 1.5],
    ["2^53 (above the safe-integer bound)", 2 ** 53],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
  ])("rejects %s", (_description: string, invalidSequence: number) => {
    expect(recordedSequenceSchema.safeParse(invalidSequence).success).toBe(
      false,
    );
  });

  it("rejects a numeric string", () => {
    expect(recordedSequenceSchema.safeParse("1").success).toBe(false);
  });
});

describe("sourceScopedIdentitySchema", () => {
  it("accepts a well-formed source-scoped identity", () => {
    expect(
      sourceScopedIdentitySchema.safeParse({
        source: "synthetic-traces",
        sourceNativeId: "svc-checkout",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty sourceNativeId", () => {
    expect(
      sourceScopedIdentitySchema.safeParse({
        source: "synthetic-traces",
        sourceNativeId: "",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-kebab-case source name", () => {
    expect(
      sourceScopedIdentitySchema.safeParse({
        source: "Synthetic Traces",
        sourceNativeId: "svc-checkout",
      }).success,
    ).toBe(false);
  });
});

describe("observationSchema", () => {
  it("accepts an entity observation", () => {
    expect(observationSchema.safeParse(validEntityObservation).success).toBe(
      true,
    );
  });

  it("accepts a relationship observation with source-scoped endpoints", () => {
    expect(
      observationSchema.safeParse(validRelationshipObservation).success,
    ).toBe(true);
  });

  it("rejects an unknown observationKind", () => {
    expect(
      observationSchema.safeParse({
        observationKind: "overlay",
        entityType: "service",
      }).success,
    ).toBe(false);
  });

  it("rejects endpoint fields on an entity observation (strict object)", () => {
    expect(
      entityObservationSchema.safeParse({
        ...validEntityObservation,
        sourceEntityIdentity: {
          source: "synthetic-traces",
          sourceNativeId: "svc-checkout",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a relationship observation missing an endpoint", () => {
    const withoutTarget: Record<string, unknown> = {
      ...validRelationshipObservation,
    };
    delete withoutTarget["targetEntityIdentity"];
    expect(relationshipObservationSchema.safeParse(withoutTarget).success).toBe(
      false,
    );
  });

  it("rejects a stable Atlast Entity identifier as an endpoint (endpoints are source-scoped)", () => {
    expect(
      relationshipObservationSchema.safeParse({
        ...validRelationshipObservation,
        sourceEntityIdentity: "atlast:entity:service/checkout",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-kebab-case relationship type", () => {
    expect(
      relationshipObservationSchema.safeParse({
        ...validRelationshipObservation,
        relationshipType: "Reads From",
      }).success,
    ).toBe(false);
  });
});

describe("evidenceSchema", () => {
  it("accepts a fully valid entity-observation Evidence document", () => {
    expect(evidenceSchema.safeParse(validEvidenceDocument).success).toBe(true);
  });

  it("accepts a fully valid relationship-observation Evidence document", () => {
    expect(
      evidenceSchema.safeParse({
        ...validEvidenceDocument,
        observation: validRelationshipObservation,
      }).success,
    ).toBe(true);
  });

  it("rejects a document without an observation", () => {
    const withoutObservation: Record<string, unknown> = {
      ...validEvidenceDocument,
    };
    delete withoutObservation["observation"];
    expect(evidenceSchema.safeParse(withoutObservation).success).toBe(false);
  });

  it("rejects an unknown schemaVersion", () => {
    expect(
      evidenceSchema.safeParse({
        ...validEvidenceDocument,
        schemaVersion: "atlast-domain-v2",
      }).success,
    ).toBe(false);
  });

  it("rejects an extra field (strict object)", () => {
    expect(
      evidenceSchema.safeParse({
        ...validEvidenceDocument,
        connectorConfig: { endpoint: "https://example.invalid" },
      }).success,
    ).toBe(false);
  });

  it("rejects a non-Evidence identifier namespace", () => {
    expect(
      evidenceSchema.safeParse({
        ...validEvidenceDocument,
        identifier: "atlast:entity:checkout",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed observedAt timestamp", () => {
    expect(
      evidenceSchema.safeParse({
        ...validEvidenceDocument,
        observedAt: "2026-07-23T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects non-JSON-safe detail (NaN)", () => {
    expect(
      evidenceSchema.safeParse({
        ...validEvidenceDocument,
        detail: { latencyMilliseconds: Number.NaN },
      }).success,
    ).toBe(false);
  });
});

describe("evidenceCollectionSchema", () => {
  it("accepts a collection with unique sequences and identifiers", () => {
    const collection = [
      validEvidenceDocument,
      {
        ...validEvidenceDocument,
        identifier: "atlast:evidence:demo-company/traces/0002",
        recordedSequence: 2,
      },
    ];
    expect(evidenceCollectionSchema.safeParse(collection).success).toBe(true);
  });

  it("rejects duplicate recordedSequence values and points at the duplicate", () => {
    const collection = [
      validEvidenceDocument,
      {
        ...validEvidenceDocument,
        identifier: "atlast:evidence:demo-company/traces/0002",
        recordedSequence: 1,
      },
    ];
    const parseResult = evidenceCollectionSchema.safeParse(collection);
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      expect(parseResult.error.issues[0]?.path).toStrictEqual([
        1,
        "recordedSequence",
      ]);
    }
  });

  it("rejects duplicate Evidence identifiers at the second record's identifier path", () => {
    const collection = [
      validEvidenceDocument,
      {
        ...validEvidenceDocument,
        recordedSequence: 2,
      },
    ];
    const parseResult = evidenceCollectionSchema.safeParse(collection);
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      expect(parseResult.error.issues[0]?.path).toStrictEqual([
        1,
        "identifier",
      ]);
    }
  });

  it("reports both duplicate kinds when a record repeats sequence and identifier", () => {
    const parseResult = evidenceCollectionSchema.safeParse([
      validEvidenceDocument,
      validEvidenceDocument,
    ]);
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const issuePaths = parseResult.error.issues.map((issue) => issue.path);
      expect(issuePaths).toContainEqual([1, "recordedSequence"]);
      expect(issuePaths).toContainEqual([1, "identifier"]);
    }
  });

  it("accepts an empty collection (nothing to collide)", () => {
    expect(evidenceCollectionSchema.safeParse([]).success).toBe(true);
  });
});
