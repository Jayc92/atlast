/**
 * The M3-D overlay status states (ADR-0031 § 1): "Overlay failure or
 * identity mismatch leaves topology usable with an honest, separately
 * labeled error and retry." These are deliberately distinct components from
 * `QueryStatus.tsx`'s base-topology states — a caller renders both
 * independently, so an overlay failure is never confused with a base
 * topology failure and never hides the topology view.
 */
import type { ReactElement } from "react";
import type { ErrorResponse } from "@atlast/shared";

export function HealthOverlayLoadingStatus(): ReactElement {
  return (
    <p className="health-overlay-status" role="status">
      Loading the synthetic operational overlay…
    </p>
  );
}

function RetryOverlayButton({
  onRetry,
}: {
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <button type="button" onClick={onRetry}>
      Try the overlay again
    </button>
  );
}

export function HealthOverlayApiErrorStatus({
  error,
  onRetry,
  onRecoverCoordinate,
}: {
  readonly error: ErrorResponse;
  readonly onRetry: () => void;
  readonly onRecoverCoordinate?: () => void;
}): ReactElement {
  return (
    <div
      className="health-overlay-status health-overlay-status-error"
      role="alert"
    >
      <p>Synthetic operational overlay unavailable: {error.message}</p>
      <RetryOverlayButton onRetry={onRetry} />
      {onRecoverCoordinate !== undefined && (
        <button type="button" onClick={onRecoverCoordinate}>
          Select a compatible overlay frame
        </button>
      )}
    </div>
  );
}

export function HealthOverlayInternalErrorStatus({
  onRetry,
}: {
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <div
      className="health-overlay-status health-overlay-status-error"
      role="alert"
    >
      <p>
        The synthetic operational overlay could not be loaded. The failure has
        been hidden because it isn&rsquo;t safe to show directly. Topology
        exploration is unaffected.
      </p>
      <RetryOverlayButton onRetry={onRetry} />
    </div>
  );
}

export function HealthOverlayMismatchStatus({
  onRetry,
}: {
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <div
      className="health-overlay-status health-overlay-status-error"
      role="alert"
    >
      <p>
        The synthetic operational overlay could not be verified against the
        current topology, so it was not shown. Topology exploration remains
        unaffected.
      </p>
      <RetryOverlayButton onRetry={onRetry} />
    </div>
  );
}
