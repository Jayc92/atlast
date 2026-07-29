/**
 * Open classification-token schema shared by canonical claims (claims.ts)
 * and Evidence observations (evidence.ts), so the two layers can never
 * disagree about what a well-formed entity or relationship type looks like.
 *
 * Domain vocabulary (PROJECT_SPEC.md § 4) names entity types and
 * relationship types by example, deliberately open-ended ("service,
 * database, queue, scheduled job, etc."). S1 therefore validates the
 * classification as a well-formed lowercase kebab-case token rather than a
 * closed enum — closing the set is a reconciliation-policy concern (S5),
 * and an enum here would force a schema version bump per new fixture type.
 */
import { z } from "zod";

export const classificationTokenSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Classification must be a lowercase kebab-case token (e.g. service, reads-from)",
  );

export type ClassificationToken = z.infer<typeof classificationTokenSchema>;
