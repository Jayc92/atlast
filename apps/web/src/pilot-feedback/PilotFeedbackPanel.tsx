/**
 * The M6-B minimum usable pilot-feedback review surface (ADR-0041). A
 * session-local, browser-memory-only review tool — never a server route,
 * never Evidence, never a `GraphAssertion` mutation (ADR-0041 §§ 1, 4).
 * Deliberately small: one panel, four short forms, a running tally, and
 * one explicit export action — not a dashboard.
 */
import { useId, useState, type ReactElement } from "react";
import type {
  EntityVerdict,
  ImpactVerdict,
  RelationshipVerdict,
} from "./pilot-feedback-artifact.ts";
import { exportPilotFeedbackSession } from "./export-pilot-feedback.ts";
import { usePilotFeedbackSession } from "./use-pilot-feedback-session.ts";

const ENTITY_VERDICTS: readonly EntityVerdict[] = [
  "correctly-discovered",
  "incorrectly-represented",
  "missing",
  "explicitly-unknown",
  "tester-uncertain",
];

const RELATIONSHIP_VERDICTS: readonly RelationshipVerdict[] = [
  "correct",
  "incorrect",
  "missing",
  "known-zero",
  "unknown-insufficient-evidence",
  "tester-uncertain",
];

const IMPACT_VERDICTS: readonly ImpactVerdict[] = [
  "correct",
  "incorrect",
  "incomplete",
  "uncertain",
];

const CHANGE_TYPES = ["removal", "degradation", "interface-change"] as const;

export interface PilotFeedbackPanelProps {
  readonly environmentReference: string;
  readonly onClose: () => void;
}

export function PilotFeedbackPanel({
  environmentReference,
  onClose,
}: PilotFeedbackPanelProps): ReactElement {
  const headingId = useId();
  const [sessionId] = useState(() => crypto.randomUUID());
  const [startedAt] = useState(() => new Date().toISOString());
  const feedback = usePilotFeedbackSession(
    sessionId,
    startedAt,
    environmentReference,
  );

  const [entityIdentifier, setEntityIdentifier] = useState("");
  const [entityVerdict, setEntityVerdict] = useState<EntityVerdict>(
    ENTITY_VERDICTS[0] ?? "tester-uncertain",
  );
  const [entityNotes, setEntityNotes] = useState("");

  const [relationshipIdentifier, setRelationshipIdentifier] = useState("");
  const [relationshipVerdict, setRelationshipVerdict] =
    useState<RelationshipVerdict>(
      RELATIONSHIP_VERDICTS[0] ?? "tester-uncertain",
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
    if (relationshipIdentifier.trim() === "") {
      return;
    }
    feedback.addRelationshipReview({
      atlastRelationshipIdentifier: relationshipIdentifier.trim(),
      verdict: relationshipVerdict,
      notes: relationshipNotes,
    });
    setRelationshipIdentifier("");
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
        Session {sessionId} — environment: {environmentReference}. This record
        is session-local only; it never mutates Atlast's own Evidence or graph
        state.
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
            setRelationshipVerdict(event.target.value as RelationshipVerdict);
          }}
        >
          {RELATIONSHIP_VERDICTS.map((verdict) => (
            <option key={verdict} value={verdict}>
              {verdict}
            </option>
          ))}
        </select>
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
