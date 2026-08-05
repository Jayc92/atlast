/**
 * Identity-normalization tests (ADR-0022 §§ 2–3, invariants 2–3): the exact
 * fixture mappings, locale independence, the explicit whitespace list,
 * single-pass affix stripping, loud empty/non-ASCII rejection, and type-free
 * identifier construction.
 */
import { describe, expect, it } from "vitest";
import { M1_V1_DERIVATION_POLICY } from "./derivation-policy.ts";
import {
  buildEntityIdentifier,
  buildRelationshipIdentifier,
  IdentityNormalizationError,
  normalizeIdentityKey,
} from "./identity-normalization.ts";

const EVIDENCE_ID = "atlast:evidence:demo-company/test/0001";

function normalize(sourceNativeId: string): string {
  return normalizeIdentityKey(
    sourceNativeId,
    M1_V1_DERIVATION_POLICY,
    EVIDENCE_ID,
  );
}

describe("normalizeIdentityKey — fixture vectors", () => {
  it.each([
    ["svc-checkout", "checkout"],
    ["Checkout Service", "checkout"],
    ["service-checkout", "checkout"],
    ["svc-orders", "orders"],
    ["orders-service", "orders"],
    ["ledger-api", "ledger-api"],
    ["ledger", "ledger"],
    ["svc-payments", "payments"],
    ["svc-fulfillment", "fulfillment"],
    ["checkout-payment-call", "checkout-payment-call"],
  ])("%s → %s", (input: string, expectedKey: string) => {
    expect(normalize(input)).toBe(expectedKey);
  });
});

describe("normalizeIdentityKey — pinned semantics", () => {
  it("strips at most one prefix and one suffix in a single pass (no fixpoint)", () => {
    // service- strips first (declared order tries svc- first, which does not
    // match), leaving svc-checkout — stripping is not repeated.
    expect(normalize("service-svc-checkout")).toBe("svc-checkout");
    // One prefix AND one suffix may each strip once.
    expect(normalize("svc-checkout-service")).toBe("checkout");
  });

  it("collapses runs of the listed whitespace code points to one hyphen", () => {
    expect(normalize("Checkout \t\r\n Service")).toBe("checkout");
    expect(normalize("orders   staging")).toBe("orders-staging");
  });

  it("trims only the listed whitespace code points", () => {
    expect(normalize("  checkout \t")).toBe("checkout");
  });

  it("does not treat unlisted Unicode spaces as whitespace — they are rejected at the grammar step", () => {
    expect(() => normalize("checkout service")).toThrow(
      IdentityNormalizationError,
    );
    expect(() => normalize("checkout service")).toThrow(
      IdentityNormalizationError,
    );
  });

  it("rejects an identity that normalizes to an empty key, naming the Evidence", () => {
    let caught: unknown;
    try {
      normalize("svc-");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IdentityNormalizationError);
    expect((caught as IdentityNormalizationError).evidenceIdentifier).toBe(
      EVIDENCE_ID,
    );
  });

  it("rejects surviving non-ASCII letters instead of transliterating or hashing", () => {
    expect(() => normalize("café")).toThrow(IdentityNormalizationError);
    expect(() => normalize("Über-Service")).toThrow(IdentityNormalizationError);
  });

  it("rejects surviving uppercase only when outside ASCII (ASCII uppercase maps)", () => {
    expect(normalize("CHECKOUT")).toBe("checkout");
    // Turkish dotted capital I (U+0130) is not ASCII, stays unchanged, fails.
    expect(() => normalize("İstanbul")).toThrow(IdentityNormalizationError);
  });
});

describe("normalizeIdentityKey — locale independence", () => {
  it("maps ASCII I exactly like every other ASCII letter — the Turkish-I family cannot influence the result", () => {
    // Under a Turkish locale, locale-aware lowercasing maps "I" to dotless
    // "ı" (U+0131), which would fail the grammar. The pinned ASCII map
    // always yields "i", proving no locale-sensitive path exists.
    expect(normalize("INVENTORY")).toBe("inventory");
    expect(normalize("API")).toBe("api");
  });

  it("leaves non-ASCII case pairs unmapped (rejected at the grammar step) rather than lowercasing them", () => {
    // A Unicode-aware toLowerCase would map "Ä" to "ä" and still fail, but
    // the failing key proves WHICH mapping ran: the ASCII map leaves "Ä"
    // itself in the key.
    let caught: unknown;
    try {
      normalize("Äpfel");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IdentityNormalizationError);
    expect((caught as IdentityNormalizationError).failingKey).toBe("Äpfel");
  });
});

describe("stable identifier construction (type-free)", () => {
  it("builds Entity and Relationship identifiers by verbatim prefix concatenation", () => {
    expect(buildEntityIdentifier("checkout")).toBe("atlast:entity:checkout");
    expect(buildRelationshipIdentifier("checkout-payment-call")).toBe(
      "atlast:relationship:checkout-payment-call",
    );
  });
});
