/**
 * The Kubernetes connector's Pod data shape (M5-A, ADR-0036 § 2; extended
 * M6-B, ADR-0039 §§ 2, 3). Deliberately plain and library-agnostic — no
 * `@kubernetes/client-node` type (e.g. `V1Pod`) crosses this boundary.
 * `client.ts` projects a real `V1Pod` into this shape before returning;
 * every other module in this connector, including `evidence-mapping.ts`
 * and `relationship-derivation.ts`, depends only on this type, never on
 * the client library itself.
 */
import type { ControllerOwnerReference } from "./controller-owner-reference.ts";

export interface ObservedPod {
  readonly namespace: string;
  readonly name: string;
  /** For Service-selector matching only (ADR-0039 § 3) — never retained beyond that use. */
  readonly labels: Readonly<Record<string, string>>;
  /**
   * The Pod's controller owner reference, if any (ADR-0039 § 2). `null` is
   * a real, valid Kubernetes state — a bare Pod with no controller — and
   * MUST be represented honestly as no-parent, never inferred or invented.
   */
  readonly controllerOwnerReference: ControllerOwnerReference | null;
}
