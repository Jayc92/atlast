import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEntityReadResult,
  buildRelationshipSubjectReadResult,
  buildTraversalResult,
} from "./test-support/fixtures.ts";
import { projectTraversalGraph } from "./graph-projection.ts";
import {
  presentationForCondition,
  type HealthOverlayViewModel,
} from "./health-overlay-projection.ts";
import { StructuredTopologyView } from "./StructuredTopologyView.tsx";

afterEach(cleanup);

describe("StructuredTopologyView", () => {
  it("provides an operable equivalent for entity, edge, and boundary facts", () => {
    const checkout = buildEntityReadResult({
      identifier: "atlast:entity:checkout",
      entityType: "service",
    });
    const relationship = buildRelationshipSubjectReadResult({
      identifier: "atlast:relationship:checkout-calls-external",
      relationshipType: "calls",
      sourceEntityIdentifier: checkout.subject.identifier,
      targetEntityIdentifier: "atlast:entity:external",
    });
    const view = projectTraversalGraph(
      checkout,
      buildTraversalResult([relationship]),
    );
    const onSelect = vi.fn();

    render(
      <StructuredTopologyView
        view={view}
        selected={undefined}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "checkout, service" }));
    expect(onSelect).toHaveBeenCalledWith(checkout.subject.identifier);
    expect(screen.getByText(/Boundary endpoint is outside/)).toBeDefined();
    expect(screen.getByText(/1 endpoint reference is outside/)).toBeDefined();
  });

  it("moves keyboard focus to the shared selected record", async () => {
    const checkout = buildEntityReadResult({
      identifier: "atlast:entity:checkout",
      entityType: "service",
    });
    const view = projectTraversalGraph(checkout, buildTraversalResult([]));

    render(
      <StructuredTopologyView
        view={view}
        selected={checkout.subject.identifier}
        onSelect={() => undefined}
      />,
    );

    const selected = screen.getByRole("button", { name: "checkout, service" });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(document.activeElement).toBe(selected);
    });
  });

  it("includes identity ambiguity in the entity's accessible name", () => {
    render(
      <StructuredTopologyView
        view={{
          nodes: [
            {
              id: "atlast:entity:ambiguous",
              label: "ambiguous",
              entityTypes: ["service"],
              ambiguous: true,
            },
          ],
          edges: [],
          boundaryReferences: [],
          truncated: false,
          subjectCount: 1,
        }}
        selected={undefined}
        onSelect={() => undefined}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "ambiguous, service, ambiguous identity",
      }),
    ).toBeDefined();
  });

  it("presents a non-color state label and explanation, distinguishing emphasized from neutral treatment", () => {
    const healthOverlay: HealthOverlayViewModel = {
      byEntityIdentifier: new Map([
        [
          "atlast:entity:fulfillment",
          {
            entityIdentifier: "atlast:entity:fulfillment",
            projection: {
              reportStatus: "reported",
              entityIdentifier: "atlast:entity:fulfillment",
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
      <StructuredTopologyView
        view={{
          nodes: [
            {
              id: "atlast:entity:fulfillment",
              label: "fulfillment",
              entityTypes: ["service"],
              ambiguous: false,
            },
          ],
          edges: [],
          boundaryReferences: [],
          truncated: false,
          subjectCount: 1,
        }}
        selected={undefined}
        onSelect={() => undefined}
        healthOverlay={healthOverlay}
      />,
    );

    const button = screen.getByRole("button", {
      name: "fulfillment, service, Down",
    });
    expect(button.textContent).toContain("Direct condition: Down.");
  });

  it("labels a nonmatching emphasis filter as not emphasized while still stating the true state", () => {
    const healthOverlay: HealthOverlayViewModel = {
      byEntityIdentifier: new Map([
        [
          "atlast:entity:fulfillment",
          {
            entityIdentifier: "atlast:entity:fulfillment",
            projection: {
              reportStatus: "reported",
              entityIdentifier: "atlast:entity:fulfillment",
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
      <StructuredTopologyView
        view={{
          nodes: [
            {
              id: "atlast:entity:fulfillment",
              label: "fulfillment",
              entityTypes: ["service"],
              ambiguous: false,
            },
          ],
          edges: [],
          boundaryReferences: [],
          truncated: false,
          subjectCount: 1,
        }}
        selected={undefined}
        onSelect={() => undefined}
        healthOverlay={healthOverlay}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "fulfillment, service, Down, not emphasized",
      }),
    ).toBeDefined();
  });
});
