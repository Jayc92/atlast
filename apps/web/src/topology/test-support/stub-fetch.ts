/**
 * A routable `fetch` stub for M2-B page tests, which — unlike the M2-A
 * client tests — must satisfy several distinct requests in one test (the
 * identity-resolution probe, then the real inventory/search/detail read).
 * Never contacts a real network endpoint (GUARDRAILS.md § 5).
 */
import { vi } from "vitest";

export interface StubbedFetchRoute {
  readonly test: (url: string) => boolean;
  readonly respond: (url: string) => {
    readonly ok: boolean;
    readonly jsonPayload: unknown;
  };
}

type FetchLikeFunction = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export function stubApiFetch(
  routes: readonly StubbedFetchRoute[],
): ReturnType<typeof vi.fn<FetchLikeFunction>> {
  const fetchStub = vi.fn<FetchLikeFunction>(
    (input: string): Promise<Response> => {
      const matchedRoute = routes.find((route) => route.test(input));
      if (matchedRoute === undefined) {
        throw new Error(`stubApiFetch: no route matched request URL: ${input}`);
      }
      const { ok, jsonPayload } = matchedRoute.respond(input);
      return Promise.resolve({
        ok,
        json: (): Promise<unknown> => Promise.resolve(jsonPayload),
      } as Response);
    },
  );
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

export function jsonRoute(
  test: (url: string) => boolean,
  jsonPayload: unknown,
  ok = true,
): StubbedFetchRoute {
  return { test, respond: () => ({ ok, jsonPayload }) };
}
