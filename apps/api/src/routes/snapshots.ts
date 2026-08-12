/**
 * Route 7 (ADR-0024 §§ 1-2, 6): snapshot summary. Always pinned — `asOf`,
 * `horizon`, and `derivationVersion` are all required, with no latest mode
 * and no `limit`/`cursor`. The repository's flat `SnapshotSummary` is
 * reshaped into the narrower `snapshotSummaryDataSchema` envelope (§ 6).
 */
import type { FastifyInstance } from "fastify";
import {
  snapshotDetailResultSchema,
  type TopologyGraphStore,
} from "@atlast/shared";
import {
  asOptionalScalarString,
  rejectUnknownQueryKeys,
  resolveRequiredSnapshotIdentity,
  WIRE_QUERY_PARAM,
} from "../http/query-coercion.ts";
import { sendValidatedResponse } from "../http/respond.ts";

const SNAPSHOT_QUERY_KEYS: ReadonlySet<string> = new Set([
  WIRE_QUERY_PARAM.asOf,
  WIRE_QUERY_PARAM.horizon,
  WIRE_QUERY_PARAM.derivationVersion,
]);

export function registerSnapshotRoutes(
  app: FastifyInstance,
  dependencies: { readonly topologyGraphStore: TopologyGraphStore },
): void {
  app.get("/api/v1/snapshots", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    rejectUnknownQueryKeys(query, SNAPSHOT_QUERY_KEYS);

    const identity = resolveRequiredSnapshotIdentity(
      asOptionalScalarString(
        query[WIRE_QUERY_PARAM.asOf],
        WIRE_QUERY_PARAM.asOf,
      ),
      asOptionalScalarString(
        query[WIRE_QUERY_PARAM.horizon],
        WIRE_QUERY_PARAM.horizon,
      ),
      asOptionalScalarString(
        query[WIRE_QUERY_PARAM.derivationVersion],
        WIRE_QUERY_PARAM.derivationVersion,
      ),
    );

    const summary =
      await dependencies.topologyGraphStore.getSnapshotSummary(identity);
    sendValidatedResponse(
      reply,
      snapshotDetailResultSchema,
      {
        data: {
          checksum: summary.checksum,
          subjectCount: summary.subjectCount,
        },
        meta: {
          resolvedIdentity: summary.identity,
          schemaVersion: summary.schemaVersion,
        },
      },
      "GET /api/v1/snapshots",
    );
  });
}
