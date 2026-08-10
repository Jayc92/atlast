/**
 * Pure snapshot construction (S6-C1, accepted ADR-0023 §§ 4–6, 9): compose
 * the S5 reconciliation engine, the S4 validity-membership primitive, the
 * S6-A derivation-version lookup, and the S6-A snapshot-checksum builder
 * into one pure function that produces the internal immutable snapshot
 * state a future `TopologyGraphStore` reads from.
 *
 * This module builds only the fully-resolved, referentially-sound state at
 * one exact `(asOf, horizon, derivationVersion)` identity, given the
 * complete retained Evidence a store holds (not a horizon-prefiltered
 * subset — `reconcileEvidenceAtHorizon` itself selects by horizon). It does
 * not implement any `TopologyGraphStore` query method, `latest`-mode
 * `Clock` resolution, graph cursor binding, or contract-suite registration
 * — those are later S6-C/S6-D work. The returned shape deliberately carries
 * no query-time API envelope or freshness decoration; it is repository-
 * internal state, not a `SubjectDetailResult`/`EntityPage`/etc. shape.
 *
 * Pure by construction: no `Clock`, no store instance state, no cache, no
 * I/O, no randomness, and no code path calls `Date.now()` or argument-less
 * `new Date()`. The caller's `evidenceRecords` array and its records are
 * never mutated or frozen — only the newly derived `Snapshot` this function
 * returns is deep-frozen.
 */
import {
  snapshotIdentitySchema,
  type Evidence,
  type GraphAssertion,
  type GraphSubject,
  type SnapshotIdentity,
} from "@atlast/shared";
import { sortByIdentifier } from "./collection-order.ts";
import { resolveDerivationPolicy } from "./derivation-version-lookup.ts";
import { reconcileEvidenceAtHorizon } from "./reconciliation.ts";
import {
  InvalidReadCoordinateError,
  ReferentialIntegrityError,
} from "./repository-errors.ts";
import { buildSnapshotChecksum } from "./snapshot-checksum.ts";
import { isTimestampWithinValidity } from "./validity-membership.ts";

/**
 * One visible subject and its visible assertion revisions, sorted by
 * assertion identifier. No bare subjects: a subject appears in a
 * `Snapshot.subjects` array only when it has at least one visible assertion
 * (ADR-0014).
 */
export interface SnapshotSubjectView {
  readonly subject: GraphSubject;
  readonly assertions: readonly GraphAssertion[];
}

/**
 * The complete internal snapshot state at one exact resolved identity:
 * every visible subject (sorted by subject identifier) with its visible
 * assertion revisions, the ADR-0023 § 4 content-addressed checksum, and the
 * distinct visible-subject count (computed alongside, never hashed into,
 * the checksum — ADR-0023 § 4).
 */
export interface Snapshot {
  readonly identity: SnapshotIdentity;
  readonly checksum: string;
  readonly subjectCount: number;
  readonly subjects: readonly SnapshotSubjectView[];
}

/** Recursively freeze the derived snapshot so no code path can mutate it after construction. */
function deepFreeze<FrozenType>(value: FrozenType): FrozenType {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const propertyValue of Object.values(value)) {
      deepFreeze(propertyValue);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Enforce ADR-0023 § 5's closed semantic-horizon rule against the complete
 * retained Evidence collection: an empty collection has no valid graph-read
 * horizon at all (`EMPTY_EVIDENCE_STORE`); otherwise a horizon is valid
 * exactly when `firstRecordedSequence <= horizon <= currentWatermark`,
 * where both bounds are derived here from the retained collection itself
 * (this module holds no store state to read them from).
 */
function assertSemanticallyValidHorizon(
  evidenceRecords: readonly Evidence[],
  horizon: number,
): void {
  if (evidenceRecords.length === 0) {
    throw new InvalidReadCoordinateError({ reason: "EMPTY_EVIDENCE_STORE" });
  }

  let firstRecordedSequence = Number.POSITIVE_INFINITY;
  let currentWatermark = 0;
  for (const record of evidenceRecords) {
    if (record.recordedSequence < firstRecordedSequence) {
      firstRecordedSequence = record.recordedSequence;
    }
    if (record.recordedSequence > currentWatermark) {
      currentWatermark = record.recordedSequence;
    }
  }

  if (horizon < firstRecordedSequence) {
    throw new InvalidReadCoordinateError({
      reason: "HORIZON_BEFORE_FIRST_EVIDENCE",
      firstRecordedSequence,
      currentWatermark,
    });
  }
  if (horizon > currentWatermark) {
    throw new InvalidReadCoordinateError({
      reason: "HORIZON_AFTER_CURRENT_WATERMARK",
      firstRecordedSequence,
      currentWatermark,
    });
  }
}

/**
 * Identity-scoped relationship-endpoint referential integrity (ADR-0023
 * § 6): every visible relationship assertion's `sourceEntityIdentifier` and
 * `targetEntityIdentifier` must resolve to a subject carrying at least one
 * visible entity assertion at this same resolved identity. A violation
 * rejects the entire snapshot build for this exact identity — never a
 * silent exclusion of just the offending relationship — naming the
 * offending assertion, the unresolved endpoint role, and the resolved
 * identity. Because this function is pure and identity-scoped (no shared
 * cache across calls), a violation at one `(asOf, horizon, derivationVersion)`
 * can never affect a different identity's own, independently computed,
 * result.
 */
function assertReferentialIntegrity(
  visibleAssertions: readonly GraphAssertion[],
  resolvedIdentity: SnapshotIdentity,
): void {
  const visibleEntitySubjectIdentifiers = new Set(
    visibleAssertions
      .filter((assertion) => assertion.claim.claimKind === "entity")
      .map((assertion) => assertion.subjectIdentifier),
  );

  for (const assertion of visibleAssertions) {
    if (assertion.claim.claimKind !== "relationship") {
      continue;
    }
    const { sourceEntityIdentifier, targetEntityIdentifier } = assertion.claim;
    if (!visibleEntitySubjectIdentifiers.has(sourceEntityIdentifier)) {
      throw new ReferentialIntegrityError({
        assertionIdentifier: assertion.identifier,
        endpointRole: "source",
        endpointIdentifier: sourceEntityIdentifier,
        resolvedIdentity,
      });
    }
    if (!visibleEntitySubjectIdentifiers.has(targetEntityIdentifier)) {
      throw new ReferentialIntegrityError({
        assertionIdentifier: assertion.identifier,
        endpointRole: "target",
        endpointIdentifier: targetEntityIdentifier,
        resolvedIdentity,
      });
    }
  }
}

/**
 * Group visible assertions by subject identifier and pair each subject that
 * has at least one visible assertion with them, sorted by subject
 * identifier — deriving the visible subject set exactly from the visible
 * assertion set (no bare subjects, ADR-0014) rather than from
 * `reconciliationResult.subjects` directly, which may include subjects with
 * no assertion visible at this `asOf`.
 */
function deriveVisibleSubjectViews(
  reconciledSubjects: readonly GraphSubject[],
  visibleAssertions: readonly GraphAssertion[],
): SnapshotSubjectView[] {
  const assertionsBySubjectIdentifier = new Map<string, GraphAssertion[]>();
  for (const assertion of visibleAssertions) {
    const existing = assertionsBySubjectIdentifier.get(
      assertion.subjectIdentifier,
    );
    if (existing === undefined) {
      assertionsBySubjectIdentifier.set(assertion.subjectIdentifier, [
        assertion,
      ]);
    } else {
      existing.push(assertion);
    }
  }

  const visibleSubjectViews: SnapshotSubjectView[] = [];
  for (const subject of reconciledSubjects) {
    const subjectAssertions = assertionsBySubjectIdentifier.get(
      subject.identifier,
    );
    if (subjectAssertions === undefined) {
      continue;
    }
    visibleSubjectViews.push({
      subject,
      assertions: sortByIdentifier(
        subjectAssertions,
        (assertion) => assertion.identifier,
      ),
    });
  }

  return sortByIdentifier(
    visibleSubjectViews,
    (subjectView) => subjectView.subject.identifier,
  );
}

/**
 * Build the immutable snapshot at one exact resolved identity, from the
 * complete retained Evidence a store holds (ADR-0023 §§ 4–6):
 *
 * 1. Validate `identity` through the shared `snapshotIdentitySchema`.
 * 2. Resolve `derivationVersion` to its policy (`resolveDerivationPolicy`);
 *    an unsupported token rejects loudly, never silently substituting the
 *    active policy.
 * 3. Enforce semantic horizon validity against the retained Evidence.
 * 4. Call `reconcileEvidenceAtHorizon` exactly once with the resolved
 *    policy to obtain the complete revision history at that horizon.
 * 5. Filter to assertions visible at `identity.asOf`
 *    (`isTimestampWithinValidity`).
 * 6. Derive visible subjects exactly from the visible assertion set.
 * 7. Enforce identity-scoped referential integrity over the visible
 *    relationship assertions.
 * 8. Build the ADR-0023 § 4 checksum from exactly
 *    `{ derivationVersion, asOf, horizon, visibleAssertionIdentifiers }`.
 * 9. Report `subjectCount` as the distinct visible-subject count, beside —
 *    never inside — the checksum payload.
 */
export function buildSnapshot(
  evidenceRecords: readonly Evidence[],
  identity: SnapshotIdentity,
): Snapshot {
  const resolvedIdentity = snapshotIdentitySchema.parse(identity);

  const policy = resolveDerivationPolicy(resolvedIdentity.derivationVersion);

  assertSemanticallyValidHorizon(evidenceRecords, resolvedIdentity.horizon);

  const reconciliationResult = reconcileEvidenceAtHorizon(
    evidenceRecords,
    resolvedIdentity.horizon,
    policy,
  );

  const visibleAssertions = reconciliationResult.assertions.filter(
    (assertion) =>
      isTimestampWithinValidity(assertion.validity, resolvedIdentity.asOf),
  );

  assertReferentialIntegrity(visibleAssertions, resolvedIdentity);

  const subjects = deriveVisibleSubjectViews(
    reconciliationResult.subjects,
    visibleAssertions,
  );

  const checksum = buildSnapshotChecksum({
    derivationVersion: resolvedIdentity.derivationVersion,
    asOf: resolvedIdentity.asOf,
    horizon: resolvedIdentity.horizon,
    visibleAssertionIdentifiers: visibleAssertions.map(
      (assertion) => assertion.identifier,
    ),
  });

  return deepFreeze({
    identity: resolvedIdentity,
    checksum,
    subjectCount: subjects.length,
    subjects,
  });
}
