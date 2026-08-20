/**
 * The Kubernetes connector's only internal data shape (M5-A, ADR-0036 § 2).
 * Deliberately plain and library-agnostic — no `@kubernetes/client-node`
 * type (e.g. `V1Pod`) crosses this boundary. `client.ts` projects a real
 * `V1Pod` into this shape before returning; every other module in this
 * connector, including `evidence-mapping.ts`, depends only on this type,
 * never on the client library itself.
 */
export interface ObservedPod {
  readonly namespace: string;
  readonly name: string;
}
