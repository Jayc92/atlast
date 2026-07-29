/**
 * Canonical-claim schemas per ADR-0019 § 2: the GraphAssertion's canonical
 * claim owns the evidence-derived facts that ADR-0014 originally placed on
 * subjects. Claims form a discriminated union whose `claimKind` matches the
 * subject's `subjectKind` (the assertion schema enforces the pairing).
 *
 * Endpoint validation here is syntax-only (ADR-0019 § 4): source and target
 * must be well-formed Entity identifiers in the `atlast:entity:` namespace.
 * Whether they resolve to existing Entity subjects is the S2 repository
 * contract, proven by the S6 implementation — never a schema concern.
 */
import { z } from "zod";
import { classificationTokenSchema } from "./classification.ts";
import { entityIdentifierSchema } from "./identifiers.ts";

export const entityClaimSchema = z.strictObject({
  claimKind: z.literal("entity"),
  /** The entity classification/type, e.g. `service`, `database`, `queue`. */
  entityType: classificationTokenSchema,
});

export const relationshipClaimSchema = z.strictObject({
  claimKind: z.literal("relationship"),
  /** The relationship type, e.g. `calls`, `reads-from`, `publishes-to`. */
  relationshipType: classificationTokenSchema,
  /** Directed edge origin — syntax-validated Entity identifier only. */
  sourceEntityIdentifier: entityIdentifierSchema,
  /** Directed edge destination — syntax-validated Entity identifier only. */
  targetEntityIdentifier: entityIdentifierSchema,
});

export const canonicalClaimSchema = z.discriminatedUnion("claimKind", [
  entityClaimSchema,
  relationshipClaimSchema,
]);

export type EntityClaim = z.infer<typeof entityClaimSchema>;
export type RelationshipClaim = z.infer<typeof relationshipClaimSchema>;
export type CanonicalClaim = z.infer<typeof canonicalClaimSchema>;
