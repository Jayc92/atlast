import {
  CURRENT_SCHEMA_VERSION,
  impactResultSchema,
  traversalResultSchema,
  type EntityIdentifier,
  type SubjectReadResult,
  type TraversalDirection,
  type TraversalResult,
} from "@atlast/shared";
import { describe, expect, it } from "vitest";
import { ImpactEngineInputError } from "./errors.ts";
import { computeImpact, type ComputeImpactInput } from "./impact-engine.ts";

const AS_OF = "2026-04-20T12:00:00.000Z" as const;

function entityIdentifier(slug: string): EntityIdentifier {
  return `atlast:entity:${slug}`;
}

function assertionIdentifier(index: number): `atlast:assertion:${string}` {
  return `atlast:assertion:${index.toString(16).padStart(64, "0")}`;
}

function entityItem(slug: string, index: number): SubjectReadResult {
  const identifier = entityIdentifier(slug);
  return {
    subject: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      identifier,
      subjectKind: "entity",
    },
    assertions: [
      {
        revision: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          identifier: assertionIdentifier(index),
          derivationVersion: "m1-v1",
          subjectIdentifier: identifier,
          claim: { claimKind: "entity", entityType: "service" },
          validity: { validFrom: "2026-04-01T00:00:00.000Z" },
          provenance: [
            `atlast:evidence:demo-company/architecture-feed/${String(index).padStart(4, "0")}`,
          ],
          confidence: 0.5,
          ruleTrace: [
            {
              ruleName: "normalized-exact-match",
              evidenceIdentifiers: [
                `atlast:evidence:demo-company/architecture-feed/${String(index).padStart(4, "0")}`,
              ],
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

interface RelationshipOptions {
  readonly confidence?: number;
  readonly assertionIndex?: number;
  readonly competingTarget?: string;
}

function relationshipItem(
  slug: string,
  sourceSlug: string,
  targetSlug: string,
  options: RelationshipOptions = {},
): SubjectReadResult {
  const relationshipIdentifier = `atlast:relationship:${slug}` as const;
  const index = options.assertionIndex ?? 50;
  const evidenceIdentifier =
    `atlast:evidence:demo-company/architecture-feed/${String(index).padStart(4, "0")}` as const;
  const competingClaims =
    options.competingTarget === undefined
      ? undefined
      : [
          {
            claim: {
              claimKind: "relationship" as const,
              relationshipType: "calls",
              sourceEntityIdentifier: entityIdentifier(sourceSlug),
              targetEntityIdentifier: entityIdentifier(options.competingTarget),
            },
            provenance: [evidenceIdentifier],
            confidence: 1,
          },
        ];
  return {
    subject: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      identifier: relationshipIdentifier,
      subjectKind: "relationship",
    },
    assertions: [
      {
        revision: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          identifier: assertionIdentifier(index),
          derivationVersion: "m1-v1",
          subjectIdentifier: relationshipIdentifier,
          claim: {
            claimKind: "relationship",
            relationshipType: "calls",
            sourceEntityIdentifier: entityIdentifier(sourceSlug),
            targetEntityIdentifier: entityIdentifier(targetSlug),
          },
          validity: { validFrom: "2026-04-01T00:00:00.000Z" },
          provenance: [evidenceIdentifier],
          confidence: options.confidence ?? 1,
          ruleTrace: [
            {
              ruleName: "normalized-exact-match",
              evidenceIdentifiers: [evidenceIdentifier],
            },
          ],
          conflictState:
            competingClaims === undefined
              ? { status: "uncontested" }
              : { status: "conflicted", competingClaims },
          ambiguityState: { status: "unambiguous" },
        },
        freshness: "current",
      },
    ],
  };
}

function traversal(
  items: readonly SubjectReadResult[],
  truncated = false,
): TraversalResult {
  return traversalResultSchema.parse({
    items,
    traversal: { truncated, subjectCount: items.length },
    meta: {
      resolvedIdentity: {
        asOf: AS_OF,
        horizon: 20,
        derivationVersion: "m1-v1",
      },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
  });
}

interface ImpactInputOptions {
  readonly origin?: string;
  readonly items?: readonly SubjectReadResult[];
  readonly direction?: TraversalDirection;
  readonly minimumConfidence?: number;
  readonly truncated?: boolean;
}

function input(options: ImpactInputOptions = {}): ComputeImpactInput {
  return {
    originEntityIdentifier: entityIdentifier(options.origin ?? "checkout"),
    bounds: {
      direction: options.direction ?? "downstream",
      depth: 3,
      minimumConfidence: options.minimumConfidence ?? 0,
    },
    traversal: traversal(options.items ?? [], options.truncated),
  };
}

describe("computeImpact", () => {
  it("returns an empty, non-error result set for an origin with no eligible edges", () => {
    const result = computeImpact(input());
    expect(result.results).toEqual([]);
  });

  it("ranks a single reachable Entity by its one path's confidence", () => {
    const result = computeImpact(
      input({
        items: [
          entityItem("fulfillment", 1),
          relationshipItem(
            "checkout-calls-fulfillment",
            "checkout",
            "fulfillment",
            {
              confidence: 0.7,
              assertionIndex: 2,
            },
          ),
        ],
      }),
    );
    expect(result.results).toEqual([
      {
        entityIdentifier: "atlast:entity:fulfillment",
        rankScore: 0.7,
        pathEdgeCount: 1,
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:checkout",
            targetEntityIdentifier: "atlast:entity:fulfillment",
            relationshipIdentifier:
              "atlast:relationship:checkout-calls-fulfillment",
            assertionIdentifier: assertionIdentifier(2),
          },
        ],
      },
    ]);
    expect(impactResultSchema.safeParse(result.results[0]).success).toBe(true);
  });

  it("filters each relationship revision by the requested confidence floor", () => {
    const result = computeImpact(
      input({
        items: [
          entityItem("fulfillment", 1),
          relationshipItem(
            "checkout-calls-fulfillment",
            "checkout",
            "fulfillment",
            {
              confidence: 0.5,
            },
          ),
        ],
        minimumConfidence: 0.8,
      }),
    );
    expect(result.results).toEqual([]);
  });

  it("never expands beyond the supplied bounded traversal scope", () => {
    const result = computeImpact(
      input({
        items: [
          entityItem("middle", 1),
          relationshipItem("checkout-middle", "checkout", "middle", {
            assertionIndex: 2,
          }),
          // "distant" is not in traversal.items, so this edge's target is
          // out of scope and must be excluded entirely, not just unranked.
          relationshipItem("middle-distant", "middle", "distant", {
            assertionIndex: 3,
          }),
        ],
      }),
    );
    expect(result.results.map((entry) => entry.entityIdentifier)).toEqual([
      "atlast:entity:middle",
    ]);
  });

  it("never traverses nested competing claims", () => {
    const result = computeImpact(
      input({
        items: [
          entityItem("safe", 1),
          relationshipItem("checkout-safe", "checkout", "safe", {
            competingTarget: "bad",
          }),
        ],
      }),
    );
    expect(result.results.map((entry) => entry.entityIdentifier)).toEqual([
      "atlast:entity:safe",
    ]);
  });

  it("resolves departure/arrival from the claim's actual direction under the requested traversal direction", () => {
    const edge = relationshipItem(
      "checkout-calls-fulfillment",
      "checkout",
      "fulfillment",
      { confidence: 0.6 },
    );
    const downstream = computeImpact(
      input({
        items: [entityItem("fulfillment", 1), edge],
        origin: "checkout",
      }),
    );
    expect(downstream.results.map((entry) => entry.entityIdentifier)).toEqual([
      "atlast:entity:fulfillment",
    ]);

    const upstream = computeImpact(
      input({
        items: [entityItem("checkout", 1), edge],
        origin: "fulfillment",
        direction: "upstream",
      }),
    );
    expect(upstream.results.map((entry) => entry.entityIdentifier)).toEqual([
      "atlast:entity:checkout",
    ]);
    expect(upstream.results[0]).toMatchObject({
      path: [
        {
          sourceEntityIdentifier: "atlast:entity:checkout",
          targetEntityIdentifier: "atlast:entity:fulfillment",
        },
      ],
    });
  });

  it("rejects duplicate origin/traversal Entity identifiers", () => {
    expect(() =>
      computeImpact(input({ items: [entityItem("checkout", 1)] })),
    ).toThrow(ImpactEngineInputError);
  });

  it("is deterministic across traversal item permutations and returns frozen, isolated output", () => {
    const items = [
      entityItem("fulfillment", 1),
      relationshipItem(
        "checkout-calls-fulfillment",
        "checkout",
        "fulfillment",
        {
          confidence: 0.6,
        },
      ),
    ];
    const base = input({ items });
    const first = computeImpact(base);
    const second = computeImpact({
      ...base,
      traversal: traversal([...items].reverse()),
    });
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.results)).toBe(true);
    expect(Object.isFrozen(first.results[0])).toBe(true);
    expect(Object.isFrozen(first.results[0]?.path)).toBe(true);
    expect(() => (first.results as unknown as unknown[]).push({})).toThrow(
      TypeError,
    );
    expect(base.traversal.items).toHaveLength(2);
  });

  it("propagates the traversal's own subject data verbatim into path evidence, without a second read", () => {
    const result = computeImpact(
      input({
        items: [
          entityItem("fulfillment", 9),
          relationshipItem(
            "checkout-calls-fulfillment",
            "checkout",
            "fulfillment",
            {
              assertionIndex: 42,
            },
          ),
        ],
      }),
    );
    expect(result.results[0]?.path[0]?.assertionIdentifier).toBe(
      assertionIdentifier(42),
    );
  });
});
