/**
 * ADR-0038-B (Complexity Boundary (A)): a narrow, safety-first incremental
 * reconciliation fast path for the common M5 polling shape — one source
 * repeatedly corroborating the same claim for a subject, or a genuinely new,
 * independent subject appearing — layered entirely outside, and never
 * modifying the behavior of, the accepted, pure `reconcileEvidenceAtHorizon`
 * reference implementation (`reconciliation.ts`), which remains this
 * module's correctness fallback and differential-test oracle for every case
 * this fast path does not confidently handle.
 *
 * SAFETY MODEL — the fast path applies to one new atomic step's records for
 * one subject only when ALL of the following hold, checked directly against
 * the cached prior state and the new records themselves, never guessed:
 *
 * 1. The step's `observedAt` is greater than the subject's own currently
 *    open revision's `validFrom` (or the subject does not exist yet at
 *    all — a genuinely new, independent subject has nothing prior it could
 *    retroactively conflict with at the reconciliation level). ADR-0022 § 7
 *    processes Evidence in strict `observedAt` order; a record with an
 *    earlier `observedAt` than an already-derived revision could require
 *    reopening or reinserting into already-closed history —
 *    `reconciliation.test.ts`'s "late-old horizon safety" scenario proves
 *    this really happens under the accepted contract, so this module never
 *    assumes `observedAt` increases with `recordedSequence`.
 * 2. The touched subject's normalized key is not named by ANY policy alias
 *    entry (`m1-v1` today: exactly one, `ledger-api`/`ledger`) — so no
 *    OTHER subject's ambiguity state could possibly be affected by this
 *    subject's appearance or change (ADR-0022 § 5's one-directional-alias
 *    near-match check only ever inspects the touched subject's own key).
 * 3. Every record in the step, for this subject, asserts the exact same
 *    claim (identical canonical claim key) as either the subject's one
 *    existing open, uncontested, unambiguous revision, or each other (a
 *    brand-new subject's first step). Any existing conflict, existing
 *    ambiguity, or a claim that would introduce either, is unsafe for this
 *    narrow fast path.
 *
 * Any step, record, or subject failing any condition — or any uncertainty
 * at all — causes an immediate, complete fallback to
 * `reconcileEvidenceAtHorizon` over the full horizon-selected Evidence.
 * This module never returns a partially trusted incremental answer.
 *
 * Historical/pinned reads are entirely out of this module's scope: it
 * represents only the single advancing "current" horizon a `"latest"` read
 * observes, mirroring `SnapshotResolver`'s own existing single-most-recent
 * `ReconciliationResult` cache (ADR-0038-A) — this module does not
 * introduce a second, competing full-history cache. A `ReconciliationResult`
 * this module returns, whether via the fast path or the fallback, is
 * indistinguishable in shape and content from one `reconcileEvidenceAtHorizon`
 * would have produced directly.
 */
import {
  CURRENT_SCHEMA_VERSION,
  evidenceCollectionSchema,
  graphAssertionSchema,
  graphSubjectSchema,
  type CanonicalClaim,
  type ConflictState,
  type Evidence,
  type GraphAssertion,
  type GraphSubject,
  type RuleTraceEntry,
} from "@atlast/shared";
import { sha256HexOfCanonicalJson } from "./canonical-digest.ts";
import { canonicalizeToJcsString } from "./canonical-serialization.ts";
import { sortByIdentifier, sortIdentifiers } from "./collection-order.ts";
import type { M1V1DerivationPolicy } from "./derivation-policy.ts";
import { sortEvidenceByTotalOrder } from "./evidence-order.ts";
import {
  computeConfidence,
  deriveCanonicalClaim,
  deriveSubjectIdentity,
  reconcileEvidenceAtHorizon,
  type ReconciliationResult,
} from "./reconciliation.ts";

/**
 * Fast-path-tracked state for one subject's single, uncontested, unambiguous
 * open claim — the only shape this module's fast path ever advances. A
 * subject absent from a state's `claimStatesBySubject` map is simply not
 * fast-path-eligible (conflicted, ambiguous, closed-with-no-successor, or
 * never observed) — any new Evidence touching it falls back.
 */
export interface IncrementalSubjectClaimState {
  readonly subjectIdentifier: string;
  readonly claim: CanonicalClaim;
  readonly claimKey: string;
  readonly provenance: readonly string[];
  readonly sourceNames: ReadonlySet<string>;
  readonly validFrom: string;
  readonly ruleTrace: readonly RuleTraceEntry[];
}

export interface IncrementalReconciliationState {
  readonly horizon: number;
  readonly derivationVersion: string;
  readonly referenceResult: ReconciliationResult;
  readonly claimStatesBySubject: ReadonlyMap<
    string,
    IncrementalSubjectClaimState
  >;
}

export interface AdvanceOutcome {
  readonly usedFastPath: boolean;
  readonly state: IncrementalReconciliationState;
}

/** The exact, unmodified normalized keys `m1-v1`'s alias table currently names, on either side. */
function aliasInvolvedKeys(policy: M1V1DerivationPolicy): ReadonlySet<string> {
  const involved = new Set<string>();
  for (const aliasEntry of policy.aliases) {
    involved.add(aliasEntry.fromKey);
    involved.add(aliasEntry.toKey);
  }
  return involved;
}

/**
 * Build fast-path state fresh from an authoritative `ReconciliationResult`
 * and the exact Evidence collection that produced it (ADR-0038-B). Only
 * subjects with exactly one visible (`validTo === undefined`), uncontested,
 * unambiguous assertion are tracked; every other subject is simply absent
 * from the returned map, so future Evidence touching it always falls back.
 */
export function buildIncrementalStateFromReference(
  evidenceRecords: readonly Evidence[],
  referenceResult: ReconciliationResult,
  horizon: number,
  derivationVersion: string,
): IncrementalReconciliationState {
  const evidenceByIdentifier = new Map<string, Evidence>();
  for (const record of evidenceRecords) {
    evidenceByIdentifier.set(record.identifier, record);
  }

  const claimStatesBySubject = new Map<string, IncrementalSubjectClaimState>();
  for (const assertion of referenceResult.assertions) {
    const hasSupersessionMarker = assertion.ruleTrace.some(
      (entry) => entry.ruleName === "claim-supersession",
    );
    if (
      assertion.validity.validTo !== undefined ||
      assertion.conflictState.status !== "uncontested" ||
      assertion.ambiguityState.status !== "unambiguous" ||
      hasSupersessionMarker
    ) {
      // A supersession-marked revision is only valid for the one atomic
      // step it was derived at (see the global precondition in
      // `advanceOrFallback`) — never tracked as fast-path-stable.
      continue;
    }
    const sourceNames = new Set<string>();
    for (const evidenceIdentifier of assertion.provenance) {
      const evidenceRecord = evidenceByIdentifier.get(evidenceIdentifier);
      if (evidenceRecord !== undefined) {
        sourceNames.add(evidenceRecord.sourceScopedIdentity.source);
      }
    }
    claimStatesBySubject.set(assertion.subjectIdentifier, {
      subjectIdentifier: assertion.subjectIdentifier,
      claim: assertion.claim,
      claimKey: canonicalizeToJcsString(assertion.claim),
      provenance: assertion.provenance,
      sourceNames,
      validFrom: assertion.validity.validFrom,
      ruleTrace: assertion.ruleTrace,
    });
  }

  return {
    horizon,
    derivationVersion,
    referenceResult,
    claimStatesBySubject,
  };
}

/** Group already total-ordered Evidence into ADR-0022 § 7 atomic equal-`observedAt` steps. */
function groupIntoSteps(
  totalOrderedRecords: readonly Evidence[],
): readonly (readonly Evidence[])[] {
  const steps: Evidence[][] = [];
  let currentStepRecords: Evidence[] = [];
  let currentStepTimestamp: string | undefined;
  for (const record of totalOrderedRecords) {
    if (currentStepTimestamp === undefined) {
      currentStepTimestamp = record.observedAt;
      currentStepRecords = [record];
      continue;
    }
    if (record.observedAt === currentStepTimestamp) {
      currentStepRecords.push(record);
      continue;
    }
    steps.push(currentStepRecords);
    currentStepTimestamp = record.observedAt;
    currentStepRecords = [record];
  }
  if (currentStepRecords.length > 0) {
    steps.push(currentStepRecords);
  }
  return steps;
}

/** Construct one content-addressed `GraphAssertion` exactly as the reference implementation's final pass does. */
function buildAssertion(
  derivationVersion: string,
  subjectIdentifier: string,
  claim: CanonicalClaim,
  validFrom: string,
  validTo: string | undefined,
  provenance: readonly string[],
  ruleTrace: readonly RuleTraceEntry[],
  conflictState: ConflictState,
  distinctSourceCount: number,
  policy: M1V1DerivationPolicy,
): GraphAssertion {
  const validity =
    validTo === undefined ? { validFrom } : { validFrom, validTo };
  const identifyingPayload = {
    derivationVersion,
    subjectIdentifier,
    claim,
    validity,
    provenance,
    ruleTrace,
    conflictState,
    ambiguityState: { status: "unambiguous" as const },
  };
  const digest = sha256HexOfCanonicalJson(identifyingPayload);
  const assertionCandidate = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: `atlast:assertion:${digest}`,
    derivationVersion,
    subjectIdentifier,
    claim,
    validity,
    provenance,
    confidence: computeConfidence(distinctSourceCount, policy),
    ruleTrace,
    conflictState,
    ambiguityState: { status: "unambiguous" as const },
  };
  const validated = graphAssertionSchema.safeParse(assertionCandidate);
  if (!validated.success) {
    throw new TypeError(
      `Incrementally derived GraphAssertion failed the shared contract: ${validated.error.issues
        .map(
          (issue) =>
            `${issue.path.length > 0 ? issue.path.join(".") + ": " : ""}${issue.message}`,
        )
        .join("; ")}`,
    );
  }
  return validated.data;
}

/**
 * Attempt the fast path for one advance from `priorState.horizon` to
 * `newHorizon`; falls back to the complete, unmodified
 * `reconcileEvidenceAtHorizon` reference over `horizonSelectedEvidence`
 * (all Evidence at or below `newHorizon`) at the first sign of anything
 * this narrow fast path does not confidently handle. Never returns a
 * partially trusted incremental answer.
 */
export function advanceOrFallback(
  priorState: IncrementalReconciliationState | undefined,
  horizonSelectedEvidence: readonly Evidence[],
  newHorizon: number,
  derivationVersion: string,
  policy: M1V1DerivationPolicy,
): AdvanceOutcome {
  const fallback = (): AdvanceOutcome => {
    const collectionValidation = evidenceCollectionSchema.safeParse([
      ...horizonSelectedEvidence,
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
    const referenceResult = reconcileEvidenceAtHorizon(
      horizonSelectedEvidence,
      newHorizon,
      policy,
    );
    return {
      usedFastPath: false,
      state: buildIncrementalStateFromReference(
        horizonSelectedEvidence,
        referenceResult,
        newHorizon,
        derivationVersion,
      ),
    };
  };

  if (priorState === undefined || priorState.horizon >= newHorizon) {
    return fallback();
  }

  // GLOBAL SAFETY PRECONDITION: `reconcileEvidenceAtHorizon`'s
  // "claim-supersession" rule-trace marker is valid for exactly the one
  // atomic step where a claim transition occurred — the reference
  // algorithm recomputes every subject's state at every global step
  // (ADR-0022 § 7 step processing is not scoped per-subject), so the very
  // next step, for ANY subject anywhere, closes and reopens a
  // supersession-marked revision (dropping the now-stale marker) even
  // with zero new Evidence for that specific subject. This narrow fast
  // path has no way to predict or apply that unrelated-subject
  // recomputation, so any currently open revision still carrying
  // "claim-supersession" makes the entire advance unsafe — never just for
  // its own subject's future Evidence, but for the very next step at all.
  const hasPendingSupersessionMarker =
    priorState.referenceResult.assertions.some(
      (assertion) =>
        assertion.validity.validTo === undefined &&
        assertion.ruleTrace.some(
          (entry) => entry.ruleName === "claim-supersession",
        ),
    );
  if (hasPendingSupersessionMarker) {
    return fallback();
  }

  const newRecords = horizonSelectedEvidence.filter(
    (record) => record.recordedSequence > priorState.horizon,
  );
  if (newRecords.length === 0) {
    return fallback();
  }

  const involvedAliasKeys = aliasInvolvedKeys(policy);
  const steps = groupIntoSteps(sortEvidenceByTotalOrder(newRecords));

  let workingClaimStates = new Map(priorState.claimStatesBySubject);
  const newlyClosed = new Map<string, GraphAssertion>();
  const newlyOpen = new Map<string, GraphAssertion>();
  const newSubjects = new Map<string, GraphSubject>();
  const subjectAlreadyKnown = new Set(
    priorState.referenceResult.subjects.map((subject) => subject.identifier),
  );

  for (const step of steps) {
    const stepTimestamp = step[0]?.observedAt;
    if (stepTimestamp === undefined) {
      continue;
    }
    const recordsBySubject = new Map<string, Evidence[]>();
    const identityBySubject = new Map<
      string,
      {
        subjectIdentifier: string;
        normalizedKey: string;
        subjectKind: "entity" | "relationship";
      }
    >();
    for (const record of step) {
      const identity = deriveSubjectIdentity(record, policy);
      if (involvedAliasKeys.has(identity.normalizedKey)) {
        return fallback();
      }
      identityBySubject.set(identity.subjectIdentifier, identity);
      const existingList = recordsBySubject.get(identity.subjectIdentifier);
      if (existingList === undefined) {
        recordsBySubject.set(identity.subjectIdentifier, [record]);
      } else {
        existingList.push(record);
      }
    }

    for (const [subjectIdentifier, stepRecordsForSubject] of recordsBySubject) {
      const identity = identityBySubject.get(subjectIdentifier);
      if (identity === undefined) {
        return fallback();
      }
      const claims = stepRecordsForSubject.map((record) =>
        deriveCanonicalClaim(record, policy),
      );
      const claimKeys = claims.map((claim) => canonicalizeToJcsString(claim));
      const firstClaimKey = claimKeys[0];
      if (
        firstClaimKey === undefined ||
        claimKeys.some((claimKey) => claimKey !== firstClaimKey)
      ) {
        // Multiple distinct claims for one subject in one step — a
        // conflict this narrow fast path does not handle.
        return fallback();
      }

      const existingState = workingClaimStates.get(subjectIdentifier);
      if (
        existingState === undefined &&
        subjectAlreadyKnown.has(subjectIdentifier)
      ) {
        // The subject already exists in the prior authoritative result but
        // is not fast-path-tracked (conflicted, ambiguous, or otherwise
        // excluded) — this is not a genuinely new, independent subject;
        // never assume it is safe.
        return fallback();
      }
      if (
        existingState !== undefined &&
        existingState.claimKey !== firstClaimKey
      ) {
        // The subject already stands for a different claim — a claim
        // change/conflict/supersession this narrow fast path does not
        // handle.
        return fallback();
      }
      if (
        existingState !== undefined &&
        stepTimestamp <= existingState.validFrom
      ) {
        // Not strictly after the subject's own last-processed observedAt —
        // a potentially retroactive record; never assume it is safe.
        return fallback();
      }

      const claim = claims[0];
      if (claim === undefined) {
        return fallback();
      }
      const previousProvenance = existingState?.provenance ?? [];
      const previousSourceNames =
        existingState?.sourceNames ?? new Set<string>();
      const newSourceNames = new Set(previousSourceNames);
      const newEvidenceIdentifiers: string[] = [];
      for (const record of stepRecordsForSubject) {
        newSourceNames.add(record.sourceScopedIdentity.source);
        newEvidenceIdentifiers.push(record.identifier);
      }
      const provenance = sortIdentifiers([
        ...new Set([...previousProvenance, ...newEvidenceIdentifiers]),
      ]);
      const distinctSourceCount = newSourceNames.size;

      const ruleTrace: RuleTraceEntry[] = [
        { ruleName: "normalized-exact-match", evidenceIdentifiers: provenance },
      ];
      if (distinctSourceCount >= 2) {
        ruleTrace.push({
          ruleName: "distinct-source-corroboration",
          evidenceIdentifiers: provenance,
        });
      }
      const conflictState: ConflictState = { status: "uncontested" };

      if (existingState !== undefined) {
        const closedAssertion = buildAssertion(
          derivationVersion,
          subjectIdentifier,
          existingState.claim,
          existingState.validFrom,
          stepTimestamp,
          existingState.provenance,
          existingState.ruleTrace,
          conflictState,
          previousSourceNames.size,
          policy,
        );
        newlyClosed.set(
          `${subjectIdentifier}|${stepTimestamp}`,
          closedAssertion,
        );
      }

      const openAssertion = buildAssertion(
        derivationVersion,
        subjectIdentifier,
        claim,
        stepTimestamp,
        undefined,
        provenance,
        ruleTrace,
        conflictState,
        distinctSourceCount,
        policy,
      );
      newlyOpen.set(subjectIdentifier, openAssertion);

      if (
        existingState === undefined &&
        !subjectAlreadyKnown.has(subjectIdentifier)
      ) {
        const subjectCandidate = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          identifier: subjectIdentifier,
          subjectKind: identity.subjectKind,
        };
        const validatedSubject = graphSubjectSchema.safeParse(subjectCandidate);
        if (!validatedSubject.success) {
          return fallback();
        }
        newSubjects.set(subjectIdentifier, validatedSubject.data);
      }

      workingClaimStates = new Map(workingClaimStates);
      workingClaimStates.set(subjectIdentifier, {
        subjectIdentifier,
        claim,
        claimKey: firstClaimKey,
        provenance,
        sourceNames: newSourceNames,
        validFrom: stepTimestamp,
        ruleTrace,
      });
    }
  }

  const untouchedAssertions = priorState.referenceResult.assertions.filter(
    (assertion) =>
      !(
        assertion.validity.validTo === undefined &&
        newlyOpen.has(assertion.subjectIdentifier)
      ),
  );
  const assertions = sortByIdentifier(
    [...untouchedAssertions, ...newlyClosed.values(), ...newlyOpen.values()],
    (assertion) => assertion.identifier,
  );
  const subjects = sortByIdentifier(
    [...priorState.referenceResult.subjects, ...newSubjects.values()],
    (subject) => subject.identifier,
  );

  const referenceResult: ReconciliationResult = {
    subjects,
    assertions,
  };

  return {
    usedFastPath: true,
    state: {
      horizon: newHorizon,
      derivationVersion,
      referenceResult,
      claimStatesBySubject: workingClaimStates,
    },
  };
}
