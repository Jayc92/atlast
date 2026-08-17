/**
 * Tests for the M3-D health-context data hook: off/loading/ready states,
 * closed API-error and redacted internal-error propagation, the client-side
 * identity/subject publish gate (ADR-0031 § 1), and retry.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildEntityReadResult,
  buildTraversalResult,
  FIXTURE_IDENTITY,
} from "./test-support/fixtures.ts";
import { jsonRoute, stubApiFetch } from "./test-support/stub-fetch.ts";
import { topologyRequestCache } from "./session.ts";
import { useHealthContext } from "./use-health-context.ts";

const fulfillment = buildEntityReadResult({
  identifier: "atlast:entity:fulfillment",
  entityType: "service",
});
const payments = buildEntityReadResult({
  identifier: "atlast:entity:payments",
  entityType: "service",
});
const BASE_TRAVERSAL = buildTraversalResult([fulfillment]);

const OVERLAY_META = {
  schemaVersion: "atlast-overlay-v1" as const,
  frameIdentifier: "atlast:overlay-frame:demo-company/active-conditions",
  effectiveAt: "2026-08-01T00:00:00.000Z",
};

function healthContextPayload(overrides: {
  readonly originEntityIdentifier?: string;
  readonly items?: readonly {
    readonly subject: { readonly identifier: string };
  }[];
}): unknown {
  const originEntityIdentifier =
    overrides.originEntityIdentifier ?? "atlast:entity:checkout";
  const items = overrides.items ?? [fulfillment];
  const projections = [
    originEntityIdentifier,
    ...items.map((item) => item.subject.identifier),
  ]
    .sort()
    .map((entityIdentifier) => ({
      reportStatus: "reported",
      entityIdentifier,
      directCondition: "healthy",
      effectiveState: "healthy",
      contextCompleteness: "complete-within-requested-bounds",
    }));
  return {
    data: {
      originEntityIdentifier,
      items,
      projections,
      gaps: [],
    },
    traversal: { truncated: false, subjectCount: items.length },
    meta: {
      resolvedIdentity: FIXTURE_IDENTITY,
      schemaVersion: "atlast-domain-v1",
      overlay: OVERLAY_META,
    },
  };
}

afterEach(() => {
  cleanup();
  topologyRequestCache.clear();
});

describe("useHealthContext", () => {
  it("reports off when disabled, issuing no request", () => {
    const fetchStub = stubApiFetch([]);
    const { result } = renderHook(() =>
      useHealthContext({
        enabled: false,
        entityId: "atlast:entity:checkout",
        direction: "downstream",
        depth: 1,
        minConfidence: 0,
        identity: FIXTURE_IDENTITY,
        overlayFrame: undefined,
        baseTraversal: BASE_TRAVERSAL,
      }),
    );
    expect(result.current.state).toEqual({ status: "off" });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("stays loading while enabled but the base traversal has not resolved yet", () => {
    const fetchStub = stubApiFetch([]);
    const { result } = renderHook(() =>
      useHealthContext({
        enabled: true,
        entityId: "atlast:entity:checkout",
        direction: "downstream",
        depth: 1,
        minConfidence: 0,
        identity: FIXTURE_IDENTITY,
        overlayFrame: undefined,
        baseTraversal: undefined,
      }),
    );
    expect(result.current.state).toEqual({ status: "loading" });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("reports ready with the validated result when subjects match the base traversal", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/health-context?"),
        healthContextPayload({}),
      ),
    ]);
    const { result } = renderHook(() =>
      useHealthContext({
        enabled: true,
        entityId: "atlast:entity:checkout",
        direction: "downstream",
        depth: 1,
        minConfidence: 0,
        identity: FIXTURE_IDENTITY,
        overlayFrame: undefined,
        baseTraversal: BASE_TRAVERSAL,
      }),
    );
    await waitFor(() => {
      expect(result.current.state.status).toBe("ready");
    });
  });

  it("reports a closed API error distinctly from an internal failure", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/health-context?"),
        {
          code: "OVERLAY_FRAME_NOT_FOUND",
          message: "The requested overlay frame does not exist.",
          details: { overlayFrame: "atlast:overlay-frame:demo-company/gone" },
        },
        false,
      ),
    ]);
    const { result } = renderHook(() =>
      useHealthContext({
        enabled: true,
        entityId: "atlast:entity:checkout",
        direction: "downstream",
        depth: 1,
        minConfidence: 0,
        identity: FIXTURE_IDENTITY,
        overlayFrame: "atlast:overlay-frame:demo-company/gone",
        baseTraversal: BASE_TRAVERSAL,
      }),
    );
    await waitFor(() => {
      expect(result.current.state.status).toBe("api-error");
    });
  });

  it("reports identity-mismatch — never the retained topology view — when subjects differ from the base traversal", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/health-context?"),
        healthContextPayload({ items: [payments] }),
      ),
    ]);
    const { result } = renderHook(() =>
      useHealthContext({
        enabled: true,
        entityId: "atlast:entity:checkout",
        direction: "downstream",
        depth: 1,
        minConfidence: 0,
        identity: FIXTURE_IDENTITY,
        overlayFrame: undefined,
        baseTraversal: BASE_TRAVERSAL,
      }),
    );
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "identity-mismatch" });
    });
  });

  it("collapses a malformed response into a redacted internal failure", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/health-context?"), {
        not: "a valid health context",
      }),
    ]);
    const { result } = renderHook(() =>
      useHealthContext({
        enabled: true,
        entityId: "atlast:entity:checkout",
        direction: "downstream",
        depth: 1,
        minConfidence: 0,
        identity: FIXTURE_IDENTITY,
        overlayFrame: undefined,
        baseTraversal: BASE_TRAVERSAL,
      }),
    );
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "internal-error" });
    });
  });

  it("re-issues the exact same request on retry", async () => {
    let requestCount = 0;
    const fetchStub = stubApiFetch([
      {
        test: (url) => url.includes("/health-context?"),
        respond: () => {
          requestCount += 1;
          return requestCount === 1
            ? { ok: false, jsonPayload: { not: "valid" } }
            : { ok: true, jsonPayload: healthContextPayload({}) };
        },
      },
    ]);
    const { result } = renderHook(() =>
      useHealthContext({
        enabled: true,
        entityId: "atlast:entity:checkout",
        direction: "downstream",
        depth: 1,
        minConfidence: 0,
        identity: FIXTURE_IDENTITY,
        overlayFrame: undefined,
        baseTraversal: BASE_TRAVERSAL,
      }),
    );
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "internal-error" });
    });
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe("ready");
    });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
});
