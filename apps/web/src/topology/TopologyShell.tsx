/**
 * The responsive, keyboard-reachable application shell for the M2-B topology
 * routes (docs/m2-plan.md § 10 M2-B: "the visible application shell for
 * /topology and /entities/:entityId"). One layout shared by both routes —
 * masthead with a way back to the foundation page, a skip link, and a main
 * landmark — so page content is only ever the structured inventory/search/
 * detail presentation itself, never layout scaffolding repeated per page.
 *
 * M6-B additions (ADR-0040 § 1, ADR-0041): the dataset-mode badge and the
 * pilot-feedback panel toggle live here, once, so both are reachable from
 * every topology-workspace page rather than duplicated per page.
 *
 * Pre-M6-C readiness fix: the pilot-feedback session itself (§ the
 * `usePilotFeedbackSession` call) is owned HERE, not inside
 * `PilotFeedbackPanel` — `isFeedbackPanelOpen` only toggles whether the
 * panel is rendered, never whether this shell (and the session state it
 * owns) is mounted, so hiding and reopening the panel never discards an
 * unexported judgment. A full page navigation/reload still starts a fresh
 * session, matching ADR-0041 § 5's session-local, never-persisted design —
 * only the "close panel" affordance no longer means "discard review."
 */
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router";
import {
  DatasetModeBadge,
  type DatasetModeBadgeState,
} from "./DatasetModeBadge.tsx";
import { PilotFeedbackPanel } from "../pilot-feedback/PilotFeedbackPanel.tsx";
import { usePilotFeedbackSession } from "../pilot-feedback/use-pilot-feedback-session.ts";
import { fetchHealth } from "../api/client.ts";
import { useAsyncQuery } from "./use-async-query.ts";

export interface TopologyShellProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function TopologyShell({
  title,
  children,
}: TopologyShellProps): ReactElement {
  const [isFeedbackPanelOpen, setIsFeedbackPanelOpen] = useState(false);
  // The one `/health` fetch this shell needs — both the dataset-mode badge
  // and the pilot-feedback panel's environment reference derive from this
  // single result, never two independent requests for the same fact.
  const { state: healthState } = useAsyncQuery({
    queryKey: "dataset-mode",
    cache: true,
    run: fetchHealth,
  });
  const badgeState: DatasetModeBadgeState =
    healthState.status === "loading"
      ? { status: "loading" }
      : healthState.status === "loaded"
        ? { status: "known", datasetMode: healthState.data.datasetMode }
        : { status: "unknown" };
  const environmentReference =
    badgeState.status === "known"
      ? `datasetMode=${badgeState.datasetMode}`
      : "datasetMode=unknown";

  // Owned here (not inside PilotFeedbackPanel) so the review survives the
  // panel being hidden and reopened — see the file-level comment above.
  const [feedbackSessionId] = useState(() => crypto.randomUUID());
  const [feedbackStartedAt] = useState(() => new Date().toISOString());
  const feedback = usePilotFeedbackSession(
    feedbackSessionId,
    feedbackStartedAt,
    environmentReference,
  );
  // `feedback` (and every setter on it) is a fresh object/closure on every
  // render — only the primitive `environmentReference` value itself is a
  // meaningful dependency here; including the setter would re-run this
  // effect (and therefore call `setSession`) on every render, looping.
  useEffect(() => {
    feedback.setEnvironmentReference(environmentReference);
  }, [environmentReference]);

  return (
    <div className="topology-shell">
      <a className="topology-skip-link" href="#topology-main">
        Skip to topology content
      </a>
      <header className="topology-masthead">
        <nav aria-label="Primary">
          <Link to="/" className="topology-home-link">
            <span aria-hidden="true">◈</span> Atlast
          </Link>
        </nav>
        <h1 className="topology-title">{title}</h1>
        <DatasetModeBadge state={badgeState} />
        <button
          type="button"
          onClick={() => {
            setIsFeedbackPanelOpen(true);
          }}
        >
          Pilot feedback
        </button>
      </header>
      <main id="topology-main" className="topology-main" tabIndex={-1}>
        {children}
      </main>
      {isFeedbackPanelOpen && (
        <PilotFeedbackPanel
          feedback={feedback}
          onClose={() => {
            setIsFeedbackPanelOpen(false);
          }}
        />
      )}
    </div>
  );
}
