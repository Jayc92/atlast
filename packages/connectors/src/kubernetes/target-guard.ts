/**
 * The M5-A real-system safety boundary's runtime enforcement mechanism
 * (ADR-0037 § 4). A naive loopback-hostname check alone is spoofable by a
 * port-forwarded or proxied connection to a remote cluster; this guard
 * therefore requires both an explicit Kind-assigned context name and a
 * loopback-resolved server URL, and fails closed — throws, never returns
 * a boolean the caller might ignore — if either signal is absent,
 * ambiguous, or the two disagree.
 *
 * Deliberately independent of `@kubernetes/client-node`: it takes plain
 * strings, not a `KubeConfig` object, so it is testable without the client
 * library, without a real cluster, and without crossing this connector's
 * one-file import boundary (`client.ts` extracts the two strings from its
 * own `KubeConfig` before calling this function).
 */

const KIND_CONTEXT_PREFIX = "kind-";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class TargetGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetGuardError";
  }
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * Throws {@link TargetGuardError} unless the named kubeconfig context
 * carries Kind's own conventional `kind-` prefix **and** the resolved API
 * server URL for that same context is loopback. Both signals are required:
 * the `kind-` prefix alone does not prove the endpoint is actually
 * loopback (a proxied remote cluster could be given any local alias in a
 * kubeconfig file), and a loopback endpoint alone does not prove the
 * context is actually Kind-managed (a port-forward or `kubectl proxy`
 * against a real remote cluster also presents as loopback).
 */
export function assertLocalKindTarget(
  contextName: string,
  serverUrl: string,
): void {
  if (!contextName.startsWith(KIND_CONTEXT_PREFIX)) {
    throw new TargetGuardError(
      `Refusing to connect: kubeconfig context ${JSON.stringify(contextName)} does not carry Kind's conventional "${KIND_CONTEXT_PREFIX}" prefix — this connector may target only a disposable local Kind cluster.`,
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    throw new TargetGuardError(
      `Refusing to connect: the API server URL ${JSON.stringify(serverUrl)} for context ${JSON.stringify(contextName)} could not be parsed.`,
    );
  }

  if (!isLoopbackHost(parsedUrl.hostname)) {
    throw new TargetGuardError(
      `Refusing to connect: the API server for context ${JSON.stringify(contextName)} resolves to host ${JSON.stringify(parsedUrl.hostname)}, which is not loopback. A port-forwarded or proxied connection to a remote cluster can present a Kind-style context name without the server itself being local — both signals are required and this one failed.`,
    );
  }
}
