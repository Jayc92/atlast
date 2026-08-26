/**
 * Focused tests for connector dataset mode (`connector-mode.ts`, ADR-0040 §§
 * 2, 5, 6; extended M6-B, ADR-0039 §§ 1, 2, 3), proving its store-ownership,
 * pre-flight, atomic-cycle, and polling-lifecycle behavior against a
 * stubbed `ConnectorPort` — never a real cluster, never a spawned
 * subprocess. `deriveEvidenceForCycle` is used unstubbed (it is already
 * pure and independently tested in `packages/connectors`); only the four
 * list calls that would touch a real cluster are stubbed here.
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
import { TargetGuardError, type ObservedPod } from "@atlast/connectors";
import { startConnectorDatasetMode } from "./connector-mode.ts";
import { parseJsonBody } from "./test-support/parse-response.ts";
import { stubConnectorPort } from "./test-support/stub-connector-port.ts";

const FIXED_TEST_CLOCK = () => "2026-08-26T00:00:00.000Z";
const NAMESPACE = "atlast-m6-a-test";
const BASE_OPTIONS = {
  kubeconfigPath: "/tmp/test-kubeconfig.yaml",
  contextName: "kind-atlast-m6-a-test",
  namespace: NAMESPACE,
  clock: FIXED_TEST_CLOCK,
};

const OBSERVED_POD: ObservedPod = {
  namespace: NAMESPACE,
  name: "connector-mode-test-pod",
  labels: {},
  controllerOwnerReference: null,
};

describe("startConnectorDatasetMode", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not seed demo-company fixtures — a zero-resource preflight leaves the store genuinely empty (test B)", async () => {
    const connector = stubConnectorPort([{}]);
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
    const connector = stubConnectorPort([{}, { pods: [OBSERVED_POD] }]);
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
        "atlast:entity:atlast-m6-a-test-pod-connector-mode-test-pod",
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

  it("rejects, yielding no application, when the pre-flight cycle fails — a connector startup failure never leaves the normal API in a serving state (test E)", async () => {
    const preflightFailure = new Error(
      "simulated target-guard/RBAC pre-flight failure",
    );
    const connector = stubConnectorPort([{ pods: preflightFailure }]);

    await expect(
      startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
        connector,
      ),
    ).rejects.toThrow(preflightFailure.message);

    // Exactly one cycle — the pre-flight — was ever attempted; no store, no
    // application, and no poll timer was ever created as a side effect of
    // the failed attempt.
    expect(connector.callCount()).toBe(1);
  });

  it("a pre-flight cycle where only one resource kind fails still rejects — the atomic cycle never treats a partial success as readiness (test E, partial failure)", async () => {
    const deploymentsFailure = new Error("simulated Deployments RBAC gap");
    const connector = stubConnectorPort([{ deployments: deploymentsFailure }]);

    await expect(
      startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
        connector,
      ),
    ).rejects.toThrow(deploymentsFailure.message);
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
      join(tmpdir(), "atlast-m6-b-target-guard-integration-test-"),
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
          namespace: "atlast-m6-b-target-guard-integration-test",
          pollIntervalMs: 60_000,
        }),
      ).rejects.toThrow(TargetGuardError);
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("maintains exactly one polling lifecycle — no duplicate timer, no double-appended Evidence per interval tick (test H)", async () => {
    vi.useFakeTimers();
    const connector = stubConnectorPort([{}, { pods: [OBSERVED_POD] }]);
    const { stopPolling, application } = await startConnectorDatasetMode(
      { ...BASE_OPTIONS, pollIntervalMs: 1_000 },
      connector,
    );
    try {
      expect(connector.callCount()).toBe(1); // the pre-flight call only, so far

      await vi.advanceTimersByTimeAsync(1_000);
      expect(connector.callCount()).toBe(2); // exactly one more cycle per tick
      await vi.advanceTimersByTimeAsync(1_000);
      expect(connector.callCount()).toBe(3); // still exactly one more, never two
    } finally {
      stopPolling();
      await application.close();
    }
  });

  it("does not double-count or race when the caller's explicit boot poll is combined with the running interval — the exact sequence server.ts uses (test H, realistic boot sequence)", async () => {
    vi.useFakeTimers();
    const connector = stubConnectorPort([{}, { pods: [OBSERVED_POD] }, {}, {}]);
    const { pollOnce, stopPolling, application } =
      await startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 1_000 },
        connector,
      );
    try {
      expect(connector.callCount()).toBe(1); // the pre-flight only, so far

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

      await vi.advanceTimersByTimeAsync(1_000);
      expect(connector.callCount()).toBe(3);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(connector.callCount()).toBe(4);

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
    const connector = stubConnectorPort([{}]);
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
      { pods: [OBSERVED_POD] }, // pre-flight
      { pods: [OBSERVED_POD] }, // first pollOnce(): establishes the entity
      { pods: new Error("simulated source loss") }, // second pollOnce(): the cluster is gone
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

  it("a partial poll failure (one resource kind's list call rejects) appends nothing from that cycle — never a partially-derived, inconsistent graph (test: atomic cycle)", async () => {
    const connector = stubConnectorPort([
      {}, // pre-flight
      {
        pods: [OBSERVED_POD],
        services: new Error("simulated Services partial failure"),
      },
    ]);
    const { application, pollOnce, stopPolling } =
      await startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
        connector,
      );
    try {
      await expect(pollOnce()).rejects.toThrow(
        "simulated Services partial failure",
      );

      const response = await application.inject({
        method: "GET",
        url: "/api/v1/entities",
      });
      // Still genuinely empty — the Pod half of the failed cycle was never
      // appended just because it happened to succeed.
      expect(response.statusCode).toBe(422);
    } finally {
      stopPolling();
      await application.close();
    }
  });
});
