/**
 * Application construction for the Atlast backend API (M0 shell per ADR-0004).
 *
 * Construction is deliberately separated from network startup (`server.ts`)
 * so tests drive the fully assembled application through `fastify.inject()`
 * without ever opening a socket (ADR-0009).
 *
 * This shell exposes operational metadata only. The query API — and any
 * graph, topology, or evidence behavior — is M1 scope and must not appear
 * here before M1 is explicitly authorized (CLAUDE.md, docs/milestones.md).
 */
import {
  fastify,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

/**
 * Response contract for `GET /health`. Declared as a Fastify JSON schema so
 * the contract is machine-readable and enforced at the boundary (ADR-0004:
 * every route declares its input/output schema). Single-value enums pin the
 * payload to exactly the deterministic response the shell promises.
 */
const healthResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service"],
  properties: {
    status: { type: "string", enum: ["ok"] },
    service: { type: "string", enum: ["atlast-api"] },
  },
} as const;

export function buildApplication(
  serverOptions: FastifyServerOptions = {},
): FastifyInstance {
  const application = fastify(serverOptions);

  application.get(
    "/health",
    {
      schema: {
        response: {
          200: healthResponseJsonSchema,
        },
      },
    },
    () => ({ status: "ok", service: "atlast-api" }),
  );

  return application;
}
