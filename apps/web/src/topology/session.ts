/**
 * The M2-B topology session (docs/m2-plan.md § 10 M2-B boundary; ADR-0026
 * §§ 4/7). One coordinator and one request cache are owned by the
 * application shell for the lifetime of the exploration session — module
 * singletons here, exactly what the session coordinator's own docstring
 * requires ("owned by the application shell for the lifetime of one
 * exploration session"). Every topology page imports these instead of
 * constructing its own, so an inventory read, a search read, and an
 * entity-detail read can never resolve two different "latest" identities
 * (requirement: "every visible result belongs to one complete resolved
 * snapshot identity for the current exploration generation").
 */
import type { SnapshotIdentity } from "@atlast/shared";
import { fetchEntityInventory } from "../api/client.ts";
import { createRequestCache, type RequestCache } from "../api/cache.ts";
import type { ClientQueryResult } from "../api/errors.ts";
import {
  createExplorationSessionCoordinator,
  type ExplorationSessionCoordinator,
} from "../api/session-coordinator.ts";

const explorationCoordinator =
  createExplorationSessionCoordinator<SnapshotIdentity>();
let latestProbeAbortController = new AbortController();

/**
 * The exploration session, rather than any one mounted consumer, owns the
 * shared latest probe. React Strict Mode may clean up and remount a consumer
 * while that single-flight request is in progress; aborting it from the first
 * mount would strand the remount on the same aborted promise. A new generation
 * is the operation that invalidates and aborts the shared probe.
 */
export const topologySessionCoordinator: ExplorationSessionCoordinator<SnapshotIdentity> =
  {
    currentGeneration: () => explorationCoordinator.currentGeneration(),
    isCurrentGeneration: (generation) =>
      explorationCoordinator.isCurrentGeneration(generation),
    beginNewGeneration: () => {
      latestProbeAbortController.abort();
      latestProbeAbortController = new AbortController();
      return explorationCoordinator.beginNewGeneration();
    },
    getEstablishedIdentity: () =>
      explorationCoordinator.getEstablishedIdentity(),
    resolveLatestIdentity: (fetchLatestIdentity) =>
      explorationCoordinator.resolveLatestIdentity(fetchLatestIdentity),
  };

const TOPOLOGY_REQUEST_CACHE_MAX_ENTRIES = 200;

/**
 * Cached values are read back only under the exact cache key that produced
 * them, so the `unknown` value type is safe in practice; callers cast to the
 * `Data` type their own `queryKey` encodes (see `use-async-query.ts`).
 */
export const topologyRequestCache: RequestCache<unknown> = createRequestCache(
  TOPOLOGY_REQUEST_CACHE_MAX_ENTRIES,
);

interface IdentityScopedResult {
  readonly meta: {
    readonly resolvedIdentity: SnapshotIdentity;
  };
}

function identitiesMatch(
  left: SnapshotIdentity,
  right: SnapshotIdentity,
): boolean {
  return (
    left.asOf === right.asOf &&
    left.horizon === right.horizon &&
    left.derivationVersion === right.derivationVersion
  );
}

/**
 * A schema-valid response can still be semantically unsafe if it reports a
 * different snapshot from the complete identity sent with the request. Fail
 * closed before the query hook can publish or cache that data.
 */
export function requireResolvedIdentity<Data extends IdentityScopedResult>(
  result: ClientQueryResult<Data>,
  expectedIdentity: SnapshotIdentity,
): ClientQueryResult<Data> {
  if (
    result.ok &&
    !identitiesMatch(result.data.meta.resolvedIdentity, expectedIdentity)
  ) {
    return { ok: false, error: { kind: "client-internal-failure" } };
  }
  return result;
}

/**
 * The cheapest real, cursorless graph read available (route 1 at `limit: 1`)
 * — used only to establish the session's latest `resolvedIdentity` when a
 * page needs one and no complete pin is present in the URL (ADR-0026 § 4).
 * Its own page data is discarded; the coordinator guarantees this is issued
 * at most once per exploration generation regardless of how many pages ask
 * for it concurrently.
 */
function fetchLatestIdentityProbe(
  signal: AbortSignal,
): Promise<ClientQueryResult<SnapshotIdentity>> {
  return fetchEntityInventory({ limit: 1 }, signal).then(
    (result): ClientQueryResult<SnapshotIdentity> =>
      result.ok
        ? { ok: true, data: result.data.meta.resolvedIdentity }
        : result,
  );
}

/**
 * Resolves the complete snapshot identity a page's dependent reads must pin
 * to: the URL's own pin when present (no request needed — an explicit pin is
 * already complete, docs/m2-plan.md § 6), or the session's shared latest
 * resolution otherwise ("The first cursorless latest response establishes a
 * session snapshot identity. All dependent reads are reissued as pinned
 * reads at that identity.").
 */
export function resolveSnapshotIdentity(
  urlPin: SnapshotIdentity | undefined,
  consumerSignal: AbortSignal,
): Promise<ClientQueryResult<SnapshotIdentity>> {
  // The signal still belongs to the consumer's dependent-query lifecycle; it
  // must not abort the session-owned single-flight probe (see above).
  void consumerSignal;
  if (urlPin !== undefined) {
    return Promise.resolve({ ok: true, data: urlPin });
  }
  return topologySessionCoordinator.resolveLatestIdentity(() =>
    fetchLatestIdentityProbe(latestProbeAbortController.signal),
  );
}
