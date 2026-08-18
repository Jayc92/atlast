import {
  compareRawUtf16,
  entityIdentifierSchema,
  impactResultSchema,
  traversalRequestBoundsSchema,
  traversalResultSchema,
  type EntityIdentifier,
  type ImpactPathStep,
  type ImpactResult,
  type TraversalRequestBounds,
  type TraversalResult,
} from "@atlast/shared";
import { ImpactEngineInputError } from "./errors.ts";

export interface ComputeImpactInput {
  readonly originEntityIdentifier: EntityIdentifier;
  readonly bounds: TraversalRequestBounds;
  readonly traversal: TraversalResult;
}

export interface ComputeImpactResult {
  readonly results: readonly ImpactResult[];
}

/**
 * One eligible Relationship edge (ADR-0032 § 3): the direction-resolved
 * departure/arrival Entity used to walk the graph, its confidence (the
 * edge weight), and the canonical-orientation step recorded in any path
 * that crosses it — those two orientations differ exactly when
 * `direction` is `upstream`.
 */
interface DirectedEdge {
  readonly departureEntityIdentifier: EntityIdentifier;
  readonly arrivalEntityIdentifier: EntityIdentifier;
  readonly confidence: number;
  readonly step: ImpactPathStep;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function compareStep(left: ImpactPathStep, right: ImpactPathStep): number {
  return (
    compareRawUtf16(
      left.sourceEntityIdentifier,
      right.sourceEntityIdentifier,
    ) ||
    compareRawUtf16(
      left.targetEntityIdentifier,
      right.targetEntityIdentifier,
    ) ||
    compareRawUtf16(
      left.relationshipIdentifier,
      right.relationshipIdentifier,
    ) ||
    compareRawUtf16(left.assertionIdentifier, right.assertionIdentifier)
  );
}

/**
 * Lexicographic order over the path's ordered step tuples, used only after
 * path length has already been compared equal — the identical final
 * tie-break ADR-0029 § 3 established for latent-risk path selection.
 */
function comparePathTuples(
  left: readonly ImpactPathStep[],
  right: readonly ImpactPathStep[],
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftStep = left[index];
    const rightStep = right[index];
    if (leftStep !== undefined && rightStep !== undefined) {
      const comparison = compareStep(leftStep, rightStep);
      if (comparison !== 0) {
        return comparison;
      }
    }
  }
  return left.length - right.length;
}

/**
 * Every returned Relationship assertion revision whose claim is a
 * Relationship claim, whose confidence meets the validated request floor,
 * and whose source and target Entity identifiers are both in scope
 * (ADR-0029 § 3's qualification rule, reused verbatim). Nested
 * `conflictState.competingClaims` are never treated as edges. Departure
 * and arrival follow the claim's actual source/target in the requested
 * `direction` — for `downstream`, source to target; for `upstream`,
 * target to source — exactly as the existing traversal implementation
 * resolves them, while each edge's recorded `step` always preserves the
 * claim's canonical source-to-target orientation (ADR-0032 § 3).
 */
function collectEligibleEdges(
  traversal: TraversalResult,
  scope: ReadonlySet<EntityIdentifier>,
  direction: TraversalRequestBounds["direction"],
  minimumConfidence: number,
): ReadonlyMap<EntityIdentifier, readonly DirectedEdge[]> {
  const deduplicated = new Map<string, DirectedEdge>();
  for (const item of traversal.items) {
    if (item.subject.subjectKind !== "relationship") {
      continue;
    }
    for (const assertionResult of item.assertions) {
      const revision = assertionResult.revision;
      const claim = revision.claim;
      if (
        claim.claimKind !== "relationship" ||
        revision.confidence < minimumConfidence ||
        !scope.has(claim.sourceEntityIdentifier) ||
        !scope.has(claim.targetEntityIdentifier)
      ) {
        continue;
      }
      const step: ImpactPathStep = {
        sourceEntityIdentifier: claim.sourceEntityIdentifier,
        targetEntityIdentifier: claim.targetEntityIdentifier,
        relationshipIdentifier: item.subject.identifier,
        assertionIdentifier: revision.identifier,
      };
      const edge: DirectedEdge = {
        departureEntityIdentifier:
          direction === "downstream"
            ? claim.sourceEntityIdentifier
            : claim.targetEntityIdentifier,
        arrivalEntityIdentifier:
          direction === "downstream"
            ? claim.targetEntityIdentifier
            : claim.sourceEntityIdentifier,
        confidence: revision.confidence,
        step,
      };
      const key = [
        edge.departureEntityIdentifier,
        edge.arrivalEntityIdentifier,
        step.relationshipIdentifier,
        step.assertionIdentifier,
      ].join("\u0000");
      deduplicated.set(key, edge);
    }
  }

  const adjacency = new Map<EntityIdentifier, DirectedEdge[]>();
  for (const edge of deduplicated.values()) {
    const existing = adjacency.get(edge.departureEntityIdentifier) ?? [];
    existing.push(edge);
    adjacency.set(edge.departureEntityIdentifier, existing);
  }
  for (const edges of adjacency.values()) {
    edges.sort((left, right) => compareStep(left.step, right.step));
  }
  return adjacency;
}

/**
 * Phase 1 (ADR-0032 § 3): the maximum achievable bottleneck (widest-path)
 * confidence from `origin` to every other reachable Entity, computed by a
 * deterministic worklist relaxation. A node is re-queued only when its
 * bottleneck strictly improves, which bounds the number of relaxations by
 * the finite set of distinct edge confidences actually present, so the
 * worklist always terminates. The origin itself is never a destination.
 */
function computeWidestPathBottlenecks(
  originEntityIdentifier: EntityIdentifier,
  adjacency: ReadonlyMap<EntityIdentifier, readonly DirectedEdge[]>,
): ReadonlyMap<EntityIdentifier, number> {
  const bottleneck = new Map<EntityIdentifier, number>([
    [originEntityIdentifier, Number.POSITIVE_INFINITY],
  ]);
  const worklist: EntityIdentifier[] = [originEntityIdentifier];

  for (let index = 0; index < worklist.length; index += 1) {
    const departureEntityIdentifier = worklist[index];
    if (departureEntityIdentifier === undefined) {
      continue;
    }
    const departureBottleneck = bottleneck.get(departureEntityIdentifier);
    if (departureBottleneck === undefined) {
      continue;
    }
    for (const edge of adjacency.get(departureEntityIdentifier) ?? []) {
      const candidateBottleneck = Math.min(
        departureBottleneck,
        edge.confidence,
      );
      const existingBottleneck = bottleneck.get(edge.arrivalEntityIdentifier);
      if (
        existingBottleneck === undefined ||
        candidateBottleneck > existingBottleneck
      ) {
        bottleneck.set(edge.arrivalEntityIdentifier, candidateBottleneck);
        worklist.push(edge.arrivalEntityIdentifier);
      }
    }
  }

  bottleneck.delete(originEntityIdentifier);
  return bottleneck;
}

/**
 * Phase 2 (ADR-0032 § 3): the shortest (fewest-edge) origin-to-destination
 * path using only edges whose confidence is at least `requiredBottleneck`
 * — every such path has bottleneck confidence exactly `requiredBottleneck`,
 * since `requiredBottleneck` is already the maximum achievable for
 * `destinationEntityIdentifier` (phase 1). Ties among equal-length paths
 * are broken by the raw UTF-16 lexicographic order of the path's ordered
 * step tuples, reusing ADR-0029 § 3's tie-break comparator.
 */
function findShortestPathAtBottleneck(
  originEntityIdentifier: EntityIdentifier,
  destinationEntityIdentifier: EntityIdentifier,
  requiredBottleneck: number,
  adjacency: ReadonlyMap<EntityIdentifier, readonly DirectedEdge[]>,
): readonly ImpactPathStep[] {
  const bestPaths = new Map<EntityIdentifier, readonly ImpactPathStep[]>([
    [originEntityIdentifier, []],
  ]);
  const queue: EntityIdentifier[] = [originEntityIdentifier];

  for (let index = 0; index < queue.length; index += 1) {
    const departureEntityIdentifier = queue[index];
    if (departureEntityIdentifier === undefined) {
      continue;
    }
    const departurePath = bestPaths.get(departureEntityIdentifier);
    if (departurePath === undefined) {
      continue;
    }
    for (const edge of adjacency.get(departureEntityIdentifier) ?? []) {
      if (edge.confidence < requiredBottleneck) {
        continue;
      }
      const candidatePath = [...departurePath, edge.step];
      const existingPath = bestPaths.get(edge.arrivalEntityIdentifier);
      if (
        existingPath === undefined ||
        candidatePath.length < existingPath.length ||
        (candidatePath.length === existingPath.length &&
          comparePathTuples(candidatePath, existingPath) < 0)
      ) {
        bestPaths.set(edge.arrivalEntityIdentifier, candidatePath);
        queue.push(edge.arrivalEntityIdentifier);
      }
    }
  }

  const path = bestPaths.get(destinationEntityIdentifier);
  if (path === undefined || path.length === 0) {
    throw new ImpactEngineInputError(
      `destination ${JSON.stringify(destinationEntityIdentifier)} is not reachable at its own computed bottleneck confidence — this indicates an internal engine inconsistency, not a caller error`,
    );
  }
  return path;
}

/**
 * Final ranked-result order (ADR-0032 § 4): rank score descending, then
 * path edge count ascending, then Entity identifier ascending in raw
 * UTF-16 order. `changeType` never participates — the engine does not
 * even accept it as input (ADR-0032 § 3).
 */
function compareImpactResults(left: ImpactResult, right: ImpactResult): number {
  if (left.rankScore !== right.rankScore) {
    return right.rankScore > left.rankScore ? 1 : -1;
  }
  if (left.pathEdgeCount !== right.pathEdgeCount) {
    return left.pathEdgeCount - right.pathEdgeCount;
  }
  return compareRawUtf16(left.entityIdentifier, right.entityIdentifier);
}

/**
 * The M4 deterministic change-impact engine (ADR-0032). Pure: no
 * repository read, no second traversal, no clock, no randomness, and no
 * `changeType` — the response's `changeType` is validated and echoed at
 * the HTTP boundary only (ADR-0033 § 2), never consumed here.
 */
export function computeImpact(input: ComputeImpactInput): ComputeImpactResult {
  const originEntityIdentifier = entityIdentifierSchema.parse(
    input.originEntityIdentifier,
  );
  const bounds = traversalRequestBoundsSchema.parse(input.bounds);
  const traversal = traversalResultSchema.parse(input.traversal);

  const entityIdentifiers = traversal.items
    .filter((item) => item.subject.subjectKind === "entity")
    .map((item) => item.subject.identifier);
  const scopeIdentifiers = [originEntityIdentifier, ...entityIdentifiers];
  if (new Set(scopeIdentifiers).size !== scopeIdentifiers.length) {
    throw new ImpactEngineInputError(
      "origin and traversal Entity identifiers must be unique",
    );
  }
  const scope = new Set(scopeIdentifiers);

  const adjacency = collectEligibleEdges(
    traversal,
    scope,
    bounds.direction,
    bounds.minimumConfidence,
  );
  const bottlenecks = computeWidestPathBottlenecks(
    originEntityIdentifier,
    adjacency,
  );

  const results: ImpactResult[] = [];
  for (const [entityIdentifier, rankScore] of bottlenecks) {
    const path = findShortestPathAtBottleneck(
      originEntityIdentifier,
      entityIdentifier,
      rankScore,
      adjacency,
    );
    results.push(
      impactResultSchema.parse({
        entityIdentifier,
        rankScore,
        pathEdgeCount: path.length,
        path,
      }),
    );
  }
  results.sort(compareImpactResults);

  return deepFreeze({ results });
}
