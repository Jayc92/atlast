/**
 * The Kubernetes connector's Deployment data shape (M6-B, ADR-0039 § 1).
 * `uid` is retained solely so `relationship-derivation.ts` can match a
 * ReplicaSet's controller owner reference against it (ADR-0039 § 5) — it
 * never becomes part of the accepted human-facing Atlast identity.
 */
export interface ObservedDeployment {
  readonly namespace: string;
  readonly name: string;
  readonly uid: string;
}
