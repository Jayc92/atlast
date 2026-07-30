/**
 * S3 fixture-catalog validation only. This test reads static synthetic input
 * and validates it through the existing S1/S2 schemas. It deliberately does
 * not normalize or reconcile identities, compute time or validity, construct
 * revisions or snapshots, or store data.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  evidenceCollectionSchema,
  schemaVersionSchema,
  snapshotIdentitySchema,
  utcMillisecondTimestampSchema,
  type Evidence,
  type SourceScopedIdentity,
} from "./index.ts";

const FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/demo-company",
);

const EXPECTED_SCENARIO_IDS = [
  "corroborating-evidence",
  "late-corroboration-revision-seed",
  "conflicting-evidence",
  "stale-evidence",
  "ambiguous-identity",
  "relationship-appearance-disappearance",
  "historical-as-of-topology",
] as const;

const EXPECTED_INVALID_CASE_IDS = [
  "duplicate-recorded-sequence",
  "zero-recorded-sequence",
  "negative-recorded-sequence",
  "unknown-schema-version",
] as const;

const ROOT_KEYS = [
  "catalogVersion",
  "schemaVersion",
  "scenarios",
  "invalidCases",
  "snapshotIdentitySeeds",
] as const;
const SCENARIO_REQUIRED_KEYS = [
  "ordinal",
  "id",
  "fixtureKind",
  "factPurpose",
  "evidenceFile",
  "expectedEvidenceCount",
] as const;
const INVALID_CASE_KEYS = [
  "id",
  "fixtureKind",
  "reason",
  "evidenceFile",
  "expectedIssuePath",
  "expectedIssueCode",
] as const;
const HORIZON_KEYS = [
  "beforeLateCorroboration",
  "afterLateCorroboration",
] as const;
const SNAPSHOT_IDENTITY_KEYS = [
  "asOf",
  "horizon",
  "derivationVersion",
] as const;

const FORBIDDEN_DERIVED_KEYS = new Set([
  "ambiguity",
  "ambiguities",
  "assertion",
  "assertions",
  "confidence",
  "conflict",
  "conflicts",
  "freshness",
  "graph",
  "graphassertion",
  "graphassertions",
  "graphstate",
  "precomputedgraph",
  "provenance",
  "reconciledsubject",
  "reconciledsubjects",
  "revision",
  "revisions",
  "ruletrace",
  "snapshot",
  "snapshots",
  "subject",
  "subjects",
  "validfrom",
  "validity",
  "validto",
]);
const FORBIDDEN_DERIVED_STATE_VALUES = new Set([
  "ambiguous",
  "conflicted",
  "current",
  "historical",
  "stale",
  "superseded",
]);

type IssuePath = (string | number)[];

interface ScenarioEntry {
  readonly ordinal: number;
  readonly id: string;
  readonly fixtureKind: "valid-evidence";
  readonly factPurpose: string;
  readonly evidenceFile: string;
  readonly expectedEvidenceCount: number;
  readonly horizons?: {
    readonly beforeLateCorroboration: number;
    readonly afterLateCorroboration: number;
  };
  readonly asOfSeeds?: readonly string[];
}

interface InvalidCaseEntry {
  readonly id: string;
  readonly fixtureKind: "invalid-evidence";
  readonly reason: string;
  readonly evidenceFile: string;
  readonly expectedIssuePath: IssuePath;
  readonly expectedIssueCode: string;
}

interface SnapshotIdentitySeed {
  readonly asOf: string;
  readonly horizon: number;
  readonly derivationVersion: string;
}

interface FixtureCatalog {
  readonly catalogVersion: string;
  readonly schemaVersion: string;
  readonly scenarios: readonly ScenarioEntry[];
  readonly invalidCases: readonly InvalidCaseEntry[];
  readonly snapshotIdentitySeeds: readonly SnapshotIdentitySeed[];
}

function readJson(relativePath: string): unknown {
  return JSON.parse(
    readFileSync(resolve(FIXTURE_ROOT, relativePath), "utf8"),
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

function requireNumber(value: unknown, description: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${description} must be a finite number`);
  }
  return value;
}

function requireExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  description: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${description} keys must be exactly ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`,
    );
  }
}

function requireRelativeFixturePath(
  value: unknown,
  description: string,
): string {
  const path = requireString(value, description);
  if (!/^(?:scenarios|invalid)\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(path)) {
    throw new Error(
      `${description} must be a deterministic relative JSON path`,
    );
  }
  return path;
}

function parseScenarioEntry(value: unknown, index: number): ScenarioEntry {
  const description = `scenario entry ${String(index + 1)}`;
  const record = requireRecord(value, description);
  const optionalKeys = [
    ...(record["horizons"] === undefined ? [] : ["horizons"]),
    ...(record["asOfSeeds"] === undefined ? [] : ["asOfSeeds"]),
  ];
  requireExactKeys(
    record,
    [...SCENARIO_REQUIRED_KEYS, ...optionalKeys],
    description,
  );

  const fixtureKind = requireString(
    record["fixtureKind"],
    `${description}.fixtureKind`,
  );
  if (fixtureKind !== "valid-evidence") {
    throw new Error(`${description}.fixtureKind must be "valid-evidence"`);
  }
  const factPurpose = requireString(
    record["factPurpose"],
    `${description}.factPurpose`,
  );
  if (factPurpose.length > 160) {
    throw new Error(`${description}.factPurpose must remain concise`);
  }

  let horizons: ScenarioEntry["horizons"];
  if (record["horizons"] !== undefined) {
    const horizonRecord = requireRecord(
      record["horizons"],
      `${description}.horizons`,
    );
    requireExactKeys(horizonRecord, HORIZON_KEYS, `${description}.horizons`);
    horizons = {
      beforeLateCorroboration: requireNumber(
        horizonRecord["beforeLateCorroboration"],
        `${description}.horizons.beforeLateCorroboration`,
      ),
      afterLateCorroboration: requireNumber(
        horizonRecord["afterLateCorroboration"],
        `${description}.horizons.afterLateCorroboration`,
      ),
    };
  }

  let asOfSeeds: readonly string[] | undefined;
  if (record["asOfSeeds"] !== undefined) {
    asOfSeeds = requireArray(
      record["asOfSeeds"],
      `${description}.asOfSeeds`,
    ).map((seed, seedIndex) =>
      utcMillisecondTimestampSchema.parse(
        requireString(seed, `${description}.asOfSeeds[${String(seedIndex)}]`),
      ),
    );
  }

  return {
    ordinal: requireNumber(record["ordinal"], `${description}.ordinal`),
    id: requireString(record["id"], `${description}.id`),
    fixtureKind,
    factPurpose,
    evidenceFile: requireRelativeFixturePath(
      record["evidenceFile"],
      `${description}.evidenceFile`,
    ),
    expectedEvidenceCount: requireNumber(
      record["expectedEvidenceCount"],
      `${description}.expectedEvidenceCount`,
    ),
    ...(horizons === undefined ? {} : { horizons }),
    ...(asOfSeeds === undefined ? {} : { asOfSeeds }),
  };
}

function parseInvalidCaseEntry(
  value: unknown,
  index: number,
): InvalidCaseEntry {
  const description = `invalid case entry ${String(index + 1)}`;
  const record = requireRecord(value, description);
  requireExactKeys(record, INVALID_CASE_KEYS, description);

  const fixtureKind = requireString(
    record["fixtureKind"],
    `${description}.fixtureKind`,
  );
  if (fixtureKind !== "invalid-evidence") {
    throw new Error(`${description}.fixtureKind must be "invalid-evidence"`);
  }
  const issuePath = requireArray(
    record["expectedIssuePath"],
    `${description}.expectedIssuePath`,
  ).map((segment, segmentIndex) => {
    if (typeof segment !== "string" && typeof segment !== "number") {
      throw new TypeError(
        `${description}.expectedIssuePath[${String(segmentIndex)}] must be a string or number`,
      );
    }
    return segment;
  });

  return {
    id: requireString(record["id"], `${description}.id`),
    fixtureKind,
    reason: requireString(record["reason"], `${description}.reason`),
    evidenceFile: requireRelativeFixturePath(
      record["evidenceFile"],
      `${description}.evidenceFile`,
    ),
    expectedIssuePath: issuePath,
    expectedIssueCode: requireString(
      record["expectedIssueCode"],
      `${description}.expectedIssueCode`,
    ),
  };
}

function loadCatalog(): FixtureCatalog {
  const root = requireRecord(readJson("catalog.json"), "catalog root");
  requireExactKeys(root, ROOT_KEYS, "catalog root");

  const scenarios = requireArray(root["scenarios"], "catalog.scenarios").map(
    parseScenarioEntry,
  );
  const invalidCases = requireArray(
    root["invalidCases"],
    "catalog.invalidCases",
  ).map(parseInvalidCaseEntry);
  const snapshotIdentitySeeds = requireArray(
    root["snapshotIdentitySeeds"],
    "catalog.snapshotIdentitySeeds",
  ).map((value, index) => {
    const description = `snapshot identity seed ${String(index + 1)}`;
    const record = requireRecord(value, description);
    requireExactKeys(record, SNAPSHOT_IDENTITY_KEYS, description);
    return snapshotIdentitySchema.parse(record);
  });

  return {
    catalogVersion: requireString(
      root["catalogVersion"],
      "catalog.catalogVersion",
    ),
    schemaVersion: schemaVersionSchema.parse(root["schemaVersion"]),
    scenarios,
    invalidCases,
    snapshotIdentitySeeds,
  };
}

function loadScenarioEvidence(entry: ScenarioEntry): Evidence[] {
  const evidence = evidenceCollectionSchema.parse(readJson(entry.evidenceFile));
  expect(evidence, `${entry.id} Evidence count`).toHaveLength(
    entry.expectedEvidenceCount,
  );
  return evidence;
}

function scenarioById(catalog: FixtureCatalog, id: string): ScenarioEntry {
  const scenario = catalog.scenarios.find((entry) => entry.id === id);
  if (scenario === undefined) {
    throw new Error(`catalog is missing required scenario "${id}"`);
  }
  return scenario;
}

function sourceIdentityKey(identity: SourceScopedIdentity): string {
  return `${identity.source}\u0000${identity.sourceNativeId}`;
}

function evidenceBySequence(
  evidence: readonly Evidence[],
  sequence: number,
): Evidence {
  const record = evidence.find(
    (candidate) => candidate.recordedSequence === sequence,
  );
  if (record === undefined) {
    throw new Error(
      `combined catalog is missing recordedSequence ${String(sequence)}`,
    );
  }
  return record;
}

function auditNoDerivedOutput(value: unknown, description: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      auditNoDerivedOutput(item, `${description}[${String(index)}]`);
    });
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replaceAll(/[-_]/g, "");
      expect(
        FORBIDDEN_DERIVED_KEYS.has(normalizedKey),
        `${description}.${key} is forbidden precomputed derived output`,
      ).toBe(false);
      auditNoDerivedOutput(child, `${description}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    expect(
      /^atlast:(?:assertion|entity|relationship):/.test(value),
      `${description} contains a derived graph identifier`,
    ).toBe(false);
    expect(
      FORBIDDEN_DERIVED_STATE_VALUES.has(value),
      `${description} contains a precomputed derived state`,
    ).toBe(false);
  }
}

describe("demo-company fixture catalog", () => {
  it("is strict, self-describing, deterministic, and declares exactly the required files", () => {
    const catalog = loadCatalog();
    expect(catalog.catalogVersion).toBe("demo-company-v1");
    expect(catalog.scenarios.map((entry) => entry.id)).toStrictEqual(
      EXPECTED_SCENARIO_IDS,
    );
    expect(catalog.scenarios.map((entry) => entry.ordinal)).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(catalog.invalidCases.map((entry) => entry.id)).toStrictEqual(
      EXPECTED_INVALID_CASE_IDS,
    );
    expect(
      new Set(catalog.scenarios.map((entry) => entry.evidenceFile)).size,
    ).toBe(catalog.scenarios.length);
    expect(
      new Set(catalog.invalidCases.map((entry) => entry.evidenceFile)).size,
    ).toBe(catalog.invalidCases.length);

    expect(
      readdirSync(resolve(FIXTURE_ROOT, "scenarios")).sort(),
    ).toStrictEqual(
      catalog.scenarios.map((entry) => basename(entry.evidenceFile)).sort(),
    );
    expect(readdirSync(resolve(FIXTURE_ROOT, "invalid")).sort()).toStrictEqual(
      catalog.invalidCases.map((entry) => basename(entry.evidenceFile)).sort(),
    );
  });

  it("loads every valid file through the catalog and validates the combined Evidence set", () => {
    const catalog = loadCatalog();
    const combinedEvidence = catalog.scenarios.flatMap(loadScenarioEvidence);

    expect(evidenceCollectionSchema.parse(combinedEvidence)).toHaveLength(20);
    expect(
      combinedEvidence.map((record) => record.recordedSequence),
    ).toStrictEqual(Array.from({ length: 20 }, (_unused, index) => index + 1));
    expect(
      combinedEvidence.every((record) =>
        record.identifier.startsWith("atlast:evidence:demo-company/"),
      ),
    ).toBe(true);
  });

  it("proves scenario 1 corroboration seed facts exactly", () => {
    const catalog = loadCatalog();
    const evidence = loadScenarioEvidence(
      scenarioById(catalog, "corroborating-evidence"),
    );
    expect(
      evidence.map((record) => ({
        source: record.sourceScopedIdentity.source,
        sourceNativeId: record.sourceScopedIdentity.sourceNativeId,
        entityType:
          record.observation.observationKind === "entity"
            ? record.observation.entityType
            : undefined,
        observedAt: record.observedAt,
      })),
    ).toStrictEqual([
      {
        source: "deployment-inventory",
        sourceNativeId: "svc-checkout",
        entityType: "service",
        observedAt: "2026-01-10T09:00:00.000Z",
      },
      {
        source: "service-registry",
        sourceNativeId: "Checkout Service",
        entityType: "service",
        observedAt: "2026-01-10T09:00:00.000Z",
      },
    ]);
    expect(
      new Set(evidence.map((record) => record.sourceScopedIdentity.source))
        .size,
    ).toBe(2);
    expect(
      new Set(
        evidence.map((record) => record.sourceScopedIdentity.sourceNativeId),
      ).size,
    ).toBe(2);
  });

  it("proves scenario 2 late-corroboration horizon seed facts exactly", () => {
    const catalog = loadCatalog();
    const scenario1 = loadScenarioEvidence(
      scenarioById(catalog, "corroborating-evidence"),
    );
    const scenario2 = scenarioById(catalog, "late-corroboration-revision-seed");
    const evidence = loadScenarioEvidence(scenario2);
    expect(scenario2.horizons).toStrictEqual({
      beforeLateCorroboration: 2,
      afterLateCorroboration: 3,
    });
    const record = evidence[0];
    if (record === undefined) {
      throw new Error(
        "late-corroboration scenario must contain one Evidence record",
      );
    }
    expect(record.recordedSequence).toBe(3);
    expect(record.recordedSequence).toBeGreaterThan(
      scenario2.horizons?.beforeLateCorroboration ?? Number.MAX_SAFE_INTEGER,
    );
    expect(record.recordedSequence).toBeLessThanOrEqual(
      scenario2.horizons?.afterLateCorroboration ?? 0,
    );
    expect(record.recordedAt > (scenario1.at(-1)?.recordedAt ?? "")).toBe(true);
    expect(record.sourceScopedIdentity).toStrictEqual({
      source: "trace-index",
      sourceNativeId: "service-checkout",
    });
    expect(record.observation).toStrictEqual({
      observationKind: "entity",
      entityType: "service",
    });
    expect(record.observedAt).toBe("2026-01-10T09:02:00.000Z");
    expect(record.recordedAt).toBe("2026-01-11T12:00:00.000Z");
  });

  it("proves scenario 3 conflicting raw claim seed facts exactly", () => {
    const catalog = loadCatalog();
    const evidence = loadScenarioEvidence(
      scenarioById(catalog, "conflicting-evidence"),
    );
    expect(
      evidence.map((record) => ({
        source: record.sourceScopedIdentity.source,
        sourceNativeId: record.sourceScopedIdentity.sourceNativeId,
        entityType:
          record.observation.observationKind === "entity"
            ? record.observation.entityType
            : undefined,
        observedAt: record.observedAt,
        recordedAt: record.recordedAt,
        recordedSequence: record.recordedSequence,
      })),
    ).toStrictEqual([
      {
        source: "asset-index",
        sourceNativeId: "svc-orders",
        entityType: "service",
        observedAt: "2026-01-12T10:00:00.000Z",
        recordedAt: "2026-01-12T10:05:00.000Z",
        recordedSequence: 4,
      },
      {
        source: "runtime-scan",
        sourceNativeId: "orders-service",
        entityType: "database",
        observedAt: "2026-01-12T10:00:00.000Z",
        recordedAt: "2026-01-12T10:05:00.000Z",
        recordedSequence: 5,
      },
    ]);
  });

  it("proves scenario 4 single-observation and threshold-anchor seed facts exactly", () => {
    const catalog = loadCatalog();
    const scenario = scenarioById(catalog, "stale-evidence");
    const evidence = loadScenarioEvidence(scenario);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.observedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(evidence[0]?.sourceScopedIdentity).toStrictEqual({
      source: "asset-catalog",
      sourceNativeId: "svc-notifications",
    });
    expect(evidence[0]?.observation).toStrictEqual({
      observationKind: "entity",
      entityType: "service",
    });
    expect(scenario.asOfSeeds).toStrictEqual([
      "2026-02-07T23:59:59.999Z",
      "2026-02-08T00:00:00.000Z",
      "2026-03-03T00:00:00.000Z",
    ]);
  });

  it("proves scenario 5 two-record near-match seed facts exactly", () => {
    const catalog = loadCatalog();
    const evidence = loadScenarioEvidence(
      scenarioById(catalog, "ambiguous-identity"),
    );
    expect(evidence).toHaveLength(2);
    expect(
      evidence.map((record) => ({
        sourceScopedIdentity: record.sourceScopedIdentity,
        observation: record.observation,
      })),
    ).toStrictEqual([
      {
        sourceScopedIdentity: {
          source: "config-index",
          sourceNativeId: "ledger-api",
        },
        observation: { observationKind: "entity", entityType: "service" },
      },
      {
        sourceScopedIdentity: {
          source: "service-directory",
          sourceNativeId: "ledger",
        },
        observation: { observationKind: "entity", entityType: "service" },
      },
    ]);
  });

  it("proves scenario 6 relationship-switch and interval-boundary seed facts exactly", () => {
    const catalog = loadCatalog();
    const scenario = scenarioById(
      catalog,
      "relationship-appearance-disappearance",
    );
    const evidence = loadScenarioEvidence(scenario);
    const relationships = evidence.filter(
      (record) => record.observation.observationKind === "relationship",
    );
    expect(
      relationships.map((record) => {
        if (record.observation.observationKind !== "relationship") {
          throw new Error(`${record.identifier} must be Relationship Evidence`);
        }
        return {
          recordedSequence: record.recordedSequence,
          observedAt: record.observedAt,
          sourceScopedIdentity: record.sourceScopedIdentity,
          relationshipType: record.observation.relationshipType,
          sourceEntityIdentity: record.observation.sourceEntityIdentity,
          targetEntityIdentity: record.observation.targetEntityIdentity,
        };
      }),
    ).toStrictEqual([
      {
        recordedSequence: 10,
        observedAt: "2026-03-02T00:00:00.000Z",
        sourceScopedIdentity: {
          source: "trace-index",
          sourceNativeId: "checkout-payment-call",
        },
        relationshipType: "calls",
        sourceEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "service-checkout",
        },
        targetEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "svc-payments",
        },
      },
      {
        recordedSequence: 11,
        observedAt: "2026-03-05T00:00:00.000Z",
        sourceScopedIdentity: {
          source: "trace-index",
          sourceNativeId: "checkout-payment-call",
        },
        relationshipType: "calls",
        sourceEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "service-checkout",
        },
        targetEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "svc-payments",
        },
      },
      {
        recordedSequence: 13,
        observedAt: "2026-03-10T00:00:00.000Z",
        sourceScopedIdentity: {
          source: "trace-index",
          sourceNativeId: "checkout-payment-call",
        },
        relationshipType: "calls",
        sourceEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "service-checkout",
        },
        targetEntityIdentity: {
          source: "trace-index",
          sourceNativeId: "svc-fulfillment",
        },
      },
    ]);
    expect(scenario.asOfSeeds).toStrictEqual([
      "2026-03-09T23:59:59.999Z",
      "2026-03-10T00:00:00.000Z",
    ]);
  });

  it("proves scenario 7 staged multi-entity topology seed facts exactly", () => {
    const catalog = loadCatalog();
    const scenario = scenarioById(catalog, "historical-as-of-topology");
    const evidence = loadScenarioEvidence(scenario);
    const entityFacts = evidence
      .filter((record) => record.observation.observationKind === "entity")
      .map((record) => ({
        source: record.sourceScopedIdentity.source,
        sourceNativeId: record.sourceScopedIdentity.sourceNativeId,
        entityType:
          record.observation.observationKind === "entity"
            ? record.observation.entityType
            : undefined,
        stage: requireRecord(record.detail, `${record.identifier}.detail`)[
          "topologyStage"
        ],
      }));
    const relationshipFacts = evidence
      .filter((record) => record.observation.observationKind === "relationship")
      .map((record) => {
        if (record.observation.observationKind !== "relationship") {
          throw new Error(`${record.identifier} must be Relationship Evidence`);
        }
        return {
          source: record.sourceScopedIdentity.source,
          sourceNativeId: record.sourceScopedIdentity.sourceNativeId,
          relationshipType: record.observation.relationshipType,
          sourceEntityIdentity: record.observation.sourceEntityIdentity,
          targetEntityIdentity: record.observation.targetEntityIdentity,
          stage: requireRecord(record.detail, `${record.identifier}.detail`)[
            "topologyStage"
          ],
        };
      });

    expect(entityFacts).toStrictEqual([
      {
        source: "architecture-feed",
        sourceNativeId: "web",
        entityType: "service",
        stage: 1,
      },
      {
        source: "architecture-feed",
        sourceNativeId: "api",
        entityType: "service",
        stage: 1,
      },
      {
        source: "architecture-feed",
        sourceNativeId: "worker",
        entityType: "service",
        stage: 2,
      },
      {
        source: "architecture-feed",
        sourceNativeId: "archive",
        entityType: "database",
        stage: 3,
      },
    ]);
    expect(relationshipFacts).toStrictEqual([
      {
        source: "architecture-feed",
        sourceNativeId: "web-calls-api",
        relationshipType: "calls",
        sourceEntityIdentity: {
          source: "architecture-feed",
          sourceNativeId: "web",
        },
        targetEntityIdentity: {
          source: "architecture-feed",
          sourceNativeId: "api",
        },
        stage: 1,
      },
      {
        source: "architecture-feed",
        sourceNativeId: "api-publishes-worker",
        relationshipType: "publishes-to",
        sourceEntityIdentity: {
          source: "architecture-feed",
          sourceNativeId: "api",
        },
        targetEntityIdentity: {
          source: "architecture-feed",
          sourceNativeId: "worker",
        },
        stage: 2,
      },
      {
        source: "architecture-feed",
        sourceNativeId: "worker-writes-archive",
        relationshipType: "writes-to",
        sourceEntityIdentity: {
          source: "architecture-feed",
          sourceNativeId: "worker",
        },
        targetEntityIdentity: {
          source: "architecture-feed",
          sourceNativeId: "archive",
        },
        stage: 3,
      },
    ]);
    expect(scenario.asOfSeeds).toStrictEqual([
      "2026-04-01T12:00:00.000Z",
      "2026-04-10T12:00:00.000Z",
      "2026-04-20T12:00:00.000Z",
    ]);
  });

  it("proves every raw Relationship endpoint has matching source-scoped Entity Evidence", () => {
    const catalog = loadCatalog();
    const combinedEvidence = catalog.scenarios.flatMap(loadScenarioEvidence);
    const entityIdentities = new Set(
      combinedEvidence.flatMap((record) =>
        record.observation.observationKind === "entity"
          ? [sourceIdentityKey(record.sourceScopedIdentity)]
          : [],
      ),
    );

    for (const record of combinedEvidence) {
      if (record.observation.observationKind !== "relationship") continue;
      for (const [endpointName, endpoint] of [
        ["sourceEntityIdentity", record.observation.sourceEntityIdentity],
        ["targetEntityIdentity", record.observation.targetEntityIdentity],
      ] as const) {
        expect(
          entityIdentities.has(sourceIdentityKey(endpoint)),
          `${record.identifier} has unresolved ${endpointName} ${endpoint.source}:${endpoint.sourceNativeId}`,
        ).toBe(true);
      }
    }
  });

  it("proves the exact ordering, horizon, late-old, and boundary edge seeds", () => {
    const catalog = loadCatalog();
    const combinedEvidence = catalog.scenarios.flatMap(loadScenarioEvidence);
    const sequence4 = evidenceBySequence(combinedEvidence, 4);
    const sequence5 = evidenceBySequence(combinedEvidence, 5);
    expect(sequence4.recordedAt).toBe("2026-01-12T10:05:00.000Z");
    expect(sequence5.recordedAt).toBe(sequence4.recordedAt);
    expect(sequence4.recordedSequence).not.toBe(sequence5.recordedSequence);

    const sequence1 = evidenceBySequence(combinedEvidence, 1);
    const sequence2 = evidenceBySequence(combinedEvidence, 2);
    expect(sequence1.observedAt).toBe(sequence2.observedAt);
    expect(sequence4.observedAt).toBe(sequence5.observedAt);

    const sequence12 = evidenceBySequence(combinedEvidence, 12);
    const sequence11 = evidenceBySequence(combinedEvidence, 11);
    expect(sequence12.sourceScopedIdentity).toStrictEqual({
      source: "trace-index",
      sourceNativeId: "svc-fulfillment",
    });
    expect(sequence12.recordedSequence).toBeGreaterThan(
      sequence11.recordedSequence,
    );
    expect(sequence12.observedAt < sequence11.observedAt).toBe(true);
    expect(sequence12.recordedAt > sequence11.recordedAt).toBe(true);

    expect(
      scenarioById(catalog, "late-corroboration-revision-seed").horizons,
    ).toStrictEqual({
      beforeLateCorroboration: 2,
      afterLateCorroboration: 3,
    });
    expect(
      scenarioById(catalog, "relationship-appearance-disappearance").asOfSeeds,
    ).toStrictEqual(["2026-03-09T23:59:59.999Z", "2026-03-10T00:00:00.000Z"]);
  });

  it("proves snapshot request seeds differ only by derivation version", () => {
    const seeds = loadCatalog().snapshotIdentitySeeds;
    expect(seeds).toHaveLength(2);
    expect(seeds[0]?.asOf).toBe(seeds[1]?.asOf);
    expect(seeds[0]?.horizon).toBe(seeds[1]?.horizon);
    expect(seeds.map((seed) => seed.derivationVersion)).toStrictEqual([
      "m1-v1",
      "m1-v2",
    ]);
  });

  it("uses manifest-driven path-and-code expectations for every invalid fixture", () => {
    const catalog = loadCatalog();
    expect(catalog.invalidCases.map((entry) => entry.id)).toStrictEqual(
      EXPECTED_INVALID_CASE_IDS,
    );

    for (const invalidCase of catalog.invalidCases) {
      const result = evidenceCollectionSchema.safeParse(
        readJson(invalidCase.evidenceFile),
      );
      expect(
        result.success,
        `${invalidCase.id} must be rejected: ${invalidCase.reason}`,
      ).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some(
            (issue) =>
              issue.code === invalidCase.expectedIssueCode &&
              JSON.stringify(issue.path) ===
                JSON.stringify(invalidCase.expectedIssuePath),
          ),
          `${invalidCase.id} must report ${invalidCase.expectedIssueCode} at ${JSON.stringify(invalidCase.expectedIssuePath)}`,
        ).toBe(true);
      }
    }
  });

  it("rejects precomputed derived output from valid data and fixture metadata", () => {
    const catalog = loadCatalog();
    for (const scenario of catalog.scenarios) {
      auditNoDerivedOutput(scenario, `catalog scenario ${scenario.id}`);
      auditNoDerivedOutput(
        readJson(scenario.evidenceFile),
        scenario.evidenceFile,
      );
    }
    for (const invalidCase of catalog.invalidCases) {
      auditNoDerivedOutput(
        invalidCase,
        `catalog invalid case ${invalidCase.id}`,
      );
      auditNoDerivedOutput(
        readJson(invalidCase.evidenceFile),
        invalidCase.evidenceFile,
      );
    }
    // snapshotIdentitySeeds are intentionally excluded: they are authorized
    // request identities, not precomputed snapshot output.
  });
});
