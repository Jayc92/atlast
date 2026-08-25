/**
 * M6-A connector dataset mode (ADR-0040 §§ 2, 5, 6; accepted `docs/m6-plan.md
 * § 7`). Extracted from the raw `server.ts` entrypoint into its own,
 * dependency-injectable module specifically so its pre-flight, store-
 * ownership, and polling-lifecycle behavior can be proven by focused tests
 * against a stubbed connector — never a real cluster, and never a spawned
 * subprocess (mirroring how `apps/api/src/test-support/stub-repositories.ts`
 * already lets this package test behavior no real in-memory store can be
 * coerced into).
 *
 * Real Kubernetes Pod Evidence enters the exact same `EvidenceStore`/
 * `TopologyGraphStore` pair the returned `application` serves reads from —
 * never a second, separate store (ADR-0040 §§ 2, 4). This module never
 * seeds `demo-company` fixture Evidence; connector mode and fixture mode
 * are mutually exclusive in one process (ADR-0040 § 1).
 */
import type { FastifyInstance } from "fastify";
import { type Clock } from "@atlast/graph-model";
import {
  listPods as realListPods,
  mapObservedPodToEvidence as realMapObservedPodToEvidence,
  type ObservedPod,
} from "@atlast/connectors";
import {
  initializeApplicationExposingStores,
  type ApplicationDependencies,
} from "./app.ts";

export interface ConnectorModeOptions {
  /** Path to a kubeconfig file. Never the ambient `~/.kube/config` default (ADR-0037 § 3). */
  readonly kubeconfigPath: string;
  /** The exact context to use — explicitly named, never "whatever is current" (ADR-0037 § 3). */
  readonly contextName: string;
  /** The one namespace this connector is scoped to read (ADR-0037 § 2). */
  readonly namespace: string;
  /** Milliseconds between polls. */
  readonly pollIntervalMs: number;
  readonly clock: Clock;
}

/**
 * The exact, narrow surface this module depends on from `@atlast/connectors`
 * — injectable so tests can stub connector behavior (a preflight failure, a
 * mid-session poll failure, a specific observed Pod set) without a real
 * cluster. Defaults to the real, unmodified connector exports.
 */
export interface ConnectorPort {
  readonly listPods: typeof realListPods;
  readonly mapObservedPodToEvidence: typeof realMapObservedPodToEvidence;
}

export const REAL_CONNECTOR_PORT: ConnectorPort = {
  listPods: realListPods,
  mapObservedPodToEvidence: realMapObservedPodToEvidence,
};

export interface ConnectorModeHandle {
  readonly application: FastifyInstance;
  readonly dependencies: ApplicationDependencies;
  /**
   * Runs one poll cycle immediately (not on the interval timer). The caller
   * is expected to invoke this exactly once, strictly after `application`
   * has started listening — mirroring the M5-A live post-boot ingestion
   * proof's exact ordering (`docs/audits/m0-synthetic-boundary-audit.md §
   * 21.3`). A poll failure here (or on the interval) is caught and logged by
   * the caller — never fatal once the process is already serving.
   */
  readonly pollOnce: () => Promise<void>;
  /** Stops the interval timer. Idempotent. Does not close `application`. */
  readonly stopPolling: () => void;
}

/**
 * Starts M6-A connector dataset mode: a mandatory pre-flight `listPods` call
 * (exercising the accepted ADR-0037 § 4 target guard and a real read) that
 * must succeed before any store or application is constructed — a failure
 * here rejects this function's own promise, and no application is ever
 * created, exactly mirroring `initializeApplication`'s existing "ingestion
 * completes before any application is ever produced" invariant applied to
 * discovery instead of fixture seeding. Only after that succeeds does this
 * function construct the store pair (via `initializeApplicationExposingStores`,
 * `"connector"` mode, zero seed Evidence — ADR-0040 § 1) and start the
 * recurring poll timer against that exact store.
 */
export async function startConnectorDatasetMode(
  options: ConnectorModeOptions,
  connector: ConnectorPort = REAL_CONNECTOR_PORT,
): Promise<ConnectorModeHandle> {
  const { kubeconfigPath, contextName, namespace, pollIntervalMs, clock } =
    options;

  // Pre-flight (ADR-0037 § 4 target guard, exercised inside listPods before
  // any request is issued): a real read against the real cluster must
  // succeed before this process is allowed to construct a store or start
  // serving at all. Never a silent fall-back to fixtures.
  await connector.listPods({ kubeconfigPath, contextName, namespace });

  const { application, dependencies } =
    await initializeApplicationExposingStores(clock, [], [], "connector");

  let nextRecordedSequence = 1;

  async function pollOnce(): Promise<void> {
    const observedPods: readonly ObservedPod[] = await connector.listPods({
      kubeconfigPath,
      contextName,
      namespace,
    });
    if (observedPods.length === 0) {
      return;
    }

    const observationInstant = clock();
    const evidenceRecords = observedPods.map((pod) => {
      const recordedSequence = nextRecordedSequence;
      nextRecordedSequence += 1;
      return connector.mapObservedPodToEvidence({
        pod,
        recordedSequence,
        observedAt: observationInstant,
        recordedAt: observationInstant,
      });
    });

    await dependencies.evidenceStore.appendEvidence(evidenceRecords);
  }

  // Started immediately so subsequent polls continue on schedule; the
  // caller triggers the first, on-boot poll explicitly via `pollOnce()`,
  // strictly after `application.listen(...)` — this timer covers every
  // poll after that one. A poll failure (including total source loss) is
  // never fatal once the process is already serving — established Evidence
  // remains queryable and ages honestly (ADR-0040 § 6; the already-proven
  // M5 source-loss behavior, `docs/audits/m0-synthetic-boundary-audit.md §
  // 22`, carried forward unmodified) — so failures are swallowed here,
  // exactly as the pre-existing M5-A experiment entrypoint already did.
  const pollTimer = setInterval(() => {
    pollOnce().catch((pollError: unknown) => {
      // Logged, never fatal, never a silent fall-back to fixtures, and
      // never a mutation of already-established Evidence — the already-
      // proven M5 source-loss behavior (`docs/audits/m0-synthetic-boundary-
      // audit.md § 22`), carried forward unmodified.
      console.error("[atlast-api] connector poll failed:", pollError);
    });
  }, pollIntervalMs);

  function stopPolling(): void {
    clearInterval(pollTimer);
  }

  return { application, dependencies, pollOnce, stopPolling };
}
