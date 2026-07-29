/**
 * Namespaced identifier schemas per ADR-0014 § "Identity": every Entity
 * subject, Relationship subject, and Evidence record carries a stable,
 * namespaced, human-readable identifier `atlast:<concept>:<segment>[/…]`,
 * while GraphAssertion identifiers are content-addressed
 * (`atlast:assertion:<sha-256-digest>`). Construction rules — normalization,
 * allowed characters, casing — are part of the schema contract and validated
 * at runtime; identifiers are otherwise opaque (no parsing them for facts).
 *
 * Segment grammar (fixed here as the ADR's "identifier construction rules"):
 * lowercase ASCII letters, digits, and single interior hyphens
 * (`checkout-v2`, not `-checkout`, `checkout--v2`, or `Checkout`), matching
 * the ADR-0015 normalization output (lowercased, whitespace collapsed to
 * `-`). Segments join with `/`; at least one segment is required.
 */
import { z } from "zod";

const IDENTIFIER_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";
const IDENTIFIER_PATH = `${IDENTIFIER_SEGMENT}(?:/${IDENTIFIER_SEGMENT})*`;

const ENTITY_IDENTIFIER_PATTERN = new RegExp(
  `^atlast:entity:${IDENTIFIER_PATH}$`,
);
const RELATIONSHIP_IDENTIFIER_PATTERN = new RegExp(
  `^atlast:relationship:${IDENTIFIER_PATH}$`,
);
const EVIDENCE_IDENTIFIER_PATTERN = new RegExp(
  `^atlast:evidence:${IDENTIFIER_PATH}$`,
);

/**
 * Content-addressed assertion identifier: the digest is SHA-256 over the
 * canonical serialization of the revision's identifying content
 * (ADR-0014/ADR-0016). S1 validates only the syntactic form — exactly 64
 * lowercase hexadecimal characters; computing and verifying the digest
 * belongs to S4/S6.
 */
const ASSERTION_IDENTIFIER_PATTERN = /^atlast:assertion:[0-9a-f]{64}$/;

export const entityIdentifierSchema = z
  .string()
  .regex(
    ENTITY_IDENTIFIER_PATTERN,
    "Entity identifier must match atlast:entity:<segment>[/<segment>…] with lowercase kebab-case segments",
  );

export const relationshipIdentifierSchema = z
  .string()
  .regex(
    RELATIONSHIP_IDENTIFIER_PATTERN,
    "Relationship identifier must match atlast:relationship:<segment>[/<segment>…] with lowercase kebab-case segments",
  );

export const evidenceIdentifierSchema = z
  .string()
  .regex(
    EVIDENCE_IDENTIFIER_PATTERN,
    "Evidence identifier must match atlast:evidence:<segment>[/<segment>…] with lowercase kebab-case segments",
  );

export const assertionIdentifierSchema = z
  .string()
  .regex(
    ASSERTION_IDENTIFIER_PATTERN,
    "GraphAssertion identifier must match atlast:assertion:<64 lowercase hex chars of a SHA-256 digest>",
  );

export type EntityIdentifier = z.infer<typeof entityIdentifierSchema>;
export type RelationshipIdentifier = z.infer<
  typeof relationshipIdentifierSchema
>;
export type EvidenceIdentifier = z.infer<typeof evidenceIdentifierSchema>;
export type AssertionIdentifier = z.infer<typeof assertionIdentifierSchema>;
