/**
 * Schema-version gate tests (ADR-0014 § "Validation and schema
 * versioning"): documents with unknown versions are rejected loudly,
 * never coerced.
 */
import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  schemaVersionSchema,
} from "./schema-version.ts";

describe("schemaVersionSchema", () => {
  it("accepts exactly the current schema version", () => {
    expect(schemaVersionSchema.safeParse(CURRENT_SCHEMA_VERSION).success).toBe(
      true,
    );
  });

  it.each([
    ["a future version", "atlast-domain-v2"],
    ["a casing variant", "Atlast-Domain-V1"],
    ["a whitespace variant", " atlast-domain-v1"],
    ["an empty string", ""],
  ])("rejects %s", (_description: string, unknownVersion: string) => {
    expect(schemaVersionSchema.safeParse(unknownVersion).success).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(schemaVersionSchema.safeParse(1).success).toBe(false);
    expect(schemaVersionSchema.safeParse(null).success).toBe(false);
    expect(schemaVersionSchema.safeParse(undefined).success).toBe(false);
  });
});
