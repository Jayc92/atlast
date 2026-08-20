/**
 * The M5-A Kubernetes Evidence translator (ADR-0036 § 2). A pure function:
 * no I/O, no clock read (the caller supplies `observedAt`/`recordedAt`),
 * directly unit-testable with a plain {@link ObservedPod} value and no
 * real cluster. Depends only on `@atlast/shared`'s existing, unmodified
 * `Evidence` contract — no new Evidence shape, observation kind, or
 * schema is introduced.
 */
import {
  CURRENT_SCHEMA_VERSION,
  evidenceSchema,
  type Evidence,
} from "@atlast/shared";
import type { ObservedPod } from "./observed-pod.ts";

const KUBERNETES_DISCOVERY_SOURCE = "kubernetes";
const OBSERVED_ENTITY_TYPE = "kubernetes-pod";

export interface MapObservedPodToEvidenceInput {
  readonly pod: ObservedPod;
  /** Strictly increasing across the whole store this connector appends to. */
  readonly recordedSequence: number;
  /** Canonical UTC millisecond timestamp — when the Pod was observed. */
  readonly observedAt: string;
  /** Canonical UTC millisecond timestamp — when this Evidence was recorded. */
  readonly recordedAt: string;
}

/**
 * Maps one observed Pod into one Entity-observation Evidence record, in
 * the exact normalized shape the synthetic `demo-company` fixtures
 * already use — no Kubernetes-specific field, no connector-specific
 * schema. `detail` carries the only Kubernetes-native information
 * (namespace and name), consistent with Evidence's "the only free-form
 * region" design (ADR-0014).
 */
export function mapObservedPodToEvidence(
  input: MapObservedPodToEvidenceInput,
): Evidence {
  const { pod, recordedSequence, observedAt, recordedAt } = input;
  // Hyphen-joined, never slash-joined (M5-A identity case study finding,
  // docs/m5-plan.md § 4.2): the accepted m1-v1 identity grammar
  // (packages/graph-model/src/identity-normalization.ts's
  // LOWERCASE_ASCII_KEY_PATTERN, ADR-0022 § 2) accepts only
  // `[a-z0-9]+(-[a-z0-9]+)*` — a literal "/" is rejected outright with a
  // loud IdentityNormalizationError, reproduced against this real cluster
  // before this fix. Kubernetes' natural namespace/name compound identity
  // must therefore be expressed with a non-slash separator to normalize
  // successfully; this connector does not alter the accepted grammar.
  const sourceNativeId = `${pod.namespace}-${pod.name}`;

  return evidenceSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: `atlast:evidence:kubernetes/${pod.namespace}/${pod.name}/${String(recordedSequence)}`,
    observedAt,
    recordedAt,
    recordedSequence,
    sourceScopedIdentity: {
      source: KUBERNETES_DISCOVERY_SOURCE,
      sourceNativeId,
    },
    observation: {
      observationKind: "entity",
      entityType: OBSERVED_ENTITY_TYPE,
    },
    detail: {
      namespace: pod.namespace,
      name: pod.name,
    },
  });
}
