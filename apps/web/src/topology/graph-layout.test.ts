import { describe, expect, it } from "vitest";
import {
  buildEntityReadResult,
  buildRelationshipSubjectReadResult,
  buildTraversalResult,
} from "./test-support/fixtures.ts";
import { projectTraversalGraph } from "./graph-projection.ts";
import { buildElkGraph, layoutTopology } from "./graph-layout.ts";

const checkout = buildEntityReadResult({
  identifier: "atlast:entity:checkout",
  entityType: "service",
});
const payments = buildEntityReadResult({
  identifier: "atlast:entity:payments",
  entityType: "service",
});
const relationship = buildRelationshipSubjectReadResult({
  identifier: "atlast:relationship:checkout-calls-payments",
  relationshipType: "calls",
  sourceEntityIdentifier: checkout.subject.identifier,
  targetEntityIdentifier: payments.subject.identifier,
});
const view = projectTraversalGraph(
  checkout,
  buildTraversalResult([relationship, payments]),
);

describe("graph layout", () => {
  it("builds a fixed, ordered ELK graph without non-renderable boundary edges", () => {
    const graph = buildElkGraph(view);
    expect(graph.layoutOptions).toMatchObject({
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
    });
    expect(graph.children?.map((node) => node.id)).toEqual([
      checkout.subject.identifier,
      payments.subject.identifier,
    ]);
    expect(graph.edges?.map((edge) => edge.id)).toEqual([view.edges[0]?.id]);
  });

  it("returns identical coordinates for identical inputs", async () => {
    const first = await layoutTopology(view);
    const second = await layoutTopology(view);
    expect(second).toEqual(first);
    expect(first.nodes).toHaveLength(2);
    expect(first.width).toBeGreaterThan(0);
  });
});
