import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./schema-version.ts";
import {
  healthContextResultSchema,
  healthProjectionSchema,
  latentRiskDerivationSchema,
  overlayGapSchema,
} from "./health-context.ts";

const assertionIdentifier =
  "atlast:assertion:a3f5c9e12b8d4076fa1e5b09c27d83f4a6510e9dcb2478f30a1b5c6d7e8f9012";
const relationshipIdentifier = "atlast:relationship:checkout-calls-fulfillment";

const validSubjectResult = {
  subject: {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: "atlast:entity:fulfillment",
    subjectKind: "entity",
  },
  assertions: [
    {
      revision: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        identifier: assertionIdentifier,
        derivationVersion: "m1-v1",
        subjectIdentifier: "atlast:entity:fulfillment",
        claim: { claimKind: "entity", entityType: "service" },
        validity: { validFrom: "2026-04-01T00:00:00.000Z" },
        provenance: ["atlast:evidence:demo-company/architecture-feed/0001"],
        confidence: 0.5,
        ruleTrace: [
          {
            ruleName: "normalized-exact-match",
            evidenceIdentifiers: [
              "atlast:evidence:demo-company/architecture-feed/0001",
            ],
          },
        ],
        conflictState: { status: "uncontested" },
        ambiguityState: { status: "unambiguous" },
      },
      freshness: "current",
    },
  ],
} as const;

const validPathStep = {
  sourceEntityIdentifier: "atlast:entity:checkout",
  targetEntityIdentifier: "atlast:entity:fulfillment",
  relationshipIdentifier,
  assertionIdentifier,
} as const;

describe("health projection contracts", () => {
  it.each([
    "healthy",
    "degraded",
    "down",
    "disconnected",
    "expiring-certificate",
  ] as const)("accepts a reported direct %s projection", (condition) => {
    expect(
      healthProjectionSchema.safeParse({
        reportStatus: "reported",
        entityIdentifier: "atlast:entity:checkout",
        directCondition: condition,
        effectiveState: condition,
        contextCompleteness: "complete-within-requested-bounds",
      }).success,
    ).toBe(true);
  });

  it("rejects disagreement between direct condition and direct effective state", () => {
    expect(
      healthProjectionSchema.safeParse({
        reportStatus: "reported",
        entityIdentifier: "atlast:entity:checkout",
        directCondition: "healthy",
        effectiveState: "down",
        contextCompleteness: "complete-within-requested-bounds",
      }).success,
    ).toBe(false);
  });

  it("accepts an exact unreported projection and rejects invented state", () => {
    const unreported = {
      reportStatus: "unreported",
      entityIdentifier: "atlast:entity:checkout",
      contextCompleteness: "truncated",
    } as const;
    expect(healthProjectionSchema.safeParse(unreported).success).toBe(true);
    expect(
      healthProjectionSchema.safeParse({
        ...unreported,
        effectiveState: "healthy",
      }).success,
    ).toBe(false);
  });

  it("accepts latent downstream risk only with a nonempty exact derivation", () => {
    const latent = {
      reportStatus: "reported",
      entityIdentifier: "atlast:entity:checkout",
      directCondition: "healthy",
      effectiveState: "latent-downstream-risk",
      contextCompleteness: "complete-within-requested-bounds",
      derivation: {
        triggerEntityIdentifier: "atlast:entity:fulfillment",
        triggerDirectCondition: "down",
        path: [validPathStep],
      },
    } as const;
    expect(healthProjectionSchema.safeParse(latent).success).toBe(true);
    expect(
      healthProjectionSchema.safeParse({
        ...latent,
        derivation: { ...latent.derivation, path: [] },
      }).success,
    ).toBe(false);
    expect(
      latentRiskDerivationSchema.safeParse({
        ...latent.derivation,
        triggerDirectCondition: "healthy",
      }).success,
    ).toBe(false);
  });

  it("accepts only the exact unknown-target gap reason", () => {
    const gap = {
      entryIdentifier:
        "atlast:overlay-entry:demo-company/active-conditions/retired-billing",
      targetEntityIdentifier: "atlast:entity:retired-billing",
      directCondition: "disconnected",
      reason: "UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT",
    } as const;
    expect(overlayGapSchema.safeParse(gap).success).toBe(true);
    expect(
      overlayGapSchema.safeParse({ ...gap, reason: "UNKNOWN_ENTITY" }).success,
    ).toBe(false);
  });

  it("validates the complete health-context response envelope strictly", () => {
    const result = {
      data: {
        originEntityIdentifier: "atlast:entity:checkout",
        items: [validSubjectResult],
        projections: [
          {
            reportStatus: "reported",
            entityIdentifier: "atlast:entity:checkout",
            directCondition: "healthy",
            effectiveState: "healthy",
            contextCompleteness: "complete-within-requested-bounds",
          },
          {
            reportStatus: "reported",
            entityIdentifier: "atlast:entity:fulfillment",
            directCondition: "down",
            effectiveState: "down",
            contextCompleteness: "complete-within-requested-bounds",
          },
        ],
        gaps: [],
      },
      traversal: { truncated: false, subjectCount: 1 },
      meta: {
        resolvedIdentity: {
          asOf: "2026-04-20T12:00:00.000Z",
          horizon: 20,
          derivationVersion: "m1-v1",
        },
        schemaVersion: CURRENT_SCHEMA_VERSION,
        overlay: {
          schemaVersion: "atlast-overlay-v1",
          frameIdentifier:
            "atlast:overlay-frame:demo-company/active-conditions",
          effectiveAt: "2026-04-20T12:00:00.000Z",
        },
      },
    } as const;
    expect(healthContextResultSchema.safeParse(result).success).toBe(true);
    expect(
      healthContextResultSchema.safeParse({
        ...result,
        meta: {
          ...result.meta,
          overlayEffectiveAt: result.meta.overlay.effectiveAt,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects missing, disordered, or truncation-inconsistent projections", () => {
    const base = {
      data: {
        originEntityIdentifier: "atlast:entity:checkout",
        items: [validSubjectResult],
        projections: [
          {
            reportStatus: "reported",
            entityIdentifier: "atlast:entity:checkout",
            directCondition: "healthy",
            effectiveState: "healthy",
            contextCompleteness: "complete-within-requested-bounds",
          },
          {
            reportStatus: "reported",
            entityIdentifier: "atlast:entity:fulfillment",
            directCondition: "down",
            effectiveState: "down",
            contextCompleteness: "complete-within-requested-bounds",
          },
        ],
        gaps: [],
      },
      traversal: { truncated: false, subjectCount: 1 },
      meta: {
        resolvedIdentity: {
          asOf: "2026-04-20T12:00:00.000Z",
          horizon: 20,
          derivationVersion: "m1-v1",
        },
        schemaVersion: CURRENT_SCHEMA_VERSION,
        overlay: {
          schemaVersion: "atlast-overlay-v1",
          frameIdentifier:
            "atlast:overlay-frame:demo-company/active-conditions",
          effectiveAt: "2026-04-20T12:00:00.000Z",
        },
      },
    } as const;
    expect(healthContextResultSchema.safeParse(base).success).toBe(true);
    expect(
      healthContextResultSchema.safeParse({
        ...base,
        data: { ...base.data, projections: [base.data.projections[0]] },
      }).success,
    ).toBe(false);
    expect(
      healthContextResultSchema.safeParse({
        ...base,
        data: {
          ...base.data,
          projections: [...base.data.projections].reverse(),
        },
      }).success,
    ).toBe(false);
    expect(
      healthContextResultSchema.safeParse({
        ...base,
        traversal: { truncated: true, subjectCount: 1 },
      }).success,
    ).toBe(false);
  });
});
