import {
  CURRENT_SCHEMA_VERSION,
  healthProjectionSchema,
  overlayFrameSchema,
  traversalResultSchema,
  type DirectCondition,
  type EntityIdentifier,
  type OverlayFrame,
  type SubjectReadResult,
  type TraversalDirection,
  type TraversalResult,
} from "@atlast/shared";
import { describe, expect, it } from "vitest";
import { OverlayProjectionInputError } from "./errors.ts";
import { projectHealth, type ProjectHealthInput } from "./health-projector.ts";

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

function frame(
  entries: readonly (readonly [slug: string, condition: DirectCondition])[],
): OverlayFrame {
  const sorted = [...entries].sort(([left], [right]) =>
    entityIdentifier(left) < entityIdentifier(right) ? -1 : 1,
  );
  return overlayFrameSchema.parse({
    schemaVersion: "atlast-overlay-v1",
    identifier: "atlast:overlay-frame:demo-company/test-frame",
    scenarioIdentifier: "demo-company",
    effectiveAt: AS_OF,
    entries: sorted.map(([slug, condition]) => ({
      identifier: `atlast:overlay-entry:demo-company/test-frame/${slug}`,
      targetEntityIdentifier: entityIdentifier(slug),
      directCondition: condition,
    })),
  });
}

interface ProjectionOptions {
  readonly origin?: string;
  readonly items?: readonly SubjectReadResult[];
  readonly entries?: readonly (readonly [string, DirectCondition])[];
  readonly direction?: TraversalDirection;
  readonly minimumConfidence?: number;
  readonly truncated?: boolean;
  readonly known?: readonly string[];
  readonly unknown?: readonly string[];
}

function input(options: ProjectionOptions = {}): ProjectHealthInput {
  return {
    originEntityIdentifier: entityIdentifier(options.origin ?? "checkout"),
    bounds: {
      direction: options.direction ?? "downstream",
      depth: 3,
      minimumConfidence: options.minimumConfidence ?? 0,
    },
    traversal: traversal(options.items ?? [], options.truncated),
    frame: frame(options.entries ?? [["checkout", "healthy"]]),
    knownTargetEntityIdentifiers: (options.known ?? []).map(entityIdentifier),
    unknownTargetEntityIdentifiers: (options.unknown ?? []).map(
      entityIdentifier,
    ),
  };
}

describe("projectHealth", () => {
  it.each([
    "healthy",
    "degraded",
    "down",
    "disconnected",
    "expiring-certificate",
  ] as const)("projects the origin's direct %s condition", (condition) => {
    const result = projectHealth(input({ entries: [["checkout", condition]] }));
    expect(result.projections).toEqual([
      {
        reportStatus: "reported",
        entityIdentifier: "atlast:entity:checkout",
        directCondition: condition,
        effectiveState: condition,
        contextCompleteness: "complete-within-requested-bounds",
      },
    ]);
    expect(
      healthProjectionSchema.safeParse(result.projections[0]).success,
    ).toBe(true);
  });

  it("includes and orders the origin, reports missing direct state honestly, and marks truncation", () => {
    const result = projectHealth(
      input({
        items: [entityItem("zulu", 1), entityItem("alpha", 2)],
        entries: [["zulu", "degraded"]],
        truncated: true,
      }),
    );
    expect(
      result.projections.map((projection) => projection.entityIdentifier),
    ).toEqual([
      "atlast:entity:alpha",
      "atlast:entity:checkout",
      "atlast:entity:zulu",
    ]);
    expect(result.projections[0]).toMatchObject({ reportStatus: "unreported" });
    expect(result.projections[1]).toMatchObject({ reportStatus: "unreported" });
    expect(
      result.projections.every(
        (projection) => projection.contextCompleteness === "truncated",
      ),
    ).toBe(true);
  });

  it("derives revision-qualified latent downstream risk for the origin", () => {
    const edge = relationshipItem(
      "checkout-calls-fulfillment",
      "checkout",
      "fulfillment",
      { assertionIndex: 61 },
    );
    const result = projectHealth(
      input({
        items: [entityItem("fulfillment", 2), edge],
        entries: [
          ["checkout", "healthy"],
          ["fulfillment", "down"],
        ],
      }),
    );
    expect(result.projections[0]).toEqual({
      reportStatus: "reported",
      entityIdentifier: "atlast:entity:checkout",
      directCondition: "healthy",
      effectiveState: "latent-downstream-risk",
      contextCompleteness: "complete-within-requested-bounds",
      derivation: {
        triggerEntityIdentifier: "atlast:entity:fulfillment",
        triggerDirectCondition: "down",
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:checkout",
            targetEntityIdentifier: "atlast:entity:fulfillment",
            relationshipIdentifier:
              "atlast:relationship:checkout-calls-fulfillment",
            assertionIdentifier: assertionIdentifier(61),
          },
        ],
      },
    });
  });

  it("uses actual claim direction regardless of root traversal direction", () => {
    const items = [
      entityItem("fulfillment", 2),
      relationshipItem("checkout-calls-fulfillment", "checkout", "fulfillment"),
    ];
    const entries = [
      ["checkout", "healthy"],
      ["fulfillment", "down"],
    ] as const;
    const downstream = projectHealth(input({ items, entries }));
    const upstream = projectHealth(
      input({ items: [...items].reverse(), entries, direction: "upstream" }),
    );
    expect(upstream).toEqual(downstream);

    const reverseOnly = projectHealth(
      input({
        items: [
          entityItem("fulfillment", 2),
          relationshipItem(
            "fulfillment-calls-checkout",
            "fulfillment",
            "checkout",
          ),
        ],
        entries,
        direction: "upstream",
      }),
    );
    expect(reverseOnly.projections[0]).toMatchObject({
      effectiveState: "healthy",
    });
  });

  it("filters each relationship revision by the requested confidence floor", () => {
    const items = [
      entityItem("fulfillment", 2),
      relationshipItem(
        "checkout-calls-fulfillment",
        "checkout",
        "fulfillment",
        { confidence: 0.79 },
      ),
    ];
    const result = projectHealth(
      input({
        items,
        entries: [
          ["checkout", "healthy"],
          ["fulfillment", "down"],
        ],
        minimumConfidence: 0.8,
      }),
    );
    expect(result.projections[0]).toMatchObject({ effectiveState: "healthy" });
  });

  it("prefers fewer edges before severity, then severity before target identifier", () => {
    const result = projectHealth(
      input({
        items: [
          entityItem("alpha-down", 1),
          entityItem("middle", 2),
          entityItem("zulu-degraded", 3),
          relationshipItem("checkout-middle", "checkout", "middle", {
            assertionIndex: 71,
          }),
          relationshipItem("middle-alpha", "middle", "alpha-down", {
            assertionIndex: 72,
          }),
          relationshipItem("checkout-zulu", "checkout", "zulu-degraded", {
            assertionIndex: 73,
          }),
        ],
        entries: [
          ["alpha-down", "down"],
          ["checkout", "healthy"],
          ["middle", "healthy"],
          ["zulu-degraded", "degraded"],
        ],
      }),
    );
    expect(result.projections[1]).toMatchObject({
      derivation: {
        triggerEntityIdentifier: "atlast:entity:zulu-degraded",
        triggerDirectCondition: "degraded",
      },
    });

    const sameLength = projectHealth(
      input({
        items: [
          entityItem("alpha-degraded", 1),
          entityItem("zulu-down", 2),
          relationshipItem("checkout-alpha", "checkout", "alpha-degraded", {
            assertionIndex: 74,
          }),
          relationshipItem("checkout-zulu", "checkout", "zulu-down", {
            assertionIndex: 75,
          }),
        ],
        entries: [
          ["alpha-degraded", "degraded"],
          ["checkout", "healthy"],
          ["zulu-down", "down"],
        ],
      }),
    );
    expect(sameLength.projections[1]).toMatchObject({
      derivation: {
        triggerEntityIdentifier: "atlast:entity:zulu-down",
        triggerDirectCondition: "down",
      },
    });
  });

  it("uses target identifier then full step tuples as deterministic ties", () => {
    const sameSeverity = projectHealth(
      input({
        items: [
          entityItem("alpha", 1),
          entityItem("zulu", 2),
          relationshipItem("checkout-zulu", "checkout", "zulu", {
            assertionIndex: 81,
          }),
          relationshipItem("checkout-alpha", "checkout", "alpha", {
            assertionIndex: 82,
          }),
        ],
        entries: [
          ["alpha", "down"],
          ["checkout", "healthy"],
          ["zulu", "down"],
        ],
      }),
    );
    expect(sameSeverity.projections[1]).toMatchObject({
      derivation: { triggerEntityIdentifier: "atlast:entity:alpha" },
    });

    const parallelEdges = projectHealth(
      input({
        items: [
          entityItem("target", 1),
          relationshipItem("zulu-edge", "checkout", "target", {
            assertionIndex: 83,
          }),
          relationshipItem("alpha-edge", "checkout", "target", {
            assertionIndex: 84,
          }),
        ],
        entries: [
          ["checkout", "healthy"],
          ["target", "down"],
        ],
      }),
    );
    expect(parallelEdges.projections[0]).toMatchObject({
      derivation: {
        path: [{ relationshipIdentifier: "atlast:relationship:alpha-edge" }],
      },
    });
  });

  it("is cycle-safe and derives from direct conditions rather than recursive state", () => {
    const result = projectHealth(
      input({
        items: [
          entityItem("middle", 1),
          entityItem("target", 2),
          relationshipItem("checkout-middle", "checkout", "middle", {
            assertionIndex: 91,
          }),
          relationshipItem("middle-checkout", "middle", "checkout", {
            assertionIndex: 92,
          }),
          relationshipItem("middle-target", "middle", "target", {
            assertionIndex: 93,
          }),
        ],
        entries: [
          ["checkout", "healthy"],
          ["middle", "healthy"],
          ["target", "disconnected"],
        ],
      }),
    );
    expect(result.projections[0]).toMatchObject({
      effectiveState: "latent-downstream-risk",
      derivation: { path: [{}, {}] },
    });
    expect(result.projections[1]).toMatchObject({
      effectiveState: "latent-downstream-risk",
      derivation: {
        triggerEntityIdentifier: "atlast:entity:target",
        path: [{}],
      },
    });
  });

  it("never traverses nested competing claims", () => {
    const result = projectHealth(
      input({
        items: [
          entityItem("bad", 1),
          entityItem("safe", 2),
          relationshipItem("checkout-safe", "checkout", "safe", {
            competingTarget: "bad",
          }),
        ],
        entries: [
          ["bad", "down"],
          ["checkout", "healthy"],
          ["safe", "healthy"],
        ],
      }),
    );
    expect(result.projections[1]).toMatchObject({ effectiveState: "healthy" });
  });

  it("never expands beyond the supplied bounded traversal scope", () => {
    const result = projectHealth(
      input({
        items: [
          entityItem("middle", 1),
          relationshipItem("checkout-middle", "checkout", "middle"),
          relationshipItem("middle-distant", "middle", "distant", {
            assertionIndex: 101,
          }),
        ],
        entries: [
          ["checkout", "healthy"],
          ["distant", "down"],
          ["middle", "healthy"],
        ],
        known: ["distant"],
      }),
    );
    expect(
      result.projections.map((projection) => projection.entityIdentifier),
    ).toEqual(["atlast:entity:checkout", "atlast:entity:middle"]);
    expect(
      result.projections.every(
        (projection) =>
          projection.reportStatus === "reported" &&
          projection.effectiveState === "healthy",
      ),
    ).toBe(true);
    expect(result.gaps).toEqual([]);
  });

  it("classifies only unknown frame targets as ordered gaps", () => {
    const result = projectHealth(
      input({
        entries: [
          ["checkout", "healthy"],
          ["known-outside", "degraded"],
          ["unknown-alpha", "down"],
          ["unknown-zulu", "disconnected"],
        ],
        known: ["known-outside"],
        unknown: ["unknown-zulu", "unknown-alpha"],
      }),
    );
    expect(result.projections).toHaveLength(1);
    expect(result.gaps).toEqual([
      {
        entryIdentifier:
          "atlast:overlay-entry:demo-company/test-frame/unknown-alpha",
        targetEntityIdentifier: "atlast:entity:unknown-alpha",
        directCondition: "down",
        reason: "UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT",
      },
      {
        entryIdentifier:
          "atlast:overlay-entry:demo-company/test-frame/unknown-zulu",
        targetEntityIdentifier: "atlast:entity:unknown-zulu",
        directCondition: "disconnected",
        reason: "UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT",
      },
    ]);
  });

  it("rejects incomplete, overlapping, duplicate, or extra target partitions", () => {
    const base = input({
      entries: [
        ["checkout", "healthy"],
        ["outside", "down"],
      ],
    });
    expect(() => projectHealth(base)).toThrow(OverlayProjectionInputError);
    expect(() =>
      projectHealth({
        ...base,
        knownTargetEntityIdentifiers: [entityIdentifier("outside")],
        unknownTargetEntityIdentifiers: [entityIdentifier("outside")],
      }),
    ).toThrow(/both known and unknown/);
    expect(() =>
      projectHealth({
        ...base,
        knownTargetEntityIdentifiers: [
          entityIdentifier("outside"),
          entityIdentifier("outside"),
        ],
      }),
    ).toThrow(/contains duplicates/);
    expect(() =>
      projectHealth({
        ...base,
        knownTargetEntityIdentifiers: [entityIdentifier("extra")],
      }),
    ).toThrow(/non-remaining target/);
  });

  it("is deterministic across traversal permutations and returns frozen isolated output", () => {
    const items = [
      entityItem("fulfillment", 2),
      relationshipItem("checkout-calls-fulfillment", "checkout", "fulfillment"),
    ];
    const base = input({
      items,
      entries: [
        ["checkout", "healthy"],
        ["fulfillment", "down"],
      ],
    });
    const first = projectHealth(base);
    const second = projectHealth({
      ...base,
      traversal: traversal([...items].reverse()),
    });
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.projections)).toBe(true);
    expect(Object.isFrozen(first.projections[0])).toBe(true);
    expect(() => (first.projections as unknown as unknown[]).push({})).toThrow(
      TypeError,
    );
    expect(base.frame.entries[0]?.directCondition).toBe("healthy");
  });
});
