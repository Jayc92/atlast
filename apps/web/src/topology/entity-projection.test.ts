import { describe, expect, it } from "vitest";
import {
  projectEntityDetail,
  projectEntityInventoryItem,
  projectSubjectSearchItem,
} from "./entity-projection.ts";
import {
  buildEntityReadResult,
  buildEntityReadResultWithClaims,
  buildRelationshipSubjectReadResult,
  buildSubjectReadResult,
} from "./test-support/fixtures.ts";

describe("projectEntityInventoryItem", () => {
  it("extracts the identifier, distinct entity types, and assertion count", () => {
    const item = buildEntityReadResult({
      identifier: "atlast:entity:service/checkout",
      entityType: "service",
    });
    expect(projectEntityInventoryItem(item)).toEqual({
      identifier: "atlast:entity:service/checkout",
      entityTypes: ["service"],
      assertionCount: 1,
    });
  });

  it("never collapses multiple distinct visible entity-type claims into one", () => {
    const conflictedItem = buildEntityReadResultWithClaims(
      "atlast:entity:orders",
      ["service", "database"],
    );
    const view = projectEntityInventoryItem(conflictedItem);
    expect(view.entityTypes).toEqual(["service", "database"]);
    expect(view.assertionCount).toBe(2);
  });

  it("deduplicates a repeated entity-type claim rather than listing it twice", () => {
    const duplicated = buildEntityReadResultWithClaims(
      "atlast:entity:service/checkout",
      ["service", "service"],
    );
    const view = projectEntityInventoryItem(duplicated);
    expect(view.entityTypes).toEqual(["service"]);
    expect(view.assertionCount).toBe(2);
  });
});

describe("projectSubjectSearchItem", () => {
  it("projects an entity subject with its subject kind and entity types", () => {
    const item = buildSubjectReadResult({
      identifier: "atlast:entity:service/checkout",
      entityType: "service",
    });
    expect(projectSubjectSearchItem(item)).toEqual({
      identifier: "atlast:entity:service/checkout",
      subjectKind: "entity",
      entityTypes: ["service"],
      relationshipTypes: [],
      assertionCount: 1,
    });
  });

  it("projects a relationship subject with its relationship types, never as an entity", () => {
    const item = buildRelationshipSubjectReadResult({
      identifier: "atlast:relationship:checkout-calls-ledger",
      relationshipType: "calls",
      sourceEntityIdentifier: "atlast:entity:service/checkout",
      targetEntityIdentifier: "atlast:entity:service/ledger",
    });
    expect(projectSubjectSearchItem(item)).toEqual({
      identifier: "atlast:relationship:checkout-calls-ledger",
      subjectKind: "relationship",
      entityTypes: [],
      relationshipTypes: ["calls"],
      assertionCount: 1,
    });
  });
});

describe("projectEntityDetail", () => {
  it("projects the identifier, entity types, and assertion count", () => {
    const detail = buildSubjectReadResult({
      identifier: "atlast:entity:service/checkout",
      entityType: "service",
    });
    expect(projectEntityDetail(detail)).toEqual({
      identifier: "atlast:entity:service/checkout",
      entityTypes: ["service"],
      assertionCount: 1,
    });
  });
});
