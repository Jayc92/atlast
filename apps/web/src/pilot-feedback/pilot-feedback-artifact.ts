/**
 * The M6-B pilot-feedback artifact's conceptual shape (ADR-0041 §§ 2, 3).
 * Session-local, browser-memory-only — never `EvidenceStore`, never a
 * `GraphAssertion`, never read by reconciliation or any query-API route
 * (ADR-0041 § 1, § 4). A human's judgment about Atlast's own output is
 * never confused with Atlast's own computed epistemic state: this module
 * has no awareness of `ServiceEvaluationState` or any other Evidence
 * `detail` — a review record only ever carries the tester's verdict.
 */

export const PILOT_FEEDBACK_SCHEMA_VERSION = "atlast-m6-pilot-feedback-v1";

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

export type ImpactVerdict =
  "correct" | "incorrect" | "incomplete" | "uncertain";

export interface EntityReview {
  /** The existing, stable Atlast identifier — never fabricated. */
  readonly atlastEntityIdentifier: string;
  readonly verdict: EntityVerdict;
  readonly notes: string;
}

export interface RelationshipReview {
  readonly atlastRelationshipIdentifier: string;
  readonly verdict: RelationshipVerdict;
  readonly notes: string;
}

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
