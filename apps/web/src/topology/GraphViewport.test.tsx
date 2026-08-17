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
        <svg key={edge.id}>
          <g
            role="button"
            tabIndex={0}
            data-id={edge.id}
            data-class={edge.className}
            aria-pressed={edge.selected}
            onClick={(event) => {
              onEdgeClick(event.nativeEvent, edge);
            }}
          >
            <text>{edge.label}</text>
          </g>
        </svg>
      ))}
    </div>
  ),
}));

import { GraphViewport } from "./GraphViewport.tsx";
import type { HealthOverlayViewModel } from "./health-overlay-projection.ts";
import { presentationForCondition } from "./health-overlay-projection.ts";
import { StructuredTopologyView } from "./StructuredTopologyView.tsx";

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

  it("selects a node or edge on Enter/Space, not only on click", async () => {
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
      <GraphViewport view={VIEW} selected={undefined} onSelect={onSelect} />,
    );

    const paymentsNode = await screen.findByRole("button", {
      name: /payments/,
    });
    fireEvent.keyDown(paymentsNode, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("atlast:entity:payments");

    const conflictedEdge = screen.getByRole("button", {
      name: "calls · conflicted",
    });
    fireEvent.keyDown(conflictedEdge, { key: " " });
    expect(onSelect).toHaveBeenCalledWith("candidate-edge");

    onSelect.mockClear();
    fireEvent.keyDown(paymentsNode, { key: "Tab" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders non-color state text and pattern for an emphasized health projection, without changing edges", async () => {
    layoutTopologyMock.mockResolvedValue({
      nodes: [
        { id: "atlast:entity:checkout", x: 0, y: 0 },
        { id: "atlast:entity:payments", x: 300, y: 0 },
      ],
      width: 510,
      height: 76,
    });
    const healthOverlay: HealthOverlayViewModel = {
      byEntityIdentifier: new Map([
        [
          "atlast:entity:payments",
          {
            entityIdentifier: "atlast:entity:payments",
            projection: {
              reportStatus: "reported",
              entityIdentifier: "atlast:entity:payments",
              directCondition: "down",
              effectiveState: "down",
              contextCompleteness: "complete-within-requested-bounds",
            },
            presentation: presentationForCondition("down"),
            emphasized: true,
            explanation: "Direct condition: Down.",
          },
        ],
      ]),
      gaps: [],
      overlay: {
        schemaVersion: "atlast-overlay-v1",
        frameIdentifier: "atlast:overlay-frame:demo-company/active-conditions",
        effectiveAt: "2026-08-01T00:00:00.000Z",
      },
      topologyIdentity: {
        asOf: "2026-08-12T00:00:00.000Z",
        horizon: 20,
        derivationVersion: "m1-v1",
      },
    };

    render(
      <GraphViewport
        view={VIEW}
        selected={undefined}
        onSelect={() => undefined}
        healthOverlay={healthOverlay}
      />,
    );

    const paymentsNode = await screen.findByRole("button", {
      name: /payments/,
    });
    expect(paymentsNode.textContent).toContain("Down");
    expect(paymentsNode.dataset.class).toContain("health-state-down");

    const checkoutNode = screen.getByRole("button", { name: /checkout/ });
    expect(checkoutNode.textContent).not.toContain("Down");
    expect(checkoutNode.dataset.class).not.toContain("health-state-down");

    // The disconnected/down health treatment never removes a topology edge.
    expect(
      screen.getByRole("button", { name: "calls · conflicted" }),
    ).toBeDefined();
  });

  it("renders neutral treatment (not the state's own pattern) for a nonmatching emphasis filter", async () => {
    layoutTopologyMock.mockResolvedValue({
      nodes: [
        { id: "atlast:entity:checkout", x: 0, y: 0 },
        { id: "atlast:entity:payments", x: 300, y: 0 },
      ],
      width: 510,
      height: 76,
    });
    const healthOverlay: HealthOverlayViewModel = {
      byEntityIdentifier: new Map([
        [
          "atlast:entity:payments",
          {
            entityIdentifier: "atlast:entity:payments",
            projection: {
              reportStatus: "reported",
              entityIdentifier: "atlast:entity:payments",
              directCondition: "down",
              effectiveState: "down",
              contextCompleteness: "complete-within-requested-bounds",
            },
            presentation: presentationForCondition("down"),
            emphasized: false,
            explanation: "Direct condition: Down.",
          },
        ],
      ]),
      gaps: [],
      overlay: {
        schemaVersion: "atlast-overlay-v1",
        frameIdentifier: "atlast:overlay-frame:demo-company/active-conditions",
        effectiveAt: "2026-08-01T00:00:00.000Z",
      },
      topologyIdentity: {
        asOf: "2026-08-12T00:00:00.000Z",
        horizon: 20,
        derivationVersion: "m1-v1",
      },
    };

    render(
      <GraphViewport
        view={VIEW}
        selected={undefined}
        onSelect={() => undefined}
        healthOverlay={healthOverlay}
      />,
    );

    const paymentsNode = await screen.findByRole("button", {
      name: /payments/,
    });
    // Text still reports the true state honestly even when not emphasized —
    // only the visual pattern treatment recedes to neutral.
    expect(paymentsNode.textContent).toContain("Down");
    expect(paymentsNode.dataset.class).toContain("health-neutral");
    expect(paymentsNode.dataset.class).not.toContain("health-state-down");
  });

  it("surfaces the same health state text as the structured view for the same input (graph/structured equivalence)", async () => {
    layoutTopologyMock.mockResolvedValue({
      nodes: [
        { id: "atlast:entity:checkout", x: 0, y: 0 },
        { id: "atlast:entity:payments", x: 300, y: 0 },
      ],
      width: 510,
      height: 76,
    });
    const healthOverlay: HealthOverlayViewModel = {
      byEntityIdentifier: new Map([
        [
          "atlast:entity:payments",
          {
            entityIdentifier: "atlast:entity:payments",
            projection: {
              reportStatus: "reported",
              entityIdentifier: "atlast:entity:payments",
              directCondition: "expiring-certificate",
              effectiveState: "expiring-certificate",
              contextCompleteness: "complete-within-requested-bounds",
            },
            presentation: presentationForCondition("expiring-certificate"),
            emphasized: true,
            explanation: "Direct condition: Expiring certificate.",
          },
        ],
      ]),
      gaps: [],
      overlay: {
        schemaVersion: "atlast-overlay-v1",
        frameIdentifier: "atlast:overlay-frame:demo-company/active-conditions",
        effectiveAt: "2026-08-01T00:00:00.000Z",
      },
      topologyIdentity: {
        asOf: "2026-08-12T00:00:00.000Z",
        horizon: 20,
        derivationVersion: "m1-v1",
      },
    };

    const { container: graphContainer } = render(
      <GraphViewport
        view={VIEW}
        selected={undefined}
        onSelect={() => undefined}
        healthOverlay={healthOverlay}
      />,
    );
    await screen.findByText("Expiring certificate");
    const graphText = graphContainer.textContent;

    cleanup();

    const { container: structuredContainer } = render(
      <StructuredTopologyView
        view={VIEW}
        selected={undefined}
        onSelect={() => undefined}
        healthOverlay={healthOverlay}
      />,
    );
    const structuredText = structuredContainer.textContent;

    expect(graphText).toContain("Expiring certificate");
    expect(structuredText).toContain("Expiring certificate");
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
