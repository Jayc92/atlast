import type { SubjectReadResult, TraversalResult } from "@atlast/shared";

export interface TopologyGraphNode {
  readonly id: string;
  readonly label: string;
  readonly entityTypes: readonly string[];
  readonly ambiguous: boolean;
}

export interface TopologyGraphEdge {
  readonly id: string;
  readonly relationshipIdentifier: string;
  readonly assertionIdentifier: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
  readonly confidence: number;
  readonly conflicted: boolean;
  readonly renderable: boolean;
}

export interface TopologyBoundaryReference {
  readonly edgeId: string;
  readonly endpointIdentifier: string;
  readonly role: "source" | "target";
}

export interface TopologyGraphViewModel {
  readonly nodes: readonly TopologyGraphNode[];
  readonly edges: readonly TopologyGraphEdge[];
  readonly boundaryReferences: readonly TopologyBoundaryReference[];
  readonly truncated: boolean;
  readonly subjectCount: number;
}

function compareIdentifier(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function entityNode(subject: SubjectReadResult): TopologyGraphNode | undefined {
  if (subject.subject.subjectKind !== "entity") {
    return undefined;
  }

  const entityTypes = new Set<string>();
  let ambiguous = false;
  for (const assertion of subject.assertions) {
    if (assertion.revision.claim.claimKind === "entity") {
      entityTypes.add(assertion.revision.claim.entityType);
    }
    if (assertion.revision.conflictState.status === "conflicted") {
      for (const competing of assertion.revision.conflictState
        .competingClaims) {
        if (competing.claim.claimKind === "entity") {
          entityTypes.add(competing.claim.entityType);
        }
      }
    }
    ambiguous ||= assertion.revision.ambiguityState.status === "ambiguous";
  }

  return {
    id: subject.subject.identifier,
    label: subject.subject.identifier.replace(/^atlast:entity:/, ""),
    entityTypes: [...entityTypes].sort(compareIdentifier),
    ambiguous,
  };
}

interface RelationshipCandidate {
  readonly claim: {
    readonly relationshipType: string;
    readonly sourceEntityIdentifier: string;
    readonly targetEntityIdentifier: string;
  };
  readonly confidence: number;
  readonly suffix: string;
}

function relationshipCandidates(
  subject: SubjectReadResult,
): readonly TopologyGraphEdge[] {
  if (subject.subject.subjectKind !== "relationship") {
    return [];
  }

  return subject.assertions.flatMap((assertion) => {
    const candidates: RelationshipCandidate[] = [];
    if (assertion.revision.claim.claimKind === "relationship") {
      candidates.push({
        claim: assertion.revision.claim,
        confidence: assertion.revision.confidence,
        suffix: "primary",
      });
    }
    if (assertion.revision.conflictState.status === "conflicted") {
      for (const [
        index,
        competing,
      ] of assertion.revision.conflictState.competingClaims.entries()) {
        if (competing.claim.claimKind === "relationship") {
          candidates.push({
            claim: competing.claim,
            confidence: competing.confidence,
            suffix: `competing-${String(index + 1)}`,
          });
        }
      }
    }

    return candidates.map((candidate) => ({
      id: `${subject.subject.identifier}::${assertion.revision.identifier}::${candidate.suffix}`,
      relationshipIdentifier: subject.subject.identifier,
      assertionIdentifier: assertion.revision.identifier,
      source: candidate.claim.sourceEntityIdentifier,
      target: candidate.claim.targetEntityIdentifier,
      label: candidate.claim.relationshipType,
      confidence: candidate.confidence,
      conflicted: assertion.revision.conflictState.status === "conflicted",
      renderable: false,
    }));
  });
}

/**
 * Losslessly projects traversal subjects into deterministic view records.
 * Competing relationship claims remain separate candidate edges; an endpoint
 * absent from the bounded traversal becomes an explicit boundary reference.
 */
export function projectTraversalGraph(
  origin: SubjectReadResult,
  traversal: TraversalResult,
): TopologyGraphViewModel {
  const byIdentifier = new Map<string, SubjectReadResult>();
  for (const subject of [origin, ...traversal.items]) {
    byIdentifier.set(subject.subject.identifier, subject);
  }

  const nodes = [...byIdentifier.values()]
    .map(entityNode)
    .filter((node): node is TopologyGraphNode => node !== undefined)
    .sort((left, right) => compareIdentifier(left.id, right.id));
  const nodeIdentifiers = new Set(nodes.map((node) => node.id));

  const boundaryReferences: TopologyBoundaryReference[] = [];
  const edges = [...byIdentifier.values()]
    .flatMap(relationshipCandidates)
    .map((edge) => {
      const sourcePresent = nodeIdentifiers.has(edge.source);
      const targetPresent = nodeIdentifiers.has(edge.target);
      if (!sourcePresent) {
        boundaryReferences.push({
          edgeId: edge.id,
          endpointIdentifier: edge.source,
          role: "source",
        });
      }
      if (!targetPresent) {
        boundaryReferences.push({
          edgeId: edge.id,
          endpointIdentifier: edge.target,
          role: "target",
        });
      }
      return { ...edge, renderable: sourcePresent && targetPresent };
    })
    .sort((left, right) => compareIdentifier(left.id, right.id));

  boundaryReferences.sort((left, right) =>
    compareIdentifier(
      `${left.edgeId}:${left.role}:${left.endpointIdentifier}`,
      `${right.edgeId}:${right.role}:${right.endpointIdentifier}`,
    ),
  );

  return {
    nodes,
    edges,
    boundaryReferences,
    truncated: traversal.traversal.truncated,
    subjectCount: traversal.traversal.subjectCount,
  };
}
