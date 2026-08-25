/**
 * Application construction for the Atlast backend API — the M1 Slice S7
 * query API v1 (ADR-0024 § 12). Construction is deliberately separated from
 * network startup (`server.ts`) and from store initialization
 * (`initializeApplication`, also in this module) so tests drive the fully
 * assembled application through `fastify.inject()` without ever opening a
 * socket (ADR-0009).
 *
 * `buildApplication` always requires its repository dependencies and always
 * registers `/health` plus all ten product routes — there is no conditional
 * registration and no zero-argument call form. Every `FastifyInstance` this
 * function produces exposes the identical route set, whether in production
 * or in any test, satisfying ADR-0009's "the fully assembled application"
 * testing requirement with one application shape, never two.
 */
import {
  fastify,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import type {
  Evidence,
  EvidenceStore,
  OperationalOverlayStore,
  OverlayFrame,
  TopologyGraphStore,
} from "@atlast/shared";
import {
  InMemoryEvidenceStore,
  InMemoryTopologyGraphStore,
  type Clock,
} from "@atlast/graph-model";
import { InMemoryOperationalOverlayStore } from "@atlast/overlay-model";
import { mapFrameworkError, registerErrorHandling } from "./http/errors.ts";
import { registerEntityRoutes } from "./routes/entities.ts";
import { registerEvidenceRoutes } from "./routes/evidence.ts";
import { registerHealthContextRoutes } from "./routes/health-context.ts";
import { registerImpactRoutes } from "./routes/impact.ts";
import { registerSearchRoutes } from "./routes/search.ts";
import { registerSnapshotRoutes } from "./routes/snapshots.ts";
import { registerTraversalRoutes } from "./routes/traversal.ts";

/**
 * Response contract for `GET /health`. Declared as a Fastify JSON schema so
 * the contract is machine-readable and enforced at the boundary (ADR-0004:
 * every route declares its input/output schema). Single-value enums pin the
 * payload to exactly the deterministic response the shell promises. This
 * route's behavior is unchanged by S7 — only the application it is now
 * registered alongside has grown.
 *
 * `datasetMode` (ADR-0040 § 1, M6-A) is the accepted dataset-mode
 * observability surface: it reports, authoritatively, whether this running
 * process was seeded from the synthetic `demo-company` fixture catalog or
 * from the real Kubernetes connector — never both in one process (ADR-0040
 * §§ 1, 5). A tester (or the browser's own source/freshness UI, M6-B) reads
 * this field to know unambiguously which topology they are looking at,
 * rather than inferring it from which entities happen to appear.
 */
const healthResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service", "datasetMode"],
  properties: {
    status: { type: "string", enum: ["ok"] },
    service: { type: "string", enum: ["atlast-api"] },
    datasetMode: { type: "string", enum: ["fixture", "connector"] },
  },
} as const;

export interface ApplicationDependencies {
  readonly evidenceStore: EvidenceStore;
  readonly topologyGraphStore: TopologyGraphStore;
  readonly operationalOverlayStore: OperationalOverlayStore;
}

/**
 * The two mutually exclusive M6-A dataset modes (ADR-0040 § 1): `"fixture"`
 * seeds from the synthetic `demo-company` catalog (the existing, unmodified
 * M0–M5 default); `"connector"` seeds from, and is kept live by, the real
 * Kubernetes connector. A single running process is always exactly one of
 * these — never both, and never switched at runtime.
 */
export type DatasetMode = "fixture" | "connector";

const DEFAULT_DATASET_MODE: DatasetMode = "fixture";

/**
 * Build the fully assembled application: `/health`, the eight M1/M2 query
 * routes, the M3 health-context route, the M4 impact route, and the closed
 * error boundary. Every
 * call requires the complete repository dependency pair — there is no
 * default, throwaway, or health-only variant (ADR-0024 § 12). `datasetMode`
 * defaults to `"fixture"` so every existing call site's behavior (including
 * every pre-existing test) is unaffected unless it explicitly opts into
 * `"connector"` (ADR-0040 § 1).
 */
export function buildApplication(
  dependencies: ApplicationDependencies,
  datasetMode: DatasetMode = DEFAULT_DATASET_MODE,
  serverOptions: FastifyServerOptions = {},
): FastifyInstance {
  const application = fastify({
    ...serverOptions,
    frameworkErrors: mapFrameworkError,
  });

  application.get(
    "/health",
    {
      schema: {
        response: {
          200: healthResponseJsonSchema,
        },
      },
    },
    () => ({ status: "ok", service: "atlast-api", datasetMode }),
  );

  registerEntityRoutes(application, dependencies);
  registerSearchRoutes(application, dependencies);
  registerTraversalRoutes(application, dependencies);
  registerHealthContextRoutes(application, dependencies);
  registerImpactRoutes(application, dependencies);
  registerEvidenceRoutes(application, dependencies);
  registerSnapshotRoutes(application, dependencies);

  registerErrorHandling(application);

  return application;
}

/**
 * Constructs a fresh, isolated store pair and seeds it. Ingestion
 * completes **before** the caller ever builds an application over it, so
 * no caller can observe a store that is still being seeded. Each call
 * constructs its own fresh pair; there is no shared singleton. Shared by
 * `initializeApplication` and `initializeApplicationExposingStores` so
 * the two differ only in what they return to their caller, never in how
 * the stores are constructed or seeded.
 */
async function initializeStores(
  clock: Clock,
  seedEvidence: readonly Evidence[],
  seedOverlayFrames: readonly OverlayFrame[],
): Promise<ApplicationDependencies> {
  const evidenceStore = new InMemoryEvidenceStore(clock);
  const topologyGraphStore = new InMemoryTopologyGraphStore(
    evidenceStore,
    clock,
  );
  const operationalOverlayStore = new InMemoryOperationalOverlayStore(
    seedOverlayFrames,
  );
  await evidenceStore.appendEvidence(seedEvidence);
  return { evidenceStore, topologyGraphStore, operationalOverlayStore };
}

/**
 * Asynchronously create and seed a fresh, isolated store pair, then build
 * the application over it (ADR-0024 § 12). Ingestion completes **before**
 * `buildApplication` is ever called, so the returned `FastifyInstance` is
 * fully populated the moment it exists — no caller can obtain an instance
 * whose store is still being seeded. Each call constructs its own fresh
 * pair; there is no shared singleton. `datasetMode` defaults to `"fixture"`
 * so every existing caller's behavior is unaffected (ADR-0040 § 1).
 */
export async function initializeApplication(
  clock: Clock,
  seedEvidence: readonly Evidence[],
  seedOverlayFrames: readonly OverlayFrame[],
  datasetMode: DatasetMode = DEFAULT_DATASET_MODE,
  serverOptions: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const dependencies = await initializeStores(
    clock,
    seedEvidence,
    seedOverlayFrames,
  );
  return buildApplication(dependencies, datasetMode, serverOptions);
}

export interface InitializedApplication {
  readonly application: FastifyInstance;
  readonly dependencies: ApplicationDependencies;
}

/**
 * Originally M5-A only (ADR-0036/0037; docs/m5-plan.md §§ 3, 7); now also
 * the composition-root seam `apps/api/src/connector-mode.ts` uses for the
 * unified, normal production entrypoint's `"connector"` dataset mode
 * (M6-A, ADR-0040 §§ 2, 5).
 *
 * Identical construction and seeding to `initializeApplication`, but also
 * returns the constructed `ApplicationDependencies` to its caller, so a
 * post-boot Kubernetes discovery adapter can call
 * `dependencies.evidenceStore.appendEvidence(...)` against the exact same
 * store instance the returned, already-running application serves reads
 * from — the seam M5-A's live post-boot ingestion proof first required and
 * M6-A's normal-website proof now reuses. This does not create a second
 * application shape: `buildApplication` is called exactly as
 * `initializeApplication` calls it, with the identical route/schema/query
 * behavior every existing test already exercises (docs/m5-plan.md § 3's
 * ADR-0009 reconciliation note).
 */
export async function initializeApplicationExposingStores(
  clock: Clock,
  seedEvidence: readonly Evidence[],
  seedOverlayFrames: readonly OverlayFrame[],
  datasetMode: DatasetMode = DEFAULT_DATASET_MODE,
  serverOptions: FastifyServerOptions = {},
): Promise<InitializedApplication> {
  const dependencies = await initializeStores(
    clock,
    seedEvidence,
    seedOverlayFrames,
  );
  const application = buildApplication(
    dependencies,
    datasetMode,
    serverOptions,
  );
  return { application, dependencies };
}
