/**
 * Snapshot-checksum builder tests (accepted ADR-0023 §§ 4–5, invariant 4):
 * the exact payload shape, identifier sorting, repeated-call determinism,
 * field sensitivity (including derivationVersion-only sensitivity), and
 * exclusion of subjectCount/subject identifiers/assertion bodies from the
 * hashed payload.
 */
import { describe, expect, it } from "vitest";
import { sha256HexOfCanonicalJson } from "./canonical-digest.ts";
import { sortIdentifiers } from "./collection-order.ts";
import { buildSnapshotChecksum } from "./snapshot-checksum.ts";

const BASE_INPUT = {
  derivationVersion: "m1-v1",
  asOf: "2026-08-07T00:00:00.000Z",
  horizon: 42,
  visibleAssertionIdentifiers: [
    "atlast:assertion:" + "b".repeat(64),
    "atlast:assertion:" + "a".repeat(64),
  ],
};

describe("buildSnapshotChecksum", () => {
  it("digests exactly the ADR-0023 § 4 payload shape, sorted, through the S4 primitives", () => {
    const expected = sha256HexOfCanonicalJson({
      derivationVersion: BASE_INPUT.derivationVersion,
      asOf: BASE_INPUT.asOf,
      horizon: BASE_INPUT.horizon,
      visibleAssertionIdentifiers: sortIdentifiers(
        BASE_INPUT.visibleAssertionIdentifiers,
      ),
    });
    expect(buildSnapshotChecksum(BASE_INPUT)).toBe(expected);
  });

  it("returns a lowercase 64-hex-character SHA-256 digest", () => {
    expect(buildSnapshotChecksum(BASE_INPUT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sorts visibleAssertionIdentifiers before hashing — input order does not affect the digest", () => {
    const reversedInput = {
      ...BASE_INPUT,
      visibleAssertionIdentifiers: [
        ...BASE_INPUT.visibleAssertionIdentifiers,
      ].reverse(),
    };
    expect(buildSnapshotChecksum(BASE_INPUT)).toBe(
      buildSnapshotChecksum(reversedInput),
    );
  });

  it("is byte-identical across repeated calls over an equal input", () => {
    expect(buildSnapshotChecksum(BASE_INPUT)).toBe(
      buildSnapshotChecksum({ ...BASE_INPUT }),
    );
  });

  it("changing only derivationVersion changes the digest (m1-v2 fixture-seed proof obligation)", () => {
    const withDifferentVersion = {
      ...BASE_INPUT,
      derivationVersion: "m1-v2",
    };
    expect(buildSnapshotChecksum(withDifferentVersion)).not.toBe(
      buildSnapshotChecksum(BASE_INPUT),
    );
  });

  it("changing only asOf changes the digest", () => {
    const withDifferentAsOf = {
      ...BASE_INPUT,
      asOf: "2026-08-08T00:00:00.000Z",
    };
    expect(buildSnapshotChecksum(withDifferentAsOf)).not.toBe(
      buildSnapshotChecksum(BASE_INPUT),
    );
  });

  it("changing only horizon changes the digest", () => {
    const withDifferentHorizon = { ...BASE_INPUT, horizon: 43 };
    expect(buildSnapshotChecksum(withDifferentHorizon)).not.toBe(
      buildSnapshotChecksum(BASE_INPUT),
    );
  });

  it("changing only a visible assertion identifier changes the digest", () => {
    const withDifferentIdentifier = {
      ...BASE_INPUT,
      visibleAssertionIdentifiers: [
        "atlast:assertion:" + "c".repeat(64),
        "atlast:assertion:" + "a".repeat(64),
      ],
    };
    expect(buildSnapshotChecksum(withDifferentIdentifier)).not.toBe(
      buildSnapshotChecksum(BASE_INPUT),
    );
  });

  it("produces the deterministic empty-assertion digest for a valid empty snapshot", () => {
    const emptySnapshotInput = {
      ...BASE_INPUT,
      visibleAssertionIdentifiers: [],
    };
    const expected = sha256HexOfCanonicalJson({
      derivationVersion: BASE_INPUT.derivationVersion,
      asOf: BASE_INPUT.asOf,
      horizon: BASE_INPUT.horizon,
      visibleAssertionIdentifiers: [],
    });
    expect(buildSnapshotChecksum(emptySnapshotInput)).toBe(expected);
  });

  it("excludes subjectCount and subject identifiers — passing extra fields on the input object does not affect the digest", () => {
    const inputWithExtraneousFields = {
      ...BASE_INPUT,
    } as typeof BASE_INPUT & {
      subjectCount: number;
      subjectIdentifiers: string[];
    };
    inputWithExtraneousFields.subjectCount = 999;
    inputWithExtraneousFields.subjectIdentifiers = ["atlast:entity:checkout"];
    expect(buildSnapshotChecksum(inputWithExtraneousFields)).toBe(
      buildSnapshotChecksum(BASE_INPUT),
    );
  });

  it("does not mutate the caller's visibleAssertionIdentifiers array", () => {
    const callerArray = [...BASE_INPUT.visibleAssertionIdentifiers];
    const inputWithCallerArray = {
      ...BASE_INPUT,
      visibleAssertionIdentifiers: callerArray,
    };
    buildSnapshotChecksum(inputWithCallerArray);
    expect(callerArray).toEqual(BASE_INPUT.visibleAssertionIdentifiers);
  });
});
