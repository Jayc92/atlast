/**
 * Explicit export of one pilot-feedback session artifact (ADR-0041 § 5):
 * a browser-local file download, triggered only by an explicit tester
 * action — never automatic, never uploaded anywhere, never written
 * through any server route. No secrets are ever part of this artifact's
 * shape (`pilot-feedback-artifact.ts`).
 */
import type { PilotFeedbackSession } from "./pilot-feedback-artifact.ts";

export function exportPilotFeedbackSession(
  session: PilotFeedbackSession,
): void {
  const blob = new Blob([JSON.stringify(session, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `atlast-m6-pilot-feedback-${session.sessionId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
