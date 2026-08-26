/**
 * Pure Service-selector evaluation (ADR-0039 § 3). Deliberately separated
 * from the atomic-cycle orchestration in `relationship-derivation.ts` so
 * the "insufficient evidence" case (case D) — structurally unreachable via
 * the real connector's own atomic-per-cycle observation design
 * (`connector-mode.ts`) — remains directly, honestly provable by a focused
 * unit test rather than requiring a flaky live-cluster reproduction.
 */
import type { ObservedPod } from "./observed-pod.ts";
import type { ObservedService } from "./observed-service.ts";
import {
  evaluatedEvaluationState,
  INSUFFICIENT_EVIDENCE_EVALUATION_STATE,
  SELECTORLESS_EVALUATION_STATE,
  type ServiceEvaluationState,
} from "./service-evaluation-state.ts";

/**
 * Whether the complete Pod set for this poll cycle was actually observed.
 * `"not-observed"` models exactly ADR-0039 § 3 case D — "the corresponding
 * Pod-set observation needed to evaluate it is missing or from an
 * inconsistent poll cycle." The real connector never constructs this
 * variant (its atomic-per-cycle design, § 7, means a Service is only ever
 * evaluated once the same cycle's Pod list has also already succeeded) —
 * it exists so this exact case can still be exercised directly, honestly,
 * by an injected test.
 */
export type PodSetObservation =
  | { readonly status: "observed"; readonly pods: readonly ObservedPod[] }
  | { readonly status: "not-observed" };

/**
 * Kubernetes selector matching is an exact AND of key=value pairs — never
 * fuzzy or regex matching (ADR-0039 § 3).
 */
function labelsSatisfySelector(
  labels: Readonly<Record<string, string>>,
  selector: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(selector).every(
    ([key, value]) => labels[key] === value,
  );
}

export interface ServiceSelectorEvaluation {
  readonly evaluationState: ServiceEvaluationState;
  readonly matchedPods: readonly ObservedPod[];
}

/**
 * Evaluates one Service's selector against one poll cycle's Pod
 * observation, distinguishing all six ADR-0039 § 3 states without ever
 * defaulting an unevaluable case to "zero matches."
 */
export function evaluateServiceSelector(
  service: ObservedService,
  podSetObservation: PodSetObservation,
): ServiceSelectorEvaluation {
  if (service.selector === null) {
    // Case E: not selector-backed at all — the search itself does not apply.
    return { evaluationState: SELECTORLESS_EVALUATION_STATE, matchedPods: [] };
  }
  if (podSetObservation.status === "not-observed") {
    // Case D: genuinely unknown — never defaulted to a known zero.
    return {
      evaluationState: INSUFFICIENT_EVIDENCE_EVALUATION_STATE,
      matchedPods: [],
    };
  }
  const selector = service.selector;
  const matchedPods = podSetObservation.pods.filter((pod) =>
    labelsSatisfySelector(pod.labels, selector),
  );
  // Cases A (0), B (1), C (>1) — all represented by the same computed,
  // positive "evaluated" fact; only the count differs.
  return {
    evaluationState: evaluatedEvaluationState(matchedPods.length),
    matchedPods,
  };
}
