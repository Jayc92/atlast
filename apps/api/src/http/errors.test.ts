/**
 * Integration tests for the closed S7 error-response contract (ADR-0024
 * § 9) that the real, fully-wired application cannot provoke by itself:
 * `ROUTE_NOT_FOUND`, `MALFORMED_REQUEST` (Fastify's own routing-stage
 * rejections — bad URL component and over-length path parameter — wired
 * through `mapFrameworkError`), the same hook's `INTERNAL_ERROR` branch for
 * every *other* framework error (proven directly at the unit level for
 * `FST_ERR_ASYNC_CONSTRAINT`, which no real request through this
 * application's actual route/constraint configuration can trigger — Fastify
 * only invokes that code path when an async route constraint strategy is
 * registered, which this application never does), a generic unexpected
 * exception (`INTERNAL_ERROR`, with unconditional redaction), a
 * response-schema violation on the success path (also `INTERNAL_ERROR`,
 * never an invalid `200`), and `REFERENTIAL_INTEGRITY` (exposed, not
 * redacted). Each uses `buildApplication` directly with deterministic
 * stubs, exactly as ADR-0024 § 12 permits for error paths the real
 * in-memory stores cannot be coerced into producing.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { errorResponseSchema, type EntityPage } from "@atlast/shared";
import { ReferentialIntegrityError } from "@atlast/graph-model";
import { afterEach, describe, expect, it } from "vitest";
import { buildApplication } from "../app.ts";
import { mapFrameworkError } from "./errors.ts";
import {
  createStubEvidenceStore,
  createStubOperationalOverlayStore,
  createStubTopologyGraphStore,
} from "../test-support/stub-repositories.ts";
import { parseJsonBody } from "../test-support/parse-response.ts";

/**
 * A minimal capturing `FastifyReply` stand-in: `mapFrameworkError` (via
 * `sendValidatedError`) only ever calls `.code(status).send(body)` on it,
 * so this is the narrowest reliable mechanism to unit-test the mapping
 * directly for a framework-error code (`FST_ERR_ASYNC_CONSTRAINT`) that no
 * real request can provoke through this application's own configuration —
 * no dependency added, no real HTTP round trip needed.
 */
function createCapturingReply(): {
  readonly reply: FastifyReply;
  readonly sent: () => { statusCode: number; body: unknown };
} {
  let capturedStatusCode: number | undefined;
  let capturedBody: unknown;
  const reply = {
    code(statusCode: number) {
      capturedStatusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      capturedBody = body;
      return this;
    },
  } as unknown as FastifyReply;
  return {
    reply,
    sent: () => {
      if (capturedStatusCode === undefined) {
        throw new Error("reply.send was never called");
      }
      return { statusCode: capturedStatusCode, body: capturedBody };
    },
  };
}

/** A `FastifyError`-shaped value, built the same way `@fastify/error`'s `createError` instances present themselves (`.code`, `.statusCode`, `.message`) — never importing that package directly (it is not a direct `apps/api` dependency). */
function createFrameworkErrorLike(
  code: string,
  statusCode: number,
  message: string,
): Parameters<typeof mapFrameworkError>[0] {
  const error = new Error(message) as Error & {
    code: string;
    statusCode: number;
  };
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

describe("the closed S7 error-response contract", () => {
  let application: FastifyInstance | undefined;

  afterEach(async () => {
    if (application !== undefined) {
      await application.close();
      application = undefined;
    }
  });

  it("ROUTE_NOT_FOUND: no route matches the requested method and path", async () => {
    application = buildApplication({
      evidenceStore: createStubEvidenceStore(),
      operationalOverlayStore: createStubOperationalOverlayStore(),
      topologyGraphStore: createStubTopologyGraphStore(),
    });
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/does-not-exist",
    });
    expect(response.statusCode).toBe(404);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("ROUTE_NOT_FOUND");
    if (body.code === "ROUTE_NOT_FOUND") {
      expect(body.details).toStrictEqual({
        method: "GET",
        path: "/api/v1/does-not-exist",
      });
    }
  });

  it("MALFORMED_REQUEST: a Fastify routing-stage rejection (bad URL component) never reaches setErrorHandler, only mapFrameworkError", async () => {
    application = buildApplication({
      evidenceStore: createStubEvidenceStore(),
      operationalOverlayStore: createStubOperationalOverlayStore(),
      topologyGraphStore: createStubTopologyGraphStore(),
    });
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/%",
    });
    expect(response.statusCode).toBe(400);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("MALFORMED_REQUEST");
    if (body.code === "MALFORMED_REQUEST") {
      expect(body.details).toStrictEqual({});
    }
  });

  it("MALFORMED_REQUEST: an over-length path parameter (FST_ERR_MAX_PARAM_LENGTH) also maps through mapFrameworkError, never a 500", async () => {
    application = buildApplication({
      evidenceStore: createStubEvidenceStore(),
      operationalOverlayStore: createStubOperationalOverlayStore(),
      topologyGraphStore: createStubTopologyGraphStore(),
    });
    const response = await application.inject({
      method: "GET",
      url: `/api/v1/entities/${"a".repeat(200)}`,
    });
    expect(response.statusCode).toBe(400);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("MALFORMED_REQUEST");
    if (body.code === "MALFORMED_REQUEST") {
      expect(body.details).toStrictEqual({});
    }
  });

  it("INTERNAL_ERROR: mapFrameworkError redacts every framework-error code other than the two malformed-request cases (FST_ERR_ASYNC_CONSTRAINT), never leaking its message", () => {
    const { reply, sent } = createCapturingReply();
    const frameworkError = createFrameworkErrorLike(
      "FST_ERR_ASYNC_CONSTRAINT",
      500,
      "Unexpected error from async constraint",
    );

    mapFrameworkError(frameworkError, {} as unknown as FastifyRequest, reply);

    const { statusCode, body } = sent();
    expect(statusCode).toBe(500);
    const parsedBody = errorResponseSchema.parse(body);
    expect(parsedBody.code).toBe("INTERNAL_ERROR");
    if (parsedBody.code === "INTERNAL_ERROR") {
      expect(parsedBody.details).toStrictEqual({});
    }
    expect(JSON.stringify(parsedBody)).not.toContain("async constraint");
    expect(JSON.stringify(parsedBody)).not.toContain(
      "FST_ERR_ASYNC_CONSTRAINT",
    );
  });

  it("INTERNAL_ERROR: an unexpected exception is caught, redacted, and never leaks its own message", async () => {
    application = buildApplication({
      evidenceStore: createStubEvidenceStore(),
      operationalOverlayStore: createStubOperationalOverlayStore(),
      topologyGraphStore: createStubTopologyGraphStore({
        getSubject: () => {
          throw new Error("a secret internal detail that must never leak");
        },
      }),
    });
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout",
    });
    expect(response.statusCode).toBe(500);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INTERNAL_ERROR");
    if (body.code === "INTERNAL_ERROR") {
      expect(body.details).toStrictEqual({});
    }
    expect(body.message).not.toContain("secret internal detail");
    expect(response.body).not.toContain("secret internal detail");
  });

  it("INTERNAL_ERROR: a repository result that violates its own exact response schema is never sent as a 200", async () => {
    application = buildApplication({
      evidenceStore: createStubEvidenceStore(),
      operationalOverlayStore: createStubOperationalOverlayStore(),
      topologyGraphStore: createStubTopologyGraphStore({
        // Deliberately violates entityPageSchema: `items` must be an array.
        // This is the point (ADR-0024 § 12's stub-response-violation
        // proof) — the explicit unknown-to-`EntityPage` cast is how a test
        // constructs a value the real store could never produce.
        listEntities: () =>
          Promise.resolve({
            items: "not-an-array",
            page: { hasMore: false },
            meta: {
              resolvedIdentity: {
                asOf: "2026-08-11T00:00:00.000Z",
                horizon: 1,
                derivationVersion: "m1-v1",
              },
              schemaVersion: "atlast-domain-v1",
            },
          } as unknown as EntityPage),
      }),
    });
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities",
    });
    expect(response.statusCode).toBe(500);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("INTERNAL_ERROR");
    if (body.code === "INTERNAL_ERROR") {
      expect(body.details).toStrictEqual({});
    }
  });

  it("REFERENTIAL_INTEGRITY: exposed with its full typed details, never redacted", async () => {
    const resolvedIdentity = {
      asOf: "2026-08-11T00:00:00.000Z",
      horizon: 1,
      derivationVersion: "m1-v1",
    } as const;

    application = buildApplication({
      evidenceStore: createStubEvidenceStore(),
      operationalOverlayStore: createStubOperationalOverlayStore(),
      topologyGraphStore: createStubTopologyGraphStore({
        traverse: () => {
          throw new ReferentialIntegrityError({
            assertionIdentifier: `atlast:assertion:${"a".repeat(64)}`,
            endpointRole: "target",
            endpointIdentifier: "atlast:entity:missing-endpoint",
            resolvedIdentity,
          });
        },
      }),
    });
    const response = await application.inject({
      method: "GET",
      url: "/api/v1/entities/atlast:entity:checkout/traversal?direction=downstream&depth=1",
    });
    expect(response.statusCode).toBe(500);
    const body = parseJsonBody(response, errorResponseSchema);
    expect(body.code).toBe("REFERENTIAL_INTEGRITY");
    if (body.code === "REFERENTIAL_INTEGRITY") {
      expect(body.details).toStrictEqual({
        assertionIdentifier: `atlast:assertion:${"a".repeat(64)}`,
        endpointRole: "target",
        endpointIdentifier: "atlast:entity:missing-endpoint",
        resolvedIdentity,
      });
    }
  });
});
