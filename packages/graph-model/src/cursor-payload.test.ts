/**
 * Graph/Evidence cursor payload tests (accepted ADR-0023 § 2, invariant 2):
 * kind separation, deterministic encoding, and rejection of malformed,
 * unknown-version, wrong-kind, missing-binding, and invalid-position
 * payloads as `INVALID_CURSOR` — never retaining the raw token.
 */
import { describe, expect, it } from "vitest";
import {
  decodeEvidenceCursor,
  decodeGraphCursor,
  encodeEvidenceCursor,
  encodeGraphCursor,
  type EvidenceCursorPayload,
  type GraphCursorPayload,
} from "./cursor-payload.ts";
import { InvalidReadCoordinateError } from "./repository-errors.ts";

const GRAPH_PAYLOAD: GraphCursorPayload = {
  cursorKind: "graph",
  identity: {
    asOf: "2026-08-07T00:00:00.000Z",
    horizon: 42,
    derivationVersion: "m1-v1",
  },
  operation: "listEntities",
  coordinates: { entityType: "service" },
  ordering: "identifier-ascending",
  pageSize: 25,
  position: "atlast:entity:checkout",
};

const EVIDENCE_PAYLOAD: EvidenceCursorPayload = {
  cursorKind: "evidence",
  horizon: 42,
  ordering: "observed-at-then-recorded-sequence",
  pageSize: 25,
  position: "atlast:evidence:demo-company/checkout/0001",
};

describe("graph cursor round trip", () => {
  it("encodes and decodes back to an equal payload", () => {
    const token = encodeGraphCursor(GRAPH_PAYLOAD);
    expect(decodeGraphCursor(token)).toEqual(GRAPH_PAYLOAD);
  });

  it("output satisfies the shared opaque-token alphabet", () => {
    const token = encodeGraphCursor(GRAPH_PAYLOAD);
    expect(token).toMatch(/^[A-Za-z0-9._~-]+$/);
    expect(token.length).toBeGreaterThan(0);
    expect(token.length).toBeLessThanOrEqual(4096);
  });

  it("encoding is deterministic across repeated calls over an equal payload", () => {
    const tokenOne = encodeGraphCursor(GRAPH_PAYLOAD);
    const tokenTwo = encodeGraphCursor({ ...GRAPH_PAYLOAD });
    expect(tokenOne).toBe(tokenTwo);
  });

  it("decoding an evidence cursor as a graph cursor rejects as INVALID_CURSOR with the determined kind", () => {
    const evidenceToken = encodeEvidenceCursor(EVIDENCE_PAYLOAD);
    let caught: unknown;
    try {
      decodeGraphCursor(evidenceToken);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("INVALID_CURSOR");
    expect(error.cursorKind).toBe("evidence");
    expect(error.mismatchFields).toBeUndefined();
  });
});

describe("evidence cursor round trip", () => {
  it("encodes and decodes back to an equal payload", () => {
    const token = encodeEvidenceCursor(EVIDENCE_PAYLOAD);
    expect(decodeEvidenceCursor(token)).toEqual(EVIDENCE_PAYLOAD);
  });

  it("encoding is deterministic across repeated calls over an equal payload", () => {
    const tokenOne = encodeEvidenceCursor(EVIDENCE_PAYLOAD);
    const tokenTwo = encodeEvidenceCursor({ ...EVIDENCE_PAYLOAD });
    expect(tokenOne).toBe(tokenTwo);
  });

  it("decoding a graph cursor as an evidence cursor rejects as INVALID_CURSOR with the determined kind", () => {
    const graphToken = encodeGraphCursor(GRAPH_PAYLOAD);
    let caught: unknown;
    try {
      decodeEvidenceCursor(graphToken);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).cursorKind).toBe("graph");
  });

  it("carries no asOf or derivationVersion binding", () => {
    const decoded = decodeEvidenceCursor(
      encodeEvidenceCursor(EVIDENCE_PAYLOAD),
    );
    expect("asOf" in decoded).toBe(false);
    expect("derivationVersion" in decoded).toBe(false);
  });
});

describe("malformed and structurally invalid cursor rejection", () => {
  it("rejects a token whose decoded bytes are not valid UTF-8", () => {
    const invalidUtf8Token = Buffer.from([0xff, 0xfe, 0xfd]).toString(
      "base64url",
    );
    expect(() => decodeGraphCursor(invalidUtf8Token)).toThrow(
      InvalidReadCoordinateError,
    );
  });

  it("rejects a token that decodes to valid text but not JSON", () => {
    const notJsonToken = Buffer.from("not-json-at-all", "utf8").toString(
      "base64url",
    );
    expect(() => decodeGraphCursor(notJsonToken)).toThrow(
      InvalidReadCoordinateError,
    );
  });

  it("rejects a token that decodes to a JSON array, not an object", () => {
    const arrayToken = Buffer.from(JSON.stringify([1, 2, 3]), "utf8").toString(
      "base64url",
    );
    expect(() => decodeGraphCursor(arrayToken)).toThrow(
      InvalidReadCoordinateError,
    );
  });

  it("rejects an unknown cursor encoding version", () => {
    const futureVersionToken = Buffer.from(
      JSON.stringify({
        cursorVersion: 99,
        cursorKind: "graph",
        identity: GRAPH_PAYLOAD.identity,
        operation: GRAPH_PAYLOAD.operation,
        coordinates: GRAPH_PAYLOAD.coordinates,
        ordering: GRAPH_PAYLOAD.ordering,
        pageSize: GRAPH_PAYLOAD.pageSize,
        position: GRAPH_PAYLOAD.position,
      }),
      "utf8",
    ).toString("base64url");
    let caught: unknown;
    try {
      decodeGraphCursor(futureVersionToken);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    expect((caught as InvalidReadCoordinateError).cursorKind).toBe("graph");
  });

  it("rejects a graph cursor missing required binding metadata (identity)", () => {
    const envelope: Record<string, unknown> = {
      cursorVersion: 1,
      cursorKind: "graph",
      operation: GRAPH_PAYLOAD.operation,
      coordinates: GRAPH_PAYLOAD.coordinates,
      ordering: GRAPH_PAYLOAD.ordering,
      pageSize: GRAPH_PAYLOAD.pageSize,
      position: GRAPH_PAYLOAD.position,
    };
    const token = Buffer.from(JSON.stringify(envelope), "utf8").toString(
      "base64url",
    );
    expect(() => decodeGraphCursor(token)).toThrow(InvalidReadCoordinateError);
  });

  it("rejects a graph cursor naming an unrecognized operation", () => {
    const envelope = {
      cursorVersion: 1,
      cursorKind: "graph",
      identity: GRAPH_PAYLOAD.identity,
      operation: "deleteEverything",
      coordinates: GRAPH_PAYLOAD.coordinates,
      ordering: GRAPH_PAYLOAD.ordering,
      pageSize: GRAPH_PAYLOAD.pageSize,
      position: GRAPH_PAYLOAD.position,
    };
    const token = Buffer.from(JSON.stringify(envelope), "utf8").toString(
      "base64url",
    );
    expect(() => decodeGraphCursor(token)).toThrow(InvalidReadCoordinateError);
  });

  it("rejects a graph cursor with an invalid internal position (empty string)", () => {
    const envelope = { ...GRAPH_PAYLOAD, cursorVersion: 1, position: "" };
    const token = Buffer.from(JSON.stringify(envelope), "utf8").toString(
      "base64url",
    );
    expect(() => decodeGraphCursor(token)).toThrow(InvalidReadCoordinateError);
  });

  it("rejects a graph cursor with an out-of-range page size", () => {
    const envelope = { ...GRAPH_PAYLOAD, cursorVersion: 1, pageSize: 0 };
    const token = Buffer.from(JSON.stringify(envelope), "utf8").toString(
      "base64url",
    );
    expect(() => decodeGraphCursor(token)).toThrow(InvalidReadCoordinateError);
  });

  it("rejects an evidence cursor with an invalid horizon (zero)", () => {
    const envelope: Record<string, unknown> = {
      cursorVersion: 1,
      cursorKind: "evidence",
      horizon: 0,
      ordering: EVIDENCE_PAYLOAD.ordering,
      pageSize: EVIDENCE_PAYLOAD.pageSize,
      position: EVIDENCE_PAYLOAD.position,
    };
    const token = Buffer.from(JSON.stringify(envelope), "utf8").toString(
      "base64url",
    );
    expect(() => decodeEvidenceCursor(token)).toThrow(
      InvalidReadCoordinateError,
    );
  });

  it("rejects an evidence cursor missing required binding metadata (position)", () => {
    const envelope: Record<string, unknown> = {
      cursorVersion: 1,
      cursorKind: "evidence",
      horizon: EVIDENCE_PAYLOAD.horizon,
      ordering: EVIDENCE_PAYLOAD.ordering,
      pageSize: EVIDENCE_PAYLOAD.pageSize,
    };
    const token = Buffer.from(JSON.stringify(envelope), "utf8").toString(
      "base64url",
    );
    expect(() => decodeEvidenceCursor(token)).toThrow(
      InvalidReadCoordinateError,
    );
  });

  it("never includes the raw offending token on the thrown error", () => {
    const notJsonToken = Buffer.from("not-json-at-all", "utf8").toString(
      "base64url",
    );
    let caught: unknown;
    try {
      decodeGraphCursor(notJsonToken);
    } catch (error) {
      caught = error;
    }
    const error = caught as InvalidReadCoordinateError;
    const serialized = JSON.stringify(Object.assign({}, error));
    expect(serialized).not.toContain(notJsonToken);
    expect(error.message).not.toContain(notJsonToken);
  });
});

describe("exact envelope shape enforcement (ADR-0023 § 2 regression)", () => {
  function tokenFromEnvelope(envelope: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  }

  function withoutField(
    envelope: Record<string, unknown>,
    fieldToOmit: string,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(envelope).filter(([key]) => key !== fieldToOmit),
    );
  }

  const VALID_EVIDENCE_ENVELOPE: Record<string, unknown> = {
    cursorVersion: 1,
    cursorKind: "evidence",
    horizon: EVIDENCE_PAYLOAD.horizon,
    ordering: EVIDENCE_PAYLOAD.ordering,
    pageSize: EVIDENCE_PAYLOAD.pageSize,
    position: EVIDENCE_PAYLOAD.position,
  };

  const VALID_GRAPH_ENVELOPE: Record<string, unknown> = {
    cursorVersion: 1,
    cursorKind: "graph",
    identity: GRAPH_PAYLOAD.identity,
    operation: GRAPH_PAYLOAD.operation,
    coordinates: GRAPH_PAYLOAD.coordinates,
    ordering: GRAPH_PAYLOAD.ordering,
    pageSize: GRAPH_PAYLOAD.pageSize,
    position: GRAPH_PAYLOAD.position,
  };

  it("an otherwise-valid Evidence envelope decodes successfully (baseline)", () => {
    expect(
      decodeEvidenceCursor(tokenFromEnvelope(VALID_EVIDENCE_ENVELOPE)),
    ).toEqual(EVIDENCE_PAYLOAD);
  });

  it("an otherwise-valid graph envelope decodes successfully (baseline)", () => {
    expect(decodeGraphCursor(tokenFromEnvelope(VALID_GRAPH_ENVELOPE))).toEqual(
      GRAPH_PAYLOAD,
    );
  });

  it.each(["asOf", "derivationVersion", "identity"])(
    "rejects an Evidence cursor containing the forbidden field %s",
    (forbiddenField) => {
      const envelope = {
        ...VALID_EVIDENCE_ENVELOPE,
        [forbiddenField]:
          forbiddenField === "identity"
            ? GRAPH_PAYLOAD.identity
            : "2026-08-07T00:00:00.000Z",
      };
      let caught: unknown;
      try {
        decodeEvidenceCursor(tokenFromEnvelope(envelope));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
      const error = caught as InvalidReadCoordinateError;
      expect(error.reason).toBe("INVALID_CURSOR");
      expect(error.cursorKind).toBe("evidence");
    },
  );

  it("rejects a graph cursor containing an arbitrary extra field", () => {
    const envelope = {
      ...VALID_GRAPH_ENVELOPE,
      unexpectedField: "should-not-be-here",
    };
    let caught: unknown;
    try {
      decodeGraphCursor(tokenFromEnvelope(envelope));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidReadCoordinateError);
    const error = caught as InvalidReadCoordinateError;
    expect(error.reason).toBe("INVALID_CURSOR");
    expect(error.cursorKind).toBe("graph");
  });

  it("rejects an Evidence cursor containing an arbitrary extra field", () => {
    const envelope = {
      ...VALID_EVIDENCE_ENVELOPE,
      unexpectedField: "should-not-be-here",
    };
    expect(() => decodeEvidenceCursor(tokenFromEnvelope(envelope))).toThrow(
      InvalidReadCoordinateError,
    );
  });

  it.each([
    "cursorVersion",
    "cursorKind",
    "horizon",
    "ordering",
    "pageSize",
    "position",
  ])(
    "rejects an Evidence cursor missing the required field %s",
    (missingField) => {
      const envelope = withoutField(VALID_EVIDENCE_ENVELOPE, missingField);
      expect(() => decodeEvidenceCursor(tokenFromEnvelope(envelope))).toThrow(
        InvalidReadCoordinateError,
      );
    },
  );

  it.each([
    "cursorVersion",
    "cursorKind",
    "identity",
    "operation",
    "coordinates",
    "ordering",
    "pageSize",
    "position",
  ])("rejects a graph cursor missing the required field %s", (missingField) => {
    const envelope = withoutField(VALID_GRAPH_ENVELOPE, missingField);
    expect(() => decodeGraphCursor(tokenFromEnvelope(envelope))).toThrow(
      InvalidReadCoordinateError,
    );
  });
});
