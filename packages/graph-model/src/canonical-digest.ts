/**
 * SHA-256 canonical digest primitives (ADR-0016 § "Canonical serialization",
 * ADR-0021 § 4): the digest is SHA-256 over the UTF-8 bytes of the RFC 8785
 * canonical form, exposed as lowercase hexadecimal — the exact textual form
 * the S1 assertion-identifier grammar requires (64 lowercase hex
 * characters). Node's built-in `node:crypto` is the only dependency; the
 * operations are pure and deterministic, reading no time, randomness, or
 * environment state.
 *
 * S4 provides the primitives only: composing digests into content-addressed
 * GraphAssertion identifiers is S5, and snapshot checksums are S6
 * (ADR-0021 § 6).
 */
import { createHash } from "node:crypto";
import { canonicalizeToUtf8Bytes } from "./canonical-serialization.ts";

/**
 * SHA-256 over the given bytes, as lowercase hexadecimal. The byte input
 * form exists so callers that already hold canonical bytes (or need to
 * digest a known test vector) can hash without re-serializing.
 */
export function sha256HexOfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Canonicalize unknown runtime input per RFC 8785 (through the S1
 * JSON-value boundary) and return the lowercase-hex SHA-256 digest of the
 * canonical UTF-8 bytes. Equal inputs produce identical digests across
 * repeated calls and process restarts; invalid input is rejected loudly by
 * the canonicalization boundary before any hashing occurs.
 */
export function sha256HexOfCanonicalJson(unknownInput: unknown): string {
  return sha256HexOfBytes(canonicalizeToUtf8Bytes(unknownInput));
}
