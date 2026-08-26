/**
 * Session-local pilot-feedback state (ADR-0041 §§ 1, 4, 5). Lives entirely
 * in this hook's own `useState` — never persisted to a server, never
 * written through any domain-mutation API, and gone the moment the page
 * unmounts unless explicitly exported first (ADR-0041 § 5's "session-local
 * review state → explicit export" lifecycle).
 */
import { useState } from "react";
import type {
  EntityReview,
  ImpactReview,
  MissingItem,
  PilotFeedbackSession,
  RelationshipReview,
} from "./pilot-feedback-artifact.ts";
import { createEmptyPilotFeedbackSession } from "./pilot-feedback-artifact.ts";

export interface UsePilotFeedbackSessionResult {
  readonly session: PilotFeedbackSession;
  readonly addEntityReview: (review: EntityReview) => void;
  readonly addRelationshipReview: (review: RelationshipReview) => void;
  readonly addImpactReview: (review: ImpactReview) => void;
  readonly addMissingEntity: (item: MissingItem) => void;
  readonly addMissingRelationship: (item: MissingItem) => void;
  readonly setTesterRole: (testerRole: string) => void;
  readonly setNotes: (notes: string) => void;
  readonly setDeveloperIntervention: (
    occurred: boolean,
    description: string,
  ) => void;
  readonly markCompleted: (completedAt: string) => void;
}

export function usePilotFeedbackSession(
  sessionId: string,
  startedAt: string,
  environmentReference: string,
): UsePilotFeedbackSessionResult {
  const [session, setSession] = useState<PilotFeedbackSession>(() =>
    createEmptyPilotFeedbackSession(sessionId, startedAt, environmentReference),
  );

  return {
    session,
    addEntityReview: (review) => {
      setSession((current) => ({
        ...current,
        entityReviews: [...current.entityReviews, review],
      }));
    },
    addRelationshipReview: (review) => {
      setSession((current) => ({
        ...current,
        relationshipReviews: [...current.relationshipReviews, review],
      }));
    },
    addImpactReview: (review) => {
      setSession((current) => ({
        ...current,
        impactReviews: [...current.impactReviews, review],
      }));
    },
    addMissingEntity: (item) => {
      setSession((current) => ({
        ...current,
        missingEntities: [...current.missingEntities, item],
      }));
    },
    addMissingRelationship: (item) => {
      setSession((current) => ({
        ...current,
        missingRelationships: [...current.missingRelationships, item],
      }));
    },
    setTesterRole: (testerRole) => {
      setSession((current) => ({ ...current, testerRole }));
    },
    setNotes: (notes) => {
      setSession((current) => ({ ...current, notes }));
    },
    setDeveloperIntervention: (occurred, description) => {
      setSession((current) => ({
        ...current,
        developerIntervention: { occurred, description },
      }));
    },
    markCompleted: (completedAt) => {
      setSession((current) => ({ ...current, completedAt }));
    },
  };
}
