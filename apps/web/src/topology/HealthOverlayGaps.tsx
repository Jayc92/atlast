/**
 * The M3-D dedicated gap panel (ADR-0031 § 4): frame-wide unknown-target
 * gaps in a keyboard-reachable region, never rendered as graph nodes or
 * counted in traversal totals. An empty gap list is stated explicitly, not
 * inferred from an absent panel.
 */
import type { ReactElement } from "react";
import type { OverlayFrameIdentifier } from "@atlast/shared";
import type { OverlayGapPresentation } from "./health-overlay-projection.ts";

export interface HealthOverlayGapsProps {
  readonly gaps: readonly OverlayGapPresentation[];
  readonly frameIdentifier: OverlayFrameIdentifier;
}

export function HealthOverlayGaps({
  gaps,
  frameIdentifier,
}: HealthOverlayGapsProps): ReactElement {
  return (
    <section
      className="health-overlay-gaps"
      aria-labelledby="health-overlay-gaps-heading"
      tabIndex={0}
    >
      <h3 id="health-overlay-gaps-heading">Unknown overlay targets</h3>
      {gaps.length === 0 ? (
        <p>No unknown overlay targets are reported in this frame.</p>
      ) : (
        <ul>
          {gaps.map(({ gap, presentation, reasonText }) => (
            <li key={gap.entryIdentifier}>
              <strong>{gap.targetEntityIdentifier}</strong>
              <span aria-hidden="true"> {presentation.glyph}</span>
              <span> {presentation.label}</span>
              <span> — source frame {frameIdentifier}</span>
              <span> — entry {gap.entryIdentifier}</span>
              <span> — {reasonText}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
