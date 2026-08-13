import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TopologyGraphViewModel } from "./graph-projection.ts";

const { layoutTopologyMock } = vi.hoisted(() => ({
  layoutTopologyMock: vi.fn(),
}));

vi.mock("./graph-layout.ts", () => ({
  layoutTopology: layoutTopologyMock,
}));

interface MockNode {
  readonly id: string;
  readonly data: { readonly label: ReactNode };
  readonly className?: string;
  readonly selected?: boolean;
}

interface MockEdge {
  readonly id: string;
  readonly label?: ReactNode;
  readonly className?: string;
  readonly selected?: boolean;
}

vi.mock("@xyflow/react", () => ({
  MarkerType: { ArrowClosed: "arrow-closed" },
  Background: () => null,
  Controls: () => null,
  ReactFlow: ({
    nodes,
    edges,
    onNodeClick,
    onEdgeClick,
  }: {
    readonly nodes: readonly MockNode[];
    readonly edges: readonly MockEdge[];
    readonly onNodeClick: (event: MouseEvent, node: MockNode) => void;
    readonly onEdgeClick: (event: MouseEvent, edge: MockEdge) => void;
  }) => (
    <div>
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          data-id={node.id}
          data-class={node.className}
          aria-pressed={node.selected}
          onClick={(event) => {
            onNodeClick(event.nativeEvent, node);
          }}
        >
          {node.data.label}
        </button>
      ))}
      {edges.map((edge) => (
        <button
          key={edge.id}
          type="button"
          data-id={edge.id}
          data-class={edge.className}
          aria-pressed={edge.selected}
          onClick={(event) => {
            onEdgeClick(event.nativeEvent, edge);
          }}
        >
          {edge.label}
        </button>
      ))}
    </div>
  ),
}));

import { GraphViewport } from "./GraphViewport.tsx";

const VIEW: TopologyGraphViewModel = {
  nodes: [
    {
      id: "atlast:entity:checkout",
      label: "checkout",
      entityTypes: ["service"],
      ambiguous: true,
    },
    {
      id: "atlast:entity:payments",
      label: "payments",
      entityTypes: ["service"],
      ambiguous: false,
    },
  ],
  edges: [
    {
      id: "candidate-edge",
      relationshipIdentifier: "atlast:relationship:checkout-calls-payments",
      assertionIdentifier: "atlast:assertion:candidate",
      source: "atlast:entity:checkout",
      target: "atlast:entity:payments",
      label: "calls",
      confidence: 0.5,
      conflicted: true,
      renderable: true,
    },
    {
      id: "boundary-edge",
      relationshipIdentifier: "atlast:relationship:checkout-calls-external",
      assertionIdentifier: "atlast:assertion:boundary",
      source: "atlast:entity:checkout",
      target: "atlast:entity:external",
      label: "calls",
      confidence: 0.8,
      conflicted: false,
      renderable: false,
    },
  ],
  boundaryReferences: [
    {
      edgeId: "boundary-edge",
      endpointIdentifier: "atlast:entity:external",
      role: "target",
    },
  ],
  truncated: false,
  subjectCount: 3,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GraphViewport", () => {
  it("renders explicit conflict and ambiguity semantics and synchronizes selection", async () => {
    layoutTopologyMock.mockResolvedValue({
      nodes: [
        { id: "atlast:entity:checkout", x: 0, y: 0 },
        { id: "atlast:entity:payments", x: 300, y: 0 },
      ],
      width: 510,
      height: 76,
    });
    const onSelect = vi.fn();

    render(
      <GraphViewport
        view={VIEW}
        selected="candidate-edge"
        onSelect={onSelect}
      />,
    );

    expect(await screen.findByText("ambiguous identity")).toBeDefined();
    const conflictedEdge = screen.getByRole("button", {
      name: "calls · conflicted",
    });
    expect(conflictedEdge.dataset.class).toContain("conflicted");
    expect(conflictedEdge.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(document.activeElement).toBe(conflictedEdge);
    });

    fireEvent.click(screen.getByRole("button", { name: /checkout/ }));
    expect(onSelect).toHaveBeenCalledWith("atlast:entity:checkout");
    expect(screen.queryByText("boundary-edge")).toBeNull();
  });

  it("offers the structured-view fallback when layout fails", async () => {
    layoutTopologyMock.mockRejectedValue(new Error("layout failed"));

    render(
      <GraphViewport
        view={VIEW}
        selected={undefined}
        onSelect={() => undefined}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Use the Structured view",
    );
  });
});
