/**
 * Rejection-first tests for the S2 read-result schemas: the bare-subject
 * ban (ADR-0014 subject visibility), mandatory freshness beside every
 * returned revision, the subject/assertion binding (every returned
 * revision's subjectIdentifier must be the containing subject's identifier
 * — ADR-0014/0019), resolved-identity metadata on every read, the
 * entity-only inventory shapes (ADR-0020 § 1 — a Relationship subject
 * cannot validate in an entity-inventory result), non-empty evidence
 * chains, and the snapshot-summary shape including its mandatory
 * schemaVersion (ADR-0017).
 */
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./schema-version.ts";
import {
  assertionDetailResultSchema,
  assertionReadResultSchema,
  entityPageSchema,
  entityReadResultSchema,
  evidenceChainResultSchema,
  snapshotSummarySchema,
  subjectDetailResultSchema,
  subjectPageSchema,
  subjectReadResultSchema,
  traversalResultSchema,
} from "./read-results.ts";

const VALID_ASSERTION_IDENTIFIER =
  "atlast:assertion:a3f5c9e12b8d4076fa1e5b09c27d83f4a6510e9dcb2478f30a1b5c6d7e8f9012";
const TRACE_EVIDENCE = "atlast:evidence:demo-company/traces/0001";

const validRevision = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  identifier: VALID_ASSERTION_IDENTIFIER,
  derivationVersion: "m1-v1",
  subjectIdentifier: "atlast:entity:service/checkout",
  claim: { claimKind: "entity", entityType: "service" },
  validity: { validFrom: "2026-07-23T00:00:00.000Z" },
  provenance: [TRACE_EVIDENCE],
  confidence: 0.5,
  ruleTrace: [
    {
      ruleName: "exact-normalized-key-match",
      evidenceIdentifiers: [TRACE_EVIDENCE],
    },
  ],
  conflictState: { status: "uncontested" },
  ambiguityState: { status: "unambiguous" },
} as const;

const validAssertionResult = {
  revision: validRevision,
  freshness: "current",
} as const;

const validSubjectResult = {
  subject: {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: "atlast:entity:service/checkout",
    subjectKind: "entity",
  },
  assertions: [validAssertionResult],
} as const;

const validMeta = {
  resolvedIdentity: {
    asOf: "2026-07-23T00:00:00.000Z",
    horizon: 42,
    derivationVersion: "m1-v1",
  },
  schemaVersion: CURRENT_SCHEMA_VERSION,
} as const;

const validEvidenceRecord = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  identifier: TRACE_EVIDENCE,
  observedAt: "2026-07-23T00:00:00.000Z",
  recordedAt: "2026-07-23T00:05:00.000Z",
  recordedSequence: 1,
  sourceScopedIdentity: {
    source: "synthetic-traces",
    sourceNativeId: "svc-checkout",
  },
  observation: { observationKind: "entity", entityType: "service" },
  detail: { spanCount: 12 },
} as const;

describe("assertionReadResultSchema", () => {
  it("accepts a revision paired with its freshness", () => {
    expect(
      assertionReadResultSchema.safeParse(validAssertionResult).success,
    ).toBe(true);
  });

  it("rejects a revision without freshness metadata", () => {
    expect(
      assertionReadResultSchema.safeParse({ revision: validRevision }).success,
    ).toBe(false);
  });

  it("rejects the reserved superseded state as freshness", () => {
    expect(
      assertionReadResultSchema.safeParse({
        revision: validRevision,
        freshness: "superseded",
      }).success,
    ).toBe(false);
  });

  it("rejects a revision missing provenance (S1 rule carried through)", () => {
    expect(
      assertionReadResultSchema.safeParse({
        revision: { ...validRevision, provenance: [] },
        freshness: "current",
      }).success,
    ).toBe(false);
  });
});

describe("subjectReadResultSchema", () => {
  it("accepts a subject with one supporting assertion", () => {
    expect(subjectReadResultSchema.safeParse(validSubjectResult).success).toBe(
      true,
    );
  });

  it("rejects a bare subject (empty assertions array)", () => {
    expect(
      subjectReadResultSchema.safeParse({
        ...validSubjectResult,
        assertions: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a subject result with no assertions field at all", () => {
    expect(
      subjectReadResultSchema.safeParse({
        subject: validSubjectResult.subject,
      }).success,
    ).toBe(false);
  });

  it("rejects a subject smuggling claim fields (identity-only rule)", () => {
    expect(
      subjectReadResultSchema.safeParse({
        ...validSubjectResult,
        subject: { ...validSubjectResult.subject, type: "service" },
      }).success,
    ).toBe(false);
  });

  it("rejects an otherwise-valid assertion belonging to a DIFFERENT entity subject", () => {
    // The foreign revision is individually valid (checked below) — only
    // its binding to the containing subject is wrong.
    const foreignEntityAssertion = {
      revision: {
        ...validRevision,
        subjectIdentifier: "atlast:entity:service/payments",
      },
      freshness: "current",
    } as const;
    expect(
      assertionReadResultSchema.safeParse(foreignEntityAssertion).success,
    ).toBe(true);
    const validation = subjectReadResultSchema.safeParse({
      ...validSubjectResult,
      assertions: [validAssertionResult, foreignEntityAssertion],
    });
    expect(validation.success).toBe(false);
    if (!validation.success) {
      // The issue path must name the exact mismatched assertion.
      expect(validation.error.issues).toHaveLength(1);
      expect(validation.error.issues[0]?.path).toStrictEqual([
        "assertions",
        1,
        "revision",
        "subjectIdentifier",
      ]);
      expect(validation.error.issues[0]?.message).toContain(
        "atlast:entity:service/payments",
      );
      expect(validation.error.issues[0]?.message).toContain(
        "atlast:entity:service/checkout",
      );
    }
  });

  it("rejects a relationship subject carrying an assertion about a different relationship", () => {
    const containingRelationshipIdentifier =
      "atlast:relationship:calls/checkout-to-payments";
    const foreignRelationshipIdentifier =
      "atlast:relationship:calls/web-to-checkout";
    const relationshipRevisionAbout = (subjectIdentifier: string) =>
      ({
        revision: {
          ...validRevision,
          identifier:
            "atlast:assertion:b4e6d0f23c9e5187fb2f6c10d38e94f5b7621f0edc3589f41b2c6d7e8f901234",
          subjectIdentifier,
          claim: {
            claimKind: "relationship",
            relationshipType: "calls",
            sourceEntityIdentifier: "atlast:entity:service/checkout",
            targetEntityIdentifier: "atlast:entity:service/payments",
          },
        },
        freshness: "current",
      }) as const;
    const relationshipSubject = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      identifier: containingRelationshipIdentifier,
      subjectKind: "relationship",
    } as const;
    // Matching identifiers validate…
    expect(
      subjectReadResultSchema.safeParse({
        subject: relationshipSubject,
        assertions: [
          relationshipRevisionAbout(containingRelationshipIdentifier),
        ],
      }).success,
    ).toBe(true);
    // …a foreign (but individually valid) relationship assertion does not.
    const validation = subjectReadResultSchema.safeParse({
      subject: relationshipSubject,
      assertions: [relationshipRevisionAbout(foreignRelationshipIdentifier)],
    });
    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.error.issues[0]?.path).toStrictEqual([
        "assertions",
        0,
        "revision",
        "subjectIdentifier",
      ]);
    }
  });
});

describe("subjectDetailResultSchema", () => {
  it("accepts a subject envelope with data and resolved metadata", () => {
    expect(
      subjectDetailResultSchema.safeParse({
        data: validSubjectResult,
        meta: validMeta,
      }).success,
    ).toBe(true);
  });

  it("rejects an envelope missing the resolved metadata", () => {
    expect(
      subjectDetailResultSchema.safeParse({ data: validSubjectResult }).success,
    ).toBe(false);
  });

  it("rejects an envelope whose metadata lacks schemaVersion", () => {
    expect(
      subjectDetailResultSchema.safeParse({
        data: validSubjectResult,
        meta: { resolvedIdentity: validMeta.resolvedIdentity },
      }).success,
    ).toBe(false);
  });

  it("rejects a bare subject inside the envelope", () => {
    expect(
      subjectDetailResultSchema.safeParse({
        data: { ...validSubjectResult, assertions: [] },
        meta: validMeta,
      }).success,
    ).toBe(false);
  });

  it("rejects snapshot identity smuggled into the subject itself", () => {
    expect(
      subjectDetailResultSchema.safeParse({
        data: {
          ...validSubjectResult,
          subject: {
            ...validSubjectResult.subject,
            resolvedIdentity: validMeta.resolvedIdentity,
          },
        },
        meta: validMeta,
      }).success,
    ).toBe(false);
  });
});

describe("assertionDetailResultSchema", () => {
  it("accepts an assertion envelope with data and resolved metadata", () => {
    expect(
      assertionDetailResultSchema.safeParse({
        data: validAssertionResult,
        meta: validMeta,
      }).success,
    ).toBe(true);
  });

  it("rejects an envelope missing the resolved metadata", () => {
    expect(
      assertionDetailResultSchema.safeParse({ data: validAssertionResult })
        .success,
    ).toBe(false);
  });

  it("rejects an envelope whose data lacks freshness", () => {
    expect(
      assertionDetailResultSchema.safeParse({
        data: { revision: validRevision },
        meta: validMeta,
      }).success,
    ).toBe(false);
  });

  it("rejects snapshot identity smuggled into the immutable revision", () => {
    expect(
      assertionDetailResultSchema.safeParse({
        data: {
          revision: {
            ...validRevision,
            resolvedIdentity: validMeta.resolvedIdentity,
          },
          freshness: "current",
        },
        meta: validMeta,
      }).success,
    ).toBe(false);
  });
});

describe("subjectPageSchema", () => {
  it("accepts a page with items, page metadata, and resolved identity", () => {
    expect(
      subjectPageSchema.safeParse({
        items: [validSubjectResult],
        page: { hasMore: false },
        meta: validMeta,
      }).success,
    ).toBe(true);
  });

  it("rejects a page missing the resolved identity metadata", () => {
    expect(
      subjectPageSchema.safeParse({
        items: [validSubjectResult],
        page: { hasMore: false },
      }).success,
    ).toBe(false);
  });

  it("rejects a page with a partial resolved identity", () => {
    expect(
      subjectPageSchema.safeParse({
        items: [validSubjectResult],
        page: { hasMore: false },
        meta: { resolvedIdentity: { asOf: "2026-07-23T00:00:00.000Z" } },
      }).success,
    ).toBe(false);
  });
});

describe("entityReadResultSchema and entityPageSchema (ADR-0020 § 1)", () => {
  const VALID_RELATIONSHIP_ASSERTION_IDENTIFIER =
    "atlast:assertion:b4e6d0f23c9e5187fb2f6c10d38e94f5b7621f0edc3589f41b2c6d7e8f901234";

  const validRelationshipSubjectResult = {
    subject: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      identifier: "atlast:relationship:calls/checkout-to-payments",
      subjectKind: "relationship",
    },
    assertions: [
      {
        revision: {
          ...validRevision,
          identifier: VALID_RELATIONSHIP_ASSERTION_IDENTIFIER,
          subjectIdentifier: "atlast:relationship:calls/checkout-to-payments",
          claim: {
            claimKind: "relationship",
            relationshipType: "calls",
            sourceEntityIdentifier: "atlast:entity:service/checkout",
            targetEntityIdentifier: "atlast:entity:service/payments",
          },
        },
        freshness: "current",
      },
    ],
  } as const;

  it("accepts an Entity with supporting assertions as an inventory item", () => {
    expect(entityReadResultSchema.safeParse(validSubjectResult).success).toBe(
      true,
    );
  });

  it("sanity: the relationship fixture is a valid general subject result", () => {
    // Guards the negative tests below against a malformed fixture passing
    // them vacuously: this shape must fail entity schemas because of its
    // KIND, not because it is invalid outright.
    expect(
      subjectReadResultSchema.safeParse(validRelationshipSubjectResult).success,
    ).toBe(true);
  });

  it("rejects a Relationship subject as an inventory item (inventory is entity-only)", () => {
    expect(
      entityReadResultSchema.safeParse(validRelationshipSubjectResult).success,
    ).toBe(false);
  });

  it("rejects a bare entity (empty assertions array)", () => {
    expect(
      entityReadResultSchema.safeParse({
        ...validSubjectResult,
        assertions: [],
      }).success,
    ).toBe(false);
  });

  it("rejects an inventory item whose assertion belongs to a different entity", () => {
    const foreignEntityAssertion = {
      revision: {
        ...validRevision,
        subjectIdentifier: "atlast:entity:service/payments",
      },
      freshness: "current",
    } as const;
    // Individually valid — the defect is the binding alone.
    expect(
      assertionReadResultSchema.safeParse(foreignEntityAssertion).success,
    ).toBe(true);
    const validation = entityReadResultSchema.safeParse({
      ...validSubjectResult,
      assertions: [foreignEntityAssertion],
    });
    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.error.issues[0]?.path).toStrictEqual([
        "assertions",
        0,
        "revision",
        "subjectIdentifier",
      ]);
    }
  });

  it("rejects an entity page containing an item with a foreign-subject assertion", () => {
    const validation = entityPageSchema.safeParse({
      items: [
        {
          ...validSubjectResult,
          assertions: [
            {
              revision: {
                ...validRevision,
                subjectIdentifier: "atlast:entity:service/payments",
              },
              freshness: "current",
            },
          ],
        },
      ],
      page: { hasMore: false },
      meta: validMeta,
    });
    expect(validation.success).toBe(false);
    if (!validation.success) {
      // The path pinpoints the mismatched assertion inside the page item.
      expect(validation.error.issues[0]?.path).toStrictEqual([
        "items",
        0,
        "assertions",
        0,
        "revision",
        "subjectIdentifier",
      ]);
    }
  });

  it("accepts an entity page with items, page metadata, and resolved identity", () => {
    expect(
      entityPageSchema.safeParse({
        items: [validSubjectResult],
        page: { hasMore: false },
        meta: validMeta,
      }).success,
    ).toBe(true);
  });

  it("rejects an entity page containing a Relationship subject", () => {
    expect(
      entityPageSchema.safeParse({
        items: [validSubjectResult, validRelationshipSubjectResult],
        page: { hasMore: false },
        meta: validMeta,
      }).success,
    ).toBe(false);
  });

  it("rejects an entity page missing the resolved identity metadata", () => {
    expect(
      entityPageSchema.safeParse({
        items: [validSubjectResult],
        page: { hasMore: false },
      }).success,
    ).toBe(false);
  });
});

describe("traversalResultSchema", () => {
  it("accepts a traversal result with visible truncation metadata", () => {
    expect(
      traversalResultSchema.safeParse({
        items: [validSubjectResult],
        traversal: { truncated: false, subjectCount: 1 },
        meta: validMeta,
      }).success,
    ).toBe(true);
  });

  it("rejects a traversal result without the truncation report", () => {
    expect(
      traversalResultSchema.safeParse({
        items: [validSubjectResult],
        meta: validMeta,
      }).success,
    ).toBe(false);
  });
});

describe("evidenceChainResultSchema", () => {
  it("accepts a non-empty chain with page and identity metadata", () => {
    expect(
      evidenceChainResultSchema.safeParse({
        items: [validEvidenceRecord],
        page: { hasMore: false },
        meta: validMeta,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty evidence chain for a visible subject", () => {
    expect(
      evidenceChainResultSchema.safeParse({
        items: [],
        page: { hasMore: false },
        meta: validMeta,
      }).success,
    ).toBe(false);
  });
});

describe("snapshotSummarySchema", () => {
  const validSummary = {
    identity: validMeta.resolvedIdentity,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    checksum:
      "a3f5c9e12b8d4076fa1e5b09c27d83f4a6510e9dcb2478f30a1b5c6d7e8f9012",
    subjectCount: 12,
  } as const;

  it("accepts a complete snapshot summary", () => {
    expect(snapshotSummarySchema.safeParse(validSummary).success).toBe(true);
  });

  it("rejects a summary missing schemaVersion (ADR-0017: every graph response carries it)", () => {
    const summaryWithoutVersion = {
      identity: validSummary.identity,
      checksum: validSummary.checksum,
      subjectCount: validSummary.subjectCount,
    };
    expect(snapshotSummarySchema.safeParse(summaryWithoutVersion).success).toBe(
      false,
    );
  });

  it.each([
    ["an unknown schema version", "atlast-domain-v2"],
    ["a malformed schema version", "not a version token"],
    ["a non-string schema version", 1],
  ])("rejects %s", (_description: string, invalidVersion: unknown) => {
    expect(
      snapshotSummarySchema.safeParse({
        ...validSummary,
        schemaVersion: invalidVersion,
      }).success,
    ).toBe(false);
  });

  it("rejects a summary with a partial identity", () => {
    expect(
      snapshotSummarySchema.safeParse({
        ...validSummary,
        identity: { asOf: "2026-07-23T00:00:00.000Z", horizon: 42 },
      }).success,
    ).toBe(false);
  });

  it.each([
    ["a 63-character checksum", validSummary.checksum.slice(1)],
    ["an uppercase checksum", validSummary.checksum.toUpperCase()],
    ["a non-hex checksum", `${validSummary.checksum.slice(0, 63)}g`],
  ])("rejects %s", (_description: string, malformedChecksum: string) => {
    expect(
      snapshotSummarySchema.safeParse({
        ...validSummary,
        checksum: malformedChecksum,
      }).success,
    ).toBe(false);
  });

  it("rejects a negative subject count", () => {
    expect(
      snapshotSummarySchema.safeParse({ ...validSummary, subjectCount: -1 })
        .success,
    ).toBe(false);
  });
});
