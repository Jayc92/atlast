/**
 * The Kubernetes client wrapper (M5-A, ADR-0036 § 2; extended M6-B, ADR-0039
 * § 1). This is the **only** file anywhere in this repository permitted to
 * import `@kubernetes/client-node` — enforced by a CI-checked ESLint
 * restriction scoped to `packages/connectors/src/**` (`eslint.config.mjs`),
 * proven by regression probes in `client.ts.eslint-boundary.test.ts`.
 *
 * Exposes exactly four read operations: listing Pods, Deployments,
 * ReplicaSets, and Services in one namespace (ADR-0039 § 1). No
 * `create*`/`patch*`/`delete*`/`replace*`/`exec*`-named client method is
 * ever imported, re-exported, or called here — this file never constructs
 * anything but a read client, and no raw client type (`V1Pod`,
 * `V1Deployment`, `V1ReplicaSet`, `V1Service`, `KubeConfig`) ever escapes
 * this module — every function returns a plain, library-agnostic
 * `Observed*` shape.
 *
 * Credential supply is explicit only (ADR-0037 § 3): this module loads a
 * caller-supplied kubeconfig file and explicitly selects a caller-named
 * context — it never calls the client library's default/ambient
 * current-context resolution. The resolved context name and API server URL
 * are checked against {@link assertLocalKindTarget} (ADR-0037 § 4) before
 * any request is issued.
 */
import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  type V1OwnerReference,
} from "@kubernetes/client-node";
import { assertLocalKindTarget } from "./target-guard.ts";
import type { ControllerOwnerReference } from "./controller-owner-reference.ts";
import type { ObservedDeployment } from "./observed-deployment.ts";
import type { ObservedPod } from "./observed-pod.ts";
import type { ObservedReplicaSet } from "./observed-replicaset.ts";
import type { ObservedService } from "./observed-service.ts";

export interface KubernetesListOptions {
  /** Path to a kubeconfig file. Never the ambient `~/.kube/config` default. */
  readonly kubeconfigPath: string;
  /** The exact context to use — explicitly named, never "whatever is current". */
  readonly contextName: string;
  /** The one namespace this connector is scoped to read. */
  readonly namespace: string;
}

/**
 * Loads the caller-supplied kubeconfig, resolves the named context and its
 * cluster, and passes both through the real-system safety guard (ADR-0037 §
 * 4) before constructing any API client — shared by every list operation
 * below so the guard is checked exactly once per call, identically.
 */
function resolveGuardedApiClients(options: KubernetesListOptions): {
  readonly coreApi: CoreV1Api;
  readonly appsApi: AppsV1Api;
} {
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromFile(options.kubeconfigPath);
  kubeConfig.setCurrentContext(options.contextName);

  const context = kubeConfig.getContextObject(options.contextName);
  if (context === null) {
    throw new Error(
      `Kubeconfig context ${JSON.stringify(options.contextName)} was not found in ${JSON.stringify(options.kubeconfigPath)}.`,
    );
  }
  const cluster = kubeConfig.getCluster(context.cluster);
  if (cluster === null) {
    throw new Error(
      `Kubeconfig cluster for context ${JSON.stringify(options.contextName)} was not found in ${JSON.stringify(options.kubeconfigPath)}.`,
    );
  }

  assertLocalKindTarget(options.contextName, cluster.server);

  return {
    coreApi: kubeConfig.makeApiClient(CoreV1Api),
    appsApi: kubeConfig.makeApiClient(AppsV1Api),
  };
}

/**
 * Projects a real object's `ownerReferences` into at most one
 * {@link ControllerOwnerReference} (ADR-0039 § 2): Kubernetes guarantees at
 * most one `controller: true` entry, an API-level invariant this connector
 * relies on rather than re-derives. `null` — no controller owner reference
 * at all — is a real, valid Kubernetes state, never treated as an error.
 */
function extractControllerOwnerReference(
  ownerReferences: readonly V1OwnerReference[] | undefined,
): ControllerOwnerReference | null {
  const controllerReference = (ownerReferences ?? []).find(
    (ownerReference) => ownerReference.controller === true,
  );
  if (controllerReference === undefined) {
    return null;
  }
  return {
    kind: controllerReference.kind,
    name: controllerReference.name,
    uid: controllerReference.uid,
  };
}

function requireNamespaceAndName(
  metadata: { readonly namespace?: string; readonly name?: string } | undefined,
  resourceKind: string,
): { readonly namespace: string; readonly name: string } {
  const namespace = metadata?.namespace;
  const name = metadata?.name;
  if (namespace === undefined || name === undefined) {
    throw new Error(
      `Kubernetes API returned a ${resourceKind} with a missing namespace or name.`,
    );
  }
  return { namespace, name };
}

/**
 * Lists every Pod in the configured namespace. Read-only: a single
 * `listNamespacedPod` call and nothing else. Retains `labels` (ADR-0039 §
 * 3, for Service-selector matching only) and the controller owner
 * reference (ADR-0039 § 2) — never any other field of the raw object.
 */
export async function listPods(
  options: KubernetesListOptions,
): Promise<readonly ObservedPod[]> {
  const { coreApi } = resolveGuardedApiClients(options);
  const response = await coreApi.listNamespacedPod({
    namespace: options.namespace,
  });

  return response.items.map((pod) => {
    const { namespace, name } = requireNamespaceAndName(pod.metadata, "Pod");
    return {
      namespace,
      name,
      labels: { ...(pod.metadata?.labels ?? {}) },
      controllerOwnerReference: extractControllerOwnerReference(
        pod.metadata?.ownerReferences,
      ),
    };
  });
}

/**
 * Lists every Deployment in the configured namespace. Read-only: a single
 * `listNamespacedDeployment` call and nothing else (ADR-0039 § 1).
 */
export async function listDeployments(
  options: KubernetesListOptions,
): Promise<readonly ObservedDeployment[]> {
  const { appsApi } = resolveGuardedApiClients(options);
  const response = await appsApi.listNamespacedDeployment({
    namespace: options.namespace,
  });

  return response.items.map((deployment) => {
    const { namespace, name } = requireNamespaceAndName(
      deployment.metadata,
      "Deployment",
    );
    const uid = deployment.metadata?.uid;
    if (uid === undefined) {
      throw new Error(
        `Kubernetes API returned a Deployment ${namespace}/${name} with a missing uid.`,
      );
    }
    return { namespace, name, uid };
  });
}

/**
 * Lists every ReplicaSet in the configured namespace. Read-only: a single
 * `listNamespacedReplicaSet` call and nothing else (ADR-0039 § 1). Retains
 * the controller owner reference (ADR-0039 § 2) so a ReplicaSet's own
 * owning Deployment can be matched by UID.
 */
export async function listReplicaSets(
  options: KubernetesListOptions,
): Promise<readonly ObservedReplicaSet[]> {
  const { appsApi } = resolveGuardedApiClients(options);
  const response = await appsApi.listNamespacedReplicaSet({
    namespace: options.namespace,
  });

  return response.items.map((replicaSet) => {
    const { namespace, name } = requireNamespaceAndName(
      replicaSet.metadata,
      "ReplicaSet",
    );
    const uid = replicaSet.metadata?.uid;
    if (uid === undefined) {
      throw new Error(
        `Kubernetes API returned a ReplicaSet ${namespace}/${name} with a missing uid.`,
      );
    }
    return {
      namespace,
      name,
      uid,
      controllerOwnerReference: extractControllerOwnerReference(
        replicaSet.metadata?.ownerReferences,
      ),
    };
  });
}

/**
 * Lists every Service in the configured namespace. Read-only: a single
 * `listNamespacedService` call and nothing else (ADR-0039 § 1). `selector`
 * is `null` for a genuinely selectorless Service (case E) — never defaulted
 * to an empty object, which would be a different, false claim (a selector
 * that matches everything).
 */
export async function listServices(
  options: KubernetesListOptions,
): Promise<readonly ObservedService[]> {
  const { coreApi } = resolveGuardedApiClients(options);
  const response = await coreApi.listNamespacedService({
    namespace: options.namespace,
  });

  return response.items.map((service) => {
    const { namespace, name } = requireNamespaceAndName(
      service.metadata,
      "Service",
    );
    const rawSelector = service.spec?.selector;
    const hasSelector =
      rawSelector !== undefined && Object.keys(rawSelector).length > 0;
    return {
      namespace,
      name,
      selector: hasSelector ? { ...rawSelector } : null,
    };
  });
}
