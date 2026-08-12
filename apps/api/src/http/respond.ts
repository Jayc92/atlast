/**
 * Mandatory response validation before every successful send (ADR-0024
 * § 11): the repository's result is validated against its exact response
 * schema before `reply.send`, never trusted as already-shaped. A failure
 * here is caught by the central error handler and mapped to
 * `INTERNAL_ERROR` — never relabeled `VALIDATION_ERROR`, since this step
 * validates the repository's output, not the client's request.
 */
import type { FastifyReply } from "fastify";
import type { ParseableSchema } from "./query-coercion.ts";
import { ResponseValidationError } from "./errors.ts";

export function sendValidatedResponse<Body>(
  reply: FastifyReply,
  schema: ParseableSchema<Body>,
  body: unknown,
  routeDescription: string,
): void {
  const validation = schema.safeParse(body);
  if (!validation.success) {
    throw new ResponseValidationError(routeDescription);
  }
  reply.code(200).send(validation.data);
}
