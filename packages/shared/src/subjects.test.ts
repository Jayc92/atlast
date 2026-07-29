/**
 * Subject-purity tests per ADR-0019 § 1 and its invariant 1: subjects
 * validate exactly {schemaVersion, identifier, subjectKind} and reject any
 * claim-bearing field. The rejection cases are the point — a subject that
 * quietly absorbed a `type` field would reintroduce the silent-winner
 * defect ADR-0019 exists to make unrepresentable.
 */
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./schema-version.ts";
import {
  entitySubjectSchema,
  graphSubjectSchema,
  relationshipSubjectSchema,
} from "./subjects.ts";

const validEntitySubject = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  identifier: "atlast:entity:service/checkout",
  subjectKind: "entity",
} as const;

const validRelationshipSubject = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  identifier: "atlast:relationship:checkout-calls-payments",
  subjectKind: "relationship",
} as const;

describe("entitySubjectSchema", () => {
  it("accepts an identity-only entity subject", () => {
    expect(entitySubjectSchema.safeParse(validEntitySubject).success).toBe(
      true,
    );
  });

  it("rejects an unknown schemaVersion", () => {
    expect(
      entitySubjectSchema.safeParse({
        ...validEntitySubject,
        schemaVersion: "atlast-domain-v0",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["an entity type", { type: "service" }],
    ["an entityType field", { entityType: "service" }],
    ["ownership", { owner: "team-payments" }],
    ["provenance", { provenance: ["atlast:evidence:demo-company/x"] }],
    ["a freshness field", { freshness: "current" }],
    ["any unauthorized extra field", { annotation: "hand-written" }],
  ])(
    "rejects a subject carrying %s (strict object)",
    (_description: string, extraFields: Record<string, unknown>) => {
      expect(
        entitySubjectSchema.safeParse({
          ...validEntitySubject,
          ...extraFields,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a relationship identifier on an entity subject", () => {
    expect(
      entitySubjectSchema.safeParse({
        ...validEntitySubject,
        identifier: "atlast:relationship:checkout-calls-payments",
      }).success,
    ).toBe(false);
  });

  it("rejects the wrong subjectKind literal", () => {
    expect(
      entitySubjectSchema.safeParse({
        ...validEntitySubject,
        subjectKind: "relationship",
      }).success,
    ).toBe(false);
  });
});

describe("relationshipSubjectSchema", () => {
  it("accepts an identity-only relationship subject", () => {
    expect(
      relationshipSubjectSchema.safeParse(validRelationshipSubject).success,
    ).toBe(true);
  });

  it.each([
    ["a relationship type", { type: "calls" }],
    ["a relationshipType field", { relationshipType: "calls" }],
    [
      "endpoints",
      {
        sourceEntityIdentifier: "atlast:entity:checkout",
        targetEntityIdentifier: "atlast:entity:payments",
      },
    ],
    ["an endpoints array", { endpoints: ["atlast:entity:checkout"] }],
  ])(
    "rejects a subject carrying %s (endpoint facts live in claims)",
    (_description: string, extraFields: Record<string, unknown>) => {
      expect(
        relationshipSubjectSchema.safeParse({
          ...validRelationshipSubject,
          ...extraFields,
        }).success,
      ).toBe(false);
    },
  );
});

describe("graphSubjectSchema", () => {
  it("discriminates both subject kinds", () => {
    expect(graphSubjectSchema.safeParse(validEntitySubject).success).toBe(true);
    expect(graphSubjectSchema.safeParse(validRelationshipSubject).success).toBe(
      true,
    );
  });

  it("rejects a mismatched kind/identifier pairing", () => {
    expect(
      graphSubjectSchema.safeParse({
        ...validEntitySubject,
        subjectKind: "relationship",
      }).success,
    ).toBe(false);
  });
});
