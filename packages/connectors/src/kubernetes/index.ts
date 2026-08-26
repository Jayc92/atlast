/**
 * The Kubernetes connector's complete public surface (M5-A, ADR-0036 § 2;
 * extended M6-B, ADR-0039 § 1). Exactly the narrow, read-only operations
 * and pure translators/derivation — never the raw `@kubernetes/client-node`
 * client, `KubeConfig`, or any raw `V1*` type.
 */
export {
  listDeployments,
  listPods,
  listReplicaSets,
  listServices,
  type KubernetesListOptions,
} from "./client.ts";
export type { ControllerOwnerReference } from "./controller-owner-reference.ts";
export { resolveControllerOwner } from "./controller-ownership-matching.ts";
export {
  mapObservedDeploymentToEvidence,
  mapObservedPodToEvidence,
  mapObservedReplicaSetToEvidence,
  mapObservedServiceToEvidence,
  mapOwnershipToEvidence,
  mapSelectionToEvidence,
  type MapObservedDeploymentToEvidenceInput,
  type MapObservedPodToEvidenceInput,
  type MapObservedReplicaSetToEvidenceInput,
  type MapObservedServiceToEvidenceInput,
  type MapOwnershipToEvidenceInput,
  type MapSelectionToEvidenceInput,
} from "./evidence-mapping.ts";
export type { ObservedDeployment } from "./observed-deployment.ts";
export type { ObservedPod } from "./observed-pod.ts";
export type { ObservedReplicaSet } from "./observed-replicaset.ts";
export type { ObservedService } from "./observed-service.ts";
export {
  deriveEvidenceForCycle,
  type DeriveEvidenceForCycleInput,
  type DeriveEvidenceForCycleResult,
  type ObservedResourceCycle,
} from "./relationship-derivation.ts";
export {
  evaluateServiceSelector,
  type PodSetObservation,
  type ServiceSelectorEvaluation,
} from "./service-selector-matching.ts";
export {
  evaluatedEvaluationState,
  INSUFFICIENT_EVIDENCE_EVALUATION_STATE,
  SELECTORLESS_EVALUATION_STATE,
  type ServiceEvaluationState,
} from "./service-evaluation-state.ts";
export { assertLocalKindTarget, TargetGuardError } from "./target-guard.ts";
