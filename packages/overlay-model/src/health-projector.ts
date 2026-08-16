import {
  compareRawUtf16,
  entityIdentifierSchema,
  healthProjectionSchema,
  overlayFrameSchema,
  overlayGapSchema,
  traversalRequestBoundsSchema,
  traversalResultSchema,
  type AssertionIdentifier,
  type ContextCompleteness,
  type DirectCondition,
  type EntityIdentifier,
  type HealthPathStep,
  type HealthProjection,
  type OverlayFrame,
  type OverlayGap,
  type RelationshipIdentifier,
  type TraversalRequestBounds,
  type TraversalResult,
} from "@atlast/shared";
import { OverlayProjectionInputError } from "./errors.ts";

export interface ProjectHealthInput {
  readonly originEntityIdentifier: EntityIdentifier;
  readonly bounds: TraversalRequestBounds;
  readonly traversal: TraversalResult;
  readonly frame: OverlayFrame;
  /** Proven frame targets outside the supplied traversal scope. */
  readonly knownTargetEntityIdentifiers: readonly EntityIdentifier[];
  /** Unknown frame targets outside the supplied traversal scope. */
  readonly unknownTargetEntityIdentifiers: readonly EntityIdentifier[];
}

export interface ProjectHealthResult {
  readonly projections: readonly HealthProjection[];
  readonly gaps: readonly OverlayGap[];
}

interface DirectedEdge extends HealthPathStep {
  readonly sourceEntityIdentifier: EntityIdentifier;
  readonly targetEntityIdentifier: EntityIdentifier;
  readonly relationshipIdentifier: RelationshipIdentifier;
  readonly assertionIdentifier: AssertionIdentifier;
}

const CONDITION_SEVERITY: Readonly<
  Record<Exclude<DirectCondition, "healthy">, number>
> = Object.freeze({
  down: 0,
  disconnected: 1,
  degraded: 2,
  "expiring-certificate": 3,
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function compareStep(left: HealthPathStep, right: HealthPathStep): number {
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

function comparePaths(
  left: readonly HealthPathStep[],
  right: readonly HealthPathStep[],
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

function parseIdentifierPartition(
  identifiers: readonly EntityIdentifier[],
  label: string,
): readonly EntityIdentifier[] {
  const parsed = identifiers.map((identifier) =>
    entityIdentifierSchema.parse(identifier),
  );
  if (new Set(parsed).size !== parsed.length) {
    throw new OverlayProjectionInputError(`${label} contains duplicates`);
  }
  return parsed;
}

function assertExactRemainingTargetPartition(
  frame: OverlayFrame,
  scope: ReadonlySet<EntityIdentifier>,
  knownTargets: readonly EntityIdentifier[],
  unknownTargets: readonly EntityIdentifier[],
): void {
  const known = new Set(knownTargets);
  const unknown = new Set(unknownTargets);
  for (const identifier of known) {
    if (unknown.has(identifier)) {
      throw new OverlayProjectionInputError(
        `target ${JSON.stringify(identifier)} is both known and unknown`,
      );
    }
  }

  const remainingTargets = frame.entries
    .map((entry) => entry.targetEntityIdentifier)
    .filter((identifier) => !scope.has(identifier));
  const expected = new Set(remainingTargets);
  for (const identifier of [...known, ...unknown]) {
    if (!expected.has(identifier)) {
      throw new OverlayProjectionInputError(
        `partition contains non-remaining target ${JSON.stringify(identifier)}`,
      );
    }
  }
  for (const identifier of expected) {
    if (known.has(identifier) === unknown.has(identifier)) {
      throw new OverlayProjectionInputError(
        `remaining target ${JSON.stringify(identifier)} must be classified exactly once`,
      );
    }
  }
}

function collectEligibleEdges(
  traversal: TraversalResult,
  scope: ReadonlySet<EntityIdentifier>,
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
      const edge: DirectedEdge = {
        sourceEntityIdentifier: claim.sourceEntityIdentifier,
        targetEntityIdentifier: claim.targetEntityIdentifier,
        relationshipIdentifier: item.subject.identifier,
        assertionIdentifier: revision.identifier,
      };
      const key = [
        edge.sourceEntityIdentifier,
        edge.targetEntityIdentifier,
        edge.relationshipIdentifier,
        edge.assertionIdentifier,
      ].join("\u0000");
      deduplicated.set(key, edge);
    }
  }

  const adjacency = new Map<EntityIdentifier, DirectedEdge[]>();
  for (const edge of deduplicated.values()) {
    const existing = adjacency.get(edge.sourceEntityIdentifier) ?? [];
    existing.push(edge);
    adjacency.set(edge.sourceEntityIdentifier, existing);
  }
  for (const edges of adjacency.values()) {
    edges.sort(compareStep);
  }
  return adjacency;
}

interface RiskCandidate {
  readonly triggerEntityIdentifier: EntityIdentifier;
  readonly triggerDirectCondition: Exclude<DirectCondition, "healthy">;
  readonly path: readonly HealthPathStep[];
}

function compareRiskCandidates(
  left: RiskCandidate,
  right: RiskCandidate,
): number {
  return (
    left.path.length - right.path.length ||
    CONDITION_SEVERITY[left.triggerDirectCondition] -
      CONDITION_SEVERITY[right.triggerDirectCondition] ||
    compareRawUtf16(
      left.triggerEntityIdentifier,
      right.triggerEntityIdentifier,
    ) ||
    comparePaths(left.path, right.path)
  );
}

function findLatentRisk(
  origin: EntityIdentifier,
  adjacency: ReadonlyMap<EntityIdentifier, readonly DirectedEdge[]>,
  directConditions: ReadonlyMap<EntityIdentifier, DirectCondition>,
): RiskCandidate | undefined {
  const bestPaths = new Map<EntityIdentifier, readonly HealthPathStep[]>([
    [origin, []],
  ]);
  const queue: Array<{
    readonly entityIdentifier: EntityIdentifier;
    readonly path: readonly HealthPathStep[];
  }> = [{ entityIdentifier: origin, path: [] }];

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const queued = queue[queueIndex];
    if (queued === undefined) {
      continue;
    }
    const currentBest = bestPaths.get(queued.entityIdentifier);
    if (
      currentBest === undefined ||
      comparePaths(queued.path, currentBest) !== 0
    ) {
      continue;
    }
    for (const edge of adjacency.get(queued.entityIdentifier) ?? []) {
      const candidatePath = [...queued.path, edge];
      const existing = bestPaths.get(edge.targetEntityIdentifier);
      if (
        existing === undefined ||
        candidatePath.length < existing.length ||
        (candidatePath.length === existing.length &&
          comparePaths(candidatePath, existing) < 0)
      ) {
        bestPaths.set(edge.targetEntityIdentifier, candidatePath);
        queue.push({
          entityIdentifier: edge.targetEntityIdentifier,
          path: candidatePath,
        });
      }
    }
  }

  const candidates: RiskCandidate[] = [];
  for (const [entityIdentifier, path] of bestPaths) {
    if (entityIdentifier === origin || path.length === 0) {
      continue;
    }
    const condition = directConditions.get(entityIdentifier);
    if (condition !== undefined && condition !== "healthy") {
      candidates.push({
        triggerEntityIdentifier: entityIdentifier,
        triggerDirectCondition: condition,
        path,
      });
    }
  }
  candidates.sort(compareRiskCandidates);
  return candidates[0];
}

/**
 * Projects one immutable overlay frame over one already-bounded traversal.
 * It never expands topology, follows competing claims, or mutates its input.
 */
export function projectHealth(input: ProjectHealthInput): ProjectHealthResult {
  const originEntityIdentifier = entityIdentifierSchema.parse(
    input.originEntityIdentifier,
  );
  const bounds = traversalRequestBoundsSchema.parse(input.bounds);
  const traversal = traversalResultSchema.parse(input.traversal);
  const frame = overlayFrameSchema.parse(input.frame);
  const knownTargets = parseIdentifierPartition(
    input.knownTargetEntityIdentifiers,
    "known target partition",
  );
  const unknownTargets = parseIdentifierPartition(
    input.unknownTargetEntityIdentifiers,
    "unknown target partition",
  );

  const entityIdentifiers = traversal.items
    .filter((item) => item.subject.subjectKind === "entity")
    .map((item) => item.subject.identifier);
  const scopeIdentifiers = [originEntityIdentifier, ...entityIdentifiers];
  if (new Set(scopeIdentifiers).size !== scopeIdentifiers.length) {
    throw new OverlayProjectionInputError(
      "origin and traversal Entity identifiers must be unique",
    );
  }
  scopeIdentifiers.sort(compareRawUtf16);
  const scope = new Set(scopeIdentifiers);
  assertExactRemainingTargetPartition(
    frame,
    scope,
    knownTargets,
    unknownTargets,
  );

  const directConditions = new Map<EntityIdentifier, DirectCondition>();
  for (const entry of frame.entries) {
    if (scope.has(entry.targetEntityIdentifier)) {
      directConditions.set(entry.targetEntityIdentifier, entry.directCondition);
    }
  }
  const adjacency = collectEligibleEdges(
    traversal,
    scope,
    bounds.minimumConfidence,
  );
  const contextCompleteness: ContextCompleteness = traversal.traversal.truncated
    ? "truncated"
    : "complete-within-requested-bounds";

  const projections = scopeIdentifiers.map((entityIdentifier) => {
    const directCondition = directConditions.get(entityIdentifier);
    if (directCondition === undefined) {
      return healthProjectionSchema.parse({
        reportStatus: "unreported",
        entityIdentifier,
        contextCompleteness,
      });
    }
    const risk =
      directCondition === "healthy"
        ? findLatentRisk(entityIdentifier, adjacency, directConditions)
        : undefined;
    if (risk !== undefined) {
      return healthProjectionSchema.parse({
        reportStatus: "reported",
        entityIdentifier,
        directCondition,
        effectiveState: "latent-downstream-risk",
        contextCompleteness,
        derivation: {
          triggerEntityIdentifier: risk.triggerEntityIdentifier,
          triggerDirectCondition: risk.triggerDirectCondition,
          path: risk.path,
        },
      });
    }
    return healthProjectionSchema.parse({
      reportStatus: "reported",
      entityIdentifier,
      directCondition,
      effectiveState: directCondition,
      contextCompleteness,
    });
  });

  const unknown = new Set(unknownTargets);
  const gaps = frame.entries
    .filter((entry) => unknown.has(entry.targetEntityIdentifier))
    .map((entry) =>
      overlayGapSchema.parse({
        entryIdentifier: entry.identifier,
        targetEntityIdentifier: entry.targetEntityIdentifier,
        directCondition: entry.directCondition,
        reason: "UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT",
      }),
    )
    .sort(
      (left, right) =>
        compareRawUtf16(
          left.targetEntityIdentifier,
          right.targetEntityIdentifier,
        ) || compareRawUtf16(left.entryIdentifier, right.entryIdentifier),
    );

  return deepFreeze({ projections, gaps });
}
