/**
 * Focused tests proving the S7 HTTP-boundary schemas (ADR-0024 §§ 6, 7, 9)
 * match the accepted contract exactly: route 7's narrowed
 * `checksum`/`subjectCount` envelope, route 5's no-`resolvedIdentity`
 * envelope, the closed `errorResponseSchema` union (one case per `code`),
 * the exact `UNKNOWN_IDENTIFIER` per-kind identifier shapes, the exact
 * two-variant `CURSOR_BINDING_MISMATCH` split, the closed
 * `CursorMismatchField` vocabulary, and `INTERNAL_ERROR`'s unconditional
 * `details: {}` redaction shape.
 */
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./schema-version.ts";
import {
  cursorMismatchFieldSchema,
  errorResponseSchema,
  evidenceDetailResultSchema,
  invalidReadCoordinateDetailsSchema,
  snapshotDetailResultSchema,
  snapshotSummaryDataSchema,
  unknownIdentifierDetailsSchema,
} from "./http-contract.ts";

const VALID_ASSERTION_IDENTIFIER =
  "atlast:assertion:a3f5c9e12b8d4076fa1e5b09c27d83f4a6510e9dcb2478f30a1b5c6d7e8f9012";
const VALID_EVIDENCE_IDENTIFIER = "atlast:evidence:demo-company/traces/0001";
const VALID_ENTITY_IDENTIFIER = "atlast:entity:service/checkout";

const validResolvedIdentity = {
  asOf: "2026-07-23T00:00:00.000Z",
  horizon: 42,
  derivationVersion: "m1-v1",
} as const;

const validMeta = {
  resolvedIdentity: validResolvedIdentity,
  schemaVersion: CURRENT_SCHEMA_VERSION,
} as const;

describe("snapshotSummaryDataSchema and snapshotDetailResultSchema (ADR-0024 § 6)", () => {
  const validSummaryData = {
    checksum:
      "a3f5c9e12b8d4076fa1e5b09c27d83f4a6510e9dcb2478f30a1b5c6d7e8f9012",
    subjectCount: 12,
  } as const;

  it("accepts exactly checksum and subjectCount", () => {
    expect(snapshotSummaryDataSchema.safeParse(validSummaryData).success).toBe(
      true,
    );
  });

  it("rejects an identity or schemaVersion field smuggled into data (route 7 narrows the repository shape)", () => {
    expect(
      snapshotSummaryDataSchema.safeParse({
        ...validSummaryData,
        identity: validResolvedIdentity,
      }).success,
    ).toBe(false);
    expect(
      snapshotSummaryDataSchema.safeParse({
        ...validSummaryData,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed checksum, reusing snapshotSummarySchema's own bound", () => {
    expect(
      snapshotSummaryDataSchema.safeParse({
        ...validSummaryData,
        checksum: "not-hex",
      }).success,
    ).toBe(false);
  });

  it("accepts the complete envelope with data and resolved metadata", () => {
    expect(
      snapshotDetailResultSchema.safeParse({
        data: validSummaryData,
        meta: validMeta,
      }).success,
    ).toBe(true);
  });

  it("rejects an envelope missing meta", () => {
    expect(
      snapshotDetailResultSchema.safeParse({ data: validSummaryData }).success,
    ).toBe(false);
  });
});

describe("evidenceDetailResultSchema (ADR-0024 § 7)", () => {
  const validEvidenceRecord = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    identifier: VALID_EVIDENCE_IDENTIFIER,
    observedAt: "2026-07-23T00:00:00.000Z",
    recordedAt: "2026-07-23T00:05:00.000Z",
    recordedSequence: 1,
    sourceScopedIdentity: {
      source: "synthetic-traces",
      sourceNativeId: "svc-checkout",
    },
    observation: { observationKind: "entity", entityType: "service" },
    detail: { spanCount: 12 },
  } as const;

  it("accepts data plus a meta carrying only schemaVersion", () => {
    expect(
      evidenceDetailResultSchema.safeParse({
        data: validEvidenceRecord,
        meta: { schemaVersion: CURRENT_SCHEMA_VERSION },
      }).success,
    ).toBe(true);
  });

  it("rejects a resolvedIdentity smuggled into meta (Evidence carries no snapshot identity)", () => {
    expect(
      evidenceDetailResultSchema.safeParse({
        data: validEvidenceRecord,
        meta: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          resolvedIdentity: validResolvedIdentity,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an envelope missing meta", () => {
    expect(
      evidenceDetailResultSchema.safeParse({ data: validEvidenceRecord })
        .success,
    ).toBe(false);
  });
});

describe("cursorMismatchFieldSchema (ADR-0024 § 9)", () => {
  it.each([
    "operation",
    "identity",
    "horizon",
    "filter",
    "searchQuery",
    "ordering",
    "pageSize",
  ])("accepts %s", (field) => {
    expect(cursorMismatchFieldSchema.safeParse(field).success).toBe(true);
  });

  it("rejects a value outside the closed vocabulary", () => {
    expect(cursorMismatchFieldSchema.safeParse("subjectKind").success).toBe(
      false,
    );
  });
});

describe("unknownIdentifierDetailsSchema (ADR-0024 § 9)", () => {
  it("accepts the subject variant with an optional resolvedIdentity", () => {
    expect(
      unknownIdentifierDetailsSchema.safeParse({
        identifierKind: "subject",
        identifier: VALID_ENTITY_IDENTIFIER,
      }).success,
    ).toBe(true);
    expect(
      unknownIdentifierDetailsSchema.safeParse({
        identifierKind: "subject",
        identifier: VALID_ENTITY_IDENTIFIER,
        resolvedIdentity: validResolvedIdentity,
      }).success,
    ).toBe(true);
  });

  it("accepts the assertion variant only with a content-addressed assertion identifier", () => {
    expect(
      unknownIdentifierDetailsSchema.safeParse({
        identifierKind: "assertion",
        identifier: VALID_ASSERTION_IDENTIFIER,
      }).success,
    ).toBe(true);
    expect(
      unknownIdentifierDetailsSchema.safeParse({
        identifierKind: "assertion",
        identifier: "not-an-assertion-identifier",
      }).success,
    ).toBe(false);
  });

  it("accepts the evidence variant only without a resolvedIdentity (Evidence lookups are not identity-scoped)", () => {
    expect(
      unknownIdentifierDetailsSchema.safeParse({
        identifierKind: "evidence",
        identifier: VALID_EVIDENCE_IDENTIFIER,
      }).success,
    ).toBe(true);
    expect(
      unknownIdentifierDetailsSchema.safeParse({
        identifierKind: "evidence",
        identifier: VALID_EVIDENCE_IDENTIFIER,
        resolvedIdentity: validResolvedIdentity,
      }).success,
    ).toBe(false);
  });

  it("rejects an identifierKind outside the closed set", () => {
    expect(
      unknownIdentifierDetailsSchema.safeParse({
        identifierKind: "relationship",
        identifier: "atlast:relationship:calls/checkout-to-payments",
      }).success,
    ).toBe(false);
  });
});

describe("invalidReadCoordinateDetailsSchema (ADR-0024 § 9)", () => {
  it("accepts EMPTY_EVIDENCE_STORE with no other fields", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "EMPTY_EVIDENCE_STORE",
      }).success,
    ).toBe(true);
  });

  it.each(["HORIZON_BEFORE_FIRST_EVIDENCE", "HORIZON_AFTER_CURRENT_WATERMARK"])(
    "accepts %s with firstRecordedSequence and currentWatermark",
    (reason) => {
      expect(
        invalidReadCoordinateDetailsSchema.safeParse({
          reason,
          firstRecordedSequence: 1,
          currentWatermark: 5,
        }).success,
      ).toBe(true);
    },
  );

  it("rejects HORIZON_BEFORE_FIRST_EVIDENCE with a zero watermark (the sentinel never reaches this field)", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "HORIZON_BEFORE_FIRST_EVIDENCE",
        firstRecordedSequence: 0,
        currentWatermark: 5,
      }).success,
    ).toBe(false);
  });

  it("accepts UNSUPPORTED_DERIVATION_VERSION with a syntactically valid derivation version token", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "UNSUPPORTED_DERIVATION_VERSION",
        unsupportedDerivationVersion: "m1-v2",
      }).success,
    ).toBe(true);
  });

  it("rejects UNSUPPORTED_DERIVATION_VERSION with a malformed token", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "UNSUPPORTED_DERIVATION_VERSION",
        unsupportedDerivationVersion: "Not Valid",
      }).success,
    ).toBe(false);
  });

  it("accepts INVALID_CURSOR with an optional cursorKind", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({ reason: "INVALID_CURSOR" })
        .success,
    ).toBe(true);
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "INVALID_CURSOR",
        cursorKind: "graph",
      }).success,
    ).toBe(true);
  });

  it("accepts the graph CURSOR_BINDING_MISMATCH variant with its exact fields", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "CURSOR_BINDING_MISMATCH",
        cursorKind: "graph",
        cursorBoundIdentity: validResolvedIdentity,
        mismatchFields: ["horizon"],
      }).success,
    ).toBe(true);
  });

  it("accepts the evidence CURSOR_BINDING_MISMATCH variant with its exact fields", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "CURSOR_BINDING_MISMATCH",
        cursorKind: "evidence",
        requestedHorizon: 10,
        cursorBoundHorizon: 5,
        mismatchFields: ["horizon"],
      }).success,
    ).toBe(true);
  });

  it("rejects a graph CURSOR_BINDING_MISMATCH carrying the evidence variant's fields (the two variants never merge)", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "CURSOR_BINDING_MISMATCH",
        cursorKind: "graph",
        cursorBoundIdentity: validResolvedIdentity,
        cursorBoundHorizon: 5,
        mismatchFields: ["horizon"],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty mismatchFields array", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "CURSOR_BINDING_MISMATCH",
        cursorKind: "graph",
        cursorBoundIdentity: validResolvedIdentity,
        mismatchFields: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a mismatchFields value outside the closed CursorMismatchField vocabulary", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "CURSOR_BINDING_MISMATCH",
        cursorKind: "graph",
        cursorBoundIdentity: validResolvedIdentity,
        mismatchFields: ["subjectKind"],
      }).success,
    ).toBe(false);
  });

  it("rejects an unrecognized reason", () => {
    expect(
      invalidReadCoordinateDetailsSchema.safeParse({
        reason: "SOMETHING_ELSE",
      }).success,
    ).toBe(false);
  });
});

describe("errorResponseSchema (ADR-0024 § 9)", () => {
  it("accepts a VALIDATION_ERROR with its issues shape", () => {
    expect(
      errorResponseSchema.safeParse({
        code: "VALIDATION_ERROR",
        message: "Invalid request.",
        details: {
          issues: [{ path: ["query", "depth"], message: "Required" }],
        },
      }).success,
    ).toBe(true);
  });

  it("accepts a MALFORMED_REQUEST with empty details", () => {
    expect(
      errorResponseSchema.safeParse({
        code: "MALFORMED_REQUEST",
        message: "Malformed request.",
        details: {},
      }).success,
    ).toBe(true);
  });

  it("accepts a ROUTE_NOT_FOUND with method and path", () => {
    expect(
      errorResponseSchema.safeParse({
        code: "ROUTE_NOT_FOUND",
        message: "Not found.",
        details: { method: "GET", path: "/api/v1/unknown" },
      }).success,
    ).toBe(true);
  });

  it("accepts an UNKNOWN_IDENTIFIER whose details validate against its identifierKind's exact schema", () => {
    expect(
      errorResponseSchema.safeParse({
        code: "UNKNOWN_IDENTIFIER",
        message: "Unknown identifier.",
        details: {
          identifierKind: "evidence",
          identifier: VALID_EVIDENCE_IDENTIFIER,
        },
      }).success,
    ).toBe(true);
  });

  it("accepts an INVALID_READ_COORDINATE whose details validate against the closed union", () => {
    expect(
      errorResponseSchema.safeParse({
        code: "INVALID_READ_COORDINATE",
        message: "Invalid read coordinate.",
        details: { reason: "EMPTY_EVIDENCE_STORE" },
      }).success,
    ).toBe(true);
  });

  it("accepts a REFERENTIAL_INTEGRITY with fully exposed, typed details", () => {
    expect(
      errorResponseSchema.safeParse({
        code: "REFERENTIAL_INTEGRITY",
        message: "Referential integrity violation.",
        details: {
          assertionIdentifier: VALID_ASSERTION_IDENTIFIER,
          endpointRole: "source",
          endpointIdentifier: VALID_ENTITY_IDENTIFIER,
          resolvedIdentity: validResolvedIdentity,
        },
      }).success,
    ).toBe(true);
  });

  it("accepts an INTERNAL_ERROR only with empty details, never the triggering exception's own fields", () => {
    expect(
      errorResponseSchema.safeParse({
        code: "INTERNAL_ERROR",
        message: "An unexpected internal error occurred.",
        details: {},
      }).success,
    ).toBe(true);
    expect(
      errorResponseSchema.safeParse({
        code: "INTERNAL_ERROR",
        message: "An unexpected internal error occurred.",
        details: { stack: "at foo (bar.ts:1:1)" },
      }).success,
    ).toBe(false);
  });

  it("rejects a code outside the closed vocabulary", () => {
    expect(
      errorResponseSchema.safeParse({
        code: "SOMETHING_ELSE",
        message: "Unrecognized.",
        details: {},
      }).success,
    ).toBe(false);
  });

  it("rejects a VALIDATION_ERROR whose details use the wrong code's shape (details are code-specific, not interchangeable)", () => {
    expect(
      errorResponseSchema.safeParse({
        code: "VALIDATION_ERROR",
        message: "Invalid request.",
        details: { method: "GET", path: "/api/v1/unknown" },
      }).success,
    ).toBe(false);
  });
});
