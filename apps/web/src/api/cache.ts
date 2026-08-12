/**
 * Bounded in-memory request cache (ADR-0026 § 7 / docs/m2-plan.md § 6).
 * No caching library and no persistent browser storage — a plain, capped
 * `Map` whose lifetime ends on page reload, exactly as the ADR requires. A
 * page reload always constructs a fresh cache; nothing here ever reaches for
 * `localStorage`/`indexedDB`/`sessionStorage`.
 */

export interface RequestCache<Value> {
  get(key: string): Value | undefined;
  has(key: string): boolean;
  set(key: string, value: Value): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
}

/**
 * `maxEntries` bounds the cache so an unbounded exploration session cannot
 * grow memory without limit; eviction is least-recently-*set* (a `set` on an
 * existing key or a fresh key both move it to the most-recent position,
 * since `Map` iterates in insertion order and a `delete`-then-`set` re-adds
 * the key at the end).
 */
export function createRequestCache<Value>(
  maxEntries: number,
): RequestCache<Value> {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError(
      `createRequestCache requires a positive integer maxEntries, got ${String(maxEntries)}.`,
    );
  }

  const store = new Map<string, Value>();

  return {
    get(key: string): Value | undefined {
      return store.get(key);
    },
    has(key: string): boolean {
      return store.has(key);
    },
    set(key: string, value: Value): void {
      store.delete(key);
      store.set(key, value);
      while (store.size > maxEntries) {
        const oldestKey: string | undefined = store.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        store.delete(oldestKey);
      }
    },
    delete(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    get size(): number {
      return store.size;
    },
  };
}

/**
 * Deterministic cache-key construction (ADR-0026 § 7: "Keys include
 * operation, complete resolved identity, identifiers/filters/bounds, and
 * cursor where applicable"). Object keys are sorted before serialization so
 * equivalent parameters supplied in a different order produce the same key;
 * `undefined` values are omitted rather than serialized, so an absent
 * optional parameter never changes the key.
 */
export function buildRequestCacheKey(parts: {
  readonly operation: string;
  readonly identity?: Readonly<Record<string, string | number>>;
  readonly params?: Readonly<
    Record<string, string | number | boolean | undefined>
  >;
  readonly cursor?: string;
}): string {
  const canonicalize = (
    value: Readonly<Record<string, string | number | boolean | undefined>>,
  ): Record<string, string | number | boolean> => {
    const canonical: Record<string, string | number | boolean> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry !== undefined) {
        canonical[key] = entry;
      }
    }
    return canonical;
  };

  return JSON.stringify({
    operation: parts.operation,
    identity:
      parts.identity === undefined ? null : canonicalize(parts.identity),
    params: parts.params === undefined ? null : canonicalize(parts.params),
    cursor: parts.cursor ?? null,
  });
}
