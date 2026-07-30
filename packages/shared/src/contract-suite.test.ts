/**
 * Harness-structure tests for the storage-agnostic contract suite (S2).
 * There is no repository implementation to run the behavioral cases
 * against until S6, so what S2 proves is the skeleton itself: the case
 * catalog is well-formed (unique names, ADR citations, executable bodies),
 * registration wires every case through the injected test API exactly
 * once with a fresh factory call per case, and the suite's only path to a
 * repository is the injected factory. Nothing here is skipped or todo —
 * every test below runs and asserts now.
 */
import { describe, expect, it } from "vitest";
import {
  ContractViolation,
  registerRepositoryContractSuite,
  repositoryContractCases,
} from "./contract-suite.ts";
import type {
  ContractSuiteTestApi,
  RepositoryFactory,
} from "./contract-suite.ts";

describe("repositoryContractCases catalog", () => {
  it("contains the full obligation set including the ADR-0020 additions", () => {
    // 16 original S2 cases, plus the 6 ADR-0020 remediation cases (type
    // filtering under conflict, unclaimed-type non-matching, snapshot-
    // pinned filter evaluation, filter schema validation, identifier-only
    // search, and locale-independent normalization), plus the
    // subject/assertion-binding case (every returned assertion belongs to
    // its containing subject).
    expect(repositoryContractCases.length).toBeGreaterThanOrEqual(23);
  });

  it("gives every case a unique name", () => {
    const caseNames = repositoryContractCases.map(
      (contractCase) => contractCase.name,
    );
    expect(new Set(caseNames).size).toBe(caseNames.length);
  });

  it("cites an accepted decision (ADR or guardrail) on every case", () => {
    for (const contractCase of repositoryContractCases) {
      expect(contractCase.citation).toMatch(/ADR-\d{4}|GUARDRAILS\.md/);
    }
  });

  it("covers the load-bearing contract obligations by name", () => {
    const allCaseText = repositoryContractCases
      .map((contractCase) => `${contractCase.name} ${contractCase.citation}`)
      .join("\n");
    // Spot-check that the catalog encodes the obligations S2 was chartered
    // to define — each string names an accepted invariant, so an
    // accidental deletion of a case fails this test.
    expect(allCaseText).toContain("relationship endpoints");
    expect(allCaseText).toContain("pinned");
    expect(allCaseText).toContain("bare");
    expect(allCaseText).toContain("truncation");
    expect(allCaseText).toContain("cursor");
    expect(allCaseText).toContain("watermark");
    expect(allCaseText).toContain("evidence chains");
    expect(allCaseText).toContain("conflict");
    // ADR-0020 remediation obligations: match-by-any-claim type filtering,
    // snapshot-pinned filter evaluation, filter schema validation, and
    // identifier-only search with locale-independent normalization.
    expect(allCaseText).toContain("conflicting entityType claims");
    expect(allCaseText).toContain(
      "never matches a type no visible revision claims",
    );
    expect(allCaseText).toContain("valid at the resolved asOf");
    expect(allCaseText).toContain("malformed inventory filters");
    expect(allCaseText).toContain("complete canonical identifiers only");
    expect(allCaseText).toContain("ASCII case mapping");
    expect(allCaseText).toContain("ADR-0020");
    // Integrity corrections: subject/assertion binding on ordinary reads.
    expect(allCaseText).toContain(
      "every returned assertion belongs to its containing subject",
    );
  });

  it("exposes every case as an executable async function", () => {
    for (const contractCase of repositoryContractCases) {
      expect(typeof contractCase.run).toBe("function");
    }
  });
});

describe("registerRepositoryContractSuite", () => {
  it("registers exactly one test per contract case inside one suite", () => {
    const registeredSuites: string[] = [];
    const registeredTests: string[] = [];
    const recordingTestApi: ContractSuiteTestApi = {
      describe: (suiteName, register) => {
        registeredSuites.push(suiteName);
        register();
      },
      it: (testName) => {
        registeredTests.push(testName);
      },
    };
    const factoryThatMustNotRunAtRegistration: RepositoryFactory = {
      createRepositories: () => {
        throw new Error(
          "the factory must not be invoked during registration — only when a registered test executes",
        );
      },
    };

    registerRepositoryContractSuite(
      factoryThatMustNotRunAtRegistration,
      recordingTestApi,
      [],
    );

    expect(registeredSuites).toStrictEqual([
      "repository contract (storage-agnostic)",
    ]);
    expect(registeredTests).toStrictEqual(
      repositoryContractCases.map((contractCase) => contractCase.name),
    );
  });

  it("invokes the factory freshly per executed case (isolation)", async () => {
    let factoryInvocationCount = 0;
    const countingFactory: RepositoryFactory = {
      createRepositories: () => {
        factoryInvocationCount += 1;
        // Rejecting here is fine: the harness contract under test is that
        // each executed case asks the factory for its own fresh pair.
        return Promise.reject(
          new Error("no implementation exists until S6 supplies one"),
        );
      },
    };
    const collectedRuns: (() => Promise<void>)[] = [];
    const collectingTestApi: ContractSuiteTestApi = {
      describe: (_suiteName, register) => {
        register();
      },
      it: (_testName, run) => {
        collectedRuns.push(run);
      },
    };

    registerRepositoryContractSuite(countingFactory, collectingTestApi, []);
    expect(factoryInvocationCount).toBe(0);

    // Execute the first two registered case bodies: each must request its
    // own repositories and propagate the factory failure loudly rather
    // than swallowing it.
    const [firstRun, secondRun] = collectedRuns;
    expect(firstRun).toBeDefined();
    expect(secondRun).toBeDefined();
    if (firstRun !== undefined && secondRun !== undefined) {
      await expect(firstRun()).rejects.toThrow(
        "no implementation exists until S6",
      );
      await expect(secondRun()).rejects.toThrow(
        "no implementation exists until S6",
      );
    }
    expect(factoryInvocationCount).toBe(2);
  });
});

describe("ContractViolation", () => {
  it("names the violated case and the detail in its message", () => {
    const violation = new ContractViolation(
      "identical pinned reads return identical results",
      "two identical pinned reads returned different results",
    );
    expect(violation.name).toBe("ContractViolation");
    expect(violation.message).toContain(
      "identical pinned reads return identical results",
    );
    expect(violation.message).toContain(
      "two identical pinned reads returned different results",
    );
  });
});
