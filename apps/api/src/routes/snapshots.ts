/**
 * Route 7 (ADR-0024 §§ 1-2, 6): snapshot summary. Always pinned — `asOf`,
 * `horizon`, and `derivationVersion` are all required, with no latest mode
 * and no `limit`/`cursor`. The repository's flat `SnapshotSummary` is
 * reshaped into the narrower `snapshotSummaryDataSchema` envelope (§ 6).
 */
import type { FastifyInstance } from "fastify";
import {
  MAXIMUM_PAGE_LIMIT,
  snapshotAnchorsResultSchema,
  snapshotDetailResultSchema,
  type EvidenceStore,
  type TopologyGraphStore,
} from "@atlast/shared";
import {
  ACTIVE_DERIVATION_VERSION,
  InvalidReadCoordinateError,
} from "@atlast/graph-model";
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
const SNAPSHOT_ANCHOR_QUERY_KEYS: ReadonlySet<string> = new Set();
const MAXIMUM_RETURNED_ANCHORS = 100;
const MAXIMUM_RESOLVED_CANDIDATES = MAXIMUM_RETURNED_ANCHORS + 1;

export function registerSnapshotRoutes(
  app: FastifyInstance,
  dependencies: {
    readonly evidenceStore: EvidenceStore;
    readonly topologyGraphStore: TopologyGraphStore;
  },
): void {
  app.get("/api/v1/snapshot-anchors", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    rejectUnknownQueryKeys(query, SNAPSHOT_ANCHOR_QUERY_KEYS);

    const resolvedHorizon =
      await dependencies.evidenceStore.getCurrentWatermark();
    if (resolvedHorizon === 0) {
      throw new InvalidReadCoordinateError({ reason: "EMPTY_EVIDENCE_STORE" });
    }

    const observedAtValues = new Set<string>();
    let schemaVersion: string | undefined;
    let cursor: string | undefined;
    do {
      const page = await dependencies.evidenceStore.listEvidence(
        resolvedHorizon,
        cursor === undefined
          ? { limit: MAXIMUM_PAGE_LIMIT }
          : { limit: MAXIMUM_PAGE_LIMIT, cursor },
      );
      for (const evidence of page.items) {
        schemaVersion ??= evidence.schemaVersion;
        observedAtValues.add(evidence.observedAt);
      }
      cursor = page.page.hasMore ? page.page.nextCursor : undefined;
    } while (cursor !== undefined);

    const candidates = [...observedAtValues]
      .sort((left, right) => right.localeCompare(left))
      .slice(0, MAXIMUM_RESOLVED_CANDIDATES);
    const summaries = await Promise.all(
      candidates.map((asOf) =>
        dependencies.topologyGraphStore.getSnapshotSummary({
          asOf,
          horizon: resolvedHorizon,
          derivationVersion: ACTIVE_DERIVATION_VERSION,
        }),
      ),
    );
    const returnedSummaries = summaries.slice(0, MAXIMUM_RETURNED_ANCHORS);
    if (schemaVersion === undefined) {
      throw new InvalidReadCoordinateError({ reason: "EMPTY_EVIDENCE_STORE" });
    }

    sendValidatedResponse(
      reply,
      snapshotAnchorsResultSchema,
      {
        items: returnedSummaries.map((summary) => ({
          identity: summary.identity,
          checksum: summary.checksum,
          subjectCount: summary.subjectCount,
        })),
        truncated: summaries.length > MAXIMUM_RETURNED_ANCHORS,
        meta: {
          schemaVersion,
          resolvedHorizon,
          derivationVersion: ACTIVE_DERIVATION_VERSION,
        },
      },
      "GET /api/v1/snapshot-anchors",
    );
  });

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
