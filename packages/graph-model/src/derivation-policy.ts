/**
 * The `m1-v1` derivation policy (accepted ADR-0022 § 1): every input that
 * shapes reconciliation output, recorded as one deeply frozen, reviewed data
 * constant. Changing any field is a new derivation version (`m1-v2`, …) per
 * ADR-0015 — no constant is left to implementation-time judgment, and no
 * policy change can silently alter previously derived output (ADR-0016 pins
 * snapshot identity to this version).
 */

export interface AliasEntry {
  /** Normalized-key origin of the declared alias (never a raw source string). */
  readonly fromKey: string;
  /** Normalized-key target of the declared alias. */
  readonly toKey: string;
  /**
   * `one-directional` — a near-match declaration: both keys remain separate
   * subjects and each side's assertions are flagged ambiguous (ADR-0022 § 5).
   * `merging` — a bidirectional equivalence (m1-v1 declares none).
   */
  readonly directionality: "one-directional" | "merging";
}

export interface M1V1DerivationPolicy {
  readonly schemaVersion: "atlast-domain-v1";
  readonly derivationVersion: "m1-v1";
  readonly serializationVersion: "jcs-rfc8785";
  readonly digestAlgorithm: "sha-256";
  /** The § 2 normalization steps, one token per step, in execution order. */
  readonly normalizationRules: readonly string[];
  /** The explicit, closed trim/collapse whitespace set — no Unicode property lookup. */
  readonly whitespaceCodePoints: readonly number[];
  readonly decorativeAffixes: {
    readonly prefixes: readonly string[];
    readonly suffixes: readonly string[];
  };
  readonly aliases: readonly AliasEntry[];
  /** Uncalibrated confidence constants (ADR-0015): confidence = base + span × (1 − 2^−(s−1)). */
  readonly confidence: { readonly base: number; readonly span: number };
  readonly freshness: {
    readonly staleAfterDays: number;
    readonly historicalAfterDays: number;
  };
}

/**
 * Recursively freeze a policy object graph so no code path can mutate the
 * reviewed constants — value capture, not reference trust.
 */
function deepFreeze<FrozenType extends object>(value: FrozenType): FrozenType {
  for (const propertyValue of Object.values(value)) {
    if (typeof propertyValue === "object" && propertyValue !== null) {
      deepFreeze(propertyValue as object);
    }
  }
  return Object.freeze(value);
}

export const M1_V1_DERIVATION_POLICY: M1V1DerivationPolicy = deepFreeze({
  schemaVersion: "atlast-domain-v1",
  derivationVersion: "m1-v1",
  serializationVersion: "jcs-rfc8785",
  digestAlgorithm: "sha-256",
  normalizationRules: [
    "unicode-nfc",
    "ascii-lowercase",
    "trim-whitespace",
    "collapse-whitespace-to-hyphen",
    "strip-decorative-affixes-single-pass",
    "assert-lowercase-ascii-identifier-grammar",
  ],
  whitespaceCodePoints: [0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020],
  decorativeAffixes: {
    prefixes: ["svc-", "service-"],
    suffixes: ["-svc", "-service"],
  },
  aliases: [
    {
      fromKey: "ledger-api",
      toKey: "ledger",
      directionality: "one-directional",
    },
  ],
  confidence: { base: 0.5, span: 0.4 },
  freshness: { staleAfterDays: 7, historicalAfterDays: 30 },
});
