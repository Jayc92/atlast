/**
 * Identity normalization and stable subject identifier construction
 * (accepted ADR-0022 §§ 2–3): a source-native identity string maps to a
 * normalized identity key through six pinned, ordered steps — literal policy
 * data and ASCII-only mappings, so the result is independent of runtime
 * locale and Unicode-property-table drift. The normalized key becomes the
 * stable subject identifier by verbatim prefix concatenation; identity never
 * depends on any evidence-derived type or endpoint claim (ADR-0019).
 *
 * Every failure is a deterministic loud rejection: no hashing,
 * transliteration, or fallback key is ever produced silently.
 */
import type { M1V1DerivationPolicy } from "./derivation-policy.ts";

/** The S1 identifier-segment grammar the final key must satisfy. */
const LOWERCASE_ASCII_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Thrown for every § 2 normalization failure; carries the failing key and
 * the offending Evidence identifier so the error is actionable.
 */
export class IdentityNormalizationError extends Error {
  declare readonly evidenceIdentifier: string;
  declare readonly failingKey: string;

  constructor(message: string, evidenceIdentifier: string, failingKey: string) {
    super(message);
    this.evidenceIdentifier = evidenceIdentifier;
    this.failingKey = failingKey;
    this.name = "IdentityNormalizationError";
  }
}

/** ASCII-only case mapping: A–Z → a–z, every other code point unchanged. */
function asciiLowercase(input: string): string {
  let lowered = "";
  for (const character of input) {
    const codePoint = character.codePointAt(0);
    lowered +=
      codePoint !== undefined && codePoint >= 0x41 && codePoint <= 0x5a
        ? String.fromCodePoint(codePoint + 0x20)
        : character;
  }
  return lowered;
}

function isPolicyWhitespace(
  character: string,
  policy: M1V1DerivationPolicy,
): boolean {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined
    ? policy.whitespaceCodePoints.includes(codePoint)
    : false;
}

/** Trim leading/trailing policy-whitespace code points (closed literal set). */
function trimPolicyWhitespace(
  input: string,
  policy: M1V1DerivationPolicy,
): string {
  // The policy whitespace set is entirely BMP (all below U+0080), so
  // index-based UTF-16 access is exact here: no listed code point can be a
  // surrogate half, and unlisted characters are never inspected beyond
  // membership, which fails for either half of a pair.
  let start = 0;
  let end = input.length;
  while (
    start < end &&
    policy.whitespaceCodePoints.includes(input.charCodeAt(start))
  ) {
    start += 1;
  }
  while (
    end > start &&
    policy.whitespaceCodePoints.includes(input.charCodeAt(end - 1))
  ) {
    end -= 1;
  }
  return input.slice(start, end);
}

/** Collapse each maximal internal run of policy whitespace to one hyphen. */
function collapsePolicyWhitespaceToHyphen(
  input: string,
  policy: M1V1DerivationPolicy,
): string {
  let collapsed = "";
  let inWhitespaceRun = false;
  for (const character of input) {
    if (isPolicyWhitespace(character, policy)) {
      inWhitespaceRun = true;
    } else {
      if (inWhitespaceRun) {
        collapsed += "-";
        inWhitespaceRun = false;
      }
      collapsed += character;
    }
  }
  return collapsed;
}

/**
 * Single-pass decorative-affix stripping: at most one prefix (first declared
 * match), then at most one suffix (first declared match) — never repeated.
 */
function stripDecorativeAffixesSinglePass(
  input: string,
  policy: M1V1DerivationPolicy,
): string {
  let stripped = input;
  for (const prefix of policy.decorativeAffixes.prefixes) {
    if (stripped.startsWith(prefix)) {
      stripped = stripped.slice(prefix.length);
      break;
    }
  }
  for (const suffix of policy.decorativeAffixes.suffixes) {
    if (stripped.endsWith(suffix)) {
      stripped = stripped.slice(0, stripped.length - suffix.length);
      break;
    }
  }
  return stripped;
}

/**
 * Map a source-native identity to its normalized identity key (ADR-0022 § 2).
 * Normalized-key identity is global: the same key resolves to the same
 * stable subject across and within sources; the source name affects
 * corroboration and conflict counting only.
 */
export function normalizeIdentityKey(
  sourceNativeId: string,
  policy: M1V1DerivationPolicy,
  evidenceIdentifier: string,
): string {
  const nfcNormalized = sourceNativeId.normalize("NFC");
  const lowercased = asciiLowercase(nfcNormalized);
  const trimmed = trimPolicyWhitespace(lowercased, policy);
  const collapsed = collapsePolicyWhitespaceToHyphen(trimmed, policy);
  const stripped = stripDecorativeAffixesSinglePass(collapsed, policy);

  if (stripped.length === 0) {
    throw new IdentityNormalizationError(
      `Identity normalization produced an empty key from ${JSON.stringify(sourceNativeId)} (Evidence ${evidenceIdentifier})`,
      evidenceIdentifier,
      stripped,
    );
  }
  if (!LOWERCASE_ASCII_KEY_PATTERN.test(stripped)) {
    throw new IdentityNormalizationError(
      `Identity normalization produced a key outside the lowercase-ASCII identifier grammar: ${JSON.stringify(stripped)} from ${JSON.stringify(sourceNativeId)} (Evidence ${evidenceIdentifier})`,
      evidenceIdentifier,
      stripped,
    );
  }
  return stripped;
}

/** Stable, type-free Entity subject identifier (ADR-0022 § 3). */
export function buildEntityIdentifier(normalizedKey: string): string {
  return `atlast:entity:${normalizedKey}`;
}

/** Stable, endpoint-independent Relationship subject identifier (ADR-0022 § 3). */
export function buildRelationshipIdentifier(normalizedKey: string): string {
  return `atlast:relationship:${normalizedKey}`;
}
