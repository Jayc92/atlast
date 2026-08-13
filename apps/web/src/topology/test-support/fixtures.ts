/**
 * Shared, minimal-but-schema-valid response builders for M2-B topology
 * tests. Not a `*.test.ts` file itself (Vitest's default include pattern
 * requires the literal `.test.` segment), so it is test-support infrastructure
 * only, mirroring `apps/api/src/test-support/`'s convention.
 */
import type {
  EntityPage,
  EntityReadResult,
  SnapshotIdentity,
  SubjectDetailResult,
  SubjectPage,
  SubjectReadResult,
  TraversalResult,
} from "@atlast/shared";

export const FIXTURE_IDENTITY: SnapshotIdentity = {
  asOf: "2026-08-12T00:00:00.000Z",
  horizon: 20,
  derivationVersion: "m1-v1",
};

export const FIXTURE_META = {
  resolvedIdentity: FIXTURE_IDENTITY,
  schemaVersion: "atlast-domain-v1",
} as const;

const FIXTURE_EVIDENCE_IDENTIFIER = "atlast:evidence:checkout/observation-1";
const FIXTURE_ASSERTION_DIGEST = "a".repeat(64);

export function buildEntityAssertionRevision(overrides: {
  readonly subjectIdentifier: string;
  readonly entityType: string;
  readonly assertionDigest?: string;
}): EntityReadResult["assertions"][number] {
  return {
    revision: {
      schemaVersion: "atlast-domain-v1",
      identifier: `atlast:assertion:${overrides.assertionDigest ?? FIXTURE_ASSERTION_DIGEST}`,
      derivationVersion: "m1-v1",
      subjectIdentifier: overrides.subjectIdentifier,
      claim: { claimKind: "entity", entityType: overrides.entityType },
      validity: { validFrom: "2026-08-01T00:00:00.000Z" },
      provenance: [FIXTURE_EVIDENCE_IDENTIFIER],
      confidence: 0.9,
      ruleTrace: [
        {
          ruleName: "corroborated-observation",
          evidenceIdentifiers: [FIXTURE_EVIDENCE_IDENTIFIER],
        },
      ],
      conflictState: { status: "uncontested" },
      ambiguityState: { status: "unambiguous" },
    },
    freshness: "current",
  };
}

export function buildEntityReadResult(overrides: {
  readonly identifier: string;
  readonly entityType: string;
}): EntityReadResult {
  return buildEntityReadResultWithClaims(overrides.identifier, [
    overrides.entityType,
  ]);
}

/**
 * Builds an entity with one distinct, uniquely content-addressed assertion
 * revision per supplied `entityType` — used to test honest multi-claim
 * presentation (never collapsed to a single "winner") without any test
 * needing a non-null assertion to reach into a fixed-shape array.
 */
export function buildEntityReadResultWithClaims(
  identifier: string,
  entityTypes: readonly string[],
): EntityReadResult {
  return {
    subject: {
      schemaVersion: "atlast-domain-v1",
      identifier,
      subjectKind: "entity",
    },
    assertions: entityTypes.map((entityType, index) =>
      buildEntityAssertionRevision({
        subjectIdentifier: identifier,
        entityType,
        assertionDigest: (index + 1).toString(16).padStart(64, "0"),
      }),
    ),
  };
}

export function buildEntityPage(
  items: readonly EntityReadResult[],
  page: { readonly hasMore?: boolean; readonly nextCursor?: string } = {},
): EntityPage {
  return {
    items: [...items],
    page: {
      hasMore: page.hasMore ?? false,
      ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
    },
    meta: FIXTURE_META,
  };
}

export function buildSubjectReadResult(overrides: {
  readonly identifier: string;
  readonly entityType: string;
}): SubjectReadResult {
  return buildEntityReadResult(overrides);
}

export function buildRelationshipSubjectReadResult(overrides: {
  readonly identifier: string;
  readonly relationshipType: string;
  readonly sourceEntityIdentifier: string;
  readonly targetEntityIdentifier: string;
}): SubjectReadResult {
  return {
    subject: {
      schemaVersion: "atlast-domain-v1",
      identifier: overrides.identifier,
      subjectKind: "relationship",
    },
    assertions: [
      {
        revision: {
          schemaVersion: "atlast-domain-v1",
          identifier: `atlast:assertion:${"b".repeat(64)}`,
          derivationVersion: "m1-v1",
          subjectIdentifier: overrides.identifier,
          claim: {
            claimKind: "relationship",
            relationshipType: overrides.relationshipType,
            sourceEntityIdentifier: overrides.sourceEntityIdentifier,
            targetEntityIdentifier: overrides.targetEntityIdentifier,
          },
          validity: { validFrom: "2026-08-01T00:00:00.000Z" },
          provenance: [FIXTURE_EVIDENCE_IDENTIFIER],
          confidence: 0.8,
          ruleTrace: [
            {
              ruleName: "corroborated-observation",
              evidenceIdentifiers: [FIXTURE_EVIDENCE_IDENTIFIER],
            },
          ],
          conflictState: { status: "uncontested" },
          ambiguityState: { status: "unambiguous" },
        },
        freshness: "current",
      },
    ],
  };
}

export function buildSubjectPage(
  items: readonly SubjectReadResult[],
  page: { readonly hasMore?: boolean; readonly nextCursor?: string } = {},
): SubjectPage {
  return {
    items: [...items],
    page: {
      hasMore: page.hasMore ?? false,
      ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
    },
    meta: FIXTURE_META,
  };
}

export function buildSubjectDetailResult(overrides: {
  readonly identifier: string;
  readonly entityType: string;
}): SubjectDetailResult {
  return {
    data: buildSubjectReadResult(overrides),
    meta: FIXTURE_META,
  };
}

export function buildTraversalResult(
  items: readonly SubjectReadResult[],
  truncated = false,
): TraversalResult {
  return {
    items: [...items],
    traversal: { truncated, subjectCount: items.length },
    meta: FIXTURE_META,
  };
}
