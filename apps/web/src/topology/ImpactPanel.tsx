/**
 * The M4-C entity-scoped impact panel (ADR-0034; docs/m4-plan.md § 3.5).
 * Query-API-only: consumes the validated `GET
 * /api/v1/entities/{entityId}/impact` envelope exactly as returned — no
 * ranking, reordering, or comparative severity is computed in the browser
 * (ADR-0034 § 2). `changeType` is a presentation lens the caller controls,
 * never a filter or rank input (ADR-0032 § 2); the panel reuses the
 * already-established traversal `direction`/`depth`/`minConfidence` bounds
 * rather than introducing a second bounds control.
 *
 * Evidence-path drill-down reuses the existing M2 `TrustInspector` and
 * Evidence-dereferencing machinery directly (ADR-0034 § 3) — no new
 * Evidence-presentation mechanism is introduced. Which path step is being
 * inspected is deliberately local component state, not URL state: ADR-0034
 * § 1 adds exactly one new canonical URL key (`changeType`), and drill-down
 * is not it.
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import type {
  ImpactChangeType,
  ImpactResultEnvelope,
  SnapshotIdentity,
  SubjectReadResult,
  TraversalDirection,
} from "@atlast/shared";
import { fetchImpact } from "../api/client.ts";
import { buildRequestCacheKey } from "../api/cache.ts";
import { requireResolvedIdentity } from "./session.ts";
import {
  ApiErrorStatus,
  EmptyStatus,
  InternalErrorStatus,
  LoadingStatus,
} from "./QueryStatus.tsx";
import { TrustInspector } from "./TrustInspector.tsx";
import { useAsyncQuery } from "./use-async-query.ts";

export interface ImpactPanelProps {
  readonly originEntityIdentifier: string;
  readonly changeType: ImpactChangeType;
  readonly direction: TraversalDirection;
  readonly depth: number;
  readonly minConfidence: number;
  readonly identity: SnapshotIdentity;
  readonly returnFocus: HTMLElement | null;
  readonly onChangeTypeChange: (changeType: ImpactChangeType) => void;
  readonly onClose: () => void;
}

const CHANGE_TYPE_HYPOTHETICAL_LABEL: Record<ImpactChangeType, string> = {
  removal: "if this Entity were removed",
  degradation: "if this Entity were degraded",
  "interface-change": "if this Entity had an interface change",
};

function pinFields(
  identity: SnapshotIdentity,
): Record<string, string | number> {
  return {
    asOf: identity.asOf,
    horizon: identity.horizon,
    derivationVersion: identity.derivationVersion,
  };
}

function findSubjectByIdentifier(
  items: readonly SubjectReadResult[],
  identifier: string,
): SubjectReadResult | undefined {
  return items.find((item) => item.subject.identifier === identifier);
}

interface InspectedPathStep {
  readonly subject: SubjectReadResult;
  readonly assertionIdentifier: string;
}

export function ImpactPanel({
  originEntityIdentifier,
  changeType,
  direction,
  depth,
  minConfidence,
  identity,
  returnFocus,
  onChangeTypeChange,
  onClose,
}: ImpactPanelProps): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepReturnFocusRef = useRef<HTMLElement | null>(null);
  const [inspectedStep, setInspectedStep] = useState<InspectedPathStep>();

  const impactQueryKey = buildRequestCacheKey({
    operation: "impact",
    identity: pinFields(identity),
    params: {
      entityId: originEntityIdentifier,
      direction,
      depth,
      minConfidence,
      changeType,
    },
  });
  const impactQuery = useAsyncQuery<ImpactResultEnvelope>({
    queryKey: impactQueryKey,
    cache: true,
    run: (signal) =>
      fetchImpact(
        originEntityIdentifier,
        { direction, depth, minConfidence, changeType, identity },
        signal,
      ).then((result) => requireResolvedIdentity(result, identity)),
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, [originEntityIdentifier]);

  const closeStepInspector = (): void => {
    setInspectedStep(undefined);
    window.setTimeout(() => stepReturnFocusRef.current?.focus(), 0);
  };

  return (
    <aside
      className="impact-panel"
      role="dialog"
      aria-labelledby="impact-panel-heading"
    >
      <header className="impact-panel-header">
        <div>
          <p className="topology-kicker">
            Deterministic, evidence-derived analysis
          </p>
          <h2 id="impact-panel-heading" ref={headingRef} tabIndex={-1}>
            Impact analysis
          </h2>
          <p>{originEntityIdentifier}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onClose();
            window.setTimeout(() => returnFocus?.focus(), 0);
          }}
        >
          Close impact panel
        </button>
      </header>

      <p>
        This is a deterministic, evidence-derived analysis over the currently
        loaded synthetic topology — not a prediction, risk score, or
        recommendation.
      </p>

      <label className="impact-panel-change-type">
        Hypothetical change
        <select
          value={changeType}
          onChange={(event) => {
            onChangeTypeChange(event.target.value as ImpactChangeType);
          }}
        >
          <option value="removal">Removal</option>
          <option value="degradation">Degradation</option>
          <option value="interface-change">Interface change</option>
        </select>
      </label>
      <p>
        Asking {CHANGE_TYPE_HYPOTHETICAL_LABEL[changeType]}, using the current
        traversal bounds ({direction}, depth {depth}, minimum confidence{" "}
        {minConfidence}).
      </p>

      {impactQuery.state.status === "loading" && (
        <LoadingStatus label="Computing deterministic impact…" />
      )}
      {impactQuery.state.status === "api-error" && (
        <ApiErrorStatus
          error={impactQuery.state.error}
          onRetry={impactQuery.retry}
        />
      )}
      {impactQuery.state.status === "internal-error" && (
        <InternalErrorStatus onRetry={impactQuery.retry} />
      )}
      {impactQuery.state.status === "loaded" &&
        (() => {
          const { results, items } = impactQuery.state.data.data;
          const { truncated } = impactQuery.state.data.traversal;
          return (
            <>
              {truncated && (
                <p role="status" className="topology-truncation-notice">
                  This traversal reached its bounded result budget. This ranked
                  list may be incomplete beyond the loaded neighborhood — it is
                  never a complete blast radius.
                </p>
              )}
              {results.length === 0 ? (
                <EmptyStatus message="No reachable entities meet these bounds." />
              ) : (
                <ol className="impact-result-list">
                  {results.map((result) => (
                    <li key={result.entityIdentifier} className="impact-result">
                      <h3>{result.entityIdentifier}</h3>
                      <dl className="trust-fields">
                        <dt>Rank score</dt>
                        <dd>
                          {result.rankScore} — uncalibrated synthetic score
                        </dd>
                        <dt>Path length</dt>
                        <dd>
                          {result.pathEdgeCount} edge
                          {result.pathEdgeCount === 1 ? "" : "s"}
                        </dd>
                      </dl>
                      <ol className="impact-path-steps">
                        {result.path.map((step, index) => {
                          const relationship = findSubjectByIdentifier(
                            items,
                            step.relationshipIdentifier,
                          );
                          return (
                            <li
                              key={`${result.entityIdentifier}-${String(index)}`}
                            >
                              {step.sourceEntityIdentifier} →{" "}
                              {step.targetEntityIdentifier} via{" "}
                              {step.relationshipIdentifier}
                              {relationship === undefined ? (
                                <span>
                                  {" "}
                                  — evidence for this step could not be located
                                  in the loaded traversal.
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    stepReturnFocusRef.current =
                                      document.activeElement instanceof
                                      HTMLElement
                                        ? document.activeElement
                                        : null;
                                    setInspectedStep({
                                      subject: relationship,
                                      assertionIdentifier:
                                        step.assertionIdentifier,
                                    });
                                  }}
                                >
                                  Inspect evidence for {result.entityIdentifier}{" "}
                                  step {index + 1}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </li>
                  ))}
                </ol>
              )}
            </>
          );
        })()}

      {inspectedStep !== undefined && (
        <TrustInspector
          selection={inspectedStep}
          snapshotIdentity={identity}
          returnFocus={stepReturnFocusRef.current}
          onClose={closeStepInspector}
        />
      )}
    </aside>
  );
}
