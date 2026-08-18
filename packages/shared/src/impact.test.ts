import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./schema-version.ts";
import {
  impactChangeTypeSchema,
  impactResultEnvelopeSchema,
  impactResultSchema,
} from "./impact.ts";

const assertionIdentifier =
  "atlast:assertion:a3f5c9e12b8d4076fa1e5b09c27d83f4a6510e9dcb2478f30a1b5c6d7e8f9012";
const relationshipIdentifier = "atlast:relationship:checkout-calls-fulfillment";

const validPathStep = {
  sourceEntityIdentifier: "atlast:entity:checkout",
  targetEntityIdentifier: "atlast:entity:fulfillment",
  relationshipIdentifier,
  assertionIdentifier,
} as const;

const validSubjectResult = {
  subject: {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: "atlast:entity:fulfillment",
    subjectKind: "entity",
  },
  assertions: [
    {
      revision: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        identifier: assertionIdentifier,
        derivationVersion: "m1-v1",
        subjectIdentifier: "atlast:entity:fulfillment",
        claim: { claimKind: "entity", entityType: "service" },
        validity: { validFrom: "2026-04-01T00:00:00.000Z" },
        provenance: ["atlast:evidence:demo-company/architecture-feed/0001"],
        confidence: 0.5,
        ruleTrace: [
          {
            ruleName: "normalized-exact-match",
            evidenceIdentifiers: [
              "atlast:evidence:demo-company/architecture-feed/0001",
            ],
          },
        ],
        conflictState: { status: "uncontested" },
        ambiguityState: { status: "unambiguous" },
      },
      freshness: "current",
    },
  ],
} as const;

function result(
  overrides: Partial<{
    entityIdentifier: string;
    rankScore: number;
    pathEdgeCount: number;
    path: readonly (typeof validPathStep)[];
  }> = {},
) {
  return {
    entityIdentifier: overrides.entityIdentifier ?? "atlast:entity:fulfillment",
    rankScore: overrides.rankScore ?? 0.7,
    pathEdgeCount: overrides.pathEdgeCount ?? 1,
    path: overrides.path ?? [validPathStep],
  };
}

function envelope(
  results: readonly ReturnType<typeof result>[],
  overrides: { originEntityIdentifier?: string } = {},
) {
  return {
    data: {
      originEntityIdentifier:
        overrides.originEntityIdentifier ?? "atlast:entity:checkout",
      changeType: "removal",
      items: [validSubjectResult],
      results,
    },
    traversal: { truncated: false, subjectCount: 1 },
    meta: {
      resolvedIdentity: {
        asOf: "2026-04-20T12:00:00.000Z",
        horizon: 20,
        derivationVersion: "m1-v1",
      },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
  };
}

describe("impact contracts", () => {
  it("accepts exactly the three closed change types and rejects any other token", () => {
    for (const changeType of ["removal", "degradation", "interface-change"]) {
      expect(impactChangeTypeSchema.safeParse(changeType).success).toBe(true);
    }
    expect(impactChangeTypeSchema.safeParse("upgrade").success).toBe(false);
    expect(impactChangeTypeSchema.safeParse("").success).toBe(false);
  });

  it("accepts a well-formed impact result and rejects an empty path", () => {
    expect(impactResultSchema.safeParse(result()).success).toBe(true);
    expect(impactResultSchema.safeParse(result({ path: [] })).success).toBe(
      false,
    );
  });

  it("rejects a rank score outside [0, 1]", () => {
    expect(
      impactResultSchema.safeParse(result({ rankScore: 1.01 })).success,
    ).toBe(false);
    expect(
      impactResultSchema.safeParse(result({ rankScore: -0.01 })).success,
    ).toBe(false);
    expect(impactResultSchema.safeParse(result({ rankScore: 0 })).success).toBe(
      true,
    );
    expect(impactResultSchema.safeParse(result({ rankScore: 1 })).success).toBe(
      true,
    );
  });

  it("rejects pathEdgeCount disagreeing with path.length", () => {
    expect(
      impactResultSchema.safeParse(result({ pathEdgeCount: 2 })).success,
    ).toBe(false);
    expect(
      impactResultSchema.safeParse(result({ pathEdgeCount: 0 })).success,
    ).toBe(false);
  });

  it("validates the complete impact response envelope strictly", () => {
    expect(
      impactResultEnvelopeSchema.safeParse(envelope([result()])).success,
    ).toBe(true);
    expect(
      impactResultEnvelopeSchema.safeParse({
        ...envelope([result()]),
        data: { ...envelope([result()]).data, extra: "unexpected" },
      }).success,
    ).toBe(false);
  });

  it("rejects a result naming the origin Entity", () => {
    expect(
      impactResultEnvelopeSchema.safeParse(
        envelope([result({ entityIdentifier: "atlast:entity:checkout" })]),
      ).success,
    ).toBe(false);
  });

  it("rejects a duplicate Entity across results", () => {
    expect(
      impactResultEnvelopeSchema.safeParse(envelope([result(), result()]))
        .success,
    ).toBe(false);
  });

  it("rejects results out of order by rank score, then path edge count, then identifier", () => {
    const high = result({
      entityIdentifier: "atlast:entity:alpha",
      rankScore: 0.9,
    });
    const low = result({
      entityIdentifier: "atlast:entity:zulu",
      rankScore: 0.5,
    });
    expect(
      impactResultEnvelopeSchema.safeParse(envelope([high, low])).success,
    ).toBe(true);
    expect(
      impactResultEnvelopeSchema.safeParse(envelope([low, high])).success,
    ).toBe(false);

    const shortPath = result({
      entityIdentifier: "atlast:entity:alpha",
      rankScore: 0.7,
      pathEdgeCount: 1,
    });
    const longPath = result({
      entityIdentifier: "atlast:entity:zulu",
      rankScore: 0.7,
      pathEdgeCount: 2,
      path: [validPathStep, validPathStep],
    });
    expect(
      impactResultEnvelopeSchema.safeParse(envelope([shortPath, longPath]))
        .success,
    ).toBe(true);
    expect(
      impactResultEnvelopeSchema.safeParse(envelope([longPath, shortPath]))
        .success,
    ).toBe(false);

    const alpha = result({
      entityIdentifier: "atlast:entity:alpha",
      rankScore: 0.7,
      pathEdgeCount: 1,
    });
    const zulu = result({
      entityIdentifier: "atlast:entity:zulu",
      rankScore: 0.7,
      pathEdgeCount: 1,
    });
    expect(
      impactResultEnvelopeSchema.safeParse(envelope([alpha, zulu])).success,
    ).toBe(true);
    expect(
      impactResultEnvelopeSchema.safeParse(envelope([zulu, alpha])).success,
    ).toBe(false);
  });

  it("accepts an empty results array as a valid, non-error outcome", () => {
    expect(impactResultEnvelopeSchema.safeParse(envelope([])).success).toBe(
      true,
    );
  });
});
