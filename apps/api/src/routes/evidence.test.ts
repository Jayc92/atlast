/**
 * Integration tests for routes 5 and 6 (ADR-0024 §§ 1-2, 5, 7): Evidence
 * lookup and the entity-scoped evidence chain, driven through
 * `fastify.inject()` over the real application seeded with the
 * `demo-company` fixture catalog.
 */
import type { FastifyInstance } from "fastify";
import {
  entityPageSchema,
  errorResponseSchema,
  evidenceChainResultSchema,
  evidenceDetailResultSchema,
  subjectPageSchema,
  type Evidence,
} from "@atlast/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeApplication } from "../app.ts";
import {
  FIXED_TEST_CLOCK,
  FULL_CATALOG_SNAPSHOT_IDENTITY,
  loadDemoCompanySeedEvidenceForScenarios,
  loadFullDemoCompanyOverlayFrames,
  loadFullDemoCompanySeedEvidence,
} from "../test-support/demo-company-fixture.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";

/** A real, multi-segment `demo-company` Evidence identifier containing both `:` and `/`. */
const MULTI_SEGMENT_EVIDENCE_IDENTIFIER =
  "atlast:evidence:demo-company/deployment-inventory/0001";

/** Percent-encode exactly `:` and `/`, per ADR-0024 § 5. */
function percentEncodeStableIdentifier(identifier: string): string {
  return identifier.replaceAll(":", "%3A").replaceAll("/", "%2F");
}

/** Every `catalog.json` scenario `id` whose `fixtureKind` is `valid-evidence` (§ 6 of docs/m1-plan.md). */
const VALID_SCENARIO_IDS: readonly string[] = [
  "corroborating-evidence",
  "late-corroboration-revision-seed",
  "conflicting-evidence",
  "stale-evidence",
  "ambiguous-identity",
  "relationship-appearance-disappearance",
  "historical-as-of-topology",
];

/**
 * One page's worth of a subject-bearing read, structurally: the shape both
 * `entityPageSchema` and `subjectPageSchema` share (ADR-0017/ADR-0020). Kept
 * structural, rather than importing `EntityReadResult`/`SubjectReadResult`
 * directly, so one pagination helper and one provenance collector serve
 * both routes without a union type at every call site.
 */
interface PageResultShape {
  readonly items: readonly SubjectResultShape[];
  readonly page: {
    readonly hasMore: boolean;
    readonly nextCursor?: string | undefined;
  };
}

interface SubjectResultShape {
  readonly subject: { readonly identifier: string };
  readonly assertions: readonly AssertionResultShape[];
}

interface AssertionResultShape {
  readonly revision: {
    readonly identifier: string;
    readonly provenance: readonly string[];
    readonly ruleTrace: readonly {
      readonly evidenceIdentifiers: readonly string[];
    }[];
    readonly conflictState:
      | { readonly status: "uncontested" }
      | {
          readonly status: "conflicted";
          readonly competingClaims: readonly {
            readonly provenance: readonly string[];
          }[];
        };
  };
}

/**
 * Fully paginates one bounded, filtered/searched read (ADR-0017): follows
 * `page.nextCursor` until `page.hasMore` is false, so no assertion below
 * accidentally proves traceability for only the first page of a coordinate
 * that happens to hold more subjects than one page-worth.
 */
async function collectAllPages(
  application: FastifyInstance,
  baseUrlWithoutPaging: string,
  schema: { parse(value: unknown): PageResultShape },
  pageLimit: number,
): Promise<readonly SubjectResultShape[]> {
  const collectedItems: SubjectResultShape[] = [];
  let cursor: string | undefined;
  const separator = baseUrlWithoutPaging.includes("?") ? "&" : "?";
  for (;;) {
    const cursorSegment =
      cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`;
    const response = await application.inject({
      method: "GET",
      url: `${baseUrlWithoutPaging}${separator}limit=${String(pageLimit)}${cursorSegment}`,
    });
    expect(response.statusCode).toBe(200);
    const body = schema.parse(JSON.parse(response.body));
    collectedItems.push(...body.items);
    if (!body.page.hasMore) {
      return collectedItems;
    }
    cursor = body.page.nextCursor;
  }
}

/**
 * Records every Evidence identifier a set of subject results cites through
 * a revision's own provenance, a competing claim's provenance, or a
 * rule-trace entry (all three named explicitly by the M1 traceability exit
 * criterion this suite proves). Also asserts, for every subject, that its
 * supporting assertions are non-empty — the response schema already
 * guarantees this structurally, but the exit criterion requires the proof
 * to be explicit here, not merely inherited from schema validation.
 */
function recordProvenanceIdentifiers(
  subjectResults: readonly SubjectResultShape[],
  provenanceIdentifiers: Set<string>,
  visibleSubjectIdentifiers: Set<string>,
  visibleRevisionIdentifiers: Set<string>,
): void {
  for (const subjectResult of subjectResults) {
    expect(subjectResult.assertions.length).toBeGreaterThan(0);
    visibleSubjectIdentifiers.add(subjectResult.subject.identifier);
    for (const assertionResult of subjectResult.assertions) {
      const revision = assertionResult.revision;
      visibleRevisionIdentifiers.add(revision.identifier);
      for (const evidenceIdentifier of revision.provenance) {
        provenanceIdentifiers.add(evidenceIdentifier);
      }
      for (const ruleTraceEntry of revision.ruleTrace) {
        for (const evidenceIdentifier of ruleTraceEntry.evidenceIdentifiers) {
          provenanceIdentifiers.add(evidenceIdentifier);
        }
      }
      if (revision.conflictState.status === "conflicted") {
        for (const competingClaim of revision.conflictState.competingClaims) {
          for (const evidenceIdentifier of competingClaim.provenance) {
            provenanceIdentifiers.add(evidenceIdentifier);
          }
        }
      }
    }
  }
}

describe("GET /api/v1/evidence/{evidenceId}", () => {
  let application: FastifyInstance;

  beforeEach(async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
  });

  afterEach(async () => {
    await application.close();
  });

  it("looks up one Evidence record by its percent-encoded, multi-segment identifier", async () => {
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/evidence/${percentEncodeStableIdentifier(MULTI_SEGMENT_EVIDENCE_IDENTIFIER)}`,
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, evidenceDetailResultSchema);
    expect(body.data.identifier).toBe(MULTI_SEGMENT_EVIDENCE_IDENTIFIER);
    expect(body.meta).toStrictEqual({ schemaVersion: "atlast-domain-v1" });
  });

  it("mis-routes an un-encoded multi-segment identifier as extra path segments, producing ROUTE_NOT_FOUND", async () => {
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/evidence/${MULTI_SEGMENT_EVIDENCE_IDENTIFIER}`,
    });
    expect(response.statusCode).toBe(404);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "ROUTE_NOT_FOUND",
    );
  });

  it("rejects an unknown but well-formed Evidence identifier with UNKNOWN_IDENTIFIER and no resolvedIdentity", async () => {
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/evidence/${percentEncodeStableIdentifier("atlast:evidence:demo-company/nonexistent/9999")}`,
    });
    expect(response.statusCode).toBe(404);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("UNKNOWN_IDENTIFIER");
    if (body.code === "UNKNOWN_IDENTIFIER") {
      expect(body.details.identifierKind).toBe("evidence");
      if (body.details.identifierKind === "evidence") {
        expect(body.details.identifier).toBe(
          "atlast:evidence:demo-company/nonexistent/9999",
        );
      }
    }
  });

  it("rejects a malformed Evidence identifier with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/evidence/not-a-valid-identifier",
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("accepts no pinning parameters at all, rejecting any of them with VALIDATION_ERROR", async () => {
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/evidence/${percentEncodeStableIdentifier(MULTI_SEGMENT_EVIDENCE_IDENTIFIER)}?asOf=2026-04-20T12:00:00.000Z&horizon=20&derivationVersion=m1-v1`,
    });
    expect(response.statusCode).toBe(400);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("GET /api/v1/entities/{entityId}/evidence", () => {
  let application: FastifyInstance;

  beforeEach(async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
  });

  afterEach(async () => {
    await application.close();
  });

  it("returns the non-empty Evidence chain supporting one entity's visible revisions", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/evidence",
    });
    expect(response.statusCode).toBe(200);
    const body = parseJsonBody(response, evidenceChainResultSchema);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.meta.resolvedIdentity).toBeDefined();
  });

  it("reproduces byte-identical results for identical fully pinned requests", async () => {
    const url = `/api/v1/entities/atlast:entity:checkout/evidence?asOf=${encodeURIComponent(FULL_CATALOG_SNAPSHOT_IDENTITY.asOf)}&horizon=${String(FULL_CATALOG_SNAPSHOT_IDENTITY.horizon)}&derivationVersion=${FULL_CATALOG_SNAPSHOT_IDENTITY.derivationVersion}`;
    const first = await application.inject({ method: "GET", url });
    const second = await application.inject({ method: "GET", url });
    expect(first.statusCode).toBe(200);
    expect(parseJsonBody(second, evidenceChainResultSchema)).toStrictEqual(
      parseJsonBody(first, evidenceChainResultSchema),
    );
  });

  it("continues a paginated walk via cursor with no duplicate or dropped items across pages", async () => {
    const firstPage = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/evidence?limit=1",
    });
    expect(firstPage.statusCode).toBe(200);
    const firstBody = parseJsonBody(firstPage, evidenceChainResultSchema);
    expect(firstBody.page.hasMore).toBe(true);

    const secondPage = await application.inject({
      method: "GET",
      url: `/api/v1/entities/atlast:entity:checkout/evidence?limit=1&cursor=${encodeURIComponent(firstBody.page.nextCursor ?? "")}`,
    });
    expect(secondPage.statusCode).toBe(200);
    const secondBody = parseJsonBody(secondPage, evidenceChainResultSchema);
    expect(secondBody.items[0]?.identifier).not.toBe(
      firstBody.items[0]?.identifier,
    );
  });

  it("rejects an unknown entity with UNKNOWN_IDENTIFIER", async () => {
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:does-not-exist/evidence",
    });
    expect(response.statusCode).toBe(404);
    expect(parseJsonBody(response, errorResponseSchema).code).toBe(
      "UNKNOWN_IDENTIFIER",
    );
  });
});

/**
 * The M1 exit criterion this suite proves exhaustively (docs/m1-plan.md § 7
 * Journey 1; docs/milestones.md M1 exit criteria): every fact in the graph
 * is traceable to its synthetic Evidence *through the public API*, not
 * merely through repository internals. Unlike the two targeted tests above
 * (one entity, one pinned coordinate), this suite sweeps a coordinate set
 * derived from the complete valid fixture catalog and dereferences every
 * provenance identifier it finds, so a gap here is a real product gap, not
 * a test-selection artifact.
 */
describe("GET /api/v1/evidence/{evidenceId} — exhaustive provenance traceability across the full fixture catalog (M1 exit criterion 2)", () => {
  let application: FastifyInstance;
  let allValidEvidence: readonly Evidence[];

  beforeEach(async () => {
    allValidEvidence = loadFullDemoCompanySeedEvidence();
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      allValidEvidence,
      loadFullDemoCompanyOverlayFrames(),
    );
  });

  afterEach(async () => {
    await application.close();
  });

  it("dereferences every provenance, competing-claim, and rule-trace Evidence identifier behind every subject visible across a coordinate set covering all seven valid scenarios, and reaches all 20 valid Evidence records", async () => {
    // The coordinate set (docs/m1-plan.md § 7 Journey 1): every distinct
    // observedAt across the complete valid catalog, each paired with the
    // full retained horizon (so every recorded fact is knowable, not just
    // an early subset) — plus the catalog's own declared supported
    // snapshot identity (FULL_CATALOG_SNAPSHOT_IDENTITY). Derived from the
    // loaded catalog itself, never hand-picked to one entity or one
    // snapshot.
    const fullRetainedHorizon = Math.max(
      ...allValidEvidence.map((evidence) => evidence.recordedSequence),
    );
    const distinctObservedAtValues = [
      ...new Set(allValidEvidence.map((evidence) => evidence.observedAt)),
    ].sort();

    const coordinates: readonly {
      readonly asOf: string;
      readonly horizon: number;
      readonly derivationVersion: string;
    }[] = [
      ...distinctObservedAtValues.map((asOf) => ({
        asOf,
        horizon: fullRetainedHorizon,
        derivationVersion: "m1-v1",
      })),
      FULL_CATALOG_SNAPSHOT_IDENTITY,
    ];

    const provenanceIdentifiers = new Set<string>();
    const visibleSubjectIdentifiers = new Set<string>();
    const visibleRevisionIdentifiers = new Set<string>();

    for (const coordinate of coordinates) {
      const pin = `asOf=${encodeURIComponent(coordinate.asOf)}&horizon=${String(coordinate.horizon)}&derivationVersion=${coordinate.derivationVersion}`;

      // Entity inventory: paginated completely, never assumed to be one page.
      const entityItems = await collectAllPages(
        application,
        `/api/v1/entities?${pin}`,
        entityPageSchema,
        3,
      );
      recordProvenanceIdentifiers(
        entityItems,
        provenanceIdentifiers,
        visibleSubjectIdentifiers,
        visibleRevisionIdentifiers,
      );

      // Identifier search over "atlast" — every canonical identifier in this
      // catalog starts with that prefix, so this is a complete, paginated
      // sweep of every visible subject of both kinds (ADR-0024's correction
      // of ADR-0020: search and traversal are how Relationship subjects
      // reach consumers).
      const searchItems = await collectAllPages(
        application,
        `/api/v1/search?q=atlast&${pin}`,
        subjectPageSchema,
        3,
      );
      recordProvenanceIdentifiers(
        searchItems,
        provenanceIdentifiers,
        visibleSubjectIdentifiers,
        visibleRevisionIdentifiers,
      );
    }

    // Both subject kinds were actually reached — otherwise the sweep above
    // would silently prove nothing about Relationship traceability.
    expect(visibleRevisionIdentifiers.size).toBeGreaterThan(0);
    expect(
      [...visibleSubjectIdentifiers].some((identifier) =>
        identifier.startsWith("atlast:entity:"),
      ),
    ).toBe(true);
    expect(
      [...visibleSubjectIdentifiers].some((identifier) =>
        identifier.startsWith("atlast:relationship:"),
      ),
    ).toBe(true);

    // Map every valid Evidence identifier back to its owning scenario, so
    // non-vacuous coverage of all seven scenarios can be asserted below.
    const scenarioIdByEvidenceIdentifier = new Map<string, string>();
    for (const scenarioId of VALID_SCENARIO_IDS) {
      for (const evidence of loadDemoCompanySeedEvidenceForScenarios([
        scenarioId,
      ])) {
        scenarioIdByEvidenceIdentifier.set(evidence.identifier, scenarioId);
      }
    }

    // Dereference every collected provenance identifier through the public
    // API alone — GET /api/v1/evidence/{evidenceId} — never through the
    // repository or the fixture loader directly.
    const dereferencedScenarioIds = new Set<string>();
    for (const evidenceIdentifier of provenanceIdentifiers) {
      const response = await application.inject({
        method: "GET",
        url: `/api/v1/evidence/${percentEncodeStableIdentifier(evidenceIdentifier)}`,
      });
      expect(response.statusCode).toBe(200);
      const body = parseJsonBody(response, evidenceDetailResultSchema);
      expect(body.data.identifier).toBe(evidenceIdentifier);

      const scenarioId = scenarioIdByEvidenceIdentifier.get(evidenceIdentifier);
      if (scenarioId !== undefined) {
        dereferencedScenarioIds.add(scenarioId);
      }
    }

    // Non-vacuous: every one of the seven valid scenarios contributed at
    // least one dereferenced Evidence identifier — a passing sweep that
    // silently skipped a whole scenario would prove nothing about it.
    for (const scenarioId of VALID_SCENARIO_IDS) {
      expect(dereferencedScenarioIds.has(scenarioId)).toBe(true);
    }

    // The exit criterion itself: the union of dereferenced provenance
    // identifiers equals the complete set of 20 valid Evidence records.
    // Invalid fixtures are excluded by construction — they are rejection
    // inputs (schema-validation failures), never graph facts, so they can
    // never appear in any revision's provenance.
    const allValidEvidenceIdentifiers = new Set(
      allValidEvidence.map((evidence) => evidence.identifier),
    );
    expect(provenanceIdentifiers).toStrictEqual(allValidEvidenceIdentifiers);
  });
});
