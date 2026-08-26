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
 */
import { useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router";
import {
  DatasetModeBadge,
  type DatasetModeBadgeState,
} from "./DatasetModeBadge.tsx";
import { PilotFeedbackPanel } from "../pilot-feedback/PilotFeedbackPanel.tsx";
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
          environmentReference={environmentReference}
          onClose={() => {
            setIsFeedbackPanelOpen(false);
          }}
        />
      )}
    </div>
  );
}
