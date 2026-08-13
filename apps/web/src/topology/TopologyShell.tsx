/**
 * The responsive, keyboard-reachable application shell for the M2-B topology
 * routes (docs/m2-plan.md § 10 M2-B: "the visible application shell for
 * /topology and /entities/:entityId"). One layout shared by both routes —
 * masthead with a way back to the foundation page, a skip link, and a main
 * landmark — so page content is only ever the structured inventory/search/
 * detail presentation itself, never layout scaffolding repeated per page.
 */
import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router";

export interface TopologyShellProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function TopologyShell({
  title,
  children,
}: TopologyShellProps): ReactElement {
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
      </header>
      <main id="topology-main" className="topology-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
