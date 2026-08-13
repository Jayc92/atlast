import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEntityReadResult,
  buildTraversalResult,
} from "./test-support/fixtures.ts";
import { TraversalWorkspace } from "./TraversalWorkspace.tsx";

afterEach(cleanup);

describe("TraversalWorkspace", () => {
  it("reports retained updates and bounded truncation while wiring every control", () => {
    const origin = buildEntityReadResult({
      identifier: "atlast:entity:checkout",
      entityType: "service",
    });
    const onBoundsChange = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <TraversalWorkspace
        origin={origin}
        traversal={buildTraversalResult([], true)}
        direction="downstream"
        depth={1}
        minConfidence={0}
        viewMode="list"
        selected={undefined}
        updating
        onBoundsChange={onBoundsChange}
        onViewModeChange={onViewModeChange}
        onSelect={() => undefined}
      />,
    );

    expect(
      screen.getByText("Updating while the prior graph remains visible…"),
    ).toBeDefined();
    expect(screen.getByText(/reached its bounded result budget/)).toBeDefined();

    fireEvent.change(screen.getByRole("combobox", { name: "Direction" }), {
      target: { value: "upstream" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Depth" }), {
      target: { value: "3" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Minimum confidence" }),
      {
        target: { value: "0.7" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    expect(onBoundsChange).toHaveBeenNthCalledWith(1, {
      direction: "upstream",
      depth: 1,
      minConfidence: 0,
    });
    expect(onBoundsChange).toHaveBeenNthCalledWith(2, {
      direction: "downstream",
      depth: 3,
      minConfidence: 0,
    });
    expect(onBoundsChange).toHaveBeenNthCalledWith(3, {
      direction: "downstream",
      depth: 1,
      minConfidence: 0.7,
    });
    expect(onViewModeChange).toHaveBeenCalledWith("graph");
  });
});
