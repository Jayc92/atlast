/**
 * The M5-A Kubernetes client wrapper (ADR-0036 § 2). This is the **only**
 * file anywhere in this repository permitted to import
 * `@kubernetes/client-node` — enforced by a CI-checked ESLint restriction
 * scoped to `packages/connectors/src/**` (`eslint.config.mjs`), proven by
 * regression probes in `client.ts.eslint-boundary.test.ts`.
 *
 * Exposes exactly one operation for the M5-A first slice: listing Pods in
 * one namespace. No `create*`/`patch*`/`delete*`/`replace*`/`exec*`-named
 * client method is ever imported, re-exported, or called here — this file
 * never constructs anything but a read client, and the raw client object,
 * `KubeConfig`, and `V1Pod` type never escape this module (`listPods`
 * returns the plain, library-agnostic {@link ObservedPod} shape).
 *
 * Credential supply is explicit only (ADR-0037 § 3): this module loads a
 * caller-supplied kubeconfig file and explicitly selects a caller-named
 * context — it never calls the client library's default/ambient
 * current-context resolution. The resolved context name and API server
 * URL are checked against {@link assertLocalKindTarget} (ADR-0037 § 4)
 * before any request is issued.
 */
import { CoreV1Api, KubeConfig } from "@kubernetes/client-node";
import { assertLocalKindTarget } from "./target-guard.ts";
import type { ObservedPod } from "./observed-pod.ts";

export interface ListPodsOptions {
  /** Path to a kubeconfig file. Never the ambient `~/.kube/config` default. */
  readonly kubeconfigPath: string;
  /** The exact context to use — explicitly named, never "whatever is current". */
  readonly contextName: string;
  /** The one namespace this connector is scoped to read. */
  readonly namespace: string;
}

/**
 * Lists every Pod in the configured namespace, using the explicitly
 * supplied kubeconfig context, after that context passes the real-system
 * safety guard. Read-only: this is a single `listNamespacedPod` call and
 * nothing else.
 */
export async function listPods(
  options: ListPodsOptions,
): Promise<readonly ObservedPod[]> {
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

  const coreApi = kubeConfig.makeApiClient(CoreV1Api);
  const response = await coreApi.listNamespacedPod({
    namespace: options.namespace,
  });

  return response.items.map((pod) => {
    const namespace = pod.metadata?.namespace;
    const name = pod.metadata?.name;
    if (namespace === undefined || name === undefined) {
      throw new Error(
        "Kubernetes API returned a Pod with a missing namespace or name.",
      );
    }
    return { namespace, name };
  });
}
