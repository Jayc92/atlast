/**
 * Stable graph subjects per ADR-0014 as amended by ADR-0019: subjects are
 * pure identity anchors carrying exactly `schemaVersion`, `identifier`, and
 * `subjectKind` — no entity type, relationship type, endpoints, ownership,
 * or any other evidence-derived fact. Those facts live in the GraphAssertion
 * canonical claim (see claims.ts), so incompatible claims about one stable
 * identity can coexist without any subject field silently picking a winner.
 *
 * Strict objects make subject purity structural: a record smuggling a `type`
 * or `endpoints` field is rejected, not stripped.
 */
import { z } from "zod";
import {
  entityIdentifierSchema,
  relationshipIdentifierSchema,
} from "./identifiers.ts";
import { schemaVersionSchema } from "./schema-version.ts";

export const entitySubjectSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  identifier: entityIdentifierSchema,
  subjectKind: z.literal("entity"),
});

export const relationshipSubjectSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  identifier: relationshipIdentifierSchema,
  subjectKind: z.literal("relationship"),
});

/**
 * Either stable subject, discriminated by `subjectKind` — the discriminant
 * is part of identity itself (ADR-0019 § 1), not a claim about the world.
 */
export const graphSubjectSchema = z.discriminatedUnion("subjectKind", [
  entitySubjectSchema,
  relationshipSubjectSchema,
]);

export type EntitySubject = z.infer<typeof entitySubjectSchema>;
export type RelationshipSubject = z.infer<typeof relationshipSubjectSchema>;
export type GraphSubject = z.infer<typeof graphSubjectSchema>;
