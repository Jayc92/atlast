import { useState, type ReactElement } from "react";
import type { SnapshotAnchor, SnapshotIdentity } from "@atlast/shared";
import { fetchSnapshotAnchors } from "../api/client.ts";
import { serializeTopologyUrlState } from "../url/query-state.ts";
import {
  ApiErrorStatus,
  InternalErrorStatus,
  LoadingStatus,
} from "./QueryStatus.tsx";
import { topologySessionCoordinator } from "./session.ts";
import { useAsyncQuery } from "./use-async-query.ts";
import { useCanonicalTopologyUrlState } from "./use-topology-url-state.ts";

function identityToken(identity: SnapshotIdentity): string {
  return `${identity.asOf}|${String(identity.horizon)}|${identity.derivationVersion}`;
}

function IdentityCoordinate({
  identity,
}: {
  readonly identity: SnapshotIdentity;
}): ReactElement {
  return (
    <span className="snapshot-history-coordinate">
      asOf {identity.asOf} · horizon {identity.horizon} ·{" "}
      {identity.derivationVersion}
    </span>
  );
}

function LoadedSnapshotHistory(): ReactElement {
  const { state: urlState, setSearchParams } = useCanonicalTopologyUrlState();
  const query = useAsyncQuery({
    queryKey: "snapshot-anchors",
    cache: false,
    run: fetchSnapshotAnchors,
  });

  if (query.state.status === "loading") {
    return <LoadingStatus label="Loading retained snapshot anchors…" />;
  }
  if (query.state.status === "api-error") {
    return <ApiErrorStatus error={query.state.error} onRetry={query.retry} />;
  }
  if (query.state.status === "internal-error") {
    return <InternalErrorStatus onRetry={query.retry} />;
  }

  const anchors = query.state.data.items;
  const selected =
    urlState.pin === undefined
      ? undefined
      : anchors.find(
          (anchor) =>
            identityToken(anchor.identity) ===
            identityToken(urlState.pin as SnapshotIdentity),
        );

  const selectAnchor = (anchor: SnapshotAnchor): void => {
    setSearchParams(
      serializeTopologyUrlState({
        ...urlState,
        pin: anchor.identity,
      }),
    );
  };

  return (
    <div className="snapshot-history-loaded">
      <label htmlFor="snapshot-anchor-select">
        Retained observation anchor
      </label>
      <select
        id="snapshot-anchor-select"
        value={selected === undefined ? "" : identityToken(selected.identity)}
        onChange={(event): void => {
          const anchor = anchors.find(
            (candidate) =>
              identityToken(candidate.identity) === event.target.value,
          );
          if (anchor !== undefined) selectAnchor(anchor);
        }}
      >
        <option value="">Choose a historical snapshot</option>
        {anchors.map((anchor) => (
          <option
            key={identityToken(anchor.identity)}
            value={identityToken(anchor.identity)}
          >
            {anchor.identity.asOf} · {anchor.subjectCount} subjects
          </option>
        ))}
      </select>
      {selected !== undefined && (
        <dl className="snapshot-history-details">
          <dt>Checksum</dt>
          <dd>
            <code>{selected.checksum}</code>
          </dd>
          <dt>Subject count</dt>
          <dd>{selected.subjectCount}</dd>
        </dl>
      )}
      {urlState.pin !== undefined && selected === undefined && (
        <p role="status">
          The requested pin is outside the retained anchor window.
        </p>
      )}
      {query.state.data.truncated && (
        <p className="snapshot-history-truncated" role="status">
          Showing the 100 newest retained anchors; older anchors are not listed.
        </p>
      )}
    </div>
  );
}

export function SnapshotHistory({
  resolvedIdentity,
}: {
  readonly resolvedIdentity?: SnapshotIdentity;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const { state: urlState, setSearchParams } = useCanonicalTopologyUrlState();

  const returnToLatest = (): void => {
    const latestState = { ...urlState };
    delete latestState.pin;
    topologySessionCoordinator.beginNewGeneration();
    setSearchParams(serializeTopologyUrlState(latestState));
  };

  return (
    <section
      className="snapshot-history"
      aria-labelledby="snapshot-history-heading"
    >
      <div className="snapshot-history-header">
        <div>
          <p className="topology-kicker">Snapshot navigation</p>
          <h2 id="snapshot-history-heading">History playback</h2>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? "Hide history" : "Browse history"}
        </button>
      </div>
      {urlState.pin !== undefined ? (
        <div className="snapshot-history-requested">
          <p>
            <strong>Requested historical snapshot</strong>
          </p>
          <p>
            <IdentityCoordinate identity={urlState.pin} />
          </p>
          <button type="button" onClick={returnToLatest}>
            Return to latest
          </button>
        </div>
      ) : resolvedIdentity !== undefined ? (
        <p>
          Latest resolved to <IdentityCoordinate identity={resolvedIdentity} />
        </p>
      ) : (
        <p>Resolving the latest snapshot coordinate.</p>
      )}
      {expanded && <LoadedSnapshotHistory />}
    </section>
  );
}
