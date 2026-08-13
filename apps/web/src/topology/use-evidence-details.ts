import { useEffect, useMemo, useState } from "react";
import type { ErrorResponse, EvidenceDetailResult } from "@atlast/shared";
import { buildRequestCacheKey } from "../api/cache.ts";
import { fetchEvidence } from "../api/client.ts";
import { topologyRequestCache } from "./session.ts";

export type EvidenceLoadState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly data: EvidenceDetailResult }
  | { readonly status: "api-error"; readonly error: ErrorResponse }
  | { readonly status: "internal-error" };

export interface EvidenceDetailsResult {
  readonly states: Readonly<Record<string, EvidenceLoadState>>;
  readonly retry: () => void;
}

function cacheKey(identifier: string): string {
  return buildRequestCacheKey({
    operation: "evidenceDetail",
    params: { evidenceId: identifier },
  });
}

export function useEvidenceDetails(
  identifiers: readonly string[],
): EvidenceDetailsResult {
  const stableIdentifiers = useMemo(
    () => [...new Set(identifiers)].sort(),
    [identifiers],
  );
  const identifierToken = stableIdentifiers.join("\u0000");
  const [retryNonce, setRetryNonce] = useState(0);
  const [states, setStates] = useState<
    Readonly<Record<string, EvidenceLoadState>>
  >({});

  useEffect(() => {
    const abortController = new AbortController();
    let current = true;
    const initial: Record<string, EvidenceLoadState> = {};

    for (const identifier of stableIdentifiers) {
      const key = cacheKey(identifier);
      const cached = topologyRequestCache.get(key) as
        EvidenceDetailResult | undefined;
      initial[identifier] =
        cached === undefined
          ? { status: "loading" }
          : { status: "loaded", data: cached };
    }
    setStates(initial);

    for (const identifier of stableIdentifiers) {
      if (initial[identifier]?.status === "loaded") {
        continue;
      }
      void fetchEvidence(identifier, abortController.signal)
        .then((result) => {
          if (!current) {
            return;
          }
          let next: EvidenceLoadState;
          if (result.ok) {
            topologyRequestCache.set(cacheKey(identifier), result.data);
            next = { status: "loaded", data: result.data };
          } else if (result.error.kind === "api-error") {
            next = { status: "api-error", error: result.error.error };
          } else if (result.error.kind === "client-internal-failure") {
            next = { status: "internal-error" };
          } else {
            return;
          }
          setStates((previous) => ({ ...previous, [identifier]: next }));
        })
        .catch(() => {
          if (current) {
            setStates((previous) => ({
              ...previous,
              [identifier]: { status: "internal-error" },
            }));
          }
        });
    }

    return (): void => {
      current = false;
      abortController.abort();
    };
  }, [identifierToken, retryNonce]);

  return {
    states,
    retry: (): void => {
      for (const identifier of stableIdentifiers) {
        topologyRequestCache.delete(cacheKey(identifier));
      }
      setRetryNonce((nonce) => nonce + 1);
    },
  };
}
