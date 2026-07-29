/**
 * GraphAssertion revision tests (ADR-0014 as amended by ADR-0019):
 * non-empty provenance (invariant 1), bounded confidence, evidence-linked
 * rule traces, half-open validity, explicit conflict/ambiguity structures
 * with per-claim confidence and no winner, claim/subject kind matching
 * (ADR-0019 invariant 2) extended to competing claims and near-matches,
 * and the structural ban on stored freshness — freshness is query-time
 * response data, never revision state.
 */
import { describe, expect, it } from "vitest";
import {
  ambiguityStateSchema,
  competingClaimSchema,
  confidenceSchema,
  conflictStateSchema,
  graphAssertionSchema,
  provenanceSchema,
  ruleTraceSchema,
  validityIntervalSchema,
} from "./assertions.ts";
import { CURRENT_SCHEMA_VERSION } from "./schema-version.ts";

const VALID_ASSERTION_IDENTIFIER =
  "atlast:assertion:a3f5c9e12b8d4076fa1e5b09c27d83f4a6510e9dcb2478f30a1b5c6d7e8f9012";

const TRACE_EVIDENCE = "atlast:evidence:demo-company/traces/0001";
const CONFIG_EVIDENCE = "atlast:evidence:demo-company/config/0001";
const CONFLICTING_EVIDENCE = "atlast:evidence:demo-company/config/0002";

/** A fully valid entity-classification assertion revision. */
const validEntityAssertion = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  identifier: VALID_ASSERTION_IDENTIFIER,
  derivationVersion: "m1-v1",
  subjectIdentifier: "atlast:entity:service/checkout",
  claim: { claimKind: "entity", entityType: "service" },
  validity: { validFrom: "2026-07-23T00:00:00.000Z" },
  provenance: [TRACE_EVIDENCE, CONFIG_EVIDENCE],
  confidence: 0.7,
  ruleTrace: [
    {
      ruleName: "exact-normalized-key-match",
      evidenceIdentifiers: [TRACE_EVIDENCE, CONFIG_EVIDENCE],
      detail: "both sources normalize to service/checkout",
    },
  ],
  conflictState: { status: "uncontested" },
  ambiguityState: { status: "unambiguous" },
} as const;

/** A fully valid relationship assertion revision. */
const validRelationshipAssertion = {
  ...validEntityAssertion,
  subjectIdentifier: "atlast:relationship:checkout-calls-payments",
  claim: {
    claimKind: "relationship",
    relationshipType: "calls",
    sourceEntityIdentifier: "atlast:entity:service/checkout",
    targetEntityIdentifier: "atlast:entity:service/payments",
  },
} as const;

const entityCompetingClaim = {
  claim: { claimKind: "entity", entityType: "database" },
  provenance: [CONFLICTING_EVIDENCE],
  confidence: 0.5,
} as const;

const relationshipCompetingClaim = {
  claim: {
    claimKind: "relationship",
    relationshipType: "reads-from",
    sourceEntityIdentifier: "atlast:entity:service/checkout",
    targetEntityIdentifier: "atlast:entity:service/payments",
  },
  provenance: [CONFLICTING_EVIDENCE],
  confidence: 0.5,
} as const;

describe("provenanceSchema", () => {
  it("accepts a non-empty set of Evidence identifiers", () => {
    expect(provenanceSchema.safeParse([TRACE_EVIDENCE]).success).toBe(true);
  });

  it("rejects an empty provenance set (no evidence, no fact)", () => {
    expect(provenanceSchema.safeParse([]).success).toBe(false);
  });

  it("rejects duplicate Evidence identifiers", () => {
    expect(
      provenanceSchema.safeParse([TRACE_EVIDENCE, TRACE_EVIDENCE]).success,
    ).toBe(false);
  });

  it("rejects non-Evidence identifiers", () => {
    expect(provenanceSchema.safeParse(["atlast:entity:checkout"]).success).toBe(
      false,
    );
  });
});

describe("confidenceSchema", () => {
  it.each([0, 0.5, 1])("accepts %d", (validConfidence: number) => {
    expect(confidenceSchema.safeParse(validConfidence).success).toBe(true);
  });

  it.each([
    ["below the range", -0.01],
    ["above the range", 1.01],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects %s", (_description: string, invalidConfidence: number) => {
    expect(confidenceSchema.safeParse(invalidConfidence).success).toBe(false);
  });
});

describe("validityIntervalSchema", () => {
  it("accepts an open interval (validTo omitted)", () => {
    expect(
      validityIntervalSchema.safeParse({
        validFrom: "2026-07-23T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts a closed interval with validTo after validFrom", () => {
    expect(
      validityIntervalSchema.safeParse({
        validFrom: "2026-07-23T00:00:00.000Z",
        validTo: "2026-07-24T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects validTo equal to validFrom (empty half-open interval)", () => {
    expect(
      validityIntervalSchema.safeParse({
        validFrom: "2026-07-23T00:00:00.000Z",
        validTo: "2026-07-23T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects a reversed interval", () => {
    expect(
      validityIntervalSchema.safeParse({
        validFrom: "2026-07-24T00:00:00.000Z",
        validTo: "2026-07-23T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed validFrom", () => {
    expect(
      validityIntervalSchema.safeParse({
        validFrom: "2026-07-23T00:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("ruleTraceSchema", () => {
  it("accepts a trace of named, evidence-citing rule applications", () => {
    expect(
      ruleTraceSchema.safeParse([
        {
          ruleName: "exact-normalized-key-match",
          evidenceIdentifiers: [TRACE_EVIDENCE],
        },
        {
          ruleName: "alias-table-hit",
          evidenceIdentifiers: [CONFIG_EVIDENCE],
          detail: "policy alias checkout",
        },
      ]).success,
    ).toBe(true);
  });

  it("rejects an empty rule trace (unexplained assertions are defects)", () => {
    expect(ruleTraceSchema.safeParse([]).success).toBe(false);
  });

  it("rejects an entry citing no Evidence", () => {
    expect(
      ruleTraceSchema.safeParse([
        {
          ruleName: "exact-normalized-key-match",
          evidenceIdentifiers: [],
        },
      ]).success,
    ).toBe(false);
  });

  it("rejects an entry citing the same Evidence twice", () => {
    expect(
      ruleTraceSchema.safeParse([
        {
          ruleName: "exact-normalized-key-match",
          evidenceIdentifiers: [TRACE_EVIDENCE, TRACE_EVIDENCE],
        },
      ]).success,
    ).toBe(false);
  });

  it("rejects an entry with a missing evidenceIdentifiers field", () => {
    expect(
      ruleTraceSchema.safeParse([{ ruleName: "exact-normalized-key-match" }])
        .success,
    ).toBe(false);
  });

  it("rejects an entry with an empty detail string", () => {
    expect(
      ruleTraceSchema.safeParse([
        {
          ruleName: "exact-normalized-key-match",
          evidenceIdentifiers: [TRACE_EVIDENCE],
          detail: "",
        },
      ]).success,
    ).toBe(false);
  });
});

describe("competingClaimSchema", () => {
  it("accepts a claim with provenance and per-claim confidence", () => {
    expect(competingClaimSchema.safeParse(entityCompetingClaim).success).toBe(
      true,
    );
  });

  it("rejects a competing claim without confidence", () => {
    const withoutConfidence: Record<string, unknown> = {
      ...entityCompetingClaim,
    };
    delete withoutConfidence["confidence"];
    expect(competingClaimSchema.safeParse(withoutConfidence).success).toBe(
      false,
    );
  });

  it("rejects a competing claim with empty provenance", () => {
    expect(
      competingClaimSchema.safeParse({
        ...entityCompetingClaim,
        provenance: [],
      }).success,
    ).toBe(false);
  });

  it("rejects an out-of-range per-claim confidence", () => {
    expect(
      competingClaimSchema.safeParse({
        ...entityCompetingClaim,
        confidence: 1.5,
      }).success,
    ).toBe(false);
  });
});

describe("conflictStateSchema", () => {
  it("accepts the explicit uncontested state", () => {
    expect(
      conflictStateSchema.safeParse({ status: "uncontested" }).success,
    ).toBe(true);
  });

  it("accepts a conflicted state holding competing claims", () => {
    expect(
      conflictStateSchema.safeParse({
        status: "conflicted",
        competingClaims: [entityCompetingClaim],
      }).success,
    ).toBe(true);
  });

  it("rejects a conflicted state with no competing claims", () => {
    expect(
      conflictStateSchema.safeParse({
        status: "conflicted",
        competingClaims: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a winner-selection field (no silent winners, structurally)", () => {
    expect(
      conflictStateSchema.safeParse({
        status: "conflicted",
        winningClaim: { claimKind: "entity", entityType: "service" },
        competingClaims: [entityCompetingClaim],
      }).success,
    ).toBe(false);
  });
});

describe("ambiguityStateSchema", () => {
  it("accepts the explicit unambiguous state", () => {
    expect(
      ambiguityStateSchema.safeParse({ status: "unambiguous" }).success,
    ).toBe(true);
  });

  it("accepts an ambiguous state referencing its near-match", () => {
    expect(
      ambiguityStateSchema.safeParse({
        status: "ambiguous",
        nearMatches: [
          {
            nearMatchSubjectIdentifier: "atlast:entity:service/check-out",
            reason: "keys match only after the weak affix-strip rule",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects an ambiguous state without near-matches", () => {
    expect(
      ambiguityStateSchema.safeParse({
        status: "ambiguous",
        nearMatches: [],
      }).success,
    ).toBe(false);
  });
});

describe("graphAssertionSchema", () => {
  it("accepts a valid entity assertion revision", () => {
    expect(graphAssertionSchema.safeParse(validEntityAssertion).success).toBe(
      true,
    );
  });

  it("accepts a valid relationship assertion revision", () => {
    expect(
      graphAssertionSchema.safeParse(validRelationshipAssertion).success,
    ).toBe(true);
  });

  it("rejects an unknown schemaVersion", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        schemaVersion: "atlast-domain-v9",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed content-address digest", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        identifier: "atlast:assertion:not-a-digest",
      }).success,
    ).toBe(false);
  });

  it("rejects an entity claim about a relationship subject (kind mismatch)", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        subjectIdentifier: "atlast:relationship:checkout-calls-payments",
      }).success,
    ).toBe(false);
  });

  it("rejects a relationship claim about an entity subject (kind mismatch)", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validRelationshipAssertion,
        subjectIdentifier: "atlast:entity:service/checkout",
      }).success,
    ).toBe(false);
  });

  it("accepts a conflicted entity assertion whose competing claims are entity claims", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        conflictState: {
          status: "conflicted",
          competingClaims: [entityCompetingClaim],
        },
      }).success,
    ).toBe(true);
  });

  it("rejects a relationship competing claim on an entity assertion", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        conflictState: {
          status: "conflicted",
          competingClaims: [relationshipCompetingClaim],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an entity competing claim on a relationship assertion", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validRelationshipAssertion,
        conflictState: {
          status: "conflicted",
          competingClaims: [entityCompetingClaim],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts an entity near-match on an ambiguous entity assertion", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        ambiguityState: {
          status: "ambiguous",
          nearMatches: [
            {
              nearMatchSubjectIdentifier: "atlast:entity:service/check-out",
              reason: "keys match only after the weak affix-strip rule",
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("rejects a relationship near-match on an entity assertion", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        ambiguityState: {
          status: "ambiguous",
          nearMatches: [
            {
              nearMatchSubjectIdentifier:
                "atlast:relationship:checkout-calls-payments",
              reason: "kind mismatch should be rejected",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an entity near-match on a relationship assertion", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validRelationshipAssertion,
        ambiguityState: {
          status: "ambiguous",
          nearMatches: [
            {
              nearMatchSubjectIdentifier: "atlast:entity:service/checkout",
              reason: "kind mismatch should be rejected",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a rule-trace citation outside the assertion's provenance", () => {
    const parseResult = graphAssertionSchema.safeParse({
      ...validEntityAssertion,
      ruleTrace: [
        {
          ruleName: "exact-normalized-key-match",
          evidenceIdentifiers: [
            TRACE_EVIDENCE,
            "atlast:evidence:demo-company/traces/9999",
          ],
        },
      ],
    });
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      expect(parseResult.error.issues[0]?.path).toStrictEqual([
        "ruleTrace",
        0,
        "evidenceIdentifiers",
        1,
      ]);
    }
  });

  it("rejects empty provenance on a revision", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        provenance: [],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty rule trace on a revision", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        ruleTrace: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a stored freshness field (freshness is query-time data)", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        freshness: "current",
      }).success,
    ).toBe(false);
  });

  it("rejects any other unauthorized extra field (strict object)", () => {
    expect(
      graphAssertionSchema.safeParse({
        ...validEntityAssertion,
        staleness: "stale",
      }).success,
    ).toBe(false);
  });
});
