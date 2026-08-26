/**
 * M6-B atomic-cycle Evidence derivation (ADR-0039 §§ 1, 2, 3). Given one
 * poll cycle's complete, successfully observed resource sets, derives
 * every Entity-observation and Relationship-observation Evidence record
 * for that cycle — Deployments, ReplicaSets, Pods, and Services, plus
 * `owns` ownership edges and `selects` selector edges, only ever between
 * endpoints both present in this same cycle's own observed sets.
 *
 * This is the connector-side resolution of the referential-integrity
 * hazard discovered during M6-B pre-implementation inspection:
 * `packages/graph-model/src/snapshot-construction.ts`'s
 * `assertReferentialIntegrity` rejects an entire topology snapshot build —
 * not merely the offending edge — if any visible Relationship claim's
 * source or target does not resolve to a subject with a visible entity
 * assertion. This module therefore never emits a relationship whose
 * endpoint was not also derived from this same, complete cycle — no
 * dangling edge is ever possible, and `packages/graph-model` itself is
 * never modified (ADR-0039 § Consequences, ADR-0040 § 5).
 *
 * The caller (`apps/api/src/connector-mode.ts`) is solely responsible for
 * this module's other half of atomicity: only calling it once all four
 * `list*` operations for a cycle have already succeeded, and appending
 * nothing at all if any one of them failed.
 */
import type { Evidence } from "@atlast/shared";
import { resolveControllerOwner } from "./controller-ownership-matching.ts";
import {
  mapObservedDeploymentToEvidence,
  mapObservedPodToEvidence,
  mapObservedReplicaSetToEvidence,
  mapObservedServiceToEvidence,
  mapOwnershipToEvidence,
  mapSelectionToEvidence,
} from "./evidence-mapping.ts";
import type { ObservedDeployment } from "./observed-deployment.ts";
import type { ObservedPod } from "./observed-pod.ts";
import type { ObservedReplicaSet } from "./observed-replicaset.ts";
import type { ObservedService } from "./observed-service.ts";
import { evaluateServiceSelector } from "./service-selector-matching.ts";

export interface ObservedResourceCycle {
  readonly deployments: readonly ObservedDeployment[];
  readonly replicaSets: readonly ObservedReplicaSet[];
  readonly pods: readonly ObservedPod[];
  readonly services: readonly ObservedService[];
}

export interface DeriveEvidenceForCycleInput {
  readonly cycle: ObservedResourceCycle;
  /** Canonical UTC millisecond timestamp — when this whole cycle was observed. */
  readonly observedAt: string;
  /** Canonical UTC millisecond timestamp — when this cycle's Evidence was recorded. */
  readonly recordedAt: string;
  /** The first `recordedSequence` this cycle may use; strictly increasing across the whole store. */
  readonly firstRecordedSequence: number;
}

export interface DeriveEvidenceForCycleResult {
  readonly evidenceRecords: readonly Evidence[];
  /** The next unused `recordedSequence`, for the caller's following cycle. */
  readonly nextRecordedSequence: number;
}

/**
 * Deterministic ordering within one cycle: Deployments, then ReplicaSets,
 * then Pods (every entity before any relationship that might reference
 * it), then Deployment→ReplicaSet ownership, then ReplicaSet→Pod
 * ownership, then Services (each immediately followed by its own
 * `selects` edges, in observed-Pod order). Ordering does not affect
 * correctness (every relationship endpoint is validated against the
 * complete cycle regardless of Evidence-array order) but keeps output
 * reproducible and easy to read in tests/audits.
 */
export function deriveEvidenceForCycle(
  input: DeriveEvidenceForCycleInput,
): DeriveEvidenceForCycleResult {
  const { cycle, observedAt, recordedAt } = input;
  let nextRecordedSequence = input.firstRecordedSequence;
  const evidenceRecords: Evidence[] = [];

  function allocateSequence(): number {
    const sequence = nextRecordedSequence;
    nextRecordedSequence += 1;
    return sequence;
  }

  for (const deployment of cycle.deployments) {
    evidenceRecords.push(
      mapObservedDeploymentToEvidence({
        deployment,
        recordedSequence: allocateSequence(),
        observedAt,
        recordedAt,
      }),
    );
  }

  for (const replicaSet of cycle.replicaSets) {
    evidenceRecords.push(
      mapObservedReplicaSetToEvidence({
        replicaSet,
        recordedSequence: allocateSequence(),
        observedAt,
        recordedAt,
      }),
    );
  }

  for (const pod of cycle.pods) {
    evidenceRecords.push(
      mapObservedPodToEvidence({
        pod,
        recordedSequence: allocateSequence(),
        observedAt,
        recordedAt,
      }),
    );
  }

  // Deployment -> ReplicaSet ownership. Every observed ReplicaSet whose
  // controller UID resolves to an observed Deployment gets its own edge —
  // one Deployment legitimately owning multiple simultaneous ReplicaSets
  // (a rolling update) is normal multiplicity, never collapsed to one
  // (ADR-0039 § 2). No owner resolved this cycle -> no edge, never a name
  // fallback, never a thrown error.
  for (const replicaSet of cycle.replicaSets) {
    const owner = resolveControllerOwner(
      replicaSet.controllerOwnerReference,
      "Deployment",
      cycle.deployments,
    );
    if (owner !== null) {
      evidenceRecords.push(
        mapOwnershipToEvidence({
          ownerNamespace: owner.namespace,
          ownerKind: "deployment",
          ownerName: owner.name,
          childNamespace: replicaSet.namespace,
          childKind: "replicaset",
          childName: replicaSet.name,
          recordedSequence: allocateSequence(),
          observedAt,
          recordedAt,
        }),
      );
    }
  }

  // ReplicaSet -> Pod ownership, identical discipline.
  for (const pod of cycle.pods) {
    const owner = resolveControllerOwner(
      pod.controllerOwnerReference,
      "ReplicaSet",
      cycle.replicaSets,
    );
    if (owner !== null) {
      evidenceRecords.push(
        mapOwnershipToEvidence({
          ownerNamespace: owner.namespace,
          ownerKind: "replicaset",
          ownerName: owner.name,
          childNamespace: pod.namespace,
          childKind: "pod",
          childName: pod.name,
          recordedSequence: allocateSequence(),
          observedAt,
          recordedAt,
        }),
      );
    }
  }

  // Services: every Service gets its own Entity Evidence, carrying its
  // computed six-state evaluation result (ADR-0039 § 3) as `detail` —
  // never a Relationship claim for cases A/D/E, since there is no
  // positive fact to assert for any of them. The Pod set is always
  // "observed" here — atomicity (§ 7) is the caller's responsibility, so
  // by the time this function runs, this cycle's Pod list has already
  // succeeded.
  for (const service of cycle.services) {
    const { evaluationState, matchedPods } = evaluateServiceSelector(service, {
      status: "observed",
      pods: cycle.pods,
    });
    evidenceRecords.push(
      mapObservedServiceToEvidence({
        service,
        evaluationState,
        recordedSequence: allocateSequence(),
        observedAt,
        recordedAt,
      }),
    );
    for (const pod of matchedPods) {
      evidenceRecords.push(
        mapSelectionToEvidence({
          serviceNamespace: service.namespace,
          serviceName: service.name,
          podNamespace: pod.namespace,
          podName: pod.name,
          recordedSequence: allocateSequence(),
          observedAt,
          recordedAt,
        }),
      );
    }
  }

  return { evidenceRecords, nextRecordedSequence };
}
