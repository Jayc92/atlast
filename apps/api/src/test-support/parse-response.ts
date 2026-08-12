/**
 * A typed alternative to `fastify.inject()`'s own `response.json()`, which
 * returns `any` and would otherwise force every integration-test assertion
 * through unsafe `any` member access. Every test parses a response body
 * through the exact Zod schema the route promises (imported from
 * `@atlast/shared`), so an assertion is checked against real, validated
 * types — and, as a side effect, every test doubles as a response-schema
 * proof, not merely a status-code check.
 */
export function parseJsonBody<Output>(
  response: { readonly body: string },
  schema: { parse(value: unknown): Output },
): Output {
  return schema.parse(JSON.parse(response.body));
}
