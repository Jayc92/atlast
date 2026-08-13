import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import type { TopologyGraphViewModel } from "./graph-projection.ts";

const NODE_WIDTH = 210;
const NODE_HEIGHT = 76;

export interface PositionedTopologyNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface TopologyLayout {
  readonly nodes: readonly PositionedTopologyNode[];
  readonly width: number;
  readonly height: number;
}

export function buildElkGraph(view: TopologyGraphViewModel): ElkNode {
  return {
    id: "atlast-topology",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "56",
      "elk.layered.spacing.nodeNodeBetweenLayers": "104",
      "elk.padding": "[top=32,left=32,bottom=32,right=32]",
    },
    children: view.nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: view.edges
      .filter((edge) => edge.renderable)
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
  };
}

/** Runs ELK with fixed inputs and returns only the stable positions we render. */
export async function layoutTopology(
  view: TopologyGraphViewModel,
): Promise<TopologyLayout> {
  const result = await new ELK().layout(buildElkGraph(view));
  return {
    nodes: (result.children ?? []).map((node) => ({
      id: node.id,
      x: node.x ?? 0,
      y: node.y ?? 0,
    })),
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
}
