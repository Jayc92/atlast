/**
 * Pure controller-ownership matching (ADR-0039 §§ 2, 5). Matching MUST be
 * by Kubernetes UID, never by name — names can be reused after a real
 * object is deleted and recreated, and matching by name alone could
 * silently attach a child to the wrong parent.
 */
import type { ControllerOwnerReference } from "./controller-owner-reference.ts";

export interface UidIdentified {
  readonly uid: string;
}

/**
 * Resolves a child's controller owner reference against the set of
 * candidate parents actually observed in the same poll cycle. Returns
 * `null` — never throws, never invents a fallback — whenever:
 *
 * - the child has no controller owner reference at all (a real, valid
 *   Kubernetes state, ADR-0039 § 2's "ownerless" case); or
 * - the reference's `kind` does not match the expected parent kind; or
 * - the reference's `uid` does not match any candidate observed in this
 *   same cycle (a dangling/unobserved owner, or a same-name/different-UID
 *   non-match, ADR-0039 § 5) — the caller must never emit a relationship
 *   for this edge in that case, per the binding "prefer UNKNOWN over
 *   invented topology" principle (ADR-0039 §§ 2–3 Contractual Invariants).
 */
export function resolveControllerOwner<Candidate extends UidIdentified>(
  controllerOwnerReference: ControllerOwnerReference | null,
  expectedOwnerKind: string,
  candidateOwners: readonly Candidate[],
): Candidate | null {
  if (controllerOwnerReference === null) {
    return null;
  }
  if (controllerOwnerReference.kind !== expectedOwnerKind) {
    return null;
  }
  return (
    candidateOwners.find(
      (candidate) => candidate.uid === controllerOwnerReference.uid,
    ) ?? null
  );
}
