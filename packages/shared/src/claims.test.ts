/**
 * Canonical-claim tests per ADR-0019 § 2: claims own the type/endpoint
 * facts subjects no longer carry, endpoints are validated as syntax only
 * (Entity namespace), and the union discriminates on claimKind.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalClaimSchema,
  entityClaimSchema,
  relationshipClaimSchema,
} from "./claims.ts";

const validEntityClaim = {
  claimKind: "entity",
  entityType: "service",
} as const;

const validRelationshipClaim = {
  claimKind: "relationship",
  relationshipType: "reads-from",
  sourceEntityIdentifier: "atlast:entity:service/checkout",
  targetEntityIdentifier: "atlast:entity:database/orders",
} as const;

describe("entityClaimSchema", () => {
  it("accepts a well-formed entity classification claim", () => {
    expect(entityClaimSchema.safeParse(validEntityClaim).success).toBe(true);
  });

  it("rejects a non-kebab-case classification", () => {
    expect(
      entityClaimSchema.safeParse({
        ...validEntityClaim,
        entityType: "Scheduled Job",
      }).success,
    ).toBe(false);
  });

  it("rejects endpoint fields on an entity claim (strict object)", () => {
    expect(
      entityClaimSchema.safeParse({
        ...validEntityClaim,
        sourceEntityIdentifier: "atlast:entity:checkout",
      }).success,
    ).toBe(false);
  });
});

describe("relationshipClaimSchema", () => {
  it("accepts a well-formed relationship claim with both endpoints", () => {
    expect(
      relationshipClaimSchema.safeParse(validRelationshipClaim).success,
    ).toBe(true);
  });

  it.each([
    ["a relationship identifier", "atlast:relationship:checkout-calls"],
    ["an evidence identifier", "atlast:evidence:demo-company/traces/0001"],
    ["a bare name outside any namespace", "checkout"],
    ["an uppercase entity path", "atlast:entity:Checkout"],
  ])(
    "rejects a source endpoint that is %s (Entity namespace only)",
    (_description: string, invalidEndpointIdentifier: string) => {
      expect(
        relationshipClaimSchema.safeParse({
          ...validRelationshipClaim,
          sourceEntityIdentifier: invalidEndpointIdentifier,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a target endpoint outside the Entity namespace", () => {
    expect(
      relationshipClaimSchema.safeParse({
        ...validRelationshipClaim,
        targetEntityIdentifier: "atlast:relationship:orders-feeds-billing",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing target endpoint", () => {
    const withoutTarget: Record<string, unknown> = {
      ...validRelationshipClaim,
    };
    delete withoutTarget["targetEntityIdentifier"];
    expect(relationshipClaimSchema.safeParse(withoutTarget).success).toBe(
      false,
    );
  });
});

describe("canonicalClaimSchema", () => {
  it("discriminates both claim kinds", () => {
    expect(canonicalClaimSchema.safeParse(validEntityClaim).success).toBe(true);
    expect(canonicalClaimSchema.safeParse(validRelationshipClaim).success).toBe(
      true,
    );
  });

  it("rejects an unknown claimKind", () => {
    expect(
      canonicalClaimSchema.safeParse({
        claimKind: "overlay",
        entityType: "service",
      }).success,
    ).toBe(false);
  });

  it("rejects an entity claim shape declaring the relationship kind", () => {
    expect(
      canonicalClaimSchema.safeParse({
        claimKind: "relationship",
        entityType: "service",
      }).success,
    ).toBe(false);
  });
});
