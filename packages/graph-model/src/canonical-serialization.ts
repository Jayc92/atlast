/**
 * RFC 8785 (JSON Canonicalization Scheme) serialization per ADR-0016 as
 * amended by accepted ADR-0021: the public boundary accepts unknown runtime
 * input, validates it with the merged S1 `jsonValueSchema` (the single
 * source of truth for what a JSON value is — never a second competing
 * schema), then recursively enforces the JCS-specific conditions the schema
 * does not express (well-formed Unicode, no lone surrogates), and serializes
 * with raw-UTF-16-code-unit property ordering, explicit-null preservation,
 * and generic array-order preservation.
 *
 * Everything here is pure and deterministic: no clock, randomness, locale,
 * filesystem, network, or process-global mutable state is read, and caller
 * input is never mutated (ADR-0021 § 4).
 */
import { jsonValueSchema } from "@atlast/shared";
import type { JsonValue } from "@atlast/shared";
import { compareUtf16CodeUnits } from "./utf16-comparator.ts";

/**
 * Validate unknown runtime input at the public canonicalization boundary
 * (ADR-0021 § 4). The S1 schema rejects everything JSON cannot represent —
 * `undefined` (as an explicit object-property value or array entry), sparse
 * array holes (which read as `undefined`), `BigInt`, functions, symbols,
 * `NaN`, and the infinities — with an explicit error, never a silent
 * conversion. Explicit `null` is valid. After JSON-value validation, every
 * string (property names included) is recursively checked for Unicode
 * well-formedness: a lone surrogate is rejected, never replaced with U+FFFD
 * or passed through (ADR-0021 § 1).
 */
export function toCanonicalJsonValue(unknownInput: unknown): JsonValue {
  const validationResult = jsonValueSchema.safeParse(unknownInput);
  if (!validationResult.success) {
    throw new TypeError(
      `Canonical serialization input is not a JSON value: ${validationResult.error.issues
        .map(
          (issue) =>
            `${issue.path.length > 0 ? issue.path.join(".") + ": " : ""}${issue.message}`,
        )
        .join("; ")}`,
    );
  }
  assertWellFormedUnicode(validationResult.data, "$");
  return validationResult.data;
}

/**
 * Recursively reject lone Unicode surrogates in strings and property names.
 * `String.prototype.isWellFormed()` is exactly the required check: it
 * reports whether the string contains any unpaired surrogate code unit.
 */
function assertWellFormedUnicode(value: JsonValue, path: string): void {
  if (typeof value === "string") {
    if (!value.isWellFormed()) {
      throw new TypeError(
        `Canonical serialization input contains a lone Unicode surrogate in the string at ${path}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, element] of value.entries()) {
      assertWellFormedUnicode(element, `${path}[${String(index)}]`);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [propertyName, propertyValue] of Object.entries(value)) {
      if (!propertyName.isWellFormed()) {
        throw new TypeError(
          `Canonical serialization input contains a lone Unicode surrogate in a property name at ${path}`,
        );
      }
      assertWellFormedUnicode(
        propertyValue,
        `${path}.${JSON.stringify(propertyName)}`,
      );
    }
  }
}

/**
 * Serialize one validated JSON value to its RFC 8785 canonical text.
 *
 * - Literals, strings, and numbers delegate to `JSON.stringify`, whose
 *   ECMAScript serialization algorithms are exactly what RFC 8785
 *   §§ 3.2.2.2–3.2.2.3 normatively require (shortest round-trip numbers, the
 *   defined two-character escapes, lowercase `\u00xx` for remaining control
 *   characters, literal emission of everything else). Negative zero
 *   serializes as `0`, per the ECMAScript number-to-string algorithm.
 * - Object property names sort by raw UTF-16 code units through the one
 *   explicit locale-free comparator (ADR-0021 §§ 1, 7), on a copied array.
 * - Array order is preserved exactly as given — base JCS never sorts arrays
 *   (ADR-0021 § 3) — and explicit `null` is emitted as `null` (§ 2).
 * - Output is compact: no insignificant whitespace anywhere.
 */
function serializeCanonicalJsonValue(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    // JSON.stringify on primitives implements the exact JCS literal,
    // string-escaping, and number-serialization rules.
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const serializedElements: string[] = [];
    for (let elementIndex = 0; elementIndex < value.length; elementIndex++) {
      const element = value[elementIndex];
      // jsonValueSchema rejects sparse holes and undefined entries at the
      // public boundary, so undefined here means a caller bypassed it —
      // an explicit error, never a silent null conversion (ADR-0021 § 2).
      if (element === undefined) {
        throw new TypeError(
          `Internal canonical serializer received undefined at array index ${String(elementIndex)} — input must pass the public boundary validation`,
        );
      }
      serializedElements.push(serializeCanonicalJsonValue(element));
    }
    return `[${serializedElements.join(",")}]`;
  }
  const sortedPropertyNames = [...Object.keys(value)].sort(
    compareUtf16CodeUnits,
  );
  const serializedProperties = sortedPropertyNames.map((propertyName) => {
    const propertyValue = value[propertyName];
    // Same contract as the array branch: an undefined property value can
    // only mean the boundary was bypassed, and is rejected loudly.
    if (propertyValue === undefined) {
      throw new TypeError(
        `Internal canonical serializer received undefined at property ${JSON.stringify(propertyName)} — input must pass the public boundary validation`,
      );
    }
    return `${JSON.stringify(propertyName)}:${serializeCanonicalJsonValue(
      propertyValue,
    )}`;
  });
  return `{${serializedProperties.join(",")}}`;
}

/**
 * Canonicalize unknown runtime input to its RFC 8785 text: validate through
 * the S1 JSON-value contract, reject lone surrogates recursively, then
 * serialize deterministically. Repeated calls over equal input produce
 * byte-identical output, and the input is never mutated.
 */
export function canonicalizeToJcsString(unknownInput: unknown): string {
  return serializeCanonicalJsonValue(toCanonicalJsonValue(unknownInput));
}

/**
 * Canonicalize unknown runtime input to UTF-8 bytes (ADR-0021 § 4: no BOM,
 * no insignificant whitespace). `TextEncoder` always emits BOM-less UTF-8;
 * lone surrogates can never reach it because the boundary validation above
 * rejects them before encoding (encoding would otherwise silently replace
 * them with U+FFFD — exactly the coercion this contract forbids).
 */
export function canonicalizeToUtf8Bytes(unknownInput: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeToJcsString(unknownInput));
}
