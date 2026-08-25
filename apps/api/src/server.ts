/**
 * Network startup for the Atlast backend API — the M1 Slice S7 query API v1
 * (ADR-0024 § 12), now the single, unified production/pilot entrypoint for
 * M6-A (ADR-0040 §§ 1-2). The API binds to the loopback interface only —
 * there is deliberately no configuration path to bind to any other
 * interface, keeping the unauthenticated shell structurally unreachable
 * from the network (GUARDRAILS.md § 1.4, ADR-0004). Widening the bind
 * address requires the separately approved authentication ADR first.
 *
 * Exactly one of two mutually exclusive dataset modes is active per process
 * (ADR-0040 § 1), selected by `ATLAST_DATASET_MODE`:
 *
 * - **`"fixture"` (the default when the variable is absent or empty)** —
 *   existing, unmodified M0–M5 behavior: seeds the demo-company fixture
 *   catalog and starts no Kubernetes dependency whatsoever. This remains
 *   the default specifically so no existing deployment or test invocation
 *   of this entrypoint changes behavior unless it explicitly opts in.
 * - **`"connector"` (M6-A)** — seeds nothing and instead starts the real
 *   Kubernetes connector's poll loop against the exact same
 *   `EvidenceStore`/`TopologyGraphStore` pair this process serves reads
 *   from (`connector-mode.ts`). Never combined with fixture seeding in one
 *   process.
 *
 * The production `Clock`, fixture Evidence catalog, and immutable overlay
 * frames are constructed and loaded only here — the one place `apps/api`
 * may read wall-clock time or touch the filesystem (ADRs 0024 and 0030).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import {
  evidenceCollectionSchema,
  overlayFrameCollectionSchema,
  type Evidence,
  type OverlayFrame,
} from "@atlast/shared";
import { assertValidClockReading, type Clock } from "@atlast/graph-model";
import { startConnectorDatasetMode } from "./connector-mode.ts";
import { initializeApplication } from "./app.ts";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_PORT = 3001;
const DEFAULT_KUBERNETES_POLL_INTERVAL_MS = 2000;

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
interface OverlayCatalogFrame {
  readonly frameFile: string;
}
interface OverlayCatalog {
  readonly frames: readonly OverlayCatalogFrame[];
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

function loadDemoCompanyOverlayFrames(): readonly OverlayFrame[] {
  const catalog = loadFixtureJson("overlays/catalog.json") as OverlayCatalog;
  return overlayFrameCollectionSchema.parse(
    catalog.frames.map((frame) =>
      loadFixtureJson(`overlays/${frame.frameFile}`),
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

/** `"fixture"` when absent/empty — existing M0–M5 behavior is the default (ADR-0040 § 1). */
function resolveDatasetMode(
  rawValue: string | undefined,
): "fixture" | "connector" {
  if (rawValue === undefined || rawValue === "") {
    return "fixture";
  }
  if (rawValue === "fixture" || rawValue === "connector") {
    return rawValue;
  }
  throw new Error(
    `Invalid ATLAST_DATASET_MODE value ${JSON.stringify(rawValue)}: expected "fixture" or "connector".`,
  );
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable ${name}. Connector dataset mode never resolves an ambient/default kubeconfig context — the kubeconfig path, context name, and namespace must be supplied explicitly (ADR-0037 § 3).`,
    );
  }
  return value;
}

function resolvePollIntervalMs(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue === "") {
    return DEFAULT_KUBERNETES_POLL_INTERVAL_MS;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 250) {
    throw new Error(
      `Invalid ATLAST_KUBERNETES_POLL_INTERVAL_MS value ${JSON.stringify(rawValue)}: expected an integer of at least 250.`,
    );
  }
  return parsed;
}

/**
 * Registers the one shutdown shape both dataset modes share: stop any extra
 * lifecycle (the poll timer, in connector mode) first, then close the
 * Fastify instance cleanly, then exit — a second signal during shutdown
 * falls through to default termination rather than hanging.
 */
function registerShutdownHandlers(
  application: FastifyInstance,
  stopExtra?: () => void,
): void {
  for (const terminationSignal of ["SIGINT", "SIGTERM"] as const) {
    process.once(terminationSignal, () => {
      stopExtra?.();
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
}

async function startFixtureMode(port: number): Promise<void> {
  const application: FastifyInstance = await initializeApplication(
    systemClock,
    loadDemoCompanySeedEvidence(),
    loadDemoCompanyOverlayFrames(),
    "fixture",
  );
  registerShutdownHandlers(application);
  await application.listen({ host: LOOPBACK_HOST, port });
  console.log(
    `atlast-api listening on http://${LOOPBACK_HOST}:${String(port)} (dataset=fixture)`,
  );
}

/**
 * M6-A connector dataset mode (ADR-0040). Pre-flight (the mandatory
 * `listPods` call inside `startConnectorDatasetMode`, exercising the
 * accepted ADR-0037 § 4 target guard) must succeed before this process ever
 * binds its listening port — a failure here propagates to `startServer`'s
 * top-level `.catch(...)` and the process exits nonzero, exactly like a
 * fixture-mode ingestion failure would; it is never a silent fall-back to
 * fixtures and never a partially initialized application.
 */
async function startConnectorMode(port: number): Promise<void> {
  const kubeconfigPath = requiredEnv("ATLAST_KUBERNETES_KUBECONFIG");
  const contextName = requiredEnv("ATLAST_KUBERNETES_KUBE_CONTEXT");
  const namespace = requiredEnv("ATLAST_KUBERNETES_NAMESPACE");
  const pollIntervalMs = resolvePollIntervalMs(
    process.env["ATLAST_KUBERNETES_POLL_INTERVAL_MS"],
  );

  const { application, pollOnce, stopPolling } =
    await startConnectorDatasetMode({
      kubeconfigPath,
      contextName,
      namespace,
      pollIntervalMs,
      clock: systemClock,
    });

  registerShutdownHandlers(application, stopPolling);

  await application.listen({ host: LOOPBACK_HOST, port });
  console.log(
    `atlast-api listening on http://${LOOPBACK_HOST}:${String(port)} (dataset=connector, namespace=${namespace}, context=${contextName}, pollIntervalMs=${String(pollIntervalMs)})`,
  );

  // One immediate poll on boot, strictly after the application is already
  // listening — mirroring the M5-A live post-boot ingestion proof's exact
  // ordering (`docs/audits/m0-synthetic-boundary-audit.md § 21.3`). Caught
  // and logged here, never fatal: the process is already serving.
  await pollOnce().catch((pollError: unknown) => {
    console.error("[atlast-api] initial connector poll failed:", pollError);
  });
}

async function startServer(): Promise<void> {
  const port = resolvePort(process.env["ATLAST_API_PORT"]);
  const datasetMode = resolveDatasetMode(process.env["ATLAST_DATASET_MODE"]);
  if (datasetMode === "connector") {
    await startConnectorMode(port);
    return;
  }
  await startFixtureMode(port);
}

startServer().catch((startupError: unknown) => {
  // Startup failure is fatal and explicit — never swallowed (GUARDRAILS.md § 2).
  console.error("atlast-api failed to start:", startupError);
  process.exit(1);
});
