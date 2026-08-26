/**
 * The Kubernetes connector's ReplicaSet data shape (M6-B, ADR-0039 §§ 1,
 * 2). `uid` lets a Pod's controller owner reference match this ReplicaSet
 * (ADR-0039 § 5); `controllerOwnerReference` lets this ReplicaSet's own
 * controller owner reference match an observed Deployment. Kubernetes
 * legitimately allows zero or one controller owner reference, and one
 * Deployment legitimately owns multiple simultaneous ReplicaSets during a
 * rolling update — normal multiplicity, never collapsed to one (ADR-0039 §
 * 2).
 */
import type { ControllerOwnerReference } from "./controller-owner-reference.ts";

export interface ObservedReplicaSet {
  readonly namespace: string;
  readonly name: string;
  readonly uid: string;
  readonly controllerOwnerReference: ControllerOwnerReference | null;
}
