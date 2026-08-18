/**
 * Loader and structural validator for the M4-B hand-authored accuracy-
 * harness scenario catalog (ADR-0035 §§ 2-3), `fixtures/demo-company/
 * impact-scenarios/`. This lives in `apps/api` rather than
 * `packages/impact-model` because the harness replays each scenario against
 * the real fixture-backed `TopologyGraphStore` (`@atlast/graph-model`),
 * which `packages/impact-model` deliberately does not depend on
 * (ADR-0032 § 3); `apps/api` already depends on both and already has the
 * identical `demo-company` fixture-loading convention this module reuses
 * (ADR-0024 § 12's `fileURLToPath`/`readFileSync` pattern).
 *
 * `apps/api` declares no direct dependency on `zod` (ADR-0024 § 13): every
 * structural check here calls `.safeParse()` on a schema already imported
 * from `@atlast/shared`, exactly as `../http/query-coercion.ts` does — no
 * `zod` import is added by this module.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  entityIdentifierSchema,
  impactChangeTypeSchema,
  impactResultSchema,
  snapshotIdentitySchema,
  traversalRequestBoundsSchema,
  type EntityIdentifier,
  type ImpactChangeType,
  type ImpactResult,
  type SnapshotIdentity,
  type TraversalRequestBounds,
} from "@atlast/shared";

const FIXTURE_ROOT = fileURLToPath(
  new URL(
    "../../../../fixtures/demo-company/impact-scenarios/",
    import.meta.url,
  ),
);

export interface ImpactScenarioIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** Thrown by {@link loadImpactScenario}/{@link loadImpactScenarioCatalog} for any structurally invalid fixture. */
export class ImpactScenarioValidationError extends Error {
  readonly issues: readonly ImpactScenarioIssue[];

  constructor(issues: readonly ImpactScenarioIssue[]) {
    super(
      `Invalid impact-scenario fixture: ${issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "ImpactScenarioValidationError";
    this.issues = issues;
  }
}

export interface ImpactScenario {
  readonly id: string;
  readonly description: string;
  readonly originEntityIdentifier: EntityIdentifier;
  readonly changeType: ImpactChangeType;
  readonly bounds: TraversalRequestBounds;
  readonly pin: SnapshotIdentity;
  readonly expectedResults: readonly ImpactResult[];
}

const SCENARIO_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "id",
  "description",
  "originEntityIdentifier",
  "changeType",
  "direction",
  "depth",
  "minimumConfidence",
  "pin",
  "expectedResults",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseField<Output>(
  schema: { safeParse(value: unknown): { success: boolean; data?: Output } },
  value: unknown,
  path: readonly (string | number)[],
  issues: ImpactScenarioIssue[],
): Output | undefined {
  const result = schema.safeParse(value) as
    | { success: true; data: Output }
    | {
        success: false;
        error: {
          issues: readonly { path: readonly PropertyKey[]; message: string }[];
        };
      };
  if (result.success) {
    return result.data;
  }
  for (const issue of result.error.issues) {
    issues.push({
      path: [...path, ...issue.path.map((segment) => String(segment))],
      message: issue.message,
    });
  }
  return undefined;
}

/**
 * Validate one raw scenario JSON value against the exact shape ADR-0035 § 2
 * names, collecting every issue before throwing — never a hand-rolled
 * check bypassing the domain schemas: `originEntityIdentifier`,
 * `changeType`, `direction`/`depth`/`minimumConfidence`, and `pin` each
 * parse through the identical shared schema the real route/engine use, and
 * every `expectedResults` entry parses through `impactResultSchema`.
 */
export function parseImpactScenario(value: unknown): ImpactScenario {
  const issues: ImpactScenarioIssue[] = [];
  if (!isPlainObject(value)) {
    throw new ImpactScenarioValidationError([
      { path: [], message: "A scenario must be a JSON object." },
    ]);
  }

  const unknownKeys = Object.keys(value).filter(
    (key) => !SCENARIO_TOP_LEVEL_KEYS.has(key),
  );
  for (const key of unknownKeys) {
    issues.push({
      path: [key],
      message: `Unrecognized scenario key "${key}".`,
    });
  }

  const id = typeof value["id"] === "string" ? value["id"] : undefined;
  if (id === undefined) {
    issues.push({ path: ["id"], message: "id must be a non-empty string." });
  }
  const description =
    typeof value["description"] === "string" ? value["description"] : undefined;
  if (description === undefined) {
    issues.push({
      path: ["description"],
      message: "description must be a non-empty string.",
    });
  }

  const originEntityIdentifier = parseField(
    entityIdentifierSchema,
    value["originEntityIdentifier"],
    ["originEntityIdentifier"],
    issues,
  );
  const changeType = parseField(
    impactChangeTypeSchema,
    value["changeType"],
    ["changeType"],
    issues,
  );
  const bounds = parseField(
    traversalRequestBoundsSchema,
    {
      direction: value["direction"],
      depth: value["depth"],
      ...(value["minimumConfidence"] !== undefined
        ? { minimumConfidence: value["minimumConfidence"] }
        : {}),
    },
    [],
    issues,
  );
  const pin = parseField(snapshotIdentitySchema, value["pin"], ["pin"], issues);

  const rawExpectedResults = value["expectedResults"];
  const expectedResults: ImpactResult[] = [];
  if (!Array.isArray(rawExpectedResults)) {
    issues.push({
      path: ["expectedResults"],
      message: "expectedResults must be an array.",
    });
  } else {
    rawExpectedResults.forEach((rawResult, index) => {
      const parsedResult = parseField(
        impactResultSchema,
        rawResult,
        ["expectedResults", index],
        issues,
      );
      if (parsedResult !== undefined) {
        expectedResults.push(parsedResult);
      }
    });
  }

  if (issues.length > 0) {
    throw new ImpactScenarioValidationError(issues);
  }

  return {
    id: id as string,
    description: description as string,
    originEntityIdentifier: originEntityIdentifier as EntityIdentifier,
    changeType: changeType as ImpactChangeType,
    bounds: bounds as TraversalRequestBounds,
    pin: pin as SnapshotIdentity,
    expectedResults,
  };
}

function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(FIXTURE_ROOT + relativePath, "utf8"));
}

interface CatalogManifestScenario {
  readonly id: string;
  readonly scenarioFile: string;
}
interface CatalogManifestInvalidCase {
  readonly id: string;
  readonly scenarioFile: string;
  readonly reason: string;
}
interface CatalogManifest {
  readonly scenarios: readonly CatalogManifestScenario[];
  readonly invalidCases: readonly CatalogManifestInvalidCase[];
}

/** Every valid scripted scenario, loaded and structurally validated, in catalog order. */
export function loadImpactScenarioCatalog(): readonly ImpactScenario[] {
  const manifest = loadJson("catalog.json") as CatalogManifest;
  return manifest.scenarios.map((entry) =>
    parseImpactScenario(loadJson(entry.scenarioFile)),
  );
}

export interface ImpactScenarioInvalidCase {
  readonly id: string;
  readonly reason: string;
  readonly rawScenario: unknown;
}

/** Every deliberately invalid scenario fixture, for schema-rejection tests (ADR-0035 § Verification Obligations). */
export function loadImpactScenarioInvalidCases(): readonly ImpactScenarioInvalidCase[] {
  const manifest = loadJson("catalog.json") as CatalogManifest;
  return manifest.invalidCases.map((entry) => ({
    id: entry.id,
    reason: entry.reason,
    rawScenario: loadJson(entry.scenarioFile),
  }));
}
