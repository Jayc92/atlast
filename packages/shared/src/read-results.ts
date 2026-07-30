/**
 * Read-result shapes for the M1 repository contract (S2): what every
 * repository read returns. The structural rule these schemas enforce is
 * ADR-0014's subject-visibility invariant, restated by ADR-0017: **subjects
 * are never returned bare** — every subject read carries at least one
 * supporting GraphAssertion revision valid under the read's resolved
 * identity, and every returned revision carries its query-time freshness
 * classification. A result missing either cannot validate.
 *
 * Conflict and ambiguity state ride in-band on each revision (they are
 * fields of the S1 graphAssertionSchema) — these result shapes add nothing
 * and remove nothing, so no read can return a cleaned-up graph.
 */
import { z } from "zod";
import { graphAssertionSchema } from "./assertions.ts";
import { evidenceSchema } from "./evidence.ts";
import {
  freshnessSchema,
  pageResultMetadataSchema,
  resolvedReadMetadataSchema,
  traversalResultMetadataSchema,
} from "./read-contract.ts";
import { schemaVersionSchema } from "./schema-version.ts";
import { entitySubjectSchema, graphSubjectSchema } from "./subjects.ts";

/**
 * One GraphAssertion revision paired with its query-time freshness — the
 * only form in which a repository read may hand back a revision. Freshness
 * lives here, beside the immutable revision, never inside it (ADR-0014).
 */
export const assertionReadResultSchema = z.strictObject({
  revision: graphAssertionSchema,
  freshness: freshnessSchema,
});

export type AssertionReadResult = z.infer<typeof assertionReadResultSchema>;

/**
 * A GraphAssertion revision is a claim about exactly one subject (ADR-0014
 * as amended by ADR-0019: the subject identifier is part of the revision's
 * identifying content), so a read result may pair a subject only with
 * revisions whose `subjectIdentifier` IS that subject's identifier — an
 * assertion attached to a different subject would let one subject borrow
 * another's evidence-derived support. Enforced structurally on every
 * subject-bearing result shape, with the issue path naming the exact
 * mismatched assertion.
 */
function requireAssertionsBelongToContainingSubject(
  readResult: {
    subject: { identifier: string };
    assertions: readonly { revision: { subjectIdentifier: string } }[];
  },
  validationContext: {
    addIssue: (issue: {
      code: "custom";
      path: (string | number)[];
      message: string;
    }) => void;
  },
): void {
  for (const [
    assertionIndex,
    assertionResult,
  ] of readResult.assertions.entries()) {
    if (
      assertionResult.revision.subjectIdentifier !==
      readResult.subject.identifier
    ) {
      validationContext.addIssue({
        code: "custom",
        path: ["assertions", assertionIndex, "revision", "subjectIdentifier"],
        message: `Assertion revision is about "${assertionResult.revision.subjectIdentifier}", not the containing subject "${readResult.subject.identifier}" — every returned assertion must belong to its subject`,
      });
    }
  }
}

/**
 * A subject with its supporting revisions: the non-empty `assertions` array
 * is what makes a bare subject unrepresentable — "a subject with no valid
 * assertion at time T simply does not exist in the graph as of T"
 * (ADR-0014) — and every revision in it must be about this subject
 * (subject/assertion binding, ADR-0014/0019).
 */
export const subjectReadResultSchema = z
  .strictObject({
    subject: graphSubjectSchema,
    assertions: z
      .array(assertionReadResultSchema)
      .min(
        1,
        "A subject must be returned with at least one supporting assertion revision — bare subjects do not exist in the graph",
      ),
  })
  .superRefine(requireAssertionsBelongToContainingSubject);

export type SubjectReadResult = z.infer<typeof subjectReadResultSchema>;

/**
 * Envelope for a single-subject read: the subject-with-assertions plus the
 * resolved read metadata every graph read must report (ADR-0017). The
 * metadata lives on the envelope — beside the data, never inside the
 * immutable subject or its revisions.
 */
export const subjectDetailResultSchema = z.strictObject({
  data: subjectReadResultSchema,
  meta: resolvedReadMetadataSchema,
});

export type SubjectDetailResult = z.infer<typeof subjectDetailResultSchema>;

/**
 * Envelope for a single assertion-revision read: the revision-with-freshness
 * plus the resolved read metadata (ADR-0017). Same rule: identity metadata
 * on the envelope, never inside the content-addressed revision.
 */
export const assertionDetailResultSchema = z.strictObject({
  data: assertionReadResultSchema,
  meta: resolvedReadMetadataSchema,
});

export type AssertionDetailResult = z.infer<typeof assertionDetailResultSchema>;

/**
 * A single page of subject results (search and any mixed-kind read): items,
 * page metadata (visible truncation), and the resolved snapshot identity
 * every read reports.
 */
export const subjectPageSchema = z.strictObject({
  items: z.array(subjectReadResultSchema),
  page: pageResultMetadataSchema,
  meta: resolvedReadMetadataSchema,
});

export type SubjectPage = z.infer<typeof subjectPageSchema>;

/**
 * An Entity with its supporting revisions — the entity-inventory item shape
 * (ADR-0020 § 1: M1 inventory is entity-only). The subject is pinned to
 * `entitySubjectSchema`, so a Relationship subject cannot validate in an
 * entity-inventory result; the general `subjectReadResultSchema` used by
 * detail, search, and traversal is unchanged. The same subject/assertion
 * binding applies: every returned revision must be about this entity.
 */
export const entityReadResultSchema = z
  .strictObject({
    subject: entitySubjectSchema,
    assertions: z
      .array(assertionReadResultSchema)
      .min(
        1,
        "An entity must be returned with at least one supporting assertion revision — bare subjects do not exist in the graph",
      ),
  })
  .superRefine(requireAssertionsBelongToContainingSubject);

export type EntityReadResult = z.infer<typeof entityReadResultSchema>;

/**
 * A single page of the entity inventory (ADR-0017 as amended by ADR-0020):
 * Entity subjects only, each with every visible supporting revision —
 * conflicting and ambiguous ones included, in-band. An `entityType`-filtered
 * page selects which entities appear (match-by-any-visible-claim); it never
 * filters, drops, or reorders any returned entity's revisions.
 */
export const entityPageSchema = z.strictObject({
  items: z.array(entityReadResultSchema),
  page: pageResultMetadataSchema,
  meta: resolvedReadMetadataSchema,
});

export type EntityPage = z.infer<typeof entityPageSchema>;

/**
 * A traversal result: the reached subjects (each with their supporting
 * revisions), the explicit truncation report against the 500-subject
 * budget, and the resolved identity.
 */
export const traversalResultSchema = z.strictObject({
  items: z.array(subjectReadResultSchema),
  traversal: traversalResultMetadataSchema,
  meta: resolvedReadMetadataSchema,
});

export type TraversalResult = z.infer<typeof traversalResultSchema>;

/**
 * A single page of Evidence records (audit-side read; Evidence is a fact of
 * ingestion, not a graph claim, so it carries no freshness or assertions).
 */
export const evidencePageSchema = z.strictObject({
  items: z.array(evidenceSchema),
  page: pageResultMetadataSchema,
});

export type EvidencePage = z.infer<typeof evidencePageSchema>;

/**
 * An evidence chain: every Evidence record supporting one subject's
 * returned revisions — the provenance walk behind "why does Atlast believe
 * this?" (the M1 traceability exit criterion). Non-empty by construction:
 * a subject visible in the graph has at least one supporting revision, and
 * every revision's provenance is non-empty (S1).
 */
export const evidenceChainResultSchema = z.strictObject({
  items: z
    .array(evidenceSchema)
    .min(
      1,
      "An evidence chain for a visible subject cannot be empty — every valid revision has provenance",
    ),
  page: pageResultMetadataSchema,
  meta: resolvedReadMetadataSchema,
});

export type EvidenceChainResult = z.infer<typeof evidenceChainResultSchema>;

/**
 * Snapshot summary (ADR-0016/0017): the pinned identity a snapshot was
 * computed at, the schema version its shapes validate under (ADR-0017
 * requires `schemaVersion` on every graph response — reused from the single
 * shared source of truth, so an unknown version is rejected here exactly as
 * on any document), its SHA-256 checksum over the canonical serialization
 * (computed by S4/S6 — S2 validates only the 64-hex form), and the subject
 * count. Snapshot reads accept no latest mode, so the identity here is
 * always the caller's complete pin.
 */
export const snapshotSummarySchema = z.strictObject({
  identity: resolvedReadMetadataSchema.shape.resolvedIdentity,
  schemaVersion: schemaVersionSchema,
  checksum: z
    .string()
    .regex(
      /^[0-9a-f]{64}$/,
      "Snapshot checksum must be 64 lowercase hex characters (SHA-256)",
    ),
  subjectCount: z
    .number()
    .int("Snapshot subject count must be an integer")
    .min(0, "Snapshot subject count cannot be negative"),
});

export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;
