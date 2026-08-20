/**
 * The M5-A Kubernetes connector's complete public surface (ADR-0036 § 2).
 * Exactly the narrow, read-only operation and pure translator — never the
 * raw `@kubernetes/client-node` client, `KubeConfig`, or `V1Pod` type.
 */
export { listPods, type ListPodsOptions } from "./client.ts";
export {
  mapObservedPodToEvidence,
  type MapObservedPodToEvidenceInput,
} from "./evidence-mapping.ts";
export { assertLocalKindTarget, TargetGuardError } from "./target-guard.ts";
export type { ObservedPod } from "./observed-pod.ts";
