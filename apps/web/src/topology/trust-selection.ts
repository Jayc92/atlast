import type { SubjectReadResult, TraversalResult } from "@atlast/shared";
import { projectTraversalGraph } from "./graph-projection.ts";

export interface TrustSelection {
  readonly subject: SubjectReadResult;
  readonly assertionIdentifier?: string;
}

export function resolveTrustSelection(
  selected: string | undefined,
  origin: SubjectReadResult,
  traversal: TraversalResult,
): TrustSelection | undefined {
  if (selected === undefined) {
    return undefined;
  }

  const subjects = [origin, ...traversal.items];
  const directSubject = subjects.find(
    (candidate) => candidate.subject.identifier === selected,
  );
  if (directSubject !== undefined) {
    return { subject: directSubject };
  }

  const edge = projectTraversalGraph(origin, traversal).edges.find(
    (candidate) => candidate.id === selected,
  );
  if (edge === undefined) {
    return undefined;
  }

  const relationship = subjects.find(
    (candidate) => candidate.subject.identifier === edge.relationshipIdentifier,
  );
  return relationship === undefined
    ? undefined
    : {
        subject: relationship,
        assertionIdentifier: edge.assertionIdentifier,
      };
}
