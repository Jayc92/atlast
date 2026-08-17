/**
 * M3-D health-context data fetching (ADR-0030/0031). Issues the dependent
 * `GET .../health-context` read pinned to the same resolved topology
 * identity the caller's base traversal already used, and enforces the
 * client-side publish gate before any result reaches the UI: "Overlay data
 * may publish only when complete topology identity and ordered traversal
 * subjects match the base traversal" (ADR-0031 § 1). A mismatch — like any
 * other overlay failure — never hides or alters the topology view; it is
 * reported as its own separately labeled state so a caller can show a
 * distinct, retryable overlay error without touching base topology
 * rendering.
 */
import type {
  ErrorResponse,
  HealthContextResult,
  OverlayFrameIdentifier,
  SnapshotIdentity,
  TraversalDirection,
  TraversalResult,
} from "@atlast/shared";
import { fetchHealthContext } from "../api/client.ts";
import { buildRequestCacheKey } from "../api/cache.ts";
import type { ClientQueryResult } from "../api/errors.ts";
import { healthContextMatchesBaseTraversal } from "./health-overlay-projection.ts";
import { requireResolvedIdentity } from "./session.ts";
import { useAsyncQuery } from "./use-async-query.ts";

export type HealthContextQueryState =
  | { readonly status: "off" }
  | { readonly status: "loading" }
  | { readonly status: "api-error"; readonly error: ErrorResponse }
  | { readonly status: "internal-error" }
  | { readonly status: "identity-mismatch" }
  | { readonly status: "ready"; readonly result: HealthContextResult };

export interface UseHealthContextParams {
  readonly enabled: boolean;
  readonly entityId: string;
  readonly direction: TraversalDirection;
  readonly depth: number;
  readonly minConfidence: number;
  readonly identity: SnapshotIdentity | undefined;
  readonly overlayFrame: OverlayFrameIdentifier | undefined;
  /**
   * The traversal result for these exact bounds and identity — health may
   * publish only once it matches this (never a differently-bounded retained
   * traversal shown only to avoid flicker).
   */
  readonly baseTraversal: TraversalResult | undefined;
}

export interface UseHealthContextResult {
  readonly state: HealthContextQueryState;
  readonly retry: () => void;
}

function pinFields(
  identity: SnapshotIdentity,
): Record<string, string | number> {
  return {
    asOf: identity.asOf,
    horizon: identity.horizon,
    derivationVersion: identity.derivationVersion,
  };
}

type HealthOutcome =
  | { readonly kind: "matched"; readonly result: HealthContextResult }
  | { readonly kind: "mismatch" };

export function useHealthContext(
  params: UseHealthContextParams,
): UseHealthContextResult {
  const queryKey =
    params.enabled &&
    params.identity !== undefined &&
    params.baseTraversal !== undefined
      ? buildRequestCacheKey({
          operation: "healthContext",
          identity: pinFields(params.identity),
          params: {
            entityId: params.entityId,
            direction: params.direction,
            depth: params.depth,
            minConfidence: params.minConfidence,
            overlayFrame: params.overlayFrame,
          },
        })
      : "inactive:healthContext";

  const query = useAsyncQuery<HealthOutcome>({
    queryKey,
    cache: true,
    run: async (signal): Promise<ClientQueryResult<HealthOutcome>> => {
      if (
        !params.enabled ||
        params.identity === undefined ||
        params.baseTraversal === undefined
      ) {
        return { ok: false, error: { kind: "aborted" } };
      }
      const identity = params.identity;
      const baseTraversal = params.baseTraversal;
      const response = await fetchHealthContext(
        params.entityId,
        {
          direction: params.direction,
          depth: params.depth,
          minConfidence: params.minConfidence,
          identity,
          ...(params.overlayFrame !== undefined
            ? { overlayFrame: params.overlayFrame }
            : {}),
        },
        signal,
      ).then((result) => requireResolvedIdentity(result, identity));
      if (!response.ok) {
        return response;
      }
      if (
        !healthContextMatchesBaseTraversal(
          response.data,
          params.entityId,
          baseTraversal,
        )
      ) {
        return { ok: true, data: { kind: "mismatch" } };
      }
      return { ok: true, data: { kind: "matched", result: response.data } };
    },
  });

  if (!params.enabled) {
    return { state: { status: "off" }, retry: query.retry };
  }

  switch (query.state.status) {
    case "loading":
      return { state: { status: "loading" }, retry: query.retry };
    case "api-error":
      return {
        state: { status: "api-error", error: query.state.error },
        retry: query.retry,
      };
    case "internal-error":
      return { state: { status: "internal-error" }, retry: query.retry };
    case "loaded":
      return query.state.data.kind === "mismatch"
        ? { state: { status: "identity-mismatch" }, retry: query.retry }
        : {
            state: { status: "ready", result: query.state.data.result },
            retry: query.retry,
          };
  }
}
