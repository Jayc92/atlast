/**
 * The honest canonical states every M2-B page renders (docs/m2-plan.md
 * Journey F): loading, expected API error, redacted internal failure, and
 * invalid-URL correction. Empty results are rendered by each page directly
 * (what "empty" means — no entities vs. no search matches — is page
 *-specific), and retry is exposed as a single reusable button.
 *
 * `role="status"`/`role="alert"` make these announced to assistive
 * technology without a page needing to wire its own live region.
 */
import type { ReactElement } from "react";
import type { ErrorResponse } from "@atlast/shared";

export function LoadingStatus({
  label,
}: {
  readonly label: string;
}): ReactElement {
  return (
    <p className="topology-status topology-status-loading" role="status">
      {label}
    </p>
  );
}

export function RetryButton({
  onRetry,
}: {
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <button type="button" className="topology-retry-button" onClick={onRetry}>
      Try again
    </button>
  );
}

/**
 * An expected, closed API error (docs/m2-plan.md § 3: every route's error
 * responses are a validated, closed contract) — safe to show verbatim,
 * because `errorResponseSchema` already governs exactly what `message` may
 * contain (packages/shared/src/http-contract.ts).
 */
export function ApiErrorStatus({
  error,
  onRetry,
}: {
  readonly error: ErrorResponse;
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <div className="topology-status topology-status-error" role="alert">
      <p>{error.message}</p>
      <RetryButton onRetry={onRetry} />
    </div>
  );
}

/**
 * A redacted internal failure — network failure, non-JSON body, or a
 * response that failed schema validation. No raw error detail is ever
 * rendered here (GUARDRAILS.md § 1.2: visible degradation, never a leaked
 * exception).
 */
export function InternalErrorStatus({
  onRetry,
}: {
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <div className="topology-status topology-status-error" role="alert">
      <p>
        Something went wrong loading this data. The failure has been hidden
        because it isn&rsquo;t safe to show directly.
      </p>
      <RetryButton onRetry={onRetry} />
    </div>
  );
}

export function EmptyStatus({
  message,
}: {
  readonly message: string;
}): ReactElement {
  return (
    <p className="topology-status topology-status-empty" role="status">
      {message}
    </p>
  );
}

export function UrlCorrectedNotice(): ReactElement {
  return (
    <p className="topology-status topology-status-corrected" role="status">
      Part of this link was not a valid topology address, so it was corrected to
      the closest safe state.
    </p>
  );
}
