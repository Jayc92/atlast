/**
 * Derivation-version lookup tests (accepted ADR-0023 § 3, invariant 3):
 * `m1-v1` resolves; every other token — including the `m1-v2` fixture
 * seed — rejects loudly with `InvalidReadCoordinateError` and reason
 * `UNSUPPORTED_DERIVATION_VERSION`, never a silent substitution.
 */
import { describe, expect, it } from "vitest";
import { M1_V1_DERIVATION_POLICY } from "./derivation-policy.ts";
import {
  ACTIVE_DERIVATION_VERSION,
  resolveDerivationPolicy,
} from "./derivation-version-lookup.ts";
import { InvalidReadCoordinateError } from "./repository-errors.ts";

describe("resolveDerivationPolicy", () => {
  it("resolves 'm1-v1' to the M1_V1_DERIVATION_POLICY constant", () => {
    expect(resolveDerivationPolicy("m1-v1")).toBe(M1_V1_DERIVATION_POLICY);
  });

  it("ACTIVE_DERIVATION_VERSION is exactly 'm1-v1' — the only active policy", () => {
    expect(ACTIVE_DERIVATION_VERSION).toBe("m1-v1");
    expect(resolveDerivationPolicy(ACTIVE_DERIVATION_VERSION)).toBe(
      M1_V1_DERIVATION_POLICY,
    );
  });

  it("rejects the m1-v2 fixture seed's token loudly, never substituting m1-v1", () => {
    let caught: unknown;
    try {
      resolveDerivationPolicy("m1-v2");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("UNSUPPORTED_DERIVATION_VERSION");
    expect(error.unsupportedDerivationVersion).toBe("m1-v2");
  });

  it("rejects an arbitrary unknown kebab-case token", () => {
    expect(() => resolveDerivationPolicy("m2-v1")).toThrow(
      InvalidReadCoordinateError,
    );
  });
});

describe("resolveDerivationPolicy — prototype-collision regression", () => {
  it.each([
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
    "valueOf",
  ])(
    "rejects the inherited Object.prototype member %s exactly like any other unsupported token",
    (prototypeToken) => {
      let caught: unknown;
      try {
        resolveDerivationPolicy(prototypeToken);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
      const error = caught as InvalidReadCoordinateError;
      expect(error.code).toBe("INVALID_READ_COORDINATE");
      expect(error.reason).toBe("UNSUPPORTED_DERIVATION_VERSION");
      expect(error.unsupportedDerivationVersion).toBe(prototypeToken);
    },
  );

  it("only 'm1-v1' resolves — every other probed token, including 'm1-v2', rejects", () => {
    const probedTokens = [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
      "valueOf",
      "m1-v2",
    ];
    for (const token of probedTokens) {
      expect(() => resolveDerivationPolicy(token)).toThrow(
        InvalidReadCoordinateError,
      );
    }
    expect(resolveDerivationPolicy("m1-v1")).toBe(M1_V1_DERIVATION_POLICY);
  });
});
