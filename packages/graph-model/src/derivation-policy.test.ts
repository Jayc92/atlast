/**
 * `m1-v1` policy-integrity tests (ADR-0022 § 1, invariant 15): exact literal
 * values, deep frozenness, and internal consistency — the policy is reviewed
 * data, and drift from the accepted ADR text is a test failure.
 */
import { describe, expect, it } from "vitest";
import { M1_V1_DERIVATION_POLICY } from "./derivation-policy.ts";

describe("M1_V1_DERIVATION_POLICY", () => {
  it("carries the exact accepted literal values", () => {
    expect(M1_V1_DERIVATION_POLICY.schemaVersion).toBe("atlast-domain-v1");
    expect(M1_V1_DERIVATION_POLICY.derivationVersion).toBe("m1-v1");
    expect(M1_V1_DERIVATION_POLICY.serializationVersion).toBe("jcs-rfc8785");
    expect(M1_V1_DERIVATION_POLICY.digestAlgorithm).toBe("sha-256");
    expect(M1_V1_DERIVATION_POLICY.normalizationRules).toEqual([
      "unicode-nfc",
      "ascii-lowercase",
      "trim-whitespace",
      "collapse-whitespace-to-hyphen",
      "strip-decorative-affixes-single-pass",
      "assert-lowercase-ascii-identifier-grammar",
    ]);
    expect(M1_V1_DERIVATION_POLICY.whitespaceCodePoints).toEqual([
      0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020,
    ]);
    expect(M1_V1_DERIVATION_POLICY.decorativeAffixes).toEqual({
      prefixes: ["svc-", "service-"],
      suffixes: ["-svc", "-service"],
    });
    expect(M1_V1_DERIVATION_POLICY.aliases).toEqual([
      {
        fromKey: "ledger-api",
        toKey: "ledger",
        directionality: "one-directional",
      },
    ]);
    expect(M1_V1_DERIVATION_POLICY.confidence).toEqual({
      base: 0.5,
      span: 0.4,
    });
    expect(M1_V1_DERIVATION_POLICY.freshness).toEqual({
      staleAfterDays: 7,
      historicalAfterDays: 30,
    });
  });

  it("is deeply frozen — no field or nested structure is mutable", () => {
    expect(Object.isFrozen(M1_V1_DERIVATION_POLICY)).toBe(true);
    expect(Object.isFrozen(M1_V1_DERIVATION_POLICY.normalizationRules)).toBe(
      true,
    );
    expect(Object.isFrozen(M1_V1_DERIVATION_POLICY.whitespaceCodePoints)).toBe(
      true,
    );
    expect(Object.isFrozen(M1_V1_DERIVATION_POLICY.decorativeAffixes)).toBe(
      true,
    );
    expect(
      Object.isFrozen(M1_V1_DERIVATION_POLICY.decorativeAffixes.prefixes),
    ).toBe(true);
    expect(Object.isFrozen(M1_V1_DERIVATION_POLICY.aliases)).toBe(true);
    expect(Object.isFrozen(M1_V1_DERIVATION_POLICY.aliases[0])).toBe(true);
    expect(Object.isFrozen(M1_V1_DERIVATION_POLICY.confidence)).toBe(true);
    expect(Object.isFrozen(M1_V1_DERIVATION_POLICY.freshness)).toBe(true);
    expect(() => {
      (
        M1_V1_DERIVATION_POLICY as { derivationVersion: string }
      ).derivationVersion = "m1-v2";
    }).toThrow(TypeError);
  });

  it("is internally consistent: affixes lowercase and non-empty, alias keys distinct, thresholds strictly increasing", () => {
    for (const affix of [
      ...M1_V1_DERIVATION_POLICY.decorativeAffixes.prefixes,
      ...M1_V1_DERIVATION_POLICY.decorativeAffixes.suffixes,
    ]) {
      expect(affix.length).toBeGreaterThan(0);
      expect(affix).toBe(affix.toLowerCase());
    }
    for (const aliasEntry of M1_V1_DERIVATION_POLICY.aliases) {
      expect(aliasEntry.fromKey).not.toBe(aliasEntry.toKey);
    }
    expect(M1_V1_DERIVATION_POLICY.freshness.staleAfterDays).toBeLessThan(
      M1_V1_DERIVATION_POLICY.freshness.historicalAfterDays,
    );
  });
});
