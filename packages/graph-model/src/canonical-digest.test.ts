/**
 * SHA-256 canonical digest tests (ADR-0021 § 4, invariants 10–11): known
 * vectors, lowercase hexadecimal output, byte identity across repeated
 * calls, and loud rejection of invalid input before hashing.
 */
import { describe, expect, it } from "vitest";
import {
  sha256HexOfBytes,
  sha256HexOfCanonicalJson,
} from "./canonical-digest.ts";

describe("sha256HexOfBytes", () => {
  it("matches the FIPS 180 known vector for 'abc'", () => {
    expect(sha256HexOfBytes(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("matches the known vector for the empty message", () => {
    expect(sha256HexOfBytes(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("emits exactly 64 lowercase hexadecimal characters", () => {
    const digest = sha256HexOfBytes(new TextEncoder().encode("Atlast"));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sha256HexOfCanonicalJson", () => {
  it("digests the canonical bytes, so property insertion order cannot change the digest", () => {
    const insertionOrderOne: Record<string, unknown> = {};
    insertionOrderOne["b"] = [2, 1];
    insertionOrderOne["a"] = null;
    const insertionOrderTwo: Record<string, unknown> = {};
    insertionOrderTwo["a"] = null;
    insertionOrderTwo["b"] = [2, 1];

    expect(sha256HexOfCanonicalJson(insertionOrderOne)).toBe(
      sha256HexOfCanonicalJson(insertionOrderTwo),
    );
  });

  it("equals SHA-256 over the canonical text's UTF-8 bytes", () => {
    // canonical form of {b:1, a:null} is {"a":null,"b":1}
    expect(sha256HexOfCanonicalJson({ b: 1, a: null })).toBe(
      sha256HexOfBytes(new TextEncoder().encode('{"a":null,"b":1}')),
    );
  });

  it("is byte-identical across repeated calls", () => {
    const build = (): unknown => ({ z: "\u{1F600}", a: [null, -0, 1e21] });
    expect(sha256HexOfCanonicalJson(build())).toBe(
      sha256HexOfCanonicalJson(build()),
    );
  });

  it("distinguishes values that differ only in a nested null vs absence", () => {
    expect(sha256HexOfCanonicalJson({ a: null })).not.toBe(
      sha256HexOfCanonicalJson({}),
    );
  });

  it("rejects invalid input at the canonicalization boundary before hashing", () => {
    expect(() => sha256HexOfCanonicalJson({ bad: undefined })).toThrow(
      TypeError,
    );
    expect(() => sha256HexOfCanonicalJson("\uD800")).toThrow(TypeError);
  });
});
