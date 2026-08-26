/**
 * Query client tests (ADR-0026 § 3 verification obligations): runtime
 * schema rejection for malformed success/error payloads, complete-pin
 * construction, opaque-cursor passthrough, and identifier percent-encoding.
 * `fetch` is stubbed in every test — no test contacts a real network
 * endpoint (GUARDRAILS.md § 5).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchEntityDetail,
  fetchEntityEvidenceChain,
  fetchEntityInventory,
  fetchEvidence,
  fetchHealth,
  fetchHealthContext,
  fetchImpact,
  fetchSearch,
  fetchSnapshotAnchors,
  fetchSnapshotSummary,
  fetchTraversal,
} from "./client.ts";

type FetchLikeFunction = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function stubFetch(outcome: {
  ok: boolean;
  jsonPayload?: unknown;
  rejectWith?: Error;
}): ReturnType<typeof vi.fn<FetchLikeFunction>> {
  const fetchStub = vi.fn<FetchLikeFunction>((): Promise<Response> => {
    if (outcome.rejectWith !== undefined) {
      return Promise.reject(outcome.rejectWith);
    }
    return Promise.resolve({
      ok: outcome.ok,
      json: (): Promise<unknown> => Promise.resolve(outcome.jsonPayload),
    } as Response);
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

const VALID_META = {
  resolvedIdentity: {
    asOf: "2026-08-12T00:00:00.000Z",
    horizon: 20,
    derivationVersion: "m1-v1",
  },
  schemaVersion: "atlast-domain-v1",
};

const VALID_ANCHORS = {
  items: [
    {
      identity: VALID_META.resolvedIdentity,
      checksum: "a".repeat(64),
      subjectCount: 12,
    },
  ],
  truncated: false,
  meta: {
    schemaVersion: VALID_META.schemaVersion,
    resolvedHorizon: 20,
    derivationVersion: "m1-v1",
  },
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchHealth", () => {
  it("validates and returns a correct payload", async () => {
    stubFetch({
      ok: true,
      jsonPayload: {
        status: "ok",
        service: "atlast-api",
        datasetMode: "fixture",
      },
    });
    const result = await fetchHealth(new AbortController().signal);
    expect(result).toEqual({
      ok: true,
      data: { status: "ok", service: "atlast-api", datasetMode: "fixture" },
    });
  });

  it("requests the exact relative path", async () => {
    const fetchStub = stubFetch({
      ok: true,
      jsonPayload: {
        status: "ok",
        service: "atlast-api",
        datasetMode: "fixture",
      },
    });
    await fetchHealth(new AbortController().signal);
    expect(fetchStub.mock.calls[0]?.[0]).toBe("/api/health");
  });

  it("collapses a malformed successful payload into a redacted internal failure", async () => {
    stubFetch({ ok: true, jsonPayload: { status: "ok", service: "wrong" } });
    const result = await fetchHealth(new AbortController().signal);
    expect(result).toEqual({
      ok: false,
      error: { kind: "client-internal-failure" },
    });
  });

  it("collapses a non-JSON body into a redacted internal failure", async () => {
    const fetchStub = vi.fn<FetchLikeFunction>(() =>
      Promise.resolve({
        ok: true,
        json: (): Promise<unknown> => Promise.reject(new Error("not json")),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchStub);
    const result = await fetchHealth(new AbortController().signal);
    expect(result).toEqual({
      ok: false,
      error: { kind: "client-internal-failure" },
    });
  });

  it("collapses a network failure into a redacted internal failure", async () => {
    stubFetch({ ok: false, rejectWith: new Error("connection refused") });
    const result = await fetchHealth(new AbortController().signal);
    expect(result).toEqual({
      ok: false,
      error: { kind: "client-internal-failure" },
    });
  });

  it("reports an aborted request distinctly from a network failure", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    stubFetch({ ok: false, rejectWith: abortError });
    const result = await fetchHealth(new AbortController().signal);
    expect(result).toEqual({ ok: false, error: { kind: "aborted" } });
  });

  it("maps a validated closed error response to an api-error", async () => {
    const errorPayload = {
      code: "ROUTE_NOT_FOUND",
      message: "No route matches the request.",
      details: { method: "GET", path: "/api/health" },
    };
    stubFetch({ ok: false, jsonPayload: errorPayload });
    const result = await fetchHealth(new AbortController().signal);
    expect(result).toEqual({
      ok: false,
      error: { kind: "api-error", error: errorPayload },
    });
  });

  it("collapses an unrecognized error body into a redacted internal failure", async () => {
    stubFetch({ ok: false, jsonPayload: { whoops: true } });
    const result = await fetchHealth(new AbortController().signal);
    expect(result).toEqual({
      ok: false,
      error: { kind: "client-internal-failure" },
    });
  });
});

describe("fetchEntityInventory", () => {
  it("builds the query string with entityType, page bounds, and the complete pin", async () => {
    const fetchStub = stubFetch({
      ok: true,
      jsonPayload: { items: [], page: { hasMore: false }, meta: VALID_META },
    });

    const result = await fetchEntityInventory(
      {
        entityType: "service",
        limit: 10,
        cursor: "opaque-cursor-token",
        identity: {
          asOf: "2026-08-12T00:00:00.000Z",
          horizon: 20,
          derivationVersion: "m1-v1",
        },
      },
      new AbortController().signal,
    );

    expect(result).toEqual({
      ok: true,
      data: { items: [], page: { hasMore: false }, meta: VALID_META },
    });
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.pathname).toBe("/api/v1/entities");
    expect(requestedUrl.searchParams.get("entityType")).toBe("service");
    expect(requestedUrl.searchParams.get("limit")).toBe("10");
    // The cursor is forwarded byte-for-byte, never decoded or reshaped.
    expect(requestedUrl.searchParams.get("cursor")).toBe("opaque-cursor-token");
    expect(requestedUrl.searchParams.get("asOf")).toBe(
      "2026-08-12T00:00:00.000Z",
    );
    expect(requestedUrl.searchParams.get("horizon")).toBe("20");
    expect(requestedUrl.searchParams.get("derivationVersion")).toBe("m1-v1");
  });

  it("omits every pin parameter for a latest (unpinned) request", async () => {
    const fetchStub = stubFetch({
      ok: true,
      jsonPayload: { items: [], page: { hasMore: false }, meta: VALID_META },
    });
    await fetchEntityInventory({}, new AbortController().signal);
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.searchParams.has("asOf")).toBe(false);
    expect(requestedUrl.searchParams.has("horizon")).toBe(false);
    expect(requestedUrl.searchParams.has("derivationVersion")).toBe(false);
  });
});

describe("fetchSearch", () => {
  it("sends q and validates an empty result page", async () => {
    const fetchStub = stubFetch({
      ok: true,
      jsonPayload: { items: [], page: { hasMore: false }, meta: VALID_META },
    });
    const result = await fetchSearch(
      { q: "checkout" },
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.searchParams.get("q")).toBe("checkout");
  });
});

describe("fetchTraversal", () => {
  it("sends direction, depth, and minConfidence, and validates an empty traversal", async () => {
    const fetchStub = stubFetch({
      ok: true,
      jsonPayload: {
        items: [],
        traversal: { truncated: false, subjectCount: 0 },
        meta: VALID_META,
      },
    });
    const result = await fetchTraversal(
      "atlast:entity:service/checkout",
      { direction: "downstream", depth: 3, minConfidence: 0.5 },
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.pathname).toBe(
      "/api/v1/entities/atlast%3Aentity%3Aservice%2Fcheckout/traversal",
    );
    expect(requestedUrl.searchParams.get("direction")).toBe("downstream");
    expect(requestedUrl.searchParams.get("depth")).toBe("3");
    expect(requestedUrl.searchParams.get("minConfidence")).toBe("0.5");
  });
});

describe("fetchImpact", () => {
  it("sends direction, depth, minConfidence, changeType, and the pin, and validates an empty result", async () => {
    const fetchStub = stubFetch({
      ok: true,
      jsonPayload: {
        data: {
          originEntityIdentifier: "atlast:entity:service/checkout",
          changeType: "removal",
          items: [],
          results: [],
        },
        traversal: { truncated: false, subjectCount: 0 },
        meta: VALID_META,
      },
    });
    const result = await fetchImpact(
      "atlast:entity:service/checkout",
      {
        direction: "downstream",
        depth: 3,
        minConfidence: 0.5,
        changeType: "removal",
        identity: VALID_META.resolvedIdentity,
      },
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.pathname).toBe(
      "/api/v1/entities/atlast%3Aentity%3Aservice%2Fcheckout/impact",
    );
    expect(requestedUrl.searchParams.get("direction")).toBe("downstream");
    expect(requestedUrl.searchParams.get("depth")).toBe("3");
    expect(requestedUrl.searchParams.get("minConfidence")).toBe("0.5");
    expect(requestedUrl.searchParams.get("changeType")).toBe("removal");
    expect(requestedUrl.searchParams.get("asOf")).toBe(
      VALID_META.resolvedIdentity.asOf,
    );
  });

  it("collapses a malformed response into a redacted internal failure", async () => {
    stubFetch({ ok: true, jsonPayload: { not: "a valid impact envelope" } });
    const result = await fetchImpact(
      "atlast:entity:service/checkout",
      { direction: "downstream", depth: 1, changeType: "removal" },
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("client-internal-failure");
    }
  });
});

describe("fetchHealthContext", () => {
  it("sends traversal bounds, the pin, and overlayFrame, and validates the response", async () => {
    const fetchStub = stubFetch({
      ok: true,
      jsonPayload: {
        data: {
          originEntityIdentifier: "atlast:entity:checkout",
          items: [],
          projections: [
            {
              reportStatus: "reported",
              entityIdentifier: "atlast:entity:checkout",
              directCondition: "healthy",
              effectiveState: "healthy",
              contextCompleteness: "complete-within-requested-bounds",
            },
          ],
          gaps: [],
        },
        traversal: { truncated: false, subjectCount: 0 },
        meta: {
          ...VALID_META,
          overlay: {
            schemaVersion: "atlast-overlay-v1",
            frameIdentifier:
              "atlast:overlay-frame:demo-company/active-conditions",
            effectiveAt: "2026-08-01T00:00:00.000Z",
          },
        },
      },
    });

    const result = await fetchHealthContext(
      "atlast:entity:checkout",
      {
        direction: "downstream",
        depth: 2,
        identity: VALID_META.resolvedIdentity,
        overlayFrame: "atlast:overlay-frame:demo-company/active-conditions",
      },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.pathname).toBe(
      "/api/v1/entities/atlast%3Aentity%3Acheckout/health-context",
    );
    expect(requestedUrl.searchParams.get("direction")).toBe("downstream");
    expect(requestedUrl.searchParams.get("depth")).toBe("2");
    expect(requestedUrl.searchParams.get("asOf")).toBe(
      VALID_META.resolvedIdentity.asOf,
    );
    expect(requestedUrl.searchParams.get("overlayFrame")).toBe(
      "atlast:overlay-frame:demo-company/active-conditions",
    );
  });

  it("collapses a malformed response into a redacted internal failure", async () => {
    stubFetch({ ok: true, jsonPayload: { not: "a valid health context" } });
    const result = await fetchHealthContext(
      "atlast:entity:checkout",
      { direction: "downstream", depth: 1 },
      new AbortController().signal,
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: "client-internal-failure" },
    });
  });
});

describe("percent-encoded identifier path segments", () => {
  it("encodes both / and : in an entity identifier for entity detail", async () => {
    const fetchStub = stubFetch({ ok: false, jsonPayload: { whoops: true } });
    await fetchEntityDetail(
      "atlast:entity:service/checkout",
      undefined,
      new AbortController().signal,
    );
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.pathname).toBe(
      "/api/v1/entities/atlast%3Aentity%3Aservice%2Fcheckout",
    );
  });

  it("encodes an evidence identifier and sends no pin parameters at all", async () => {
    const validEvidence = {
      schemaVersion: "atlast-domain-v1",
      identifier: "atlast:evidence:trace/1",
      observedAt: "2026-08-01T00:00:00.000Z",
      recordedAt: "2026-08-01T00:00:01.000Z",
      recordedSequence: 1,
      sourceScopedIdentity: { source: "tracing", sourceNativeId: "svc-1" },
      observation: { observationKind: "entity", entityType: "service" },
      detail: null,
    };
    const fetchStub = stubFetch({
      ok: true,
      jsonPayload: {
        data: validEvidence,
        meta: { schemaVersion: "atlast-domain-v1" },
      },
    });
    const result = await fetchEvidence(
      "atlast:evidence:trace/1",
      new AbortController().signal,
    );
    expect(result).toEqual({
      ok: true,
      data: {
        data: validEvidence,
        meta: { schemaVersion: "atlast-domain-v1" },
      },
    });
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.pathname).toBe(
      "/api/v1/evidence/atlast%3Aevidence%3Atrace%2F1",
    );
    expect(requestedUrl.search).toBe("");
  });
});

describe("fetchEntityEvidenceChain", () => {
  it("builds page bounds on the entity-scoped evidence-chain route", async () => {
    const fetchStub = stubFetch({ ok: false, jsonPayload: { whoops: true } });
    await fetchEntityEvidenceChain(
      "atlast:entity:service/checkout",
      { limit: 5 },
      new AbortController().signal,
    );
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.pathname).toBe(
      "/api/v1/entities/atlast%3Aentity%3Aservice%2Fcheckout/evidence",
    );
    expect(requestedUrl.searchParams.get("limit")).toBe("5");
  });
});

describe("fetchSnapshotSummary", () => {
  it("always sends the complete pin and validates the narrowed envelope", async () => {
    const fetchStub = stubFetch({
      ok: true,
      jsonPayload: {
        data: {
          checksum: "a".repeat(64),
          subjectCount: 3,
        },
        meta: VALID_META,
      },
    });
    const result = await fetchSnapshotSummary(
      {
        asOf: "2026-08-12T00:00:00.000Z",
        horizon: 20,
        derivationVersion: "m1-v1",
      },
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    const requestedUrl = new URL(
      String(fetchStub.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(requestedUrl.searchParams.get("asOf")).toBe(
      "2026-08-12T00:00:00.000Z",
    );
    expect(requestedUrl.searchParams.get("horizon")).toBe("20");
    expect(requestedUrl.searchParams.get("derivationVersion")).toBe("m1-v1");
  });
});

describe("fetchSnapshotAnchors", () => {
  it("uses the query-free route and validates the bounded response", async () => {
    const fetchStub = stubFetch({ ok: true, jsonPayload: VALID_ANCHORS });
    const result = await fetchSnapshotAnchors(new AbortController().signal);
    expect(result).toEqual({ ok: true, data: VALID_ANCHORS });
    expect(fetchStub.mock.calls[0]?.[0]).toBe("/api/v1/snapshot-anchors");
  });

  it("fails closed when an anchor omits a complete pin", async () => {
    stubFetch({
      ok: true,
      jsonPayload: {
        ...VALID_ANCHORS,
        items: [
          {
            checksum: "a".repeat(64),
            subjectCount: 12,
            identity: { asOf: VALID_META.resolvedIdentity.asOf, horizon: 20 },
          },
        ],
      },
    });
    await expect(
      fetchSnapshotAnchors(new AbortController().signal),
    ).resolves.toEqual({
      ok: false,
      error: { kind: "client-internal-failure" },
    });
  });
});
