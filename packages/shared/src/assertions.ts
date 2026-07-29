/**
 * GraphAssertion revision schema per ADR-0014 (immutable, content-addressed,
 * evidence-derived revisions) as amended by ADR-0019 (the canonical claim
 * owns type/endpoint facts). A revision carries every identifying component
 * the content address is computed over — derivation version, subject
 * identifier, canonical claim, validity interval, provenance, rule trace,
 * conflict/ambiguity state — plus its identifier and derived confidence.
 *
 * S1 validates shape only: digest computation and canonical serialization
 * are S4/S6, confidence computation is S5, and freshness is query-time
 * response data that must never appear on a revision (ADR-0014) — the
 * strict object makes a stored `freshness` field a validation error.
 */
import { z } from "zod";
import { canonicalClaimSchema } from "./claims.ts";
import {
  assertionIdentifierSchema,
  entityIdentifierSchema,
  evidenceIdentifierSchema,
  relationshipIdentifierSchema,
} from "./identifiers.ts";
import { schemaVersionSchema } from "./schema-version.ts";
import { utcMillisecondTimestampSchema } from "./timestamps.ts";

/**
 * Versioned derivation-policy identifier (ADR-0015 § "The versioned
 * derivation policy"), e.g. `m1-v1`. S1 validates the token form only; the
 * policy document itself is S5 material.
 */
export const derivationVersionSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Derivation version must be a lowercase kebab-case token (e.g. m1-v1)",
  );

/**
 * Non-empty provenance: the set of Evidence references supporting this
 * revision. "A revision with zero Evidence references is structurally
 * invalid — rejected at schema validation" (ADR-0014). Duplicate references
 * would let one observation masquerade as corroboration, so they are
 * rejected too.
 */
export const provenanceSchema = z
  .array(evidenceIdentifierSchema)
  .min(1, "Provenance must reference at least one Evidence record")
  .refine(
    (evidenceIdentifiers: readonly string[]): boolean =>
      new Set(evidenceIdentifiers).size === evidenceIdentifiers.length,
    "Provenance must not contain duplicate Evidence identifiers",
  );

/**
 * Confidence in [0, 1], computed deterministically by reconciliation
 * (ADR-0015 fixes the formula — S5). S1 validates the range; z.number()
 * already excludes NaN and the infinities, keeping the value finite.
 */
export const confidenceSchema = z
  .number()
  .min(0, "Confidence must be at least 0")
  .max(1, "Confidence must be at most 1");

/**
 * Half-open validity interval [validFrom, validTo) on the observedAt axis
 * (ADR-0016). `validTo` is omitted while the interval is open at the
 * pinned horizon; when present it must lie strictly after `validFrom`
 * (an empty or reversed interval can never contain any instant, so it is
 * a data error, not a degenerate case). The canonical timestamp form is
 * fixed-width, so lexicographic comparison is chronological comparison.
 */
export const validityIntervalSchema = z
  .strictObject({
    validFrom: utcMillisecondTimestampSchema,
    validTo: utcMillisecondTimestampSchema.optional(),
  })
  .refine(
    (interval): boolean =>
      interval.validTo === undefined || interval.validTo > interval.validFrom,
    "validTo must be strictly later than validFrom (half-open interval [validFrom, validTo))",
  );

/**
 * One named-rule application (ADR-0015: "every identity decision is
 * traceable to a named rule and the Evidence that triggered it") citing the
 * exact Evidence that triggered it — a rule application with no evidence
 * citation would be an unexplainable step. The trace is ordered; the
 * assertion requires at least one entry, and every cited identifier must
 * also appear in the assertion's provenance (enforced on the assertion,
 * where both sides are visible).
 */
export const ruleTraceEntrySchema = z.strictObject({
  ruleName: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Rule name must be a lowercase kebab-case token",
    ),
  /** The Evidence records that triggered this rule application. */
  evidenceIdentifiers: z
    .array(evidenceIdentifierSchema)
    .min(1, "A rule application must cite at least one Evidence record")
    .refine(
      (citedIdentifiers: readonly string[]): boolean =>
        new Set(citedIdentifiers).size === citedIdentifiers.length,
      "A rule application must not cite the same Evidence record twice",
    ),
  /** Human-readable account of what the rule matched — why, not what. */
  detail: z.string().min(1, "Rule trace detail must be non-empty").optional(),
});

export const ruleTraceSchema = z
  .array(ruleTraceEntrySchema)
  .min(1, "Rule trace must contain at least one named rule application");

/**
 * Explicit conflict state (ADR-0014 § "Conflicting assertions coexist",
 * ADR-0019 § 3): when Evidence supports mutually exclusive claims about one
 * subject, the conflict structure holds every competing claim with its own
 * provenance and per-claim confidence (ADR-0015 § "Conflict": "the
 * assertion surfaces as conflicted with per-claim confidence") — no field
 * anywhere selects a winner. `uncontested` is spelled out rather than
 * defaulted so absence of conflict is a validated statement, never a
 * silent fallback.
 */
export const competingClaimSchema = z.strictObject({
  claim: canonicalClaimSchema,
  provenance: provenanceSchema,
  confidence: confidenceSchema,
});

export type CompetingClaim = z.infer<typeof competingClaimSchema>;

export const conflictStateSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("uncontested"),
  }),
  z.strictObject({
    status: z.literal("conflicted"),
    competingClaims: z
      .array(competingClaimSchema)
      .min(1, "A conflicted state must record at least one competing claim"),
  }),
]);

/**
 * Explicit ambiguity state (ADR-0015 § "Ambiguity"): a partial or uncertain
 * match keeps identities separate and flags each with a marker referencing
 * the near-match. Unresolved is the correct output — the schema has no way
 * to express a merged resolution.
 */
export const ambiguityStateSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("unambiguous"),
  }),
  z.strictObject({
    status: z.literal("ambiguous"),
    nearMatches: z
      .array(
        z.strictObject({
          /** The stable subject this one nearly matched. */
          nearMatchSubjectIdentifier: z.union([
            entityIdentifierSchema,
            relationshipIdentifierSchema,
          ]),
          /** Why the match was only partial (e.g. the weak rule involved). */
          reason: z.string().min(1, "Ambiguity reason must be non-empty"),
        }),
      )
      .min(1, "An ambiguous state must reference at least one near-match"),
  }),
]);

const ENTITY_IDENTIFIER_PREFIX = "atlast:entity:";
const RELATIONSHIP_IDENTIFIER_PREFIX = "atlast:relationship:";

export const graphAssertionSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    identifier: assertionIdentifierSchema,
    derivationVersion: derivationVersionSchema,
    /** The stable subject this revision is about (either kind). */
    subjectIdentifier: z.union([
      entityIdentifierSchema,
      relationshipIdentifierSchema,
    ]),
    claim: canonicalClaimSchema,
    validity: validityIntervalSchema,
    provenance: provenanceSchema,
    confidence: confidenceSchema,
    ruleTrace: ruleTraceSchema,
    conflictState: conflictStateSchema,
    ambiguityState: ambiguityStateSchema,
  })
  .superRefine((assertionRevision, validationContext) => {
    // ADR-0019 § 2: a claim of one kind attached to a subject of the other
    // kind is structurally invalid. The subject's kind is readable from its
    // identifier namespace without any repository lookup.
    const subjectIsEntity = assertionRevision.subjectIdentifier.startsWith(
      ENTITY_IDENTIFIER_PREFIX,
    );
    const subjectKind = subjectIsEntity ? "entity" : "relationship";
    if (assertionRevision.claim.claimKind !== subjectKind) {
      validationContext.addIssue({
        code: "custom",
        path: ["claim", "claimKind"],
        message: `Claim kind "${assertionRevision.claim.claimKind}" does not match the subject kind of "${assertionRevision.subjectIdentifier}"`,
      });
    }

    // A conflict is competing claims about ONE subject, so every competing
    // claim must be the same kind as the assertion's claim and subject —
    // a cross-kind "conflict" would be two different subjects, not one.
    if (assertionRevision.conflictState.status === "conflicted") {
      for (const [
        index,
        competingClaim,
      ] of assertionRevision.conflictState.competingClaims.entries()) {
        if (competingClaim.claim.claimKind !== subjectKind) {
          validationContext.addIssue({
            code: "custom",
            path: [
              "conflictState",
              "competingClaims",
              index,
              "claim",
              "claimKind",
            ],
            message: `Competing claim kind "${competingClaim.claim.claimKind}" does not match the subject kind "${subjectKind}"`,
          });
        }
      }
    }

    // An ambiguity is a near-match between identities of the SAME kind
    // (ADR-0015: near-matching identity keys) — an entity cannot be a
    // near-match of a relationship.
    if (assertionRevision.ambiguityState.status === "ambiguous") {
      const requiredPrefix = subjectIsEntity
        ? ENTITY_IDENTIFIER_PREFIX
        : RELATIONSHIP_IDENTIFIER_PREFIX;
      for (const [
        index,
        nearMatch,
      ] of assertionRevision.ambiguityState.nearMatches.entries()) {
        if (!nearMatch.nearMatchSubjectIdentifier.startsWith(requiredPrefix)) {
          validationContext.addIssue({
            code: "custom",
            path: [
              "ambiguityState",
              "nearMatches",
              index,
              "nearMatchSubjectIdentifier",
            ],
            message: `Near-match "${nearMatch.nearMatchSubjectIdentifier}" is not in the subject's namespace ("${requiredPrefix}…")`,
          });
        }
      }
    }

    // Every Evidence record a rule application cites must be part of the
    // revision's provenance: the trace explains this revision, so it cannot
    // cite evidence the revision does not carry. Pure set membership over
    // the document in hand — no storage is read.
    const provenanceIdentifiers = new Set(assertionRevision.provenance);
    for (const [
      entryIndex,
      ruleTraceEntry,
    ] of assertionRevision.ruleTrace.entries()) {
      for (const [
        citationIndex,
        citedEvidenceIdentifier,
      ] of ruleTraceEntry.evidenceIdentifiers.entries()) {
        if (!provenanceIdentifiers.has(citedEvidenceIdentifier)) {
          validationContext.addIssue({
            code: "custom",
            path: [
              "ruleTrace",
              entryIndex,
              "evidenceIdentifiers",
              citationIndex,
            ],
            message: `Rule trace cites "${citedEvidenceIdentifier}", which is not in the assertion's provenance`,
          });
        }
      }
    }
  });

export type DerivationVersion = z.infer<typeof derivationVersionSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type ValidityInterval = z.infer<typeof validityIntervalSchema>;
export type RuleTraceEntry = z.infer<typeof ruleTraceEntrySchema>;
export type RuleTrace = z.infer<typeof ruleTraceSchema>;
export type ConflictState = z.infer<typeof conflictStateSchema>;
export type AmbiguityState = z.infer<typeof ambiguityStateSchema>;
export type GraphAssertion = z.infer<typeof graphAssertionSchema>;
