import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { TopologyGraphViewModel } from "./graph-projection.ts";
import { layoutTopology, type TopologyLayout } from "./graph-layout.ts";
import type { HealthOverlayViewModel } from "./health-overlay-projection.ts";

export interface GraphViewportProps {
  readonly view: TopologyGraphViewModel;
  readonly selected: string | undefined;
  readonly onSelect: (identifier: string) => void;
  /** Absent when overlays are off — the graph renders identically either way. */
  readonly healthOverlay?: HealthOverlayViewModel;
}

type LayoutState =
  | {
      readonly view: TopologyGraphViewModel;
      readonly status: "loaded";
      readonly data: TopologyLayout;
    }
  | { readonly view: TopologyGraphViewModel; readonly status: "error" };

export function GraphViewport({
  view,
  selected,
  onSelect,
  healthOverlay,
}: GraphViewportProps): ReactElement {
  const [layoutState, setLayoutState] = useState<LayoutState>();
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    void layoutTopology(view)
      .then((nextLayout) => {
        if (current) {
          setLayoutState({ view, status: "loaded", data: nextLayout });
        }
      })
      .catch(() => {
        if (current) {
          setLayoutState({ view, status: "error" });
        }
      });
    return (): void => {
      current = false;
    };
  }, [view]);

  const currentLayoutState =
    layoutState?.view === view ? layoutState : undefined;
  const layout =
    currentLayoutState?.status === "loaded"
      ? currentLayoutState.data
      : undefined;

  useEffect(() => {
    if (layout === undefined || selected === undefined) {
      return;
    }
    const selectedElement = [
      ...(viewportRef.current?.querySelectorAll<HTMLElement>("[data-id]") ??
        []),
    ].find((element) => element.dataset.id === selected);
    selectedElement?.focus();
  }, [layout, selected]);

  if (currentLayoutState?.status === "error") {
    return (
      <p role="alert">
        The graph layout could not be prepared. Use the Structured view to
        continue exploring the same topology facts.
      </p>
    );
  }

  if (layout === undefined) {
    return <p role="status">Laying out topology…</p>;
  }

  const positions = new Map(layout.nodes.map((node) => [node.id, node]));
  const nodes: Node[] = view.nodes.map((node) => {
    const health = healthOverlay?.byEntityIdentifier.get(node.id);
    const healthPatternClassName =
      health === undefined
        ? undefined
        : health.emphasized
          ? health.presentation.patternClassName
          : "health-neutral";
    return {
      id: node.id,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        label: (
          <span className="topology-node-label">
            <strong>{node.label}</strong>
            <small>{node.entityTypes.join(" · ") || "entity"}</small>
            {node.ambiguous && <small>ambiguous identity</small>}
            {health !== undefined && (
              <small>
                <span aria-hidden="true">{health.presentation.glyph}</span>{" "}
                {health.presentation.label}
              </small>
            )}
          </span>
        ),
      },
      selected: selected === node.id,
      draggable: false,
      className: [
        "topology-node",
        node.ambiguous ? "ambiguous" : undefined,
        healthPatternClassName,
      ]
        .filter((value): value is string => value !== undefined)
        .join(" "),
      style: { width: 210, minHeight: 76 },
    };
  });
  const edges: Edge[] = view.edges
    .filter((edge) => edge.renderable)
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: `${edge.label}${edge.conflicted ? " · conflicted" : ""}`,
      selected: selected === edge.id,
      markerEnd: { type: MarkerType.ArrowClosed },
      className: edge.conflicted ? "topology-edge conflicted" : "topology-edge",
      ...(edge.conflicted ? { style: { strokeDasharray: "6 5" } } : {}),
    }));

  /**
   * @xyflow/react gives every node/edge `tabIndex=0` and its own internal
   * Enter/Space keydown handler, but that internal handler only updates
   * xyflow's own selection store — it never calls the `onNodeClick`/
   * `onEdgeClick` callback below, so a keyboard user who tabs onto a node
   * and presses Enter sees nothing happen. This delegated listener restores
   * the same selection behavior the mouse handlers already trigger, keyed
   * off the same `data-id` attribute xyflow renders on every node and edge.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const origin = event.target;
    if (!(origin instanceof Element)) {
      return;
    }
    const identifier =
      origin.closest("[data-id]")?.getAttribute("data-id") ?? undefined;
    if (identifier === undefined) {
      return;
    }
    event.preventDefault();
    onSelect(identifier);
  };

  return (
    <div
      ref={viewportRef}
      className="topology-graph"
      aria-label="Interactive topology graph"
      onKeyDown={handleKeyDown}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.8}
        onNodeClick={(_event, node) => {
          onSelect(node.id);
        }}
        onEdgeClick={(_event, edge) => {
          onSelect(edge.id);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(43, 41, 37, 0.16)" gap={28} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
