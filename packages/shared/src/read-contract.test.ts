/**
 * Rejection-first tests for the S2 read-contract schemas: the exact
 * ADR-0017 bounds (page 25/100, depth 1–5, budget 500, search 2–256), the
 * complete-pinning rule (ADR-0016/0017 — no partial identity is
 * representable), opaque cursor form, the freshness classification, the
 * ADR-0020 entity-inventory filter, and the ADR-0020 locale-independent
 * search-query normalization.
 */
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./schema-version.ts";
import {
  DEFAULT_PAGE_LIMIT,
  MAXIMUM_PAGE_LIMIT,
  MAXIMUM_SEARCH_QUERY_LENGTH,
  MAXIMUM_TRAVERSAL_DEPTH,
  MAXIMUM_TRAVERSAL_RESULT_BUDGET,
  entityInventoryFilterSchema,
  freshnessSchema,
  normalizeSearchQuery,
  pageRequestSchema,
  pageResultMetadataSchema,
  paginationCursorSchema,
  readModeSchema,
  resolvedReadMetadataSchema,
  searchQuerySchema,
  snapshotIdentitySchema,
  traversalRequestBoundsSchema,
  traversalResultMetadataSchema,
} from "./read-contract.ts";

const completeIdentity = {
  asOf: "2026-07-23T00:00:00.000Z",
  horizon: 42,
  derivationVersion: "m1-v1",
} as const;

describe("snapshotIdentitySchema", () => {
  it("accepts a complete (asOf, horizon, derivationVersion) identity", () => {
    expect(snapshotIdentitySchema.safeParse(completeIdentity).success).toBe(
      true,
    );
  });

  it.each([["asOf"], ["horizon"], ["derivationVersion"]])(
    "rejects an identity missing %s (partial pinning)",
    (omittedComponent: string) => {
      const partialIdentity = Object.fromEntries(
        Object.entries(completeIdentity).filter(
          ([componentName]) => componentName !== omittedComponent,
        ),
      );
      expect(snapshotIdentitySchema.safeParse(partialIdentity).success).toBe(
        false,
      );
    },
  );

  it("rejects a non-sequence horizon", () => {
    expect(
      snapshotIdentitySchema.safeParse({ ...completeIdentity, horizon: 0 })
        .success,
    ).toBe(false);
    expect(
      snapshotIdentitySchema.safeParse({
        ...completeIdentity,
        horizon: 1.5,
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed asOf timestamp", () => {
    expect(
      snapshotIdentitySchema.safeParse({
        ...completeIdentity,
        asOf: "2026-07-23T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects extra identity components (strict object)", () => {
    expect(
      snapshotIdentitySchema.safeParse({
        ...completeIdentity,
        checksum: "abc",
      }).success,
    ).toBe(false);
  });
});

describe("resolvedReadMetadataSchema", () => {
  const completeMetadata = {
    resolvedIdentity: completeIdentity,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  } as const;

  it("accepts complete metadata (resolved identity + schemaVersion)", () => {
    expect(resolvedReadMetadataSchema.safeParse(completeMetadata).success).toBe(
      true,
    );
  });

  it("rejects metadata missing schemaVersion", () => {
    expect(
      resolvedReadMetadataSchema.safeParse({
        resolvedIdentity: completeIdentity,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown schemaVersion", () => {
    expect(
      resolvedReadMetadataSchema.safeParse({
        ...completeMetadata,
        schemaVersion: "atlast-domain-v99",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed schemaVersion value", () => {
    expect(
      resolvedReadMetadataSchema.safeParse({
        ...completeMetadata,
        schemaVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      resolvedReadMetadataSchema.safeParse({
        ...completeMetadata,
        schemaVersion: " atlast-domain-v1",
      }).success,
    ).toBe(false);
  });

  it("rejects metadata missing the resolved identity", () => {
    expect(
      resolvedReadMetadataSchema.safeParse({
        schemaVersion: CURRENT_SCHEMA_VERSION,
      }).success,
    ).toBe(false);
  });

  it("rejects metadata with a partial resolved identity", () => {
    expect(
      resolvedReadMetadataSchema.safeParse({
        ...completeMetadata,
        resolvedIdentity: { asOf: "2026-07-23T00:00:00.000Z" },
      }).success,
    ).toBe(false);
  });
});

describe("readModeSchema", () => {
  it("accepts a pinned read with a complete identity", () => {
    expect(
      readModeSchema.safeParse({ mode: "pinned", identity: completeIdentity })
        .success,
    ).toBe(true);
  });

  it("accepts a bare latest read", () => {
    expect(readModeSchema.safeParse({ mode: "latest" }).success).toBe(true);
  });

  it("rejects a pinned read with a partial identity", () => {
    expect(
      readModeSchema.safeParse({
        mode: "pinned",
        identity: { asOf: "2026-07-23T00:00:00.000Z" },
      }).success,
    ).toBe(false);
  });

  it("rejects a pinned read with no identity at all", () => {
    expect(readModeSchema.safeParse({ mode: "pinned" }).success).toBe(false);
  });

  it("rejects a latest read smuggling pin components (strict object)", () => {
    expect(
      readModeSchema.safeParse({
        mode: "latest",
        asOf: "2026-07-23T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      readModeSchema.safeParse({ mode: "latest", identity: completeIdentity })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown mode", () => {
    expect(readModeSchema.safeParse({ mode: "approximate" }).success).toBe(
      false,
    );
  });
});

describe("freshnessSchema", () => {
  it.each(["current", "stale", "historical"])(
    "accepts %s",
    (validFreshness: string) => {
      expect(freshnessSchema.safeParse(validFreshness).success).toBe(true);
    },
  );

  it("rejects the reserved superseded temporal state", () => {
    // ADR-0016: superseded is reserved for a post-M1 history route and
    // must never be expressible as a freshness value.
    expect(freshnessSchema.safeParse("superseded").success).toBe(false);
  });

  it("rejects arbitrary strings", () => {
    expect(freshnessSchema.safeParse("fresh").success).toBe(false);
  });
});

describe("pageRequestSchema", () => {
  it("applies the default limit of 25 when omitted", () => {
    const parsed = pageRequestSchema.parse({});
    expect(parsed.limit).toBe(DEFAULT_PAGE_LIMIT);
  });

  it("accepts the maximum limit of 100", () => {
    expect(
      pageRequestSchema.safeParse({ limit: MAXIMUM_PAGE_LIMIT }).success,
    ).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["a negative limit", -1],
    ["a fractional limit", 10.5],
    ["a limit above the maximum", MAXIMUM_PAGE_LIMIT + 1],
  ])("rejects %s", (_description: string, invalidLimit: number) => {
    expect(pageRequestSchema.safeParse({ limit: invalidLimit }).success).toBe(
      false,
    );
  });

  it("accepts a well-formed continuation cursor", () => {
    expect(
      pageRequestSchema.safeParse({ limit: 25, cursor: "b3BhcXVlLXRva2Vu" })
        .success,
    ).toBe(true);
  });
});

describe("paginationCursorSchema", () => {
  it.each([
    ["an empty string", ""],
    ["whitespace", "cursor with spaces"],
    ["non-URL-safe characters", "cursor/with+slash="],
    ["an oversized token", "a".repeat(4097)],
  ])("rejects %s", (_description: string, malformedCursor: string) => {
    expect(paginationCursorSchema.safeParse(malformedCursor).success).toBe(
      false,
    );
  });
});

describe("pageResultMetadataSchema", () => {
  it("accepts hasMore=true with a cursor and hasMore=false without", () => {
    expect(
      pageResultMetadataSchema.safeParse({ hasMore: true, nextCursor: "abc" })
        .success,
    ).toBe(true);
    expect(pageResultMetadataSchema.safeParse({ hasMore: false }).success).toBe(
      true,
    );
  });

  it("rejects hasMore=true without a cursor (invisible truncation)", () => {
    expect(pageResultMetadataSchema.safeParse({ hasMore: true }).success).toBe(
      false,
    );
  });

  it("rejects hasMore=false with a dangling cursor", () => {
    expect(
      pageResultMetadataSchema.safeParse({
        hasMore: false,
        nextCursor: "abc",
      }).success,
    ).toBe(false);
  });
});

describe("entityInventoryFilterSchema", () => {
  it("accepts an empty object as the unfiltered inventory", () => {
    expect(entityInventoryFilterSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a well-formed classification token as entityType", () => {
    expect(
      entityInventoryFilterSchema.safeParse({ entityType: "service" }).success,
    ).toBe(true);
    expect(
      entityInventoryFilterSchema.safeParse({ entityType: "scheduled-job" })
        .success,
    ).toBe(true);
  });

  it.each([
    ["an uppercase token", "Service"],
    ["an empty token", ""],
    ["interior whitespace", "message queue"],
    ["a leading hyphen", "-service"],
    ["a non-ASCII token", "sérvice"],
  ])(
    "rejects %s as entityType (malformed, never a silent empty result)",
    (_description: string, malformedToken: string) => {
      expect(
        entityInventoryFilterSchema.safeParse({ entityType: malformedToken })
          .success,
      ).toBe(false);
    },
  );

  it('rejects a "status" field — no such concept exists in M1 (ADR-0020 § 2)', () => {
    expect(
      entityInventoryFilterSchema.safeParse({ status: "healthy" }).success,
    ).toBe(false);
  });

  it.each([["freshness"], ["conflictState"], ["ambiguityState"], ["validity"]])(
    "rejects %s as a filter field — distinct concepts are never aliased into a filter",
    (distinctConceptField: string) => {
      expect(
        entityInventoryFilterSchema.safeParse({
          entityType: "service",
          [distinctConceptField]: "anything",
        }).success,
      ).toBe(false);
    },
  );

  it("rejects any other unknown field (strict object)", () => {
    expect(
      entityInventoryFilterSchema.safeParse({ relationshipType: "calls" })
        .success,
    ).toBe(false);
  });
});

describe("searchQuerySchema", () => {
  it("accepts queries at both length bounds", () => {
    expect(searchQuerySchema.safeParse("ab").success).toBe(true);
    expect(
      searchQuerySchema.safeParse("a".repeat(MAXIMUM_SEARCH_QUERY_LENGTH))
        .success,
    ).toBe(true);
  });

  it("rejects a one-character query", () => {
    expect(searchQuerySchema.safeParse("a").success).toBe(false);
  });

  it("rejects an oversized query", () => {
    expect(
      searchQuerySchema.safeParse("a".repeat(MAXIMUM_SEARCH_QUERY_LENGTH + 1))
        .success,
    ).toBe(false);
  });

  it("normalizes CHECKOUT to checkout at the schema boundary", () => {
    expect(searchQuerySchema.parse("CHECKOUT")).toBe("checkout");
  });

  it("normalizes ASCII I to i regardless of runtime locale", () => {
    // The ASCII map is locale-blind by construction: "I" (U+0049) maps to
    // "i" (U+0069) even under a Turkish locale, where toLowerCase() would
    // produce dotless "ı" (U+0131).
    expect(searchQuerySchema.parse("ID")).toBe("id");
    expect(normalizeSearchQuery("I")).toBe("i");
    expect(normalizeSearchQuery("I")).not.toBe("ı");
  });

  it("leaves U+0130 (İ) unchanged — no Unicode case folding", () => {
    expect(searchQuerySchema.parse("İİ")).toBe("İİ");
    expect(normalizeSearchQuery("İ")).toBe("İ");
  });

  it("preserves non-ASCII characters rather than silently removing them", () => {
    expect(searchQuerySchema.parse("café")).toBe("café");
    expect(searchQuerySchema.parse("Ürün-Sepeti")).toBe("Ürün-sepeti");
    expect(normalizeSearchQuery("naïve").length).toBe("naïve".length);
  });

  it("performs no diacritic stripping and no trimming", () => {
    expect(searchQuerySchema.parse("é-service")).toBe("é-service");
    expect(searchQuerySchema.parse("  ab")).toBe("  ab");
  });
});

describe("normalizeSearchQuery", () => {
  it("maps exactly ASCII A–Z to a–z and nothing else", () => {
    expect(normalizeSearchQuery("ABCXYZ")).toBe("abcxyz");
    expect(normalizeSearchQuery("already-lower-42")).toBe("already-lower-42");
    // The code points adjacent to the A–Z range must pass through: "@"
    // (U+0040) and "[" (U+005B) bracket the range.
    expect(normalizeSearchQuery("@[")).toBe("@[");
  });

  it("is idempotent (normalizing twice equals normalizing once)", () => {
    const onceNormalized = normalizeSearchQuery("Checkout-Service-İ");
    expect(normalizeSearchQuery(onceNormalized)).toBe(onceNormalized);
  });
});

describe("traversalRequestBoundsSchema", () => {
  const validBounds = {
    direction: "downstream",
    depth: 3,
    minimumConfidence: 0.5,
  } as const;

  it("accepts bounds at both depth limits", () => {
    expect(
      traversalRequestBoundsSchema.safeParse({ ...validBounds, depth: 1 })
        .success,
    ).toBe(true);
    expect(
      traversalRequestBoundsSchema.safeParse({
        ...validBounds,
        depth: MAXIMUM_TRAVERSAL_DEPTH,
      }).success,
    ).toBe(true);
  });

  it("defaults the confidence floor to 0", () => {
    const parsed = traversalRequestBoundsSchema.parse({
      direction: "upstream",
      depth: 1,
    });
    expect(parsed.minimumConfidence).toBe(0);
  });

  it.each([
    ["zero depth", 0],
    ["negative depth", -1],
    ["fractional depth", 2.5],
    ["depth above the maximum", MAXIMUM_TRAVERSAL_DEPTH + 1],
  ])("rejects %s", (_description: string, invalidDepth: number) => {
    expect(
      traversalRequestBoundsSchema.safeParse({
        ...validBounds,
        depth: invalidDepth,
      }).success,
    ).toBe(false);
  });

  it("rejects a missing depth (no default — the caller must state it)", () => {
    expect(
      traversalRequestBoundsSchema.safeParse({ direction: "downstream" })
        .success,
    ).toBe(false);
  });

  it("rejects an out-of-range confidence floor", () => {
    expect(
      traversalRequestBoundsSchema.safeParse({
        ...validBounds,
        minimumConfidence: 1.01,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown direction", () => {
    expect(
      traversalRequestBoundsSchema.safeParse({
        ...validBounds,
        direction: "sideways",
      }).success,
    ).toBe(false);
  });
});

describe("traversalResultMetadataSchema", () => {
  it("accepts a count within the 500-subject budget", () => {
    expect(
      traversalResultMetadataSchema.safeParse({
        truncated: false,
        subjectCount: MAXIMUM_TRAVERSAL_RESULT_BUDGET,
      }).success,
    ).toBe(true);
  });

  it("rejects a count above the budget", () => {
    expect(
      traversalResultMetadataSchema.safeParse({
        truncated: true,
        subjectCount: MAXIMUM_TRAVERSAL_RESULT_BUDGET + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects a missing truncation flag (truncation must be visible)", () => {
    expect(
      traversalResultMetadataSchema.safeParse({ subjectCount: 10 }).success,
    ).toBe(false);
  });
});
