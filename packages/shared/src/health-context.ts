/**
 * M3 health-context result contracts (ADRs 0029 and 0030). These schemas
 * describe projection output without implementing the projection policy.
 */
import { z } from "zod";
import {
  assertionIdentifierSchema,
  entityIdentifierSchema,
  relationshipIdentifierSchema,
} from "./identifiers.ts";
import {
  directConditionSchema,
  compareRawUtf16,
  overlayEntryIdentifierSchema,
  overlayFrameIdentifierSchema,
  overlaySchemaVersionSchema,
} from "./operational-overlays.ts";
import {
  resolvedReadMetadataSchema,
  traversalResultMetadataSchema,
} from "./read-contract.ts";
import { subjectReadResultSchema } from "./read-results.ts";
import { utcMillisecondTimestampSchema } from "./timestamps.ts";

export const contextCompletenessSchema = z.enum([
  "complete-within-requested-bounds",
  "truncated",
]);

export const healthPathStepSchema = z.strictObject({
  sourceEntityIdentifier: entityIdentifierSchema,
  targetEntityIdentifier: entityIdentifierSchema,
  relationshipIdentifier: relationshipIdentifierSchema,
  assertionIdentifier: assertionIdentifierSchema,
});

export const latentRiskDerivationSchema = z.strictObject({
  triggerEntityIdentifier: entityIdentifierSchema,
  triggerDirectCondition: directConditionSchema.exclude(["healthy"]),
  path: z
    .array(healthPathStepSchema)
    .min(1, "A latent-risk derivation path must contain at least one step"),
});

export const overlayGapSchema = z.strictObject({
  entryIdentifier: overlayEntryIdentifierSchema,
  targetEntityIdentifier: entityIdentifierSchema,
  directCondition: directConditionSchema,
  reason: z.literal("UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT"),
});

export const unreportedHealthProjectionSchema = z.strictObject({
  reportStatus: z.literal("unreported"),
  entityIdentifier: entityIdentifierSchema,
  contextCompleteness: contextCompletenessSchema,
});

function directProjectionSchema<
  Condition extends z.infer<typeof directConditionSchema>,
>(condition: Condition) {
  return z.strictObject({
    reportStatus: z.literal("reported"),
    entityIdentifier: entityIdentifierSchema,
    directCondition: z.literal(condition),
    effectiveState: z.literal(condition),
    contextCompleteness: contextCompletenessSchema,
  });
}

export const reportedDirectHealthProjectionSchema = z.union([
  directProjectionSchema("healthy"),
  directProjectionSchema("degraded"),
  directProjectionSchema("down"),
  directProjectionSchema("disconnected"),
  directProjectionSchema("expiring-certificate"),
]);

export const reportedLatentHealthProjectionSchema = z.strictObject({
  reportStatus: z.literal("reported"),
  entityIdentifier: entityIdentifierSchema,
  directCondition: z.literal("healthy"),
  effectiveState: z.literal("latent-downstream-risk"),
  contextCompleteness: contextCompletenessSchema,
  derivation: latentRiskDerivationSchema,
});

export const healthProjectionSchema = z.union([
  unreportedHealthProjectionSchema,
  reportedDirectHealthProjectionSchema,
  reportedLatentHealthProjectionSchema,
]);

export const healthContextOverlayMetadataSchema = z.strictObject({
  schemaVersion: overlaySchemaVersionSchema,
  frameIdentifier: overlayFrameIdentifierSchema,
  effectiveAt: utcMillisecondTimestampSchema,
});

export const healthContextResultSchema = z
  .strictObject({
    data: z.strictObject({
      originEntityIdentifier: entityIdentifierSchema,
      items: z.array(subjectReadResultSchema),
      projections: z.array(healthProjectionSchema),
      gaps: z.array(overlayGapSchema),
    }),
    traversal: traversalResultMetadataSchema,
    meta: resolvedReadMetadataSchema.extend({
      overlay: healthContextOverlayMetadataSchema,
    }),
  })
  .superRefine((result, context): void => {
    const expectedProjectionIdentifiers = [
      result.data.originEntityIdentifier,
      ...result.data.items
        .filter((item) => item.subject.subjectKind === "entity")
        .map((item) => item.subject.identifier),
    ].sort(compareRawUtf16);
    const actualProjectionIdentifiers = result.data.projections.map(
      (projection) => projection.entityIdentifier,
    );

    if (
      new Set(expectedProjectionIdentifiers).size !==
        expectedProjectionIdentifiers.length ||
      JSON.stringify(actualProjectionIdentifiers) !==
        JSON.stringify(expectedProjectionIdentifiers)
    ) {
      context.addIssue({
        code: "custom",
        path: ["data", "projections"],
        message:
          "Health projections must contain exactly the origin and every returned Entity, ordered by entityIdentifier",
      });
    }

    const expectedCompleteness = result.traversal.truncated
      ? "truncated"
      : "complete-within-requested-bounds";
    result.data.projections.forEach((projection, projectionIndex) => {
      if (projection.contextCompleteness !== expectedCompleteness) {
        context.addIssue({
          code: "custom",
          path: ["data", "projections", projectionIndex, "contextCompleteness"],
          message:
            "Projection contextCompleteness must match traversal truncation",
        });
      }
    });

    result.data.gaps.forEach((gap, gapIndex) => {
      const previousGap = result.data.gaps[gapIndex - 1];
      if (
        previousGap !== undefined &&
        (compareRawUtf16(
          previousGap.targetEntityIdentifier,
          gap.targetEntityIdentifier,
        ) > 0 ||
          (previousGap.targetEntityIdentifier === gap.targetEntityIdentifier &&
            compareRawUtf16(previousGap.entryIdentifier, gap.entryIdentifier) >=
              0))
      ) {
        context.addIssue({
          code: "custom",
          path: ["data", "gaps", gapIndex],
          message:
            "Overlay gaps must be strictly ordered by targetEntityIdentifier then entryIdentifier",
        });
      }
    });
  });

export type ContextCompleteness = z.infer<typeof contextCompletenessSchema>;
export type HealthPathStep = z.infer<typeof healthPathStepSchema>;
export type LatentRiskDerivation = z.infer<typeof latentRiskDerivationSchema>;
export type OverlayGap = z.infer<typeof overlayGapSchema>;
export type HealthProjection = z.infer<typeof healthProjectionSchema>;
export type UnreportedHealthProjection = z.infer<
  typeof unreportedHealthProjectionSchema
>;
export type ReportedDirectHealthProjection = z.infer<
  typeof reportedDirectHealthProjectionSchema
>;
export type ReportedLatentHealthProjection = z.infer<
  typeof reportedLatentHealthProjectionSchema
>;
export type HealthContextOverlayMetadata = z.infer<
  typeof healthContextOverlayMetadataSchema
>;
export type HealthContextResult = z.infer<typeof healthContextResultSchema>;
