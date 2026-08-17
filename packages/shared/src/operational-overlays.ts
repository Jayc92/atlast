/**
 * M3 operational-overlay contracts (ADR-0029): immutable frame-shaped input
 * facts kept separate from the topology graph. This module defines only the
 * validated wire/storage shapes and the asynchronous read-only store port;
 * frame selection and health projection belong to later M3 slices.
 */
import { z } from "zod";
import { entityIdentifierSchema } from "./identifiers.ts";
import {
  utcMillisecondTimestampSchema,
  type UtcMillisecondTimestamp,
} from "./timestamps.ts";

export const OVERLAY_SCHEMA_VERSION = "atlast-overlay-v1" as const;
export const OVERLAY_SCENARIO_IDENTIFIER = "demo-company" as const;
export const MAXIMUM_OVERLAY_FRAME_ENTRIES = 100 as const;

const IDENTIFIER_SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const OVERLAY_FRAME_IDENTIFIER_PATTERN = new RegExp(
  `^atlast:overlay-frame:demo-company/(${IDENTIFIER_SLUG})$`,
);
const OVERLAY_ENTRY_IDENTIFIER_PATTERN = new RegExp(
  `^atlast:overlay-entry:demo-company/(${IDENTIFIER_SLUG})/(${IDENTIFIER_SLUG})$`,
);

export const overlaySchemaVersionSchema = z.literal(OVERLAY_SCHEMA_VERSION);
export const overlayScenarioIdentifierSchema = z.literal(
  OVERLAY_SCENARIO_IDENTIFIER,
);

export const overlayFrameIdentifierSchema = z
  .string()
  .regex(
    OVERLAY_FRAME_IDENTIFIER_PATTERN,
    "Overlay frame identifier must match atlast:overlay-frame:demo-company/<lowercase-kebab-case-frame-slug>",
  );

export const overlayEntryIdentifierSchema = z
  .string()
  .regex(
    OVERLAY_ENTRY_IDENTIFIER_PATTERN,
    "Overlay entry identifier must match atlast:overlay-entry:demo-company/<frame-slug>/<lowercase-kebab-case-entry-slug>",
  );

export const directConditionSchema = z.enum([
  "healthy",
  "degraded",
  "down",
  "disconnected",
  "expiring-certificate",
]);

export const effectiveHealthStateSchema = z.enum([
  ...directConditionSchema.options,
  "latent-downstream-risk",
]);

export const overlayEntrySchema = z
  .strictObject({
    identifier: overlayEntryIdentifierSchema,
    targetEntityIdentifier: entityIdentifierSchema,
    directCondition: directConditionSchema,
  })
  .readonly();

/** Raw UTF-16 code-unit ordering, matching ECMAScript string comparison. */
export function compareRawUtf16(left: string, right: string): -1 | 0 | 1 {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareOverlayEntries(
  left: z.infer<typeof overlayEntrySchema>,
  right: z.infer<typeof overlayEntrySchema>,
): number {
  return (
    compareRawUtf16(
      left.targetEntityIdentifier,
      right.targetEntityIdentifier,
    ) || compareRawUtf16(left.identifier, right.identifier)
  );
}

export const overlayFrameSchema = z
  .strictObject({
    schemaVersion: overlaySchemaVersionSchema,
    identifier: overlayFrameIdentifierSchema,
    scenarioIdentifier: overlayScenarioIdentifierSchema,
    effectiveAt: utcMillisecondTimestampSchema,
    entries: z
      .array(overlayEntrySchema)
      .min(1, "An overlay frame must contain at least one entry")
      .max(
        MAXIMUM_OVERLAY_FRAME_ENTRIES,
        `An overlay frame must contain at most ${String(MAXIMUM_OVERLAY_FRAME_ENTRIES)} entries`,
      )
      .readonly(),
  })
  .superRefine((frame, context): void => {
    const frameMatch = OVERLAY_FRAME_IDENTIFIER_PATTERN.exec(frame.identifier);
    const frameSlug = frameMatch?.[1];
    const seenEntryIdentifiers = new Set<string>();
    const seenTargets = new Set<string>();

    frame.entries.forEach((entry, entryIndex) => {
      if (seenEntryIdentifiers.has(entry.identifier)) {
        context.addIssue({
          code: "custom",
          path: ["entries", entryIndex, "identifier"],
          message: "Overlay entry identifiers must be unique within a frame",
        });
      }
      seenEntryIdentifiers.add(entry.identifier);

      if (seenTargets.has(entry.targetEntityIdentifier)) {
        context.addIssue({
          code: "custom",
          path: ["entries", entryIndex, "targetEntityIdentifier"],
          message:
            "Overlay target entity identifiers must be unique within a frame",
        });
      }
      seenTargets.add(entry.targetEntityIdentifier);

      const entryFrameSlug = OVERLAY_ENTRY_IDENTIFIER_PATTERN.exec(
        entry.identifier,
      )?.[1];
      if (frameSlug !== entryFrameSlug) {
        context.addIssue({
          code: "custom",
          path: ["entries", entryIndex, "identifier"],
          message:
            "Overlay entry identifier frame slug must match its containing frame identifier",
        });
      }

      const previousEntry = frame.entries[entryIndex - 1];
      if (
        previousEntry !== undefined &&
        compareOverlayEntries(previousEntry, entry) >= 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", entryIndex],
          message:
            "Overlay entries must be strictly ordered by targetEntityIdentifier then identifier using raw UTF-16 order",
        });
      }
    });
  })
  .readonly();

export const overlayFrameCollectionSchema = z
  .array(overlayFrameSchema)
  .superRefine((frames, context): void => {
    const seenFrameIdentifiers = new Set<string>();
    frames.forEach((frame, frameIndex) => {
      if (seenFrameIdentifiers.has(frame.identifier)) {
        context.addIssue({
          code: "custom",
          path: [frameIndex, "identifier"],
          message: "Overlay frame identifiers must be unique",
        });
      }
      seenFrameIdentifiers.add(frame.identifier);

      const previousFrame = frames[frameIndex - 1];
      if (
        previousFrame !== undefined &&
        (compareRawUtf16(previousFrame.effectiveAt, frame.effectiveAt) > 0 ||
          (previousFrame.effectiveAt === frame.effectiveAt &&
            compareRawUtf16(previousFrame.identifier, frame.identifier) >= 0))
      ) {
        context.addIssue({
          code: "custom",
          path: [frameIndex],
          message:
            "Overlay frames must be strictly ordered by effectiveAt then identifier using raw UTF-16 order",
        });
      }
    });
  })
  .readonly();

export type OverlaySchemaVersion = z.infer<typeof overlaySchemaVersionSchema>;
export type OverlayScenarioIdentifier = z.infer<
  typeof overlayScenarioIdentifierSchema
>;
export type OverlayFrameIdentifier = z.infer<
  typeof overlayFrameIdentifierSchema
>;
export type OverlayEntryIdentifier = z.infer<
  typeof overlayEntryIdentifierSchema
>;
export type DirectCondition = z.infer<typeof directConditionSchema>;
export type EffectiveHealthState = z.infer<typeof effectiveHealthStateSchema>;
export type OverlayEntry = z.infer<typeof overlayEntrySchema>;
export type OverlayFrame = z.infer<typeof overlayFrameSchema>;
export type OverlayFrameCollection = z.infer<
  typeof overlayFrameCollectionSchema
>;

/** Read-only overlay source port. Selection policy is implemented later. */
export interface OperationalOverlayStore {
  getFrameByIdentifier(
    frameIdentifier: OverlayFrameIdentifier,
  ): Promise<OverlayFrame>;
  getLatestFrameAtOrBefore(
    topologyAsOf: UtcMillisecondTimestamp,
  ): Promise<OverlayFrame>;
}
