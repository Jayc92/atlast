/**
 * Explicit schema versioning for every serialized domain document
 * (ADR-0014 § "Validation and schema versioning"): documents carry a
 * `schemaVersion` field, unknown versions are rejected loudly and never
 * coerced. Evolution is additive within a version; a breaking change
 * increments the version and is itself ADR-worthy.
 */
import { z } from "zod";

/**
 * The single current domain schema version. Every S1 document schema
 * requires this exact literal, so a document written under a future
 * (or mistyped) version fails validation instead of being silently read.
 */
export const CURRENT_SCHEMA_VERSION = "atlast-domain-v1" as const;

export const schemaVersionSchema = z.literal(CURRENT_SCHEMA_VERSION);

export type SchemaVersion = z.infer<typeof schemaVersionSchema>;
