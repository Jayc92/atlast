/**
 * The Kubernetes connector's narrow, library-agnostic projection of an
 * `ownerReferences` entry (M6-B, ADR-0039 §§ 2, 5). Only the `controller:
 * true` entry is ever projected — Kubernetes guarantees at most one, an
 * API-level invariant this connector relies on rather than re-derives.
 * `uid` is captured for ownership-matching correctness and provenance only
 * (ADR-0039 § 5) — it never becomes part of the accepted, namespace/
 * name-based human-facing Atlast identity.
 */
export interface ControllerOwnerReference {
  readonly kind: string;
  readonly name: string;
  readonly uid: string;
}
