import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorResponse } from "@atlast/shared";
import {
  ApiErrorStatus,
  EmptyStatus,
  InternalErrorStatus,
  LoadingStatus,
  UrlCorrectedNotice,
} from "./QueryStatus.tsx";

afterEach(() => {
  cleanup();
});

describe("LoadingStatus", () => {
  it("announces the loading label via role=status", () => {
    render(<LoadingStatus label="Loading entity inventory…" />);
    expect(screen.getByRole("status").textContent).toBe(
      "Loading entity inventory…",
    );
  });
});

describe("ApiErrorStatus", () => {
  it("shows the validated error message verbatim and wires the retry button", () => {
    const error: ErrorResponse = {
      code: "UNKNOWN_IDENTIFIER",
      message: "No entity matches that identifier.",
      details: { identifierKind: "subject", identifier: "atlast:entity:x" },
    };
    const onRetry = vi.fn();
    render(<ApiErrorStatus error={error} onRetry={onRetry} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "No entity matches that identifier.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("InternalErrorStatus", () => {
  it("shows a redacted message with no raw error detail, and wires retry", () => {
    const onRetry = vi.fn();
    render(<InternalErrorStatus onRetry={onRetry} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toMatch(/Error:|Exception|stack/i);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("EmptyStatus", () => {
  it("announces the supplied empty-state message", () => {
    render(<EmptyStatus message="No entities are visible in this snapshot." />);
    expect(screen.getByRole("status").textContent).toBe(
      "No entities are visible in this snapshot.",
    );
  });
});

describe("UrlCorrectedNotice", () => {
  it("announces that the link was corrected", () => {
    render(<UrlCorrectedNotice />);
    expect(screen.getByRole("status").textContent).toMatch(/corrected/i);
  });
});
