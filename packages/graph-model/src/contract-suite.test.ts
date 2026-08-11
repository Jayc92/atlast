/**
 * S6-D: executes the frozen, completely unmodified S2 storage-agnostic
 * repository contract suite (`registerRepositoryContractSuite` from
 * `@atlast/shared`) against the committed S6 `InMemoryEvidenceStore` and
 * `InMemoryTopologyGraphStore` implementations. This module supplies only:
 *
 * - a deterministic, test-only loader for the S3 `demo-company` fixture
 *   catalog, following `reconciliation.test.ts`'s
 *   `fileURLToPath`/`readFileSync` pattern exactly;
 * - a {@link RepositoryFactory} whose `createRepositories` builds a fresh,
 *   isolated in-memory repository pair per contract case, seeded with the
 *   supplied Evidence and an explicit fixed injected `Clock`.
 *
 * No contract case is copied, altered, skipped, wrapped, renamed, or
 * selectively registered — `registerRepositoryContractSuite` is called
 * exactly once, unmodified, with every case in `repositoryContractCases`
 * (currently 23) registered as its own `it`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import {
  evidenceCollectionSchema,
  registerRepositoryContractSuite,
  type Evidence,
  type RepositoryFactory,
} from "@atlast/shared";
import type { Clock } from "./clock.ts";
import { InMemoryEvidenceStore } from "./evidence-store.ts";
import { InMemoryTopologyGraphStore } from "./topology-graph-store.ts";

const FIXTURE_ROOT = fileURLToPath(
  new URL("../../../fixtures/demo-company/", import.meta.url),
);

interface CatalogScenario {
  readonly evidenceFile: string;
}
interface Catalog {
  readonly scenarios: readonly CatalogScenario[];
}

function loadFixtureJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(FIXTURE_ROOT + relativePath, "utf8"));
}

/**
 * Every valid `demo-company` scenario record, loaded in catalog order and
 * validated once up front through the existing `evidenceCollectionSchema`
 * — the identical loading pattern `reconciliation.test.ts` already uses.
 * `catalog.json`'s `invalidCases` and `snapshotIdentitySeeds` are
 * deliberately not loaded here: the former are schema-rejection fixtures,
 * never valid seed Evidence, and the latter are request identities, not
 * Evidence records.
 */
const DEMO_COMPANY_SEED_EVIDENCE: readonly Evidence[] =
  evidenceCollectionSchema.parse(
    (loadFixtureJson("catalog.json") as Catalog).scenarios.flatMap(
      (scenario) => loadFixtureJson(scenario.evidenceFile) as unknown[],
    ),
  );

/**
 * A fixed, deterministic `Clock` for every repository pair the factory
 * builds — never `Date.now()` or argument-less `new Date()`. The exact
 * instant is arbitrary (no contract case depends on a specific `latest`
 * `asOf`), but it must be a single fixed value so repeated `latest` reads
 * within one contract case observe one consistent "now".
 */
const CONTRACT_SUITE_CLOCK: Clock = () => "2026-06-01T00:00:00.000Z";

/**
 * Builds a fresh, isolated `InMemoryEvidenceStore`/`InMemoryTopologyGraphStore`
 * pair per contract case: a new `EvidenceStore` seeded with exactly the
 * supplied Evidence, and a new `TopologyGraphStore` composed over it. No
 * state is shared across factory calls, so contract cases remain
 * order-independent (ADR-0018 invariant; the suite's own registration
 * calls this once per registered case).
 */
const inMemoryRepositoryFactory: RepositoryFactory = {
  async createRepositories(seedEvidence: readonly Evidence[]) {
    const evidenceStore = new InMemoryEvidenceStore(CONTRACT_SUITE_CLOCK);
    if (seedEvidence.length > 0) {
      await evidenceStore.appendEvidence(seedEvidence);
    }
    const topologyGraphStore = new InMemoryTopologyGraphStore(
      evidenceStore,
      CONTRACT_SUITE_CLOCK,
    );
    return { evidenceStore, topologyGraphStore };
  },
};

registerRepositoryContractSuite(
  inMemoryRepositoryFactory,
  { describe, it },
  DEMO_COMPANY_SEED_EVIDENCE,
);
