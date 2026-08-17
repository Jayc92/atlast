/**
 * The M3-D master overlay toggle and state-emphasis controls (ADR-0031 § 1).
 * These are emphasis controls, never topology filters: unchecking a state
 * only changes which reported projections receive emphasis treatment — no
 * topology node, edge, structured row, or gap is ever removed as a result.
 */
import type { ReactElement } from "react";
import type { EffectiveHealthState } from "@atlast/shared";
import { EFFECTIVE_HEALTH_STATE_PRESENTATION } from "./health-overlay-projection.ts";

const EMPHASIS_STATES_IN_ORDER: readonly EffectiveHealthState[] = [
  "healthy",
  "degraded",
  "down",
  "disconnected",
  "expiring-certificate",
  "latent-downstream-risk",
];

export interface HealthOverlayControlsProps {
  readonly healthOn: boolean;
  /** `undefined` means every reported state is emphasized (URL-absence default). */
  readonly emphasizedStates: readonly EffectiveHealthState[] | undefined;
  readonly onToggleHealth: (on: boolean) => void;
  readonly onEmphasisChange: (
    states: readonly EffectiveHealthState[] | undefined,
  ) => void;
}

export function HealthOverlayControls({
  healthOn,
  emphasizedStates,
  onToggleHealth,
  onEmphasisChange,
}: HealthOverlayControlsProps): ReactElement {
  const isChecked = (state: EffectiveHealthState): boolean =>
    emphasizedStates === undefined ? true : emphasizedStates.includes(state);

  const toggleState = (state: EffectiveHealthState, checked: boolean): void => {
    const current = emphasizedStates ?? EMPHASIS_STATES_IN_ORDER;
    const next = checked
      ? EMPHASIS_STATES_IN_ORDER.filter(
          (candidate) => current.includes(candidate) || candidate === state,
        )
      : current.filter((candidate) => candidate !== state);
    const everyStateSelected = EMPHASIS_STATES_IN_ORDER.every((candidate) =>
      next.includes(candidate),
    );
    // Selecting every state, or none, both collapse to the "emphasize all"
    // default — a URL cannot express "emphasize nothing" (ADR-0031 § 1).
    onEmphasisChange(
      everyStateSelected || next.length === 0 ? undefined : next,
    );
  };

  return (
    <section
      className="health-overlay-controls"
      aria-labelledby="health-overlay-heading"
    >
      <div>
        <p className="topology-kicker">Synthetic operational overlay</p>
        <h2 id="health-overlay-heading">Operational health</h2>
      </div>
      <label className="health-overlay-toggle">
        <input
          type="checkbox"
          checked={healthOn}
          onChange={(event) => {
            onToggleHealth(event.target.checked);
          }}
        />
        Show synthetic operational overlay
      </label>
      {healthOn && (
        <fieldset className="health-overlay-emphasis">
          <legend>Emphasize states</legend>
          {EMPHASIS_STATES_IN_ORDER.map((state) => {
            const presentation = EFFECTIVE_HEALTH_STATE_PRESENTATION[state];
            return (
              <label key={state} className="health-overlay-emphasis-option">
                <input
                  type="checkbox"
                  checked={isChecked(state)}
                  onChange={(event) => {
                    toggleState(state, event.target.checked);
                  }}
                />
                <span aria-hidden="true">{presentation.glyph}</span>{" "}
                {presentation.label}
              </label>
            );
          })}
        </fieldset>
      )}
    </section>
  );
}
