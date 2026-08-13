import { describe, expect, it } from "vitest";
import { projectTraversalGraph } from "./graph-projection.ts";
import { resolveTrustSelection } from "./trust-selection.ts";
import {
  buildRelationshipSubjectReadResult,
  buildSubjectReadResult,
  buildTraversalResult,
} from "./test-support/fixtures.ts";

describe("resolveTrustSelection", () => {
  const origin = buildSubjectReadResult({
    identifier: "atlast:entity:checkout",
    entityType: "service",
  });
  const target = buildSubjectReadResult({
    identifier: "atlast:entity:payments",
    entityType: "service",
  });
  const relationship = buildRelationshipSubjectReadResult({
    identifier: "atlast:relationship:checkout-calls-payments",
    relationshipType: "calls",
    sourceEntityIdentifier: origin.subject.identifier,
    targetEntityIdentifier: target.subject.identifier,
  });
  const traversal = buildTraversalResult([target, relationship]);

  it("resolves a directly selected Entity subject", () => {
    expect(
      resolveTrustSelection(target.subject.identifier, origin, traversal)
        ?.subject,
    ).toEqual(target);
  });

  it("maps a projected candidate edge back to its Relationship assertion", () => {
    const edge = projectTraversalGraph(origin, traversal).edges[0];
    expect(edge).toBeDefined();

    const selection = resolveTrustSelection(edge?.id, origin, traversal);
    expect(selection?.subject).toEqual(relationship);
    expect(selection?.assertionIdentifier).toBe(edge?.assertionIdentifier);
  });

  it("fails closed for a selection outside the loaded traversal", () => {
    expect(resolveTrustSelection("unknown", origin, traversal)).toBeUndefined();
  });
});
