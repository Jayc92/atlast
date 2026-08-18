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
 */
const healthResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service"],
  properties: {
    status: { type: "string", enum: ["ok"] },
    service: { type: "string", enum: ["atlast-api"] },
  },
} as const;

export interface ApplicationDependencies {
  readonly evidenceStore: EvidenceStore;
  readonly topologyGraphStore: TopologyGraphStore;
  readonly operationalOverlayStore: OperationalOverlayStore;
}

/**
 * Build the fully assembled application: `/health`, the eight M1/M2 query
 * routes, the M3 health-context route, the M4 impact route, and the closed
 * error boundary. Every
 * call requires the complete repository dependency pair — there is no
 * default, throwaway, or health-only variant (ADR-0024 § 12).
 */
export function buildApplication(
  dependencies: ApplicationDependencies,
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
    () => ({ status: "ok", service: "atlast-api" }),
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
 * Asynchronously create and seed a fresh, isolated store pair, then build
 * the application over it (ADR-0024 § 12). Ingestion completes **before**
 * `buildApplication` is ever called, so the returned `FastifyInstance` is
 * fully populated the moment it exists — no caller can obtain an instance
 * whose store is still being seeded. Each call constructs its own fresh
 * pair; there is no shared singleton.
 */
export async function initializeApplication(
  clock: Clock,
  seedEvidence: readonly Evidence[],
  seedOverlayFrames: readonly OverlayFrame[],
  serverOptions: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const evidenceStore = new InMemoryEvidenceStore(clock);
  const topologyGraphStore = new InMemoryTopologyGraphStore(
    evidenceStore,
    clock,
  );
  const operationalOverlayStore = new InMemoryOperationalOverlayStore(
    seedOverlayFrames,
  );
  await evidenceStore.appendEvidence(seedEvidence);
  return buildApplication(
    { evidenceStore, topologyGraphStore, operationalOverlayStore },
    serverOptions,
  );
}
