/**
 * M4 change-impact result contracts (ADRs 0032 and 0033). These schemas
 * describe the deterministic impact engine's output and its HTTP envelope
 * without implementing the ranking policy itself (that is
 * `packages/impact-model`, ADR-0032 §§ 3-4).
 */
import { z } from "zod";
import { confidenceSchema } from "./assertions.ts";
import {
  assertionIdentifierSchema,
  entityIdentifierSchema,
  relationshipIdentifierSchema,
} from "./identifiers.ts";
import { compareRawUtf16 } from "./operational-overlays.ts";
import {
  resolvedReadMetadataSchema,
  traversalResultMetadataSchema,
} from "./read-contract.ts";
import { subjectReadResultSchema } from "./read-results.ts";

/**
 * The hypothetical change a caller is asking about (ADR-0032 § 2). All
 * three values traverse and rank identically — this is a presentation
 * label, never a graph filter or ranking input.
 */
export const impactChangeTypeSchema = z.enum([
  "removal",
  "degradation",
  "interface-change",
]);

/**
 * One step of an evidence-linked impact path, in the Relationship claim's
 * canonical source-to-target orientation regardless of the traversal
 * direction that discovered it (ADR-0032 § 3) — the identical strict shape
 * ADR-0029 § 3 already defined for latent-risk path steps.
 */
export const impactPathStepSchema = z.strictObject({
  sourceEntityIdentifier: entityIdentifierSchema,
  targetEntityIdentifier: entityIdentifierSchema,
  relationshipIdentifier: relationshipIdentifierSchema,
  assertionIdentifier: assertionIdentifierSchema,
});

/**
 * One ranked, affected Entity: its rank score (the selected path's
 * bottleneck confidence, ADR-0032 § 3), the selected evidence path, and
 * the path's edge count restated for direct display.
 */
export const impactResultSchema = z
  .strictObject({
    entityIdentifier: entityIdentifierSchema,
    rankScore: confidenceSchema,
    pathEdgeCount: z
      .number()
      .int("pathEdgeCount must be an integer")
      .min(1, "pathEdgeCount must be at least 1"),
    path: z
      .array(impactPathStepSchema)
      .min(1, "An impact result path must contain at least one step"),
  })
  .superRefine((result, context): void => {
    if (result.pathEdgeCount !== result.path.length) {
      context.addIssue({
        code: "custom",
        path: ["pathEdgeCount"],
        message: "pathEdgeCount must equal path.length",
      });
    }
  });

/**
 * The impact-query HTTP response envelope (ADR-0033 § 2). `items` and
 * `traversal` are the unchanged traversal output; `results` is the ranked
 * list, ordered by rank score descending, then path edge count ascending,
 * then Entity identifier ascending in raw UTF-16 order (ADR-0032 § 4) —
 * the exact numeric values are compared with no rounding or epsilon
 * tolerance. An Entity must never appear more than once in `results`, and
 * the origin Entity must never appear in `results` at all.
 */
export const impactResultEnvelopeSchema = z
  .strictObject({
    data: z.strictObject({
      originEntityIdentifier: entityIdentifierSchema,
      changeType: impactChangeTypeSchema,
      items: z.array(subjectReadResultSchema),
      results: z.array(impactResultSchema),
    }),
    traversal: traversalResultMetadataSchema,
    meta: resolvedReadMetadataSchema,
  })
  .superRefine((envelope, context): void => {
    const { originEntityIdentifier, results } = envelope.data;
    const seenEntityIdentifiers = new Set<string>();

    results.forEach((result, resultIndex) => {
      if (result.entityIdentifier === originEntityIdentifier) {
        context.addIssue({
          code: "custom",
          path: ["data", "results", resultIndex, "entityIdentifier"],
          message: "An impact result must not name the origin Entity",
        });
      }
      if (seenEntityIdentifiers.has(result.entityIdentifier)) {
        context.addIssue({
          code: "custom",
          path: ["data", "results", resultIndex, "entityIdentifier"],
          message: "An Entity must not appear more than once in results",
        });
      }
      seenEntityIdentifiers.add(result.entityIdentifier);

      const previousResult = results[resultIndex - 1];
      if (previousResult === undefined) {
        return;
      }
      const outOfOrder =
        previousResult.rankScore < result.rankScore ||
        (previousResult.rankScore === result.rankScore &&
          previousResult.pathEdgeCount > result.pathEdgeCount) ||
        (previousResult.rankScore === result.rankScore &&
          previousResult.pathEdgeCount === result.pathEdgeCount &&
          compareRawUtf16(
            previousResult.entityIdentifier,
            result.entityIdentifier,
          ) >= 0);
      if (outOfOrder) {
        context.addIssue({
          code: "custom",
          path: ["data", "results", resultIndex],
          message:
            "Impact results must be ordered by rankScore descending, then pathEdgeCount ascending, then entityIdentifier ascending",
        });
      }
    });
  });

export type ImpactChangeType = z.infer<typeof impactChangeTypeSchema>;
export type ImpactPathStep = z.infer<typeof impactPathStepSchema>;
export type ImpactResult = z.infer<typeof impactResultSchema>;
export type ImpactResultEnvelope = z.infer<typeof impactResultEnvelopeSchema>;
