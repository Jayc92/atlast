/**
 * Pure, view-safe projections from validated M1 read results to the plain
 * structured data the M2-B inventory/search/detail pages render.
 *
 * M2-B is explicitly structured presentation only (docs/m2-plan.md § 10):
 * it must not implement the M2-D trust inspector, conflict presentation, or
 * ambiguity presentation. These projections therefore surface every visible
 * claim honestly (never collapsing multiple entity-type claims into one
 * invented "winner" — GUARDRAILS.md § 1.2) without interpreting or labeling
 * conflict/ambiguity state, confidence, or freshness, which remain M2-D
 * scope. No React dependency, so these are plain unit-testable functions.
 */
import type { EntityReadResult, SubjectReadResult } from "@atlast/shared";

export interface EntityInventoryItemView {
  readonly identifier: string;
  /** Distinct entity-type claims visible across this entity's assertions,
   * in first-encountered order — never reduced to a single type. */
  readonly entityTypes: readonly string[];
  readonly assertionCount: number;
}

export function projectEntityInventoryItem(
  item: EntityReadResult,
): EntityInventoryItemView {
  const entityTypes: string[] = [];
  for (const assertion of item.assertions) {
    const { claim } = assertion.revision;
    if (
      claim.claimKind === "entity" &&
      !entityTypes.includes(claim.entityType)
    ) {
      entityTypes.push(claim.entityType);
    }
  }
  return {
    identifier: item.subject.identifier,
    entityTypes,
    assertionCount: item.assertions.length,
  };
}

export interface SubjectSearchItemView {
  readonly identifier: string;
  readonly subjectKind: "entity" | "relationship";
  readonly entityTypes: readonly string[];
  readonly relationshipTypes: readonly string[];
  readonly assertionCount: number;
}

export function projectSubjectSearchItem(
  item: SubjectReadResult,
): SubjectSearchItemView {
  const entityTypes: string[] = [];
  const relationshipTypes: string[] = [];
  for (const assertion of item.assertions) {
    const { claim } = assertion.revision;
    if (claim.claimKind === "entity") {
      if (!entityTypes.includes(claim.entityType)) {
        entityTypes.push(claim.entityType);
      }
    } else if (!relationshipTypes.includes(claim.relationshipType)) {
      relationshipTypes.push(claim.relationshipType);
    }
  }
  return {
    identifier: item.subject.identifier,
    subjectKind: item.subject.subjectKind,
    entityTypes,
    relationshipTypes,
    assertionCount: item.assertions.length,
  };
}

export interface EntityDetailView {
  readonly identifier: string;
  readonly entityTypes: readonly string[];
  readonly assertionCount: number;
}

export function projectEntityDetail(
  detail: SubjectReadResult,
): EntityDetailView {
  const entityTypes: string[] = [];
  for (const assertion of detail.assertions) {
    const { claim } = assertion.revision;
    if (
      claim.claimKind === "entity" &&
      !entityTypes.includes(claim.entityType)
    ) {
      entityTypes.push(claim.entityType);
    }
  }
  return {
    identifier: detail.subject.identifier,
    entityTypes,
    assertionCount: detail.assertions.length,
  };
}
