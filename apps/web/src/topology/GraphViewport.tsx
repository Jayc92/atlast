import { useEffect, useRef, useState, type ReactElement } from "react";
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

export interface GraphViewportProps {
  readonly view: TopologyGraphViewModel;
  readonly selected: string | undefined;
  readonly onSelect: (identifier: string) => void;
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
  const nodes: Node[] = view.nodes.map((node) => ({
    id: node.id,
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      label: (
        <span className="topology-node-label">
          <strong>{node.label}</strong>
          <small>{node.entityTypes.join(" · ") || "entity"}</small>
          {node.ambiguous && <small>ambiguous identity</small>}
        </span>
      ),
    },
    selected: selected === node.id,
    draggable: false,
    className: node.ambiguous ? "topology-node ambiguous" : "topology-node",
    style: { width: 210, minHeight: 76 },
  }));
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

  return (
    <div
      ref={viewportRef}
      className="topology-graph"
      aria-label="Interactive topology graph"
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
