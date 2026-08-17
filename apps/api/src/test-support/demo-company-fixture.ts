/**
 * Test-only fixture loading for the S7-B integration suite: the same
 * `fileURLToPath`/`readFileSync` loading pattern `server.ts` and
 * `packages/graph-model/src/contract-suite.test.ts` already use, so
 * integration tests exercise the real, reviewed `demo-company` catalog
 * (ADR-0024 § 12's "deterministic test injection" — a fixed `Clock` and a
 * deterministic Evidence array, never the production catalog loader or a
 * real-time clock in production, but reusing the identical catalog data is
 * exactly what makes these tests exercise real conflict/ambiguity/
 * relationship scenarios instead of a synthetic seed with no such shape).
 *
 * Not imported by `app.ts` or `server.ts` — this module exists only for
 * colocated test files under `apps/api/src/**`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  evidenceCollectionSchema,
  overlayFrameCollectionSchema,
  type Evidence,
  type OverlayFrame,
} from "@atlast/shared";
import type { Clock } from "@atlast/graph-model";

const FIXTURE_ROOT = fileURLToPath(
  new URL("../../../../fixtures/demo-company/", import.meta.url),
);

interface CatalogScenario {
  readonly id: string;
  readonly evidenceFile: string;
}
interface Catalog {
  readonly scenarios: readonly CatalogScenario[];
}
interface OverlayCatalogFrame {
  readonly frameFile: string;
}
interface OverlayCatalog {
  readonly frames: readonly OverlayCatalogFrame[];
}

function loadFixtureJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(FIXTURE_ROOT + relativePath, "utf8"));
}

const CATALOG = loadFixtureJson("catalog.json") as Catalog;

/**
 * A fixed clock at an instant after every declared `demo-company` fixture
 * observation, so a "latest" read resolves every scenario's revisions as
 * `historical` deterministically across runs — never wall-clock time.
 */
export const FIXED_TEST_CLOCK: Clock = () => "2026-08-11T00:00:00.000Z";

/**
 * Every valid `demo-company` scenario record, loaded and validated exactly
 * as the production `loadDemoCompanySeedEvidence` in `server.ts` does. The
 * full catalog spans `recordedSequence` 1–20.
 */
export function loadFullDemoCompanySeedEvidence(): readonly Evidence[] {
  return evidenceCollectionSchema.parse(
    CATALOG.scenarios.flatMap(
      (scenario) => loadFixtureJson(scenario.evidenceFile) as unknown[],
    ),
  );
}

/** Every validated M3 demo-company overlay frame in catalog order. */
export function loadFullDemoCompanyOverlayFrames(): readonly OverlayFrame[] {
  const catalog = loadFixtureJson("overlays/catalog.json") as OverlayCatalog;
  return overlayFrameCollectionSchema.parse(
    catalog.frames.map((frame) =>
      loadFixtureJson(`overlays/${frame.frameFile}`),
    ),
  );
}

/**
 * Only the named scenarios' Evidence, by catalog `id` — used to construct a
 * store whose watermark and first `recordedSequence` are something other
 * than the full catalog's 1/20, e.g. to exercise `HORIZON_BEFORE_FIRST_EVIDENCE`
 * without a stub.
 */
export function loadDemoCompanySeedEvidenceForScenarios(
  scenarioIds: readonly string[],
): readonly Evidence[] {
  const scenarioById = new Map(
    CATALOG.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  return evidenceCollectionSchema.parse(
    scenarioIds.flatMap((scenarioId) => {
      const scenario = scenarioById.get(scenarioId);
      if (scenario === undefined) {
        throw new Error(`Unknown demo-company scenario id: ${scenarioId}`);
      }
      return loadFixtureJson(scenario.evidenceFile);
    }),
  );
}

/** The exact pinned identity every full-catalog snapshot resolves to (`catalog.json`'s own `snapshotIdentitySeeds[0]`). */
export const FULL_CATALOG_SNAPSHOT_IDENTITY = {
  asOf: "2026-04-20T12:00:00.000Z",
  horizon: 20,
  derivationVersion: "m1-v1",
} as const;

/** The unsupported-policy identity `catalog.json` deliberately seeds (`snapshotIdentitySeeds[1]`). */
export const UNSUPPORTED_DERIVATION_VERSION_IDENTITY = {
  asOf: "2026-04-20T12:00:00.000Z",
  horizon: 20,
  derivationVersion: "m1-v2",
} as const;
