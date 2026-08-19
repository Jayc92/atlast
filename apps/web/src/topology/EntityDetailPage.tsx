/**
 * The `/entities/:entityId` route (docs/m2-plan.md § 10 M2-B): entity-focused
 * routing and structured detail presentation, pinned to the same resolved
 * snapshot identity the inventory/search pages use. Deliberately not the
 * entity-type claim (never collapsed to one "winner" — GUARDRAILS.md § 1.2),
 * and M2-D adds the query-API-only trust inspector for selected subjects.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Link, Navigate, useParams } from "react-router";
import type {
  EffectiveHealthState,
  ImpactChangeType,
  SnapshotIdentity,
  SubjectDetailResult,
  TraversalDirection,
  TraversalResult,
} from "@atlast/shared";
import { fetchEntityDetail, fetchTraversal } from "../api/client.ts";
import { buildRequestCacheKey } from "../api/cache.ts";
import type { ClientQueryResult } from "../api/errors.ts";
import { serializeTopologyUrlState } from "../url/query-state.ts";
import { projectEntityDetail } from "./entity-projection.ts";
import { buildHealthOverlayView } from "./health-overlay-projection.ts";
import { HealthOverlayControls } from "./HealthOverlayControls.tsx";
import { HealthOverlayGaps } from "./HealthOverlayGaps.tsx";
import {
  HealthOverlayApiErrorStatus,
  HealthOverlayInternalErrorStatus,
  HealthOverlayLoadingStatus,
  HealthOverlayMismatchStatus,
} from "./HealthOverlayStatus.tsx";
import { ImpactPanel } from "./ImpactPanel.tsx";
import {
  ApiErrorStatus,
  InternalErrorStatus,
  LoadingStatus,
  UrlCorrectedNotice,
} from "./QueryStatus.tsx";
import {
  requireResolvedIdentity,
  resolveSnapshotIdentity,
  topologySessionCoordinator,
} from "./session.ts";
import { TopologyShell } from "./TopologyShell.tsx";
import { SnapshotHistory } from "./SnapshotHistory.tsx";
import { TraversalWorkspace } from "./TraversalWorkspace.tsx";
import { TrustInspector } from "./TrustInspector.tsx";
import { resolveTrustSelection } from "./trust-selection.ts";
import { useAsyncQuery } from "./use-async-query.ts";
import { useCanonicalTopologyUrlState } from "./use-topology-url-state.ts";
import { useHealthContext } from "./use-health-context.ts";

function pinFields(
  identity: SnapshotIdentity,
): Record<string, string | number> {
  return {
    asOf: identity.asOf,
    horizon: identity.horizon,
    derivationVersion: identity.derivationVersion,
  };
}

function pinToken(identity: SnapshotIdentity): string {
  return `${identity.asOf}|${String(identity.horizon)}|${identity.derivationVersion}`;
}

interface KeyedTraversalResult {
  readonly queryKey: string;
  readonly contextKey: string;
  readonly data: TraversalResult;
}

function useNarrowTopologyViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 45rem)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia("(max-width: 45rem)");
    const handleChange = (event: MediaQueryListEvent): void => {
      setIsNarrow(event.matches);
    };
    setIsNarrow(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return (): void => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return isNarrow;
}

export function EntityDetailPage(): ReactElement {
  const inspectorReturnFocusRef = useRef<HTMLElement | null>(null);
  const impactReturnFocusRef = useRef<HTMLElement | null>(null);
  const routeParams = useParams<{ entityId: string }>();
  const trimmedEntityId = routeParams.entityId?.trim();
  const isValidEntityId =
    trimmedEntityId !== undefined && trimmedEntityId.length > 0;

  const {
    state: urlState,
    wasCorrected,
    setSearchParams,
  } = useCanonicalTopologyUrlState();

  const identityQueryKey =
    urlState.pin !== undefined
      ? `pin:${pinToken(urlState.pin)}`
      : `latest:${String(topologySessionCoordinator.currentGeneration())}`;
  const identityQuery = useAsyncQuery<SnapshotIdentity>({
    queryKey: identityQueryKey,
    cache: false,
    run: (signal) => resolveSnapshotIdentity(urlState.pin, signal),
  });
  const identity =
    identityQuery.state.status === "loaded"
      ? identityQuery.state.data
      : undefined;

  const detailQueryKey =
    identity !== undefined && isValidEntityId
      ? buildRequestCacheKey({
          operation: "entityDetail",
          identity: pinFields(identity),
          params: { entityId: trimmedEntityId },
        })
      : "inactive:entityDetail";
  const detailQuery = useAsyncQuery<SubjectDetailResult>({
    queryKey: detailQueryKey,
    cache: true,
    run: (signal): Promise<ClientQueryResult<SubjectDetailResult>> => {
      if (identity === undefined || !isValidEntityId) {
        return Promise.resolve({ ok: false, error: { kind: "aborted" } });
      }
      return fetchEntityDetail(trimmedEntityId, identity, signal).then(
        (result) => requireResolvedIdentity(result, identity),
      );
    },
  });

  const direction: TraversalDirection = urlState.direction ?? "downstream";
  const depth = urlState.depth ?? 1;
  const minConfidence = urlState.minConfidence ?? 0;
  const isNarrowViewport = useNarrowTopologyViewport();
  const canTraverse = detailQuery.state.status === "loaded";
  const traversalContextKey =
    identity !== undefined && isValidEntityId
      ? `${trimmedEntityId}|${pinToken(identity)}`
      : "inactive:traversal-context";
  const traversalQueryKey =
    identity !== undefined && isValidEntityId && canTraverse
      ? buildRequestCacheKey({
          operation: "traversal",
          identity: pinFields(identity),
          params: {
            entityId: trimmedEntityId,
            direction,
            depth,
            minConfidence,
          },
        })
      : "inactive:traversal";
  const traversalQuery = useAsyncQuery<KeyedTraversalResult>({
    queryKey: traversalQueryKey,
    cache: true,
    run: async (signal): Promise<ClientQueryResult<KeyedTraversalResult>> => {
      if (identity === undefined || !isValidEntityId || !canTraverse) {
        return Promise.resolve({ ok: false, error: { kind: "aborted" } });
      }
      const result = await fetchTraversal(
        trimmedEntityId,
        { direction, depth, minConfidence, identity },
        signal,
      ).then((response) => requireResolvedIdentity(response, identity));
      return result.ok
        ? {
            ok: true,
            data: {
              queryKey: traversalQueryKey,
              contextKey: traversalContextKey,
              data: result.data,
            },
          }
        : result;
    },
  });
  const [retainedTraversal, setRetainedTraversal] = useState<{
    readonly contextKey: string;
    readonly data: TraversalResult;
  }>();

  useEffect(() => {
    if (
      traversalQuery.state.status === "loaded" &&
      traversalQuery.state.data.queryKey === traversalQueryKey
    ) {
      setRetainedTraversal({
        contextKey: traversalQuery.state.data.contextKey,
        data: traversalQuery.state.data.data,
      });
    }
  }, [traversalQuery.state, traversalQueryKey]);

  const retainedTraversalForContext =
    retainedTraversal?.contextKey === traversalContextKey
      ? retainedTraversal.data
      : undefined;
  const currentTraversal =
    traversalQuery.state.status === "loaded" &&
    traversalQuery.state.data.queryKey === traversalQueryKey
      ? traversalQuery.state.data.data
      : undefined;
  const visibleTraversal = currentTraversal ?? retainedTraversalForContext;
  const loadedDetail =
    detailQuery.state.status === "loaded"
      ? detailQuery.state.data.data
      : undefined;

  const healthOn = urlState.health === true;
  const healthContext = useHealthContext({
    enabled: healthOn,
    entityId: trimmedEntityId ?? "",
    direction,
    depth,
    minConfidence,
    identity,
    overlayFrame: urlState.overlayFrame,
    // Health may publish only once it matches the traversal for these exact
    // bounds — never a differently-bounded retained traversal kept visible
    // only to avoid flicker (ADR-0031 § 1).
    baseTraversal: currentTraversal,
  });
  const healthOverlayView = useMemo(
    () =>
      healthContext.state.status === "ready"
        ? buildHealthOverlayView(
            healthContext.state.result,
            urlState.healthStates,
          )
        : undefined,
    [healthContext.state, urlState.healthStates],
  );

  const setHealthOn = (on: boolean): void => {
    if (on) {
      setSearchParams(serializeTopologyUrlState({ ...urlState, health: true }));
      return;
    }
    const next = { ...urlState };
    delete next.health;
    delete next.healthStates;
    delete next.overlayFrame;
    setSearchParams(serializeTopologyUrlState(next));
  };
  const setEmphasizedHealthStates = (
    states: readonly EffectiveHealthState[] | undefined,
  ): void => {
    if (states === undefined) {
      const next = { ...urlState };
      delete next.healthStates;
      setSearchParams(serializeTopologyUrlState(next));
      return;
    }
    setSearchParams(
      serializeTopologyUrlState({ ...urlState, healthStates: states }),
    );
  };
  const recoverOverlayFrame = (): void => {
    const next = { ...urlState };
    delete next.overlayFrame;
    setSearchParams(serializeTopologyUrlState(next));
  };

  // Changing a pinned historical URL auto-selects the greatest eligible
  // frame server-side when no exact overlayFrame is present. Once resolved,
  // pin that exact frame into the URL so a copied historical link stays
  // reproducible (ADR-0031 § 2: "finally writes the exact returned frame
  // identifier into the URL"). Latest mode intentionally stays unpinned.
  useEffect(() => {
    if (
      urlState.health === true &&
      urlState.pin !== undefined &&
      urlState.overlayFrame === undefined &&
      healthContext.state.status === "ready"
    ) {
      setSearchParams(
        serializeTopologyUrlState({
          ...urlState,
          overlayFrame: healthContext.state.result.meta.overlay.frameIdentifier,
        }),
        { replace: true },
      );
    }
  }, [
    urlState.health,
    urlState.pin,
    urlState.overlayFrame,
    healthContext.state,
  ]);
  const trustSelection =
    loadedDetail === undefined || urlState.selected === undefined
      ? undefined
      : visibleTraversal === undefined
        ? urlState.selected === loadedDetail.subject.identifier
          ? { subject: loadedDetail }
          : undefined
        : resolveTrustSelection(
            urlState.selected,
            loadedDetail,
            visibleTraversal,
          );

  const rememberInspectorInvoker = (): void => {
    inspectorReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  };

  const updateSelected = (selected: string): void => {
    rememberInspectorInvoker();
    setSearchParams(
      serializeTopologyUrlState({
        ...urlState,
        selected,
      }),
    );
  };

  const clearSelected = (): void => {
    const withoutSelected = { ...urlState };
    delete withoutSelected.selected;
    setSearchParams(serializeTopologyUrlState(withoutSelected));
  };

  /**
   * `changeType` is valid only when `selected` names an Entity (ADR-0034
   * § 1), so opening the impact panel from either entity detail or the
   * trust inspector always (re-)selects the target Entity alongside a
   * default `changeType`, defaulting to `removal`.
   */
  const openImpactPanel = (entityIdentifier: string): void => {
    impactReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSearchParams(
      serializeTopologyUrlState({
        ...urlState,
        selected: entityIdentifier,
        changeType: "removal",
      }),
    );
  };

  const closeImpactPanel = (): void => {
    const withoutChangeType = { ...urlState };
    delete withoutChangeType.changeType;
    setSearchParams(serializeTopologyUrlState(withoutChangeType));
  };

  const changeImpactChangeType = (nextChangeType: ImpactChangeType): void => {
    setSearchParams(
      serializeTopologyUrlState({ ...urlState, changeType: nextChangeType }),
    );
  };

  if (!isValidEntityId) {
    return <Navigate to="/topology" replace />;
  }

  const preservedParams = serializeTopologyUrlState({
    ...(urlState.q !== undefined ? { q: urlState.q } : {}),
    ...(urlState.pin !== undefined ? { pin: urlState.pin } : {}),
  }).toString();
  const backToTopologyHref = `/topology${
    preservedParams.length > 0 ? `?${preservedParams}` : ""
  }`;

  return (
    <TopologyShell title="Entity detail">
      {wasCorrected && <UrlCorrectedNotice />}
      <p>
        <Link to={backToTopologyHref}>Back to topology</Link>
      </p>
      <SnapshotHistory
        {...(identity !== undefined ? { resolvedIdentity: identity } : {})}
      />
      {identity !== undefined && (
        <HealthOverlayControls
          healthOn={healthOn}
          emphasizedStates={urlState.healthStates}
          onToggleHealth={setHealthOn}
          onEmphasisChange={setEmphasizedHealthStates}
        />
      )}
      {healthOn && healthContext.state.status === "loading" && (
        <HealthOverlayLoadingStatus />
      )}
      {healthOn && healthContext.state.status === "api-error" && (
        <HealthOverlayApiErrorStatus
          error={healthContext.state.error}
          onRetry={healthContext.retry}
          {...(urlState.overlayFrame !== undefined
            ? { onRecoverCoordinate: recoverOverlayFrame }
            : {})}
        />
      )}
      {healthOn && healthContext.state.status === "internal-error" && (
        <HealthOverlayInternalErrorStatus onRetry={healthContext.retry} />
      )}
      {healthOn && healthContext.state.status === "identity-mismatch" && (
        <HealthOverlayMismatchStatus onRetry={healthContext.retry} />
      )}
      {healthOn &&
        healthContext.state.status === "ready" &&
        healthOverlayView !== undefined && (
          <>
            <p className="health-overlay-coordinate">
              Overlay frame{" "}
              {healthContext.state.result.meta.overlay.frameIdentifier} ·
              effective at {healthContext.state.result.meta.overlay.effectiveAt}
            </p>
            <HealthOverlayGaps
              gaps={healthOverlayView.gaps}
              frameIdentifier={healthOverlayView.overlay.frameIdentifier}
            />
          </>
        )}
      {identityQuery.state.status === "loading" && (
        <LoadingStatus label="Resolving the current topology snapshot…" />
      )}
      {identityQuery.state.status === "api-error" && (
        <ApiErrorStatus
          error={identityQuery.state.error}
          onRetry={identityQuery.retry}
        />
      )}
      {identityQuery.state.status === "internal-error" && (
        <InternalErrorStatus onRetry={identityQuery.retry} />
      )}
      {identityQuery.state.status === "loaded" &&
        detailQuery.state.status === "loading" && (
          <LoadingStatus label="Loading entity detail…" />
        )}
      {identityQuery.state.status === "loaded" &&
        detailQuery.state.status === "api-error" && (
          <ApiErrorStatus
            error={detailQuery.state.error}
            onRetry={detailQuery.retry}
          />
        )}
      {identityQuery.state.status === "loaded" &&
        detailQuery.state.status === "internal-error" && (
          <InternalErrorStatus onRetry={detailQuery.retry} />
        )}
      {identityQuery.state.status === "loaded" &&
        detailQuery.state.status === "loaded" &&
        (() => {
          const view = projectEntityDetail(detailQuery.state.data.data);
          return (
            <article
              className="topology-entity-summary"
              aria-labelledby="entity-detail-heading"
            >
              <h2 id="entity-detail-heading">{view.identifier}</h2>
              {view.entityTypes.length > 0 ? (
                <>
                  <h3>Visible entity-type claims</h3>
                  <ul>
                    {view.entityTypes.map((entityType) => (
                      <li key={entityType}>{entityType}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  No entity-type claim is visible for this entity in this
                  snapshot.
                </p>
              )}
              <p>
                {view.assertionCount} visible assertion revision
                {view.assertionCount === 1 ? "" : "s"}.
              </p>
              <button
                type="button"
                onClick={() => {
                  updateSelected(view.identifier);
                }}
              >
                Inspect entity trust
              </button>
              <button
                type="button"
                onClick={() => {
                  openImpactPanel(view.identifier);
                }}
              >
                Analyze impact on {view.identifier}
              </button>
            </article>
          );
        })()}
      {identityQuery.state.status === "loaded" &&
        traversalQuery.state.status === "api-error" &&
        retainedTraversalForContext === undefined && (
          <ApiErrorStatus
            error={traversalQuery.state.error}
            onRetry={traversalQuery.retry}
          />
        )}
      {identityQuery.state.status === "loaded" &&
        traversalQuery.state.status === "internal-error" &&
        retainedTraversalForContext === undefined && (
          <InternalErrorStatus onRetry={traversalQuery.retry} />
        )}
      {detailQuery.state.status === "loaded" &&
        (currentTraversal !== undefined ||
          retainedTraversalForContext !== undefined) &&
        (() => {
          const traversal = currentTraversal ?? retainedTraversalForContext;
          if (traversal === undefined || identity === undefined) {
            return null;
          }
          const updateUrl = (
            updates: Partial<{
              direction: TraversalDirection;
              depth: number;
              minConfidence: number;
              view: "graph" | "list";
              selected: string;
            }>,
          ): void => {
            setSearchParams(
              serializeTopologyUrlState({
                ...urlState,
                ...updates,
                // UI-only exploration changes preserve the caller's mode. The
                // resolved identity still binds reads within this render, but
                // it must not silently turn an unpinned latest URL into a pin.
                ...(urlState.pin !== undefined ? { pin: identity } : {}),
              }),
            );
          };
          return (
            <TraversalWorkspace
              origin={detailQuery.state.data.data}
              traversal={traversal}
              direction={direction}
              depth={depth}
              minConfidence={minConfidence}
              viewMode={urlState.view ?? (isNarrowViewport ? "list" : "graph")}
              selected={urlState.selected}
              updating={currentTraversal === undefined}
              {...(healthOverlayView !== undefined
                ? { healthOverlay: healthOverlayView }
                : {})}
              onBoundsChange={(bounds) => {
                updateUrl(bounds);
              }}
              onViewModeChange={(view) => {
                updateUrl({ view });
              }}
              onSelect={(selected) => {
                rememberInspectorInvoker();
                updateUrl({ selected });
              }}
            />
          );
        })()}
      {identityQuery.state.status === "loaded" &&
        (traversalQuery.state.status === "loading" ||
          traversalQuery.state.status === "loaded") &&
        currentTraversal === undefined &&
        retainedTraversalForContext === undefined && (
          <LoadingStatus label="Loading bounded relationships…" />
        )}
      {trustSelection !== undefined && identity !== undefined && (
        <TrustInspector
          selection={trustSelection}
          snapshotIdentity={identity}
          {...(visibleTraversal !== undefined
            ? { traversalTruncated: visibleTraversal.traversal.truncated }
            : {})}
          returnFocus={inspectorReturnFocusRef.current}
          onClose={clearSelected}
          onAnalyzeImpact={openImpactPanel}
        />
      )}
      {urlState.changeType !== undefined &&
        urlState.selected !== undefined &&
        identity !== undefined && (
          <ImpactPanel
            originEntityIdentifier={urlState.selected}
            changeType={urlState.changeType}
            direction={direction}
            depth={depth}
            minConfidence={minConfidence}
            identity={identity}
            returnFocus={impactReturnFocusRef.current}
            onChangeTypeChange={changeImpactChangeType}
            onClose={closeImpactPanel}
          />
        )}
      {identity !== undefined && (
        <p className="topology-snapshot-indicator">
          Snapshot: {urlState.pin !== undefined ? "pinned" : "latest"} · asOf{" "}
          {identity.asOf} · horizon {identity.horizon} ·{" "}
          {identity.derivationVersion}
        </p>
      )}
    </TopologyShell>
  );
}
