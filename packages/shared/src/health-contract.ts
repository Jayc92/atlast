/**
 * The `GET /health` response contract (ADR-0004; `apps/api/src/app.ts`'s
 * `healthResponseJsonSchema`). This M0 endpoint predates the M1 domain and
 * carries no snapshot identity or schema version of its own, so it has never
 * had a shared Zod schema — the M0 shell instead validated it with an ad hoc
 * type guard. M2-A's browser query client validates every response, success
 * or error, through an exported `@atlast/shared` schema (ADR-0026 § 3), so
 * this one additive, wholly independent schema lets `/health` join that same
 * discipline without touching the M0 endpoint or any M1 domain/repository
 * schema.
 */
import { z } from "zod";

export const healthCheckResultSchema = z.strictObject({
  status: z.literal("ok"),
  service: z.literal("atlast-api"),
});

export type HealthCheckResult = z.infer<typeof healthCheckResultSchema>;
