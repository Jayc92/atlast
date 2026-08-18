/**
 * M4 deterministic impact-query composition route (ADR-0033). The API
 * resolves exactly one bounded topology traversal and hands it, unread a
 * second time, to the pure `@atlast/impact-model` engine; no additional
 * repository read is performed. `changeType` is validated and echoed as
 * the caller's hypothetical question — it is never passed into the engine
 * and never affects ranking (ADR-0032 § 3).
 *
 * ADR-0033 classifies a missing, unknown, or repeated `changeType` as a
 * malformed request. Other query validation keeps the existing API-wide
 * `VALIDATION_ERROR` behavior.
 */
import type { FastifyInstance } from "fastify";
import {
  entityIdentifierSchema,
  impactChangeTypeSchema,
  impactResultEnvelopeSchema,
  traversalRequestBoundsSchema,
  type TopologyGraphStore,
} from "@atlast/shared";
import { computeImpact } from "@atlast/impact-model";
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
import {
  MalformedRequestError,
  RequestValidationError,
} from "../http/errors.ts";
import { sendValidatedResponse } from "../http/respond.ts";

const IMPACT_QUERY_KEYS: ReadonlySet<string> = new Set([
  WIRE_QUERY_PARAM.direction,
  WIRE_QUERY_PARAM.depth,
  WIRE_QUERY_PARAM.minConfidence,
  WIRE_QUERY_PARAM.changeType,
  WIRE_QUERY_PARAM.asOf,
  WIRE_QUERY_PARAM.horizon,
  WIRE_QUERY_PARAM.derivationVersion,
]);

function parseChangeType(value: unknown) {
  try {
    const raw = asOptionalScalarString(value, WIRE_QUERY_PARAM.changeType);
    return parseOrThrow(impactChangeTypeSchema, raw, [
      "query",
      WIRE_QUERY_PARAM.changeType,
    ]);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      throw new MalformedRequestError();
    }
    throw error;
  }
}

export function registerImpactRoutes(
  app: FastifyInstance,
  dependencies: { readonly topologyGraphStore: TopologyGraphStore },
): void {
  app.get<{ Params: { entityId: string } }>(
    "/api/v1/entities/:entityId/impact",
    async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      rejectUnknownQueryKeys(query, IMPACT_QUERY_KEYS);

      const originEntityIdentifier = parseOrThrow(
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

      const changeType = parseChangeType(query[WIRE_QUERY_PARAM.changeType]);

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

      const traversal = await dependencies.topologyGraphStore.traverse(
        originEntityIdentifier,
        bounds,
        readMode,
      );
      const impact = computeImpact({
        originEntityIdentifier,
        bounds,
        traversal,
      });

      sendValidatedResponse(
        reply,
        impactResultEnvelopeSchema,
        {
          data: {
            originEntityIdentifier,
            changeType,
            items: traversal.items,
            results: impact.results,
          },
          traversal: traversal.traversal,
          meta: traversal.meta,
        },
        "GET /api/v1/entities/{entityId}/impact",
      );
    },
  );
}
