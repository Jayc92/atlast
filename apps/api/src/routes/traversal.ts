/**
 * Route 4 (ADR-0024 §§ 1-2): bounded traversal from one Entity. `direction`
 * and `depth` are required; `minConfidence` is optional (mapped to the
 * internal `minimumConfidence` field — ADR-0024 § 4's wire-naming seam).
 * No `limit`/`cursor` — traversal is bounded by `depth` and the 500-subject
 * budget instead, so neither key is in this route's accepted set at all.
 */
import type { FastifyInstance } from "fastify";
import {
  entityIdentifierSchema,
  traversalRequestBoundsSchema,
  traversalResultSchema,
  type TopologyGraphStore,
} from "@atlast/shared";
import {
  asOptionalScalarString,
  parseOrThrow,
  rejectUnknownQueryKeys,
  resolveGraphReadMode,
  strictDecimalQueryString,
  strictIntegerQueryString,
  WIRE_QUERY_PARAM,
  withWireFieldNames,
} from "../http/query-coercion.ts";
import { sendValidatedResponse } from "../http/respond.ts";

const TRAVERSAL_QUERY_KEYS: ReadonlySet<string> = new Set([
  WIRE_QUERY_PARAM.direction,
  WIRE_QUERY_PARAM.depth,
  WIRE_QUERY_PARAM.minConfidence,
  WIRE_QUERY_PARAM.asOf,
  WIRE_QUERY_PARAM.horizon,
  WIRE_QUERY_PARAM.derivationVersion,
]);

export function registerTraversalRoutes(
  app: FastifyInstance,
  dependencies: { readonly topologyGraphStore: TopologyGraphStore },
): void {
  app.get<{ Params: { entityId: string } }>(
    "/api/v1/entities/:entityId/traversal",
    async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      rejectUnknownQueryKeys(query, TRAVERSAL_QUERY_KEYS);

      const entityId = parseOrThrow(
        entityIdentifierSchema,
        request.params.entityId,
        ["params", "entityId"],
      );

      const directionRaw = asOptionalScalarString(
        query[WIRE_QUERY_PARAM.direction],
        WIRE_QUERY_PARAM.direction,
      );
      const depthRaw = asOptionalScalarString(
        query[WIRE_QUERY_PARAM.depth],
        WIRE_QUERY_PARAM.depth,
      );
      const minConfidenceRaw = asOptionalScalarString(
        query[WIRE_QUERY_PARAM.minConfidence],
        WIRE_QUERY_PARAM.minConfidence,
      );

      const depth =
        depthRaw === undefined
          ? undefined
          : parseOrThrow(strictIntegerQueryString, depthRaw, [
              "query",
              WIRE_QUERY_PARAM.depth,
            ]);
      const minimumConfidence =
        minConfidenceRaw === undefined
          ? undefined
          : parseOrThrow(strictDecimalQueryString, minConfidenceRaw, [
              "query",
              WIRE_QUERY_PARAM.minConfidence,
            ]);

      // direction/depth are required by traversalRequestBoundsSchema itself
      // (no .optional()/.default()), so an absent key is reported by that
      // same Zod parse as a missing-field issue, not a hand-rolled check.
      // withWireFieldNames renames the schema's internal `minimumConfidence`
      // issue path segment back to the wire name `minConfidence` the client
      // actually sent (ADR-0024 § 4's naming seam).
      const bounds = withWireFieldNames(
        () =>
          parseOrThrow(
            traversalRequestBoundsSchema,
            {
              ...(directionRaw !== undefined
                ? { direction: directionRaw }
                : {}),
              ...(depth !== undefined ? { depth } : {}),
              ...(minimumConfidence !== undefined ? { minimumConfidence } : {}),
            },
            ["query"],
          ),
        { minimumConfidence: WIRE_QUERY_PARAM.minConfidence },
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

      const result = await dependencies.topologyGraphStore.traverse(
        entityId,
        bounds,
        readMode,
      );
      sendValidatedResponse(
        reply,
        traversalResultSchema,
        result,
        "GET /api/v1/entities/{entityId}/traversal",
      );
    },
  );
}
