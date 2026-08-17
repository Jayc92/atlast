/**
 * M3-D pure health-overlay presentation (ADR-0029/0030/0031). This module
 * never computes health policy — direct/effective state, latent-risk
 * derivation, and gap classification are already decided by the API
 * (`packages/overlay-model`, ADR-0030 § 3: "the API, not the browser,
 * applies direct/effective semantics"). It only maps the already-validated
 * `HealthContextResult` into presentation view models: non-color state
 * labels/glyphs, emphasis-vs-neutral treatment, human-readable direct/derived
 * explanations, and the client-side identity/subject match check that gates
 * whether an overlay response may publish at all (ADR-0031 § 1).
 */
import type {
  DirectCondition,
  EffectiveHealthState,
  HealthContextResult,
  HealthProjection,
  OverlayGap,
  TraversalResult,
} from "@atlast/shared";

export interface StatePresentation {
  readonly label: string;
  /** A non-color glyph — every state is distinguishable without color (ADR-0031 § 3). */
  readonly glyph: string;
  /** A CSS class selecting a distinct border pattern, also non-color. */
  readonly patternClassName: string;
}

const DIRECT_CONDITION_PRESENTATION: Record<
  DirectCondition,
  StatePresentation
> = {
  healthy: {
    label: "Healthy",
    glyph: "●",
    patternClassName: "health-state-healthy",
  },
  degraded: {
    label: "Degraded",
    glyph: "◐",
    patternClassName: "health-state-degraded",
  },
  down: {
    label: "Down",
    glyph: "✕",
    patternClassName: "health-state-down",
  },
  disconnected: {
    label: "Disconnected",
    glyph: "⌁",
    patternClassName: "health-state-disconnected",
  },
  "expiring-certificate": {
    label: "Expiring certificate",
    glyph: "⏳",
    patternClassName: "health-state-expiring-certificate",
  },
};

const LATENT_RISK_PRESENTATION: StatePresentation = {
  label: "Latent downstream risk",
  glyph: "△",
  patternClassName: "health-state-latent-downstream-risk",
};

export const UNREPORTED_PRESENTATION: StatePresentation = {
  label: "No overlay report",
  glyph: "–",
  patternClassName: "health-state-unreported",
};

export const EFFECTIVE_HEALTH_STATE_PRESENTATION: Record<
  EffectiveHealthState,
  StatePresentation
> = {
  ...DIRECT_CONDITION_PRESENTATION,
  "latent-downstream-risk": LATENT_RISK_PRESENTATION,
};

export function presentationForCondition(
  condition: DirectCondition,
): StatePresentation {
  return DIRECT_CONDITION_PRESENTATION[condition];
}

export function presentationForProjection(
  projection: HealthProjection,
): StatePresentation {
  if (projection.reportStatus === "unreported") {
    return UNREPORTED_PRESENTATION;
  }
  return EFFECTIVE_HEALTH_STATE_PRESENTATION[projection.effectiveState];
}

/**
 * Emphasis is presentation-only, never a topology filter (ADR-0031 § 1):
 * every projection remains present in every view regardless of this value.
 * `unreported` never counts as emphasized — it has no reported state to
 * match. Absent `emphasizedStates` means every reported state is emphasized
 * (the default, URL-absence meaning).
 */
export function isEmphasized(
  projection: HealthProjection,
  emphasizedStates: readonly EffectiveHealthState[] | undefined,
): boolean {
  if (projection.reportStatus === "unreported") {
    return false;
  }
  if (emphasizedStates === undefined) {
    return true;
  }
  return emphasizedStates.includes(projection.effectiveState);
}

function describeDerivation(
  projection: Extract<HealthProjection, { readonly reportStatus: "reported" }>,
): string {
  if (projection.effectiveState !== "latent-downstream-risk") {
    return `Direct condition: ${presentationForCondition(projection.directCondition).label}.`;
  }
  const { derivation } = projection;
  const triggerLabel = presentationForCondition(
    derivation.triggerDirectCondition,
  ).label;
  const pathText = derivation.path
    .map(
      (step) =>
        `${step.sourceEntityIdentifier} → ${step.targetEntityIdentifier}`,
    )
    .join(", then ");
  return (
    `Healthy directly; latent downstream risk derived from ` +
    `${derivation.triggerEntityIdentifier} (${triggerLabel}) via ${pathText}.`
  );
}

export function describeProjection(projection: HealthProjection): string {
  if (projection.reportStatus === "unreported") {
    return "No overlay report.";
  }
  const base = describeDerivation(projection);
  return projection.contextCompleteness === "truncated"
    ? `${base} Context is truncated; absence of risk outside the loaded neighborhood is not proven.`
    : base;
}

export interface HealthEntityPresentation {
  readonly entityIdentifier: string;
  readonly projection: HealthProjection;
  readonly presentation: StatePresentation;
  readonly emphasized: boolean;
  readonly explanation: string;
}

export interface OverlayGapPresentation {
  readonly gap: OverlayGap;
  readonly presentation: StatePresentation;
  readonly reasonText: string;
}

export interface HealthOverlayViewModel {
  readonly byEntityIdentifier: ReadonlyMap<string, HealthEntityPresentation>;
  readonly gaps: readonly OverlayGapPresentation[];
  readonly overlay: HealthContextResult["meta"]["overlay"];
  readonly topologyIdentity: HealthContextResult["meta"]["resolvedIdentity"];
}

const GAP_REASON_TEXT: Record<OverlayGap["reason"], string> = {
  UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT:
    "Unknown entity at the resolved topology snapshot.",
};

/**
 * Builds the presentation view model consumed identically by the graph and
 * structured views (ADR-0031 § 5: "Graph and structured views share
 * selection, filter, and inspector state") — one derivation, two renderers.
 */
export function buildHealthOverlayView(
  result: HealthContextResult,
  emphasizedStates: readonly EffectiveHealthState[] | undefined,
): HealthOverlayViewModel {
  const byEntityIdentifier = new Map<string, HealthEntityPresentation>();
  for (const projection of result.data.projections) {
    byEntityIdentifier.set(projection.entityIdentifier, {
      entityIdentifier: projection.entityIdentifier,
      projection,
      presentation: presentationForProjection(projection),
      emphasized: isEmphasized(projection, emphasizedStates),
      explanation: describeProjection(projection),
    });
  }

  const gaps = result.data.gaps.map((gap): OverlayGapPresentation => ({
    gap,
    presentation: presentationForCondition(gap.directCondition),
    reasonText: GAP_REASON_TEXT[gap.reason],
  }));

  return {
    byEntityIdentifier,
    gaps,
    overlay: result.meta.overlay,
    topologyIdentity: result.meta.resolvedIdentity,
  };
}

/**
 * The client-side publish gate (ADR-0031 § 1/ADR-0030 § 5): a health-context
 * response may be shown only when its complete resolved topology identity
 * and ordered traversal subject identifiers exactly match the base traversal
 * for the same origin and bounds. This is a pure structural comparison —
 * identity equality is already enforced upstream by `requireResolvedIdentity`
 * pinning both requests to the same identity, so this proves the remaining,
 * independently checkable half: origin and ordered subjects.
 */
export function healthContextMatchesBaseTraversal(
  healthResult: HealthContextResult,
  originEntityIdentifier: string,
  baseTraversal: TraversalResult,
): boolean {
  if (healthResult.data.originEntityIdentifier !== originEntityIdentifier) {
    return false;
  }
  if (
    healthResult.meta.resolvedIdentity.asOf !==
      baseTraversal.meta.resolvedIdentity.asOf ||
    healthResult.meta.resolvedIdentity.horizon !==
      baseTraversal.meta.resolvedIdentity.horizon ||
    healthResult.meta.resolvedIdentity.derivationVersion !==
      baseTraversal.meta.resolvedIdentity.derivationVersion
  ) {
    return false;
  }
  const healthSubjects = healthResult.data.items.map(
    (item) => item.subject.identifier,
  );
  const baseSubjects = baseTraversal.items.map(
    (item) => item.subject.identifier,
  );
  if (healthSubjects.length !== baseSubjects.length) {
    return false;
  }
  return healthSubjects.every(
    (identifier, index) => identifier === baseSubjects[index],
  );
}
