/**
 * Client-side query result and error taxonomy (ADR-0026 § 3). Every network
 * failure, JSON-parse failure, and response-schema-validation failure is
 * collapsed into one redacted `client-internal-failure` — "maps
 * malformed/unexpected responses to one redacted client-side internal
 * failure" — never a raw exception message a component might render
 * verbatim. A validated API error keeps its complete typed `ErrorResponse`
 * (already safe to show: `packages/shared/src/http-contract.ts`'s own
 * redaction policy already governs what it may contain).
 */
import type { ErrorResponse } from "@atlast/shared";

export type ClientQueryError =
  | { readonly kind: "aborted" }
  | { readonly kind: "api-error"; readonly error: ErrorResponse }
  | { readonly kind: "client-internal-failure" };

export type ClientQueryResult<Data> =
  | { readonly ok: true; readonly data: Data }
  | { readonly ok: false; readonly error: ClientQueryError };

/**
 * `fetch`'s abort behavior is a `DOMException`/`Error` named `AbortError` in
 * every environment this project targets (browser, jsdom, Node's `undici`);
 * checking `.name` rather than `instanceof DOMException` is portable across
 * all three without importing an environment-specific type.
 */
export function isAbortError(candidate: unknown): boolean {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "name" in candidate &&
    candidate.name === "AbortError"
  );
}
