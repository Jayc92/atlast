/**
 * Network startup for the Atlast backend API — the M1 Slice S7 query API v1
 * (ADR-0024 § 12). The API binds to the loopback interface only — there is
 * deliberately no configuration path to bind to any other interface,
 * keeping the unauthenticated shell structurally unreachable from the
 * network (GUARDRAILS.md § 1.4, ADR-0004). Widening the bind address
 * requires the separately approved authentication ADR first.
 *
 * The production `Clock` and the fixture Evidence catalog are constructed
 * and loaded only here — the one place `apps/api` may read wall-clock time
 * or touch the filesystem (ADR-0024 § 12).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { evidenceCollectionSchema, type Evidence } from "@atlast/shared";
import { assertValidClockReading, type Clock } from "@atlast/graph-model";
import { initializeApplication } from "./app.ts";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_PORT = 3001;

/**
 * The real system clock, validated on every reading against the shared
 * canonical-timestamp contract before it ever reaches the store (ADR-0023
 * § 1: no code path in `packages/graph-model` reads wall-clock time itself —
 * only the application's own composition root may supply it).
 */
const systemClock: Clock = () =>
  assertValidClockReading(new Date().toISOString());

const FIXTURE_ROOT = fileURLToPath(
  new URL("../../../fixtures/demo-company/", import.meta.url),
);

interface CatalogScenario {
  readonly evidenceFile: string;
}
interface Catalog {
  readonly scenarios: readonly CatalogScenario[];
}

function loadFixtureJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(FIXTURE_ROOT + relativePath, "utf8"));
}

/**
 * Every valid `demo-company` scenario record, loaded in catalog order and
 * validated once through the shared `evidenceCollectionSchema` — the same
 * loading pattern `packages/graph-model/src/contract-suite.test.ts` already
 * uses. `catalog.json`'s `invalidCases` (schema-rejection fixtures, never
 * valid seed Evidence) and `snapshotIdentitySeeds` (request identities, not
 * Evidence records) are deliberately never loaded here — only the
 * manifest-declared valid scenario files, never precomputed graph output
 * (fixtures remain pipeline inputs, per ADR-0014).
 */
function loadDemoCompanySeedEvidence(): readonly Evidence[] {
  const catalog = loadFixtureJson("catalog.json") as Catalog;
  return evidenceCollectionSchema.parse(
    catalog.scenarios.flatMap(
      (scenario) => loadFixtureJson(scenario.evidenceFile) as unknown[],
    ),
  );
}

function resolvePort(rawPortValue: string | undefined): number {
  if (rawPortValue === undefined || rawPortValue === "") {
    return DEFAULT_PORT;
  }
  const parsedPort = Number(rawPortValue);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(
      `Invalid ATLAST_API_PORT value "${rawPortValue}": expected an integer between 1 and 65535.`,
    );
  }
  return parsedPort;
}

async function startServer(): Promise<void> {
  const application: FastifyInstance = await initializeApplication(
    systemClock,
    loadDemoCompanySeedEvidence(),
  );
  const port = resolvePort(process.env["ATLAST_API_PORT"]);

  // Close cleanly on normal termination so no socket or process is left
  // behind; a second signal during shutdown falls through to default
  // termination rather than hanging.
  for (const terminationSignal of ["SIGINT", "SIGTERM"] as const) {
    process.once(terminationSignal, () => {
      application.close().then(
        () => process.exit(0),
        (closeError: unknown) => {
          console.error(
            `Error while closing on ${terminationSignal}:`,
            closeError,
          );
          process.exit(1);
        },
      );
    });
  }

  await application.listen({ host: LOOPBACK_HOST, port });
  console.log(
    `atlast-api listening on http://${LOOPBACK_HOST}:${String(port)}`,
  );
}

startServer().catch((startupError: unknown) => {
  // Startup failure is fatal and explicit — never swallowed (GUARDRAILS.md § 2).
  console.error("atlast-api failed to start:", startupError);
  process.exit(1);
});
