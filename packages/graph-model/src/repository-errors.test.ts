/**
 * Repository-layer error taxonomy tests (accepted ADR-0023 § 9, invariant
 * 10): exact `readonly` structural fields, the conditional-property rules
 * per reason/kind, deterministic-but-non-contractual messages, and that no
 * error retains a raw cursor token or a complete Evidence payload.
 */
import { describe, expect, it } from "vitest";
import {
  EvidenceAppendError,
  InvalidReadCoordinateError,
  ReferentialIntegrityError,
  UnknownIdentifierError,
  type CursorMismatchField,
} from "./repository-errors.ts";

const RESOLVED_IDENTITY = {
  asOf: "2026-08-07T00:00:00.000Z",
  horizon: 42,
  derivationVersion: "m1-v1",
} as const;

describe("UnknownIdentifierError", () => {
  it("carries exact fields for a globally unknown identifier — resolvedIdentity absent", () => {
    const error = new UnknownIdentifierError({
      identifierKind: "evidence",
      identifier: "atlast:evidence:demo/does-not-exist",
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("UNKNOWN_IDENTIFIER");
    expect(error.identifierKind).toBe("evidence");
    expect(error.identifier).toBe("atlast:evidence:demo/does-not-exist");
    expect(error.resolvedIdentity).toBeUndefined();
    expect("resolvedIdentity" in error).toBe(false);
  });

  it("populates resolvedIdentity for a known-but-not-visible assertion revision", () => {
    const error = new UnknownIdentifierError({
      identifierKind: "assertion",
      identifier: "atlast:assertion:" + "a".repeat(64),
      resolvedIdentity: RESOLVED_IDENTITY,
    });
    expect(error.identifierKind).toBe("assertion");
    expect(error.resolvedIdentity).toEqual(RESOLVED_IDENTITY);
  });

  it("has a deterministic message that is not treated as the API contract", () => {
    const first = new UnknownIdentifierError({
      identifierKind: "subject",
      identifier: "atlast:entity:checkout",
    });
    const second = new UnknownIdentifierError({
      identifierKind: "subject",
      identifier: "atlast:entity:checkout",
    });
    expect(first.message).toBe(second.message);
    expect(typeof first.message).toBe("string");
  });
});

describe("InvalidReadCoordinateError — non-cursor reasons", () => {
  it("EMPTY_EVIDENCE_STORE carries no identity or sequence fields", () => {
    const error = new InvalidReadCoordinateError({
      reason: "EMPTY_EVIDENCE_STORE",
    });
    expect(error.code).toBe("INVALID_READ_COORDINATE");
    expect(error.reason).toBe("EMPTY_EVIDENCE_STORE");
    expect(error.requestedIdentity).toBeUndefined();
    expect(error.firstRecordedSequence).toBeUndefined();
    expect(error.currentWatermark).toBeUndefined();
  });

  it("HORIZON_BEFORE_FIRST_EVIDENCE carries both sequence bounds", () => {
    const error = new InvalidReadCoordinateError({
      reason: "HORIZON_BEFORE_FIRST_EVIDENCE",
      firstRecordedSequence: 10,
      currentWatermark: 50,
    });
    expect(error.reason).toBe("HORIZON_BEFORE_FIRST_EVIDENCE");
    expect(error.firstRecordedSequence).toBe(10);
    expect(error.currentWatermark).toBe(50);
    expect(error.unsupportedDerivationVersion).toBeUndefined();
  });

  it("HORIZON_AFTER_CURRENT_WATERMARK carries both sequence bounds", () => {
    const error = new InvalidReadCoordinateError({
      reason: "HORIZON_AFTER_CURRENT_WATERMARK",
      firstRecordedSequence: 10,
      currentWatermark: 50,
    });
    expect(error.reason).toBe("HORIZON_AFTER_CURRENT_WATERMARK");
    expect(error.firstRecordedSequence).toBe(10);
    expect(error.currentWatermark).toBe(50);
  });

  it("UNSUPPORTED_DERIVATION_VERSION carries the rejected token", () => {
    const error = new InvalidReadCoordinateError({
      reason: "UNSUPPORTED_DERIVATION_VERSION",
      unsupportedDerivationVersion: "m1-v2",
    });
    expect(error.reason).toBe("UNSUPPORTED_DERIVATION_VERSION");
    expect(error.unsupportedDerivationVersion).toBe("m1-v2");
    expect(error.requestedIdentity).toBeUndefined();
  });
});

describe("InvalidReadCoordinateError — cursor reasons", () => {
  it("INVALID_CURSOR with an undetermined kind omits cursorKind and mismatchFields", () => {
    const error = new InvalidReadCoordinateError({ reason: "INVALID_CURSOR" });
    expect(error.reason).toBe("INVALID_CURSOR");
    expect(error.cursorKind).toBeUndefined();
    expect(error.mismatchFields).toBeUndefined();
    expect(error.cursorBoundIdentity).toBeUndefined();
    expect(error.requestedHorizon).toBeUndefined();
  });

  it("INVALID_CURSOR with a determinable kind populates only cursorKind", () => {
    const error = new InvalidReadCoordinateError({
      reason: "INVALID_CURSOR",
      cursorKind: "evidence",
    });
    expect(error.cursorKind).toBe("evidence");
    expect(error.mismatchFields).toBeUndefined();
  });

  it("CURSOR_BINDING_MISMATCH on a pinned graph cursor requires both identities", () => {
    const error = new InvalidReadCoordinateError({
      reason: "CURSOR_BINDING_MISMATCH",
      cursorKind: "graph",
      cursorBoundIdentity: RESOLVED_IDENTITY,
      requestedIdentity: { ...RESOLVED_IDENTITY, horizon: 43 },
      mismatchFields: ["identity"],
    });
    expect(error.cursorKind).toBe("graph");
    expect(error.cursorBoundIdentity).toEqual(RESOLVED_IDENTITY);
    expect(error.requestedIdentity).toEqual({
      ...RESOLVED_IDENTITY,
      horizon: 43,
    });
    expect(error.mismatchFields).toEqual(["identity"]);
    expect(error.requestedHorizon).toBeUndefined();
    expect(error.cursorBoundHorizon).toBeUndefined();
  });

  it("CURSOR_BINDING_MISMATCH on a latest graph cursor omits requestedIdentity", () => {
    const error = new InvalidReadCoordinateError({
      reason: "CURSOR_BINDING_MISMATCH",
      cursorKind: "graph",
      cursorBoundIdentity: RESOLVED_IDENTITY,
      mismatchFields: ["pageSize", "filter"],
    });
    expect(error.cursorBoundIdentity).toEqual(RESOLVED_IDENTITY);
    expect(error.requestedIdentity).toBeUndefined();
    expect("requestedIdentity" in error).toBe(false);
    expect(error.mismatchFields).toEqual(["pageSize", "filter"]);
  });

  it("CURSOR_BINDING_MISMATCH on an evidence cursor requires both horizons and omits identity fields", () => {
    const error = new InvalidReadCoordinateError({
      reason: "CURSOR_BINDING_MISMATCH",
      cursorKind: "evidence",
      requestedHorizon: 60,
      cursorBoundHorizon: 55,
      mismatchFields: ["horizon"],
    });
    expect(error.cursorKind).toBe("evidence");
    expect(error.requestedHorizon).toBe(60);
    expect(error.cursorBoundHorizon).toBe(55);
    expect(error.mismatchFields).toEqual(["horizon"]);
    expect(error.cursorBoundIdentity).toBeUndefined();
    expect(error.requestedIdentity).toBeUndefined();
  });

  it("mismatchFields is a frozen defensive copy — mutating the input array does not affect the error", () => {
    const mismatchFields: CursorMismatchField[] = ["horizon"];
    const error = new InvalidReadCoordinateError({
      reason: "CURSOR_BINDING_MISMATCH",
      cursorKind: "evidence",
      requestedHorizon: 2,
      cursorBoundHorizon: 1,
      mismatchFields,
    });
    mismatchFields.push("pageSize");
    expect(error.mismatchFields).toEqual(["horizon"]);
    expect(Object.isFrozen(error.mismatchFields)).toBe(true);
  });

  it("never retains a raw cursor token on any property", () => {
    const rawToken = "opaque-cursor-token-that-must-never-be-retained";
    const error = new InvalidReadCoordinateError({
      reason: "CURSOR_BINDING_MISMATCH",
      cursorKind: "evidence",
      requestedHorizon: 2,
      cursorBoundHorizon: 1,
      mismatchFields: ["horizon"],
    });
    const serialized = JSON.stringify(Object.assign({}, error));
    expect(serialized).not.toContain(rawToken);
    expect(error.message).not.toContain(rawToken);
    expect(Object.keys(error)).not.toContain("cursor");
    expect(Object.keys(error)).not.toContain("token");
  });
});

describe("ReferentialIntegrityError", () => {
  it("carries exact fields naming the assertion, endpoint role, endpoint identifier, and resolved identity", () => {
    const error = new ReferentialIntegrityError({
      assertionIdentifier: "atlast:assertion:" + "b".repeat(64),
      endpointRole: "source",
      endpointIdentifier: "atlast:entity:missing-endpoint",
      resolvedIdentity: RESOLVED_IDENTITY,
    });
    expect(error.code).toBe("REFERENTIAL_INTEGRITY");
    expect(error.assertionIdentifier).toBe(
      "atlast:assertion:" + "b".repeat(64),
    );
    expect(error.endpointRole).toBe("source");
    expect(error.endpointIdentifier).toBe("atlast:entity:missing-endpoint");
    expect(error.resolvedIdentity).toEqual(RESOLVED_IDENTITY);
  });
});

describe("EvidenceAppendError", () => {
  it("names exactly the offending records, never the whole batch, and never a complete Evidence payload", () => {
    const error = new EvidenceAppendError({
      reason: "DUPLICATE_EVIDENCE_IDENTIFIER",
      evidenceIdentifiers: ["atlast:evidence:demo/dup"],
      recordedSequences: [7],
      currentWatermark: 12,
    });
    expect(error.code).toBe("EVIDENCE_APPEND");
    expect(error.reason).toBe("DUPLICATE_EVIDENCE_IDENTIFIER");
    expect(error.evidenceIdentifiers).toEqual(["atlast:evidence:demo/dup"]);
    expect(error.recordedSequences).toEqual([7]);
    expect(error.currentWatermark).toBe(12);
    expect(Object.isFrozen(error.evidenceIdentifiers)).toBe(true);
    expect(Object.isFrozen(error.recordedSequences)).toBe(true);
  });

  it("supports the NON_INCREASING_RECORDED_SEQUENCE reason with the same exact fields", () => {
    const error = new EvidenceAppendError({
      reason: "NON_INCREASING_RECORDED_SEQUENCE",
      evidenceIdentifiers: ["atlast:evidence:demo/a", "atlast:evidence:demo/b"],
      recordedSequences: [5, 4],
      currentWatermark: 5,
    });
    expect(error.reason).toBe("NON_INCREASING_RECORDED_SEQUENCE");
    expect(error.evidenceIdentifiers).toHaveLength(2);
    expect(error.recordedSequences).toEqual([5, 4]);
  });

  it("input arrays are defensive copies — mutating caller arrays after construction does not affect the error", () => {
    const evidenceIdentifiers = ["atlast:evidence:demo/a"];
    const recordedSequences = [5];
    const error = new EvidenceAppendError({
      reason: "DUPLICATE_EVIDENCE_IDENTIFIER",
      evidenceIdentifiers,
      recordedSequences,
      currentWatermark: 5,
    });
    evidenceIdentifiers.push("atlast:evidence:demo/injected");
    recordedSequences.push(99);
    expect(error.evidenceIdentifiers).toEqual(["atlast:evidence:demo/a"]);
    expect(error.recordedSequences).toEqual([5]);
  });
});
