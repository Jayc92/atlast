/**
 * The `/entities/:entityId` route (docs/m2-plan.md § 10 M2-B): entity-focused
 * routing and structured detail presentation, pinned to the same resolved
 * snapshot identity the inventory/search pages use. Deliberately not the
 * M2-D trust inspector: it shows the entity's identifier and every visible
 * entity-type claim (never collapsed to one "winner" — GUARDRAILS.md § 1.2),
 * but not confidence, freshness, conflict/ambiguity state, rule traces, or
 * Evidence dereferencing.
 */
import type { ReactElement } from "react";
import { Link, Navigate, useParams } from "react-router";
import type { SnapshotIdentity, SubjectDetailResult } from "@atlast/shared";
import { fetchEntityDetail } from "../api/client.ts";
import { buildRequestCacheKey } from "../api/cache.ts";
import type { ClientQueryResult } from "../api/errors.ts";
import { serializeTopologyUrlState } from "../url/query-state.ts";
import { projectEntityDetail } from "./entity-projection.ts";
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
import { useAsyncQuery } from "./use-async-query.ts";
import { useCanonicalTopologyUrlState } from "./use-topology-url-state.ts";

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

export function EntityDetailPage(): ReactElement {
  const routeParams = useParams<{ entityId: string }>();
  const trimmedEntityId = routeParams.entityId?.trim();
  const isValidEntityId =
    trimmedEntityId !== undefined && trimmedEntityId.length > 0;

  const { state: urlState, wasCorrected } = useCanonicalTopologyUrlState();

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
            <article aria-labelledby="entity-detail-heading">
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
            </article>
          );
        })()}
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
