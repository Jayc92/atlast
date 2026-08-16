/**
 * Atlast foundation page and milestone landing page (ADR-0003).
 *
 * This page communicates the product vision and the current foundation
 * status. The delivered M2 exploration interface lives at `/topology`; this
 * route remains a compact project landing page rather than duplicating it.
 *
 * The only data access is a single health check against the backend API
 * shell, requested through the relative path `/api/health` (proxied by Vite
 * to the localhost API — see vite.config.ts).
 */
import { useEffect, useState, type ReactElement } from "react";

/**
 * The three deterministic API connection states the shell can display.
 * Failures and malformed payloads both degrade visibly to "unavailable" —
 * never silently, and never with raw error details in the UI
 * (GUARDRAILS.md § 1.2: visible degradation).
 */
type ApiHealthState = "checking" | "online" | "unavailable";

const API_HEALTH_STATE_LABELS: Record<ApiHealthState, string> = {
  checking: "Checking local API…",
  online: "Local API connected",
  unavailable: "Local API unavailable",
};

/**
 * The exact payload the API shell promises for `GET /health`
 * (apps/api/src/app.ts). Anything else is treated as unavailable — the
 * shell validates before it trusts, the same honesty rule the graph will
 * live by.
 */
function isExpectedHealthPayload(
  payload: unknown,
): payload is { status: "ok"; service: "atlast-api" } {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const candidate = payload as { status?: unknown; service?: unknown };
  return candidate.status === "ok" && candidate.service === "atlast-api";
}

/**
 * The two statuses this page ever shows: a milestone is either formally
 * complete ("delivered") or gated on its own explicit authorization
 * ("gated") — docs/milestones.md, HANDOFF.md § 7.
 */
type MilestoneStatus = "delivered" | "gated";

const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  delivered: "delivered",
  gated: "gated",
};

/**
 * The authorized milestone sequence (docs/milestones.md), displayed as
 * roadmap context only. M0 through M2 are formally delivered; every later
 * product milestone remains gated. This page must never imply otherwise and
 * remains a status shell rather than duplicating the topology workspace.
 */
const MILESTONE_ROUTE: readonly {
  id: string;
  title: string;
  summary: string;
  status: MilestoneStatus;
}[] = [
  {
    id: "M0",
    title: "Safe project foundation",
    summary:
      "TypeScript monorepo, web and API shells, one-command verification. Synthetic data only.",
    status: "delivered",
  },
  {
    id: "M1",
    title: "Synthetic topology model",
    summary:
      "Entities, Relationships, and Evidence with provenance, confidence, and freshness, modeled and queryable from fixtures.",
    status: "delivered",
  },
  {
    id: "M2",
    title: "Interactive topology interface",
    summary:
      "Graph exploration, search, and the evidence behind every displayed fact.",
    status: "delivered",
  },
  {
    id: "M3",
    title: "Operational health overlays",
    summary:
      "Synthetic health states projected onto topology — health never viewed without dependency context.",
    status: "gated",
  },
  {
    id: "M4",
    title: "Change-impact simulation",
    summary:
      "Deterministic, explainable blast-radius analysis over synthetic topologies.",
    status: "gated",
  },
  {
    id: "M5",
    title: "Read-only local Kubernetes connector",
    summary:
      "First contact with a real — but disposable — local cluster. Read-only, permanently.",
    status: "gated",
  },
];

export function App(): ReactElement {
  const [apiHealthState, setApiHealthState] =
    useState<ApiHealthState>("checking");

  useEffect(() => {
    const abortController = new AbortController();

    async function checkApiHealth(): Promise<void> {
      try {
        const response = await fetch("/api/health", {
          signal: abortController.signal,
        });
        if (!response.ok) {
          setApiHealthState("unavailable");
          return;
        }
        const payload: unknown = await response.json();
        setApiHealthState(
          isExpectedHealthPayload(payload) ? "online" : "unavailable",
        );
      } catch {
        // An aborted request means the component unmounted mid-flight; any
        // other failure (network error, invalid JSON) degrades visibly to
        // the "unavailable" state — the failure is surfaced in the UI, not
        // swallowed, and raw error details never reach the page.
        if (!abortController.signal.aborted) {
          setApiHealthState("unavailable");
        }
      }
    }

    void checkApiHealth();

    return (): void => {
      abortController.abort();
    };
  }, []);

  return (
    <div className="atlas-page">
      <header className="atlas-masthead reveal reveal-1">
        <p className="atlas-meta">
          <span className="atlas-meta-mark" aria-hidden="true">
            ◈
          </span>
          Atlast · Engineering Topology Platform
        </p>
        <p
          className={`api-indicator api-indicator-${apiHealthState}`}
          role="status"
        >
          <span className="api-indicator-dot" aria-hidden="true" />
          {API_HEALTH_STATE_LABELS[apiHealthState]}
        </p>
      </header>

      <main className="atlas-main">
        <section className="atlas-hero" aria-labelledby="atlas-title">
          <h1 id="atlas-title" className="atlas-title reveal reveal-2">
            Atlast
          </h1>
          <p className="atlas-tagline reveal reveal-3">
            The living map of your engineering organization.
          </p>
          <p className="atlas-lede reveal reveal-4">
            Atlast continuously discovers the systems an organization runs,
            maintains a versioned dependency graph of how they connect, and — in
            time — answers the question every engineer asks before every change:{" "}
            <em>“if I change this, what breaks?”</em>
          </p>
          <nav
            className="atlas-enter-nav reveal reveal-5"
            aria-label="Topology application"
          >
            <div>
              <span className="atlas-enter-kicker">Interactive workspace</span>
              <p>Browse the synthetic entity inventory and search the map.</p>
            </div>
            <a className="atlas-enter-link" href="/topology">
              Explore topology <span aria-hidden="true">→</span>
            </a>
          </nav>
        </section>

        <section
          className="atlas-vision reveal reveal-5"
          aria-labelledby="vision-heading"
        >
          <h2 id="vision-heading" className="atlas-section-heading">
            <span className="atlas-section-kicker">Product vision</span>
            Where the map is headed
          </h2>
          <p className="atlas-section-note">
            The capabilities below are the long-term ambition — none of them
            exist yet. Delivery is deliberately synthetic-first: every layer is
            proven against fixture data before Atlast observes any real system.
          </p>
          <ul className="vision-list">
            <li>
              <h3>See</h3>
              <p>
                A complete, always-current inventory and dependency graph,
                derived from observation rather than declaration.
              </p>
            </li>
            <li>
              <h3>Understand</h3>
              <p>
                Operational health, ownership, and change history projected onto
                the graph — health never viewed without its dependency context.
              </p>
            </li>
            <li>
              <h3>Predict</h3>
              <p>
                Explainable blast-radius analysis for proposed changes, with
                every claim traceable to its Evidence.
              </p>
            </li>
            <li>
              <h3>Advise</h3>
              <p>
                Proactive identification of fragility: single points of failure,
                unowned critical systems, architectural drift.
              </p>
            </li>
          </ul>
        </section>

        <section
          className="atlas-route reveal reveal-6"
          aria-labelledby="route-heading"
        >
          <h2 id="route-heading" className="atlas-section-heading">
            <span className="atlas-section-kicker">Upcoming milestones</span>
            The plotted route
          </h2>
          <p className="atlas-section-note">
            Each milestone is gated on its own explicit authorization. M0 and M1
            are delivered; every later milestone remains gated.
          </p>
          <ol className="route-list">
            {MILESTONE_ROUTE.map((milestone) => (
              <li
                key={milestone.id}
                className={`route-stop route-stop-${milestone.status === "gated" ? "gated" : "active"}`}
              >
                <span className="route-stop-id">{milestone.id}</span>
                <div className="route-stop-body">
                  <h3>
                    {milestone.title}
                    {milestone.status === "gated" ? (
                      <span className="route-stop-badge">
                        {MILESTONE_STATUS_LABELS[milestone.status]}
                      </span>
                    ) : (
                      <span className="route-stop-badge route-stop-badge-active">
                        {MILESTONE_STATUS_LABELS[milestone.status]}
                      </span>
                    )}
                  </h3>
                  <p>{milestone.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="atlas-status reveal reveal-7"
          aria-labelledby="status-heading"
        >
          <h2 id="status-heading" className="atlas-section-heading">
            <span className="atlas-section-kicker">Current state</span>
            M2 — Interactive topology interface
          </h2>
          <p>
            M0, M1, and M2 are delivered. The repository now includes the safe
            TypeScript foundation, fixture-driven topology and query API, and a
            complete interactive topology workspace at /topology. It remains
            synthetic-only and connects to nothing beyond the local API.
          </p>
          <p>
            M2 adds inventory and identifier search, bounded graph traversal,
            equivalent structured navigation, trust and Evidence inspection, and
            reproducible snapshot history. M3 planning is authorized, but M3
            product implementation and every later milestone remain gated on
            their own reviewed baseline and explicit release.
          </p>
        </section>
      </main>

      <footer className="atlas-footer reveal reveal-7">
        <p>
          Read-only toward observed systems, permanently. Synthetic data only
          through M4.
        </p>
      </footer>
    </div>
  );
}
