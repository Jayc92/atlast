/**
 * M3-A overlay fixture validation. This test reads only raw synthetic overlay
 * input and validates it against ADR-0029 contracts; it never selects a frame
 * for a snapshot or computes an effective health projection.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  directConditionSchema,
  overlayFrameCollectionSchema,
  overlayFrameIdentifierSchema,
  overlayFrameSchema,
  overlaySchemaVersionSchema,
  type DirectCondition,
  type OverlayFrame,
} from "./index.ts";

const OVERLAY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/demo-company/overlays",
);

const ROOT_KEYS = [
  "catalogVersion",
  "schemaVersion",
  "scenarioIdentifier",
  "frames",
  "coverage",
] as const;
const FRAME_KEYS = ["identifier", "frameFile", "expectedEntryCount"] as const;
const COVERAGE_KEYS = [
  "directConditions",
  "reachableConditionPair",
  "unknownTargetEntityIdentifier",
] as const;
const PAIR_KEYS = ["sourceEntityIdentifier", "targetEntityIdentifier"] as const;

const EXPECTED_DIRECT_CONDITIONS = [
  "healthy",
  "degraded",
  "down",
  "disconnected",
  "expiring-certificate",
] as const satisfies readonly DirectCondition[];

const KNOWN_DEMO_COMPANY_ENTITIES = new Set([
  "atlast:entity:api",
  "atlast:entity:archive",
  "atlast:entity:checkout",
  "atlast:entity:fulfillment",
  "atlast:entity:ledger",
  "atlast:entity:ledger-api",
  "atlast:entity:notifications",
  "atlast:entity:orders",
  "atlast:entity:payments",
  "atlast:entity:web",
  "atlast:entity:worker",
]);

const FORBIDDEN_DERIVED_KEYS = new Set([
  "contextcompleteness",
  "derivation",
  "effectivestate",
  "gap",
  "gaps",
  "healthprojection",
  "healthprojections",
  "path",
  "projection",
  "projections",
  "reportstatus",
]);

interface CatalogFrame {
  readonly identifier: string;
  readonly frameFile: string;
  readonly expectedEntryCount: number;
}

interface OverlayFixtureCatalog {
  readonly catalogVersion: string;
  readonly schemaVersion: string;
  readonly scenarioIdentifier: string;
  readonly frames: readonly CatalogFrame[];
  readonly coverage: {
    readonly directConditions: readonly DirectCondition[];
    readonly reachableConditionPair: {
      readonly sourceEntityIdentifier: string;
      readonly targetEntityIdentifier: string;
    };
    readonly unknownTargetEntityIdentifier: string;
  };
}

function readJson(relativePath: string): unknown {
  return JSON.parse(
    readFileSync(resolve(OVERLAY_ROOT, relativePath), "utf8"),
  ) as unknown;
}

function requireRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${description} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, description: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${description} must be a JSON array`);
  }
  return value;
}

function requireString(value: unknown, description: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${description} must be a non-empty string`);
  }
  return value;
}

function requireExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  description: string,
): void {
  expect(Object.keys(record).sort(), `${description} keys`).toStrictEqual(
    [...expectedKeys].sort(),
  );
}

function loadCatalog(): OverlayFixtureCatalog {
  const root = requireRecord(readJson("catalog.json"), "overlay catalog");
  requireExactKeys(root, ROOT_KEYS, "overlay catalog");
  const coverage = requireRecord(root["coverage"], "overlay catalog.coverage");
  requireExactKeys(coverage, COVERAGE_KEYS, "overlay catalog.coverage");
  const pair = requireRecord(
    coverage["reachableConditionPair"],
    "overlay catalog.coverage.reachableConditionPair",
  );
  requireExactKeys(
    pair,
    PAIR_KEYS,
    "overlay catalog.coverage.reachableConditionPair",
  );

  const frames = requireArray(root["frames"], "overlay catalog.frames").map(
    (value, index): CatalogFrame => {
      const record = requireRecord(
        value,
        `overlay catalog frame ${String(index)}`,
      );
      requireExactKeys(
        record,
        FRAME_KEYS,
        `overlay catalog frame ${String(index)}`,
      );
      const frameFile = requireString(
        record["frameFile"],
        `overlay catalog frame ${String(index)}.frameFile`,
      );
      if (
        !/^frames\/[0-9]{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(frameFile)
      ) {
        throw new Error(
          "Overlay frame files must use deterministic relative paths",
        );
      }
      const expectedEntryCount = record["expectedEntryCount"];
      if (
        typeof expectedEntryCount !== "number" ||
        !Number.isInteger(expectedEntryCount) ||
        expectedEntryCount < 1
      ) {
        throw new TypeError("expectedEntryCount must be a positive integer");
      }
      return {
        identifier: overlayFrameIdentifierSchema.parse(record["identifier"]),
        frameFile,
        expectedEntryCount,
      };
    },
  );

  return {
    catalogVersion: requireString(
      root["catalogVersion"],
      "overlay catalog.catalogVersion",
    ),
    schemaVersion: overlaySchemaVersionSchema.parse(root["schemaVersion"]),
    scenarioIdentifier: requireString(
      root["scenarioIdentifier"],
      "overlay catalog.scenarioIdentifier",
    ),
    frames,
    coverage: {
      directConditions: requireArray(
        coverage["directConditions"],
        "overlay catalog.coverage.directConditions",
      ).map((condition) => directConditionSchema.parse(condition)),
      reachableConditionPair: {
        sourceEntityIdentifier: requireString(
          pair["sourceEntityIdentifier"],
          "reachableConditionPair.sourceEntityIdentifier",
        ),
        targetEntityIdentifier: requireString(
          pair["targetEntityIdentifier"],
          "reachableConditionPair.targetEntityIdentifier",
        ),
      },
      unknownTargetEntityIdentifier: requireString(
        coverage["unknownTargetEntityIdentifier"],
        "coverage.unknownTargetEntityIdentifier",
      ),
    },
  };
}

function loadFrames(catalog: OverlayFixtureCatalog): readonly OverlayFrame[] {
  return overlayFrameCollectionSchema.parse(
    catalog.frames.map((entry) => {
      const frame = readJson(entry.frameFile);
      const parsedFrame = overlayFrameSchema.parse(frame);
      expect(parsedFrame.identifier).toBe(entry.identifier);
      expect(parsedFrame.entries).toHaveLength(entry.expectedEntryCount);
      return parsedFrame;
    }),
  );
}

function auditNoDerivedOutput(value: unknown, description: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      auditNoDerivedOutput(entry, `${description}[${String(index)}]`);
    });
    return;
  }
  if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, child]) => {
      const normalizedKey = key.toLowerCase().replaceAll(/[-_]/g, "");
      expect(
        FORBIDDEN_DERIVED_KEYS.has(normalizedKey),
        `${description}.${key} contains forbidden derived output`,
      ).toBe(false);
      auditNoDerivedOutput(child, `${description}.${key}`);
    });
  }
}

describe("demo-company overlay fixture catalog", () => {
  it("is strict, separate, deterministic, and declares every frame file", () => {
    const catalog = loadCatalog();
    expect(catalog.catalogVersion).toBe("demo-company-overlays-v1");
    expect(catalog.schemaVersion).toBe("atlast-overlay-v1");
    expect(catalog.scenarioIdentifier).toBe("demo-company");
    expect(
      catalog.frames.map((entry) => basename(entry.frameFile)),
    ).toStrictEqual(readdirSync(resolve(OVERLAY_ROOT, "frames")).sort());
    expect(new Set(catalog.frames.map((entry) => entry.identifier)).size).toBe(
      catalog.frames.length,
    );
  });

  it("validates the complete frame collection and deterministic counts", () => {
    const catalog = loadCatalog();
    const frames = loadFrames(catalog);
    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.entries.length)).toStrictEqual([3, 4]);
    expect(
      new Set(frames.map((frame) => frame.effectiveAt)).size,
    ).toBeGreaterThanOrEqual(2);
  });

  it("covers every direct condition exactly declared by the catalog", () => {
    const catalog = loadCatalog();
    const frames = loadFrames(catalog);
    const actualConditions = new Set(
      frames.flatMap((frame) =>
        frame.entries.map((entry) => entry.directCondition),
      ),
    );
    expect(catalog.coverage.directConditions).toStrictEqual(
      EXPECTED_DIRECT_CONDITIONS,
    );
    expect(actualConditions).toStrictEqual(new Set(EXPECTED_DIRECT_CONDITIONS));
  });

  it("contains the declared reachable healthy-to-nonhealthy propagation seed", () => {
    const catalog = loadCatalog();
    const frames = loadFrames(catalog);
    const pair = catalog.coverage.reachableConditionPair;
    expect(pair).toStrictEqual({
      sourceEntityIdentifier: "atlast:entity:checkout",
      targetEntityIdentifier: "atlast:entity:fulfillment",
    });
    expect(
      frames.some((frame) => {
        const byTarget = new Map(
          frame.entries.map((entry) => [entry.targetEntityIdentifier, entry]),
        );
        return (
          byTarget.get(pair.sourceEntityIdentifier)?.directCondition ===
            "healthy" &&
          byTarget.get(pair.targetEntityIdentifier)?.directCondition === "down"
        );
      }),
    ).toBe(true);
  });

  it("contains one deliberate unknown topology target and otherwise known targets", () => {
    const catalog = loadCatalog();
    const frames = loadFrames(catalog);
    const allTargets = new Set(
      frames.flatMap((frame) =>
        frame.entries.map((entry) => entry.targetEntityIdentifier),
      ),
    );
    expect(catalog.coverage.unknownTargetEntityIdentifier).toBe(
      "atlast:entity:retired-billing",
    );
    expect(
      KNOWN_DEMO_COMPANY_ENTITIES.has(
        catalog.coverage.unknownTargetEntityIdentifier,
      ),
    ).toBe(false);
    expect(
      [...allTargets].filter(
        (identifier) => !KNOWN_DEMO_COMPANY_ENTITIES.has(identifier),
      ),
    ).toStrictEqual([catalog.coverage.unknownTargetEntityIdentifier]);
  });

  it("contains raw input only, never precomputed projection output", () => {
    const catalog = loadCatalog();
    catalog.frames.forEach((entry) => {
      auditNoDerivedOutput(readJson(entry.frameFile), entry.frameFile);
    });
  });
});
