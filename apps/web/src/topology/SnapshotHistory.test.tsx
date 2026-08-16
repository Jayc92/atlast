import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import { SnapshotHistory } from "./SnapshotHistory.tsx";
import { topologyRequestCache, topologySessionCoordinator } from "./session.ts";
import { jsonRoute, stubApiFetch } from "./test-support/stub-fetch.ts";

const LATEST_IDENTITY = {
  asOf: "2026-08-13T12:00:00.000Z",
  horizon: 20,
  derivationVersion: "m1-v1",
} as const;
const HISTORICAL_IDENTITY = {
  asOf: "2026-04-20T12:00:00.000Z",
  horizon: 20,
  derivationVersion: "m1-v1",
} as const;
const ANCHORS = {
  items: [
    {
      identity: HISTORICAL_IDENTITY,
      checksum: "a".repeat(64),
      subjectCount: 7,
    },
  ],
  truncated: false,
  meta: {
    schemaVersion: "atlast-domain-v1",
    resolvedHorizon: 20,
    derivationVersion: "m1-v1",
  },
} as const;

function LocationProbe(): ReactElement {
  const location = useLocation();
  return <output aria-label="location">{location.search}</output>;
}

function renderHistory(initialEntry = "/topology"): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SnapshotHistory resolvedIdentity={LATEST_IDENTITY} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  topologyRequestCache.clear();
  topologySessionCoordinator.beginNewGeneration();
});

describe("SnapshotHistory", () => {
  it("loads anchors on demand and selects one complete canonical pin", async () => {
    stubApiFetch([
      jsonRoute((url) => url === "/api/v1/snapshot-anchors", ANCHORS),
    ]);
    renderHistory("/topology?q=checkout");

    fireEvent.click(screen.getByRole("button", { name: "Browse history" }));
    const select = await screen.findByLabelText("Retained observation anchor");
    fireEvent.change(select, {
      target: {
        value: `${HISTORICAL_IDENTITY.asOf}|20|m1-v1`,
      },
    });

    await waitFor(() => {
      const params = new URLSearchParams(
        screen.getByLabelText("location").textContent,
      );
      expect(params.get("q")).toBe("checkout");
      expect(params.get("asOf")).toBe(HISTORICAL_IDENTITY.asOf);
      expect(params.get("horizon")).toBe("20");
      expect(params.get("derivationVersion")).toBe("m1-v1");
    });
    expect(screen.getByText("Subject count").nextSibling?.textContent).toBe(
      "7",
    );
    expect(screen.getByText("Checksum").nextSibling?.textContent).toBe(
      "a".repeat(64),
    );
  });

  it("starts a genuinely new latest generation and removes all pin fields", async () => {
    const generationBefore = topologySessionCoordinator.currentGeneration();
    renderHistory(
      `/topology?asOf=${encodeURIComponent(HISTORICAL_IDENTITY.asOf)}&horizon=20&derivationVersion=m1-v1`,
    );

    expect(screen.getByText(/Requested historical snapshot/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Return to latest" }));

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe("");
    });
    expect(topologySessionCoordinator.currentGeneration()).toBe(
      generationBefore + 1,
    );
  });

  it("keeps the requested pin and return-to-latest action available when anchor loading fails", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url === "/api/v1/snapshot-anchors",
        {
          code: "INTERNAL_ERROR",
          message: "Snapshot anchors are temporarily unavailable.",
          details: {},
        },
        false,
      ),
    ]);
    renderHistory(
      `/topology?asOf=${encodeURIComponent(HISTORICAL_IDENTITY.asOf)}&horizon=20&derivationVersion=m1-v1`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Browse history" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Snapshot anchors are temporarily unavailable.",
    );
    expect(
      screen.getByText(HISTORICAL_IDENTITY.asOf, { exact: false }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Return to latest" }),
    ).toBeDefined();
  });

  it("announces a truncated retained window", async () => {
    stubApiFetch([
      jsonRoute((url) => url === "/api/v1/snapshot-anchors", {
        ...ANCHORS,
        truncated: true,
      }),
    ]);
    renderHistory();
    fireEvent.click(screen.getByRole("button", { name: "Browse history" }));
    expect(
      await screen.findByText(/Showing the 100 newest retained anchors/),
    ).toBeDefined();
  });
});
