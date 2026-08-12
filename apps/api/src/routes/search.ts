/**
 * Route 3 (ADR-0024 §§ 1-2): identifier search over both subject kinds.
 * `q` is required; `limit`/`cursor` and the three optional pin parameters
 * are the only other accepted query keys.
 */
import type { FastifyInstance } from "fastify";
import {
  searchQuerySchema,
  subjectPageSchema,
  type TopologyGraphStore,
} from "@atlast/shared";
import { RequestValidationError } from "../http/errors.ts";
import {
  asOptionalScalarString,
  parseOrThrow,
  rejectUnknownQueryKeys,
  resolveGraphReadMode,
  resolvePageRequest,
  WIRE_QUERY_PARAM,
} from "../http/query-coercion.ts";
import { sendValidatedResponse } from "../http/respond.ts";

const SEARCH_QUERY_KEYS: ReadonlySet<string> = new Set([
  WIRE_QUERY_PARAM.q,
  WIRE_QUERY_PARAM.limit,
  WIRE_QUERY_PARAM.cursor,
  WIRE_QUERY_PARAM.asOf,
  WIRE_QUERY_PARAM.horizon,
  WIRE_QUERY_PARAM.derivationVersion,
]);

export function registerSearchRoutes(
  app: FastifyInstance,
  dependencies: { readonly topologyGraphStore: TopologyGraphStore },
): void {
  app.get("/api/v1/search", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    rejectUnknownQueryKeys(query, SEARCH_QUERY_KEYS);

    const rawQ = asOptionalScalarString(
      query[WIRE_QUERY_PARAM.q],
      WIRE_QUERY_PARAM.q,
    );
    if (rawQ === undefined) {
      throw new RequestValidationError([
        { path: ["query", WIRE_QUERY_PARAM.q], message: "q is required." },
      ]);
    }
    const searchQuery = parseOrThrow(searchQuerySchema, rawQ, [
      "query",
      WIRE_QUERY_PARAM.q,
    ]);

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

    const result = await dependencies.topologyGraphStore.searchSubjects(
      searchQuery,
      readMode,
      pageRequest,
    );
    sendValidatedResponse(
      reply,
      subjectPageSchema,
      result,
      "GET /api/v1/search",
    );
  });
}
