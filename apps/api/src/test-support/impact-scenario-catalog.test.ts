/**
 * The M4-B exact-match accuracy-harness scoring suite (ADR-0035): replays
 * every scripted scenario in `fixtures/demo-company/impact-scenarios/`
 * against the real deterministic engine composed behind the real
 * `demo-company`-seeded application, and asserts the actual ranked results
 * are exactly equal to the hand-authored expectation — never a fuzzy or
 * statistical comparison (ADR-0035 § 1). Also proves the loader's schema
 * rejection (§ Verification Obligations) and that the exact-match assertion
 * this suite relies on actually detects a deliberately wrong expectation,
 * rather than merely passing vacuously.
 */
import type { FastifyInstance } from "fastify";
import { impactResultEnvelopeSchema, type ImpactResult } from "@atlast/shared";
import { afterEach, describe, expect, it } from "vitest";
import { initializeApplication } from "../app.ts";
import {
  FIXED_TEST_CLOCK,
  loadFullDemoCompanyOverlayFrames,
  loadFullDemoCompanySeedEvidence,
} from "./demo-company-fixture.ts";
import {
  loadImpactScenarioCatalog,
  loadImpactScenarioInvalidCases,
  parseImpactScenario,
  ImpactScenarioValidationError,
  type ImpactScenario,
} from "./impact-scenario-catalog.ts";
import { parseJsonBody } from "./parse-response.ts";

function scenarioUrl(scenario: ImpactScenario): string {
  const params = new URLSearchParams();
  params.set("direction", scenario.bounds.direction);
  params.set("depth", String(scenario.bounds.depth));
  params.set("minConfidence", String(scenario.bounds.minimumConfidence));
  params.set("changeType", scenario.changeType);
  params.set("asOf", scenario.pin.asOf);
  params.set("horizon", String(scenario.pin.horizon));
  params.set("derivationVersion", scenario.pin.derivationVersion);
  return `/api/v1/entities/${scenario.originEntityIdentifier}/impact?${params.toString()}`;
}

async function runScenario(
  application: FastifyInstance,
  scenario: ImpactScenario,
): Promise<readonly ImpactResult[]> {
  const response = await application.inject({
    method: "GET",
    url: scenarioUrl(scenario),
  });
  expect(response.statusCode).toBe(200);
  return parseJsonBody(response, impactResultEnvelopeSchema).data.results;
}

const CATALOG = loadImpactScenarioCatalog();

describe("M4-B impact accuracy-harness scenario catalog", () => {
  let application: FastifyInstance | undefined;

  afterEach(async () => {
    await application?.close();
    application = undefined;
  });

  it("declares every scenario coverage class ADR-0035 § 3 requires", () => {
    const ids = CATALOG.map((scenario) => scenario.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "web-downstream-removal-invariance",
        "web-downstream-degradation-invariance",
        "web-downstream-interface-change-invariance",
        "orders-zero-impact",
        "checkout-confidence-floor-exclusion",
        "web-historical-pin-stage1",
      ]),
    );
  });

  it.each(CATALOG.map((scenario) => [scenario.id, scenario] as const))(
    "matches the hand-authored expectation exactly: %s",
    async (_id, scenario) => {
      application = await initializeApplication(
        FIXED_TEST_CLOCK,
        loadFullDemoCompanySeedEvidence(),
        loadFullDemoCompanyOverlayFrames(),
      );
      const actualResults = await runScenario(application, scenario);
      expect(actualResults).toStrictEqual(scenario.expectedResults);
    },
  );

  it("scores every scenario as an exact-match pass, reporting a plain pass/total count", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    let passCount = 0;
    for (const scenario of CATALOG) {
      const actualResults = await runScenario(application, scenario);
      const isExactMatch =
        JSON.stringify(actualResults) ===
        JSON.stringify(scenario.expectedResults);
      if (isExactMatch) {
        passCount += 1;
      }
    }
    console.info(
      `M4-B impact accuracy harness: ${String(passCount)}/${String(CATALOG.length)} scripted scenarios matched exactly.`,
    );
    expect(passCount).toBe(CATALOG.length);
  });

  it("proves the three-changeType invariance group's ranked results and paths are identical", () => {
    const invarianceGroup = CATALOG.filter((scenario) =>
      [
        "web-downstream-removal-invariance",
        "web-downstream-degradation-invariance",
        "web-downstream-interface-change-invariance",
      ].includes(scenario.id),
    );
    expect(invarianceGroup).toHaveLength(3);
    const [first, ...rest] = invarianceGroup;
    for (const scenario of rest) {
      expect(scenario.expectedResults).toStrictEqual(first?.expectedResults);
      expect(scenario.originEntityIdentifier).toBe(
        first?.originEntityIdentifier,
      );
      expect(scenario.bounds).toStrictEqual(first?.bounds);
      expect(scenario.pin).toStrictEqual(first?.pin);
    }
  });

  it("detects a deliberately mutated expectation as a real regression, not a vacuous pass", async () => {
    application = await initializeApplication(
      FIXED_TEST_CLOCK,
      loadFullDemoCompanySeedEvidence(),
      loadFullDemoCompanyOverlayFrames(),
    );
    const scenario = CATALOG.find(
      (candidate) => candidate.id === "web-downstream-removal-invariance",
    );
    if (scenario === undefined) {
      throw new Error(
        "expected the web-downstream-removal-invariance scenario",
      );
    }
    const actualResults = await runScenario(application, scenario);
    expect(actualResults).toStrictEqual(scenario.expectedResults);

    const firstResult = scenario.expectedResults[0];
    if (firstResult === undefined) {
      throw new Error("expected at least one scripted result to mutate");
    }
    const deliberatelyMutatedExpectation: readonly ImpactResult[] = [
      { ...firstResult, rankScore: 0.9999 },
      ...scenario.expectedResults.slice(1),
    ];

    expect(() => {
      expect(actualResults).toStrictEqual(deliberatelyMutatedExpectation);
    }).toThrow();
  });

  describe("catalog schema rejection", () => {
    it.each(
      loadImpactScenarioInvalidCases().map(
        (invalidCase) => [invalidCase.id, invalidCase] as const,
      ),
    )("rejects the deliberately invalid scenario: %s", (_id, invalidCase) => {
      expect(() => parseImpactScenario(invalidCase.rawScenario)).toThrow(
        ImpactScenarioValidationError,
      );
    });

    it("rejects a non-object scenario value", () => {
      expect(() => parseImpactScenario("not an object")).toThrow(
        ImpactScenarioValidationError,
      );
      expect(() => parseImpactScenario(null)).toThrow(
        ImpactScenarioValidationError,
      );
      expect(() => parseImpactScenario([])).toThrow(
        ImpactScenarioValidationError,
      );
    });

    it("rejects an unrecognized top-level scenario key", () => {
      const scenario = CATALOG[0];
      if (scenario === undefined) {
        throw new Error("expected at least one valid scenario to mutate");
      }
      const validRaw = JSON.parse(
        JSON.stringify({
          id: scenario.id,
          description: "valid",
          originEntityIdentifier: scenario.originEntityIdentifier,
          changeType: scenario.changeType,
          direction: scenario.bounds.direction,
          depth: scenario.bounds.depth,
          minimumConfidence: scenario.bounds.minimumConfidence,
          pin: scenario.pin,
          expectedResults: scenario.expectedResults,
        }),
      ) as Record<string, unknown>;
      expect(() => parseImpactScenario(validRaw)).not.toThrow();
      expect(() =>
        parseImpactScenario({ ...validRaw, unexpectedKey: true }),
      ).toThrow(ImpactScenarioValidationError);
    });
  });
});
