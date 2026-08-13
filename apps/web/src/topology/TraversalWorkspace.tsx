import { lazy, Suspense, useMemo, type ReactElement } from "react";
import type {
  SubjectReadResult,
  TraversalDirection,
  TraversalResult,
} from "@atlast/shared";
import type { TopologyViewMode } from "../url/query-state.ts";
import { projectTraversalGraph } from "./graph-projection.ts";
import { StructuredTopologyView } from "./StructuredTopologyView.tsx";

const GraphViewport = lazy(() =>
  import("./GraphViewport.tsx").then((module) => ({
    default: module.GraphViewport,
  })),
);

export interface TraversalWorkspaceProps {
  readonly origin: SubjectReadResult;
  readonly traversal: TraversalResult;
  readonly direction: TraversalDirection;
  readonly depth: number;
  readonly minConfidence: number;
  readonly viewMode: TopologyViewMode;
  readonly selected: string | undefined;
  readonly updating: boolean;
  readonly onBoundsChange: (bounds: {
    readonly direction: TraversalDirection;
    readonly depth: number;
    readonly minConfidence: number;
  }) => void;
  readonly onViewModeChange: (viewMode: TopologyViewMode) => void;
  readonly onSelect: (identifier: string) => void;
}

export function TraversalWorkspace({
  origin,
  traversal,
  direction,
  depth,
  minConfidence,
  viewMode,
  selected,
  updating,
  onBoundsChange,
  onViewModeChange,
  onSelect,
}: TraversalWorkspaceProps): ReactElement {
  const view = useMemo(
    () => projectTraversalGraph(origin, traversal),
    [origin, traversal],
  );

  return (
    <section className="topology-workspace" aria-labelledby="workspace-heading">
      <div className="topology-workspace-heading">
        <div>
          <p className="topology-kicker">Bounded exploration</p>
          <h2 id="workspace-heading">Relationship workspace</h2>
        </div>
        <div className="topology-view-switch" aria-label="Topology view">
          <button
            type="button"
            aria-pressed={viewMode === "graph"}
            onClick={() => {
              onViewModeChange("graph");
            }}
          >
            Graph
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            onClick={() => {
              onViewModeChange("list");
            }}
          >
            Structured
          </button>
        </div>
      </div>

      <fieldset className="topology-traversal-controls">
        <legend>Traversal bounds</legend>
        <label>
          Direction
          <select
            value={direction}
            onChange={(event) => {
              onBoundsChange({
                direction: event.target.value as TraversalDirection,
                depth,
                minConfidence,
              });
            }}
          >
            <option value="downstream">Downstream</option>
            <option value="upstream">Upstream</option>
          </select>
        </label>
        <label>
          Depth
          <select
            value={depth}
            onChange={(event) => {
              onBoundsChange({
                direction,
                depth: Number(event.target.value),
                minConfidence,
              });
            }}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum confidence
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={minConfidence}
            onChange={(event) => {
              onBoundsChange({
                direction,
                depth,
                minConfidence: Number(event.target.value),
              });
            }}
          />
        </label>
        <output aria-live="polite">
          {updating
            ? "Updating while the prior graph remains visible…"
            : `${String(view.nodes.length)} entities · ${String(view.edges.length)} relationship candidates`}
        </output>
      </fieldset>

      {view.truncated && (
        <p role="status" className="topology-truncation-notice">
          This traversal reached its bounded result budget. Refine the bounds
          before treating this as a complete neighborhood.
        </p>
      )}

      {viewMode === "graph" ? (
        <Suspense fallback={<p role="status">Loading graph viewport…</p>}>
          <GraphViewport view={view} selected={selected} onSelect={onSelect} />
        </Suspense>
      ) : (
        <StructuredTopologyView
          view={view}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </section>
  );
}
