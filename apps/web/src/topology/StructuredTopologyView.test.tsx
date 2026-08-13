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
});
