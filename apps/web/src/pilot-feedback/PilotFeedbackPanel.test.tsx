import { useState, type ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PilotFeedbackPanel } from "./PilotFeedbackPanel.tsx";
import { PILOT_FEEDBACK_SCHEMA_VERSION } from "./pilot-feedback-artifact.ts";
import { usePilotFeedbackSession } from "./use-pilot-feedback-session.ts";

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

/**
 * Mirrors `TopologyShell`'s own ownership exactly (pre-M6-C readiness fix):
 * the session lives in this wrapper, outside `PilotFeedbackPanel`, so
 * hiding/reopening the panel below never remounts — and therefore never
 * resets — the session itself. Exposes "Hide panel"/"Reopen panel" controls
 * so tests can exercise exactly the close/reopen cycle a tester would.
 */
function PilotFeedbackHarness(): ReactElement {
  const feedback = usePilotFeedbackSession(
    "test-session",
    "2026-08-26T00:00:00.000Z",
    "datasetMode=connector",
  );
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  return (
    <div>
      {!isPanelOpen && (
        <button
          type="button"
          onClick={() => {
            setIsPanelOpen(true);
          }}
        >
          Reopen panel
        </button>
      )}
      {isPanelOpen && (
        <PilotFeedbackPanel
          feedback={feedback}
          onClose={() => {
            setIsPanelOpen(false);
          }}
        />
      )}
    </div>
  );
}

function closeThenReopenPanel(): void {
  fireEvent.click(screen.getByRole("button", { name: "Close pilot feedback" }));
  fireEvent.click(screen.getByRole("button", { name: "Reopen panel" }));
}

describe("PilotFeedbackPanel", () => {
  it("records an entity judgment and reflects it in the running tally", () => {
    forbidNetworkAccess();
    render(<PilotFeedbackHarness />);
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
    render(<PilotFeedbackHarness />);
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
    render(<PilotFeedbackHarness />);
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
    render(<PilotFeedbackHarness />);
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

    render(<PilotFeedbackHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Export pilot JSON" }));

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const exportedBlob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    expect(exportedBlob.type).toBe("application/json");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
  });

  it("never invokes fetch for any of its own interactions — feedback never touches a server route", () => {
    const fetchSpy = forbidNetworkAccess();
    render(<PilotFeedbackHarness />);
    fireEvent.change(screen.getByLabelText("Atlast entity identifier"), {
      target: { value: "atlast:entity:atlast-m6-pilot-checkout" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record entity judgment" }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("readiness fix: closing and reopening the panel preserves unexported review state", () => {
    it("preserves an entity judgment across close/reopen", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Atlast entity identifier"), {
        target: { value: "atlast:entity:atlast-m6-pilot-checkout" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Record entity judgment" }),
      );
      closeThenReopenPanel();
      expect(screen.getByText("Entity judgments: 1")).toBeTruthy();
    });

    it("preserves a relationship judgment across close/reopen", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(
        screen.getByLabelText("Atlast relationship identifier"),
        { target: { value: "atlast:relationship:owns/checkout" } },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Record relationship judgment" }),
      );
      closeThenReopenPanel();
      expect(screen.getByText("Relationship judgments: 1")).toBeTruthy();
    });

    it("preserves an impact judgment across close/reopen", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Origin entity identifier"), {
        target: { value: "atlast:entity:atlast-m6-pilot-checkout" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Record impact judgment" }),
      );
      closeThenReopenPanel();
      expect(screen.getByText("Impact judgments: 1")).toBeTruthy();
    });

    it("preserves missing-entity and missing-relationship items across close/reopen", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(
        screen.getByLabelText(
          "Describe the real object Atlast never discovered (never an Atlast identifier)",
        ),
        { target: { value: "a bare Pod never seen by Atlast" } },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Record missing entity" }),
      );
      fireEvent.change(
        screen.getByLabelText(
          "Describe the real relationship Atlast never discovered",
        ),
        { target: { value: "a Service Atlast never mapped" } },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Record missing relationship" }),
      );
      closeThenReopenPanel();
      expect(screen.getByText("Missing entities: 1")).toBeTruthy();
      expect(screen.getByText("Missing relationships: 1")).toBeTruthy();
    });

    it("preserves the tester-role and session notes across close/reopen", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Tester role"), {
        target: { value: "Engineer, Platform team" },
      });
      closeThenReopenPanel();
      const testerRoleInput = screen.getByLabelText("Tester role");
      if (!(testerRoleInput instanceof HTMLInputElement)) {
        throw new Error(
          "expected an <input> element for the tester-role field",
        );
      }
      expect(testerRoleInput.value).toBe("Engineer, Platform team");
    });

    it("exports the state that survived a close/reopen cycle, not just what was recorded before closing", () => {
      forbidNetworkAccess();
      const createObjectUrlSpy = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:fake-url");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => undefined,
      );

      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Atlast entity identifier"), {
        target: { value: "atlast:entity:atlast-m6-pilot-checkout" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Record entity judgment" }),
      );
      closeThenReopenPanel();
      fireEvent.click(
        screen.getByRole("button", { name: "Export pilot JSON" }),
      );

      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      const exportedBlob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
      return exportedBlob.text().then((text) => {
        const parsed = JSON.parse(text) as {
          entityReviews: readonly { atlastEntityIdentifier: string }[];
        };
        expect(parsed.entityReviews).toHaveLength(1);
        expect(parsed.entityReviews[0]?.atlastEntityIdentifier).toBe(
          "atlast:entity:atlast-m6-pilot-checkout",
        );
      });
    });

    it("still never mutates domain truth or touches the network across a close/reopen cycle", () => {
      const fetchSpy = forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Atlast entity identifier"), {
        target: { value: "atlast:entity:atlast-m6-pilot-checkout" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Record entity judgment" }),
      );
      closeThenReopenPanel();
      fireEvent.click(
        screen.getByRole("button", { name: "Record entity judgment" }),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

it("PILOT_FEEDBACK_SCHEMA_VERSION is a stable, explicit version tag", () => {
  expect(PILOT_FEEDBACK_SCHEMA_VERSION).toBe("atlast-m6-pilot-feedback-v1");
});
