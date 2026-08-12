/**
 * Routes 5 and 6 (ADR-0024 §§ 1-2, 7): Evidence lookup and the entity-scoped
 * evidence chain.
 *
 * - `GET /api/v1/evidence/{evidenceId}` — the only route calling
 *   `EvidenceStore` directly; no pinning parameters at all (Evidence carries
 *   no snapshot identity).
 * - `GET /api/v1/entities/{entityId}/evidence` — entity-scoped only (the
 *   negative finding in ADR-0024 § 1: no relationship-scoped evidence-chain
 *   route exists).
 */
import type { FastifyInstance } from "fastify";
import {
  CURRENT_SCHEMA_VERSION,
  entityIdentifierSchema,
  evidenceChainResultSchema,
  evidenceDetailResultSchema,
  evidenceIdentifierSchema,
  type EvidenceStore,
  type TopologyGraphStore,
} from "@atlast/shared";
import {
  asOptionalScalarString,
  parseOrThrow,
  rejectUnknownQueryKeys,
  resolveGraphReadMode,
  resolvePageRequest,
  WIRE_QUERY_PARAM,
} from "../http/query-coercion.ts";
import { sendValidatedResponse } from "../http/respond.ts";

const EVIDENCE_LOOKUP_QUERY_KEYS: ReadonlySet<string> = new Set();

const ENTITY_EVIDENCE_CHAIN_QUERY_KEYS: ReadonlySet<string> = new Set([
  WIRE_QUERY_PARAM.limit,
  WIRE_QUERY_PARAM.cursor,
  WIRE_QUERY_PARAM.asOf,
  WIRE_QUERY_PARAM.horizon,
  WIRE_QUERY_PARAM.derivationVersion,
]);

export function registerEvidenceRoutes(
  app: FastifyInstance,
  dependencies: {
    readonly evidenceStore: EvidenceStore;
    readonly topologyGraphStore: TopologyGraphStore;
  },
): void {
  app.get<{ Params: { evidenceId: string } }>(
    "/api/v1/evidence/:evidenceId",
    async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      rejectUnknownQueryKeys(query, EVIDENCE_LOOKUP_QUERY_KEYS);

      const evidenceId = parseOrThrow(
        evidenceIdentifierSchema,
        request.params.evidenceId,
        ["params", "evidenceId"],
      );

      const evidenceRecord =
        await dependencies.evidenceStore.getEvidenceByIdentifier(evidenceId);
      sendValidatedResponse(
        reply,
        evidenceDetailResultSchema,
        {
          data: evidenceRecord,
          meta: { schemaVersion: CURRENT_SCHEMA_VERSION },
        },
        "GET /api/v1/evidence/{evidenceId}",
      );
    },
  );

  app.get<{ Params: { entityId: string } }>(
    "/api/v1/entities/:entityId/evidence",
    async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      rejectUnknownQueryKeys(query, ENTITY_EVIDENCE_CHAIN_QUERY_KEYS);

      const entityId = parseOrThrow(
        entityIdentifierSchema,
        request.params.entityId,
        ["params", "entityId"],
      );
      const readMode = resolveGraphReadMode(
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
      const pageRequest = resolvePageRequest(
        asOptionalScalarString(
          query[WIRE_QUERY_PARAM.limit],
          WIRE_QUERY_PARAM.limit,
        ),
        asOptionalScalarString(
          query[WIRE_QUERY_PARAM.cursor],
          WIRE_QUERY_PARAM.cursor,
        ),
      );

      const result = await dependencies.topologyGraphStore.getEvidenceChain(
        entityId,
        readMode,
        pageRequest,
      );
      sendValidatedResponse(
        reply,
        evidenceChainResultSchema,
        result,
        "GET /api/v1/entities/{entityId}/evidence",
      );
    },
  );
}
