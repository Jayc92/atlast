/**
 * M3 health-in-context composition route (ADR-0030). The API joins one
 * bounded topology traversal with one immutable overlay frame and returns
 * the shared, strictly validated projection envelope.
 */
import type { FastifyInstance } from "fastify";
import {
  entityIdentifierSchema,
  healthContextResultSchema,
  overlayFrameIdentifierSchema,
  traversalRequestBoundsSchema,
  type EntityIdentifier,
  type OperationalOverlayStore,
  type OverlayFrame,
  type OverlayFrameIdentifier,
  type ReadMode,
  type TopologyGraphStore,
  type TraversalRequestBounds,
  type TraversalResult,
} from "@atlast/shared";
import { UnknownIdentifierError } from "@atlast/graph-model";
import { projectHealth } from "@atlast/overlay-model";
import { FrameAfterTopologySnapshotError } from "../http/errors.ts";
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

const HEALTH_CONTEXT_QUERY_KEYS: ReadonlySet<string> = new Set([
  WIRE_QUERY_PARAM.direction,
  WIRE_QUERY_PARAM.depth,
  WIRE_QUERY_PARAM.minConfidence,
  WIRE_QUERY_PARAM.asOf,
  WIRE_QUERY_PARAM.horizon,
  WIRE_QUERY_PARAM.derivationVersion,
  WIRE_QUERY_PARAM.overlayFrame,
]);

interface HealthContextDependencies {
  readonly topologyGraphStore: TopologyGraphStore;
  readonly operationalOverlayStore: OperationalOverlayStore;
}

async function resolveFrame(
  store: OperationalOverlayStore,
  overlayFrame: OverlayFrameIdentifier | undefined,
  topologyAsOf: TraversalResult["meta"]["resolvedIdentity"]["asOf"],
): Promise<OverlayFrame> {
  if (overlayFrame === undefined) {
    return store.getLatestFrameAtOrBefore(topologyAsOf);
  }
  const frame = await store.getFrameByIdentifier(overlayFrame);
  if (frame.effectiveAt > topologyAsOf) {
    throw new FrameAfterTopologySnapshotError(
      topologyAsOf,
      frame.identifier,
      frame.effectiveAt,
    );
  }
  return frame;
}

async function partitionOutOfScopeTargets(
  store: TopologyGraphStore,
  traversal: TraversalResult,
  frame: OverlayFrame,
  originEntityIdentifier: EntityIdentifier,
): Promise<{
  readonly known: readonly EntityIdentifier[];
  readonly unknown: readonly EntityIdentifier[];
}> {
  const inScope = new Set<string>([
    originEntityIdentifier,
    ...traversal.items
      .filter((item) => item.subject.subjectKind === "entity")
      .map((item) => item.subject.identifier),
  ]);
  const readMode: ReadMode = {
    mode: "pinned",
    identity: traversal.meta.resolvedIdentity,
  };
  const known: EntityIdentifier[] = [];
  const unknown: EntityIdentifier[] = [];

  for (const entry of frame.entries) {
    if (inScope.has(entry.targetEntityIdentifier)) {
      continue;
    }
    try {
      await store.getSubject(entry.targetEntityIdentifier, readMode);
      known.push(entry.targetEntityIdentifier);
    } catch (error) {
      if (
        error instanceof UnknownIdentifierError &&
        error.identifierKind === "subject" &&
        error.identifier === entry.targetEntityIdentifier
      ) {
        unknown.push(entry.targetEntityIdentifier);
        continue;
      }
      throw error;
    }
  }

  return { known, unknown };
}

function resolveBounds(query: Record<string, unknown>): TraversalRequestBounds {
  const directionRaw = asOptionalScalarString(
    query[WIRE_QUERY_PARAM.direction],
    WIRE_QUERY_PARAM.direction,
  );
  const depthRaw = asOptionalScalarString(
    query[WIRE_QUERY_PARAM.depth],
    WIRE_QUERY_PARAM.depth,
  );
  const minimumConfidenceRaw = asOptionalScalarString(
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
    minimumConfidenceRaw === undefined
      ? undefined
      : parseOrThrow(strictDecimalQueryString, minimumConfidenceRaw, [
          "query",
          WIRE_QUERY_PARAM.minConfidence,
        ]);

  return withWireFieldNames(
    () =>
      parseOrThrow(
        traversalRequestBoundsSchema,
        {
          ...(directionRaw !== undefined ? { direction: directionRaw } : {}),
          ...(depth !== undefined ? { depth } : {}),
          ...(minimumConfidence !== undefined ? { minimumConfidence } : {}),
        },
        ["query"],
      ),
    { minimumConfidence: WIRE_QUERY_PARAM.minConfidence },
  );
}

export function registerHealthContextRoutes(
  app: FastifyInstance,
  dependencies: HealthContextDependencies,
): void {
  app.get<{ Params: { entityId: string } }>(
    "/api/v1/entities/:entityId/health-context",
    async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      rejectUnknownQueryKeys(query, HEALTH_CONTEXT_QUERY_KEYS);

      const originEntityIdentifier = parseOrThrow(
        entityIdentifierSchema,
        request.params.entityId,
        ["params", "entityId"],
      );
      const bounds = resolveBounds(query);
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
      const overlayFrameRaw = asOptionalScalarString(
        query[WIRE_QUERY_PARAM.overlayFrame],
        WIRE_QUERY_PARAM.overlayFrame,
      );
      const overlayFrame =
        overlayFrameRaw === undefined
          ? undefined
          : parseOrThrow(overlayFrameIdentifierSchema, overlayFrameRaw, [
              "query",
              WIRE_QUERY_PARAM.overlayFrame,
            ]);

      const traversal = await dependencies.topologyGraphStore.traverse(
        originEntityIdentifier,
        bounds,
        readMode,
      );
      const frame = await resolveFrame(
        dependencies.operationalOverlayStore,
        overlayFrame,
        traversal.meta.resolvedIdentity.asOf,
      );
      const targetPartition = await partitionOutOfScopeTargets(
        dependencies.topologyGraphStore,
        traversal,
        frame,
        originEntityIdentifier,
      );
      const projection = projectHealth({
        originEntityIdentifier,
        bounds,
        traversal,
        frame,
        knownTargetEntityIdentifiers: targetPartition.known,
        unknownTargetEntityIdentifiers: targetPartition.unknown,
      });

      sendValidatedResponse(
        reply,
        healthContextResultSchema,
        {
          data: {
            originEntityIdentifier,
            items: traversal.items,
            projections: projection.projections,
            gaps: projection.gaps,
          },
          traversal: traversal.traversal,
          meta: {
            ...traversal.meta,
            overlay: {
              schemaVersion: frame.schemaVersion,
              frameIdentifier: frame.identifier,
              effectiveAt: frame.effectiveAt,
            },
          },
        },
        "GET /api/v1/entities/{entityId}/health-context",
      );
    },
  );
}
