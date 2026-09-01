/**
 * The M6-B minimum usable pilot-feedback review surface (ADR-0041). A
 * session-local, browser-memory-only review tool — never a server route,
 * never Evidence, never a `GraphAssertion` mutation (ADR-0041 §§ 1, 4).
 * Deliberately small: one panel, four short forms, a running tally, and
 * one explicit export action — not a dashboard.
 *
 * Pre-M6-C readiness fix: `feedback` (the review session) is owned by this
 * component's caller (`TopologyShell`), never created here — this
 * component only owns the transient, in-progress form-draft fields below,
 * which are legitimately reset each time the panel is (re)opened. The
 * caller's session persists across this component unmounting when the
 * panel is closed, so every already-recorded judgment survives close and
 * reopen.
 */
import { useId, useState, type ReactElement } from "react";
import type {
  EntityVerdict,
  EvaluatedRelationshipType,
  ImpactVerdict,
  NonEdgeRelationshipVerdict,
  RelationshipVerdict,
} from "./pilot-feedback-artifact.ts";
import { exportPilotFeedbackSession } from "./export-pilot-feedback.ts";
import type { UsePilotFeedbackSessionResult } from "./use-pilot-feedback-session.ts";

const ENTITY_VERDICTS: readonly EntityVerdict[] = [
  "correctly-discovered",
  "incorrectly-represented",
  "missing",
  "explicitly-unknown",
  "tester-uncertain",
];

/** Verdicts for a materialized relationship review only — unchanged from schema v1. */
const RELATIONSHIP_VERDICTS: readonly RelationshipVerdict[] = [
  "correct",
  "incorrect",
  "missing",
  "known-zero",
  "unknown-insufficient-evidence",
  "tester-uncertain",
];

/**
 * Criterion-4 correction: the two truthful subjects a relationship review
 * can address (`pilot-feedback-artifact.ts`'s `RelationshipReview` union).
 */
type RelationshipReviewSubject =
  "materialized-relationship" | "relationship-evaluation";

const RELATIONSHIP_REVIEW_SUBJECTS: readonly RelationshipReviewSubject[] = [
  "materialized-relationship",
  "relationship-evaluation",
];

/** Verdicts that truthfully describe a non-edge relationship-evaluation subject. */
const NON_EDGE_RELATIONSHIP_VERDICTS: readonly NonEdgeRelationshipVerdict[] = [
  "known-zero",
  "unknown-insufficient-evidence",
  "tester-uncertain",
];

const EVALUATED_RELATIONSHIP_TYPES: readonly EvaluatedRelationshipType[] = [
  "selects",
];

const IMPACT_VERDICTS: readonly ImpactVerdict[] = [
  "correct",
  "incorrect",
  "incomplete",
  "uncertain",
];

const CHANGE_TYPES = ["removal", "degradation", "interface-change"] as const;

export interface PilotFeedbackPanelProps {
  readonly feedback: UsePilotFeedbackSessionResult;
  readonly onClose: () => void;
}

export function PilotFeedbackPanel({
  feedback,
  onClose,
}: PilotFeedbackPanelProps): ReactElement {
  const headingId = useId();

  const [entityIdentifier, setEntityIdentifier] = useState("");
  const [entityVerdict, setEntityVerdict] = useState<EntityVerdict>(
    ENTITY_VERDICTS[0] ?? "tester-uncertain",
  );
  const [entityNotes, setEntityNotes] = useState("");

  const [relationshipReviewSubject, setRelationshipReviewSubject] =
    useState<RelationshipReviewSubject>(
      RELATIONSHIP_REVIEW_SUBJECTS[0] ?? "materialized-relationship",
    );
  const [relationshipIdentifier, setRelationshipIdentifier] = useState("");
  const [relationshipVerdict, setRelationshipVerdict] =
    useState<RelationshipVerdict>(
      RELATIONSHIP_VERDICTS[0] ?? "tester-uncertain",
    );
  const [
    relationshipSourceEntityIdentifier,
    setRelationshipSourceEntityIdentifier,
  ] = useState("");
  const [relationshipType, setRelationshipType] =
    useState<EvaluatedRelationshipType>(
      EVALUATED_RELATIONSHIP_TYPES[0] ?? "selects",
    );
  const [nonEdgeRelationshipVerdict, setNonEdgeRelationshipVerdict] =
    useState<NonEdgeRelationshipVerdict>(
      NON_EDGE_RELATIONSHIP_VERDICTS[0] ?? "tester-uncertain",
    );
  const [relationshipNotes, setRelationshipNotes] = useState("");

  const [impactOrigin, setImpactOrigin] = useState("");
  const [impactChangeType, setImpactChangeType] =
    useState<(typeof CHANGE_TYPES)[number]>("removal");
  const [impactVerdict, setImpactVerdict] = useState<ImpactVerdict>(
    IMPACT_VERDICTS[0] ?? "uncertain",
  );
  const [impactExplanationUsable, setImpactExplanationUsable] = useState(true);
  const [impactNotes, setImpactNotes] = useState("");

  const [missingEntityDescription, setMissingEntityDescription] = useState("");
  const [missingRelationshipDescription, setMissingRelationshipDescription] =
    useState("");

  function submitEntityReview(): void {
    if (entityIdentifier.trim() === "") {
      return;
    }
    feedback.addEntityReview({
      atlastEntityIdentifier: entityIdentifier.trim(),
      verdict: entityVerdict,
      notes: entityNotes,
    });
    setEntityIdentifier("");
    setEntityNotes("");
  }

  function submitRelationshipReview(): void {
    if (relationshipReviewSubject === "materialized-relationship") {
      if (relationshipIdentifier.trim() === "") {
        return;
      }
      feedback.addRelationshipReview({
        reviewSubject: "materialized-relationship",
        atlastRelationshipIdentifier: relationshipIdentifier.trim(),
        verdict: relationshipVerdict,
        notes: relationshipNotes,
      });
      setRelationshipIdentifier("");
    } else {
      if (relationshipSourceEntityIdentifier.trim() === "") {
        return;
      }
      feedback.addRelationshipReview({
        reviewSubject: "relationship-evaluation",
        sourceEntityIdentifier: relationshipSourceEntityIdentifier.trim(),
        relationshipType,
        verdict: nonEdgeRelationshipVerdict,
        notes: relationshipNotes,
      });
      setRelationshipSourceEntityIdentifier("");
    }
    setRelationshipNotes("");
  }

  function submitImpactReview(): void {
    if (impactOrigin.trim() === "") {
      return;
    }
    feedback.addImpactReview({
      originEntityIdentifier: impactOrigin.trim(),
      changeType: impactChangeType,
      verdict: impactVerdict,
      explanationUsable: impactExplanationUsable,
      notes: impactNotes,
    });
    setImpactOrigin("");
    setImpactNotes("");
  }

  function submitMissingEntity(): void {
    if (missingEntityDescription.trim() === "") {
      return;
    }
    feedback.addMissingEntity({
      description: missingEntityDescription.trim(),
      notes: "",
    });
    setMissingEntityDescription("");
  }

  function submitMissingRelationship(): void {
    if (missingRelationshipDescription.trim() === "") {
      return;
    }
    feedback.addMissingRelationship({
      description: missingRelationshipDescription.trim(),
      notes: "",
    });
    setMissingRelationshipDescription("");
  }

  return (
    <aside
      className="pilot-feedback-panel"
      role="dialog"
      aria-labelledby={headingId}
    >
      <header className="pilot-feedback-header">
        <h2 id={headingId}>Pilot feedback (M6-B, ADR-0041)</h2>
        <button type="button" onClick={onClose}>
          Close pilot feedback
        </button>
      </header>
      <p>
        Session {feedback.session.sessionId} — environment:{" "}
        {feedback.session.environmentReference}. This record is session-local
        only; it never mutates Atlast's own Evidence or graph state.
      </p>

      <label htmlFor={`${headingId}-tester-role`}>Tester role</label>
      <input
        id={`${headingId}-tester-role`}
        type="text"
        value={feedback.session.testerRole}
        onChange={(event) => {
          feedback.setTesterRole(event.target.value);
        }}
        placeholder="e.g. Engineer, Platform team"
      />

      <label htmlFor={`${headingId}-session-notes`}>
        Session notes (applies to the whole review, not one judgment)
      </label>
      <textarea
        id={`${headingId}-session-notes`}
        value={feedback.session.notes}
        onChange={(event) => {
          feedback.setNotes(event.target.value);
        }}
        placeholder="Overall observations about this review session"
      />

      <form
        aria-label="Record an entity judgment"
        onSubmit={(event) => {
          event.preventDefault();
          submitEntityReview();
        }}
      >
        <h3>Entity judgment</h3>
        <label htmlFor={`${headingId}-entity-id`}>
          Atlast entity identifier
        </label>
        <input
          id={`${headingId}-entity-id`}
          type="text"
          value={entityIdentifier}
          onChange={(event) => {
            setEntityIdentifier(event.target.value);
          }}
        />
        <label htmlFor={`${headingId}-entity-verdict`}>Verdict</label>
        <select
          id={`${headingId}-entity-verdict`}
          value={entityVerdict}
          onChange={(event) => {
            setEntityVerdict(event.target.value as EntityVerdict);
          }}
        >
          {ENTITY_VERDICTS.map((verdict) => (
            <option key={verdict} value={verdict}>
              {verdict}
            </option>
          ))}
        </select>
        <label htmlFor={`${headingId}-entity-notes`}>Notes (optional)</label>
        <input
          id={`${headingId}-entity-notes`}
          type="text"
          value={entityNotes}
          onChange={(event) => {
            setEntityNotes(event.target.value);
          }}
        />
        <button type="submit">Record entity judgment</button>
      </form>

      <form
        aria-label="Record a relationship judgment"
        onSubmit={(event) => {
          event.preventDefault();
          submitRelationshipReview();
        }}
      >
        <h3>Relationship judgment</h3>
        <label htmlFor={`${headingId}-relationship-review-subject`}>
          Review subject
        </label>
        <select
          id={`${headingId}-relationship-review-subject`}
          value={relationshipReviewSubject}
          onChange={(event) => {
            setRelationshipReviewSubject(
              event.target.value as RelationshipReviewSubject,
            );
          }}
        >
          <option value="materialized-relationship">
            Materialized relationship (a real edge exists)
          </option>
          <option value="relationship-evaluation">
            Relationship evaluation (Atlast found no matching target, e.g. a
            known-zero Service selector)
          </option>
        </select>
        {relationshipReviewSubject === "materialized-relationship" ? (
          <>
            <label htmlFor={`${headingId}-relationship-id`}>
              Atlast relationship identifier
            </label>
            <input
              id={`${headingId}-relationship-id`}
              type="text"
              value={relationshipIdentifier}
              onChange={(event) => {
                setRelationshipIdentifier(event.target.value);
              }}
            />
            <label htmlFor={`${headingId}-relationship-verdict`}>Verdict</label>
            <select
              id={`${headingId}-relationship-verdict`}
              value={relationshipVerdict}
              onChange={(event) => {
                setRelationshipVerdict(
                  event.target.value as RelationshipVerdict,
                );
              }}
            >
              {RELATIONSHIP_VERDICTS.map((verdict) => (
                <option key={verdict} value={verdict}>
                  {verdict}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <p>
              For a relationship type Atlast evaluated but found no matching
              target for — e.g. a Service selector that matched zero Pods, or
              one Atlast could not safely evaluate this cycle. Inspect the
              source entity in the Trust Inspector first to confirm the real
              evaluation state; never invent a Pod or relationship here.
            </p>
            <label htmlFor={`${headingId}-relationship-source-entity-id`}>
              Source entity identifier
            </label>
            <input
              id={`${headingId}-relationship-source-entity-id`}
              type="text"
              value={relationshipSourceEntityIdentifier}
              onChange={(event) => {
                setRelationshipSourceEntityIdentifier(event.target.value);
              }}
            />
            <label htmlFor={`${headingId}-relationship-type`}>
              Relationship type
            </label>
            <select
              id={`${headingId}-relationship-type`}
              value={relationshipType}
              onChange={(event) => {
                setRelationshipType(
                  event.target.value as EvaluatedRelationshipType,
                );
              }}
            >
              {EVALUATED_RELATIONSHIP_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <label htmlFor={`${headingId}-relationship-evaluation-verdict`}>
              Verdict
            </label>
            <select
              id={`${headingId}-relationship-evaluation-verdict`}
              value={nonEdgeRelationshipVerdict}
              onChange={(event) => {
                setNonEdgeRelationshipVerdict(
                  event.target.value as NonEdgeRelationshipVerdict,
                );
              }}
            >
              {NON_EDGE_RELATIONSHIP_VERDICTS.map((verdict) => (
                <option key={verdict} value={verdict}>
                  {verdict}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor={`${headingId}-relationship-notes`}>
          Notes (optional)
        </label>
        <input
          id={`${headingId}-relationship-notes`}
          type="text"
          value={relationshipNotes}
          onChange={(event) => {
            setRelationshipNotes(event.target.value);
          }}
        />
        <button type="submit">Record relationship judgment</button>
      </form>

      <form
        aria-label="Record an impact judgment"
        onSubmit={(event) => {
          event.preventDefault();
          submitImpactReview();
        }}
      >
        <h3>Impact judgment</h3>
        <label htmlFor={`${headingId}-impact-origin`}>
          Origin entity identifier
        </label>
        <input
          id={`${headingId}-impact-origin`}
          type="text"
          value={impactOrigin}
          onChange={(event) => {
            setImpactOrigin(event.target.value);
          }}
        />
        <label htmlFor={`${headingId}-impact-change-type`}>Change type</label>
        <select
          id={`${headingId}-impact-change-type`}
          value={impactChangeType}
          onChange={(event) => {
            setImpactChangeType(
              event.target.value as (typeof CHANGE_TYPES)[number],
            );
          }}
        >
          {CHANGE_TYPES.map((changeType) => (
            <option key={changeType} value={changeType}>
              {changeType}
            </option>
          ))}
        </select>
        <label htmlFor={`${headingId}-impact-verdict`}>Verdict</label>
        <select
          id={`${headingId}-impact-verdict`}
          value={impactVerdict}
          onChange={(event) => {
            setImpactVerdict(event.target.value as ImpactVerdict);
          }}
        >
          {IMPACT_VERDICTS.map((verdict) => (
            <option key={verdict} value={verdict}>
              {verdict}
            </option>
          ))}
        </select>
        <label htmlFor={`${headingId}-impact-explanation-usable`}>
          <input
            id={`${headingId}-impact-explanation-usable`}
            type="checkbox"
            checked={impactExplanationUsable}
            onChange={(event) => {
              setImpactExplanationUsable(event.target.checked);
            }}
          />
          The Why/explanation path was usable (distinct from whether the ranking
          itself was correct)
        </label>
        <label htmlFor={`${headingId}-impact-notes`}>Notes (optional)</label>
        <input
          id={`${headingId}-impact-notes`}
          type="text"
          value={impactNotes}
          onChange={(event) => {
            setImpactNotes(event.target.value);
          }}
        />
        <button type="submit">Record impact judgment</button>
      </form>

      <form
        aria-label="Record a missing entity"
        onSubmit={(event) => {
          event.preventDefault();
          submitMissingEntity();
        }}
      >
        <h3>Missing entity</h3>
        <label htmlFor={`${headingId}-missing-entity`}>
          Describe the real object Atlast never discovered (never an Atlast
          identifier)
        </label>
        <input
          id={`${headingId}-missing-entity`}
          type="text"
          value={missingEntityDescription}
          onChange={(event) => {
            setMissingEntityDescription(event.target.value);
          }}
        />
        <button type="submit">Record missing entity</button>
      </form>

      <form
        aria-label="Record a missing relationship"
        onSubmit={(event) => {
          event.preventDefault();
          submitMissingRelationship();
        }}
      >
        <h3>Missing relationship</h3>
        <label htmlFor={`${headingId}-missing-relationship`}>
          Describe the real relationship Atlast never discovered
        </label>
        <input
          id={`${headingId}-missing-relationship`}
          type="text"
          value={missingRelationshipDescription}
          onChange={(event) => {
            setMissingRelationshipDescription(event.target.value);
          }}
        />
        <button type="submit">Record missing relationship</button>
      </form>

      <section aria-label="Recorded judgments so far">
        <h3>Recorded so far</h3>
        <ul>
          <li>Entity judgments: {feedback.session.entityReviews.length}</li>
          <li>
            Relationship judgments:{" "}
            {feedback.session.relationshipReviews.length}
          </li>
          <li>Impact judgments: {feedback.session.impactReviews.length}</li>
          <li>Missing entities: {feedback.session.missingEntities.length}</li>
          <li>
            Missing relationships:{" "}
            {feedback.session.missingRelationships.length}
          </li>
        </ul>
      </section>

      <button
        type="button"
        onClick={() => {
          const completedAt = new Date().toISOString();
          feedback.markCompleted(completedAt);
          exportPilotFeedbackSession({ ...feedback.session, completedAt });
        }}
      >
        Export pilot JSON
      </button>
    </aside>
  );
}
