/**
 * The M1 repository interfaces (S2) — the full read contract every storage
 * implementation must satisfy (ADR-0012 defines the two interfaces and the
 * no-side-doors enforcement point; ADR-0018 § 1 fixes their M1 contract).
 * Consumers — including the query API (S7) — depend only on these
 * interfaces; nothing outside `packages/graph-model` touches storage.
 *
 * Contract-wide obligations (encoded in the parameter/result schemas and
 * proven through the storage-agnostic contract-test suite, S6):
 *
 * - **Async only.** Every method returns a Promise — synchronous access is
 *   the in-memory convenience ADR-0012 names as the top leakage risk.
 * - **Bounded only.** Every collection read takes a validated PageRequest
 *   or traversal bounds; no method can express an unbounded scan
 *   (ADR-0018 invariant 3).
 * - **Deterministic ordering.** Every collection is totally ordered by a
 *   documented key: Evidence by the ADR-0016 total order (observedAt, then
 *   recordedSequence); subjects and assertion-bearing results by identifier
 *   ascending by Unicode code point (ADR-0017 "deterministic ordering").
 *   Identical pinned reads return identical result sequences.
 * - **Complete resolved metadata on every graph read.** Every
 *   TopologyGraphStore read returns the fully resolved
 *   (asOf, horizon, derivationVersion) identity plus schemaVersion
 *   (ADR-0017's response `meta`), on the result envelope — never inside
 *   the immutable subjects or revisions themselves.
 * - **No mutation of history.** Neither interface declares an update or
 *   delete operation, and none may ever be added to them — subjects,
 *   revisions, and Evidence are never destroyed (ADR-0014). The only write
 *   in the system is the EvidenceStore's append.
 * - **Referential integrity is a repository obligation** (ADR-0019 § 4):
 *   the TopologyGraphStore must guarantee that both endpoint identifiers of
 *   every relationship claim it returns resolve to existing Entity
 *   subjects at the same resolved identity. S1 schemas validate endpoint
 *   syntax only; existence is enforced here. The obligation is proven
 *   through the ordinary read surface — resolving each returned endpoint
 *   via getSubject in the contract suite (S6) — deliberately without any
 *   diagnostic query family that could report invalid stored state.
 * - **Explicit errors.** Lookups of unknown identifiers reject with an
 *   explicit error; no method resolves to an empty default on failure
 *   (GUARDRAILS.md § 2).
 */
import type { Evidence } from "./evidence.ts";
import type { EntityIdentifier, EvidenceIdentifier } from "./identifiers.ts";
import type {
  EntityInventoryFilter,
  PageRequest,
  ReadMode,
  SearchQuery,
  SnapshotIdentity,
  TraversalRequestBounds,
} from "./read-contract.ts";
import type {
  AssertionDetailResult,
  EntityPage,
  EvidenceChainResult,
  EvidencePage,
  SnapshotSummary,
  SubjectDetailResult,
  SubjectPage,
  TraversalResult,
} from "./read-results.ts";

/**
 * A stable subject identifier of either kind (`atlast:entity:…` or
 * `atlast:relationship:…`). The identifier types all infer to `string` —
 * their distinction is runtime validation (S1 identifier schemas), not the
 * type system — so this alias documents intent at interface boundaries;
 * implementations validate the namespace at runtime.
 */
export type SubjectIdentifier = string;

/**
 * Append-only store of immutable Evidence (ADR-0012/0016): the source of
 * truth the graph is derived from, and the only thing that must never lose
 * data. No update, no delete — corrections are new Evidence. Audit-side
 * reads return Evidence directly (Evidence is ingestion fact, not derived
 * graph state, so it carries no snapshot metadata — ADR-0017's response
 * envelope governs graph reads).
 */
export interface EvidenceStore {
  /**
   * Append validated Evidence records. Implementations must reject any
   * record whose `recordedSequence` is not strictly greater than the
   * current watermark, and any duplicate identifier — append order is the
   * ingestion order (ADR-0016).
   */
  appendEvidence(evidenceRecords: readonly Evidence[]): Promise<void>;

  /**
   * Stable lookup of one Evidence record by identifier. Rejects with an
   * explicit error for an unknown identifier — never resolves to a default.
   */
  getEvidenceByIdentifier(
    evidenceIdentifier: EvidenceIdentifier,
  ): Promise<Evidence>;

  /**
   * The store's current watermark: the highest `recordedSequence` appended,
   * or 0 for an empty store. This is what a latest read resolves `horizon`
   * to (ADR-0017).
   */
  getCurrentWatermark(): Promise<number>;

  /**
   * Bounded, ordered read of Evidence at or below a horizon, in the
   * ADR-0016 total order (observedAt, then recordedSequence). The page
   * bounds are mandatory; there is no way to request the whole store in
   * one call.
   */
  listEvidence(
    horizon: number,
    pageRequest: PageRequest,
  ): Promise<EvidencePage>;
}

/**
 * The derived-graph read contract (ADR-0012/0018): subjects and
 * content-addressed assertion revisions, pinned by complete snapshot
 * identity or resolved as latest — never partially pinned (the ReadMode
 * union has no such representation). Every read returns its fully resolved
 * metadata on the envelope, and no subject is ever returned bare (the
 * result schemas make both structural).
 */
export interface TopologyGraphStore {
  /**
   * One subject with every supporting assertion revision valid under the
   * resolved identity, each with its query-time freshness, in an envelope
   * carrying the resolved read metadata. Rejects with an explicit error if
   * the subject does not exist in the graph at that identity — a subject
   * with no valid revision is absent, not empty (ADR-0014).
   */
  getSubject(
    subjectIdentifier: SubjectIdentifier,
    readMode: ReadMode,
  ): Promise<SubjectDetailResult>;

  /**
   * One assertion revision by content-addressed identifier, with its
   * query-time freshness at the resolved identity, in an envelope carrying
   * the resolved read metadata. Rejects for an unknown identifier or a
   * revision not valid under the resolved identity (no M1 read returns a
   * revision outside its validity — ADR-0016).
   */
  getAssertionRevision(
    assertionIdentifier: string,
    readMode: ReadMode,
  ): Promise<AssertionDetailResult>;

  /**
   * Bounded entity inventory (ADR-0017 as amended by ADR-0020 § 1): Entity
   * subjects visible at the resolved identity, in identifier order, each
   * with every visible supporting revision. The filter's optional
   * `entityType` selects entities by match-by-any-visible-claim — an entity
   * matches when ANY assertion revision visible under the resolved identity
   * carries a canonical claim with that `entityType`, so an entity with
   * conflicting type claims appears under each claimed type and the filter
   * can never select or imply a winning type. Filtering selects entities
   * only; it never filters, drops, or reorders a returned entity's
   * revisions — conflicted and ambiguous ones ride in-band (ADR-0015). This
   * is also the conflict/ambiguity retrieval path: their state is on every
   * returned revision, so no separate "clean" read exists to prefer.
   */
  listEntities(
    filter: EntityInventoryFilter,
    readMode: ReadMode,
    pageRequest: PageRequest,
  ): Promise<EntityPage>;

  /**
   * Deterministic substring search over complete canonical Entity and
   * Relationship subject identifiers ONLY (ADR-0017 as amended by
   * ADR-0020 § 3): claim content, source-native identity, and nonexistent
   * display names never participate, and identifiers stay opaque — matching
   * a substring is string matching over an opaque token, never parsing
   * segments to infer facts. The query arrives already normalized by the
   * shared searchQuerySchema (ASCII A–Z → a–z, nothing else — the
   * locale-independent ADR-0020 rule); implementations must not re-apply
   * any locale-sensitive or Unicode normalization. Query bounds 2–256 are
   * schema-enforced; results are bounded and ordered by identifier
   * ascending like every collection read.
   */
  searchSubjects(
    searchQuery: SearchQuery,
    readMode: ReadMode,
    pageRequest: PageRequest,
  ): Promise<SubjectPage>;

  /**
   * Bounded traversal from one Entity along relationship claims in the
   * requested direction: explicit depth 1–5, confidence floor, and the
   * 500-subject result budget with visible truncation (ADR-0017). Endpoint
   * resolution during traversal is where the referential-integrity
   * obligation bites: every edge followed must connect existing Entity
   * subjects.
   */
  traverse(
    originEntityIdentifier: EntityIdentifier,
    bounds: TraversalRequestBounds,
    readMode: ReadMode,
  ): Promise<TraversalResult>;

  /**
   * Every Evidence record supporting the subject's valid revisions at the
   * resolved identity — the provenance chain behind the M1 traceability
   * exit criterion. Bounded and ordered by the Evidence total order.
   */
  getEvidenceChain(
    subjectIdentifier: SubjectIdentifier,
    readMode: ReadMode,
    pageRequest: PageRequest,
  ): Promise<EvidenceChainResult>;

  /**
   * Snapshot summary at a **complete** pinned identity — snapshots accept
   * no latest mode (ADR-0016/0017), so this method takes a
   * SnapshotIdentity, not a ReadMode. Identical identities yield identical
   * checksums across calls, restarts, and implementations.
   */
  getSnapshotSummary(identity: SnapshotIdentity): Promise<SnapshotSummary>;
}
