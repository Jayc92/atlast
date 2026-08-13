/**
 * The `/topology` route (docs/m2-plan.md § 10 M2-B): Entity inventory and
 * canonical-identifier search, using only the M2-A validated query client and
 * accepted query API, with bounded pagination and completely opaque cursor
 * handling. M2-D adds exact-Relationship trust inspection without widening
 * the API; history controls remain M2-E scope.
 *
 * Pagination cursors are ephemeral component state, never written to the
 * URL (docs/m2-plan.md § 5: "A copied URL represents the exploration
 * coordinate, not an in-progress page walk"); a "page" here is therefore a
 * client-side history of the opaque cursors used to reach each position,
 * never parsed or constructed, only stored and replayed verbatim.
 */
import { useRef, useState, type ReactElement } from "react";
import { Link } from "react-router";
import {
  MINIMUM_SEARCH_QUERY_LENGTH,
  type EntityPage,
  type SnapshotIdentity,
  type SubjectPage,
  type SubjectReadResult,
} from "@atlast/shared";
import { fetchEntityInventory, fetchSearch } from "../api/client.ts";
import { buildRequestCacheKey } from "../api/cache.ts";
import type { ClientQueryResult } from "../api/errors.ts";
import {
  serializeTopologyUrlState,
  type TopologyUrlState,
} from "../url/query-state.ts";
import {
  projectEntityInventoryItem,
  projectSubjectSearchItem,
} from "./entity-projection.ts";
import {
  ApiErrorStatus,
  EmptyStatus,
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
import { TrustInspector } from "./TrustInspector.tsx";
import { useAsyncQuery, type UseAsyncQueryResult } from "./use-async-query.ts";
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

/**
 * `exactOptionalPropertyTypes` (tsconfig) treats an explicit `cursor:
 * undefined` differently from an omitted `cursor` key, and every optional
 * `cursor` field downstream (`EntityInventoryParams`, `SearchParams`,
 * `buildRequestCacheKey`'s `cursor`) is typed as "present and a string, or
 * absent" — never "present and undefined". This spreads the key in only
 * when there is a real opaque cursor to pass, matching that contract exactly.
 */
function cursorField(
  cursor: string | undefined,
): { readonly cursor: string } | Record<string, never> {
  return cursor !== undefined ? { cursor } : {};
}

function withQuery(
  current: TopologyUrlState,
  q: string | undefined,
): TopologyUrlState {
  // A new result set deliberately clears any prior Relationship selection;
  // retaining it would show trust for a subject outside the visible search.
  return {
    ...(current.direction !== undefined
      ? { direction: current.direction }
      : {}),
    ...(current.depth !== undefined ? { depth: current.depth } : {}),
    ...(current.minConfidence !== undefined
      ? { minConfidence: current.minConfidence }
      : {}),
    ...(current.view !== undefined ? { view: current.view } : {}),
    ...(current.pin !== undefined ? { pin: current.pin } : {}),
    ...(q !== undefined ? { q } : {}),
  };
}

function buildEntityDetailHref(
  identifier: string,
  urlState: TopologyUrlState,
): string {
  const preserved = serializeTopologyUrlState({
    ...(urlState.q !== undefined ? { q: urlState.q } : {}),
    ...(urlState.pin !== undefined ? { pin: urlState.pin } : {}),
  });
  const query = preserved.toString();
  return `/entities/${encodeURIComponent(identifier)}${query.length > 0 ? `?${query}` : ""}`;
}

/** Renders the shared loading/error states for any `useAsyncQuery` result, deferring only the "loaded" case to the caller. */
function renderQueryState<Data>(
  query: UseAsyncQueryResult<Data>,
  loadingLabel: string,
  renderLoaded: (data: Data) => ReactElement,
): ReactElement {
  switch (query.state.status) {
    case "loading":
      return <LoadingStatus label={loadingLabel} />;
    case "api-error":
      return <ApiErrorStatus error={query.state.error} onRetry={query.retry} />;
    case "internal-error":
      return <InternalErrorStatus onRetry={query.retry} />;
    case "loaded":
      return renderLoaded(query.state.data);
  }
}

interface SearchFormProps {
  readonly initialQuery: string | undefined;
  readonly minimumLength: number;
  readonly onSubmit: (query: string) => void;
  readonly onClear: () => void;
}

function SearchForm({
  initialQuery,
  minimumLength,
  onSubmit,
  onClear,
}: SearchFormProps): ReactElement {
  const [draft, setDraft] = useState(initialQuery ?? "");
  const trimmedDraft = draft.trim();
  const draftTooShort =
    trimmedDraft.length > 0 && trimmedDraft.length < minimumLength;

  return (
    <form
      role="search"
      className="topology-search-form"
      onSubmit={(event): void => {
        event.preventDefault();
        if (trimmedDraft.length >= minimumLength) {
          onSubmit(trimmedDraft);
        }
      }}
    >
      <label htmlFor="topology-search-input">Search by exact identifier</label>
      <input
        id="topology-search-input"
        type="search"
        value={draft}
        onChange={(event): void => {
          setDraft(event.target.value);
        }}
      />
      <button type="submit" disabled={trimmedDraft.length < minimumLength}>
        Search
      </button>
      {initialQuery !== undefined && (
        <button
          type="button"
          onClick={(): void => {
            setDraft("");
            onClear();
          }}
        >
          Clear search
        </button>
      )}
      {draftTooShort && (
        <p className="topology-search-hint" role="status">
          Enter at least {minimumLength} characters to search.
        </p>
      )}
    </form>
  );
}

interface PaginationControlsProps {
  readonly pageNumber: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

function PaginationControls({
  pageNumber,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: PaginationControlsProps): ReactElement {
  return (
    <nav className="topology-pagination" aria-label="Pagination">
      <button type="button" onClick={onPrevious} disabled={!hasPrevious}>
        Previous page
      </button>
      <span className="topology-pagination-page">Page {pageNumber}</span>
      <button type="button" onClick={onNext} disabled={!hasNext}>
        Next page
      </button>
    </nav>
  );
}

function EntityInventoryList({
  page,
  urlState,
}: {
  readonly page: EntityPage;
  readonly urlState: TopologyUrlState;
}): ReactElement {
  if (page.items.length === 0) {
    return <EmptyStatus message="No entities are visible in this snapshot." />;
  }
  return (
    <ul className="topology-result-list">
      {page.items.map((item) => {
        const view = projectEntityInventoryItem(item);
        return (
          <li key={view.identifier} className="topology-result-item">
            <Link to={buildEntityDetailHref(view.identifier, urlState)}>
              {view.identifier}
            </Link>
            {view.entityTypes.length > 0 && (
              <span className="topology-result-types">
                {" "}
                — {view.entityTypes.join(", ")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SubjectResultsList({
  page,
  urlState,
  onInspectRelationship,
}: {
  readonly page: SubjectPage;
  readonly urlState: TopologyUrlState;
  readonly onInspectRelationship: (identifier: string) => void;
}): ReactElement {
  if (page.items.length === 0) {
    return <EmptyStatus message="No subjects match this search." />;
  }
  return (
    <ul className="topology-result-list">
      {page.items.map((item) => {
        const view = projectSubjectSearchItem(item);
        return (
          <li key={view.identifier} className="topology-result-item">
            {view.subjectKind === "entity" ? (
              <Link to={buildEntityDetailHref(view.identifier, urlState)}>
                {view.identifier}
              </Link>
            ) : (
              <button
                type="button"
                className="topology-inline-inspect"
                onClick={() => {
                  onInspectRelationship(view.identifier);
                }}
              >
                Inspect {view.identifier}
              </button>
            )}
            <span className="topology-result-kind"> ({view.subjectKind})</span>
            {view.subjectKind === "entity" && view.entityTypes.length > 0 && (
              <span className="topology-result-types">
                {" "}
                — {view.entityTypes.join(", ")}
              </span>
            )}
            {view.subjectKind === "relationship" &&
              view.relationshipTypes.length > 0 && (
                <span className="topology-result-types">
                  {" "}
                  — {view.relationshipTypes.join(", ")}
                </span>
              )}
          </li>
        );
      })}
    </ul>
  );
}

export function TopologyPage(): ReactElement {
  const inspectorReturnFocusRef = useRef<HTMLElement | null>(null);
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

  const searchQueryText = urlState.q;
  const searchQueryTooShort =
    searchQueryText !== undefined &&
    searchQueryText.length < MINIMUM_SEARCH_QUERY_LENGTH;
  const isSearchMode = searchQueryText !== undefined && !searchQueryTooShort;

  const pagerResetKey = `${identity !== undefined ? pinToken(identity) : "pending"}::${
    isSearchMode ? `search:${searchQueryText}` : "inventory"
  }`;
  const [pagerResetTracker, setPagerResetTracker] = useState(pagerResetKey);
  const [cursorHistory, setCursorHistory] = useState<
    readonly (string | undefined)[]
  >([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  if (pagerResetTracker !== pagerResetKey) {
    setPagerResetTracker(pagerResetKey);
    setCursorHistory([undefined]);
    setPageIndex(0);
  }
  const cursor = cursorHistory[pageIndex];

  const inventoryQueryKey =
    identity !== undefined && !isSearchMode
      ? buildRequestCacheKey({
          operation: "entityInventory",
          identity: pinFields(identity),
          ...cursorField(cursor),
        })
      : "inactive:inventory";
  const inventoryQuery = useAsyncQuery<EntityPage>({
    queryKey: inventoryQueryKey,
    cache: true,
    run: (signal): Promise<ClientQueryResult<EntityPage>> => {
      if (identity === undefined || isSearchMode) {
        return Promise.resolve({ ok: false, error: { kind: "aborted" } });
      }
      return fetchEntityInventory(
        { ...cursorField(cursor), identity },
        signal,
      ).then((result) => requireResolvedIdentity(result, identity));
    },
  });

  const searchQueryKey =
    identity !== undefined && isSearchMode
      ? buildRequestCacheKey({
          operation: "search",
          identity: pinFields(identity),
          params: { q: searchQueryText },
          ...cursorField(cursor),
        })
      : "inactive:search";
  const searchQuery = useAsyncQuery<SubjectPage>({
    queryKey: searchQueryKey,
    cache: true,
    run: (signal): Promise<ClientQueryResult<SubjectPage>> => {
      if (identity === undefined || !isSearchMode) {
        return Promise.resolve({ ok: false, error: { kind: "aborted" } });
      }
      return fetchSearch(
        { q: searchQueryText, ...cursorField(cursor), identity },
        signal,
      ).then((result) => requireResolvedIdentity(result, identity));
    },
  });
  const selectedRelationshipIdentifier = urlState.selected?.startsWith(
    "atlast:relationship:",
  )
    ? urlState.selected
    : undefined;
  const relationshipFromCurrentPage =
    searchQuery.state.status === "loaded" &&
    selectedRelationshipIdentifier !== undefined
      ? searchQuery.state.data.items.find(
          (item) =>
            item.subject.subjectKind === "relationship" &&
            item.subject.identifier === selectedRelationshipIdentifier,
        )
      : undefined;
  const relationshipTrustQueryKey =
    identity !== undefined &&
    selectedRelationshipIdentifier !== undefined &&
    relationshipFromCurrentPage === undefined
      ? buildRequestCacheKey({
          operation: "relationshipTrust",
          identity: pinFields(identity),
          params: { relationshipId: selectedRelationshipIdentifier },
        })
      : "inactive:relationshipTrust";
  const relationshipTrustQuery = useAsyncQuery<SubjectReadResult | null>({
    queryKey: relationshipTrustQueryKey,
    cache: true,
    run: async (
      signal,
    ): Promise<ClientQueryResult<SubjectReadResult | null>> => {
      if (
        identity === undefined ||
        selectedRelationshipIdentifier === undefined ||
        relationshipFromCurrentPage !== undefined
      ) {
        return { ok: false, error: { kind: "aborted" } };
      }
      const result = await fetchSearch(
        {
          q: selectedRelationshipIdentifier,
          limit: 100,
          identity,
        },
        signal,
      ).then((response) => requireResolvedIdentity(response, identity));
      if (!result.ok) {
        return result;
      }
      const exact = result.data.items.find(
        (item) =>
          item.subject.subjectKind === "relationship" &&
          item.subject.identifier === selectedRelationshipIdentifier,
      );
      return { ok: true, data: exact ?? null };
    },
  });
  const selectedRelationship =
    relationshipFromCurrentPage ??
    (relationshipTrustQuery.state.status === "loaded"
      ? (relationshipTrustQuery.state.data ?? undefined)
      : undefined);

  const inspectRelationship = (identifier: string): void => {
    inspectorReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSearchParams(
      serializeTopologyUrlState({
        ...urlState,
        selected: identifier,
      }),
    );
  };

  const closeInspector = (): void => {
    const withoutSelected = { ...urlState };
    delete withoutSelected.selected;
    setSearchParams(serializeTopologyUrlState(withoutSelected));
  };

  function goToNextPage(nextCursor: string | undefined): void {
    if (nextCursor === undefined) {
      return;
    }
    setCursorHistory((previous) =>
      pageIndex + 1 < previous.length ? previous : [...previous, nextCursor],
    );
    setPageIndex((index) => index + 1);
  }

  function goToPreviousPage(): void {
    setPageIndex((index) => Math.max(0, index - 1));
  }

  return (
    <TopologyShell title="Topology">
      {wasCorrected && <UrlCorrectedNotice />}
      <SearchForm
        key={urlState.q ?? ""}
        initialQuery={urlState.q}
        minimumLength={MINIMUM_SEARCH_QUERY_LENGTH}
        onSubmit={(query): void => {
          setSearchParams(
            serializeTopologyUrlState(withQuery(urlState, query)),
          );
        }}
        onClear={(): void => {
          setSearchParams(
            serializeTopologyUrlState(withQuery(urlState, undefined)),
          );
        }}
      />
      {searchQueryTooShort && (
        <p className="topology-search-hint" role="status">
          This link&rsquo;s search query is too short to search (minimum{" "}
          {MINIMUM_SEARCH_QUERY_LENGTH} characters); showing the entity
          inventory instead.
        </p>
      )}
      <div className="topology-results">
        {identityQuery.state.status !== "loaded"
          ? renderQueryState(
              identityQuery,
              "Resolving the current topology snapshot…",
              (): ReactElement => <></>,
            )
          : isSearchMode
            ? renderQueryState(searchQuery, "Searching…", (page) => (
                <>
                  <SubjectResultsList
                    page={page}
                    urlState={urlState}
                    onInspectRelationship={inspectRelationship}
                  />
                  <PaginationControls
                    pageNumber={pageIndex + 1}
                    hasPrevious={pageIndex > 0}
                    hasNext={page.page.hasMore}
                    onPrevious={goToPreviousPage}
                    onNext={(): void => {
                      goToNextPage(page.page.nextCursor);
                    }}
                  />
                </>
              ))
            : renderQueryState(
                inventoryQuery,
                "Loading entity inventory…",
                (page) => (
                  <>
                    <EntityInventoryList page={page} urlState={urlState} />
                    <PaginationControls
                      pageNumber={pageIndex + 1}
                      hasPrevious={pageIndex > 0}
                      hasNext={page.page.hasMore}
                      onPrevious={goToPreviousPage}
                      onNext={(): void => {
                        goToNextPage(page.page.nextCursor);
                      }}
                    />
                  </>
                ),
              )}
      </div>
      {selectedRelationshipIdentifier !== undefined &&
        relationshipFromCurrentPage === undefined &&
        relationshipTrustQuery.state.status === "loading" && (
          <LoadingStatus label="Rehydrating exact Relationship trust…" />
        )}
      {selectedRelationshipIdentifier !== undefined &&
        relationshipTrustQuery.state.status === "api-error" && (
          <ApiErrorStatus
            error={relationshipTrustQuery.state.error}
            onRetry={relationshipTrustQuery.retry}
          />
        )}
      {selectedRelationshipIdentifier !== undefined &&
        relationshipTrustQuery.state.status === "internal-error" && (
          <InternalErrorStatus onRetry={relationshipTrustQuery.retry} />
        )}
      {selectedRelationshipIdentifier !== undefined &&
        relationshipTrustQuery.state.status === "loaded" &&
        relationshipTrustQuery.state.data === null && (
          <EmptyStatus message="The exact Relationship identifier is not visible at this snapshot." />
        )}
      {selectedRelationship !== undefined && identity !== undefined && (
        <TrustInspector
          selection={{ subject: selectedRelationship }}
          snapshotIdentity={identity}
          returnFocus={inspectorReturnFocusRef.current}
          onClose={closeInspector}
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
