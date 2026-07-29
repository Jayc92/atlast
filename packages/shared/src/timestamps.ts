/**
 * Timestamp contract shared by every domain document (ADR-0016 § "Canonical
 * serialization"): UTC ISO 8601 with exactly millisecond precision and a `Z`
 * suffix, e.g. `2026-07-23T00:00:00.000Z`. One fixed textual form means two
 * equal instants can never serialize differently, which content addressing
 * and snapshot checksums (S4/S6) depend on.
 */
import { z } from "zod";

/**
 * Shape check: four-digit year, mandatory milliseconds, mandatory `Z`.
 * Offsets (`+02:00`), missing/extra fractional digits, and lowercase `z`
 * are all rejected — they are alternate spellings of the same instant,
 * which the canonical form forbids.
 */
const UTC_MILLISECOND_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const utcMillisecondTimestampSchema = z
  .string()
  .regex(
    UTC_MILLISECOND_TIMESTAMP_PATTERN,
    "Timestamp must be UTC ISO 8601 with exactly millisecond precision and a Z suffix (e.g. 2026-07-23T00:00:00.000Z)",
  )
  .refine(
    // The pattern alone admits impossible dates (month 13, February 30).
    // Round-tripping through Date proves the calendar fields are real:
    // Date.toISOString emits exactly this canonical form, so a valid
    // timestamp reproduces itself byte-for-byte. Parsing a fixed string is
    // deterministic — no wall clock is read.
    (candidateTimestamp: string): boolean => {
      const parsedMilliseconds = Date.parse(candidateTimestamp);
      return (
        !Number.isNaN(parsedMilliseconds) &&
        new Date(parsedMilliseconds).toISOString() === candidateTimestamp
      );
    },
    "Timestamp matches the canonical shape but is not a real calendar instant",
  );

export type UtcMillisecondTimestamp = z.infer<
  typeof utcMillisecondTimestampSchema
>;
