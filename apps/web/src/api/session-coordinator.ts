/**
 * The exploration session coordinator (ADR-0026 § 4): "One exploration
 * coordinator owns latest resolution. Panels and route children cannot
 * initiate cursorless latest graph reads independently: concurrent
 * consumers await the same in-flight resolution promise, and only after it
 * validates may they issue pinned dependent reads. A navigation or explicit
 * refresh starts a new generation; obsolete generations cannot publish
 * identity or data." and "Every request belongs to a monotonically
 * increasing client generation. Aborted or late responses from an obsolete
 * generation are ignored."
 *
 * One coordinator instance is owned by the application shell for the
 * lifetime of one exploration session; it is generic over the identity type
 * a "latest" resolution establishes (the resolved `SnapshotIdentity`, once a
 * consumer exists to supply one) so this module has no dependency on any
 * specific graph-read shape.
 */
import type { ClientQueryResult } from "./errors.ts";

export interface ExplorationSessionCoordinator<Identity> {
  /** The generation every request issued right now belongs to. */
  currentGeneration(): number;
  /** True exactly when `generation` is still the current one. */
  isCurrentGeneration(generation: number): boolean;
  /**
   * Starts a new generation — called on an explicit "refresh latest" action
   * or an exploration-resetting navigation. Invalidates the established
   * identity and any in-flight resolution: their eventual result can never
   * again be reported as current once this returns.
   */
  beginNewGeneration(): number;
  /** The identity the current generation has already established, if any. */
  getEstablishedIdentity(): Identity | undefined;
  /**
   * Resolve the session's "latest" identity. If one is already established
   * for the current generation, it is returned immediately without a new
   * request. If a resolution is already in flight for the current
   * generation, every concurrent caller is handed that same promise — a
   * cursorless latest graph request is issued at most once per generation,
   * regardless of how many consumers ask concurrently. A failed resolution
   * does not become established, so a later call may retry.
   */
  resolveLatestIdentity(
    fetchLatestIdentity: () => Promise<ClientQueryResult<Identity>>,
  ): Promise<ClientQueryResult<Identity>>;
}

export function createExplorationSessionCoordinator<
  Identity,
>(): ExplorationSessionCoordinator<Identity> {
  let generation = 0;
  let established:
    { readonly value: Identity; readonly generation: number } | undefined;
  let inFlight:
    | {
        readonly generation: number;
        readonly promise: Promise<ClientQueryResult<Identity>>;
      }
    | undefined;

  return {
    currentGeneration(): number {
      return generation;
    },
    isCurrentGeneration(candidateGeneration: number): boolean {
      return candidateGeneration === generation;
    },
    beginNewGeneration(): number {
      generation += 1;
      established = undefined;
      inFlight = undefined;
      return generation;
    },
    getEstablishedIdentity(): Identity | undefined {
      return established?.generation === generation
        ? established.value
        : undefined;
    },
    resolveLatestIdentity(
      fetchLatestIdentity: () => Promise<ClientQueryResult<Identity>>,
    ): Promise<ClientQueryResult<Identity>> {
      if (established !== undefined && established.generation === generation) {
        return Promise.resolve({ ok: true, data: established.value });
      }
      if (inFlight !== undefined && inFlight.generation === generation) {
        return inFlight.promise;
      }

      const requestGeneration = generation;
      const settle = (
        result: ClientQueryResult<Identity>,
      ): ClientQueryResult<Identity> => {
        if (inFlight?.generation === requestGeneration) {
          inFlight = undefined;
        }
        if (requestGeneration !== generation) {
          // A new generation began while this resolution was in flight —
          // obsolete generations cannot publish identity or data.
          return { ok: false, error: { kind: "aborted" } };
        }
        if (result.ok) {
          established = {
            value: result.data,
            generation: requestGeneration,
          };
        }
        return result;
      };
      let fetched: Promise<ClientQueryResult<Identity>>;
      try {
        fetched = fetchLatestIdentity();
      } catch {
        fetched = Promise.resolve({
          ok: false,
          error: { kind: "client-internal-failure" },
        });
      }
      const resolution: Promise<ClientQueryResult<Identity>> = fetched.then(
        settle,
        () => settle({ ok: false, error: { kind: "client-internal-failure" } }),
      );

      inFlight = { generation: requestGeneration, promise: resolution };
      return resolution;
    },
  };
}
