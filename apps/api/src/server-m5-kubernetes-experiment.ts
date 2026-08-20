/**
 * M5-A live Kubernetes ingestion experiment entrypoint (ADR-0036/0037;
 * docs/m5-plan.md §§ 3, 4.1, 7). **Not** the production entrypoint —
 * `apps/api/src/server.ts` is unmodified and remains the only way the
 * existing, unmodified M0–M4 synthetic capability runs. This is a
 * separate, additive, deliberately temporary experimental process
 * (docs/m5-plan.md § 3's "temporary experimental seam" note) that proves
 * one thing: a real Kubernetes observation, collected *after* this
 * process is already running and already serving requests, reaches the
 * exact same `EvidenceStore`/reconciliation/query-API path the production
 * process uses — without a restart and without any hand-authored graph
 * fact.
 *
 * Seeded with **zero** synthetic Evidence and zero overlay frames — this
 * experiment never mixes real Kubernetes-sourced Evidence with the
 * `demo-company` fixture catalog in one store (docs/m5-plan.md § 6). Binds
 * to loopback only, exactly like every other Atlast process (ADR-0004,
 * GUARDRAILS.md § 1.4) — its authentication exemption is scoped and
 * conditional (GUARDRAILS.md § 1.4's M5-A exemption), not a precedent for
 * any other process.
 */
import { assertValidClockReading, type Clock } from "@atlast/graph-model";
import {
  listPods,
  mapObservedPodToEvidence,
  type ObservedPod,
} from "@atlast/connectors";
import { initializeApplicationExposingStores } from "./app.ts";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_PORT = 3901;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_NAMESPACE = "atlast-m5";

const systemClock: Clock = () =>
  assertValidClockReading(new Date().toISOString());

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable ${name}. This experiment never resolves an ambient/default kubeconfig context — the kubeconfig path and context name must be supplied explicitly (ADR-0037 § 3).`,
    );
  }
  return value;
}

function resolvePort(rawPortValue: string | undefined): number {
  if (rawPortValue === undefined || rawPortValue === "") {
    return DEFAULT_PORT;
  }
  const parsedPort = Number(rawPortValue);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(
      `Invalid ATLAST_M5_API_PORT value "${rawPortValue}": expected an integer between 1 and 65535.`,
    );
  }
  return parsedPort;
}

function resolvePollIntervalMs(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue === "") {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 250) {
    throw new Error(
      `Invalid ATLAST_M5_POLL_INTERVAL_MS value "${rawValue}": expected an integer of at least 250.`,
    );
  }
  return parsed;
}

async function startExperiment(): Promise<void> {
  const kubeconfigPath = requiredEnv("ATLAST_M5_KUBECONFIG");
  const contextName = requiredEnv("ATLAST_M5_KUBE_CONTEXT");
  const namespace = process.env["ATLAST_M5_NAMESPACE"] ?? DEFAULT_NAMESPACE;
  const port = resolvePort(process.env["ATLAST_M5_API_PORT"]);
  const pollIntervalMs = resolvePollIntervalMs(
    process.env["ATLAST_M5_POLL_INTERVAL_MS"],
  );

  const { application, dependencies } =
    await initializeApplicationExposingStores(systemClock, [], []);

  let nextRecordedSequence = 1;

  async function pollOnce(): Promise<void> {
    const observedPods: readonly ObservedPod[] = await listPods({
      kubeconfigPath,
      contextName,
      namespace,
    });

    if (observedPods.length === 0) {
      console.log(
        `[m5-experiment] poll: 0 Pods observed in namespace ${namespace}`,
      );
      return;
    }

    const observationInstant = systemClock();
    const evidenceRecords = observedPods.map((pod) => {
      const recordedSequence = nextRecordedSequence;
      nextRecordedSequence += 1;
      return mapObservedPodToEvidence({
        pod,
        recordedSequence,
        observedAt: observationInstant,
        recordedAt: observationInstant,
      });
    });

    await dependencies.evidenceStore.appendEvidence(evidenceRecords);

    console.log(
      `[m5-experiment] poll: appended ${String(evidenceRecords.length)} Evidence record(s) for Pod(s) ${observedPods
        .map((pod) => `${pod.namespace}/${pod.name}`)
        .join(", ")} — sequence(s) ${evidenceRecords
        .map((record) => String(record.recordedSequence))
        .join(", ")}`,
    );
  }

  const pollTimer = setInterval(() => {
    pollOnce().catch((pollError: unknown) => {
      console.error("[m5-experiment] poll failed:", pollError);
    });
  }, pollIntervalMs);

  for (const terminationSignal of ["SIGINT", "SIGTERM"] as const) {
    process.once(terminationSignal, () => {
      clearInterval(pollTimer);
      application.close().then(
        () => process.exit(0),
        (closeError: unknown) => {
          console.error(
            `Error while closing on ${terminationSignal}:`,
            closeError,
          );
          process.exit(1);
        },
      );
    });
  }

  await application.listen({ host: LOOPBACK_HOST, port });
  console.log(
    `[m5-experiment] atlast-m5 experiment listening on http://${LOOPBACK_HOST}:${String(port)} (namespace=${namespace}, context=${contextName}, pollIntervalMs=${String(pollIntervalMs)})`,
  );

  // One immediate poll on boot, so the experiment's first observation
  // happens as soon as it is ready — still strictly after the application
  // is already listening, never before.
  await pollOnce();
}

startExperiment().catch((startupError: unknown) => {
  console.error("m5-experiment failed to start:", startupError);
  process.exit(1);
});
