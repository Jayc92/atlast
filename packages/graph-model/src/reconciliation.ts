/**
 * The `m1-v1` reconciliation engine (accepted ADR-0022 §§ 5–12): one pure,
 * deterministic function from (validated Evidence, explicit horizon, policy)
 * to stable subjects plus the complete GraphAssertion revision history
 * derivable at that horizon.
 *
 * The derivation model is event-time, not horizon-wide: Evidence is selected
 * at the pinned horizon, sorted by the ADR-0016 total order, grouped into
 * atomic equal-`observedAt` steps, and the full subject/assertion state —
 * standing support, standing-source-filtered provenance, corroboration,
 * confidence, conflict, ambiguity — is recomputed after every step. Any
 * identifying-content change closes the previous revision and opens a
 * successor at that event timestamp; a claim value that loses its last
 * standing source closes without a successor. Disappearance without new
 * Evidence changes nothing.
 *
 * No clock, filesystem, network, randomness, environment, or process-global
 * mutable state is read anywhere; caller inputs are never mutated.
 */
import {
  CURRENT_SCHEMA_VERSION,
  evidenceCollectionSchema,
  graphAssertionSchema,
  graphSubjectSchema,
} from "@atlast/shared";
import type {
  AmbiguityState,
  CanonicalClaim,
  CompetingClaim,
  ConflictState,
  Evidence,
  GraphAssertion,
  GraphSubject,
  RuleTrace,
  RuleTraceEntry,
} from "@atlast/shared";
import type { M1V1DerivationPolicy } from "./derivation-policy.ts";
import {
  buildEntityIdentifier,
  buildRelationshipIdentifier,
  IdentityNormalizationError,
  normalizeIdentityKey,
} from "./identity-normalization.ts";
import { selectEvidenceAtHorizon } from "./evidence-order.ts";
import { canonicalizeToJcsString } from "./canonical-serialization.ts";
import { sha256HexOfCanonicalJson } from "./canonical-digest.ts";
import { sortByIdentifier, sortIdentifiers } from "./collection-order.ts";
import { compareUtf16CodeUnits } from "./utf16-comparator.ts";

export interface ReconciliationResult {
  /** Stable subjects, sorted by subject identifier. */
  readonly subjects: readonly GraphSubject[];
  /**
   * The complete revision history derivable at the horizon — every closed
   * and open revision (ADR-0022 § 9), sorted by assertion identifier.
   */
  readonly assertions: readonly GraphAssertion[];
}

/** One observation as tracked per subject during event-time processing. */
interface ObservationRecord {
  readonly evidenceIdentifier: string;
  readonly sourceName: string;
  readonly claimKey: string;
  readonly observedAt: string;
}

interface SubjectState {
  readonly identifier: string;
  readonly subjectKind: "entity" | "relationship";
  readonly normalizedKey: string;
  readonly observations: ObservationRecord[];
  /** Each source's latest observation's claim key (its standing claim). */
  readonly standingBySource: Map<string, string>;
  /** Claim value per claim key (claim keys are canonical serializations). */
  readonly claimsByKey: Map<string, CanonicalClaim>;
}

/** An open revision draft for one (subject, claim value). */
interface RevisionDraft {
  readonly subjectIdentifier: string;
  readonly claim: CanonicalClaim;
  readonly validFrom: string;
  readonly provenance: readonly string[];
  readonly distinctSourceCount: number;
  readonly ruleTrace: RuleTrace;
  readonly conflictState: ConflictState;
  readonly ambiguityState: AmbiguityState;
  /** Canonical serialization of the non-validity payload components. */
  readonly signature: string;
}

interface FinishedRevision extends Omit<RevisionDraft, "signature"> {
  readonly validTo?: string;
}

/**
 * ADR-0022 § 8: confidence(s) = base + span × (1 − 2^−(s − 1)), unrounded.
 * Exported (ADR-0038-B) so the incremental fast path
 * (`incremental-reconciliation.ts`) computes confidence identically to this
 * reference implementation, rather than duplicating the formula — this
 * function's own behavior is unchanged.
 */
export function computeConfidence(
  distinctSourceCount: number,
  policy: M1V1DerivationPolicy,
): number {
  return (
    policy.confidence.base +
    policy.confidence.span * (1 - 2 ** -(distinctSourceCount - 1))
  );
}

/**
 * Resolve a normalized key through the policy's merging aliases (single hop,
 * ADR-0022 § 4). `m1-v1` declares no merging aliases, so this is the
 * identity mapping today; the hop exists so behavior is defined for m1-v2+.
 */
function resolveMergingAlias(
  normalizedKey: string,
  policy: M1V1DerivationPolicy,
): string {
  for (const aliasEntry of policy.aliases) {
    if (
      aliasEntry.directionality === "merging" &&
      aliasEntry.fromKey === normalizedKey
    ) {
      return aliasEntry.toKey;
    }
  }
  return normalizedKey;
}

/**
 * Derive the canonical claim for one Evidence observation (ADR-0022 § 6):
 * relationship endpoints resolve through the same normalization to stable
 * Entity identifiers; unresolvable endpoints fail loudly naming the record
 * and the endpoint role. Exported (ADR-0038-B) for the same reuse reason as
 * `computeConfidence` above — this function's own behavior is unchanged.
 */
export function deriveCanonicalClaim(
  evidenceRecord: Evidence,
  policy: M1V1DerivationPolicy,
): CanonicalClaim {
  const observation = evidenceRecord.observation;
  if (observation.observationKind === "entity") {
    return { claimKind: "entity", entityType: observation.entityType };
  }
  const resolveEndpoint = (
    endpointNativeId: string,
    endpointRole: string,
  ): string => {
    try {
      const endpointKey = resolveMergingAlias(
        normalizeIdentityKey(
          endpointNativeId,
          policy,
          evidenceRecord.identifier,
        ),
        policy,
      );
      return buildEntityIdentifier(endpointKey);
    } catch (normalizationError) {
      if (normalizationError instanceof IdentityNormalizationError) {
        throw new IdentityNormalizationError(
          `Relationship ${endpointRole} endpoint failed identity normalization: ${normalizationError.message}`,
          evidenceRecord.identifier,
          normalizationError.failingKey,
        );
      }
      throw normalizationError;
    }
  };
  return {
    claimKind: "relationship",
    relationshipType: observation.relationshipType,
    sourceEntityIdentifier: resolveEndpoint(
      observation.sourceEntityIdentity.sourceNativeId,
      "source",
    ),
    targetEntityIdentifier: resolveEndpoint(
      observation.targetEntityIdentity.sourceNativeId,
      "target",
    ),
  };
}

/**
 * Derive one Evidence record's subject identity (ADR-0022 §§ 2, 4):
 * normalize `sourceScopedIdentity.sourceNativeId`, resolve it through the
 * policy's single-hop merging aliases, and build the stable Entity or
 * Relationship subject identifier. Extracted, unchanged in behavior, from
 * the main reconciliation loop below (ADR-0038-B) and exported so the
 * incremental fast path (`incremental-reconciliation.ts`) derives subject
 * identity identically to this reference implementation, never by
 * duplicating the normalization/alias logic.
 */
export function deriveSubjectIdentity(
  evidenceRecord: Evidence,
  policy: M1V1DerivationPolicy,
): {
  readonly subjectIdentifier: string;
  readonly subjectKind: "entity" | "relationship";
  readonly normalizedKey: string;
} {
  const normalizedKey = resolveMergingAlias(
    normalizeIdentityKey(
      evidenceRecord.sourceScopedIdentity.sourceNativeId,
      policy,
      evidenceRecord.identifier,
    ),
    policy,
  );
  const subjectKind =
    evidenceRecord.observation.observationKind === "entity"
      ? "entity"
      : "relationship";
  const subjectIdentifier =
    subjectKind === "entity"
      ? buildEntityIdentifier(normalizedKey)
      : buildRelationshipIdentifier(normalizedKey);
  return { subjectIdentifier, subjectKind, normalizedKey };
}

/** Distinct standing claim keys for a subject, deterministically ordered. */
function standingClaimKeys(subjectState: SubjectState): string[] {
  return [...new Set(subjectState.standingBySource.values())].sort(
    compareUtf16CodeUnits,
  );
}

/**
 * Standing-source-filtered provenance (ADR-0022 § 7): Evidence observed at
 * or before the current step, asserting exactly this claim value, from
 * sources whose standing claim is still that value. Withdrawn support never
 * lingers.
 */
function standingFilteredObservations(
  subjectState: SubjectState,
  claimKey: string,
): ObservationRecord[] {
  return subjectState.observations.filter(
    (observation) =>
      observation.claimKey === claimKey &&
      subjectState.standingBySource.get(observation.sourceName) === claimKey,
  );
}

/**
 * Reconcile validated Evidence at an explicit horizon under the given policy
 * (ADR-0022 § 12). Pure: identical inputs produce byte-identical output
 * including content-addressed identifiers, and derivation at every earlier
 * pinned horizon is unaffected by Evidence above it.
 */
export function reconcileEvidenceAtHorizon(
  evidenceRecords: readonly Evidence[],
  horizon: number,
  policy: M1V1DerivationPolicy,
): ReconciliationResult {
  // Validation before derivation (ADR-0022 § 12): the collection schema
  // proves per-record shape plus cross-record sequence/identifier uniqueness.
  const collectionValidation = evidenceCollectionSchema.safeParse([
    ...evidenceRecords,
  ]);
  if (!collectionValidation.success) {
    throw new TypeError(
      `Evidence collection failed the shared contract before derivation: ${collectionValidation.error.issues
        .map(
          (issue) =>
            `${issue.path.length > 0 ? issue.path.join(".") + ": " : ""}${issue.message}`,
        )
        .join("; ")}`,
    );
  }

  const selectedEvidence = selectEvidenceAtHorizon(
    collectionValidation.data,
    horizon,
  );

  const subjectStates = new Map<string, SubjectState>();
  const openDrafts = new Map<string, RevisionDraft>();
  const finishedRevisions: FinishedRevision[] = [];

  const draftKey = (subjectIdentifier: string, claimKey: string): string =>
    `${subjectIdentifier}\u0000${claimKey}`;

  /** A subject "exists in the derived state" once it has any standing claim. */
  const subjectExists = (subjectIdentifier: string): boolean => {
    const subjectState = subjectStates.get(subjectIdentifier);
    return subjectState !== undefined && subjectState.standingBySource.size > 0;
  };

  /**
   * Symmetric ambiguity from one-directional aliases (ADR-0022 § 5), emitted
   * only when both near-match subjects exist at this step — a marker may
   * never reference a subject absent from the derived subject set.
   */
  const computeAmbiguityState = (
    subjectState: SubjectState,
  ): AmbiguityState => {
    const nearMatchEntries: { identifier: string; reason: string }[] = [];
    for (const aliasEntry of policy.aliases) {
      if (aliasEntry.directionality !== "one-directional") {
        continue;
      }
      let counterpartKey: string | undefined;
      if (subjectState.normalizedKey === aliasEntry.fromKey) {
        counterpartKey = aliasEntry.toKey;
      } else if (subjectState.normalizedKey === aliasEntry.toKey) {
        counterpartKey = aliasEntry.fromKey;
      }
      if (counterpartKey === undefined) {
        continue;
      }
      const counterpartIdentifier =
        subjectState.subjectKind === "entity"
          ? buildEntityIdentifier(counterpartKey)
          : buildRelationshipIdentifier(counterpartKey);
      if (subjectExists(counterpartIdentifier)) {
        nearMatchEntries.push({
          identifier: counterpartIdentifier,
          reason: `one-directional-alias:${aliasEntry.fromKey}->${aliasEntry.toKey}`,
        });
      }
    }
    if (nearMatchEntries.length === 0) {
      return { status: "unambiguous" };
    }
    const deduplicated = new Map<string, string>();
    for (const entry of nearMatchEntries) {
      if (!deduplicated.has(entry.identifier)) {
        deduplicated.set(entry.identifier, entry.reason);
      }
    }
    const nearMatches = [...deduplicated.entries()]
      .sort(([first], [second]) => compareUtf16CodeUnits(first, second))
      .map(([identifier, reason]) => ({
        nearMatchSubjectIdentifier: identifier,
        reason,
      }));
    return { status: "ambiguous", nearMatches };
  };

  // Event-time processing: group the total-ordered selection into atomic
  // equal-observedAt steps (ADR-0022 § 7).
  let stepStart = 0;
  while (stepStart < selectedEvidence.length) {
    const firstRecord = selectedEvidence[stepStart];
    if (firstRecord === undefined) {
      break;
    }
    const stepTimestamp = firstRecord.observedAt;
    let stepEnd = stepStart;
    while (
      stepEnd < selectedEvidence.length &&
      selectedEvidence[stepEnd]?.observedAt === stepTimestamp
    ) {
      stepEnd += 1;
    }
    const stepRecords = selectedEvidence.slice(stepStart, stepEnd);
    stepStart = stepEnd;

    // Snapshot standing claim values before the step, for gain/loss detection.
    const previousStanding = new Map<string, Set<string>>();
    for (const [subjectIdentifier, subjectState] of subjectStates) {
      previousStanding.set(
        subjectIdentifier,
        new Set(subjectState.standingBySource.values()),
      );
    }

    // Apply the group atomically (recordedSequence order within the group).
    for (const evidenceRecord of stepRecords) {
      const { subjectIdentifier, subjectKind, normalizedKey } =
        deriveSubjectIdentity(evidenceRecord, policy);

      let subjectState = subjectStates.get(subjectIdentifier);
      if (subjectState === undefined) {
        subjectState = {
          identifier: subjectIdentifier,
          subjectKind,
          normalizedKey,
          observations: [],
          standingBySource: new Map(),
          claimsByKey: new Map(),
        };
        subjectStates.set(subjectIdentifier, subjectState);
      }

      const claim = deriveCanonicalClaim(evidenceRecord, policy);
      const claimKey = canonicalizeToJcsString(claim);
      subjectState.claimsByKey.set(claimKey, claim);
      subjectState.observations.push({
        evidenceIdentifier: evidenceRecord.identifier,
        sourceName: evidenceRecord.sourceScopedIdentity.source,
        claimKey,
        observedAt: evidenceRecord.observedAt,
      });
      subjectState.standingBySource.set(
        evidenceRecord.sourceScopedIdentity.source,
        claimKey,
      );
    }

    // Recompute the complete state after the step, over every subject —
    // ambiguity on one subject can change when another subject appears.
    const orderedSubjectIdentifiers = [...subjectStates.keys()].sort(
      compareUtf16CodeUnits,
    );
    for (const subjectIdentifier of orderedSubjectIdentifiers) {
      const subjectState = subjectStates.get(subjectIdentifier);
      if (subjectState === undefined) {
        continue;
      }
      const standingKeys = standingClaimKeys(subjectState);
      const standingSet = new Set(standingKeys);
      const priorSet =
        previousStanding.get(subjectIdentifier) ?? new Set<string>();
      const lostKeys = [...priorSet].filter((key) => !standingSet.has(key));
      const ambiguityState = computeAmbiguityState(subjectState);

      // Precompute per-standing-claim filtered provenance and confidence for
      // symmetric alternatives-only conflict structures.
      const provenanceByKey = new Map<string, string[]>();
      const sourceCountByKey = new Map<string, number>();
      for (const claimKey of standingKeys) {
        const observations = standingFilteredObservations(
          subjectState,
          claimKey,
        );
        provenanceByKey.set(
          claimKey,
          sortIdentifiers([
            ...new Set(
              observations.map((observation) => observation.evidenceIdentifier),
            ),
          ]),
        );
        sourceCountByKey.set(
          claimKey,
          new Set(observations.map((observation) => observation.sourceName))
            .size,
        );
      }

      for (const claimKey of standingKeys) {
        const claim = subjectState.claimsByKey.get(claimKey);
        const provenance = provenanceByKey.get(claimKey);
        const distinctSourceCount = sourceCountByKey.get(claimKey);
        if (
          claim === undefined ||
          provenance === undefined ||
          distinctSourceCount === undefined
        ) {
          continue;
        }

        let conflictState: ConflictState = { status: "uncontested" };
        if (standingKeys.length > 1) {
          const competingClaims: CompetingClaim[] = standingKeys
            .filter((otherKey) => otherKey !== claimKey)
            .sort(compareUtf16CodeUnits)
            .flatMap((otherKey): CompetingClaim[] => {
              const otherClaim = subjectState.claimsByKey.get(otherKey);
              const otherProvenance = provenanceByKey.get(otherKey);
              const otherSourceCount = sourceCountByKey.get(otherKey);
              return otherClaim !== undefined &&
                otherProvenance !== undefined &&
                otherSourceCount !== undefined
                ? [
                    {
                      claim: otherClaim,
                      provenance: otherProvenance,
                      confidence: computeConfidence(otherSourceCount, policy),
                    },
                  ]
                : [];
            });
          conflictState = { status: "conflicted", competingClaims };
        }

        // Rule traces in the closed vocabulary order (ADR-0022 § 10); every
        // citation is a subset of this revision's own provenance.
        const ruleTraceEntries: RuleTraceEntry[] = [
          {
            ruleName: "normalized-exact-match",
            evidenceIdentifiers: provenance,
          },
        ];
        if (distinctSourceCount >= 2) {
          ruleTraceEntries.push({
            ruleName: "distinct-source-corroboration",
            evidenceIdentifiers: provenance,
          });
        }
        if (conflictState.status === "conflicted") {
          ruleTraceEntries.push({
            ruleName: "mutually-exclusive-claim-conflict",
            evidenceIdentifiers: provenance,
          });
        }
        if (ambiguityState.status === "ambiguous") {
          ruleTraceEntries.push({
            ruleName: "one-directional-alias-near-match",
            evidenceIdentifiers: provenance,
          });
        }
        const claimGainedStanding = !priorSet.has(claimKey);
        if (claimGainedStanding && lostKeys.length > 0) {
          const supersedingCitations = sortIdentifiers(
            standingFilteredObservations(subjectState, claimKey)
              .filter((observation) => observation.observedAt === stepTimestamp)
              .map((observation) => observation.evidenceIdentifier),
          );
          if (supersedingCitations.length > 0) {
            ruleTraceEntries.push({
              ruleName: "claim-supersession",
              evidenceIdentifiers: supersedingCitations,
            });
          }
        }

        const signature = canonicalizeToJcsString({
          claim,
          provenance,
          ruleTrace: ruleTraceEntries,
          conflictState,
          ambiguityState,
        });

        const key = draftKey(subjectIdentifier, claimKey);
        const existingDraft = openDrafts.get(key);
        if (existingDraft !== undefined) {
          if (existingDraft.signature === signature) {
            continue;
          }
          finishedRevisions.push({ ...existingDraft, validTo: stepTimestamp });
        }
        openDrafts.set(key, {
          subjectIdentifier,
          claim,
          validFrom: stepTimestamp,
          provenance,
          distinctSourceCount,
          ruleTrace: ruleTraceEntries,
          conflictState,
          ambiguityState,
          signature,
        });
      }

      // A claim value whose last standing source moved away closes without a
      // successor (ADR-0022 §§ 7, 9).
      for (const lostKey of lostKeys) {
        const key = draftKey(subjectIdentifier, lostKey);
        const lostDraft = openDrafts.get(key);
        if (lostDraft !== undefined) {
          finishedRevisions.push({ ...lostDraft, validTo: stepTimestamp });
          openDrafts.delete(key);
        }
      }
    }
  }

  // Complete revision history: every closed revision plus the still-open
  // drafts, content-addressed and schema-validated (ADR-0022 §§ 9, 11).
  const allRevisions: FinishedRevision[] = [
    ...finishedRevisions,
    ...[...openDrafts.values()].map((draft): FinishedRevision => {
      const { signature, ...revision } = draft;
      void signature;
      return revision;
    }),
  ];

  const assertions = allRevisions.map((revision): GraphAssertion => {
    const validity =
      revision.validTo === undefined
        ? { validFrom: revision.validFrom }
        : { validFrom: revision.validFrom, validTo: revision.validTo };
    const identifyingPayload = {
      derivationVersion: policy.derivationVersion,
      subjectIdentifier: revision.subjectIdentifier,
      claim: revision.claim,
      validity,
      provenance: revision.provenance,
      ruleTrace: revision.ruleTrace,
      conflictState: revision.conflictState,
      ambiguityState: revision.ambiguityState,
    };
    const digest = sha256HexOfCanonicalJson(identifyingPayload);
    const assertionCandidate = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      identifier: `atlast:assertion:${digest}`,
      derivationVersion: policy.derivationVersion,
      subjectIdentifier: revision.subjectIdentifier,
      claim: revision.claim,
      validity,
      provenance: revision.provenance,
      confidence: computeConfidence(revision.distinctSourceCount, policy),
      ruleTrace: revision.ruleTrace,
      conflictState: revision.conflictState,
      ambiguityState: revision.ambiguityState,
    };
    const assertionValidation =
      graphAssertionSchema.safeParse(assertionCandidate);
    if (!assertionValidation.success) {
      throw new TypeError(
        `Derived GraphAssertion failed the shared contract: ${assertionValidation.error.issues
          .map(
            (issue) =>
              `${issue.path.length > 0 ? issue.path.join(".") + ": " : ""}${issue.message}`,
          )
          .join("; ")}`,
      );
    }
    return assertionValidation.data;
  });

  const subjects = [...subjectStates.values()].map(
    (subjectState): GraphSubject => {
      const subjectValidation = graphSubjectSchema.safeParse({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        identifier: subjectState.identifier,
        subjectKind: subjectState.subjectKind,
      });
      if (!subjectValidation.success) {
        throw new TypeError(
          `Derived subject failed the shared contract: ${subjectValidation.error.issues
            .map((issue) => issue.message)
            .join("; ")}`,
        );
      }
      return subjectValidation.data;
    },
  );

  return {
    subjects: sortByIdentifier(subjects, (subject) => subject.identifier),
    assertions: sortByIdentifier(
      assertions,
      (assertion) => assertion.identifier,
    ),
  };
}
