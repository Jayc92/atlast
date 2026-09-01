import { useState, type ReactElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

/**
 * "Verdict" is a label reused by the entity, relationship, and impact
 * judgment forms alike — `screen.getByLabelText("Verdict")` alone is
 * ambiguous. Scope to the relationship-judgment form specifically.
 */
function relationshipJudgmentForm(): HTMLElement {
  return screen.getByRole("form", { name: "Record a relationship judgment" });
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

  it("records a materialized-relationship judgment (default review subject, unchanged from schema v1)", () => {
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

  describe("Criterion-4 correction: relationship-evaluation review subject (no materialized edge)", () => {
    it("records a known-zero relationship-evaluation review without a relationship identifier or fabricated target", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Review subject"), {
        target: { value: "relationship-evaluation" },
      });
      fireEvent.change(screen.getByLabelText("Source entity identifier"), {
        target: { value: "atlast:entity:atlast-m6-a-service-unused" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Record relationship judgment" }),
      );
      expect(screen.getByText("Relationship judgments: 1")).toBeTruthy();
    });

    it("never offers correct/incorrect/missing verdicts for a relationship-evaluation review — only the non-edge verdicts are selectable", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Review subject"), {
        target: { value: "relationship-evaluation" },
      });
      const verdictSelect = within(relationshipJudgmentForm()).getByLabelText(
        "Verdict",
      );
      if (!(verdictSelect instanceof HTMLSelectElement)) {
        throw new Error("expected a <select> element for the verdict field");
      }
      expect(
        Array.from(verdictSelect.options).map((option) => option.value),
      ).toEqual([
        "known-zero",
        "unknown-insufficient-evidence",
        "tester-uncertain",
      ]);
    });

    it("still offers the full, unchanged materialized-relationship verdict vocabulary after switching subjects and back", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Review subject"), {
        target: { value: "relationship-evaluation" },
      });
      fireEvent.change(screen.getByLabelText("Review subject"), {
        target: { value: "materialized-relationship" },
      });
      const verdictSelect = within(relationshipJudgmentForm()).getByLabelText(
        "Verdict",
      );
      if (!(verdictSelect instanceof HTMLSelectElement)) {
        throw new Error("expected a <select> element for the verdict field");
      }
      expect(
        Array.from(verdictSelect.options).map((option) => option.value),
      ).toEqual([
        "correct",
        "incorrect",
        "missing",
        "known-zero",
        "unknown-insufficient-evidence",
        "tester-uncertain",
      ]);
      fireEvent.change(
        screen.getByLabelText("Atlast relationship identifier"),
        {
          target: { value: "atlast:relationship:owns/checkout" },
        },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Record relationship judgment" }),
      );
      expect(screen.getByText("Relationship judgments: 1")).toBeTruthy();
    });

    it("preserves a relationship-evaluation review across close/reopen", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Review subject"), {
        target: { value: "relationship-evaluation" },
      });
      fireEvent.change(screen.getByLabelText("Source entity identifier"), {
        target: { value: "atlast:entity:atlast-m6-a-service-unused" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Record relationship judgment" }),
      );
      closeThenReopenPanel();
      expect(screen.getByText("Relationship judgments: 1")).toBeTruthy();
    });

    it("exports a relationship-evaluation review with the exact structured shape — no relationship identifier, no fabricated target, correct verdict and schemaVersion", () => {
      forbidNetworkAccess();
      const createObjectUrlSpy = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:fake-url");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => undefined,
      );

      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Review subject"), {
        target: { value: "relationship-evaluation" },
      });
      fireEvent.change(screen.getByLabelText("Source entity identifier"), {
        target: { value: "atlast:entity:atlast-m6-a-service-unused" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Record relationship judgment" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Export pilot JSON" }),
      );

      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      const exportedBlob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
      return exportedBlob.text().then((text) => {
        const parsed = JSON.parse(text) as {
          schemaVersion: string;
          relationshipReviews: readonly Record<string, unknown>[];
        };
        expect(parsed.schemaVersion).toBe(PILOT_FEEDBACK_SCHEMA_VERSION);
        expect(parsed.relationshipReviews).toHaveLength(1);
        const review = parsed.relationshipReviews[0];
        expect(review).toMatchObject({
          reviewSubject: "relationship-evaluation",
          sourceEntityIdentifier: "atlast:entity:atlast-m6-a-service-unused",
          relationshipType: "selects",
          verdict: "known-zero",
        });
        expect(review).not.toHaveProperty("atlastRelationshipIdentifier");
        expect(review).not.toHaveProperty("targetEntityIdentifier");
      });
    });

    it("Criterion-4 regression: the real unused-service known-zero case (previously unrecordable, docs/audits/m0-synthetic-boundary-audit.md § 25.13/§ 28.5) can now be recorded truthfully, with no relationship ID and no fabricated target", () => {
      forbidNetworkAccess();
      const createObjectUrlSpy = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:fake-url");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => undefined,
      );

      render(<PilotFeedbackHarness />);
      fireEvent.change(screen.getByLabelText("Review subject"), {
        target: { value: "relationship-evaluation" },
      });
      fireEvent.change(screen.getByLabelText("Source entity identifier"), {
        target: { value: "atlast:entity:atlast-m6-a-service-unused" },
      });
      fireEvent.change(screen.getByLabelText("Relationship type"), {
        target: { value: "selects" },
      });
      fireEvent.change(
        within(relationshipJudgmentForm()).getByLabelText("Verdict"),
        {
          target: { value: "known-zero" },
        },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Record relationship judgment" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Export pilot JSON" }),
      );

      const exportedBlob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
      return exportedBlob.text().then((text) => {
        const parsed = JSON.parse(text) as {
          relationshipReviews: readonly Record<string, unknown>[];
        };
        const review = parsed.relationshipReviews[0];
        expect(review?.["verdict"]).toBe("known-zero");
        expect(review?.["sourceEntityIdentifier"]).toBe(
          "atlast:entity:atlast-m6-a-service-unused",
        );
        expect(review?.["reviewSubject"]).toBe("relationship-evaluation");
        expect(review).not.toHaveProperty("atlastRelationshipIdentifier");
      });
    });
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

    it("preserves a materialized-relationship judgment across close/reopen", () => {
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

    it("preserves the tester role across close/reopen", () => {
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

    it("preserves session-level notes (entered through the actual Session notes control, distinct from any one judgment's own notes) across close/reopen", () => {
      forbidNetworkAccess();
      render(<PilotFeedbackHarness />);
      const sessionNotesLabel =
        "Session notes (applies to the whole review, not one judgment)";
      fireEvent.change(screen.getByLabelText(sessionNotesLabel), {
        target: {
          value: "M6-C readiness session-note preservation check",
        },
      });
      closeThenReopenPanel();
      const sessionNotesTextarea = screen.getByLabelText(sessionNotesLabel);
      if (!(sessionNotesTextarea instanceof HTMLTextAreaElement)) {
        throw new Error(
          "expected a <textarea> element for the session-notes field",
        );
      }
      expect(sessionNotesTextarea.value).toBe(
        "M6-C readiness session-note preservation check",
      );
    });

    it("exports the state that survived a close/reopen cycle, not just what was recorded before closing — including session notes, not merely inferred from shared hook ownership", () => {
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
      fireEvent.change(
        screen.getByLabelText(
          "Session notes (applies to the whole review, not one judgment)",
        ),
        {
          target: {
            value: "M6-C readiness session-note preservation check",
          },
        },
      );
      closeThenReopenPanel();
      fireEvent.click(
        screen.getByRole("button", { name: "Export pilot JSON" }),
      );

      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      const exportedBlob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
      return exportedBlob.text().then((text) => {
        const parsed = JSON.parse(text) as {
          schemaVersion: string;
          notes: string;
          entityReviews: readonly { atlastEntityIdentifier: string }[];
        };
        expect(parsed.schemaVersion).toBe(PILOT_FEEDBACK_SCHEMA_VERSION);
        expect(parsed.entityReviews).toHaveLength(1);
        expect(parsed.entityReviews[0]?.atlastEntityIdentifier).toBe(
          "atlast:entity:atlast-m6-pilot-checkout",
        );
        expect(parsed.notes).toBe(
          "M6-C readiness session-note preservation check",
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

it("PILOT_FEEDBACK_SCHEMA_VERSION is a stable, explicit version tag, bumped to v2 for the Criterion-4 RelationshipReview shape change so v1 historical artifacts remain distinguishable rather than silently reinterpreted", () => {
  expect(PILOT_FEEDBACK_SCHEMA_VERSION).toBe("atlast-m6-pilot-feedback-v2");
  expect(PILOT_FEEDBACK_SCHEMA_VERSION).not.toBe("atlast-m6-pilot-feedback-v1");
});
