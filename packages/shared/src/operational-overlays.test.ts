import { describe, expect, it } from "vitest";
import {
  MAXIMUM_OVERLAY_FRAME_ENTRIES,
  compareRawUtf16,
  directConditionSchema,
  effectiveHealthStateSchema,
  overlayFrameCollectionSchema,
  overlayFrameSchema,
  type OperationalOverlayStore,
  type OverlayFrame,
} from "./operational-overlays.ts";

const validFrame = {
  schemaVersion: "atlast-overlay-v1",
  identifier: "atlast:overlay-frame:demo-company/baseline",
  scenarioIdentifier: "demo-company",
  effectiveAt: "2026-04-01T12:00:00.000Z",
  entries: [
    {
      identifier: "atlast:overlay-entry:demo-company/baseline/api",
      targetEntityIdentifier: "atlast:entity:api",
      directCondition: "healthy",
    },
    {
      identifier: "atlast:overlay-entry:demo-company/baseline/archive",
      targetEntityIdentifier: "atlast:entity:archive",
      directCondition: "disconnected",
    },
  ],
} as const;

describe("operational overlay contracts", () => {
  it("accepts the exact bounded overlay frame", () => {
    expect(overlayFrameSchema.safeParse(validFrame).success).toBe(true);
  });

  it("returns an immutable frame, entry collection, and entries", () => {
    const frame = overlayFrameSchema.parse(validFrame);
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame.entries)).toBe(true);
    expect(Object.isFrozen(frame.entries[0])).toBe(true);
  });

  it("rejects unknown frame and entry fields", () => {
    expect(
      overlayFrameSchema.safeParse({ ...validFrame, computedState: "healthy" })
        .success,
    ).toBe(false);
    expect(
      overlayFrameSchema.safeParse({
        ...validFrame,
        entries: [{ ...validFrame.entries[0], confidence: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects malformed frame and entry identifiers", () => {
    expect(
      overlayFrameSchema.safeParse({
        ...validFrame,
        identifier: "atlast:overlay-frame:demo-company/Not-Kebab",
      }).success,
    ).toBe(false);
    expect(
      overlayFrameSchema.safeParse({
        ...validFrame,
        entries: [
          {
            ...validFrame.entries[0],
            identifier: "atlast:overlay-entry:demo-company/baseline/API",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires 1 through 100 entries", () => {
    expect(
      overlayFrameSchema.safeParse({ ...validFrame, entries: [] }).success,
    ).toBe(false);
    const entries = Array.from(
      { length: MAXIMUM_OVERLAY_FRAME_ENTRIES + 1 },
      (_unused, index) => ({
        identifier: `atlast:overlay-entry:demo-company/baseline/entry-${String(index + 1)}`,
        targetEntityIdentifier: `atlast:entity:entry-${String(index + 1)}`,
        directCondition: "healthy",
      }),
    );
    expect(
      overlayFrameSchema.safeParse({ ...validFrame, entries }).success,
    ).toBe(false);
  });

  it("rejects duplicate entry identifiers and duplicate targets", () => {
    expect(
      overlayFrameSchema.safeParse({
        ...validFrame,
        entries: [validFrame.entries[0], validFrame.entries[0]],
      }).success,
    ).toBe(false);
    expect(
      overlayFrameSchema.safeParse({
        ...validFrame,
        entries: [
          validFrame.entries[0],
          {
            ...validFrame.entries[0],
            identifier: "atlast:overlay-entry:demo-company/baseline/api-copy",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("binds each entry identifier to its containing frame slug", () => {
    expect(
      overlayFrameSchema.safeParse({
        ...validFrame,
        entries: [
          {
            ...validFrame.entries[0],
            identifier: "atlast:overlay-entry:demo-company/other/api",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires entries to be strictly ordered by target then identifier", () => {
    expect(
      overlayFrameSchema.safeParse({
        ...validFrame,
        entries: [...validFrame.entries].reverse(),
      }).success,
    ).toBe(false);
    expect(compareRawUtf16("A", "a")).toBe(-1);
    expect(compareRawUtf16("same", "same")).toBe(0);
  });

  it("orders frames by effectiveAt with identifier as the equal-time tie-break", () => {
    const equalTimeLater = {
      ...validFrame,
      identifier: "atlast:overlay-frame:demo-company/recovery",
      entries: [
        {
          ...validFrame.entries[0],
          identifier: "atlast:overlay-entry:demo-company/recovery/api",
        },
      ],
    } as const;
    expect(
      overlayFrameCollectionSchema.safeParse([validFrame, equalTimeLater])
        .success,
    ).toBe(true);
    expect(
      overlayFrameCollectionSchema.safeParse([equalTimeLater, validFrame])
        .success,
    ).toBe(false);
  });

  it("rejects duplicate frame identifiers and chronological disorder", () => {
    expect(
      overlayFrameCollectionSchema.safeParse([validFrame, validFrame]).success,
    ).toBe(false);
    expect(
      overlayFrameCollectionSchema.safeParse([
        { ...validFrame, effectiveAt: "2026-04-02T12:00:00.000Z" },
        validFrame,
      ]).success,
    ).toBe(false);
  });

  it("keeps direct and effective state vocabularies closed", () => {
    expect(
      directConditionSchema.safeParse("latent-downstream-risk").success,
    ).toBe(false);
    expect(
      effectiveHealthStateSchema.safeParse("latent-downstream-risk").success,
    ).toBe(true);
    expect(effectiveHealthStateSchema.safeParse("unknown").success).toBe(false);
  });

  it("defines an asynchronous read-only store port", async () => {
    const parsedFrame = overlayFrameSchema.parse(validFrame);
    const store: OperationalOverlayStore = {
      getFrameByIdentifier(): Promise<OverlayFrame> {
        return Promise.resolve(parsedFrame);
      },
      getLatestFrameAtOrBefore(): Promise<OverlayFrame> {
        return Promise.resolve(parsedFrame);
      },
    };
    await expect(
      store.getFrameByIdentifier(parsedFrame.identifier),
    ).resolves.toStrictEqual(parsedFrame);
  });
});
