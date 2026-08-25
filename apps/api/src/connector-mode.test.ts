/**
 * Focused tests for M6-A connector dataset mode (`connector-mode.ts`,
 * ADR-0040 §§ 2, 5, 6), proving its store-ownership, pre-flight, and
 * polling-lifecycle behavior against a stubbed `ConnectorPort` — never a
 * real cluster, never a spawned subprocess. `mapObservedPodToEvidence` is
 * used unstubbed (it is already pure and independently tested in
 * `packages/connectors`); only `listPods` — the one call that would touch a
 * real cluster — is stubbed here.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  entityPageSchema,
  errorResponseSchema,
  evidenceDetailResultSchema,
} from "@atlast/shared";
import {
  mapObservedPodToEvidence,
  TargetGuardError,
  type ObservedPod,
} from "@atlast/connectors";
import {
  startConnectorDatasetMode,
  type ConnectorPort,
} from "./connector-mode.ts";
import { parseJsonBody } from "./test-support/parse-response.ts";

const FIXED_TEST_CLOCK = () => "2026-08-24T00:00:00.000Z";
const BASE_OPTIONS = {
  kubeconfigPath: "/tmp/test-kubeconfig.yaml",
  contextName: "kind-atlast-m6-a-test",
  namespace: "atlast-m6-a-test",
  clock: FIXED_TEST_CLOCK,
};

const OBSERVED_POD: ObservedPod = {
  namespace: "atlast-m6-a-test",
  name: "connector-mode-test-pod",
};

type ListPodsResult =
  { readonly ok: readonly ObservedPod[] } | { readonly error: Error };

/** A stubbed `ConnectorPort` whose `listPods` returns each queued result/error in order, then repeats the last entry for every further call. */
function stubConnectorPort(
  listPodsResults: readonly ListPodsResult[],
): ConnectorPort & { readonly callCount: () => number } {
  let callIndex = 0;
  const listPods: ConnectorPort["listPods"] = vi.fn(
    (): Promise<readonly ObservedPod[]> => {
      const entry =
        listPodsResults[Math.min(callIndex, listPodsResults.length - 1)];
      callIndex += 1;
      if (entry === undefined) {
        return Promise.reject(
          new Error("stubConnectorPort misconfigured: no results queued"),
        );
      }
      return "error" in entry
        ? Promise.reject(entry.error)
        : Promise.resolve(entry.ok);
    },
  );
  return {
    listPods,
    mapObservedPodToEvidence,
    callCount: () => vi.mocked(listPods).mock.calls.length,
  };
}

describe("startConnectorDatasetMode", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not seed demo-company fixtures — a zero-Pod preflight leaves the store genuinely empty (test B)", async () => {
    const connector = stubConnectorPort([{ ok: [] }]);
    const { application, stopPolling } = await startConnectorDatasetMode(
      { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
      connector,
    );
    try {
      const response = await application.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      // An empty store has no valid graph-read horizon at all (ADR-0023 §
      // 5) — this 422 is exactly what a genuinely unseeded store produces,
      // proving no demo-company fixture entity exists here.
      expect(response.statusCode).toBe(422);
      const errorBody = parseJsonBody(response, errorResponseSchema);
      expect(errorBody.code).toBe("INVALID_READ_COORDINATE");
      expect(errorBody.details).toStrictEqual({
        reason: "EMPTY_EVIDENCE_STORE",
      });
    } finally {
      stopPolling();
      await application.close();
    }
  });

  it("appends connector-derived Pod Evidence into the exact same store the normal API queries (test D)", async () => {
    const connector = stubConnectorPort([{ ok: [OBSERVED_POD] }]);
    const { application, pollOnce, stopPolling } =
      await startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
        connector,
      );
    try {
      await pollOnce();

      const entitiesResponse = await application.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      expect(entitiesResponse.statusCode).toBe(200);
      const entities = parseJsonBody(entitiesResponse, entityPageSchema).items;
      expect(entities).toHaveLength(1);
      expect(entities[0]?.subject.identifier).toBe(
        "atlast:entity:atlast-m6-a-test-connector-mode-test-pod",
      );

      const provenance = entities[0]?.assertions[0]?.revision.provenance;
      expect(provenance).toHaveLength(1);
      const evidenceIdentifier = provenance?.[0];
      expect(evidenceIdentifier).toBeDefined();

      const evidenceResponse = await application.inject({
        method: "GET",
        url: `/api/v1/evidence/${encodeURIComponent(evidenceIdentifier ?? "")}`,
      });
      expect(evidenceResponse.statusCode).toBe(200);
      const evidenceResult = parseJsonBody(
        evidenceResponse,
        evidenceDetailResultSchema,
      );
      expect(evidenceResult.data.sourceScopedIdentity.source).toBe(
        "kubernetes",
      );
    } finally {
      stopPolling();
      await application.close();
    }
  });

  it("rejects, yielding no application, when the pre-flight read fails — a connector startup failure never leaves the normal API in a serving state (test E)", async () => {
    const preflightFailure = new Error(
      "simulated target-guard/RBAC pre-flight failure",
    );
    const connector = stubConnectorPort([{ error: preflightFailure }]);

    await expect(
      startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
        connector,
      ),
    ).rejects.toThrow(preflightFailure.message);

    // Exactly one call — the pre-flight — was ever attempted; no store, no
    // application, and no poll timer was ever created as a side effect of
    // the failed attempt.
    expect(connector.callCount()).toBe(1);
  });

  it("rejects via the real, unstubbed target guard before any Kubernetes network operation — no application ever becomes ready (test F)", async () => {
    // No injected ConnectorPort here — this deliberately exercises the real,
    // default REAL_CONNECTOR_PORT wiring (the real client.ts -> the real
    // assertLocalKindTarget, ADR-0037 § 4), which every other test in this
    // file bypasses via a stub. A real, minimal, valid kubeconfig file is
    // required — client.ts loads it from disk before it can reach the
    // guard — but its context deliberately lacks Kind's "kind-" prefix, so
    // the guard rejects on pure string inspection, before any request is
    // ever issued. No real cluster and no network access are required.
    const tempDirectory = mkdtempSync(
      join(tmpdir(), "atlast-m6-a-target-guard-integration-test-"),
    );
    const kubeconfigPath = join(tempDirectory, "kubeconfig.yaml");
    writeFileSync(
      kubeconfigPath,
      [
        "apiVersion: v1",
        "kind: Config",
        "clusters:",
        "  - name: not-kind-cluster",
        "    cluster:",
        "      server: https://127.0.0.1:6443",
        "contexts:",
        "  - name: not-kind-context",
        "    context:",
        "      cluster: not-kind-cluster",
        "      user: not-kind-user",
        "users:",
        "  - name: not-kind-user",
        "    user:",
        "      token: not-a-real-credential",
        "current-context: not-kind-context",
        "",
      ].join("\n"),
      "utf8",
    );

    try {
      await expect(
        startConnectorDatasetMode({
          ...BASE_OPTIONS,
          kubeconfigPath,
          contextName: "not-kind-context",
          namespace: "atlast-m6-a-target-guard-integration-test",
          pollIntervalMs: 60_000,
        }),
      ).rejects.toThrow(TargetGuardError);
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("maintains exactly one polling lifecycle — no duplicate timer, no double-appended Evidence per interval tick (test H)", async () => {
    vi.useFakeTimers();
    const connector = stubConnectorPort([{ ok: [] }, { ok: [OBSERVED_POD] }]);
    const { stopPolling, application } = await startConnectorDatasetMode(
      { ...BASE_OPTIONS, pollIntervalMs: 1_000 },
      connector,
    );
    try {
      expect(connector.callCount()).toBe(1); // the pre-flight call only, so far

      await vi.advanceTimersByTimeAsync(1_000);
      expect(connector.callCount()).toBe(2); // exactly one more call per tick
      await vi.advanceTimersByTimeAsync(1_000);
      expect(connector.callCount()).toBe(3); // still exactly one more, never two
    } finally {
      stopPolling();
      await application.close();
    }
  });

  it("does not double-count or race when the caller's explicit boot poll is combined with the running interval — the exact sequence server.ts uses (test H, realistic boot sequence)", async () => {
    vi.useFakeTimers();
    // Four queued results: [0] the pre-flight, [1] the caller's explicit
    // on-boot pollOnce() (mirrors server.ts: listen() then pollOnce() once,
    // exactly as documented in connector-mode.ts's pollOnce doc comment),
    // [2] the interval's first natural tick, [3] its second.
    const connector = stubConnectorPort([
      { ok: [] },
      { ok: [OBSERVED_POD] },
      { ok: [] },
      { ok: [] },
    ]);
    const { pollOnce, stopPolling, application } =
      await startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 1_000 },
        connector,
      );
    try {
      expect(connector.callCount()).toBe(1); // the pre-flight only, so far

      // The explicit boot poll, called strictly after "listen" in
      // server.ts's real sequence — must run to completion, appending
      // exactly the one Pod it observed, before the interval's first tick.
      await pollOnce();
      expect(connector.callCount()).toBe(2);

      const entitiesAfterBootPoll = await application.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      expect(entitiesAfterBootPoll.statusCode).toBe(200);
      expect(
        parseJsonBody(entitiesAfterBootPoll, entityPageSchema).items,
      ).toHaveLength(1);

      // The interval was already running underneath the explicit boot poll
      // (started synchronously inside startConnectorDatasetMode, before the
      // caller ever gets a chance to call pollOnce()). Advancing exactly one
      // full interval must produce exactly one more call — never a second,
      // overlapping one triggered by the explicit poll having "reset"
      // anything, and never zero, as if the explicit poll had consumed the
      // timer's own tick.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(connector.callCount()).toBe(3);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(connector.callCount()).toBe(4);

      // Still exactly the one Pod observed by the boot poll — the two empty
      // interval ticks neither duplicated nor erased it.
      const entitiesAfterInterval = await application.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      expect(
        parseJsonBody(entitiesAfterInterval, entityPageSchema).items,
      ).toHaveLength(1);
    } finally {
      stopPolling();
      await application.close();
    }
  });

  it("stops polling cleanly on shutdown — no further calls after stopPolling() (test I)", async () => {
    vi.useFakeTimers();
    const connector = stubConnectorPort([{ ok: [] }]);
    const { stopPolling, application } = await startConnectorDatasetMode(
      { ...BASE_OPTIONS, pollIntervalMs: 1_000 },
      connector,
    );
    const callsBeforeStop = connector.callCount();

    stopPolling();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(connector.callCount()).toBe(callsBeforeStop);
    await application.close();
  });

  it("keeps established Evidence queryable and unchanged after a subsequent poll failure — source loss ages honestly and never erases or corrupts the graph (test J)", async () => {
    const connector = stubConnectorPort([
      { ok: [OBSERVED_POD] }, // pre-flight
      { ok: [OBSERVED_POD] }, // first pollOnce(): establishes the entity
      { error: new Error("simulated source loss") }, // second pollOnce(): the cluster is gone
    ]);
    const { application, pollOnce, stopPolling } =
      await startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
        connector,
      );
    try {
      await pollOnce();
      const beforeLossResponse = await application.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      expect(beforeLossResponse.statusCode).toBe(200);
      const beforeLossEntities = parseJsonBody(
        beforeLossResponse,
        entityPageSchema,
      ).items;
      expect(beforeLossEntities).toHaveLength(1);

      await expect(pollOnce()).rejects.toThrow("simulated source loss");

      const afterLossResponse = await application.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      expect(afterLossResponse.statusCode).toBe(200);
      expect(
        parseJsonBody(afterLossResponse, entityPageSchema).items,
      ).toStrictEqual(beforeLossEntities);
    } finally {
      stopPolling();
      await application.close();
    }
  });
});
