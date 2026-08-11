/**
 * The in-memory `EvidenceStore` implementation (S6-B, accepted ADR-0023
 * §§ 1–2, 5, 7–9): the append-only, total-ordered store of immutable
 * Evidence the S2 `EvidenceStore` interface (`packages/shared/src/
 * repositories.ts`) describes. This module implements only the Evidence
 * side of S6 — no `TopologyGraphStore`, no snapshot construction, no
 * reconciliation orchestration, and no graph cursors.
 *
 * - **Clock injection (ADR-0023 § 1).** The constructor requires an explicit
 *   `Clock`. `EvidenceStore` has no `latest`/pinned identity of its own (that
 *   concept belongs to `TopologyGraphStore`), so no method here ever
 *   invokes it — the parameter exists solely to satisfy "every concrete
 *   construction path takes an explicit Clock," and to make "no Evidence
 *   operation reads wall-clock time" trivially, structurally true rather
 *   than a convention someone could quietly violate later.
 * - **Atomic append (ADR-0023 § 8).** The complete batch is validated
 *   through the shared `evidenceCollectionSchema` first; a schema failure
 *   surfaces as `ZodError`, unchanged. Only a schema-valid batch that
 *   violates a repository state invariant — an identifier collision against
 *   already-stored Evidence, or a `recordedSequence` that does not strictly
 *   increase across (current watermark, batch…) — throws
 *   `EvidenceAppendError`. All validation completes before any mutation;
 *   either rejection leaves the store's watermark and identifier set
 *   unchanged.
 * - **Cursor-bound continuation (ADR-0023 § 2).** `listEvidence` issues and
 *   consumes the S6-A Evidence cursor shape. A continuation is bound to the
 *   cursor's own horizon, ordering, and page size — never re-derived — so a
 *   paginated walk observes one horizon end-to-end even as Evidence is
 *   appended between pages.
 * - **Semantic horizon validity (ADR-0023 § 5).** A non-empty store's valid
 *   horizon range is exactly `[firstRecordedSequence, currentWatermark]`. A
 *   `listEvidence` horizon outside that range rejects loudly —
 *   `HORIZON_BEFORE_FIRST_EVIDENCE` below, `HORIZON_AFTER_CURRENT_WATERMARK`
 *   above — rather than silently clamping. A future horizon is never
 *   accepted: Evidence appended later, with a `recordedSequence` at or below
 *   a previously accepted future horizon, would otherwise change what an
 *   already-issued cursor's continuation returns, which is exactly the
 *   moving-target behavior pinned/bounded reads must never exhibit.
 */
import {
  evidenceCollectionSchema,
  type Evidence,
  type EvidenceIdentifier,
  type EvidencePage,
  type EvidenceStore,
  type PageRequest,
} from "@atlast/shared";
import type { Clock } from "./clock.ts";
import {
  decodeEvidenceCursor,
  encodeEvidenceCursor,
  type EvidenceCursorPayload,
} from "./cursor-payload.ts";
import {
  assertValidEvidenceHorizon,
  selectEvidenceAtHorizon,
} from "./evidence-order.ts";
import {
  EvidenceAppendError,
  InvalidReadCoordinateError,
  UnknownIdentifierError,
  type CursorMismatchField,
} from "./repository-errors.ts";

/**
 * The one deterministic Evidence ordering token (ADR-0016's total order:
 * `observedAt`, then `recordedSequence`) bound into every issued Evidence
 * cursor. There is exactly one Evidence ordering in M1, so this constant is
 * never caller-supplied — it exists only so a forged or foreign cursor
 * naming a different ordering token is distinguishable as a binding
 * mismatch rather than silently honored.
 */
const EVIDENCE_TOTAL_ORDER_TOKEN = "observed-at-then-recorded-sequence";

/** Recursively freeze a retained Evidence copy so no code path can mutate stored state. */
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
 * The in-memory `EvidenceStore` (ADR-0023 §§ 1, 5, 7–9). Construction always
 * takes an explicit `Clock`, even though no method here ever calls it —
 * Evidence has no wall-clock-resolved read mode. The parameter is retained
 * (not merely accepted and discarded) so a future S6-internal extension of
 * this class inherits the same injected instance rather than a second,
 * possibly divergent one.
 */
export class InMemoryEvidenceStore implements EvidenceStore {
  private readonly clock: Clock;
  private readonly recordsByIdentifier = new Map<string, Evidence>();
  private currentWatermark = 0;
  /**
   * The lowest retained `recordedSequence`, or `undefined` for an empty
   * store. Because `appendEvidence` enforces a `recordedSequence` strictly
   * greater than the current watermark for every accepted record (§ 8), the
   * very first record ever accepted necessarily carries the lowest sequence
   * the store will ever hold — set once, on the empty-to-non-empty
   * transition, and never revisited afterward.
   */
  private firstRecordedSequence: number | undefined;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /**
   * Validate the complete batch through `evidenceCollectionSchema` first — a
   * schema failure surfaces as `ZodError`, unchanged. Only then check the two
   * repository-state invariants the shared schema cannot see: identifier
   * collision against already-stored Evidence, and non-increasing
   * `recordedSequence` across (current watermark, batch…). Both checks read
   * only already-stored state; nothing is mutated until every check has
   * passed, so either rejection leaves the store completely unchanged.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- the S2 EvidenceStore contract is "async only" (ADR-0018 invariant) so a synchronous throw still rejects the returned Promise rather than escaping it; the in-memory body itself has nothing to await.
  async appendEvidence(evidenceRecords: readonly Evidence[]): Promise<void> {
    const validatedRecords = evidenceCollectionSchema.parse(evidenceRecords);

    if (validatedRecords.length === 0) {
      return;
    }

    this.rejectDuplicateIdentifiers(validatedRecords);
    this.rejectNonIncreasingSequences(validatedRecords);

    let newWatermark = this.currentWatermark;
    for (const record of validatedRecords) {
      const retainedCopy = deepFreeze(structuredClone(record));
      this.recordsByIdentifier.set(retainedCopy.identifier, retainedCopy);
      newWatermark = Math.max(newWatermark, retainedCopy.recordedSequence);
      // rejectNonIncreasingSequences already proved every accepted sequence
      // strictly exceeds the prior watermark, so the very first record this
      // store ever accepts necessarily carries the lowest sequence it will
      // ever hold — set once, on the empty-to-non-empty transition.
      this.firstRecordedSequence ??= retainedCopy.recordedSequence;
    }
    this.currentWatermark = newWatermark;
  }

  /**
   * Collision check against **already-stored** Evidence only — the shared
   * `evidenceCollectionSchema` already rejects an intra-batch duplicate
   * identifier, so any duplicate surviving here is necessarily a collision
   * with a prior append. Names exactly the colliding records, never the
   * whole batch.
   */
  private rejectDuplicateIdentifiers(
    validatedRecords: readonly Evidence[],
  ): void {
    const collidingIdentifiers: string[] = [];
    const collidingSequences: number[] = [];
    for (const record of validatedRecords) {
      if (this.recordsByIdentifier.has(record.identifier)) {
        collidingIdentifiers.push(record.identifier);
        collidingSequences.push(record.recordedSequence);
      }
    }
    if (collidingIdentifiers.length > 0) {
      throw new EvidenceAppendError({
        reason: "DUPLICATE_EVIDENCE_IDENTIFIER",
        evidenceIdentifiers: collidingIdentifiers,
        recordedSequences: collidingSequences,
        currentWatermark: this.currentWatermark,
      });
    }
  }

  /**
   * Walk the batch in caller-supplied (ingestion) order, tracking the
   * highest `recordedSequence` accepted so far, starting from the current
   * watermark. A record whose `recordedSequence` does not exceed that
   * running value is offending — reported by name — and does not advance
   * the running value, so later records are still judged against the last
   * genuinely increasing sequence rather than against an offending one.
   */
  private rejectNonIncreasingSequences(
    validatedRecords: readonly Evidence[],
  ): void {
    const offendingIdentifiers: string[] = [];
    const offendingSequences: number[] = [];
    let runningWatermark = this.currentWatermark;
    for (const record of validatedRecords) {
      if (record.recordedSequence <= runningWatermark) {
        offendingIdentifiers.push(record.identifier);
        offendingSequences.push(record.recordedSequence);
      } else {
        runningWatermark = record.recordedSequence;
      }
    }
    if (offendingIdentifiers.length > 0) {
      throw new EvidenceAppendError({
        reason: "NON_INCREASING_RECORDED_SEQUENCE",
        evidenceIdentifiers: offendingIdentifiers,
        recordedSequences: offendingSequences,
        currentWatermark: this.currentWatermark,
      });
    }
  }

  /**
   * Stable lookup by identifier. The returned value is the store's own
   * deep-frozen retained copy — safe to hand back by reference, since a
   * frozen leaf value cannot be mutated regardless of how many callers hold
   * it (ADR-0023 § 7).
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- the S2 EvidenceStore contract is "async only" (ADR-0018 invariant) so a synchronous throw still rejects the returned Promise rather than escaping it; the in-memory body itself has nothing to await.
  async getEvidenceByIdentifier(
    evidenceIdentifier: EvidenceIdentifier,
  ): Promise<Evidence> {
    const record = this.recordsByIdentifier.get(evidenceIdentifier);
    if (record === undefined) {
      throw new UnknownIdentifierError({
        identifierKind: "evidence",
        identifier: evidenceIdentifier,
      });
    }
    return record;
  }

  /** `0` for an empty store; otherwise the greatest retained `recordedSequence`. */
  // eslint-disable-next-line @typescript-eslint/require-await -- the S2 EvidenceStore contract is "async only" (ADR-0018 invariant); the in-memory body itself has nothing to await.
  async getCurrentWatermark(): Promise<number> {
    return this.currentWatermark;
  }

  /**
   * Bounded, ordered read of Evidence at or below `horizon`, in the
   * ADR-0016 total order. A continuation cursor binds the originating
   * horizon, ordering, and page size; the store never re-resolves any of
   * those on a continuation — it validates the request restates them
   * exactly, so a paginated walk observes one horizon end-to-end even as
   * Evidence is appended between pages.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- the S2 EvidenceStore contract is "async only" (ADR-0018 invariant) so a synchronous throw still rejects the returned Promise rather than escaping it; the in-memory body itself has nothing to await.
  async listEvidence(
    horizon: number,
    pageRequest: PageRequest,
  ): Promise<EvidencePage> {
    // Structural horizon validity (integer, 1..MAX_SAFE_INTEGER) is the S4
    // primitive's own concern — a RangeError from here is unchanged.
    // selectEvidenceAtHorizon re-checks this itself; asserting it up front
    // simply lets the semantic check below run against a horizon already
    // known to be a valid recordedSequence-shaped integer.
    assertValidEvidenceHorizon(horizon);

    let continuationCursor: EvidenceCursorPayload | undefined;
    if (pageRequest.cursor !== undefined) {
      continuationCursor = decodeEvidenceCursor(pageRequest.cursor);
      this.validateEvidenceCursorBinding(
        continuationCursor,
        horizon,
        pageRequest.limit,
      );
    }

    // Semantic horizon validity (ADR-0023 § 5): a non-empty store's valid
    // horizon range is exactly [firstRecordedSequence, currentWatermark].
    // Checked identically for a fresh request and a continuation — a
    // continuation's horizon has already been proven equal to the
    // cursor-bound horizon above, so re-validating it here is exactly the
    // same rule, not a special case.
    this.assertSemanticallyValidHorizon(horizon);

    // selectEvidenceAtHorizon both filters (recordedSequence <= horizon) and
    // sorts by the ADR-0016 total order.
    const orderedRecords = selectEvidenceAtHorizon(
      [...this.recordsByIdentifier.values()],
      horizon,
    );

    let startIndex = 0;
    if (continuationCursor !== undefined) {
      const positionIndex = orderedRecords.findIndex(
        (record) => record.identifier === continuationCursor.position,
      );
      if (positionIndex === -1) {
        // The cursor decoded successfully but cannot supply its required
        // binding metadata against this (horizon-immutable) ordered set —
        // an unusable cursor, not a parameter mismatch (ADR-0023 § 2).
        throw new InvalidReadCoordinateError({
          reason: "INVALID_CURSOR",
          cursorKind: "evidence",
        });
      }
      startIndex = positionIndex + 1;
    }

    const pageItems = orderedRecords.slice(
      startIndex,
      startIndex + pageRequest.limit,
    );
    const hasMore = startIndex + pageItems.length < orderedRecords.length;

    const lastItem = pageItems.at(-1);
    if (hasMore && lastItem !== undefined) {
      return {
        items: pageItems,
        page: {
          hasMore: true,
          nextCursor: encodeEvidenceCursor({
            cursorKind: "evidence",
            horizon,
            ordering: EVIDENCE_TOTAL_ORDER_TOKEN,
            pageSize: pageRequest.limit,
            position: lastItem.identifier,
          }),
        },
      };
    }
    return {
      items: pageItems,
      page: { hasMore: false },
    };
  }

  /**
   * Enforce ADR-0023 § 5's closed semantic-horizon rule for a non-empty
   * store: a horizon is valid exactly when
   * `firstRecordedSequence <= horizon <= currentWatermark`. An empty store
   * (`firstRecordedSequence` still `undefined`) has no accepted-here
   * `EvidenceStore`-level empty-store rejection to apply — ADR-0023 § 5
   * states the `EMPTY_EVIDENCE_STORE` rejection for a **cursorless `latest`
   * `TopologyGraphStore`** read, not for `EvidenceStore.listEvidence`
   * itself — so this method is intentionally a no-op against an empty
   * store, preserving `listEvidence`'s existing (unchanged) empty-store
   * behavior rather than inventing a new policy.
   */
  private assertSemanticallyValidHorizon(horizon: number): void {
    if (this.firstRecordedSequence === undefined) {
      return;
    }
    if (horizon < this.firstRecordedSequence) {
      throw new InvalidReadCoordinateError({
        reason: "HORIZON_BEFORE_FIRST_EVIDENCE",
        firstRecordedSequence: this.firstRecordedSequence,
        currentWatermark: this.currentWatermark,
      });
    }
    if (horizon > this.currentWatermark) {
      throw new InvalidReadCoordinateError({
        reason: "HORIZON_AFTER_CURRENT_WATERMARK",
        firstRecordedSequence: this.firstRecordedSequence,
        currentWatermark: this.currentWatermark,
      });
    }
  }

  /**
   * A continuation must exactly match the cursor-bound horizon, the one
   * fixed Evidence ordering token, and the page size (ADR-0023 § 2). Any
   * conflict rejects with `CURSOR_BINDING_MISMATCH` naming every mismatched
   * field — never just the first one found.
   */
  private validateEvidenceCursorBinding(
    cursor: EvidenceCursorPayload,
    requestedHorizon: number,
    requestedPageSize: number,
  ): void {
    const mismatchFields: CursorMismatchField[] = [];
    if (cursor.horizon !== requestedHorizon) {
      mismatchFields.push("horizon");
    }
    if (cursor.ordering !== EVIDENCE_TOTAL_ORDER_TOKEN) {
      mismatchFields.push("ordering");
    }
    if (cursor.pageSize !== requestedPageSize) {
      mismatchFields.push("pageSize");
    }
    if (mismatchFields.length > 0) {
      throw new InvalidReadCoordinateError({
        reason: "CURSOR_BINDING_MISMATCH",
        cursorKind: "evidence",
        requestedHorizon,
        cursorBoundHorizon: cursor.horizon,
        mismatchFields,
      });
    }
  }
}
