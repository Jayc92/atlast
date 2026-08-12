/**
 * Generic HTTP query-string-to-number coercion primitives (ADR-0024 §§ 3-5,
 * per § 15's explicit allowance for "any HTTP-query-coercion helper schemas
 * needed for §§ 3–5"). These two schemas are the only such helpers S7
 * needs: every other §§ 3-5 rule either reuses an existing schema
 * (`snapshotIdentitySchema` for the complete-pin case) or depends on which
 * query keys a specific route accepts (§ 2's per-route matrix), which is
 * `apps/api` route-registration work, not a shared-schema concern.
 *
 * They live here, rather than as inline schemas inside `apps/api`, because
 * `apps/api` does not and must not declare a direct dependency on `zod`
 * (ADR-0024 § 13 names only `@atlast/graph-model` and `@atlast/shared` as
 * `apps/api`'s direct workspace dependencies) — every Zod schema `apps/api`
 * validates against must be constructed inside a package that already
 * depends on `zod`, then consumed only through its `safeParse` result.
 */
import { z } from "zod";

/**
 * Strict non-negative integer coercion from a query-string value: rejects
 * non-integer, empty, and non-numeric strings. Built on `z.string()`, so a
 * repeated query key — which Fastify's query-string parsing represents as
 * an array — fails this shape check before the regex ever runs, exactly
 * the verified behavioral contract ADR-0024 § 4 describes.
 */
export const strictIntegerQueryParameterSchema = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer")
  .transform((value) => Number(value));

/**
 * Strict non-negative decimal coercion from a query-string value
 * (`minConfidence`'s `[0, 1]` range) — the range bound itself is enforced
 * by `traversalRequestBoundsSchema.minimumConfidence`, not repeated here.
 */
export const strictDecimalQueryParameterSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/, "must be a non-negative decimal number")
  .transform((value) => Number(value));
