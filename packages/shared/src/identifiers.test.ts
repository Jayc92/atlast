/**
 * Rejection-first schema tests for the namespaced identifier contract
 * (ADR-0014 § "Identity"): a malformed identifier admitted here would
 * poison every downstream shape, so the unhappy path is the core suite
 * (GUARDRAILS.md § 5).
 */
import { describe, expect, it } from "vitest";
import {
  assertionIdentifierSchema,
  entityIdentifierSchema,
  evidenceIdentifierSchema,
  relationshipIdentifierSchema,
} from "./identifiers.ts";

const VALID_SHA256_DIGEST =
  "a3f5c9e12b8d4076fa1e5b09c27d83f4a6510e9dcb2478f30a1b5c6d7e8f9012";

describe("entityIdentifierSchema", () => {
  it("accepts a single-segment identifier", () => {
    expect(
      entityIdentifierSchema.safeParse("atlast:entity:checkout").success,
    ).toBe(true);
  });

  it("accepts multi-segment and hyphenated identifiers", () => {
    expect(
      entityIdentifierSchema.safeParse("atlast:entity:service/checkout-v2")
        .success,
    ).toBe(true);
  });

  it.each([
    ["wrong concept namespace", "atlast:relationship:checkout"],
    ["missing scheme", "entity:checkout"],
    ["wrong scheme", "other:entity:checkout"],
    ["uppercase segment", "atlast:entity:Checkout"],
    ["leading hyphen", "atlast:entity:-checkout"],
    ["trailing hyphen", "atlast:entity:checkout-"],
    ["double hyphen", "atlast:entity:checkout--v2"],
    ["empty segment", "atlast:entity:service//checkout"],
    ["trailing slash", "atlast:entity:service/"],
    ["no segment at all", "atlast:entity:"],
    ["whitespace", "atlast:entity:check out"],
  ])("rejects %s", (_description: string, malformedIdentifier: string) => {
    expect(entityIdentifierSchema.safeParse(malformedIdentifier).success).toBe(
      false,
    );
  });
});

describe("relationshipIdentifierSchema", () => {
  it("accepts a well-formed relationship identifier", () => {
    expect(
      relationshipIdentifierSchema.safeParse(
        "atlast:relationship:checkout-calls-payments",
      ).success,
    ).toBe(true);
  });

  it("rejects the entity namespace", () => {
    expect(
      relationshipIdentifierSchema.safeParse("atlast:entity:checkout").success,
    ).toBe(false);
  });
});

describe("evidenceIdentifierSchema", () => {
  it("accepts a well-formed multi-segment evidence identifier", () => {
    expect(
      evidenceIdentifierSchema.safeParse(
        "atlast:evidence:demo-company/traces/0001",
      ).success,
    ).toBe(true);
  });

  it("rejects the assertion namespace", () => {
    expect(
      evidenceIdentifierSchema.safeParse(
        `atlast:assertion:${VALID_SHA256_DIGEST}`,
      ).success,
    ).toBe(false);
  });
});

describe("assertionIdentifierSchema", () => {
  it("accepts a 64-character lowercase hex SHA-256 digest", () => {
    expect(
      assertionIdentifierSchema.safeParse(
        `atlast:assertion:${VALID_SHA256_DIGEST}`,
      ).success,
    ).toBe(true);
  });

  it.each([
    ["63 hex characters", `atlast:assertion:${VALID_SHA256_DIGEST.slice(1)}`],
    ["65 hex characters", `atlast:assertion:${VALID_SHA256_DIGEST}0`],
    ["uppercase hex", `atlast:assertion:${VALID_SHA256_DIGEST.toUpperCase()}`],
    [
      "non-hex characters",
      `atlast:assertion:${VALID_SHA256_DIGEST.slice(0, 63)}g`,
    ],
    ["kebab-case path instead of digest", "atlast:assertion:checkout"],
    ["wrong namespace", `atlast:entity:${VALID_SHA256_DIGEST}`],
  ])("rejects %s", (_description: string, malformedIdentifier: string) => {
    expect(
      assertionIdentifierSchema.safeParse(malformedIdentifier).success,
    ).toBe(false);
  });
});
