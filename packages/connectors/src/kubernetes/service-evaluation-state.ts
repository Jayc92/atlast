/**
 * The connector's own computed Service-selector evaluation result for one
 * poll cycle (ADR-0039 § 3). Not a Relationship claim — the existing
 * Relationship-claim model can only assert positive facts, and cases A, D,
 * and E below have none to assert. This is recorded as Entity-observation
 * `detail` on the Service's own Evidence (`evidence-mapping.ts`), so a
 * tester can distinguish the four states honestly via the existing Trust
 * Inspector's Evidence-dereference feature, without any graph-model
 * change and without ever inventing a fake edge.
 *
 * - **Known zero (case A):** `hasSelector: true`, `matchedPodCount: 0`,
 *   `evaluatedAgainstCompletePodSet: true`.
 * - **One/multiple matches (cases B/C):** same shape as A, with
 *   `matchedPodCount >= 1` — real `selects` Relationship Evidence also
 *   exists for each match.
 * - **Insufficient evidence (case D):** `hasSelector: true`,
 *   `matchedPodCount: null`, `evaluatedAgainstCompletePodSet: false` — the
 *   connector could not safely evaluate this cycle (ADR-0039 § 3's own
 *   "open implementation-review question," resolved by this connector's
 *   atomic-per-cycle observation design — see `connector-mode.ts`).
 * - **Selectorless / not applicable (case E):** `hasSelector: false`,
 *   `matchedPodCount: null`, `evaluatedAgainstCompletePodSet: false` — the
 *   evaluation itself does not apply, never conflated with case D.
 */
export interface ServiceEvaluationState {
  readonly hasSelector: boolean;
  readonly matchedPodCount: number | null;
  readonly evaluatedAgainstCompletePodSet: boolean;
}

export const SELECTORLESS_EVALUATION_STATE: ServiceEvaluationState = {
  hasSelector: false,
  matchedPodCount: null,
  evaluatedAgainstCompletePodSet: false,
};

export const INSUFFICIENT_EVIDENCE_EVALUATION_STATE: ServiceEvaluationState = {
  hasSelector: true,
  matchedPodCount: null,
  evaluatedAgainstCompletePodSet: false,
};

export function evaluatedEvaluationState(
  matchedPodCount: number,
): ServiceEvaluationState {
  return {
    hasSelector: true,
    matchedPodCount,
    evaluatedAgainstCompletePodSet: true,
  };
}
