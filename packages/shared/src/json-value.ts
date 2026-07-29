/**
 * JSON-safe value validation for Evidence's source-native detail payload
 * (ADR-0014: Evidence carries "source-native detail D" and "must not embed
 * connector-specific structure beyond the source-native detail payload").
 * Accepting only values JSON can represent keeps Evidence serializable and
 * canonicalizable (ADR-0016) — no undefined, functions, dates, NaN, or
 * infinities.
 *
 * Zod 4's built-in z.json() is the single source of truth here: it already
 * rejects every non-JSON value above (numbers are validated as finite), so
 * the type is derived with z.infer like every other domain shape (ADR-0005).
 */
import { z } from "zod";

export const jsonValueSchema = z.json();

export type JsonValue = z.infer<typeof jsonValueSchema>;
