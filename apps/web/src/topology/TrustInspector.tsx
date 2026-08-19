import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type {
  AssertionReadResult,
  CanonicalClaim,
  Evidence,
  Freshness,
  SnapshotIdentity,
  SubjectReadResult,
} from "@atlast/shared";
import { useEvidenceDetails } from "./use-evidence-details.ts";

export interface TrustInspectorProps {
  readonly selection: {
    readonly subject: SubjectReadResult;
    readonly assertionIdentifier?: string;
  };
  readonly snapshotIdentity: SnapshotIdentity;
  readonly traversalTruncated?: boolean;
  readonly returnFocus: HTMLElement | null;
  readonly onClose: () => void;
  /**
   * The M4-C impact-panel entry point (ADR-0034 § 1/§ 6). Omitted by any
   * caller that only ever inspects Relationship subjects (e.g.
   * `TopologyPage`); rendered only when the inspected subject is an Entity.
   */
  readonly onAnalyzeImpact?: (entityIdentifier: string) => void;
}

function confidenceText(confidence: number): string {
  return `${String(confidence)} — uncalibrated synthetic score`;
}

function freshnessText(freshness: Freshness, snapshotAsOf: string): string {
  const explanation = {
    current: "supporting Evidence is current",
    stale: "supporting Evidence is stale",
    historical: "supporting Evidence is historical",
  }[freshness];
  return `${freshness} — ${explanation} at snapshot ${snapshotAsOf}`;
}

function validityText(validity: {
  readonly validFrom: string;
  readonly validTo?: string | undefined;
}): string {
  return validity.validTo === undefined
    ? `[${validity.validFrom}, no recorded end)`
    : `[${validity.validFrom}, ${validity.validTo})`;
}

function ClaimFields({
  claim,
}: {
  readonly claim: CanonicalClaim;
}): ReactElement {
  return claim.claimKind === "entity" ? (
    <dl className="trust-fields">
      <dt>Claim kind</dt>
      <dd>entity</dd>
      <dt>Entity type</dt>
      <dd>{claim.entityType}</dd>
    </dl>
  ) : (
    <dl className="trust-fields">
      <dt>Claim kind</dt>
      <dd>relationship</dd>
      <dt>Relationship type</dt>
      <dd>{claim.relationshipType}</dd>
      <dt>Source</dt>
      <dd>{claim.sourceEntityIdentifier}</dd>
      <dt>Target</dt>
      <dd>{claim.targetEntityIdentifier}</dd>
    </dl>
  );
}

function EvidenceRecord({
  evidence,
}: {
  readonly evidence: Evidence;
}): ReactElement {
  return (
    <dl className="trust-fields evidence-record">
      <dt>Observed</dt>
      <dd>{evidence.observedAt}</dd>
      <dt>Recorded</dt>
      <dd>{evidence.recordedAt}</dd>
      <dt>Sequence</dt>
      <dd>{evidence.recordedSequence}</dd>
      <dt>Source</dt>
      <dd>
        {evidence.sourceScopedIdentity.source} /{" "}
        {evidence.sourceScopedIdentity.sourceNativeId}
      </dd>
      <dt>Observation</dt>
      <dd>{evidence.observation.observationKind}</dd>
      <dt>Detail</dt>
      <dd>
        <code>{JSON.stringify(evidence.detail)}</code>
      </dd>
    </dl>
  );
}

function collectEvidenceIdentifiers(
  assertions: readonly AssertionReadResult[],
): readonly string[] {
  const identifiers = new Set<string>();
  for (const { revision } of assertions) {
    for (const identifier of revision.provenance) {
      identifiers.add(identifier);
    }
    for (const rule of revision.ruleTrace) {
      for (const identifier of rule.evidenceIdentifiers) {
        identifiers.add(identifier);
      }
    }
    if (revision.conflictState.status === "conflicted") {
      for (const competing of revision.conflictState.competingClaims) {
        for (const identifier of competing.provenance) {
          identifiers.add(identifier);
        }
      }
    }
  }
  return [...identifiers].sort();
}

function AssertionTrust({
  assertion,
  snapshotIdentity,
  headingIdPrefix,
}: {
  readonly assertion: AssertionReadResult;
  readonly snapshotIdentity: SnapshotIdentity;
  /**
   * Scopes this assertion's heading id to the enclosing `TrustInspector`
   * instance. The impact panel's evidence drill-down can mount a second
   * `TrustInspector` while the page's own trust inspector is already open
   * (ADR-0034 § 3); without this prefix, two dialogs inspecting the same
   * assertion identifier would emit duplicate DOM ids and break
   * `aria-labelledby` resolution for the second one.
   */
  readonly headingIdPrefix: string;
}): ReactElement {
  const { revision } = assertion;
  const headingId = `${headingIdPrefix}-${revision.identifier}`;
  return (
    <article className="trust-assertion" aria-labelledby={headingId}>
      <h3 id={headingId}>{revision.identifier}</h3>
      <ClaimFields claim={revision.claim} />
      <dl className="trust-fields">
        <dt>Confidence</dt>
        <dd>{confidenceText(revision.confidence)}</dd>
        <dt>Freshness</dt>
        <dd>{freshnessText(assertion.freshness, snapshotIdentity.asOf)}</dd>
        <dt>Validity</dt>
        <dd>{validityText(revision.validity)}</dd>
        <dt>Conflict</dt>
        <dd>{revision.conflictState.status}</dd>
        <dt>Ambiguity</dt>
        <dd>{revision.ambiguityState.status}</dd>
      </dl>

      {revision.conflictState.status === "conflicted" && (
        <section aria-label="Competing claims">
          <h4>Every competing claim</h4>
          {revision.conflictState.competingClaims.map((competing, index) => (
            <article
              className="trust-competing"
              key={`${revision.identifier}-${String(index)}`}
            >
              <h5>Competing claim {index + 1}</h5>
              <ClaimFields claim={competing.claim} />
              <p>Confidence: {confidenceText(competing.confidence)}</p>
              <p>Evidence: {competing.provenance.join(", ")}</p>
            </article>
          ))}
        </section>
      )}

      {revision.ambiguityState.status === "ambiguous" && (
        <section aria-label="Near matches">
          <h4>Every near match</h4>
          <ul>
            {revision.ambiguityState.nearMatches.map((nearMatch) => (
              <li key={nearMatch.nearMatchSubjectIdentifier}>
                <strong>{nearMatch.nearMatchSubjectIdentifier}</strong>:{" "}
                {nearMatch.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Ordered rule trace">
        <h4>Ordered rule trace</h4>
        <ol>
          {revision.ruleTrace.map((rule, index) => (
            <li key={`${rule.ruleName}-${String(index)}`}>
              <strong>{rule.ruleName}</strong>
              {rule.detail === undefined ? "" : `: ${rule.detail}`} — Evidence{" "}
              {rule.evidenceIdentifiers.join(", ")}
            </li>
          ))}
        </ol>
      </section>
      <p>Assertion provenance: {revision.provenance.join(", ")}</p>
    </article>
  );
}

export function TrustInspector({
  selection,
  snapshotIdentity,
  traversalTruncated = false,
  returnFocus,
  onClose,
  onAnalyzeImpact,
}: TrustInspectorProps): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Scopes every id this instance renders so a second, simultaneously-open
  // `TrustInspector` (the impact panel's evidence drill-down, ADR-0034 § 3)
  // never collides with this one's DOM ids or `aria-labelledby` targets.
  const instanceId = useId();
  const headingId = `${instanceId}-trust-inspector-heading`;
  const snapshotHeadingId = `${instanceId}-trust-snapshot-heading`;
  const evidenceHeadingId = `${instanceId}-trust-evidence-heading`;
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const orderedAssertions = useMemo(
    () =>
      [...selection.subject.assertions].sort((left, right) => {
        if (left.revision.identifier === selection.assertionIdentifier) {
          return -1;
        }
        if (right.revision.identifier === selection.assertionIdentifier) {
          return 1;
        }
        return left.revision.identifier.localeCompare(
          right.revision.identifier,
        );
      }),
    [selection],
  );
  const evidenceIdentifiers = useMemo(
    () => collectEvidenceIdentifiers(orderedAssertions),
    [orderedAssertions],
  );
  const evidence = useEvidenceDetails(evidenceIdentifiers);

  useEffect(() => {
    headingRef.current?.focus();
  }, [selection.subject.subject.identifier]);

  return (
    <aside
      className="trust-inspector"
      role="dialog"
      aria-labelledby={headingId}
    >
      <header className="trust-inspector-header">
        <div>
          <p className="topology-kicker">Why Atlast believes this</p>
          <h2 id={headingId} ref={headingRef} tabIndex={-1}>
            Trust inspector
          </h2>
          <p>{selection.subject.subject.identifier}</p>
        </div>
        <div className="trust-inspector-actions">
          {onAnalyzeImpact !== undefined &&
            selection.subject.subject.subjectKind === "entity" && (
              <button
                type="button"
                onClick={() => {
                  onAnalyzeImpact(selection.subject.subject.identifier);
                }}
              >
                Analyze impact on {selection.subject.subject.identifier}
              </button>
            )}
          <button
            type="button"
            onClick={() => {
              onClose();
              window.setTimeout(() => returnFocus?.focus(), 0);
            }}
          >
            Close inspector
          </button>
        </div>
      </header>

      {traversalTruncated && (
        <p className="topology-truncation-notice" role="status">
          The loaded traversal is truncated. This inspector is complete for the
          selected subject returned by the API, not for subjects outside the
          traversal boundary.
        </p>
      )}

      <p>
        {orderedAssertions.length} visible assertion revision
        {orderedAssertions.length === 1 ? "" : "s"}; none is treated as a
        winner.
      </p>
      <section aria-labelledby={snapshotHeadingId}>
        <h3 id={snapshotHeadingId}>Snapshot identity</h3>
        <dl className="trust-fields">
          <dt>As of</dt>
          <dd>{snapshotIdentity.asOf}</dd>
          <dt>Horizon</dt>
          <dd>{snapshotIdentity.horizon}</dd>
          <dt>Derivation version</dt>
          <dd>{snapshotIdentity.derivationVersion}</dd>
        </dl>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(JSON.stringify(snapshotIdentity))
              .then(() => {
                setCopyStatus("copied");
              })
              .catch(() => {
                setCopyStatus("failed");
              });
          }}
        >
          Copy snapshot identity
        </button>
        {copyStatus === "copied" && (
          <p role="status">Snapshot identity copied.</p>
        )}
        {copyStatus === "failed" && (
          <p role="alert">Snapshot identity could not be copied.</p>
        )}
      </section>
      {orderedAssertions.map((assertion) => (
        <AssertionTrust
          key={assertion.revision.identifier}
          assertion={assertion}
          snapshotIdentity={snapshotIdentity}
          headingIdPrefix={instanceId}
        />
      ))}

      <section aria-labelledby={evidenceHeadingId}>
        <h3 id={evidenceHeadingId}>Dereferenced Evidence</h3>
        {evidenceIdentifiers.map((identifier) => {
          const state = evidence.states[identifier] ?? {
            status: "loading" as const,
          };
          return (
            <article className="trust-evidence" key={identifier}>
              <h4>{identifier}</h4>
              {state.status === "loading" && (
                <p role="status">Loading this Evidence citation…</p>
              )}
              {state.status === "loaded" && (
                <EvidenceRecord evidence={state.data.data} />
              )}
              {state.status === "api-error" && (
                <div role="alert">
                  <p>{state.error.message}</p>
                  <button type="button" onClick={evidence.retry}>
                    Try Evidence again
                  </button>
                </div>
              )}
              {state.status === "internal-error" && (
                <div role="alert">
                  <p>
                    This Evidence citation could not be loaded. The failure
                    detail is hidden because it is not safe to show directly.
                  </p>
                  <button type="button" onClick={evidence.retry}>
                    Try Evidence again
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </aside>
  );
}
