/**
 * S6-internal repository-layer error taxonomy (accepted ADR-0023 § 9): a
 * small, closed set of named `Error` subclasses thrown in place of generic
 * `Error`/`TypeError`/`RangeError` for every repository-layer failure mode.
 * Every class carries a stable, `readonly`, machine-readable structural
 * contract — `Error.message` remains deterministic but is never the API
 * contract; S7 and tests bind only to the structural properties below.
 *
 * Every field here is a safe, deterministic, bounded scalar or identity
 * coordinate — no class retains a raw cursor token or a complete Evidence
 * record/content payload (ADR-0023 § 9).
 *
 * Every conditional property is declared `declare readonly x?: T;`, never a
 * plain class field. Under `useDefineForClassFields` (the default from
 * ES2022 targets, including this package's ES2024 target), a plain class
 * field declared `readonly x?: T;` is `Object.defineProperty`'d with value
 * `undefined` on every instance during construction — `"x" in instance` is
 * then `true` even when the ADR requires the property to be genuinely
 * absent. `declare` opts the field out of that emitted definition, so a
 * plain `this.x = value` assignment inside the constructor is the only
 * thing that ever creates the property, and only when the condition
 * applies.
 */
import type { SnapshotIdentity } from "@atlast/shared";

/** The two absence conditions ADR-0023 § 9 folds into one error class. */
export type IdentifierKind = "subject" | "assertion" | "evidence";

export interface UnknownIdentifierErrorParams {
  readonly identifierKind: IdentifierKind;
  readonly identifier: string;
  readonly resolvedIdentity?: SnapshotIdentity;
}

/**
 * An identifier that does not resolve to a returnable record — either
 * globally unknown, or a known assertion revision not visible at the
 * resolved identity (`resolvedIdentity` populated for the latter).
 */
export class UnknownIdentifierError extends Error {
  readonly code = "UNKNOWN_IDENTIFIER" as const;
  readonly identifierKind: IdentifierKind;
  readonly identifier: string;
  declare readonly resolvedIdentity?: SnapshotIdentity;

  constructor(params: UnknownIdentifierErrorParams) {
    super(
      `Unknown ${params.identifierKind} identifier ${JSON.stringify(params.identifier)}` +
        (params.resolvedIdentity !== undefined
          ? ` at resolved identity ${JSON.stringify(params.resolvedIdentity)}`
          : ""),
    );
    this.name = "UnknownIdentifierError";
    this.identifierKind = params.identifierKind;
    this.identifier = params.identifier;
    if (params.resolvedIdentity !== undefined) {
      this.resolvedIdentity = params.resolvedIdentity;
    }
  }
}

export type InvalidReadCoordinateReason =
  | "EMPTY_EVIDENCE_STORE"
  | "HORIZON_BEFORE_FIRST_EVIDENCE"
  | "HORIZON_AFTER_CURRENT_WATERMARK"
  | "UNSUPPORTED_DERIVATION_VERSION"
  | "INVALID_CURSOR"
  | "CURSOR_BINDING_MISMATCH";

export type CursorKind = "graph" | "evidence";

export type CursorMismatchField =
  | "operation"
  | "identity"
  | "horizon"
  | "filter"
  | "searchQuery"
  | "ordering"
  | "pageSize";

/**
 * Discriminated construction parameters: one shape per reason, so an
 * impossible field combination (e.g. `mismatchFields` on a non-cursor
 * reason) is a compile-time error, not a runtime possibility.
 */
export type InvalidReadCoordinateErrorParams =
  | { readonly reason: "EMPTY_EVIDENCE_STORE" }
  | {
      readonly reason: "HORIZON_BEFORE_FIRST_EVIDENCE";
      readonly firstRecordedSequence: number;
      readonly currentWatermark: number;
    }
  | {
      readonly reason: "HORIZON_AFTER_CURRENT_WATERMARK";
      readonly firstRecordedSequence: number;
      readonly currentWatermark: number;
    }
  | {
      readonly reason: "UNSUPPORTED_DERIVATION_VERSION";
      readonly unsupportedDerivationVersion: string;
    }
  | {
      readonly reason: "INVALID_CURSOR";
      readonly cursorKind?: CursorKind;
    }
  | {
      readonly reason: "CURSOR_BINDING_MISMATCH";
      readonly cursorKind: "graph";
      readonly cursorBoundIdentity: SnapshotIdentity;
      readonly requestedIdentity?: SnapshotIdentity;
      readonly mismatchFields: readonly CursorMismatchField[];
    }
  | {
      readonly reason: "CURSOR_BINDING_MISMATCH";
      readonly cursorKind: "evidence";
      readonly requestedHorizon: number;
      readonly cursorBoundHorizon: number;
      readonly mismatchFields: readonly CursorMismatchField[];
    };

function describeInvalidReadCoordinate(
  params: InvalidReadCoordinateErrorParams,
): string {
  switch (params.reason) {
    case "EMPTY_EVIDENCE_STORE":
      return "Invalid read coordinate: the Evidence store is empty and has no valid graph-read horizon";
    case "HORIZON_BEFORE_FIRST_EVIDENCE":
      return `Invalid read coordinate: horizon precedes the first recorded Evidence (firstRecordedSequence=${String(params.firstRecordedSequence)}, currentWatermark=${String(params.currentWatermark)})`;
    case "HORIZON_AFTER_CURRENT_WATERMARK":
      return `Invalid read coordinate: horizon exceeds the current watermark (firstRecordedSequence=${String(params.firstRecordedSequence)}, currentWatermark=${String(params.currentWatermark)})`;
    case "UNSUPPORTED_DERIVATION_VERSION":
      return `Invalid read coordinate: unsupported derivation version ${JSON.stringify(params.unsupportedDerivationVersion)}`;
    case "INVALID_CURSOR":
      return `Invalid read coordinate: the pagination cursor is unusable${
        params.cursorKind !== undefined
          ? ` (cursorKind=${params.cursorKind})`
          : ""
      }`;
    case "CURSOR_BINDING_MISMATCH":
      return `Invalid read coordinate: pagination cursor binding mismatch (cursorKind=${params.cursorKind}, mismatchFields=${params.mismatchFields.join(",")})`;
  }
}

/**
 * A syntactically valid but semantically unusable read coordinate — an
 * empty-store or out-of-range horizon, an unsupported derivation version, or
 * an unusable/mismatched pagination cursor (ADR-0023 § 9). The raw cursor
 * token is never retained on, or exposed by, this error.
 */
export class InvalidReadCoordinateError extends Error {
  readonly code = "INVALID_READ_COORDINATE" as const;
  readonly reason: InvalidReadCoordinateReason;
  declare readonly requestedIdentity?: SnapshotIdentity;
  declare readonly cursorBoundIdentity?: SnapshotIdentity;
  declare readonly cursorKind?: CursorKind;
  declare readonly requestedHorizon?: number;
  declare readonly cursorBoundHorizon?: number;
  declare readonly mismatchFields?: readonly CursorMismatchField[];
  declare readonly firstRecordedSequence?: number;
  declare readonly currentWatermark?: number;
  declare readonly unsupportedDerivationVersion?: string;

  constructor(params: InvalidReadCoordinateErrorParams) {
    super(describeInvalidReadCoordinate(params));
    this.name = "InvalidReadCoordinateError";
    this.reason = params.reason;

    switch (params.reason) {
      case "EMPTY_EVIDENCE_STORE":
        break;
      case "HORIZON_BEFORE_FIRST_EVIDENCE":
      case "HORIZON_AFTER_CURRENT_WATERMARK":
        this.firstRecordedSequence = params.firstRecordedSequence;
        this.currentWatermark = params.currentWatermark;
        break;
      case "UNSUPPORTED_DERIVATION_VERSION":
        this.unsupportedDerivationVersion = params.unsupportedDerivationVersion;
        break;
      case "INVALID_CURSOR":
        if (params.cursorKind !== undefined) {
          this.cursorKind = params.cursorKind;
        }
        break;
      case "CURSOR_BINDING_MISMATCH":
        this.cursorKind = params.cursorKind;
        this.mismatchFields = Object.freeze([...params.mismatchFields]);
        if (params.cursorKind === "graph") {
          this.cursorBoundIdentity = params.cursorBoundIdentity;
          if (params.requestedIdentity !== undefined) {
            this.requestedIdentity = params.requestedIdentity;
          }
        } else {
          this.requestedHorizon = params.requestedHorizon;
          this.cursorBoundHorizon = params.cursorBoundHorizon;
        }
        break;
    }
  }
}

export type EndpointRole = "source" | "target";

export interface ReferentialIntegrityErrorParams {
  readonly assertionIdentifier: string;
  readonly endpointRole: EndpointRole;
  readonly endpointIdentifier: string;
  readonly resolvedIdentity: SnapshotIdentity;
}

/**
 * A relationship claim's endpoint does not resolve to an existing Entity
 * subject at the resolved identity (ADR-0023 § 6) — a data-integrity defect
 * of that exact resolved `(asOf, horizon, derivationVersion)`, never the
 * whole horizon.
 */
export class ReferentialIntegrityError extends Error {
  readonly code = "REFERENTIAL_INTEGRITY" as const;
  readonly assertionIdentifier: string;
  readonly endpointRole: EndpointRole;
  readonly endpointIdentifier: string;
  readonly resolvedIdentity: SnapshotIdentity;

  constructor(params: ReferentialIntegrityErrorParams) {
    super(
      `Assertion ${params.assertionIdentifier} has an unresolved ${params.endpointRole} endpoint ${JSON.stringify(params.endpointIdentifier)} at resolved identity ${JSON.stringify(params.resolvedIdentity)}`,
    );
    this.name = "ReferentialIntegrityError";
    this.assertionIdentifier = params.assertionIdentifier;
    this.endpointRole = params.endpointRole;
    this.endpointIdentifier = params.endpointIdentifier;
    this.resolvedIdentity = params.resolvedIdentity;
  }
}

export type EvidenceAppendErrorReason =
  "DUPLICATE_EVIDENCE_IDENTIFIER" | "NON_INCREASING_RECORDED_SEQUENCE";

export interface EvidenceAppendErrorParams {
  readonly reason: EvidenceAppendErrorReason;
  readonly evidenceIdentifiers: readonly string[];
  readonly recordedSequences: readonly number[];
  readonly currentWatermark: number;
}

/**
 * A schema-valid `appendEvidence` batch that violates a repository state
 * invariant (ADR-0023 § 8) — an identifier collision or a non-increasing
 * `recordedSequence`. Shared-schema validation failures surface unchanged as
 * `ZodError` and are never this class. Names exactly the offending
 * record(s), never the whole batch, and never a complete Evidence payload.
 */
export class EvidenceAppendError extends Error {
  readonly code = "EVIDENCE_APPEND" as const;
  readonly reason: EvidenceAppendErrorReason;
  readonly evidenceIdentifiers: readonly string[];
  readonly recordedSequences: readonly number[];
  readonly currentWatermark: number;

  constructor(params: EvidenceAppendErrorParams) {
    super(
      `Evidence append rejected (${params.reason}) for identifiers [${params.evidenceIdentifiers.join(", ")}] with sequences [${params.recordedSequences.join(", ")}] against current watermark ${String(params.currentWatermark)}`,
    );
    this.name = "EvidenceAppendError";
    this.reason = params.reason;
    this.evidenceIdentifiers = Object.freeze([...params.evidenceIdentifiers]);
    this.recordedSequences = Object.freeze([...params.recordedSequences]);
    this.currentWatermark = params.currentWatermark;
  }
}
