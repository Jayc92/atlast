import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { presentationForCondition } from "./health-overlay-projection.ts";
import { HealthOverlayGaps } from "./HealthOverlayGaps.tsx";

afterEach(cleanup);

describe("HealthOverlayGaps", () => {
  it("states explicitly that there are no unknown targets, rather than omitting the panel", () => {
    render(
      <HealthOverlayGaps
        gaps={[]}
        frameIdentifier="atlast:overlay-frame:demo-company/active-conditions"
      />,
    );
    expect(
      screen.getByText(
        "No unknown overlay targets are reported in this frame.",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Unknown overlay targets" }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("region", { name: "Unknown overlay targets" })
        .getAttribute("tabindex"),
    ).toBe("0");
  });

  it("lists every gap with its target, source frame entry, direct condition, and reason — never as a graph node", () => {
    render(
      <HealthOverlayGaps
        frameIdentifier="atlast:overlay-frame:demo-company/active-conditions"
        gaps={[
          {
            gap: {
              entryIdentifier:
                "atlast:overlay-entry:demo-company/active-conditions/mystery",
              targetEntityIdentifier: "atlast:entity:unknown-target",
              directCondition: "degraded",
              reason: "UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT",
            },
            presentation: presentationForCondition("degraded"),
            reasonText: "Unknown entity at the resolved topology snapshot.",
          },
        ]}
      />,
    );
    const item = screen.getByRole("listitem");
    expect(item.textContent).toContain("atlast:entity:unknown-target");
    expect(item.textContent).toContain("Degraded");
    expect(item.textContent).toContain(
      "source frame atlast:overlay-frame:demo-company/active-conditions",
    );
    expect(item.textContent).toContain(
      "atlast:overlay-entry:demo-company/active-conditions/mystery",
    );
    expect(item.textContent).toContain(
      "Unknown entity at the resolved topology snapshot.",
    );
    expect(screen.queryByRole("figure")).toBeNull();
  });
});
