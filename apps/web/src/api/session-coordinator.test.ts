/**
 * ADR-0026 § 4 verification obligation: "Single-flight initial/latest-
 * resolution tests proving concurrent panels share one cursorless graph
 * request."
 */
import { describe, expect, it, vi } from "vitest";
import type { ClientQueryResult } from "./errors.ts";
import { createExplorationSessionCoordinator } from "./session-coordinator.ts";

interface FakeIdentity {
  readonly asOf: string;
}

/** A deferred promise so a test controls exactly when a fetch "resolves". */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("createExplorationSessionCoordinator — single flight", () => {
  it("issues exactly one cursorless latest request for concurrent callers", async () => {
    const coordinator = createExplorationSessionCoordinator<FakeIdentity>();
    const deferred = createDeferred<ClientQueryResult<FakeIdentity>>();
    const fetchLatestIdentity = vi.fn(() => deferred.promise);

    const callerA = coordinator.resolveLatestIdentity(fetchLatestIdentity);
    const callerB = coordinator.resolveLatestIdentity(fetchLatestIdentity);
    const callerC = coordinator.resolveLatestIdentity(fetchLatestIdentity);

    expect(fetchLatestIdentity).toHaveBeenCalledTimes(1);

    deferred.resolve({ ok: true, data: { asOf: "2026-01-01T00:00:00.000Z" } });

    const [resultA, resultB, resultC] = await Promise.all([
      callerA,
      callerB,
      callerC,
    ]);
    expect(resultA).toEqual(resultB);
    expect(resultB).toEqual(resultC);
    expect(resultA).toEqual({
      ok: true,
      data: { asOf: "2026-01-01T00:00:00.000Z" },
    });
    expect(fetchLatestIdentity).toHaveBeenCalledTimes(1);
  });

  it("reuses the established identity for later calls without a new request", async () => {
    const coordinator = createExplorationSessionCoordinator<FakeIdentity>();
    const fetchLatestIdentity = vi.fn(() =>
      Promise.resolve<ClientQueryResult<FakeIdentity>>({
        ok: true,
        data: { asOf: "2026-01-01T00:00:00.000Z" },
      }),
    );

    await coordinator.resolveLatestIdentity(fetchLatestIdentity);
    await coordinator.resolveLatestIdentity(fetchLatestIdentity);
    await coordinator.resolveLatestIdentity(fetchLatestIdentity);

    expect(fetchLatestIdentity).toHaveBeenCalledTimes(1);
    expect(coordinator.getEstablishedIdentity()).toEqual({
      asOf: "2026-01-01T00:00:00.000Z",
    });
  });

  it("does not establish an identity on a failed resolution, so a later call may retry", async () => {
    const coordinator = createExplorationSessionCoordinator<FakeIdentity>();
    const fetchLatestIdentity = vi
      .fn<() => Promise<ClientQueryResult<FakeIdentity>>>()
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: "client-internal-failure" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { asOf: "2026-01-01T00:00:00.000Z" },
      });

    const firstResult =
      await coordinator.resolveLatestIdentity(fetchLatestIdentity);
    expect(firstResult.ok).toBe(false);
    expect(coordinator.getEstablishedIdentity()).toBeUndefined();

    const secondResult =
      await coordinator.resolveLatestIdentity(fetchLatestIdentity);
    expect(secondResult).toEqual({
      ok: true,
      data: { asOf: "2026-01-01T00:00:00.000Z" },
    });
    expect(fetchLatestIdentity).toHaveBeenCalledTimes(2);
  });

  it("closes a rejected resolution and clears it so a later call may retry", async () => {
    const coordinator = createExplorationSessionCoordinator<FakeIdentity>();
    const fetchLatestIdentity = vi
      .fn<() => Promise<ClientQueryResult<FakeIdentity>>>()
      .mockRejectedValueOnce(new Error("sensitive transport detail"))
      .mockResolvedValueOnce({
        ok: true,
        data: { asOf: "2026-01-01T00:00:00.000Z" },
      });

    await expect(
      coordinator.resolveLatestIdentity(fetchLatestIdentity),
    ).resolves.toEqual({
      ok: false,
      error: { kind: "client-internal-failure" },
    });
    expect(coordinator.getEstablishedIdentity()).toBeUndefined();

    await expect(
      coordinator.resolveLatestIdentity(fetchLatestIdentity),
    ).resolves.toEqual({
      ok: true,
      data: { asOf: "2026-01-01T00:00:00.000Z" },
    });
    expect(fetchLatestIdentity).toHaveBeenCalledTimes(2);
  });

  it("closes a synchronous throw and still returns a retryable promise", async () => {
    const coordinator = createExplorationSessionCoordinator<FakeIdentity>();
    const fetchLatestIdentity = vi
      .fn<() => Promise<ClientQueryResult<FakeIdentity>>>()
      .mockImplementationOnce(() => {
        throw new Error("sensitive synchronous detail");
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { asOf: "2026-01-01T00:00:00.000Z" },
      });

    await expect(
      coordinator.resolveLatestIdentity(fetchLatestIdentity),
    ).resolves.toEqual({
      ok: false,
      error: { kind: "client-internal-failure" },
    });
    await coordinator.resolveLatestIdentity(fetchLatestIdentity);

    expect(fetchLatestIdentity).toHaveBeenCalledTimes(2);
  });
});

describe("createExplorationSessionCoordinator — generations", () => {
  it("ignores an obsolete-generation resolution that lands after a new generation begins", async () => {
    const coordinator = createExplorationSessionCoordinator<FakeIdentity>();
    const deferred = createDeferred<ClientQueryResult<FakeIdentity>>();
    const fetchLatestIdentity = vi.fn(() => deferred.promise);

    const staleCall = coordinator.resolveLatestIdentity(fetchLatestIdentity);
    const generationBeforeRefresh = coordinator.currentGeneration();

    // An explicit refresh (or an exploration-resetting navigation) begins a
    // new generation before the first request ever settles.
    const newGeneration = coordinator.beginNewGeneration();
    expect(newGeneration).toBe(generationBeforeRefresh + 1);
    expect(coordinator.isCurrentGeneration(generationBeforeRefresh)).toBe(
      false,
    );

    deferred.resolve({ ok: true, data: { asOf: "2026-01-01T00:00:00.000Z" } });
    const staleResult = await staleCall;

    // The obsolete generation's response is ignored — it can neither
    // publish identity nor be reported as a success to the stale caller.
    expect(staleResult).toEqual({ ok: false, error: { kind: "aborted" } });
    expect(coordinator.getEstablishedIdentity()).toBeUndefined();
  });

  it("issues a fresh single-flight request for the new generation after a refresh", async () => {
    const coordinator = createExplorationSessionCoordinator<FakeIdentity>();
    const fetchLatestIdentity = vi
      .fn<() => Promise<ClientQueryResult<FakeIdentity>>>()
      .mockResolvedValueOnce({
        ok: true,
        data: { asOf: "2026-01-01T00:00:00.000Z" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { asOf: "2026-01-02T00:00:00.000Z" },
      });

    await coordinator.resolveLatestIdentity(fetchLatestIdentity);
    coordinator.beginNewGeneration();
    const refreshed =
      await coordinator.resolveLatestIdentity(fetchLatestIdentity);

    expect(refreshed).toEqual({
      ok: true,
      data: { asOf: "2026-01-02T00:00:00.000Z" },
    });
    expect(fetchLatestIdentity).toHaveBeenCalledTimes(2);
  });
});
