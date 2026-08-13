/**
 * Tests for the M2-B shared topology session: identity resolution honors an
 * explicit URL pin without a request, otherwise defers to the shared
 * exploration coordinator so concurrent "latest" resolutions issue at most
 * one real probe request (ADR-0026 § 4).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requireResolvedIdentity,
  resolveSnapshotIdentity,
  topologySessionCoordinator,
} from "./session.ts";
import { buildEntityPage, FIXTURE_IDENTITY } from "./test-support/fixtures.ts";

type FetchLikeFunction = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function stubInventoryProbe(): ReturnType<typeof vi.fn<FetchLikeFunction>> {
  const fetchStub = vi.fn<FetchLikeFunction>((): Promise<Response> =>
    Promise.resolve({
      ok: true,
      json: (): Promise<unknown> => Promise.resolve(buildEntityPage([])),
    } as Response),
  );
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  topologySessionCoordinator.beginNewGeneration();
});

describe("resolveSnapshotIdentity", () => {
  it("resolves an explicit URL pin immediately, with no network request", async () => {
    const fetchStub = stubInventoryProbe();
    const result = await resolveSnapshotIdentity(
      FIXTURE_IDENTITY,
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: true, data: FIXTURE_IDENTITY });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("resolves latest mode via the shared coordinator's single-flight probe", async () => {
    const fetchStub = stubInventoryProbe();
    const [first, second] = await Promise.all([
      resolveSnapshotIdentity(undefined, new AbortController().signal),
      resolveSnapshotIdentity(undefined, new AbortController().signal),
    ]);
    expect(first).toEqual({ ok: true, data: FIXTURE_IDENTITY });
    expect(second).toEqual({ ok: true, data: FIXTURE_IDENTITY });
    // Two concurrent latest resolutions in the same generation share one probe.
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("issues a new probe once a new exploration generation begins", async () => {
    const fetchStub = stubInventoryProbe();
    await resolveSnapshotIdentity(undefined, new AbortController().signal);
    topologySessionCoordinator.beginNewGeneration();
    await resolveSnapshotIdentity(undefined, new AbortController().signal);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
});

describe("requireResolvedIdentity", () => {
  it("passes through a response at the requested complete identity", () => {
    const page = buildEntityPage([]);

    expect(
      requireResolvedIdentity({ ok: true, data: page }, FIXTURE_IDENTITY),
    ).toEqual({ ok: true, data: page });
  });

  it("fails closed when a schema-valid response reports a different identity", () => {
    const mismatchedPage = {
      ...buildEntityPage([]),
      meta: {
        schemaVersion: "atlast-domain-v1" as const,
        resolvedIdentity: {
          ...FIXTURE_IDENTITY,
          horizon: FIXTURE_IDENTITY.horizon + 1,
        },
      },
    };

    expect(
      requireResolvedIdentity(
        { ok: true, data: mismatchedPage },
        FIXTURE_IDENTITY,
      ),
    ).toEqual({ ok: false, error: { kind: "client-internal-failure" } });
  });
});
