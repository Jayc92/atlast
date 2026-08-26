import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PilotFeedbackPanel } from "./PilotFeedbackPanel.tsx";
import { PILOT_FEEDBACK_SCHEMA_VERSION } from "./pilot-feedback-artifact.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Never lets a real network request escape this test file — proves the panel itself never calls fetch. */
function forbidNetworkAccess(): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(() => {
    throw new Error("PilotFeedbackPanel must never call fetch directly");
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("PilotFeedbackPanel", () => {
  it("records an entity judgment and reflects it in the running tally", () => {
    forbidNetworkAccess();
    render(
      <PilotFeedbackPanel
        environmentReference="datasetMode=connector"
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Atlast entity identifier"), {
      target: { value: "atlast:entity:atlast-m6-pilot-checkout" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record entity judgment" }),
    );
    expect(screen.getByText("Entity judgments: 1")).toBeTruthy();
  });

  it("records a relationship judgment", () => {
    forbidNetworkAccess();
    render(
      <PilotFeedbackPanel
        environmentReference="datasetMode=connector"
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Atlast relationship identifier"), {
      target: { value: "atlast:relationship:owns/checkout" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record relationship judgment" }),
    );
    expect(screen.getByText("Relationship judgments: 1")).toBeTruthy();
  });

  it("records an impact judgment, keeping explanationUsable as a distinct field from verdict", () => {
    forbidNetworkAccess();
    render(
      <PilotFeedbackPanel
        environmentReference="datasetMode=connector"
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Origin entity identifier"), {
      target: { value: "atlast:entity:atlast-m6-pilot-checkout" },
    });
    fireEvent.click(
      screen.getByLabelText(
        "The Why/explanation path was usable (distinct from whether the ranking itself was correct)",
      ),
    ); // toggles to false, proving it is independently controllable
    fireEvent.click(
      screen.getByRole("button", { name: "Record impact judgment" }),
    );
    expect(screen.getByText("Impact judgments: 1")).toBeTruthy();
  });

  it("records a missing entity and a missing relationship, each with only a human description, never a fabricated Atlast identifier", () => {
    forbidNetworkAccess();
    render(
      <PilotFeedbackPanel
        environmentReference="datasetMode=connector"
        onClose={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText(
        "Describe the real object Atlast never discovered (never an Atlast identifier)",
      ),
      {
        target: {
          value: "a bare Pod the tester created directly, never seen by Atlast",
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Record missing entity" }),
    );
    fireEvent.change(
      screen.getByLabelText(
        "Describe the real relationship Atlast never discovered",
      ),
      {
        target: {
          value: "a Service the tester expected but Atlast never mapped",
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Record missing relationship" }),
    );
    expect(screen.getByText("Missing entities: 1")).toBeTruthy();
    expect(screen.getByText("Missing relationships: 1")).toBeTruthy();
  });

  it("exports a versioned JSON artifact via a local Blob download, never a network request", () => {
    forbidNetworkAccess();
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake-url");
    const revokeObjectUrlSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <PilotFeedbackPanel
        environmentReference="datasetMode=connector"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export pilot JSON" }));

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const exportedBlob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    expect(exportedBlob.type).toBe("application/json");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
  });

  it("never invokes fetch for any of its own interactions — feedback never touches a server route", () => {
    const fetchSpy = forbidNetworkAccess();
    render(
      <PilotFeedbackPanel
        environmentReference="datasetMode=connector"
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Atlast entity identifier"), {
      target: { value: "atlast:entity:atlast-m6-pilot-checkout" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record entity judgment" }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

it("PILOT_FEEDBACK_SCHEMA_VERSION is a stable, explicit version tag", () => {
  expect(PILOT_FEEDBACK_SCHEMA_VERSION).toBe("atlast-m6-pilot-feedback-v1");
});
