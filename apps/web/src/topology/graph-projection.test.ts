import { describe, expect, it } from "vitest";
import type { SubjectReadResult } from "@atlast/shared";
import {
  buildEntityReadResult,
  buildRelationshipSubjectReadResult,
  buildTraversalResult,
} from "./test-support/fixtures.ts";
import { projectTraversalGraph } from "./graph-projection.ts";

const checkout = buildEntityReadResult({
  identifier: "atlast:entity:checkout",
  entityType: "service",
});
const payments = buildEntityReadResult({
  identifier: "atlast:entity:payments",
  entityType: "service",
});

describe("projectTraversalGraph", () => {
  it("orders nodes and edges deterministically without mutating input", () => {
    const relationship = buildRelationshipSubjectReadResult({
      identifier: "atlast:relationship:checkout-calls-payments",
      relationshipType: "calls",
      sourceEntityIdentifier: checkout.subject.identifier,
      targetEntityIdentifier: payments.subject.identifier,
    });
    const traversal = buildTraversalResult([relationship, payments]);
    const before = JSON.stringify(traversal);

    const view = projectTraversalGraph(checkout, traversal);

    expect(view.nodes.map((node) => node.id)).toEqual([
      checkout.subject.identifier,
      payments.subject.identifier,
    ]);
    expect(view.edges).toHaveLength(1);
    expect(view.edges[0]).toMatchObject({
      label: "calls",
      source: checkout.subject.identifier,
      target: payments.subject.identifier,
      renderable: true,
    });
    expect(JSON.stringify(traversal)).toBe(before);
  });

  it("keeps each competing relationship claim as a separate candidate edge", () => {
    const base = buildRelationshipSubjectReadResult({
      identifier: "atlast:relationship:checkout-dependency",
      relationshipType: "calls",
      sourceEntityIdentifier: checkout.subject.identifier,
      targetEntityIdentifier: payments.subject.identifier,
    });
    const assertion = base.assertions[0];
    if (assertion === undefined) {
      throw new Error("fixture must contain one assertion");
    }
    const conflicted: SubjectReadResult = {
      ...base,
      assertions: [
        {
          ...assertion,
          revision: {
            ...assertion.revision,
            conflictState: {
              status: "conflicted",
              competingClaims: [
                {
                  claim: {
                    claimKind: "relationship",
                    relationshipType: "publishes-to",
                    sourceEntityIdentifier: checkout.subject.identifier,
                    targetEntityIdentifier: payments.subject.identifier,
                  },
                  provenance: ["atlast:evidence:checkout/observation-1"],
                  confidence: 0.62,
                },
              ],
            },
          },
        },
      ],
    };

    const view = projectTraversalGraph(
      checkout,
      buildTraversalResult([payments, conflicted]),
    );

    expect(view.edges.map((edge) => edge.label)).toEqual([
      "publishes-to",
      "calls",
    ]);
    expect(view.edges.every((edge) => edge.conflicted)).toBe(true);
  });

  it("reports absent endpoints as boundary references instead of inventing nodes", () => {
    const relationship = buildRelationshipSubjectReadResult({
      identifier: "atlast:relationship:checkout-calls-external",
      relationshipType: "calls",
      sourceEntityIdentifier: checkout.subject.identifier,
      targetEntityIdentifier: "atlast:entity:external",
    });

    const view = projectTraversalGraph(
      checkout,
      buildTraversalResult([relationship], true),
    );

    expect(view.nodes.map((node) => node.id)).toEqual([
      checkout.subject.identifier,
    ]);
    expect(view.edges[0]?.renderable).toBe(false);
    expect(view.boundaryReferences).toEqual([
      {
        edgeId: view.edges[0]?.id,
        endpointIdentifier: "atlast:entity:external",
        role: "target",
      },
    ]);
    expect(view.truncated).toBe(true);
  });
});
