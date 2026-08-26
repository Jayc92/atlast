/**
 * The Kubernetes Evidence translators (M5-A, ADR-0036 § 2; extended M6-B,
 * ADR-0039 §§ 1, 3). Every function here is pure: no I/O, no clock read
 * (the caller supplies `observedAt`/`recordedAt`), directly unit-testable
 * with plain `Observed*` values and no real cluster. Depends only on
 * `@atlast/shared`'s existing, unmodified `Evidence` contract — no new
 * Evidence shape, observation kind, or schema is introduced by any
 * resource kind added here.
 */
import {
  CURRENT_SCHEMA_VERSION,
  evidenceSchema,
  type Evidence,
} from "@atlast/shared";
import type { ObservedDeployment } from "./observed-deployment.ts";
import type { ObservedPod } from "./observed-pod.ts";
import type { ObservedReplicaSet } from "./observed-replicaset.ts";
import type { ObservedService } from "./observed-service.ts";
import type { ServiceEvaluationState } from "./service-evaluation-state.ts";

const KUBERNETES_DISCOVERY_SOURCE = "kubernetes";
const OBSERVED_ENTITY_TYPE = "kubernetes-pod";
const OBSERVED_DEPLOYMENT_ENTITY_TYPE = "kubernetes-deployment";
const OBSERVED_REPLICASET_ENTITY_TYPE = "kubernetes-replicaset";
const OBSERVED_SERVICE_ENTITY_TYPE = "kubernetes-service";
const OWNS_RELATIONSHIP_TYPE = "owns";
const SELECTS_RELATIONSHIP_TYPE = "selects";

/**
 * The literal, lowercase Kubernetes resource-kind discriminator tokens
 * ADR-0043 § 1 requires as the middle segment of every Kubernetes
 * connector-derived `sourceNativeId` — the same vocabulary already used,
 * minus the `kubernetes-` prefix, in each kind's `entityType`
 * classification (ADR-0039 § 1).
 */
export type KubernetesResourceKind =
  "deployment" | "replicaset" | "pod" | "service";

/**
 * Hyphen-joined, never slash-joined (M5-A identity case study finding,
 * `docs/m5-plan.md § 4.2`): the accepted `m1-v1` identity grammar
 * (`packages/graph-model/src/identity-normalization.ts`'s
 * `LOWERCASE_ASCII_KEY_PATTERN`, ADR-0022 § 2) accepts only
 * `[a-z0-9]+(-[a-z0-9]+)*` — a literal "/" is rejected outright.
 *
 * `kind` is placed in the middle, between namespace and name — never as a
 * leading or trailing token — because the frozen `m1-v1` decorative-affix
 * policy only ever strips from the whole string's own start/end, and a
 * leading/trailing `service`/`svc` token collides with that policy's own
 * `decorativeAffixes` list (ADR-0043 § 2). This is the single shared
 * construction every Kubernetes resource kind and every relationship
 * endpoint this connector observes must use — never a kind-specific
 * variant (ADR-0043 § 1, § 6).
 */
function sourceNativeId(
  namespace: string,
  kind: KubernetesResourceKind,
  name: string,
): string {
  return `${namespace}-${kind}-${name}`;
}

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

  return evidenceSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: `atlast:evidence:kubernetes/${pod.namespace}/${pod.name}/${String(recordedSequence)}`,
    observedAt,
    recordedAt,
    recordedSequence,
    sourceScopedIdentity: {
      source: KUBERNETES_DISCOVERY_SOURCE,
      sourceNativeId: sourceNativeId(pod.namespace, "pod", pod.name),
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

export interface MapObservedDeploymentToEvidenceInput {
  readonly deployment: ObservedDeployment;
  readonly recordedSequence: number;
  readonly observedAt: string;
  readonly recordedAt: string;
}

/** Maps one observed Deployment into one Entity-observation Evidence record (ADR-0039 § 1). */
export function mapObservedDeploymentToEvidence(
  input: MapObservedDeploymentToEvidenceInput,
): Evidence {
  const { deployment, recordedSequence, observedAt, recordedAt } = input;

  return evidenceSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: `atlast:evidence:kubernetes/deployment/${deployment.namespace}/${deployment.name}/${String(recordedSequence)}`,
    observedAt,
    recordedAt,
    recordedSequence,
    sourceScopedIdentity: {
      source: KUBERNETES_DISCOVERY_SOURCE,
      sourceNativeId: sourceNativeId(
        deployment.namespace,
        "deployment",
        deployment.name,
      ),
    },
    observation: {
      observationKind: "entity",
      entityType: OBSERVED_DEPLOYMENT_ENTITY_TYPE,
    },
    detail: {
      namespace: deployment.namespace,
      name: deployment.name,
    },
  });
}

export interface MapObservedReplicaSetToEvidenceInput {
  readonly replicaSet: ObservedReplicaSet;
  readonly recordedSequence: number;
  readonly observedAt: string;
  readonly recordedAt: string;
}

/**
 * Maps one observed ReplicaSet into one Entity-observation Evidence record
 * (ADR-0039 § 1). `detail.controllerOwnerReference` is included for
 * inspectability/provenance — it explains, without needing a real cluster,
 * why an `owns` relationship was or was not derived for this ReplicaSet —
 * never as a second source of ownership truth (the relationship claim
 * itself, derived by `relationship-derivation.ts`, is that).
 */
export function mapObservedReplicaSetToEvidence(
  input: MapObservedReplicaSetToEvidenceInput,
): Evidence {
  const { replicaSet, recordedSequence, observedAt, recordedAt } = input;

  return evidenceSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: `atlast:evidence:kubernetes/replicaset/${replicaSet.namespace}/${replicaSet.name}/${String(recordedSequence)}`,
    observedAt,
    recordedAt,
    recordedSequence,
    sourceScopedIdentity: {
      source: KUBERNETES_DISCOVERY_SOURCE,
      sourceNativeId: sourceNativeId(
        replicaSet.namespace,
        "replicaset",
        replicaSet.name,
      ),
    },
    observation: {
      observationKind: "entity",
      entityType: OBSERVED_REPLICASET_ENTITY_TYPE,
    },
    detail: {
      namespace: replicaSet.namespace,
      name: replicaSet.name,
      controllerOwnerReference: replicaSet.controllerOwnerReference,
    },
  });
}

export interface MapObservedServiceToEvidenceInput {
  readonly service: ObservedService;
  /**
   * The connector's own computed evaluation result for this Service
   * against this poll cycle's complete observed Pod set (ADR-0039 § 3) —
   * supplied by `relationship-derivation.ts`, since evaluating a selector
   * requires cross-referencing the Pod set this pure per-object translator
   * does not otherwise see.
   */
  readonly evaluationState: ServiceEvaluationState;
  readonly recordedSequence: number;
  readonly observedAt: string;
  readonly recordedAt: string;
}

/**
 * Maps one observed Service into one Entity-observation Evidence record
 * (ADR-0039 § 1, § 3). `detail` carries the connector's own computed
 * selector-evaluation state — the only way this project's existing
 * Relationship-claim model (which can only assert positive facts) can
 * honestly represent a known-zero match, an unevaluated selector, or a
 * genuinely selectorless Service, without inventing a fake relationship
 * or a new graph-model concept.
 */
export function mapObservedServiceToEvidence(
  input: MapObservedServiceToEvidenceInput,
): Evidence {
  const { service, evaluationState, recordedSequence, observedAt, recordedAt } =
    input;

  return evidenceSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: `atlast:evidence:kubernetes/service/${service.namespace}/${service.name}/${String(recordedSequence)}`,
    observedAt,
    recordedAt,
    recordedSequence,
    sourceScopedIdentity: {
      source: KUBERNETES_DISCOVERY_SOURCE,
      sourceNativeId: sourceNativeId(
        service.namespace,
        "service",
        service.name,
      ),
    },
    observation: {
      observationKind: "entity",
      entityType: OBSERVED_SERVICE_ENTITY_TYPE,
    },
    detail: {
      namespace: service.namespace,
      name: service.name,
      selector: service.selector,
      evaluation: evaluationState,
    },
  });
}

export interface MapOwnershipToEvidenceInput {
  /** The owning Deployment or ReplicaSet's own source-scoped identity. */
  readonly ownerNamespace: string;
  readonly ownerKind: KubernetesResourceKind;
  readonly ownerName: string;
  /** The owned ReplicaSet or Pod's own source-scoped identity. */
  readonly childNamespace: string;
  readonly childKind: KubernetesResourceKind;
  readonly childName: string;
  readonly recordedSequence: number;
  readonly observedAt: string;
  readonly recordedAt: string;
}

/**
 * Maps one confirmed ownership edge (Deployment→ReplicaSet or
 * ReplicaSet→Pod, ADR-0039 § 2) into one Relationship-observation Evidence
 * record, using the existing, unmodified `relationshipObservationSchema` —
 * no new fact category. The caller (`relationship-derivation.ts`) is
 * responsible for only ever calling this once both endpoints are already
 * confirmed present in the same successful observation cycle — this
 * function itself performs no such check, and trusts its caller's
 * referential-integrity discipline completely.
 */
export function mapOwnershipToEvidence(
  input: MapOwnershipToEvidenceInput,
): Evidence {
  const {
    ownerNamespace,
    ownerKind,
    ownerName,
    childNamespace,
    childKind,
    childName,
    recordedSequence,
    observedAt,
    recordedAt,
  } = input;
  const ownerNativeId = sourceNativeId(ownerNamespace, ownerKind, ownerName);
  const childNativeId = sourceNativeId(childNamespace, childKind, childName);

  return evidenceSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: `atlast:evidence:kubernetes/owns/${ownerNativeId}/${childNativeId}/${String(recordedSequence)}`,
    observedAt,
    recordedAt,
    recordedSequence,
    sourceScopedIdentity: {
      source: KUBERNETES_DISCOVERY_SOURCE,
      sourceNativeId: `${ownerNativeId}-owns-${childNativeId}`,
    },
    observation: {
      observationKind: "relationship",
      relationshipType: OWNS_RELATIONSHIP_TYPE,
      sourceEntityIdentity: {
        source: KUBERNETES_DISCOVERY_SOURCE,
        sourceNativeId: ownerNativeId,
      },
      targetEntityIdentity: {
        source: KUBERNETES_DISCOVERY_SOURCE,
        sourceNativeId: childNativeId,
      },
    },
    detail: {
      ownerNamespace,
      ownerName,
      childNamespace,
      childName,
    },
  });
}

export interface MapSelectionToEvidenceInput {
  readonly serviceNamespace: string;
  readonly serviceName: string;
  readonly podNamespace: string;
  readonly podName: string;
  readonly recordedSequence: number;
  readonly observedAt: string;
  readonly recordedAt: string;
}

/**
 * Maps one confirmed Service→Pod selector match (ADR-0039 § 3, cases B/C)
 * into one Relationship-observation Evidence record. Only ever called for
 * a real, computed match — cases A/D/E (§ 11) never reach this function at
 * all, since there is no positive fact to assert for them.
 */
export function mapSelectionToEvidence(
  input: MapSelectionToEvidenceInput,
): Evidence {
  const {
    serviceNamespace,
    serviceName,
    podNamespace,
    podName,
    recordedSequence,
    observedAt,
    recordedAt,
  } = input;
  const serviceNativeId = sourceNativeId(
    serviceNamespace,
    "service",
    serviceName,
  );
  const podNativeId = sourceNativeId(podNamespace, "pod", podName);

  return evidenceSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: `atlast:evidence:kubernetes/selects/${serviceNativeId}/${podNativeId}/${String(recordedSequence)}`,
    observedAt,
    recordedAt,
    recordedSequence,
    sourceScopedIdentity: {
      source: KUBERNETES_DISCOVERY_SOURCE,
      sourceNativeId: `${serviceNativeId}-selects-${podNativeId}`,
    },
    observation: {
      observationKind: "relationship",
      relationshipType: SELECTS_RELATIONSHIP_TYPE,
      sourceEntityIdentity: {
        source: KUBERNETES_DISCOVERY_SOURCE,
        sourceNativeId: serviceNativeId,
      },
      targetEntityIdentity: {
        source: KUBERNETES_DISCOVERY_SOURCE,
        sourceNativeId: podNativeId,
      },
    },
    detail: {
      serviceNamespace,
      serviceName,
      podNamespace,
      podName,
    },
  });
}
