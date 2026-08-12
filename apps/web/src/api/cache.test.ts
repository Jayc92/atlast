import { describe, expect, it } from "vitest";
import { buildRequestCacheKey, createRequestCache } from "./cache.ts";

describe("createRequestCache", () => {
  it("stores and retrieves a value by key", () => {
    const cache = createRequestCache<string>(2);
    cache.set("a", "value-a");
    expect(cache.get("a")).toBe("value-a");
    expect(cache.has("a")).toBe(true);
    expect(cache.has("missing")).toBe(false);
  });

  it("evicts the least-recently-set entry once maxEntries is exceeded", () => {
    const cache = createRequestCache<string>(2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");

    expect(cache.size).toBe(2);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("re-setting an existing key refreshes its recency instead of duplicating it", () => {
    const cache = createRequestCache<string>(2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("a", "1-updated");
    cache.set("c", "3");

    // "a" was refreshed most recently among {a, b}, so "b" — not "a" — is
    // the true least-recently-set entry evicted when "c" arrives.
    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBe("1-updated");
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("clear() empties the cache and delete() removes one entry", () => {
    const cache = createRequestCache<string>(3);
    cache.set("a", "1");
    cache.set("b", "2");

    cache.delete("a");
    expect(cache.has("a")).toBe(false);
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects a non-positive-integer maxEntries (%s)",
    (invalidMax) => {
      expect(() => createRequestCache<string>(invalidMax)).toThrow(RangeError);
    },
  );
});

describe("buildRequestCacheKey", () => {
  it("produces the same key regardless of param/identity insertion order", () => {
    const keyA = buildRequestCacheKey({
      operation: "entityInventory",
      identity: { asOf: "2026-01-01T00:00:00.000Z", horizon: 5 },
      params: { limit: 25, entityType: "service" },
    });
    const keyB = buildRequestCacheKey({
      operation: "entityInventory",
      params: { entityType: "service", limit: 25 },
      identity: { horizon: 5, asOf: "2026-01-01T00:00:00.000Z" },
    });
    expect(keyA).toBe(keyB);
  });

  it("omits undefined optional params from the key", () => {
    const keyWithUndefined = buildRequestCacheKey({
      operation: "search",
      params: { q: "checkout", cursor: undefined },
    });
    const keyWithoutField = buildRequestCacheKey({
      operation: "search",
      params: { q: "checkout" },
    });
    expect(keyWithUndefined).toBe(keyWithoutField);
  });

  it("distinguishes different operations, identities, params, and cursors", () => {
    const base = buildRequestCacheKey({ operation: "entityDetail" });
    expect(buildRequestCacheKey({ operation: "search" })).not.toBe(base);
    expect(
      buildRequestCacheKey({
        operation: "entityDetail",
        identity: { asOf: "2026-01-01T00:00:00.000Z", horizon: 1 },
      }),
    ).not.toBe(base);
    expect(
      buildRequestCacheKey({ operation: "entityDetail", cursor: "abc" }),
    ).not.toBe(base);
  });
});
