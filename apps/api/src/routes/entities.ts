/**
 * Routes 1 and 2 (ADR-0024 §§ 1-2): entity inventory and entity detail.
 *
 * - `GET /api/v1/entities` — bounded, filtered, paginated entity inventory.
 * - `GET /api/v1/entities/{entityId}` — one entity detail. The path
 *   parameter is validated against `entityIdentifierSchema` **before**
 *   calling `getSubject`, so this route can never resolve a Relationship
 *   subject — by identifier shape, not a runtime kind check (ADR-0024 § 1).
 */
import type { FastifyInstance } from "fastify";
import {
  entityInventoryFilterSchema,
  entityPageSchema,
  entityIdentifierSchema,
  subjectDetailResultSchema,
  type EntityInventoryFilter,
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

const ENTITY_LIST_QUERY_KEYS: ReadonlySet<string> = new Set([
  WIRE_QUERY_PARAM.entityType,
  WIRE_QUERY_PARAM.limit,
  WIRE_QUERY_PARAM.cursor,
  WIRE_QUERY_PARAM.asOf,
  WIRE_QUERY_PARAM.horizon,
  WIRE_QUERY_PARAM.derivationVersion,
]);

const ENTITY_DETAIL_QUERY_KEYS: ReadonlySet<string> = new Set([
  WIRE_QUERY_PARAM.asOf,
  WIRE_QUERY_PARAM.horizon,
  WIRE_QUERY_PARAM.derivationVersion,
]);

export function registerEntityRoutes(
  app: FastifyInstance,
  dependencies: { readonly topologyGraphStore: TopologyGraphStore },
): void {
  app.get("/api/v1/entities", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    rejectUnknownQueryKeys(query, ENTITY_LIST_QUERY_KEYS);

    const entityType = asOptionalScalarString(
      query[WIRE_QUERY_PARAM.entityType],
      WIRE_QUERY_PARAM.entityType,
    );
    const filter: EntityInventoryFilter = parseOrThrow(
      entityInventoryFilterSchema,
      { ...(entityType !== undefined ? { entityType } : {}) },
      ["query"],
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

    const result = await dependencies.topologyGraphStore.listEntities(
      filter,
      readMode,
      pageRequest,
    );
    sendValidatedResponse(
      reply,
      entityPageSchema,
      result,
      "GET /api/v1/entities",
    );
  });

  app.get<{ Params: { entityId: string } }>(
    "/api/v1/entities/:entityId",
    async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      rejectUnknownQueryKeys(query, ENTITY_DETAIL_QUERY_KEYS);

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

      const result = await dependencies.topologyGraphStore.getSubject(
        entityId,
        readMode,
      );
      sendValidatedResponse(
        reply,
        subjectDetailResultSchema,
        result,
        "GET /api/v1/entities/{entityId}",
      );
    },
  );
}
