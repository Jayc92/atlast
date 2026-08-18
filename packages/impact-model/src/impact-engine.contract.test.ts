/**
 * ADR-0035 § 3 engine contract-test suite: hand-authored, immutable
 * `TraversalResult` inputs proving multi-path selection, every widest-path
 * tie-break stage, cycle safety, both-direction path orientation, and
 * `traversal.truncated: true` honesty — the shapes the small retained
 * `demo-company` fixture catalog cannot reliably exercise end-to-end.
 * These are deterministic unit/contract inputs, not Evidence and not
 * additions to the M1 fixture catalog.
 */
import {
  CURRENT_SCHEMA_VERSION,
  traversalResultSchema,
  type EntityIdentifier,
  type SubjectReadResult,
  type TraversalDirection,
  type TraversalResult,
} from "@atlast/shared";
import { describe, expect, it } from "vitest";
import { computeImpact, type ComputeImpactInput } from "./impact-engine.ts";

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

function relationshipItem(
  slug: string,
  sourceSlug: string,
  targetSlug: string,
  confidence: number,
  assertionIndex: number,
): SubjectReadResult {
  const relationshipIdentifier = `atlast:relationship:${slug}` as const;
  const evidenceIdentifier =
    `atlast:evidence:demo-company/architecture-feed/${String(assertionIndex).padStart(4, "0")}` as const;
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
          identifier: assertionIdentifier(assertionIndex),
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
          confidence,
          ruleTrace: [
            {
              ruleName: "normalized-exact-match",
              evidenceIdentifiers: [evidenceIdentifier],
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

function traversal(
  items: readonly SubjectReadResult[],
  truncated = false,
): TraversalResult {
  return traversalResultSchema.parse({
    items,
    traversal: { truncated, subjectCount: items.length },
    meta: {
      resolvedIdentity: {
        asOf: "2026-04-20T12:00:00.000Z",
        horizon: 20,
        derivationVersion: "m1-v1",
      },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
  });
}

function input(
  origin: string,
  items: readonly SubjectReadResult[],
  direction: TraversalDirection = "downstream",
  truncated = false,
): ComputeImpactInput {
  return {
    originEntityIdentifier: entityIdentifier(origin),
    bounds: { direction, depth: 5, minimumConfidence: 0 },
    traversal: traversal(items, truncated),
  };
}

describe("computeImpact — ADR-0035 § 3 engine contract suite", () => {
  it("prefers the higher-bottleneck path over a shorter, weaker one (multi-path, tie-break stage 1)", () => {
    const result = computeImpact(
      input("checkout", [
        entityItem("mid", 1),
        entityItem("target", 2),
        relationshipItem(
          "checkout-target-direct",
          "checkout",
          "target",
          0.3,
          3,
        ),
        relationshipItem("checkout-mid", "checkout", "mid", 0.9, 4),
        relationshipItem("mid-target", "mid", "target", 0.9, 5),
      ]),
    );
    expect(result.results).toEqual([
      {
        entityIdentifier: "atlast:entity:mid",
        rankScore: 0.9,
        pathEdgeCount: 1,
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:checkout",
            targetEntityIdentifier: "atlast:entity:mid",
            relationshipIdentifier: "atlast:relationship:checkout-mid",
            assertionIdentifier: assertionIdentifier(4),
          },
        ],
      },
      {
        entityIdentifier: "atlast:entity:target",
        rankScore: 0.9,
        pathEdgeCount: 2,
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:checkout",
            targetEntityIdentifier: "atlast:entity:mid",
            relationshipIdentifier: "atlast:relationship:checkout-mid",
            assertionIdentifier: assertionIdentifier(4),
          },
          {
            sourceEntityIdentifier: "atlast:entity:mid",
            targetEntityIdentifier: "atlast:entity:target",
            relationshipIdentifier: "atlast:relationship:mid-target",
            assertionIdentifier: assertionIdentifier(5),
          },
        ],
      },
    ]);
  });

  it("prefers fewer edges once bottleneck confidence ties (tie-break stage 2)", () => {
    const result = computeImpact(
      input("checkout", [
        entityItem("mid", 1),
        entityItem("target", 2),
        relationshipItem(
          "checkout-target-direct",
          "checkout",
          "target",
          0.6,
          3,
        ),
        relationshipItem("checkout-mid", "checkout", "mid", 0.9, 4),
        relationshipItem("mid-target", "mid", "target", 0.6, 5),
      ]),
    );
    const target = result.results.find(
      (entry) => entry.entityIdentifier === "atlast:entity:target",
    );
    expect(target).toEqual({
      entityIdentifier: "atlast:entity:target",
      rankScore: 0.6,
      pathEdgeCount: 1,
      path: [
        {
          sourceEntityIdentifier: "atlast:entity:checkout",
          targetEntityIdentifier: "atlast:entity:target",
          relationshipIdentifier: "atlast:relationship:checkout-target-direct",
          assertionIdentifier: assertionIdentifier(3),
        },
      ],
    });
  });

  it("uses the lexicographic step-tuple order as the final tie-break (tie-break stage 3)", () => {
    const result = computeImpact(
      input("checkout", [
        entityItem("target", 1),
        relationshipItem("zulu-edge", "checkout", "target", 0.8, 2),
        relationshipItem("alpha-edge", "checkout", "target", 0.8, 3),
      ]),
    );
    expect(result.results).toEqual([
      {
        entityIdentifier: "atlast:entity:target",
        rankScore: 0.8,
        pathEdgeCount: 1,
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:checkout",
            targetEntityIdentifier: "atlast:entity:target",
            relationshipIdentifier: "atlast:relationship:alpha-edge",
            assertionIdentifier: assertionIdentifier(3),
          },
        ],
      },
    ]);
  });

  it("is cycle-safe: terminates, never ranks the origin, and never amplifies or duplicates a destination", () => {
    const result = computeImpact(
      input("checkout", [
        entityItem("mid", 1),
        entityItem("target", 2),
        relationshipItem("checkout-mid", "checkout", "mid", 0.8, 3),
        relationshipItem("mid-checkout", "mid", "checkout", 0.8, 4),
        relationshipItem("mid-target", "mid", "target", 0.8, 5),
      ]),
    );
    const identifiers = result.results.map((entry) => entry.entityIdentifier);
    expect(identifiers).toEqual(["atlast:entity:mid", "atlast:entity:target"]);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(identifiers).not.toContain("atlast:entity:checkout");
  });

  it("preserves canonical claim orientation in origin-outward walk order under both directions", () => {
    const items = [
      entityItem("b", 1),
      entityItem("c", 6),
      relationshipItem("a-calls-b", "a", "b", 0.9, 2),
      relationshipItem("b-calls-c", "b", "c", 0.9, 3),
    ];

    const downstream = computeImpact(input("a", items, "downstream"));
    expect(downstream.results).toEqual([
      {
        entityIdentifier: "atlast:entity:b",
        rankScore: 0.9,
        pathEdgeCount: 1,
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:a",
            targetEntityIdentifier: "atlast:entity:b",
            relationshipIdentifier: "atlast:relationship:a-calls-b",
            assertionIdentifier: assertionIdentifier(2),
          },
        ],
      },
      {
        entityIdentifier: "atlast:entity:c",
        rankScore: 0.9,
        pathEdgeCount: 2,
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:a",
            targetEntityIdentifier: "atlast:entity:b",
            relationshipIdentifier: "atlast:relationship:a-calls-b",
            assertionIdentifier: assertionIdentifier(2),
          },
          {
            sourceEntityIdentifier: "atlast:entity:b",
            targetEntityIdentifier: "atlast:entity:c",
            relationshipIdentifier: "atlast:relationship:b-calls-c",
            assertionIdentifier: assertionIdentifier(3),
          },
        ],
      },
    ]);

    const itemsForUpstream = [
      entityItem("b", 1),
      entityItem("a", 4),
      relationshipItem("a-calls-b", "a", "b", 0.9, 2),
      relationshipItem("b-calls-c", "b", "c", 0.9, 3),
    ];
    const upstream = computeImpact(input("c", itemsForUpstream, "upstream"));
    expect(upstream.results).toEqual([
      {
        entityIdentifier: "atlast:entity:b",
        rankScore: 0.9,
        pathEdgeCount: 1,
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:b",
            targetEntityIdentifier: "atlast:entity:c",
            relationshipIdentifier: "atlast:relationship:b-calls-c",
            assertionIdentifier: assertionIdentifier(3),
          },
        ],
      },
      {
        entityIdentifier: "atlast:entity:a",
        rankScore: 0.9,
        pathEdgeCount: 2,
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:b",
            targetEntityIdentifier: "atlast:entity:c",
            relationshipIdentifier: "atlast:relationship:b-calls-c",
            assertionIdentifier: assertionIdentifier(3),
          },
          {
            sourceEntityIdentifier: "atlast:entity:a",
            targetEntityIdentifier: "atlast:entity:b",
            relationshipIdentifier: "atlast:relationship:a-calls-b",
            assertionIdentifier: assertionIdentifier(2),
          },
        ],
      },
    ]);
  });

  it("computes identically over a truncated traversal, never claiming completeness it cannot prove", () => {
    const items = [
      entityItem("mid", 1),
      entityItem("target", 2),
      relationshipItem("checkout-mid", "checkout", "mid", 0.9, 3),
      relationshipItem("mid-target", "mid", "target", 0.9, 4),
    ];
    const complete = computeImpact(
      input("checkout", items, "downstream", false),
    );
    const truncated = computeImpact(
      input("checkout", items, "downstream", true),
    );
    expect(truncated.results).toEqual(complete.results);
    expect(truncated).not.toHaveProperty("truncated");
    expect(truncated).not.toHaveProperty("complete");
  });
});
