/**
 * A generic, abortable, cache-aware query hook shared by every M2-B topology
 * page (inventory, search, entity detail, identity resolution). It exists so
 * the honest canonical states (loading / loaded / expected API error /
 * redacted internal failure) and stale-response suppression are implemented
 * once, not once per page (docs/m2-plan.md Journey F).
 *
 * `queryKey` is the single source of truth for "does this need a new
 * request": whenever it changes, any still-in-flight prior request is
 * aborted and its eventual result is ignored — a superseded request must
 * never overwrite the current view, even if it resolves after a newer one.
 */
import { useEffect, useRef, useState } from "react";
import type { ErrorResponse } from "@atlast/shared";
import type { ClientQueryResult } from "../api/errors.ts";
import { topologyRequestCache } from "./session.ts";

export type QueryState<Data> =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly data: Data }
  | { readonly status: "api-error"; readonly error: ErrorResponse }
  | { readonly status: "internal-error" };

export interface UseAsyncQueryOptions<Data> {
  /** Changes whenever the logical query changes; also the effect trigger. */
  readonly queryKey: string;
  /** When true, a successful result is cached under `queryKey` and served
   * back without a new request on a later identical key (ADR-0026 § 7). */
  readonly cache: boolean;
  readonly run: (signal: AbortSignal) => Promise<ClientQueryResult<Data>>;
}

export interface UseAsyncQueryResult<Data> {
  readonly state: QueryState<Data>;
  /** Re-attempts the exact same request, bypassing any cached failure. */
  readonly retry: () => void;
}

export function useAsyncQuery<Data>(
  options: UseAsyncQueryOptions<Data>,
): UseAsyncQueryResult<Data> {
  const { queryKey, cache, run } = options;
  const [retryNonce, setRetryNonce] = useState(0);

  // Safe by construction: every write under `queryKey` in this module comes
  // from the successful branch of this same hook's own `run` invocation, so
  // a cache hit always holds a value shaped like `Data`.
  function readCache(): Data | undefined {
    return cache && topologyRequestCache.has(queryKey)
      ? (topologyRequestCache.get(queryKey) as Data)
      : undefined;
  }

  const [state, setState] = useState<QueryState<Data>>(() => {
    const cached = readCache();
    return cached !== undefined
      ? { status: "loaded", data: cached }
      : { status: "loading" };
  });
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const cached = readCache();
    if (cached !== undefined) {
      setState({ status: "loaded", data: cached });
      return;
    }

    const abortController = new AbortController();
    let isCurrent = true;
    setState({ status: "loading" });

    async function performQuery(): Promise<void> {
      let result: ClientQueryResult<Data>;
      try {
        result = await runRef.current(abortController.signal);
      } catch {
        if (isCurrent) {
          setState({ status: "internal-error" });
        }
        return;
      }
      if (!isCurrent) {
        return;
      }
      if (result.ok) {
        if (cache) {
          topologyRequestCache.set(queryKey, result.data);
        }
        setState({ status: "loaded", data: result.data });
        return;
      }
      if (result.error.kind === "aborted") {
        return;
      }
      if (result.error.kind === "api-error") {
        setState({ status: "api-error", error: result.error.error });
        return;
      }
      setState({ status: "internal-error" });
    }

    void performQuery();

    return (): void => {
      isCurrent = false;
      abortController.abort();
    };
  }, [queryKey, retryNonce, cache]);

  return {
    state,
    retry: (): void => {
      if (cache) {
        topologyRequestCache.delete(queryKey);
      }
      setRetryNonce((nonce) => nonce + 1);
    },
  };
}
