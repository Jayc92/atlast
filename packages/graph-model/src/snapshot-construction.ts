/**
 * Pure snapshot construction (S6-C1, accepted ADR-0023 §§ 4–6, 9): compose
 * the S5 reconciliation engine, the S4 validity-membership primitive, the
 * S6-A derivation-version lookup, and the S6-A snapshot-checksum builder
 * into pure functions that produce the internal immutable snapshot state a
 * future `TopologyGraphStore` reads from.
 *
 * Two entry points exist, because two different callers hold two different
 * shapes of Evidence:
 *
 * - `buildSnapshot(evidenceRecords, identity)` — the complete-input builder.
 *   Takes the **entire** retained Evidence collection a store holds (not a
 *   horizon-prefiltered subset) and enforces the full ADR-0023 § 5 semantic
 *   horizon-validity rule (`EMPTY_EVIDENCE_STORE`,
 *   `HORIZON_BEFORE_FIRST_EVIDENCE`, `HORIZON_AFTER_CURRENT_WATERMARK`)
 *   against it, computing `firstRecordedSequence`/`currentWatermark`
 *   directly from the given records.
 * - `buildSnapshotFromHorizonSelectedEvidence(horizonSelectedEvidence,
 *   identity)` — the pre-selected-input builder, for a caller (the S6-C2a
 *   snapshot resolver) that has already obtained Evidence bounded to
 *   exactly `identity.horizon` through `EvidenceStore.listEvidence`, whose
 *   own internal semantic-horizon check has already validated that horizon
 *   against the store's complete bounds. This function does **not**
 *   recompute or re-validate `firstRecordedSequence`/`currentWatermark`
 *   from its (deliberately partial) input — doing so would incorrectly
 *   reject a horizon that lies between retained sequences, since the
 *   horizon-selected subset's own maximum `recordedSequence` is not
 *   necessarily the store's true watermark. Both functions otherwise share
 *   every remaining step: derivation-version resolution, reconciliation,
 *   validity filtering, referential integrity, subject derivation,
 *   checksum construction, and output freezing.
 *
 * Neither function implements any `TopologyGraphStore` query method,
 * `latest`-mode `Clock` resolution, graph cursor binding, or
 * contract-suite registration — those are later S6-C/S6-D work. The
 * returned shape deliberately carries no query-time API envelope or
 * freshness decoration; it is repository-internal state, not a
 * `SubjectDetailResult`/`EntityPage`/etc. shape.
 *
 * Pure by construction: no `Clock`, no store instance state, no cache, no
 * I/O, no randomness, and no code path calls `Date.now()` or argument-less
 * `new Date()`. The caller's `evidenceRecords` array and its records are
 * never mutated or frozen — only the newly derived `Snapshot` either
 * function returns is deep-frozen. This purity is unchanged by ADR-0038-A
 * (below): the reconciliation step and the post-reconciliation composition
 * step (filter/referential-integrity/subjects/checksum/freeze) are now two
 * separate, still-pure, still-cache-free functions —
 * `reconcileEvidenceAtHorizon` (unchanged, `./reconciliation.ts`) and the
 * new package-internal `composeSnapshotFromReconciliationResult` (below) —
 * so that `SnapshotResolver`, the one stateful/caching layer this package
 * already has (ADR-0023), can reuse an already-computed
 * `ReconciliationResult` across multiple `asOf` values at the same
 * `(horizon, derivationVersion)` without this module gaining any cache of
 * its own. `buildSnapshot`/`buildSnapshotFromHorizonSelectedEvidence`
 * themselves are behaviorally identical to before this change — they still
 * always reconcile exactly once per call.
 */
import {
  snapshotIdentitySchema,
  type Evidence,
  type GraphAssertion,
  type GraphSubject,
  type SnapshotIdentity,
} from "@atlast/shared";
import { sortByIdentifier } from "./collection-order.ts";
import type { M1V1DerivationPolicy } from "./derivation-policy.ts";
import { resolveDerivationPolicy } from "./derivation-version-lookup.ts";
import {
  reconcileEvidenceAtHorizon,
  type ReconciliationResult,
} from "./reconciliation.ts";
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
 * **Package-internal.** Not exported from `./index.ts`; imported directly by
 * `./snapshot-resolver.ts` only (ADR-0038-A). Composes a `Snapshot` from an
 * **already-computed** `ReconciliationResult` and a resolved identity:
 * filter to visible assertions, enforce referential integrity, derive
 * visible subjects, build the checksum, and freeze. Deliberately takes no
 * `evidenceRecords` and never calls `reconcileEvidenceAtHorizon` itself —
 * that is the one, sole reconciliation step this function's caller controls
 * (directly, or via a cached prior result), so an already-derived
 * `ReconciliationResult` is never redundantly recomputed merely to compose a
 * `Snapshot` at a different `asOf` over the same `(horizon, derivationVersion)`.
 * This function itself remains pure: no `Clock`, no cache, no I/O, no
 * randomness — exactly the same purity `constructSnapshot` (below) always
 * had, since this is that same logic, unmodified, just no longer bundled
 * with the reconciliation call.
 */
export function composeSnapshotFromReconciliationResult(
  reconciliationResult: ReconciliationResult,
  resolvedIdentity: SnapshotIdentity,
): Snapshot {
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

/**
 * The shared core of both public entry points, run against an
 * already-validated resolved identity and an already-resolved policy:
 * reconcile once, then compose. Neither semantic horizon validity nor
 * derivation-version resolution happens here — each caller performs those
 * differently (§ see module docstring) before reaching this point. Behavior
 * is unchanged from before ADR-0038-A: this function still always
 * reconciles from the given `evidenceRecords` exactly once per call, with no
 * cache of its own — the same purity `buildSnapshot`/
 * `buildSnapshotFromHorizonSelectedEvidence` have always documented.
 * `SnapshotResolver` alone may skip calling this function's reconciliation
 * step by reusing a prior `ReconciliationResult` via
 * `composeSnapshotFromReconciliationResult` directly.
 */
function constructSnapshot(
  evidenceRecords: readonly Evidence[],
  resolvedIdentity: SnapshotIdentity,
  policy: M1V1DerivationPolicy,
): Snapshot {
  const reconciliationResult = reconcileEvidenceAtHorizon(
    evidenceRecords,
    resolvedIdentity.horizon,
    policy,
  );
  return composeSnapshotFromReconciliationResult(
    reconciliationResult,
    resolvedIdentity,
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
 * 3. Enforce semantic horizon validity against the complete retained
 *    Evidence (`firstRecordedSequence`/`currentWatermark` computed directly
 *    from `evidenceRecords`).
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
  return constructSnapshot(evidenceRecords, resolvedIdentity, policy);
}

/**
 * **Package-internal.** Not exported from `./index.ts`, and not part of
 * `@atlast/graph-model`'s public surface — imported directly by
 * `./snapshot-resolver.ts` only. This function deliberately bypasses the
 * semantic-horizon validation `buildSnapshot` performs, so it is unsafe to
 * call with Evidence a caller has not already obtained through a
 * horizon-validating path.
 *
 * Build the immutable snapshot at one exact resolved identity, from
 * Evidence a caller has **already** obtained bounded to exactly
 * `identity.horizon` via `EvidenceStore.listEvidence(identity.horizon, …)`
 * — the frozen `EvidenceStore` interface's own `listEvidence` method,
 * whose internal semantic-horizon check has already validated that horizon
 * against the store's complete bounds (ADR-0023 § 5), is the only
 * caller-side precondition that makes calling this function safe.
 *
 * This function performs every remaining step `buildSnapshot` performs
 * (derivation-version resolution, reconciliation, validity filtering,
 * referential integrity, subject derivation, checksum construction,
 * freezing) but **never** re-derives or re-validates semantic horizon
 * bounds from `horizonSelectedEvidence` itself — that input is, by
 * construction, only the subset at or below the horizon, so computing
 * `firstRecordedSequence`/`currentWatermark` from it would not reflect the
 * store's true bounds and could wrongly reject a horizon that legitimately
 * lies between retained sequences. Callers that hold the complete retained
 * collection, or that have not already validated the horizon through
 * `EvidenceStore.listEvidence`, must use the public `buildSnapshot`
 * instead.
 */
export function buildSnapshotFromHorizonSelectedEvidence(
  horizonSelectedEvidence: readonly Evidence[],
  identity: SnapshotIdentity,
): Snapshot {
  const resolvedIdentity = snapshotIdentitySchema.parse(identity);
  const policy = resolveDerivationPolicy(resolvedIdentity.derivationVersion);
  return constructSnapshot(horizonSelectedEvidence, resolvedIdentity, policy);
}
