/**
 * Storage-agnostic repository contract-test suite skeleton (S2, per
 * ADR-0018 § 1): the behavioral cases every EvidenceStore/TopologyGraphStore
 * implementation must pass unchanged. "The contract tests, not the
 * in-memory engine, are the durable artifact of this decision."
 *
 * Design constraints this file satisfies:
 *
 * - **Storage-agnostic by construction** (ADR-0018 invariant 1): the suite
 *   depends only on the public interfaces and an injected
 *   {@link RepositoryFactory}. It imports no implementation and never will.
 * - **No test-runner coupling:** the suite does not import vitest. Cases
 *   are plain async functions that throw on violation;
 *   {@link registerRepositoryContractSuite} receives the test primitives
 *   (describe/it) by injection. This keeps the package's runtime export
 *   surface free of dev-only imports.
 * - **No skipped or todo tests:** S2 ships the cases as data plus a
 *   registration function and unit-tests the harness structure itself
 *   (case-name uniqueness, invariant citations, registration wiring). The
 *   behavioral cases first *execute* in S6, when the implementing slice
 *   supplies the factory:
 *
 *   ```ts
 *   // packages/graph-model (S6):
 *   import { describe, it } from "vitest";
 *   import { registerRepositoryContractSuite } from "@atlast/shared";
 *   registerRepositoryContractSuite(
 *     inMemoryRepositoryFactory, // S6 supplies this
 *     { describe, it },
 *     demoCompanySeedEvidence, // validated fixture Evidence (S3)
 *   );
 *   ```
 *
 * - **Seed-adequacy failures are loud, never vacuous** (ADR-0020
 *   remediation rule): a case whose obligation cannot be exercised by the
 *   supplied seed (no conflicting-type entity, no relationship claim, too
 *   few subjects for a cursor) throws a ContractViolation naming the
 *   missing scenario instead of passing by omission. The S3 fixture
 *   catalog (docs/m1-plan.md § 6, scenarios 3 and 6) is required to
 *   satisfy these preconditions.
 */
import type { ValidityInterval } from "./assertions.ts";
import { evidenceSchema } from "./evidence.ts";
import type { Evidence } from "./evidence.ts";
import {
  MAXIMUM_PAGE_LIMIT,
  MAXIMUM_TRAVERSAL_RESULT_BUDGET,
  entityInventoryFilterSchema,
  searchQuerySchema,
} from "./read-contract.ts";
import type { EntityInventoryFilter, ReadMode } from "./read-contract.ts";
import {
  assertionDetailResultSchema,
  entityPageSchema,
  entityReadResultSchema,
  evidenceChainResultSchema,
  snapshotSummarySchema,
  subjectDetailResultSchema,
  subjectPageSchema,
  subjectReadResultSchema,
  traversalResultSchema,
} from "./read-results.ts";
import type { EntityReadResult, SubjectReadResult } from "./read-results.ts";
import type { EvidenceStore, TopologyGraphStore } from "./repositories.ts";

/**
 * Produces a fresh, isolated repository pair for one contract case, already
 * loaded with the supplied Evidence (the case's entire world — contract
 * cases never share state). Supplied by the implementing slice (S6).
 */
export interface RepositoryFactory {
  createRepositories(seedEvidence: readonly Evidence[]): Promise<{
    evidenceStore: EvidenceStore;
    topologyGraphStore: TopologyGraphStore;
  }>;
}

/**
 * The seed Evidence a contract case runs against. S2 defines the contract
 * over "whatever valid Evidence the factory is seeded with"; the concrete
 * seed records arrive with the fixture slice (S3) and are threaded through
 * by S6. Cases that need Evidence receive it validated.
 */
export interface ContractCaseContext {
  readonly evidenceStore: EvidenceStore;
  readonly topologyGraphStore: TopologyGraphStore;
  readonly seedEvidence: readonly Evidence[];
}

/** One behavioral obligation of the repository contract. */
export interface RepositoryContractCase {
  /** Unique, human-readable case name (the registered test title). */
  readonly name: string;
  /** The accepted decision this case proves (ADR and clause). */
  readonly citation: string;
  /** Executes the obligation; throws ContractViolation on failure. */
  readonly run: (context: ContractCaseContext) => Promise<void>;
}

/** Explicit failure type so violations read as contract breaches. */
export class ContractViolation extends Error {
  public constructor(caseName: string, detail: string) {
    super(`Repository contract violated [${caseName}]: ${detail}`);
    this.name = "ContractViolation";
  }
}

function assertContract(
  condition: boolean,
  caseName: string,
  detail: string,
): asserts condition {
  if (!condition) {
    throw new ContractViolation(caseName, detail);
  }
}

const LATEST_READ: ReadMode = { mode: "latest" };
const UNFILTERED_INVENTORY: EntityInventoryFilter = {};

/**
 * Cap on cursor-walk pages inside helper collection functions — a walk
 * this long at M1 fixture scale indicates a paging defect, and the loud
 * failure keeps the helpers from masking one as a slow pass.
 */
const MAXIMUM_COLLECTION_WALK_PAGES = 200;

async function expectRejection(
  caseName: string,
  detail: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  assertContract(rejected, caseName, detail);
}

/**
 * Resolves the store's current snapshot identity into a pinned ReadMode via
 * a minimal latest probe, so multi-page walks and cross-read comparisons
 * all evaluate one identity (ADR-0016/0017).
 */
async function resolveCurrentPinnedMode(
  topologyGraphStore: TopologyGraphStore,
): Promise<ReadMode> {
  const probePage = await topologyGraphStore.listEntities(
    UNFILTERED_INVENTORY,
    LATEST_READ,
    { limit: 1 },
  );
  return { mode: "pinned", identity: probePage.meta.resolvedIdentity };
}

/**
 * Collects the complete entity inventory for one filter at one pinned
 * identity by walking cursors with a constant page size (cursors bind
 * identity, filter, ordering, and page size — ADR-0017).
 */
async function collectEntityInventory(
  topologyGraphStore: TopologyGraphStore,
  filter: EntityInventoryFilter,
  pinnedMode: ReadMode,
  caseName: string,
): Promise<EntityReadResult[]> {
  const collectedItems: EntityReadResult[] = [];
  let continuationCursor: string | undefined;
  let walkedPages = 0;
  do {
    const currentPage = await topologyGraphStore.listEntities(
      filter,
      pinnedMode,
      continuationCursor === undefined
        ? { limit: MAXIMUM_PAGE_LIMIT }
        : { limit: MAXIMUM_PAGE_LIMIT, cursor: continuationCursor },
    );
    collectedItems.push(...currentPage.items);
    continuationCursor = currentPage.page.nextCursor;
    walkedPages += 1;
    assertContract(
      walkedPages <= MAXIMUM_COLLECTION_WALK_PAGES,
      caseName,
      "entity-inventory cursor walk did not terminate within the page cap",
    );
  } while (continuationCursor !== undefined);
  return collectedItems;
}

/**
 * Collects complete search results for one already-normalized query at one
 * pinned identity, walking cursors like {@link collectEntityInventory}.
 */
async function collectSearchResults(
  topologyGraphStore: TopologyGraphStore,
  normalizedQuery: string,
  pinnedMode: ReadMode,
  caseName: string,
): Promise<SubjectReadResult[]> {
  const collectedItems: SubjectReadResult[] = [];
  let continuationCursor: string | undefined;
  let walkedPages = 0;
  do {
    const currentPage = await topologyGraphStore.searchSubjects(
      normalizedQuery,
      pinnedMode,
      continuationCursor === undefined
        ? { limit: MAXIMUM_PAGE_LIMIT }
        : { limit: MAXIMUM_PAGE_LIMIT, cursor: continuationCursor },
    );
    collectedItems.push(...currentPage.items);
    continuationCursor = currentPage.page.nextCursor;
    walkedPages += 1;
    assertContract(
      walkedPages <= MAXIMUM_COLLECTION_WALK_PAGES,
      caseName,
      "search cursor walk did not terminate within the page cap",
    );
  } while (continuationCursor !== undefined);
  return collectedItems;
}

/** The distinct entityType tokens visibly claimed by one inventory item. */
function visibleClaimedEntityTypes(entityItem: EntityReadResult): string[] {
  const claimedTypes = new Set<string>();
  for (const assertionResult of entityItem.assertions) {
    if (assertionResult.revision.claim.claimKind === "entity") {
      claimedTypes.add(assertionResult.revision.claim.entityType);
    }
  }
  return [...claimedTypes].sort();
}

/**
 * Whether a validity interval contains the resolved asOf. The canonical
 * timestamp form is fixed-width, so lexicographic comparison is
 * chronological comparison (half-open [validFrom, validTo)).
 */
function validityContainsAsOf(
  validity: ValidityInterval,
  asOf: string,
): boolean {
  return (
    validity.validFrom <= asOf &&
    (validity.validTo === undefined || asOf < validity.validTo)
  );
}

/**
 * The contract cases, in citation order. Every case operates purely through
 * the injected interfaces and validates results against the shared result
 * schemas, so a structurally dishonest result (bare subject, missing
 * freshness, silent truncation) fails schema validation before any
 * behavioral assertion runs.
 */
export const repositoryContractCases: readonly RepositoryContractCase[] = [
  {
    name: "evidence round-trips byte-identically through append and lookup",
    citation:
      "ADR-0014 (Evidence immutable, stable identifiers); ADR-0012 (append-only EvidenceStore)",
    run: async ({
      evidenceStore,
      seedEvidence,
    }: ContractCaseContext): Promise<void> => {
      const caseName =
        "evidence round-trips byte-identically through append and lookup";
      assertContract(
        seedEvidence.length > 0,
        caseName,
        "requires at least one seed Evidence record",
      );
      for (const seededRecord of seedEvidence) {
        const retrievedRecord = await evidenceStore.getEvidenceByIdentifier(
          seededRecord.identifier,
        );
        assertContract(
          JSON.stringify(evidenceSchema.parse(retrievedRecord)) ===
            JSON.stringify(seededRecord),
          caseName,
          `record ${seededRecord.identifier} did not round-trip identically`,
        );
      }
    },
  },
  {
    name: "unknown evidence identifiers reject explicitly, never default",
    citation: "GUARDRAILS.md § 2 (no empty-default returns on failure)",
    run: async ({ evidenceStore }: ContractCaseContext): Promise<void> => {
      await expectRejection(
        "unknown evidence identifiers reject explicitly, never default",
        "lookup of a non-existent Evidence identifier must reject",
        () =>
          evidenceStore.getEvidenceByIdentifier(
            "atlast:evidence:contract-suite/does-not-exist",
          ),
      );
    },
  },
  {
    name: "the watermark equals the highest appended recordedSequence",
    citation:
      "ADR-0016 (horizon as recordedSequence watermark); ADR-0017 (latest resolves horizon to the watermark)",
    run: async ({
      evidenceStore,
      seedEvidence,
    }: ContractCaseContext): Promise<void> => {
      const caseName =
        "the watermark equals the highest appended recordedSequence";
      const highestSeededSequence = seedEvidence.reduce(
        (highestSoFar, record) =>
          Math.max(highestSoFar, record.recordedSequence),
        0,
      );
      const watermark = await evidenceStore.getCurrentWatermark();
      assertContract(
        watermark === highestSeededSequence,
        caseName,
        `watermark ${String(watermark)} does not equal highest seeded sequence ${String(highestSeededSequence)}`,
      );
    },
  },
  {
    name: "appending a non-increasing recordedSequence rejects",
    citation:
      "ADR-0016 (later Evidence always receives a higher recordedSequence)",
    run: async ({
      evidenceStore,
      seedEvidence,
    }: ContractCaseContext): Promise<void> => {
      const caseName = "appending a non-increasing recordedSequence rejects";
      const [existingRecord] = seedEvidence;
      assertContract(
        existingRecord !== undefined,
        caseName,
        "requires at least one seed Evidence record",
      );
      await expectRejection(
        caseName,
        "re-appending an already-used recordedSequence must reject",
        () =>
          evidenceStore.appendEvidence([
            {
              ...existingRecord,
              identifier: "atlast:evidence:contract-suite/duplicate-sequence",
            },
          ]),
      );
    },
  },
  {
    name: "evidence list reads are bounded and ordered by the total order",
    citation:
      "ADR-0018 invariant 3 (no unbounded read); ADR-0016 (observedAt, then recordedSequence)",
    run: async ({ evidenceStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "evidence list reads are bounded and ordered by the total order";
      const watermark = await evidenceStore.getCurrentWatermark();
      const firstPage = await evidenceStore.listEvidence(watermark, {
        limit: MAXIMUM_PAGE_LIMIT,
      });
      assertContract(
        firstPage.items.length <= MAXIMUM_PAGE_LIMIT,
        caseName,
        "a page returned more items than its limit",
      );
      const orderedCorrectly = firstPage.items.every(
        (record, index, records) => {
          if (index === 0) {
            return true;
          }
          const previousRecord = records[index - 1];
          if (previousRecord === undefined) {
            return false;
          }
          return (
            previousRecord.observedAt < record.observedAt ||
            (previousRecord.observedAt === record.observedAt &&
              previousRecord.recordedSequence < record.recordedSequence)
          );
        },
      );
      assertContract(
        orderedCorrectly,
        caseName,
        "evidence page is not in the ADR-0016 total order",
      );
    },
  },
  {
    name: "subjects are never returned bare and every revision carries freshness",
    citation:
      "ADR-0014 (subjects never appear without assertions); ADR-0017 (freshness accompanies every revision)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "subjects are never returned bare and every revision carries freshness";
      // Entity side: the inventory. entityPageSchema requires ≥1 assertion
      // (with freshness) per entity — a bare subject cannot validate.
      const entityPage = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        LATEST_READ,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      const entityValidation = entityPageSchema.safeParse(entityPage);
      assertContract(
        entityValidation.success,
        caseName,
        `entity page failed result-schema validation: ${entityValidation.success ? "" : entityValidation.error.message}`,
      );
      for (const item of entityPage.items) {
        const itemValidation = entityReadResultSchema.safeParse(item);
        assertContract(
          itemValidation.success,
          caseName,
          `entity ${item.subject.identifier} returned without a valid supporting revision + freshness`,
        );
      }
      // Relationship side: inventory is entity-only (ADR-0020 § 1), so
      // Relationship subjects are reached through the ordinary search
      // surface — their namespace prefix is a valid identifier substring.
      const relationshipPage = await topologyGraphStore.searchSubjects(
        searchQuerySchema.parse("atlast:relationship:"),
        LATEST_READ,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      const relationshipValidation =
        subjectPageSchema.safeParse(relationshipPage);
      assertContract(
        relationshipValidation.success,
        caseName,
        `relationship search page failed result-schema validation: ${relationshipValidation.success ? "" : relationshipValidation.error.message}`,
      );
      for (const item of relationshipPage.items) {
        const itemValidation = subjectReadResultSchema.safeParse(item);
        assertContract(
          itemValidation.success,
          caseName,
          `subject ${item.subject.identifier} returned without a valid supporting revision + freshness`,
        );
      }
    },
  },
  {
    name: "conflict and ambiguity state is preserved in-band on reads",
    citation:
      "ADR-0015 (conflicts and ambiguity are outputs); ADR-0017 (serialized in-band, never filtered)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "conflict and ambiguity state is preserved in-band on reads";
      const entityPage = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        LATEST_READ,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      for (const item of entityPage.items) {
        for (const assertionResult of item.assertions) {
          // Re-validate the raw returned value against the S1 revision
          // schema: a read path that stripped or rewrote conflictState or
          // ambiguityState into an out-of-band representation fails here.
          const revisionValidation =
            entityReadResultSchema.shape.assertions.element.shape.revision.safeParse(
              assertionResult.revision,
            );
          assertContract(
            revisionValidation.success,
            caseName,
            "a returned revision lost its explicit conflict/ambiguity state on the read path",
          );
          if (assertionResult.revision.conflictState.status === "conflicted") {
            assertContract(
              assertionResult.revision.conflictState.competingClaims.length >=
                1,
              caseName,
              "a conflicted revision was returned without its competing claims",
            );
          }
        }
      }
    },
  },
  {
    name: "identical pinned reads return identical results",
    citation:
      "ADR-0016 (snapshot identity determinism); ADR-0017 invariant 3 (pinned reproducibility)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName = "identical pinned reads return identical results";
      const pinnedMode = await resolveCurrentPinnedMode(topologyGraphStore);
      const firstPinnedRead = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        pinnedMode,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      const secondPinnedRead = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        pinnedMode,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      assertContract(
        JSON.stringify(firstPinnedRead) === JSON.stringify(secondPinnedRead),
        caseName,
        "two identical pinned reads returned different results",
      );
    },
  },
  {
    name: "every read family reports complete resolved metadata",
    citation:
      "ADR-0017 (meta carries the resolved triple and schemaVersion in both modes, on every graph read)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName = "every read family reports complete resolved metadata";
      // listEntities — and its result seeds the identifiers for the
      // single-item families below.
      const entityPage = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        LATEST_READ,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      assertContract(
        entityPageSchema.safeParse(entityPage).success,
        caseName,
        "listEntities did not report complete resolved metadata",
      );
      const firstItem = entityPage.items[0];
      assertContract(
        firstItem !== undefined,
        caseName,
        "requires a seed topology with at least one Entity subject",
      );

      // getSubject
      const subjectDetail = await topologyGraphStore.getSubject(
        firstItem.subject.identifier,
        LATEST_READ,
      );
      assertContract(
        subjectDetailResultSchema.safeParse(subjectDetail).success,
        caseName,
        "getSubject did not report complete resolved metadata",
      );

      // getAssertionRevision
      const firstAssertion = firstItem.assertions[0];
      assertContract(
        firstAssertion !== undefined,
        caseName,
        "a listed entity must carry at least one assertion (bare-subject ban)",
      );
      const assertionDetail = await topologyGraphStore.getAssertionRevision(
        firstAssertion.revision.identifier,
        LATEST_READ,
      );
      assertContract(
        assertionDetailResultSchema.safeParse(assertionDetail).success,
        caseName,
        "getAssertionRevision did not report complete resolved metadata",
      );

      // searchSubjects — query derived from the known identifier's tail so
      // the search is deterministic against any seed.
      const searchResult = await topologyGraphStore.searchSubjects(
        searchQuerySchema.parse(firstItem.subject.identifier.slice(-8)),
        LATEST_READ,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      assertContract(
        subjectPageSchema.safeParse(searchResult).success,
        caseName,
        "searchSubjects did not report complete resolved metadata",
      );

      // traverse — the inventory item is an Entity by construction
      // (ADR-0020 § 1: inventory is entity-only).
      const traversalResult = await topologyGraphStore.traverse(
        firstItem.subject.identifier,
        { direction: "downstream", depth: 1, minimumConfidence: 0 },
        LATEST_READ,
      );
      assertContract(
        traversalResultSchema.safeParse(traversalResult).success,
        caseName,
        "traverse did not report complete resolved metadata",
      );

      // getEvidenceChain
      const evidenceChain = await topologyGraphStore.getEvidenceChain(
        firstItem.subject.identifier,
        LATEST_READ,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      assertContract(
        evidenceChainResultSchema.safeParse(evidenceChain).success,
        caseName,
        "getEvidenceChain did not report complete resolved metadata",
      );
    },
  },
  {
    name: "late evidence does not alter reads pinned at an earlier horizon",
    citation:
      "ADR-0016 invariant 2 (horizon pinning); ADR-0017 invariant 4 (pagination stability)",
    run: async ({
      evidenceStore,
      topologyGraphStore,
      seedEvidence,
    }: ContractCaseContext): Promise<void> => {
      const caseName =
        "late evidence does not alter reads pinned at an earlier horizon";
      const pinnedMode = await resolveCurrentPinnedMode(topologyGraphStore);
      const pinnedBefore = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        pinnedMode,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      const [templateRecord] = seedEvidence;
      assertContract(
        templateRecord !== undefined,
        caseName,
        "requires at least one seed Evidence record",
      );
      const watermark = await evidenceStore.getCurrentWatermark();
      await evidenceStore.appendEvidence([
        {
          ...templateRecord,
          identifier: "atlast:evidence:contract-suite/late-arrival",
          recordedSequence: watermark + 1,
        },
      ]);
      const pinnedAfter = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        pinnedMode,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      assertContract(
        JSON.stringify(pinnedBefore) === JSON.stringify(pinnedAfter),
        caseName,
        "evidence above the pinned horizon changed a pinned read",
      );
    },
  },
  {
    name: "traversal respects its bounds and reports truncation visibly",
    citation: "ADR-0017 (depth 1–5, 500-subject budget, visible truncation)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "traversal respects its bounds and reports truncation visibly";
      const entityPage = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        LATEST_READ,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      const originEntity = entityPage.items[0];
      assertContract(
        originEntity !== undefined,
        caseName,
        "requires at least one Entity subject in the seed topology",
      );
      const traversalResult = await topologyGraphStore.traverse(
        originEntity.subject.identifier,
        { direction: "downstream", depth: 5, minimumConfidence: 0 },
        LATEST_READ,
      );
      const validation = traversalResultSchema.safeParse(traversalResult);
      assertContract(
        validation.success,
        caseName,
        "traversal result failed result-schema validation",
      );
      assertContract(
        traversalResult.items.length <= MAXIMUM_TRAVERSAL_RESULT_BUDGET,
        caseName,
        "traversal exceeded the 500-subject result budget",
      );
      assertContract(
        traversalResult.traversal.subjectCount === traversalResult.items.length,
        caseName,
        "traversal metadata subjectCount disagrees with the returned items",
      );
    },
  },
  {
    name: "a cursor replayed with mismatched parameters is rejected",
    citation:
      "ADR-0017 (cursors bind snapshot identity, filters, ordering, page size)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "a cursor replayed with mismatched parameters is rejected";
      const firstPage = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        LATEST_READ,
        { limit: 1 },
      );
      if (firstPage.page.nextCursor === undefined) {
        // A one-entity topology cannot produce a continuation cursor;
        // the obligation is vacuous for this seed, and that is a seed
        // adequacy concern (S3/S6), not a pass by omission: the case
        // demands a seed with at least two Entity subjects.
        throw new ContractViolation(
          caseName,
          "requires a seed topology with at least two Entity subjects so a continuation cursor exists",
        );
      }
      const continuationCursor = firstPage.page.nextCursor;
      await expectRejection(
        caseName,
        "replaying a cursor under a different page size must reject",
        () =>
          topologyGraphStore.listEntities(UNFILTERED_INVENTORY, LATEST_READ, {
            limit: 2,
            cursor: continuationCursor,
          }),
      );
      await expectRejection(
        caseName,
        "replaying a cursor under a different entityType filter must reject — cursors bind the request's filters",
        () =>
          topologyGraphStore.listEntities(
            { entityType: "cursor-mismatch-probe-type" },
            LATEST_READ,
            { limit: 1, cursor: continuationCursor },
          ),
      );
    },
  },
  {
    name: "unknown subject reads reject explicitly",
    citation:
      "ADR-0014 (a subject with no valid assertion does not exist as of T); GUARDRAILS.md § 2",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      await expectRejection(
        "unknown subject reads reject explicitly",
        "reading a non-existent subject must reject, not return empty",
        () =>
          topologyGraphStore.getSubject(
            "atlast:entity:contract-suite/does-not-exist",
            LATEST_READ,
          ),
      );
    },
  },
  {
    name: "evidence chains dereference to real supporting Evidence",
    citation:
      "ADR-0017 invariant 7 (round-trip traceability — the M1 exit criterion)",
    run: async ({
      evidenceStore,
      topologyGraphStore,
    }: ContractCaseContext): Promise<void> => {
      const caseName =
        "evidence chains dereference to real supporting Evidence";
      const entityPage = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        LATEST_READ,
        { limit: MAXIMUM_PAGE_LIMIT },
      );
      for (const item of entityPage.items) {
        const chain = await topologyGraphStore.getEvidenceChain(
          item.subject.identifier,
          LATEST_READ,
          { limit: MAXIMUM_PAGE_LIMIT },
        );
        const validation = evidenceChainResultSchema.safeParse(chain);
        assertContract(
          validation.success,
          caseName,
          `evidence chain for ${item.subject.identifier} failed schema validation (chains for visible subjects are non-empty)`,
        );
        for (const chainRecord of chain.items) {
          const dereferenced = await evidenceStore.getEvidenceByIdentifier(
            chainRecord.identifier,
          );
          assertContract(
            dereferenced.identifier === chainRecord.identifier,
            caseName,
            `chain record ${chainRecord.identifier} did not dereference in the EvidenceStore`,
          );
        }
      }
    },
  },
  {
    name: "relationship endpoints resolve to existing Entity subjects",
    citation:
      "ADR-0019 § 4 (referential integrity is a repository obligation, defined in S2, proven by S6)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "relationship endpoints resolve to existing Entity subjects";
      // Proven through the ordinary read surface: every relationship claim
      // any read returns must have both endpoints resolvable via getSubject
      // at the SAME resolved identity, and each resolved subject must be an
      // Entity. No diagnostic query family exists to report invalid stored
      // state — a repository that would need one is already in breach.
      // Relationship subjects are reached through search (inventory is
      // entity-only per ADR-0020 § 1).
      const pinnedMode = await resolveCurrentPinnedMode(topologyGraphStore);
      const relationshipItems = await collectSearchResults(
        topologyGraphStore,
        searchQuerySchema.parse("atlast:relationship:"),
        pinnedMode,
        caseName,
      );
      let relationshipClaimCount = 0;
      for (const item of relationshipItems) {
        for (const assertionResult of item.assertions) {
          if (assertionResult.revision.claim.claimKind !== "relationship") {
            continue;
          }
          relationshipClaimCount += 1;
          const relationshipClaim = assertionResult.revision.claim;
          for (const endpointIdentifier of [
            relationshipClaim.sourceEntityIdentifier,
            relationshipClaim.targetEntityIdentifier,
          ]) {
            let resolvedEndpoint;
            try {
              resolvedEndpoint = await topologyGraphStore.getSubject(
                endpointIdentifier,
                pinnedMode,
              );
            } catch {
              throw new ContractViolation(
                caseName,
                `relationship assertion ${assertionResult.revision.identifier} references endpoint ${endpointIdentifier}, which does not resolve at the same identity`,
              );
            }
            assertContract(
              resolvedEndpoint.data.subject.subjectKind === "entity",
              caseName,
              `relationship endpoint ${endpointIdentifier} resolved to a ${resolvedEndpoint.data.subject.subjectKind} subject, not an Entity`,
            );
          }
        }
      }
      // Loud, not vacuous: a seed without a single relationship claim
      // cannot exercise this obligation (the S3 catalog's scenario 6
      // provides one).
      assertContract(
        relationshipClaimCount > 0,
        caseName,
        "requires a seed topology with at least one visible relationship claim",
      );
    },
  },
  {
    name: "snapshot summaries are reproducible for identical identities",
    citation:
      "ADR-0016 (equal (T, H, V) → identical results, checksum-verified)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "snapshot summaries are reproducible for identical identities";
      const probePage = await topologyGraphStore.listEntities(
        UNFILTERED_INVENTORY,
        LATEST_READ,
        { limit: 1 },
      );
      const identity = probePage.meta.resolvedIdentity;
      const firstSummary =
        await topologyGraphStore.getSnapshotSummary(identity);
      const secondSummary =
        await topologyGraphStore.getSnapshotSummary(identity);
      // Both summaries must validate against the COMPLETE summary schema —
      // pinned identity, schemaVersion (ADR-0017: every graph response
      // carries it), well-formed checksum, and subject count.
      for (const summary of [firstSummary, secondSummary]) {
        const summaryValidation = snapshotSummarySchema.safeParse(summary);
        assertContract(
          summaryValidation.success,
          caseName,
          `a snapshot summary failed the complete SnapshotSummary schema (identity, schemaVersion, checksum, subjectCount): ${summaryValidation.success ? "" : summaryValidation.error.message}`,
        );
      }
      assertContract(
        JSON.stringify(firstSummary.identity) === JSON.stringify(identity),
        caseName,
        "a snapshot summary did not echo the exact pinned identity it was requested at",
      );
      assertContract(
        firstSummary.checksum === secondSummary.checksum &&
          firstSummary.subjectCount === secondSummary.subjectCount,
        caseName,
        "two snapshot summaries at one identity disagreed",
      );
    },
  },
  {
    name: "every returned assertion belongs to its containing subject",
    citation:
      "ADR-0014/0019 (a GraphAssertion revision is a claim about ONE subject — its subjectIdentifier); ADR-0017 (subjects serialized with THEIR supporting revisions)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "every returned assertion belongs to its containing subject";
      const pinnedMode = await resolveCurrentPinnedMode(topologyGraphStore);
      // One binding check applied to every subject-bearing result family.
      // The result schemas enforce this structurally too; the explicit
      // comparison keeps the failure message naming the family and subject.
      const assertBinding = (
        familyName: string,
        readResult: SubjectReadResult | EntityReadResult,
      ): void => {
        for (const assertionResult of readResult.assertions) {
          assertContract(
            assertionResult.revision.subjectIdentifier ===
              readResult.subject.identifier,
            caseName,
            `${familyName} returned subject ${readResult.subject.identifier} carrying assertion ${assertionResult.revision.identifier}, which is about ${assertionResult.revision.subjectIdentifier} — a different subject`,
          );
        }
      };
      // listEntities (inventory).
      const inventoryItems = await collectEntityInventory(
        topologyGraphStore,
        UNFILTERED_INVENTORY,
        pinnedMode,
        caseName,
      );
      assertContract(
        inventoryItems.length > 0,
        caseName,
        "requires a seed topology with at least one Entity subject",
      );
      for (const item of inventoryItems) {
        assertBinding("listEntities", item);
      }
      // searchSubjects — both namespaces, so Relationship subjects (absent
      // from the entity-only inventory) are covered too.
      for (const namespaceQuery of ["atlast:entity:", "atlast:relationship:"]) {
        const searchItems = await collectSearchResults(
          topologyGraphStore,
          searchQuerySchema.parse(namespaceQuery),
          pinnedMode,
          caseName,
        );
        for (const item of searchItems) {
          assertBinding(`searchSubjects("${namespaceQuery}")`, item);
        }
      }
      // getSubject — resolved individually for every inventory entity.
      for (const item of inventoryItems) {
        const subjectDetail = await topologyGraphStore.getSubject(
          item.subject.identifier,
          pinnedMode,
        );
        assertBinding("getSubject", subjectDetail.data);
      }
      // traverse — reached subjects carry their own supporting revisions.
      const traversalOrigin = inventoryItems[0];
      assertContract(
        traversalOrigin !== undefined,
        caseName,
        "requires a seed topology with at least one Entity subject",
      );
      const traversalResult = await topologyGraphStore.traverse(
        traversalOrigin.subject.identifier,
        { direction: "downstream", depth: 5, minimumConfidence: 0 },
        pinnedMode,
      );
      for (const item of traversalResult.items) {
        assertBinding("traverse", item);
      }
    },
  },
  {
    name: "conflicting entityType claims match the inventory filter for each claimed type",
    citation:
      "ADR-0020 § 1 (match-by-any-visible-claim, no winner selected or implied); ADR-0014/0015 (conflict preservation)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "conflicting entityType claims match the inventory filter for each claimed type";
      const pinnedMode = await resolveCurrentPinnedMode(topologyGraphStore);
      const unfilteredItems = await collectEntityInventory(
        topologyGraphStore,
        UNFILTERED_INVENTORY,
        pinnedMode,
        caseName,
      );
      const conflictedEntity = unfilteredItems.find(
        (item) => visibleClaimedEntityTypes(item).length >= 2,
      );
      // Loud, not vacuous: match-by-any-claim under conflict is the whole
      // point of this case, so a seed with no conflicting-type entity
      // (the S3 catalog's scenario 3) is a precondition failure.
      assertContract(
        conflictedEntity !== undefined,
        caseName,
        "requires a seed topology with an entity carrying conflicting visible entityType claims (fixture scenario 3)",
      );
      const conflictedRevisionIdentifiers = conflictedEntity.assertions
        .map((assertionResult) => assertionResult.revision.identifier)
        .sort();
      assertContract(
        conflictedEntity.assertions.some(
          (assertionResult) =>
            assertionResult.revision.conflictState.status === "conflicted",
        ),
        caseName,
        `entity ${conflictedEntity.subject.identifier} carries incompatible type claims but no revision is marked conflicted`,
      );
      for (const claimedType of visibleClaimedEntityTypes(conflictedEntity)) {
        const filteredItems = await collectEntityInventory(
          topologyGraphStore,
          { entityType: claimedType },
          pinnedMode,
          caseName,
        );
        const matchedEntity = filteredItems.find(
          (item) =>
            item.subject.identifier === conflictedEntity.subject.identifier,
        );
        assertContract(
          matchedEntity !== undefined,
          caseName,
          `entity ${conflictedEntity.subject.identifier} claims "${claimedType}" but is missing from the inventory filtered by it — filtering selected a winning type`,
        );
        const matchedRevisionIdentifiers = matchedEntity.assertions
          .map((assertionResult) => assertionResult.revision.identifier)
          .sort();
        assertContract(
          JSON.stringify(matchedRevisionIdentifiers) ===
            JSON.stringify(conflictedRevisionIdentifiers),
          caseName,
          `filtering by "${claimedType}" dropped or reordered the entity's visible revisions — every conflicting revision must remain in-band`,
        );
        assertContract(
          matchedEntity.assertions.some(
            (assertionResult) =>
              assertionResult.revision.conflictState.status === "conflicted",
          ),
          caseName,
          `filtering by "${claimedType}" lost the conflict marker — the conflict must stay visible in filtered results`,
        );
      }
    },
  },
  {
    name: "the inventory filter never matches a type no visible revision claims",
    citation:
      "ADR-0020 § 1 (an entity matches only when a visible assertion carries the requested entityType)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "the inventory filter never matches a type no visible revision claims";
      const pinnedMode = await resolveCurrentPinnedMode(topologyGraphStore);
      const unfilteredItems = await collectEntityInventory(
        topologyGraphStore,
        UNFILTERED_INVENTORY,
        pinnedMode,
        caseName,
      );
      assertContract(
        unfilteredItems.length > 0,
        caseName,
        "requires a seed topology with at least one Entity subject",
      );
      // A well-formed token claimed by nothing yields an empty filtered
      // inventory — a legitimate empty result, not an error.
      const unclaimedTypeItems = await collectEntityInventory(
        topologyGraphStore,
        { entityType: "type-claimed-by-no-visible-revision" },
        pinnedMode,
        caseName,
      );
      assertContract(
        unclaimedTypeItems.length === 0,
        caseName,
        "an entityType no visible revision claims matched entities anyway",
      );
      // And every entity a claimed-type filter returns must visibly claim
      // that type — nothing else may leak in.
      for (const claimedType of new Set(
        unfilteredItems.flatMap((item) => visibleClaimedEntityTypes(item)),
      )) {
        const filteredItems = await collectEntityInventory(
          topologyGraphStore,
          { entityType: claimedType },
          pinnedMode,
          caseName,
        );
        for (const filteredItem of filteredItems) {
          assertContract(
            visibleClaimedEntityTypes(filteredItem).includes(claimedType),
            caseName,
            `entity ${filteredItem.subject.identifier} appeared in the "${claimedType}" inventory without any visible revision claiming that type`,
          );
        }
      }
    },
  },
  {
    name: "inventory filtering evaluates only revisions valid at the resolved asOf",
    citation:
      "ADR-0020 § 1 (filtering is snapshot-pinned: visible under the resolved identity); ADR-0016 (validity contains asOf)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "inventory filtering evaluates only revisions valid at the resolved asOf";
      const pinnedMode = await resolveCurrentPinnedMode(topologyGraphStore);
      assertContract(
        pinnedMode.mode === "pinned",
        caseName,
        "pinned mode resolution failed",
      );
      const resolvedAsOf = pinnedMode.identity.asOf;
      const unfilteredItems = await collectEntityInventory(
        topologyGraphStore,
        UNFILTERED_INVENTORY,
        pinnedMode,
        caseName,
      );
      assertContract(
        unfilteredItems.length > 0,
        caseName,
        "requires a seed topology with at least one Entity subject",
      );
      for (const claimedType of new Set(
        unfilteredItems.flatMap((item) => visibleClaimedEntityTypes(item)),
      )) {
        const filteredItems = await collectEntityInventory(
          topologyGraphStore,
          { entityType: claimedType },
          pinnedMode,
          caseName,
        );
        for (const filteredItem of filteredItems) {
          // Every returned revision must be valid at the resolved asOf —
          // a revision outside its validity can neither be returned nor
          // (since matching is evaluated over these same visible
          // revisions) affect which entities match the filter.
          for (const assertionResult of filteredItem.assertions) {
            assertContract(
              validityContainsAsOf(
                assertionResult.revision.validity,
                resolvedAsOf,
              ),
              caseName,
              `revision ${assertionResult.revision.identifier} was returned outside its validity interval at asOf ${resolvedAsOf}`,
            );
          }
          // The matching claim must come from one of those valid
          // revisions, so an out-of-validity claim cannot have produced
          // the match.
          assertContract(
            filteredItem.assertions.some(
              (assertionResult) =>
                assertionResult.revision.claim.claimKind === "entity" &&
                assertionResult.revision.claim.entityType === claimedType &&
                validityContainsAsOf(
                  assertionResult.revision.validity,
                  resolvedAsOf,
                ),
            ),
            caseName,
            `entity ${filteredItem.subject.identifier} matched "${claimedType}" without a revision valid at the resolved asOf carrying that claim`,
          );
        }
      }
    },
  },
  {
    name: "malformed inventory filters fail schema validation",
    citation:
      "ADR-0020 § 1 (a malformed token is a validation error, never a silent empty result) and § 2 (no status filter exists)",
    run: (): Promise<void> => {
      const caseName = "malformed inventory filters fail schema validation";
      // The interface takes an already-validated EntityInventoryFilter, so
      // the schema is where malformed input must die — asserted here so
      // the obligation travels with the suite to every implementation.
      assertContract(
        entityInventoryFilterSchema.safeParse({}).success,
        caseName,
        "the empty (unfiltered) inventory filter must validate",
      );
      assertContract(
        entityInventoryFilterSchema.safeParse({ entityType: "service" })
          .success,
        caseName,
        "a well-formed classification token must validate",
      );
      assertContract(
        !entityInventoryFilterSchema.safeParse({ entityType: "Not-A-Token" })
          .success,
        caseName,
        "a malformed classification token must be rejected",
      );
      assertContract(
        !entityInventoryFilterSchema.safeParse({ status: "healthy" }).success,
        caseName,
        'no "status" field may validate — freshness, conflict, ambiguity, and validity are distinct concepts, never "status" (ADR-0020 § 2)',
      );
      assertContract(
        !entityInventoryFilterSchema.safeParse({
          entityType: "service",
          freshness: "current",
        }).success,
        caseName,
        "unknown filter fields must be rejected — entityType is the only M1 filter",
      );
      return Promise.resolve();
    },
  },
  {
    name: "search matches complete canonical identifiers only, never claim content",
    citation:
      "ADR-0020 § 3 (identifier-only search; claim content and source-native identity never participate)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "search matches complete canonical identifiers only, never claim content";
      const pinnedMode = await resolveCurrentPinnedMode(topologyGraphStore);
      const unfilteredItems = await collectEntityInventory(
        topologyGraphStore,
        UNFILTERED_INVENTORY,
        pinnedMode,
        caseName,
      );
      const firstEntity = unfilteredItems[0];
      assertContract(
        firstEntity !== undefined,
        caseName,
        "requires a seed topology with at least one Entity subject",
      );
      // Positive: a substring of a known identifier finds that subject.
      const identifierTailQuery = searchQuerySchema.parse(
        firstEntity.subject.identifier.slice(-8),
      );
      const tailResults = await collectSearchResults(
        topologyGraphStore,
        identifierTailQuery,
        pinnedMode,
        caseName,
      );
      assertContract(
        tailResults.some(
          (result) =>
            result.subject.identifier === firstEntity.subject.identifier,
        ),
        caseName,
        `searching a substring of ${firstEntity.subject.identifier} did not return it`,
      );
      // Negative, structurally: for every visibly claimed entityType used
      // as a query, every result's identifier must contain the query —
      // which entails that an entity claiming the type WITHOUT it in its
      // identifier is absent, i.e. claim content alone never matches.
      const claimedTypes = [
        ...new Set(
          unfilteredItems.flatMap((item) => visibleClaimedEntityTypes(item)),
        ),
      ].filter((claimedType) => claimedType.length >= 2);
      assertContract(
        claimedTypes.length > 0,
        caseName,
        "requires at least one visibly claimed entityType of query length",
      );
      for (const claimedType of claimedTypes) {
        const typeQueryResults = await collectSearchResults(
          topologyGraphStore,
          searchQuerySchema.parse(claimedType),
          pinnedMode,
          caseName,
        );
        for (const result of typeQueryResults) {
          assertContract(
            result.subject.identifier.includes(claimedType),
            caseName,
            `searching "${claimedType}" returned ${result.subject.identifier}, whose identifier does not contain the query — a claim-content match`,
          );
        }
      }
    },
  },
  {
    name: "search queries normalize by ASCII case mapping only, locale-independently",
    citation:
      "ADR-0020 § 3 (normalization is exactly ASCII A–Z → a–z at the shared contract boundary)",
    run: async ({ topologyGraphStore }: ContractCaseContext): Promise<void> => {
      const caseName =
        "search queries normalize by ASCII case mapping only, locale-independently";
      const pinnedMode = await resolveCurrentPinnedMode(topologyGraphStore);
      const probeItems = await collectEntityInventory(
        topologyGraphStore,
        UNFILTERED_INVENTORY,
        pinnedMode,
        caseName,
      );
      const firstEntity = probeItems[0];
      assertContract(
        firstEntity !== undefined,
        caseName,
        "requires a seed topology with at least one Entity subject",
      );
      // Uppercase the tail through an explicit ASCII map (not
      // toUpperCase(), to keep the expected input construction as
      // locale-proof as the rule under test), then normalize at the
      // schema boundary and search: the subject must match.
      const identifierTail = firstEntity.subject.identifier.slice(-8);
      let asciiUppercasedTail = "";
      for (const character of identifierTail) {
        const codePoint = character.codePointAt(0);
        asciiUppercasedTail +=
          codePoint !== undefined && codePoint >= 0x61 && codePoint <= 0x7a
            ? String.fromCodePoint(codePoint - 0x20)
            : character;
      }
      const normalizedQuery = searchQuerySchema.parse(asciiUppercasedTail);
      assertContract(
        normalizedQuery === identifierTail,
        caseName,
        `schema normalization of "${asciiUppercasedTail}" produced "${normalizedQuery}", not the ASCII-lowercased "${identifierTail}"`,
      );
      const uppercaseQueryResults = await collectSearchResults(
        topologyGraphStore,
        normalizedQuery,
        pinnedMode,
        caseName,
      );
      assertContract(
        uppercaseQueryResults.some(
          (result) =>
            result.subject.identifier === firstEntity.subject.identifier,
        ),
        caseName,
        "an ASCII-uppercased query did not match after boundary normalization",
      );
      // U+0130 (İ) must pass through normalization unchanged — and since
      // identifiers are lowercase ASCII, it can never match anything.
      const dottedCapitalIQuery = searchQuerySchema.parse("İİ");
      assertContract(
        dottedCapitalIQuery === "İİ",
        caseName,
        "normalization altered U+0130 — only ASCII A–Z may be case-mapped",
      );
      const dottedCapitalIResults = await collectSearchResults(
        topologyGraphStore,
        dottedCapitalIQuery,
        pinnedMode,
        caseName,
      );
      assertContract(
        dottedCapitalIResults.length === 0,
        caseName,
        "a query containing U+0130 matched an identifier — identifiers are lowercase ASCII, so a non-ASCII query must match nothing",
      );
    },
  },
];

/**
 * The injected test primitives — vitest's `describe` and `it` satisfy this
 * shape. Injection (rather than importing vitest here) keeps the package's
 * exported runtime surface free of dev-only dependencies.
 */
export interface ContractSuiteTestApi {
  describe: (suiteName: string, register: () => void) => void;
  it: (testName: string, run: () => Promise<void>) => void;
}

/**
 * Registers every contract case as a test. The implementing slice (S6)
 * calls this once per storage engine:
 *
 * ```ts
 * registerRepositoryContractSuite(factory, { describe, it }, seedEvidence);
 * ```
 *
 * Each case gets a fresh repository pair from the factory, so cases are
 * order-independent and isolated.
 */
export function registerRepositoryContractSuite(
  repositoryFactory: RepositoryFactory,
  testApi: ContractSuiteTestApi,
  seedEvidence: readonly Evidence[],
): void {
  testApi.describe("repository contract (storage-agnostic)", () => {
    for (const contractCase of repositoryContractCases) {
      testApi.it(contractCase.name, async () => {
        const { evidenceStore, topologyGraphStore } =
          await repositoryFactory.createRepositories(seedEvidence);
        await contractCase.run({
          evidenceStore,
          topologyGraphStore,
          seedEvidence,
        });
      });
    }
  });
}
