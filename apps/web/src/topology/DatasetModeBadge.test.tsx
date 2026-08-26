import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DatasetModeBadge } from "./DatasetModeBadge.tsx";

afterEach(() => {
  cleanup();
});

describe("DatasetModeBadge", () => {
  it("reports fixture mode, keyed off the authoritative /health field (ADR-0040 § 1)", () => {
    render(
      <DatasetModeBadge state={{ status: "known", datasetMode: "fixture" }} />,
    );
    expect(screen.getByText("Synthetic fixture data")).toBeTruthy();
  });

  it("reports connector mode distinctly from fixture mode", () => {
    render(
      <DatasetModeBadge
        state={{ status: "known", datasetMode: "connector" }}
      />,
    );
    expect(screen.getByText("Real Kubernetes data (connector)")).toBeTruthy();
  });

  it("fails visibly, never silently, when /health is unreachable or malformed", () => {
    render(<DatasetModeBadge state={{ status: "unknown" }} />);
    expect(
      screen.getByText(
        "Dataset source unknown — /health could not be confirmed.",
      ),
    ).toBeTruthy();
  });

  it("shows a loading state before /health resolves", () => {
    render(<DatasetModeBadge state={{ status: "loading" }} />);
    expect(screen.getByText("Checking dataset source…")).toBeTruthy();
  });
});
