import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorResponse } from "@atlast/shared";
import {
  HealthOverlayApiErrorStatus,
  HealthOverlayInternalErrorStatus,
  HealthOverlayLoadingStatus,
  HealthOverlayMismatchStatus,
} from "./HealthOverlayStatus.tsx";

afterEach(cleanup);

describe("HealthOverlayStatus", () => {
  it("announces loading via a status role", () => {
    render(<HealthOverlayLoadingStatus />);
    expect(screen.getByRole("status").textContent).toContain(
      "synthetic operational overlay",
    );
  });

  it("shows the closed API error message and retries", () => {
    const error: ErrorResponse = {
      code: "OVERLAY_FRAME_NOT_FOUND",
      message: "The requested overlay frame does not exist.",
      details: { overlayFrame: "atlast:overlay-frame:demo-company/gone" },
    };
    const onRetry = vi.fn();
    render(<HealthOverlayApiErrorStatus error={error} onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "The requested overlay frame does not exist.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Try the overlay again" }),
    );
    expect(onRetry).toHaveBeenCalled();
  });

  it("offers coordinate recovery when an exact copied frame can be cleared", () => {
    const error: ErrorResponse = {
      code: "OVERLAY_FRAME_NOT_FOUND",
      message: "The requested overlay frame does not exist.",
      details: { overlayFrame: "atlast:overlay-frame:demo-company/gone" },
    };
    const onRecoverCoordinate = vi.fn();
    render(
      <HealthOverlayApiErrorStatus
        error={error}
        onRetry={() => undefined}
        onRecoverCoordinate={onRecoverCoordinate}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select a compatible overlay frame",
      }),
    );
    expect(onRecoverCoordinate).toHaveBeenCalledOnce();
  });

  it("redacts an internal failure without leaking exception detail", () => {
    render(<HealthOverlayInternalErrorStatus onRetry={() => undefined} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("hidden because it isn");
    expect(alert.textContent).not.toContain("Error:");
  });

  it("labels an identity/subject mismatch distinctly and states topology is unaffected", () => {
    render(<HealthOverlayMismatchStatus onRetry={() => undefined} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Topology exploration remains unaffected.",
    );
  });
});
