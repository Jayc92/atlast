import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthOverlayControls } from "./HealthOverlayControls.tsx";

afterEach(cleanup);

describe("HealthOverlayControls", () => {
  it("toggles the master overlay switch and labels it as synthetic", () => {
    const onToggleHealth = vi.fn();
    render(
      <HealthOverlayControls
        healthOn={false}
        emphasizedStates={undefined}
        onToggleHealth={onToggleHealth}
        onEmphasisChange={() => undefined}
      />,
    );
    expect(screen.getByText("Synthetic operational overlay")).toBeDefined();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Show synthetic operational overlay",
      }),
    );
    expect(onToggleHealth).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("shows emphasis checkboxes only once the overlay is on, all checked by default", () => {
    render(
      <HealthOverlayControls
        healthOn
        emphasizedStates={undefined}
        onToggleHealth={() => undefined}
        onEmphasisChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: /Down/, checked: true }),
    ).toBeDefined();
    expect(
      screen.getByRole("checkbox", {
        name: /Latent downstream risk/,
        checked: true,
      }),
    ).toBeDefined();
  });

  it("unchecking one state emphasizes only the remaining states", () => {
    const onEmphasisChange = vi.fn();
    render(
      <HealthOverlayControls
        healthOn
        emphasizedStates={undefined}
        onToggleHealth={() => undefined}
        onEmphasisChange={onEmphasisChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /^Healthy/ }));
    expect(onEmphasisChange).toHaveBeenCalledWith([
      "degraded",
      "down",
      "disconnected",
      "expiring-certificate",
      "latent-downstream-risk",
    ]);
  });

  it("re-checking the one remaining unchecked state collapses back to the absent default", () => {
    const onEmphasisChange = vi.fn();
    render(
      <HealthOverlayControls
        healthOn
        emphasizedStates={[
          "healthy",
          "degraded",
          "down",
          "disconnected",
          "expiring-certificate",
        ]}
        onToggleHealth={() => undefined}
        onEmphasisChange={onEmphasisChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Latent downstream risk/ }),
    );
    expect(onEmphasisChange).toHaveBeenCalledWith(undefined);
  });

  it("unchecking every state also collapses to the absent default", () => {
    const onEmphasisChange = vi.fn();
    render(
      <HealthOverlayControls
        healthOn
        emphasizedStates={["down"]}
        onToggleHealth={() => undefined}
        onEmphasisChange={onEmphasisChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Down/ }));
    expect(onEmphasisChange).toHaveBeenCalledWith(undefined);
  });
});
