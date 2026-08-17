import {
  MAXIMUM_OVERLAY_FRAME_ENTRIES,
  overlayFrameSchema,
  type OverlayFrameIdentifier,
  type UtcMillisecondTimestamp,
} from "@atlast/shared";
import { describe, expect, it } from "vitest";
import {
  NoOverlayFrameAtOrBeforeError,
  OverlayFrameNotFoundError,
} from "./errors.ts";
import { InMemoryOperationalOverlayStore } from "./in-memory-overlay-store.ts";

function frame(slug: string, effectiveAt: string, targetSlug = slug): unknown {
  return {
    schemaVersion: "atlast-overlay-v1",
    identifier: `atlast:overlay-frame:demo-company/${slug}`,
    scenarioIdentifier: "demo-company",
    effectiveAt,
    entries: [
      {
        identifier: `atlast:overlay-entry:demo-company/${slug}/${targetSlug}`,
        targetEntityIdentifier: `atlast:entity:${targetSlug}`,
        directCondition: "healthy",
      },
    ],
  };
}

describe("InMemoryOperationalOverlayStore", () => {
  it("validates, isolates, orders, and deeply freezes loaded frames", () => {
    const later = frame("later", "2026-04-20T12:00:00.000Z") as Record<
      string,
      unknown
    >;
    const earlier = frame("earlier", "2026-04-01T12:00:00.000Z") as Record<
      string,
      unknown
    >;
    const store = new InMemoryOperationalOverlayStore([later, earlier]);

    expect(store.frames.map((item) => item.identifier)).toEqual([
      "atlast:overlay-frame:demo-company/earlier",
      "atlast:overlay-frame:demo-company/later",
    ]);
    expect(Object.isFrozen(store.frames)).toBe(true);
    expect(Object.isFrozen(store.frames[0])).toBe(true);
    expect(Object.isFrozen(store.frames[0]?.entries)).toBe(true);
    expect(Object.isFrozen(store.frames[0]?.entries[0])).toBe(true);

    const earlierEntries = earlier["entries"] as Array<{
      directCondition: string;
    }>;
    const firstEarlierEntry = earlierEntries[0];
    if (firstEarlierEntry !== undefined) {
      firstEarlierEntry.directCondition = "down";
    }
    expect(store.frames[0]?.entries[0]?.directCondition).toBe("healthy");
    expect(() =>
      (store.frames as unknown as unknown[]).push(
        frame("extra", "2026-05-01T00:00:00.000Z"),
      ),
    ).toThrow(TypeError);
  });

  it("uses frame identifier as the total-order tie-breaker", async () => {
    const effectiveAt = "2026-04-20T12:00:00.000Z";
    const store = new InMemoryOperationalOverlayStore([
      frame("zulu", effectiveAt),
      frame("alpha", effectiveAt),
    ]);

    expect(store.frames.map((item) => item.identifier)).toEqual([
      "atlast:overlay-frame:demo-company/alpha",
      "atlast:overlay-frame:demo-company/zulu",
    ]);
    await expect(
      store.getLatestFrameAtOrBefore(effectiveAt as UtcMillisecondTimestamp),
    ).resolves.toMatchObject({
      identifier: "atlast:overlay-frame:demo-company/zulu",
    });
  });

  it("resolves exact frames and the latest frame at or before a topology time", async () => {
    const store = new InMemoryOperationalOverlayStore([
      frame("baseline", "2026-04-01T12:00:00.000Z"),
      frame("active", "2026-04-20T12:00:00.000Z"),
    ]);

    await expect(
      store.getFrameByIdentifier("atlast:overlay-frame:demo-company/baseline"),
    ).resolves.toMatchObject({ effectiveAt: "2026-04-01T12:00:00.000Z" });
    await expect(
      store.getLatestFrameAtOrBefore("2026-04-15T00:00:00.000Z"),
    ).resolves.toMatchObject({
      identifier: "atlast:overlay-frame:demo-company/baseline",
    });
  });

  it("fails with typed coordinates for unknown and too-early reads", async () => {
    const store = new InMemoryOperationalOverlayStore([
      frame("baseline", "2026-04-01T12:00:00.000Z"),
    ]);
    const unknown =
      "atlast:overlay-frame:demo-company/missing" as OverlayFrameIdentifier;
    const tooEarly = "2026-03-31T23:59:59.999Z" as UtcMillisecondTimestamp;

    await expect(store.getFrameByIdentifier(unknown)).rejects.toMatchObject({
      name: "OverlayFrameNotFoundError",
      code: "OVERLAY_FRAME_NOT_FOUND",
      frameIdentifier: unknown,
    } satisfies Partial<OverlayFrameNotFoundError>);
    await expect(
      store.getLatestFrameAtOrBefore(tooEarly),
    ).rejects.toMatchObject({
      name: "NoOverlayFrameAtOrBeforeError",
      code: "NO_OVERLAY_FRAME_AT_OR_BEFORE",
      topologyAsOf: tooEarly,
    } satisfies Partial<NoOverlayFrameAtOrBeforeError>);
  });

  it("accepts an empty immutable store and fails reads with typed errors", async () => {
    const store = new InMemoryOperationalOverlayStore([]);
    const unknown =
      "atlast:overlay-frame:demo-company/missing" as OverlayFrameIdentifier;
    const topologyAsOf = "2026-04-01T00:00:00.000Z" as UtcMillisecondTimestamp;

    expect(store.frames).toStrictEqual([]);
    expect(Object.isFrozen(store.frames)).toBe(true);
    await expect(store.getFrameByIdentifier(unknown)).rejects.toMatchObject({
      name: "OverlayFrameNotFoundError",
      code: "OVERLAY_FRAME_NOT_FOUND",
      frameIdentifier: unknown,
    } satisfies Partial<OverlayFrameNotFoundError>);
    await expect(
      store.getLatestFrameAtOrBefore(topologyAsOf),
    ).rejects.toMatchObject({
      name: "NoOverlayFrameAtOrBeforeError",
      code: "NO_OVERLAY_FRAME_AT_OR_BEFORE",
      topologyAsOf,
    } satisfies Partial<NoOverlayFrameAtOrBeforeError>);
  });

  it("rejects duplicate, malformed, disordered-entry, and over-bound input", () => {
    const baseline = frame("baseline", "2026-04-01T12:00:00.000Z");
    expect(
      () => new InMemoryOperationalOverlayStore([baseline, baseline]),
    ).toThrow(/identifiers must be unique/);
    expect(
      () =>
        new InMemoryOperationalOverlayStore([
          { ...(baseline as object), unexpected: true },
        ]),
    ).toThrow();

    const disordered = {
      ...(baseline as Record<string, unknown>),
      entries: [
        {
          identifier: "atlast:overlay-entry:demo-company/baseline/zulu",
          targetEntityIdentifier: "atlast:entity:zulu",
          directCondition: "healthy",
        },
        {
          identifier: "atlast:overlay-entry:demo-company/baseline/alpha",
          targetEntityIdentifier: "atlast:entity:alpha",
          directCondition: "healthy",
        },
      ],
    };
    expect(() => new InMemoryOperationalOverlayStore([disordered])).toThrow(
      /strictly ordered/,
    );

    const entries = Array.from(
      { length: MAXIMUM_OVERLAY_FRAME_ENTRIES + 1 },
      (_, index) => {
        const suffix = String(index).padStart(3, "0");
        return {
          identifier: `atlast:overlay-entry:demo-company/baseline/entry-${suffix}`,
          targetEntityIdentifier: `atlast:entity:entity-${suffix}`,
          directCondition: "healthy",
        };
      },
    );
    expect(
      overlayFrameSchema.safeParse({
        ...(baseline as Record<string, unknown>),
        entries: entries.slice(0, MAXIMUM_OVERLAY_FRAME_ENTRIES),
      }).success,
    ).toBe(true);
    expect(
      overlayFrameSchema.safeParse({
        ...(baseline as Record<string, unknown>),
        entries,
      }).success,
    ).toBe(false);
    expect(
      () =>
        new InMemoryOperationalOverlayStore([
          { ...(baseline as Record<string, unknown>), entries },
        ]),
    ).toThrow(/at most 100 entries/);
  });
});
