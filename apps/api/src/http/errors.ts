/**
 * The closed S7 error-response contract (ADR-0024 § 9): every application
 * failure — our own request-validation rejections, the S6 repository error
 * taxonomy, and a response-schema violation on our own success path — maps
 * to exactly one `errorResponseSchema`-validated body and HTTP status. Route
 * handlers never write an error response themselves; every thrown error
 * propagates to the single error handler {@link registerErrorHandling}
 * installs, so the mapping lives in one place.
 */
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import {
  errorResponseSchema,
  type ErrorResponse,
  type InvalidReadCoordinateDetails,
  type UnknownIdentifierDetails,
} from "@atlast/shared";
import {
  InvalidReadCoordinateError,
  ReferentialIntegrityError,
  UnknownIdentifierError,
} from "@atlast/graph-model";

export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** Thrown by the request-side coercion helpers in `query-coercion.ts` (ADR-0024 §§ 2-5). */
export class RequestValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super("Request validation failed.");
    this.name = "RequestValidationError";
    this.issues = issues;
  }
}

/**
 * Thrown when a repository result fails its own exact response schema
 * (ADR-0024 § 11) before `reply.send` — never exposed to the client; always
 * maps to `INTERNAL_ERROR`, since a schema-violating repository result is a
 * defect, not a client-facing condition.
 */
export class ResponseValidationError extends Error {
  constructor(routeDescription: string) {
    super(
      `Repository response for ${routeDescription} failed its exact response schema.`,
    );
    this.name = "ResponseValidationError";
  }
}

const INTERNAL_ERROR_BODY: ErrorResponse = {
  code: "INTERNAL_ERROR",
  message: "An unexpected internal error occurred.",
  details: {},
};

/** Every listed field is set only when its guarding reason branch applies (ADR-0023 § 9) — never assumed for a different reason. */
function definedOrInternalError<Value>(
  value: Value | undefined,
  propertyName: string,
): Value {
  if (value === undefined) {
    throw new TypeError(
      `Expected InvalidReadCoordinateError.${propertyName} to be populated for this reason`,
    );
  }
  return value;
}

function buildUnknownIdentifierDetails(
  error: UnknownIdentifierError,
): UnknownIdentifierDetails {
  if (error.identifierKind === "evidence") {
    return { identifierKind: "evidence", identifier: error.identifier };
  }
  return {
    identifierKind: error.identifierKind,
    identifier: error.identifier,
    ...(error.resolvedIdentity !== undefined
      ? { resolvedIdentity: error.resolvedIdentity }
      : {}),
  };
}

function buildInvalidReadCoordinateDetails(
  error: InvalidReadCoordinateError,
): InvalidReadCoordinateDetails {
  switch (error.reason) {
    case "EMPTY_EVIDENCE_STORE":
      return { reason: "EMPTY_EVIDENCE_STORE" };
    case "HORIZON_BEFORE_FIRST_EVIDENCE":
    case "HORIZON_AFTER_CURRENT_WATERMARK":
      return {
        reason: error.reason,
        firstRecordedSequence: definedOrInternalError(
          error.firstRecordedSequence,
          "firstRecordedSequence",
        ),
        currentWatermark: definedOrInternalError(
          error.currentWatermark,
          "currentWatermark",
        ),
      };
    case "UNSUPPORTED_DERIVATION_VERSION":
      return {
        reason: "UNSUPPORTED_DERIVATION_VERSION",
        unsupportedDerivationVersion: definedOrInternalError(
          error.unsupportedDerivationVersion,
          "unsupportedDerivationVersion",
        ),
      };
    case "INVALID_CURSOR":
      return error.cursorKind !== undefined
        ? { reason: "INVALID_CURSOR", cursorKind: error.cursorKind }
        : { reason: "INVALID_CURSOR" };
    case "CURSOR_BINDING_MISMATCH": {
      const mismatchFields = [
        ...definedOrInternalError(error.mismatchFields, "mismatchFields"),
      ];
      if (error.cursorKind === "graph") {
        return {
          reason: "CURSOR_BINDING_MISMATCH",
          cursorKind: "graph",
          cursorBoundIdentity: definedOrInternalError(
            error.cursorBoundIdentity,
            "cursorBoundIdentity",
          ),
          ...(error.requestedIdentity !== undefined
            ? { requestedIdentity: error.requestedIdentity }
            : {}),
          mismatchFields,
        };
      }
      return {
        reason: "CURSOR_BINDING_MISMATCH",
        cursorKind: "evidence",
        requestedHorizon: definedOrInternalError(
          error.requestedHorizon,
          "requestedHorizon",
        ),
        cursorBoundHorizon: definedOrInternalError(
          error.cursorBoundHorizon,
          "cursorBoundHorizon",
        ),
        mismatchFields,
      };
    }
  }
}

/** The known application error types this route surface can throw, each with its exact ADR-0024 § 9 status and body. */
function mapKnownError(
  error: unknown,
): { statusCode: number; body: ErrorResponse } | undefined {
  if (error instanceof RequestValidationError) {
    return {
      statusCode: 400,
      body: {
        code: "VALIDATION_ERROR",
        message: "The request failed validation.",
        details: {
          issues: error.issues.map((issue) => ({
            path: [...issue.path],
            message: issue.message,
          })),
        },
      },
    };
  }
  if (error instanceof UnknownIdentifierError) {
    return {
      statusCode: 404,
      body: {
        code: "UNKNOWN_IDENTIFIER",
        message: `Unknown ${error.identifierKind} identifier.`,
        details: buildUnknownIdentifierDetails(error),
      },
    };
  }
  if (error instanceof InvalidReadCoordinateError) {
    return {
      statusCode: 422,
      body: {
        code: "INVALID_READ_COORDINATE",
        message: `The requested read coordinate is invalid (${error.reason}).`,
        details: buildInvalidReadCoordinateDetails(error),
      },
    };
  }
  if (error instanceof ReferentialIntegrityError) {
    return {
      statusCode: 500,
      body: {
        code: "REFERENTIAL_INTEGRITY",
        message:
          "A relationship assertion has an endpoint that does not resolve to an existing entity at the resolved snapshot identity.",
        details: {
          assertionIdentifier: error.assertionIdentifier,
          endpointRole: error.endpointRole,
          endpointIdentifier: error.endpointIdentifier,
          resolvedIdentity: error.resolvedIdentity,
        },
      },
    };
  }
  return undefined;
}

/**
 * A generic error Fastify's own request pipeline surfaced to this handler
 * before any route handler ran — recognized only by the `statusCode`/`code`
 * shape every `FastifyError` carries (ADR-0024 § 9's narrowed
 * `MALFORMED_REQUEST` claim). Never matches one of our own recognized
 * classes above, which are checked first.
 */
function isFastifyPipelineClientError(
  error: unknown,
): error is Error & { statusCode: number; code: string } {
  if (!(error instanceof Error)) {
    return false;
  }
  const candidate = error as Error & Record<string, unknown>;
  return (
    typeof candidate["code"] === "string" &&
    typeof candidate["statusCode"] === "number" &&
    candidate["statusCode"] >= 400 &&
    candidate["statusCode"] < 500
  );
}

/**
 * Every emitted error body is validated against `errorResponseSchema`
 * before it is sent — the same mandatory-validation discipline ADR-0024
 * § 11 requires for successful responses, applied here to error responses
 * too. A body that somehow fails that validation (a defect in this mapping
 * layer, never a client-triggerable condition) falls back to the
 * unconditionally valid `INTERNAL_ERROR` body rather than sending an
 * unvalidated shape.
 */
function sendValidatedError(
  reply: FastifyReply,
  statusCode: number,
  body: ErrorResponse,
): void {
  const validation = errorResponseSchema.safeParse(body);
  if (validation.success) {
    reply.code(statusCode).send(validation.data);
    return;
  }
  reply.code(500).send(INTERNAL_ERROR_BODY);
}

/**
 * The exact, closed set of `frameworkErrors` codes that are genuinely
 * malformed *client* input (ADR-0024 § 9's "invalid route-parameter
 * decoding"/"a request Fastify's own limits reject" language) — confirmed
 * by direct inspection of `fastify.js`'s `onBadUrl`/`onMaxParamLength`,
 * whose own non-`frameworkErrors` default responses are themselves `400`
 * and `414` client-error statuses, never `500`. Every other code this hook
 * receives — chiefly `FST_ERR_ASYNC_CONSTRAINT`, whose own default (absent
 * `frameworkErrors`) response is a bare `500` (`buildAsyncConstraintCallback`
 * in `fastify.js`) — is an internal Fastify failure, not something the
 * client's own request caused, and must never be reported as one.
 */
const MALFORMED_REQUEST_FRAMEWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  "FST_ERR_BAD_URL",
  "FST_ERR_MAX_PARAM_LENGTH",
]);

/**
 * Fastify's own bad-URL and max-param-length rejections occur during
 * routing, **before** a route matches and before `setErrorHandler` is ever
 * consulted — confirmed directly: an unencoded stray `%` in a path segment
 * reaches neither `setErrorHandler` nor `setNotFoundHandler` unless the
 * Fastify instance is constructed with the dedicated `frameworkErrors`
 * option (`fastify.js`'s `onBadUrl`/`onMaxParamLength`/
 * `buildAsyncConstraintCallback`) — this is the one Fastify hook that
 * receives all three. Only `FST_ERR_BAD_URL` and `FST_ERR_MAX_PARAM_LENGTH`
 * are genuinely malformed client input (`MALFORMED_REQUEST`, 400); every
 * other framework error — including `FST_ERR_ASYNC_CONSTRAINT`, an internal
 * Fastify failure with no client-request cause — maps to the fixed,
 * unconditionally redacted `INTERNAL_ERROR` body (500), never exposing the
 * framework error's own `message`, `code`, or stack.
 */
export function mapFrameworkError(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (MALFORMED_REQUEST_FRAMEWORK_ERROR_CODES.has(error.code)) {
    sendValidatedError(reply, 400, {
      code: "MALFORMED_REQUEST",
      message: "The request could not be parsed.",
      details: {},
    });
    return;
  }
  sendValidatedError(reply, 500, INTERNAL_ERROR_BODY);
}

/**
 * Installs the single closed error boundary (ADR-0024 § 9) on the fully
 * assembled application: a `setNotFoundHandler` for `ROUTE_NOT_FOUND`, and
 * a `setErrorHandler` mapping every other thrown error — our own
 * request/response-validation errors, the S6 repository error taxonomy, a
 * generic Fastify pipeline failure, or anything else — to its exact status
 * and body. {@link mapFrameworkError} covers the disjoint, earlier
 * routing-stage case neither hook below ever sees.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    sendValidatedError(reply, 404, {
      code: "ROUTE_NOT_FOUND",
      message: "No route matches the requested method and path.",
      details: {
        method: request.method,
        path: request.url.split("?")[0] ?? request.url,
      },
    });
  });

  app.setErrorHandler(
    (error: unknown, _request: FastifyRequest, reply: FastifyReply) => {
      const known = mapKnownError(error);
      if (known !== undefined) {
        sendValidatedError(reply, known.statusCode, known.body);
        return;
      }
      if (error instanceof ResponseValidationError) {
        sendValidatedError(reply, 500, INTERNAL_ERROR_BODY);
        return;
      }
      if (isFastifyPipelineClientError(error)) {
        sendValidatedError(reply, 400, {
          code: "MALFORMED_REQUEST",
          message: "The request could not be parsed.",
          details: {},
        });
        return;
      }
      sendValidatedError(reply, 500, INTERNAL_ERROR_BODY);
    },
  );
}
