/**
 * The M6-B pilot-feedback artifact's conceptual shape (ADR-0041 §§ 2, 3),
 * corrected for the M6 Criterion-4 finding (M6-C exit-criterion evaluation,
 * `docs/audits/m0-synthetic-boundary-audit.md` § 28.14/§ 29). Session-local,
 * browser-memory-only — never `EvidenceStore`, never a `GraphAssertion`,
 * never read by reconciliation or any query-API route (ADR-0041 § 1, § 4).
 * A human's judgment about Atlast's own output is never confused with
 * Atlast's own computed epistemic state: this module has no awareness of
 * `ServiceEvaluationState`'s internal shape or any other Evidence `detail`
 * — a review record only ever carries the tester's verdict plus the real,
 * already-known identifiers the tester supplies from having inspected that
 * state elsewhere (the existing Trust Inspector/Evidence dereference,
 * unmodified by this correction).
 */

export const PILOT_FEEDBACK_SCHEMA_VERSION = "atlast-m6-pilot-feedback-v2";

/** ADR-0041 § 2: Atlast's own honest computed states are distinct verdicts, never conflated with the tester's own uncertainty. */
export type EntityVerdict =
  | "correctly-discovered"
  | "incorrectly-represented"
  | "missing"
  | "explicitly-unknown"
  | "tester-uncertain";

export type RelationshipVerdict =
  | "correct"
  | "incorrect"
  | "missing"
  | "known-zero"
  | "unknown-insufficient-evidence"
  | "tester-uncertain";

/**
 * Verdicts that truthfully describe a relationship-evaluation subject with
 * no materialized edge (ADR-0039 § 3 cases A "known zero" and D
 * "insufficient evidence") — never `correct`/`incorrect`/`missing`, which
 * all presuppose an actual relationship existing to judge.
 */
export type NonEdgeRelationshipVerdict =
  "known-zero" | "unknown-insufficient-evidence" | "tester-uncertain";

/**
 * Relationship types ADR-0039 currently derives a selector-evaluation
 * result for. Extend only alongside a future ADR-0039 amendment naming a
 * new one — this is not a place to invent relationship kinds.
 */
export type EvaluatedRelationshipType = "selects";

export type ImpactVerdict =
  "correct" | "incorrect" | "incomplete" | "uncertain";

export interface EntityReview {
  /** The existing, stable Atlast identifier — never fabricated. */
  readonly atlastEntityIdentifier: string;
  readonly verdict: EntityVerdict;
  readonly notes: string;
}

/**
 * Addresses a real, materialized Relationship claim (ADR-0039 § 3 cases B
 * "one match" / C "multiple matches") — unchanged from schema v1.
 */
export interface MaterializedRelationshipReview {
  readonly reviewSubject: "materialized-relationship";
  readonly atlastRelationshipIdentifier: string;
  readonly verdict: RelationshipVerdict;
  readonly notes: string;
}

/**
 * Criterion-4 correction: addresses a source entity's relationship-
 * evaluation result directly (ADR-0039 § 3 cases A/D) when Atlast truthfully
 * produced no materialized edge to reference. Never carries a target-entity
 * identifier or a fabricated relationship identifier — there is no edge to
 * name (ADR-0041 §§ 1, 3). The tester supplies only identifiers/values they
 * already know from inspecting the real product elsewhere (the entity's own
 * Trust Inspector already shows this evaluation state, unmodified by this
 * correction); this module never fetches or parses it.
 */
export interface RelationshipEvaluationReview {
  readonly reviewSubject: "relationship-evaluation";
  /** The existing, stable Atlast identifier of the entity whose relationship-evaluation result is being judged — never fabricated. */
  readonly sourceEntityIdentifier: string;
  readonly relationshipType: EvaluatedRelationshipType;
  readonly verdict: NonEdgeRelationshipVerdict;
  readonly notes: string;
}

/**
 * A relationship review addresses exactly one of two truthful subjects — a
 * real materialized edge, or a real non-edge evaluation result — never a
 * synthetic/placeholder relationship invented merely to make a verdict
 * addressable.
 */
export type RelationshipReview =
  MaterializedRelationshipReview | RelationshipEvaluationReview;

export interface ImpactReview {
  readonly originEntityIdentifier: string;
  readonly changeType: "removal" | "degradation" | "interface-change";
  readonly verdict: ImpactVerdict;
  /**
   * A distinct dimension from `verdict` (ADR-0041 § 2): the ranked result
   * may be numerically defensible while still being unexplainable from the
   * Evidence/rule-trace path shown. Never silently folded into `verdict`.
   */
  readonly explanationUsable: boolean;
  readonly notes: string;
}

export interface MissingItem {
  /** A human-entered description of the real object/relationship — never a fabricated Atlast identifier (ADR-0041 § 3). */
  readonly description: string;
  readonly notes: string;
}

export interface DeveloperIntervention {
  readonly occurred: boolean;
  readonly description: string;
}

export interface PilotFeedbackSession {
  readonly schemaVersion: typeof PILOT_FEEDBACK_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly testerRole: string;
  /** The `/health` `datasetMode` this session was reviewed against (ADR-0041 § 3). */
  readonly environmentReference: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly developerIntervention: DeveloperIntervention;
  readonly entityReviews: readonly EntityReview[];
  readonly relationshipReviews: readonly RelationshipReview[];
  readonly impactReviews: readonly ImpactReview[];
  readonly missingEntities: readonly MissingItem[];
  readonly missingRelationships: readonly MissingItem[];
  readonly notes: string;
}

export function createEmptyPilotFeedbackSession(
  sessionId: string,
  startedAt: string,
  environmentReference: string,
): PilotFeedbackSession {
  return {
    schemaVersion: PILOT_FEEDBACK_SCHEMA_VERSION,
    sessionId,
    testerRole: "",
    environmentReference,
    startedAt,
    completedAt: null,
    developerIntervention: { occurred: false, description: "" },
    entityReviews: [],
    relationshipReviews: [],
    impactReviews: [],
    missingEntities: [],
    missingRelationships: [],
    notes: "",
  };
}
