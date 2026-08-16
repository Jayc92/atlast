/**
 * Tests for the shared M2-B query hook: canonical loading/loaded/api-error/
 * internal-error states, retry, request-level caching, and stale-response
 * suppression when a query key changes before an earlier request resolves
 * (docs/m2-plan.md Journey F: a superseded request must never overwrite the
 * current view).
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorResponse } from "@atlast/shared";
import type { ClientQueryResult } from "../api/errors.ts";
import { topologyRequestCache } from "./session.ts";
import { useAsyncQuery } from "./use-async-query.ts";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  topologyRequestCache.clear();
});

describe("useAsyncQuery", () => {
  it("starts loading, then reports a successful result", async () => {
    const { result } = renderHook(() =>
      useAsyncQuery<{ readonly value: string }>({
        queryKey: "case-1",
        cache: false,
        run: () => Promise.resolve({ ok: true, data: { value: "a" } }),
      }),
    );
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: "loaded",
        data: { value: "a" },
      });
    });
  });

  it("reports a validated API error distinctly from an internal failure", async () => {
    const apiError: ErrorResponse = {
      code: "UNKNOWN_IDENTIFIER",
      message: "No such entity.",
      details: { identifierKind: "subject", identifier: "atlast:entity:x" },
    };
    const { result } = renderHook(() =>
      useAsyncQuery<string>({
        queryKey: "case-2",
        cache: false,
        run: () =>
          Promise.resolve({
            ok: false,
            error: { kind: "api-error", error: apiError },
          }),
      }),
    );
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: "api-error",
        error: apiError,
      });
    });
  });

  it("collapses a client-internal failure into the redacted internal-error state", async () => {
    const { result } = renderHook(() =>
      useAsyncQuery<string>({
        queryKey: "case-3",
        cache: false,
        run: () =>
          Promise.resolve({
            ok: false,
            error: { kind: "client-internal-failure" },
          }),
      }),
    );
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "internal-error" });
    });
  });

  it("re-issues the exact same request on retry", async () => {
    let attempt = 0;
    const run = vi.fn((): Promise<ClientQueryResult<number>> => {
      attempt += 1;
      return attempt === 1
        ? Promise.resolve({
            ok: false,
            error: { kind: "client-internal-failure" },
          })
        : Promise.resolve({ ok: true, data: 42 });
    });
    const { result } = renderHook(() =>
      useAsyncQuery<number>({ queryKey: "case-4", cache: false, run }),
    );
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "internal-error" });
    });
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "loaded", data: 42 });
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("serves a cached value under the same query key without a new request", async () => {
    const run = vi.fn((): Promise<ClientQueryResult<string>> =>
      Promise.resolve({ ok: true, data: "cached-value" }),
    );
    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: string }) =>
        useAsyncQuery<string>({ queryKey, cache: true, run }),
      { initialProps: { queryKey: "case-5" } },
    );
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: "loaded",
        data: "cached-value",
      });
    });
    expect(run).toHaveBeenCalledTimes(1);

    rerender({ queryKey: "case-5-other" });
    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(2);
    });

    rerender({ queryKey: "case-5" });
    // The first key's value is still cached — no third request.
    expect(result.current.state).toEqual({
      status: "loaded",
      data: "cached-value",
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale response that resolves after a newer query key superseded it", async () => {
    const firstDeferred = createDeferred<ClientQueryResult<string>>();
    const secondDeferred = createDeferred<ClientQueryResult<string>>();
    const run = vi.fn((): Promise<ClientQueryResult<string>> => {
      return run.mock.calls.length === 1
        ? firstDeferred.promise
        : secondDeferred.promise;
    });

    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: string }) =>
        useAsyncQuery<string>({ queryKey, cache: false, run }),
      { initialProps: { queryKey: "stale-1" } },
    );

    rerender({ queryKey: "stale-2" });

    secondDeferred.resolve({ ok: true, data: "second" });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: "loaded",
        data: "second",
      });
    });

    // The first (now-superseded) request resolves late; it must not
    // overwrite the already-current second result.
    firstDeferred.resolve({ ok: true, data: "first" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.state).toEqual({
      status: "loaded",
      data: "second",
    });
  });

  it("hides loaded data synchronously when the query coordinate changes", async () => {
    const secondDeferred = createDeferred<ClientQueryResult<string>>();
    const run = vi.fn((): Promise<ClientQueryResult<string>> =>
      run.mock.calls.length === 1
        ? Promise.resolve({ ok: true, data: "old coordinate" })
        : secondDeferred.promise,
    );
    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: string }) =>
        useAsyncQuery<string>({ queryKey, cache: false, run }),
      { initialProps: { queryKey: "coordinate-old" } },
    );
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: "loaded",
        data: "old coordinate",
      });
    });

    rerender({ queryKey: "coordinate-new" });
    expect(result.current.state).toEqual({ status: "loading" });

    secondDeferred.resolve({ ok: true, data: "new coordinate" });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: "loaded",
        data: "new coordinate",
      });
    });
  });
});
