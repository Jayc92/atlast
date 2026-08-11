/**
 * The in-memory `TopologyGraphStore` implementation (S6-C2b, accepted
 * ADR-0023 §§ 2, 4, 6, 9): the seven frozen `TopologyGraphStore` methods
 * (`getSubject`, `getAssertionRevision`, `listEntities`, `searchSubjects`,
 * `traverse`, `getEvidenceChain`, `getSnapshotSummary`), composed entirely
 * on top of the already-committed `SnapshotResolver` (S6-C2a) — this module
 * duplicates none of snapshot resolution, reconciliation, checksum
 * construction, or Evidence paging.
 *
 * - **Read-mode resolution.** Every method takes a `ReadMode`
 *   (`{ mode: "latest" }` or `{ mode: "pinned", identity }`) and resolves it
 *   to a `Snapshot` through `SnapshotResolver`; `getSnapshotSummary` takes a
 *   complete `SnapshotIdentity` directly (ADR-0016/0017: snapshots accept
 *   no latest mode).
 * - **Graph cursors (ADR-0023 § 2).** `listEntities`, `searchSubjects`, and
 *   `getEvidenceChain` are the three graph-cursor-issuing operations. Each
 *   binds the complete resolved `SnapshotIdentity`, the originating
 *   operation, the operation-specific coordinates (filter, search query, or
 *   evidence-chain subject identifier), the deterministic ordering, the
 *   page size, and the continuation position. A continuation must match
 *   every bound field exactly; a `latest`-mode continuation never re-invokes
 *   `SnapshotResolver.resolveLatestSnapshot` — it resolves the cursor-bound
 *   identity directly through `resolveCursorBoundSnapshot`, so a paginated
 *   `latest` walk observes one consistent snapshot end-to-end even as
 *   Evidence is appended between pages.
 * - **Freshness (ADR-0022 § 13).** Computed per returned assertion revision
 *   via `classifyFreshness`, with `latestSupportingObservedAt` derived as
 *   the maximum `observedAt` among the revision's own provenance Evidence
 *   records (ADR-0023's own audit summary states this derivation exactly).
 * - **Referential integrity (ADR-0023 § 6)** is already enforced once, at
 *   snapshot-construction time, by `SnapshotResolver`/`buildSnapshot*` — no
 *   method here re-checks it; every subject and assertion this class reads
 *   comes from an already-referentially-sound `Snapshot`.
 * - **Isolation.** No method mutates or freezes caller input; every
 *   returned envelope, array, and cursor structure is newly created per
 *   call, so mutating a caller's copy of a result can never reach store
 *   state, the underlying `Snapshot` cache, or a subsequent read.
 * - **Purity of time.** No code path calls `Date.now()` or argument-less
 *   `new Date()` — the only place this module (transitively, through
 *   `SnapshotResolver`) reads a real notion of "now" is the injected
 *   `Clock`, exactly once per cursorless `latest` request.
 */
import {
  entityInventoryFilterSchema,
  pageRequestSchema,
  readModeSchema,
  searchQuerySchema,
  snapshotIdentitySchema,
  traversalRequestBoundsSchema,
  CURRENT_SCHEMA_VERSION,
  MAXIMUM_TRAVERSAL_RESULT_BUDGET,
  type AssertionDetailResult,
  type EntityIdentifier,
  type EntityInventoryFilter,
  type EntityPage,
  type EntityReadResult,
  type Evidence,
  type EvidenceChainResult,
  type EvidenceStore,
  type GraphAssertion,
  type JsonValue,
  type PageRequest,
  type ReadMode,
  type SearchQuery,
  type SnapshotIdentity,
  type SnapshotSummary,
  type SubjectDetailResult,
  type SubjectPage,
  type SubjectReadResult,
  type TopologyGraphStore,
  type TraversalRequestBounds,
  type TraversalResult,
} from "@atlast/shared";
import type { Clock } from "./clock.ts";
import { sortIdentifiers } from "./collection-order.ts";
import { compareUtf16CodeUnits } from "./utf16-comparator.ts";
import {
  decodeGraphCursor,
  encodeGraphCursor,
  type GraphCursorOperation,
  type GraphCursorPayload,
} from "./cursor-payload.ts";
import { M1_V1_DERIVATION_POLICY } from "./derivation-policy.ts";
import { classifyFreshness } from "./freshness.ts";
import {
  InvalidReadCoordinateError,
  UnknownIdentifierError,
  type CursorMismatchField,
} from "./repository-errors.ts";
import { SnapshotResolver } from "./snapshot-resolver.ts";
import type { Snapshot, SnapshotSubjectView } from "./snapshot-construction.ts";

/** The deterministic ordering token `listEntities`/`searchSubjects` cursors bind: identifier ascending. */
const IDENTIFIER_ASCENDING_ORDER_TOKEN = "identifier-ascending";

/**
 * The deterministic ordering token `getEvidenceChain` cursors bind: the
 * ADR-0016 Evidence total order (`observedAt` ascending, then
 * `recordedSequence` ascending) — the exact same token
 * `evidence-store.ts` binds into its own Evidence cursors, since both
 * describe the identical ordering rule. Evidence-chain results are never
 * identifier-ascending; labeling them so would misrepresent the actual
 * ordering a replayed cursor observes.
 */
const EVIDENCE_TOTAL_ORDER_TOKEN = "observed-at-then-recorded-sequence";

/** Recursively freeze a newly built response structure so no caller mutation can reach a subsequent read. */
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
 * The maximum `observedAt` among a revision's own provenance Evidence
 * (ADR-0023's audit summary; ADR-0022 § 13's freshness contract). Every
 * provenance identifier is guaranteed to dereference (ADR-0014: a
 * revision's provenance is non-empty and every citation is real Evidence),
 * so this never falls through to an empty maximum.
 */
async function latestSupportingObservedAt(
  evidenceStore: EvidenceStore,
  revision: GraphAssertion,
): Promise<string> {
  let latest: string | undefined;
  for (const evidenceIdentifier of revision.provenance) {
    const evidenceRecord =
      await evidenceStore.getEvidenceByIdentifier(evidenceIdentifier);
    if (latest === undefined || evidenceRecord.observedAt > latest) {
      latest = evidenceRecord.observedAt;
    }
  }
  // revision.provenance is schema-guaranteed non-empty (provenanceSchema).
  if (latest === undefined) {
    throw new TypeError(
      `Assertion ${revision.identifier} has empty provenance, violating the shared provenance contract`,
    );
  }
  return latest;
}

/**
 * Build one `AssertionReadResult` (revision + query-time freshness) for a
 * visible revision at the resolved `asOf`.
 */
async function buildAssertionReadResult(
  evidenceStore: EvidenceStore,
  revision: GraphAssertion,
  asOf: string,
): Promise<{
  revision: GraphAssertion;
  freshness: ReturnType<typeof classifyFreshness>;
}> {
  const observedAt = await latestSupportingObservedAt(evidenceStore, revision);
  return {
    revision,
    freshness: classifyFreshness(observedAt, asOf, M1_V1_DERIVATION_POLICY),
  };
}

/**
 * Build one `SubjectReadResult`: the subject with every one of its visible
 * assertion revisions, each paired with its freshness. Assertions are
 * already sorted by assertion identifier on the `SnapshotSubjectView`
 * (S6-C1's own deterministic-ordering guarantee) — preserved here.
 */
async function buildSubjectReadResult(
  evidenceStore: EvidenceStore,
  subjectView: SnapshotSubjectView,
  asOf: string,
): Promise<SubjectReadResult> {
  const assertions = await Promise.all(
    subjectView.assertions.map((revision) =>
      buildAssertionReadResult(evidenceStore, revision, asOf),
    ),
  );
  return { subject: subjectView.subject, assertions };
}

/** Narrow a `SubjectReadResult` to an `EntityReadResult` — the subject is already validated as `entity`-kind by the caller. */
function toEntityReadResult(
  subjectReadResult: SubjectReadResult,
): EntityReadResult {
  if (subjectReadResult.subject.subjectKind !== "entity") {
    throw new TypeError(
      `Expected an entity subject, received subjectKind "${subjectReadResult.subject.subjectKind}"`,
    );
  }
  return {
    subject: subjectReadResult.subject,
    assertions: subjectReadResult.assertions,
  };
}

/**
 * The claimed `entityType` values a visible entity subject's visible
 * revisions carry — the match-by-any-visible-claim set (ADR-0020 § 1).
 */
function visibleClaimedEntityTypes(subjectView: SnapshotSubjectView): string[] {
  const claimedTypes = new Set<string>();
  for (const revision of subjectView.assertions) {
    if (revision.claim.claimKind === "entity") {
      claimedTypes.add(revision.claim.entityType);
    }
  }
  return [...claimedTypes];
}

/**
 * A JSON-safe representation of the entity-inventory filter for cursor
 * coordinates: an absent `entityType` becomes an omitted key, never an
 * explicit `undefined` value (the shared `JsonValue` contract has no
 * representation for `undefined`).
 */
function entityInventoryFilterCoordinates(
  filter: EntityInventoryFilter,
): Record<string, string> {
  return filter.entityType === undefined
    ? {}
    : { entityType: filter.entityType };
}

/**
 * Structural equality over already-canonical `JsonValue`s (both the decoded
 * cursor's `coordinates` and a freshly built comparison value are the
 * output of `toCanonicalJsonValue`/plain object literals with no key-order
 * ambiguity for this module's shapes), used to compare cursor-bound
 * operation-specific coordinates against the current request.
 */
function jsonValuesEqual(first: JsonValue, second: JsonValue): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/**
 * Split a decorated, sorted array into one page (up to `limit` items) plus
 * the position (if any) at which a continuation should resume. Applies to
 * every graph cursor-bearing collection read identically.
 */
function paginateSorted<ElementType>(
  sortedElements: readonly ElementType[],
  startAfterPosition: string | undefined,
  limit: number,
  identifierOf: (element: ElementType) => string,
): { pageItems: ElementType[]; nextPosition: string | undefined } {
  let startIndex = 0;
  if (startAfterPosition !== undefined) {
    const positionIndex = sortedElements.findIndex(
      (element) => identifierOf(element) === startAfterPosition,
    );
    if (positionIndex === -1) {
      throw new InvalidReadCoordinateError({
        reason: "INVALID_CURSOR",
        cursorKind: "graph",
      });
    }
    startIndex = positionIndex + 1;
  }
  const pageItems = sortedElements.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + pageItems.length < sortedElements.length;
  const lastItem = pageItems.at(-1);
  return {
    pageItems,
    nextPosition:
      hasMore && lastItem !== undefined ? identifierOf(lastItem) : undefined,
  };
}

/**
 * Compute the exact, complete set of ADR-0023 § 2 binding mismatches
 * between a decoded graph cursor and the current request — pure, and
 * requiring no snapshot resolution: for a `pinned` request, the "resolved"
 * identity a pinned read would produce is always exactly its declared
 * identity (pinned reads never transform their pin), so the caller's
 * requested identity is compared directly, before any `EvidenceStore` or
 * `SnapshotResolver` call. For a `latest` request, `requestedIdentity` is
 * `undefined` and no identity comparison is made at all — a `latest`
 * continuation never resolves a *new* identity to conflict with (ADR-0023
 * § 2: "there is no second identity to report, only conflicting
 * operation/filter/ordering/page-size parameters").
 */
function collectGraphCursorMismatches(
  cursor: GraphCursorPayload,
  requestedIdentity: SnapshotIdentity | undefined,
  operation: GraphCursorOperation,
  coordinatesEqual: boolean,
  expectedOrdering: string,
  requestedPageSize: number,
): CursorMismatchField[] {
  const mismatchFields: CursorMismatchField[] = [];
  if (cursor.operation !== operation) {
    mismatchFields.push("operation");
  }
  if (
    requestedIdentity !== undefined &&
    (cursor.identity.asOf !== requestedIdentity.asOf ||
      cursor.identity.horizon !== requestedIdentity.horizon ||
      cursor.identity.derivationVersion !== requestedIdentity.derivationVersion)
  ) {
    mismatchFields.push("identity");
  }
  if (!coordinatesEqual) {
    mismatchFields.push(
      operation === "searchSubjects" ? "searchQuery" : "filter",
    );
  }
  if (cursor.ordering !== expectedOrdering) {
    mismatchFields.push("ordering");
  }
  if (cursor.pageSize !== requestedPageSize) {
    mismatchFields.push("pageSize");
  }
  return mismatchFields;
}

/**
 * Reject a decoded graph cursor whose bindings conflict with the current
 * request, naming every mismatched field (ADR-0023 § 2/§ 9) — including a
 * cursor that is otherwise perfectly usable but was issued for a different
 * operation (a cross-operation replay is a binding conflict, never
 * `INVALID_CURSOR`: the token itself decoded and validated cleanly). A
 * no-op when `mismatchFields` is empty.
 */
function rejectOnGraphCursorMismatch(
  cursor: GraphCursorPayload,
  requestedIdentity: SnapshotIdentity | undefined,
  mismatchFields: readonly CursorMismatchField[],
): void {
  if (mismatchFields.length === 0) {
    return;
  }
  if (requestedIdentity === undefined) {
    throw new InvalidReadCoordinateError({
      reason: "CURSOR_BINDING_MISMATCH",
      cursorKind: "graph",
      cursorBoundIdentity: cursor.identity,
      mismatchFields,
    });
  }
  throw new InvalidReadCoordinateError({
    reason: "CURSOR_BINDING_MISMATCH",
    cursorKind: "graph",
    cursorBoundIdentity: cursor.identity,
    requestedIdentity,
    mismatchFields,
  });
}

export class InMemoryTopologyGraphStore implements TopologyGraphStore {
  private readonly evidenceStore: EvidenceStore;
  private readonly snapshotResolver: SnapshotResolver;

  constructor(evidenceStore: EvidenceStore, clock: Clock) {
    this.evidenceStore = evidenceStore;
    this.snapshotResolver = new SnapshotResolver(evidenceStore, clock);
  }

  /** Resolve a `ReadMode` to its `Snapshot` through the shared resolver — never duplicating resolution logic. */
  private async resolveSnapshot(readMode: ReadMode): Promise<Snapshot> {
    const validatedMode = readModeSchema.parse(readMode);
    return validatedMode.mode === "latest"
      ? this.snapshotResolver.resolveLatestSnapshot()
      : this.snapshotResolver.resolvePinnedSnapshot(validatedMode.identity);
  }

  /**
   * Resolve a graph collection continuation (ADR-0023 § 2, Findings 1–2):
   * decode the cursor, compare every binding field directly against the
   * request — operation, coordinates, ordering, page size, and, for a
   * `pinned` request, the caller's own declared identity — and reject
   * immediately on any conflict, **before** any `Clock`, watermark,
   * `EvidenceStore.listEvidence`, or snapshot-construction call. A
   * decodable cursor issued for a different operation is a binding
   * conflict (`CURSOR_BINDING_MISMATCH` naming `"operation"` alongside
   * every other mismatched field), never `INVALID_CURSOR` — the token
   * itself is perfectly usable, just replayed against the wrong request.
   * Only once every binding matches does resolution proceed: `latest`
   * resolves the cursor-bound identity directly through
   * `resolveCursorBoundSnapshot` (no `Clock`/watermark read); `pinned`
   * resolves the request's own identity, which is now guaranteed equal to
   * the cursor's.
   */
  private async resolveSnapshotForCursorContinuation(
    cursor: GraphCursorPayload,
    validatedReadMode: ReadMode,
    operation: GraphCursorOperation,
    coordinatesEqual: boolean,
    expectedOrdering: string,
    requestedPageSize: number,
  ): Promise<Snapshot> {
    if (validatedReadMode.mode === "latest") {
      const mismatchFields = collectGraphCursorMismatches(
        cursor,
        undefined,
        operation,
        coordinatesEqual,
        expectedOrdering,
        requestedPageSize,
      );
      rejectOnGraphCursorMismatch(cursor, undefined, mismatchFields);
      return this.snapshotResolver.resolveCursorBoundSnapshot(cursor.identity);
    }

    const requestedIdentity = validatedReadMode.identity;
    const mismatchFields = collectGraphCursorMismatches(
      cursor,
      requestedIdentity,
      operation,
      coordinatesEqual,
      expectedOrdering,
      requestedPageSize,
    );
    rejectOnGraphCursorMismatch(cursor, requestedIdentity, mismatchFields);
    return this.snapshotResolver.resolvePinnedSnapshot(requestedIdentity);
  }

  /**
   * One subject with every supporting assertion revision valid under the
   * resolved identity. Rejects with `UnknownIdentifierError` (`identifierKind:
   * "subject"`, `resolvedIdentity` populated — this read is identity-scoped)
   * if the subject has no visible assertion at the resolved identity.
   */
  async getSubject(
    subjectIdentifier: string,
    readMode: ReadMode,
  ): Promise<SubjectDetailResult> {
    const snapshot = await this.resolveSnapshot(readMode);
    const subjectView = snapshot.subjects.find(
      (view) => view.subject.identifier === subjectIdentifier,
    );
    if (subjectView === undefined) {
      throw new UnknownIdentifierError({
        identifierKind: "subject",
        identifier: subjectIdentifier,
        resolvedIdentity: snapshot.identity,
      });
    }
    const data = await buildSubjectReadResult(
      this.evidenceStore,
      subjectView,
      snapshot.identity.asOf,
    );
    return deepFreeze({
      data,
      meta: {
        resolvedIdentity: snapshot.identity,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
    });
  }

  /**
   * One assertion revision by content-addressed identifier, with its
   * query-time freshness. A globally unknown identifier and a known
   * revision simply not visible at the resolved identity both reject as
   * `UnknownIdentifierError` with `identifierKind: "assertion"` and the
   * populated `resolvedIdentity` — the M1 read surface makes the two
   * conditions indistinguishable in consequence (ADR-0023 § 9).
   */
  async getAssertionRevision(
    assertionIdentifier: string,
    readMode: ReadMode,
  ): Promise<AssertionDetailResult> {
    const snapshot = await this.resolveSnapshot(readMode);
    let foundRevision: GraphAssertion | undefined;
    for (const subjectView of snapshot.subjects) {
      const revision = subjectView.assertions.find(
        (candidate) => candidate.identifier === assertionIdentifier,
      );
      if (revision !== undefined) {
        foundRevision = revision;
        break;
      }
    }
    if (foundRevision === undefined) {
      throw new UnknownIdentifierError({
        identifierKind: "assertion",
        identifier: assertionIdentifier,
        resolvedIdentity: snapshot.identity,
      });
    }
    const data = await buildAssertionReadResult(
      this.evidenceStore,
      foundRevision,
      snapshot.identity.asOf,
    );
    return deepFreeze({
      data,
      meta: {
        resolvedIdentity: snapshot.identity,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
    });
  }

  /**
   * Bounded entity inventory with an optional claim-level `entityType`
   * filter (ADR-0020 § 1): match-by-any-visible-claim, never a winning
   * type, and filtering never drops or reorders a matched entity's
   * revisions.
   */
  async listEntities(
    filter: EntityInventoryFilter,
    readMode: ReadMode,
    pageRequest: PageRequest,
  ): Promise<EntityPage> {
    const validatedFilter = entityInventoryFilterSchema.parse(filter);
    const validatedPageRequest = pageRequestSchema.parse(pageRequest);
    const validatedReadMode = readModeSchema.parse(readMode);

    let cursor: GraphCursorPayload | undefined;
    let snapshot: Snapshot;
    if (validatedPageRequest.cursor !== undefined) {
      cursor = decodeGraphCursor(validatedPageRequest.cursor);
      snapshot = await this.resolveSnapshotForCursorContinuation(
        cursor,
        validatedReadMode,
        "listEntities",
        jsonValuesEqual(
          cursor.coordinates,
          entityInventoryFilterCoordinates(validatedFilter),
        ),
        IDENTIFIER_ASCENDING_ORDER_TOKEN,
        validatedPageRequest.limit,
      );
    } else {
      snapshot = await this.resolveSnapshot(validatedReadMode);
    }

    const entityViews = snapshot.subjects.filter(
      (view): boolean =>
        view.subject.subjectKind === "entity" &&
        (validatedFilter.entityType === undefined ||
          visibleClaimedEntityTypes(view).includes(validatedFilter.entityType)),
    );

    const { pageItems, nextPosition } = paginateSorted(
      entityViews,
      cursor?.position,
      validatedPageRequest.limit,
      (view) => view.subject.identifier,
    );

    const items = await Promise.all(
      pageItems.map(async (view) =>
        toEntityReadResult(
          await buildSubjectReadResult(
            this.evidenceStore,
            view,
            snapshot.identity.asOf,
          ),
        ),
      ),
    );

    const page =
      nextPosition === undefined
        ? { hasMore: false }
        : {
            hasMore: true,
            nextCursor: encodeGraphCursor({
              cursorKind: "graph",
              identity: snapshot.identity,
              operation: "listEntities",
              coordinates: entityInventoryFilterCoordinates(validatedFilter),
              ordering: IDENTIFIER_ASCENDING_ORDER_TOKEN,
              pageSize: validatedPageRequest.limit,
              position: nextPosition,
            }),
          };

    return deepFreeze({
      items,
      page,
      meta: {
        resolvedIdentity: snapshot.identity,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
    });
  }

  /**
   * Deterministic substring search over complete canonical subject
   * identifiers only (ADR-0020 § 3). The query arrives already normalized
   * by the shared `searchQuerySchema`; this method never re-normalizes it.
   */
  async searchSubjects(
    searchQuery: SearchQuery,
    readMode: ReadMode,
    pageRequest: PageRequest,
  ): Promise<SubjectPage> {
    const validatedQuery = searchQuerySchema.parse(searchQuery);
    const validatedPageRequest = pageRequestSchema.parse(pageRequest);
    const validatedReadMode = readModeSchema.parse(readMode);

    let cursor: GraphCursorPayload | undefined;
    let snapshot: Snapshot;
    if (validatedPageRequest.cursor !== undefined) {
      cursor = decodeGraphCursor(validatedPageRequest.cursor);
      snapshot = await this.resolveSnapshotForCursorContinuation(
        cursor,
        validatedReadMode,
        "searchSubjects",
        jsonValuesEqual(cursor.coordinates, validatedQuery),
        IDENTIFIER_ASCENDING_ORDER_TOKEN,
        validatedPageRequest.limit,
      );
    } else {
      snapshot = await this.resolveSnapshot(validatedReadMode);
    }

    const matchingViews = snapshot.subjects.filter((view) =>
      view.subject.identifier.includes(validatedQuery),
    );

    const { pageItems, nextPosition } = paginateSorted(
      matchingViews,
      cursor?.position,
      validatedPageRequest.limit,
      (view) => view.subject.identifier,
    );

    const items = await Promise.all(
      pageItems.map((view) =>
        buildSubjectReadResult(
          this.evidenceStore,
          view,
          snapshot.identity.asOf,
        ),
      ),
    );

    const page =
      nextPosition === undefined
        ? { hasMore: false }
        : {
            hasMore: true,
            nextCursor: encodeGraphCursor({
              cursorKind: "graph",
              identity: snapshot.identity,
              operation: "searchSubjects",
              coordinates: validatedQuery,
              ordering: IDENTIFIER_ASCENDING_ORDER_TOKEN,
              pageSize: validatedPageRequest.limit,
              position: nextPosition,
            }),
          };

    return deepFreeze({
      items,
      page,
      meta: {
        resolvedIdentity: snapshot.identity,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
    });
  }

  /**
   * Bounded traversal from one Entity along relationship claims in the
   * requested direction, deterministic breadth-first by depth then
   * identifier-ascending tie-break, filtered by the confidence floor, up to
   * the 500-subject budget with visible truncation (ADR-0017). Every
   * followed hop exposes **both** the visible Relationship subject used as
   * the edge and the reached Entity subject at its far end (ADR-0020:
   * "Relationship subjects reach consumers through entity detail and
   * traversal") — traversal never reduces a Relationship claim to an
   * invisible internal edge. The origin Entity itself is not included in
   * `items`; depth counts relationship hops between entities, so a
   * Relationship subject reached at hop N shares that hop with the Entity
   * it connects to, never consuming an extra depth unit of its own.
   * Subjects are deduplicated across cycles and across multiple/conflicting
   * visible revisions of the same Relationship subject (each still
   * contributes its own directed edge candidates, confidence-filtered
   * individually, exactly as `listEntities`/`getSubject` never resolve a
   * conflict to a single winner). The 500-subject budget applies to the
   * complete returned collection, Relationship and Entity subjects alike.
   */
  async traverse(
    originEntityIdentifier: EntityIdentifier,
    bounds: TraversalRequestBounds,
    readMode: ReadMode,
  ): Promise<TraversalResult> {
    const validatedBounds = traversalRequestBoundsSchema.parse(bounds);
    const snapshot = await this.resolveSnapshot(readMode);

    const originView = snapshot.subjects.find(
      (view) => view.subject.identifier === originEntityIdentifier,
    );
    if (
      originView === undefined ||
      originView.subject.subjectKind !== "entity"
    ) {
      throw new UnknownIdentifierError({
        identifierKind: "subject",
        identifier: originEntityIdentifier,
        resolvedIdentity: snapshot.identity,
      });
    }

    const subjectViewByIdentifier = new Map<string, SnapshotSubjectView>();
    for (const view of snapshot.subjects) {
      subjectViewByIdentifier.set(view.subject.identifier, view);
    }

    // Every visible relationship claim meeting the confidence floor, as a
    // directed edge candidate: which Relationship subject carries it, the
    // Entity it departs from (in the requested traversal direction), and
    // the Entity it arrives at. A Relationship subject with multiple
    // visible (possibly conflicting) revisions contributes one candidate
    // per qualifying revision — never a single resolved winner.
    const edgeCandidatesByDeparture = new Map<
      string,
      {
        relationshipSubjectIdentifier: string;
        targetEntityIdentifier: string;
        confidence: number;
      }[]
    >();
    for (const view of snapshot.subjects) {
      if (view.subject.subjectKind !== "relationship") {
        continue;
      }
      for (const revision of view.assertions) {
        if (revision.claim.claimKind !== "relationship") {
          continue;
        }
        if (revision.confidence < validatedBounds.minimumConfidence) {
          continue;
        }
        const departureIdentifier =
          validatedBounds.direction === "downstream"
            ? revision.claim.sourceEntityIdentifier
            : revision.claim.targetEntityIdentifier;
        const arrivalIdentifier =
          validatedBounds.direction === "downstream"
            ? revision.claim.targetEntityIdentifier
            : revision.claim.sourceEntityIdentifier;
        const candidate = {
          relationshipSubjectIdentifier: view.subject.identifier,
          targetEntityIdentifier: arrivalIdentifier,
          confidence: revision.confidence,
        };
        const existingCandidates =
          edgeCandidatesByDeparture.get(departureIdentifier);
        if (existingCandidates === undefined) {
          edgeCandidatesByDeparture.set(departureIdentifier, [candidate]);
        } else {
          existingCandidates.push(candidate);
        }
      }
    }

    const reachedSubjectIdentifiers: string[] = [];
    // Seeded with the origin so a cycle can never reintroduce it; both
    // Entity and Relationship identifiers accumulate into this one set as
    // they are reached, so a Relationship subject and an Entity subject
    // are deduplicated identically.
    const visitedSubjectIdentifiers = new Set<string>([originEntityIdentifier]);
    let truncated = false;
    // The frontier holds only Entity identifiers — depth counts
    // relationship hops between entities, so only entities carry the
    // traversal forward to the next depth level.
    let entityFrontier = [originEntityIdentifier];

    for (
      let depth = 0;
      depth < validatedBounds.depth && entityFrontier.length > 0 && !truncated;
      depth += 1
    ) {
      const nextEntityFrontierIdentifiers = new Set<string>();
      // Deterministic within a depth level: visit frontier entities in
      // identifier order, and each entity's edge candidates sorted by
      // (target identifier, relationship subject identifier), so
      // traversal order never depends on Evidence insertion order or
      // Map/Set iteration order.
      for (const currentEntityIdentifier of sortIdentifiers(entityFrontier)) {
        const candidates =
          edgeCandidatesByDeparture.get(currentEntityIdentifier) ?? [];
        const sortedCandidates = [...candidates].sort((first, second) => {
          const targetComparison = compareUtf16CodeUnits(
            first.targetEntityIdentifier,
            second.targetEntityIdentifier,
          );
          return targetComparison !== 0
            ? targetComparison
            : compareUtf16CodeUnits(
                first.relationshipSubjectIdentifier,
                second.relationshipSubjectIdentifier,
              );
        });
        for (const candidate of sortedCandidates) {
          const relationshipIsNew = !visitedSubjectIdentifiers.has(
            candidate.relationshipSubjectIdentifier,
          );
          const targetEntityIsNew = !visitedSubjectIdentifiers.has(
            candidate.targetEntityIdentifier,
          );
          if (!relationshipIsNew && !targetEntityIsNew) {
            // Both endpoints of this edge were already reached by an
            // earlier, deterministically-ordered candidate — nothing new
            // to add, and the target entity's own edges were already (or
            // will already be) processed at its own frontier turn.
            continue;
          }
          const additionCount =
            (relationshipIsNew ? 1 : 0) + (targetEntityIsNew ? 1 : 0);
          if (
            reachedSubjectIdentifiers.length + additionCount >
            MAXIMUM_TRAVERSAL_RESULT_BUDGET
          ) {
            truncated = true;
            break;
          }
          if (relationshipIsNew) {
            visitedSubjectIdentifiers.add(
              candidate.relationshipSubjectIdentifier,
            );
            reachedSubjectIdentifiers.push(
              candidate.relationshipSubjectIdentifier,
            );
          }
          if (targetEntityIsNew) {
            visitedSubjectIdentifiers.add(candidate.targetEntityIdentifier);
            reachedSubjectIdentifiers.push(candidate.targetEntityIdentifier);
            nextEntityFrontierIdentifiers.add(candidate.targetEntityIdentifier);
          }
        }
        if (truncated) {
          break;
        }
      }
      entityFrontier = [...nextEntityFrontierIdentifiers];
    }

    const orderedReachedIdentifiers = sortIdentifiers(
      reachedSubjectIdentifiers,
    );
    const items = await Promise.all(
      orderedReachedIdentifiers.map(async (identifier) => {
        const view = subjectViewByIdentifier.get(identifier);
        if (view === undefined) {
          throw new TypeError(
            `Traversal reached identifier ${identifier} with no corresponding visible subject view — this indicates an internal traversal defect, since referential integrity is already enforced on the snapshot`,
          );
        }
        return buildSubjectReadResult(
          this.evidenceStore,
          view,
          snapshot.identity.asOf,
        );
      }),
    );

    return deepFreeze({
      items,
      traversal: { truncated, subjectCount: items.length },
      meta: {
        resolvedIdentity: snapshot.identity,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
    });
  }

  /**
   * Every Evidence record supporting the subject's visible revisions at
   * the resolved identity — the union of provenance across all of them,
   * deduplicated, ordered by the ADR-0016 Evidence total order
   * (`observedAt`, then `recordedSequence`).
   */
  async getEvidenceChain(
    subjectIdentifier: string,
    readMode: ReadMode,
    pageRequest: PageRequest,
  ): Promise<EvidenceChainResult> {
    const validatedPageRequest = pageRequestSchema.parse(pageRequest);
    const validatedReadMode = readModeSchema.parse(readMode);

    let cursor: GraphCursorPayload | undefined;
    let snapshot: Snapshot;
    if (validatedPageRequest.cursor !== undefined) {
      cursor = decodeGraphCursor(validatedPageRequest.cursor);
      snapshot = await this.resolveSnapshotForCursorContinuation(
        cursor,
        validatedReadMode,
        "getEvidenceChain",
        jsonValuesEqual(cursor.coordinates, subjectIdentifier),
        EVIDENCE_TOTAL_ORDER_TOKEN,
        validatedPageRequest.limit,
      );
    } else {
      snapshot = await this.resolveSnapshot(validatedReadMode);
    }

    const subjectView = snapshot.subjects.find(
      (view) => view.subject.identifier === subjectIdentifier,
    );
    if (subjectView === undefined) {
      throw new UnknownIdentifierError({
        identifierKind: "subject",
        identifier: subjectIdentifier,
        resolvedIdentity: snapshot.identity,
      });
    }

    const evidenceIdentifiers = sortIdentifiers([
      ...new Set(
        subjectView.assertions.flatMap((revision) => revision.provenance),
      ),
    ]);
    const evidenceRecords = await Promise.all(
      evidenceIdentifiers.map((identifier) =>
        this.evidenceStore.getEvidenceByIdentifier(identifier),
      ),
    );
    const orderedEvidenceRecords =
      sortEvidenceByObservedAtThenSequence(evidenceRecords);

    if (
      cursor !== undefined &&
      orderedEvidenceRecords.at(-1)?.identifier === cursor.position
    ) {
      // The cursor's bound position is the *terminal* record's own
      // identifier — "start after the last item" — which could never have
      // been an issued continuation position, since `paginateSorted` only
      // ever binds a `nextPosition` when strictly more items remain after
      // it (Finding 4). Continuing from here would produce an empty
      // `items` array, violating `evidenceChainResultSchema`'s non-empty
      // invariant. This is an unusable position: INVALID_CURSOR.
      throw new InvalidReadCoordinateError({
        reason: "INVALID_CURSOR",
        cursorKind: "graph",
      });
    }

    const { pageItems, nextPosition } = paginateSorted(
      orderedEvidenceRecords,
      cursor?.position,
      validatedPageRequest.limit,
      (record) => record.identifier,
    );

    const page =
      nextPosition === undefined
        ? { hasMore: false }
        : {
            hasMore: true,
            nextCursor: encodeGraphCursor({
              cursorKind: "graph",
              identity: snapshot.identity,
              operation: "getEvidenceChain",
              coordinates: subjectIdentifier,
              ordering: EVIDENCE_TOTAL_ORDER_TOKEN,
              pageSize: validatedPageRequest.limit,
              position: nextPosition,
            }),
          };

    return deepFreeze({
      items: pageItems,
      page,
      meta: {
        resolvedIdentity: snapshot.identity,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
    });
  }

  /**
   * Snapshot summary at a complete pinned identity. Identical identities
   * yield identical checksums and `subjectCount` across calls, since both
   * are read directly from the (cached) resolved `Snapshot`.
   */
  async getSnapshotSummary(
    identity: SnapshotIdentity,
  ): Promise<SnapshotSummary> {
    const validatedIdentity = snapshotIdentitySchema.parse(identity);
    const snapshot =
      await this.snapshotResolver.resolvePinnedSnapshot(validatedIdentity);
    return deepFreeze({
      identity: snapshot.identity,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      checksum: snapshot.checksum,
      subjectCount: snapshot.subjectCount,
    });
  }
}

/** The ADR-0016 Evidence total order: `observedAt` ascending, then `recordedSequence` ascending. Returns a new array. */
function sortEvidenceByObservedAtThenSequence(
  evidenceRecords: readonly Evidence[],
): Evidence[] {
  return [...evidenceRecords].sort((first, second) => {
    const observedAtComparison = compareUtf16CodeUnits(
      first.observedAt,
      second.observedAt,
    );
    return observedAtComparison !== 0
      ? observedAtComparison
      : first.recordedSequence - second.recordedSequence;
  });
}
