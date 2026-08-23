/**
 * The internal snapshot resolver (S6-C2a, accepted ADR-0023 §§ 1, 5): the
 * piece a future `InMemoryTopologyGraphStore` composes to turn a `ReadMode`
 * (or an already-authoritative cursor-bound `SnapshotIdentity`) into a
 * cached, immutable `Snapshot`, without itself implementing any
 * `TopologyGraphStore` query method, graph cursor issuance, or
 * cursor-binding comparison — those are later S6-C work.
 *
 * Three resolution paths exist, matching ADR-0023 §§ 1–2's three ways a
 * request's identity is decided:
 *
 * - **Cursorless `latest`.** Resolves `asOf` from the injected `Clock`,
 *   `horizon` from `EvidenceStore.getCurrentWatermark()`, and
 *   `derivationVersion` to the hardcoded active policy token — each read
 *   exactly once per request, at the moment the request is served
 *   (ADR-0023 § 1). An empty store has no valid graph-read horizon at all
 *   and rejects with `EMPTY_EVIDENCE_STORE` (ADR-0023 § 5), checked before
 *   the `Clock` is ever invoked, since a horizon of `0` can never become
 *   part of a served identity.
 * - **Pinned.** The caller supplies the complete `SnapshotIdentity`; this
 *   resolver never invokes `Clock` and never calls `getCurrentWatermark()`
 *   for a pinned request — `EvidenceStore.listEvidence`'s own semantic
 *   horizon check is what determines whether the pinned horizon is valid
 *   against the store's true bounds, since this resolver only ever sees
 *   the horizon-bounded Evidence subset `listEvidence` returns.
 * - **Cursor-authoritative.** A caller that has already decoded and bound
 *   a continuation cursor's complete resolved `SnapshotIdentity` (ADR-0023
 *   § 2 — graph cursor binding and comparison itself is S6-C2b+ work, not
 *   this module) calls `resolveCursorBoundSnapshot` with that identity
 *   directly: no `Clock` invocation, no watermark re-read, exactly like the
 *   pinned path.
 *
 * Evidence is always loaded through the frozen `EvidenceStore.listEvidence`
 * bounded-pagination method — never an unbounded read — walking every page
 * at the resolved horizon and composing them into the single collection
 * `buildSnapshotFromHorizonSelectedEvidence` consumes. That function
 * (S6-C1) never re-derives semantic horizon bounds from its own input,
 * because a horizon-bounded subset's own maximum `recordedSequence` is not
 * necessarily the store's true watermark — `listEvidence` itself is the
 * single place that validates the requested horizon against the store's
 * complete bounds (ADR-0023 § 5), exactly once per resolution.
 *
 * Successful snapshots are cached by the complete `(asOf, horizon,
 * derivationVersion)` identity, so referential integrity (ADR-0023 § 6) is
 * evaluated at most once per distinct identity this resolver serves, and
 * repeated resolution of the same identity returns the same immutable
 * `Snapshot` reference without rebuilding it. A failed resolution is never
 * cached, and a failure at one identity can never poison a different
 * identity's own, independently computed, result — each cache lookup and
 * insertion is scoped to its own identity key.
 *
 * Resolution is single-flight per identity: the in-flight build `Promise`
 * itself is cached the moment it starts, before it is ever awaited, so
 * concurrent callers requesting the same not-yet-cached identity share
 * exactly one Evidence load and one `buildSnapshotFromHorizonSelectedEvidence`
 * call (and so evaluate referential integrity exactly once, never once per
 * concurrent caller) and receive the exact same settled result — the same
 * `Snapshot` reference on success, or the same rejection on failure. A
 * rejected in-flight entry is removed the moment it settles, so a later
 * (or a differently-keyed concurrent) call always attempts a fresh build
 * rather than replaying a stale failure.
 *
 * `derivationVersion` is resolved through `resolveDerivationPolicy` before
 * any `EvidenceStore` call is made for a given identity (ADR-0023 § 3): an
 * unsupported token rejects immediately, invoking neither `Clock` nor
 * `getCurrentWatermark()` nor `listEvidence()` — never masked behind a
 * store failure or an otherwise-invalid horizon that would only surface
 * after I/O.
 *
 * Pure with respect to time and randomness: no code path calls `Date.now()`
 * or argument-less `new Date()`; the only place this module reads a real
 * notion of "now" is the injected `Clock`, on the cursorless-`latest` path.
 */
import {
  MAXIMUM_PAGE_LIMIT,
  snapshotIdentitySchema,
  type Evidence,
  type EvidenceStore,
  type SnapshotIdentity,
} from "@atlast/shared";
import { assertValidClockReading, type Clock } from "./clock.ts";
import {
  ACTIVE_DERIVATION_VERSION,
  resolveDerivationPolicy,
} from "./derivation-version-lookup.ts";
import {
  reconcileEvidenceAtHorizon,
  type ReconciliationResult,
} from "./reconciliation.ts";
import { InvalidReadCoordinateError } from "./repository-errors.ts";
import {
  composeSnapshotFromReconciliationResult,
  type Snapshot,
} from "./snapshot-construction.ts";

/** A resolved identity, serialized deterministically for use as a cache key. */
function identityCacheKey(identity: SnapshotIdentity): string {
  return `${identity.asOf}|${String(identity.horizon)}|${identity.derivationVersion}`;
}

/**
 * Walk every page of `EvidenceStore.listEvidence(horizon, …)` at the
 * maximum allowed page size and compose the pages into one collection.
 * Never reads an unbounded page — the frozen `EvidenceStore` interface
 * offers no such method — and never mutates the store or any page's
 * returned array.
 */
async function loadAllEvidenceAtHorizon(
  evidenceStore: EvidenceStore,
  horizon: number,
): Promise<Evidence[]> {
  const collectedEvidence: Evidence[] = [];
  let cursor: string | undefined;
  do {
    const page = await evidenceStore.listEvidence(horizon, {
      limit: MAXIMUM_PAGE_LIMIT,
      ...(cursor === undefined ? {} : { cursor }),
    });
    collectedEvidence.push(...page.items);
    cursor = page.page.nextCursor;
  } while (cursor !== undefined);
  return collectedEvidence;
}

/**
 * Resolves `ReadMode` requests to cached, immutable snapshots, and serves
 * an already-authoritative cursor-bound identity through the same cache
 * without ever invoking `Clock` or re-reading the current watermark for
 * either the pinned or the cursor-authoritative path.
 */
export class SnapshotResolver {
  private readonly evidenceStore: EvidenceStore;
  private readonly clock: Clock;
  /**
   * Keyed by the complete resolved identity. Holds the **in-flight build
   * `Promise`**, inserted before it is awaited — never a settled
   * `Snapshot` value directly — so a second concurrent caller for the same
   * not-yet-resolved identity observes the in-progress entry and awaits
   * that exact same promise instead of starting a second build. Entries
   * are removed the moment their promise rejects, so a failure is never
   * replayed to a later or differently-timed caller.
   */
  private readonly snapshotBuildsByIdentity = new Map<
    string,
    Promise<Snapshot>
  >();
  /**
   * ADR-0038-A: reconciliation is a pure function of `(evidenceRecords,
   * horizon, policy)` alone — it never depends on `asOf` (`reconciliation.ts`
   * takes no `asOf` parameter). Once computed for a given `(horizon,
   * derivationVersion)`, the complete `ReconciliationResult` is safe to
   * reuse for every future request at that same `(horizon,
   * derivationVersion)` regardless of `asOf`, because Evidence is
   * append-only and a horizon's watermark, once reached, never changes
   * retroactively (the same invariant the `snapshotBuildsByIdentity` cache
   * above already relies on for the stronger, asOf-inclusive key). This
   * cache is what lets a `"latest"` read — whose `asOf` differs on every
   * call — reuse a still-valid reconciliation result instead of
   * recomputing the complete historical revision sequence from scratch
   * merely because `asOf` advanced. Never keyed by, or invalidated using,
   * wall-clock time.
   *
   * Deliberately a **single most-recent slot, not an unbounded map**: a
   * `ReconciliationResult` itself holds the complete historical revision
   * set at its horizon (provenance sizes 1..horizon), so its own memory
   * footprint grows with the square of the horizon (ADR-0038 Complexity
   * Boundary (C)). A performance-validation run of this same change
   * (ADR-0038-A) that cached one entry per distinct horizon under
   * continuous polling — the real M5 workload's own pattern — measurably
   * exhausted the Node heap: retaining many past horizons' full revision
   * histories simultaneously is *worse* than the pre-ADR-0038-A baseline,
   * not better. A single-slot cache bounds memory to exactly one
   * `ReconciliationResult` (the most recently computed horizon) regardless
   * of how many distinct horizons are ever requested over a session's
   * lifetime, while still fully serving this ADR's actual target: repeated
   * `"latest"` reads at whatever the *current* horizon is. A pinned read at
   * an older horizon that is not the single cached entry simply falls back
   * to a fresh reconciliation — exactly the same behavior as before
   * ADR-0038-A, no regression, just no cache benefit for that one request.
   */
  private mostRecentReconciliationResult:
    | { readonly cacheKey: string; readonly result: ReconciliationResult }
    | undefined;

  constructor(evidenceStore: EvidenceStore, clock: Clock) {
    this.evidenceStore = evidenceStore;
    this.clock = clock;
  }

  /**
   * Resolve a cursorless `latest` request: `Clock` and
   * `getCurrentWatermark()` are each invoked exactly once, and an empty
   * store rejects with `EMPTY_EVIDENCE_STORE` before `Clock` is ever
   * called — a horizon of `0` can never become part of a served identity
   * (ADR-0023 §§ 1, 5). `derivationVersion` is always the active policy
   * token here, so it needs no separate pre-validation on this path.
   */
  async resolveLatestSnapshot(): Promise<Snapshot> {
    const currentWatermark = await this.evidenceStore.getCurrentWatermark();
    if (currentWatermark === 0) {
      throw new InvalidReadCoordinateError({ reason: "EMPTY_EVIDENCE_STORE" });
    }

    const asOf = assertValidClockReading(this.clock());

    const identity: SnapshotIdentity = {
      asOf,
      horizon: currentWatermark,
      derivationVersion: ACTIVE_DERIVATION_VERSION,
    };
    return this.resolveAndCache(identity);
  }

  /**
   * Resolve a pinned request from the caller's complete `SnapshotIdentity`.
   * Never invokes `Clock` and never calls `getCurrentWatermark()` — the
   * pinned horizon's validity against the store's true bounds is decided
   * entirely by `EvidenceStore.listEvidence`'s own semantic-horizon check
   * when Evidence is loaded. `derivationVersion` is validated before any
   * store call (ADR-0023 § 3): an unsupported token rejects immediately,
   * invoking neither `Clock`, `getCurrentWatermark()`, nor `listEvidence()`.
   */
  async resolvePinnedSnapshot(identity: SnapshotIdentity): Promise<Snapshot> {
    const resolvedIdentity = snapshotIdentitySchema.parse(identity);
    resolveDerivationPolicy(resolvedIdentity.derivationVersion);
    return this.resolveAndCache(resolvedIdentity);
  }

  /**
   * Resolve an already-authoritative cursor-bound identity — the identity
   * a caller decoded from a continuation cursor and has already validated
   * as binding-consistent with the current request (cursor decoding and
   * binding comparison themselves are later S6-C work, not this method).
   * Behaves exactly like `resolvePinnedSnapshot`: no `Clock` invocation, no
   * watermark re-read, and `derivationVersion` is validated before any
   * store call, so a `latest`-mode graph continuation walks one consistent
   * snapshot end-to-end even if Evidence is appended or the injected clock
   * advances between pages.
   */
  async resolveCursorBoundSnapshot(
    identity: SnapshotIdentity,
  ): Promise<Snapshot> {
    const resolvedIdentity = snapshotIdentitySchema.parse(identity);
    resolveDerivationPolicy(resolvedIdentity.derivationVersion);
    return this.resolveAndCache(resolvedIdentity);
  }

  /**
   * Single-flight cache-then-build: an identity already served
   * successfully (or currently being built) returns the exact same
   * in-flight/settled `Promise<Snapshot>` without starting a second build
   * or re-evaluating referential integrity. A build failure removes its
   * own cache entry the moment it settles — never inserted as a lasting
   * cached failure — and, because each lookup/insertion is scoped to its
   * own identity's cache key, a failure at one identity can never affect a
   * different identity's own cache entry or result.
   */
  private resolveAndCache(identity: SnapshotIdentity): Promise<Snapshot> {
    const cacheKey = identityCacheKey(identity);
    const existingBuild = this.snapshotBuildsByIdentity.get(cacheKey);
    if (existingBuild !== undefined) {
      return existingBuild;
    }

    const buildPromise = this.buildSnapshotForIdentity(identity);
    this.snapshotBuildsByIdentity.set(cacheKey, buildPromise);
    buildPromise.catch(() => {
      this.snapshotBuildsByIdentity.delete(cacheKey);
    });
    return buildPromise;
  }

  private async buildSnapshotForIdentity(
    identity: SnapshotIdentity,
  ): Promise<Snapshot> {
    const reconciliationResult = await this.resolveReconciliationResult(
      identity.horizon,
      identity.derivationVersion,
    );
    return composeSnapshotFromReconciliationResult(
      reconciliationResult,
      identity,
    );
  }

  /**
   * ADR-0038-A: the one place this resolver may skip a full reconciliation.
   * A cache hit at `(horizon, derivationVersion)` returns the exact same
   * `ReconciliationResult` reference already derived for a prior request at
   * that same horizon — regardless of that prior request's own `asOf` — so
   * `composeSnapshotFromReconciliationResult` can compose a fresh `Snapshot`
   * at the caller's own `asOf` without re-deriving the complete historical
   * revision sequence. A cache miss still performs exactly the same
   * `EvidenceStore.listEvidence`-bounded load and the same
   * `reconcileEvidenceAtHorizon` call this resolver always performed before
   * ADR-0038-A — the historical-materialization cost itself is unchanged
   * and unavoidable the first time a horizon is genuinely reconciled
   * (ADR-0038 Complexity Boundary (C)); only the *repeated* cost on every
   * subsequent read at that same horizon is eliminated.
   */
  private async resolveReconciliationResult(
    horizon: number,
    derivationVersion: string,
  ): Promise<ReconciliationResult> {
    const reconciliationCacheKey = `${String(horizon)}|${derivationVersion}`;
    if (
      this.mostRecentReconciliationResult?.cacheKey === reconciliationCacheKey
    ) {
      return this.mostRecentReconciliationResult.result;
    }

    const horizonSelectedEvidence = await loadAllEvidenceAtHorizon(
      this.evidenceStore,
      horizon,
    );
    const policy = resolveDerivationPolicy(derivationVersion);
    const reconciliationResult = reconcileEvidenceAtHorizon(
      horizonSelectedEvidence,
      horizon,
      policy,
    );
    this.mostRecentReconciliationResult = {
      cacheKey: reconciliationCacheKey,
      result: reconciliationResult,
    };
    return reconciliationResult;
  }
}
