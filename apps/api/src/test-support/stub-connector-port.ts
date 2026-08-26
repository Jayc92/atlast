/**
 * Shared `ConnectorPort` stub for `connector-mode.ts` tests (extracted,
 * ADR-0043 corrective continuation, from `connector-mode.test.ts` so the
 * cross-kind identity regression suite can reuse the identical atomic-cycle
 * stubbing discipline rather than a second, divergent implementation).
 */
import { vi } from "vitest";
import type {
  ObservedDeployment,
  ObservedPod,
  ObservedReplicaSet,
  ObservedService,
} from "@atlast/connectors";
import type { ConnectorPort } from "../connector-mode.ts";

export interface CycleOutcome {
  readonly deployments?: readonly ObservedDeployment[] | Error;
  readonly replicaSets?: readonly ObservedReplicaSet[] | Error;
  readonly pods?: readonly ObservedPod[] | Error;
  readonly services?: readonly ObservedService[] | Error;
}

/**
 * A stubbed `ConnectorPort` whose four list operations each return the
 * queued outcome for the current cycle (in lockstep — every cycle calls
 * all four exactly once via `Promise.all`, so their independent call
 * counters always agree), then repeat the last entry for every further
 * cycle. Any resource kind omitted from an outcome defaults to an empty,
 * successful list — only override the kinds a given test cares about.
 */
export function stubConnectorPort(
  outcomes: readonly CycleOutcome[],
): ConnectorPort & { readonly callCount: () => number } {
  function makeListFn<Resource>(
    pick: (outcome: CycleOutcome) => readonly Resource[] | Error | undefined,
  ): {
    readonly fn: () => Promise<readonly Resource[]>;
    readonly callCount: () => number;
  } {
    let callIndex = 0;
    const fn = vi.fn((): Promise<readonly Resource[]> => {
      const outcome = outcomes[Math.min(callIndex, outcomes.length - 1)];
      callIndex += 1;
      if (outcome === undefined) {
        return Promise.reject(
          new Error("stubConnectorPort misconfigured: no outcomes queued"),
        );
      }
      const picked = pick(outcome);
      if (picked === undefined) {
        return Promise.resolve([]);
      }
      return picked instanceof Error
        ? Promise.reject(picked)
        : Promise.resolve(picked);
    });
    return { fn, callCount: () => callIndex };
  }

  const deployments = makeListFn((outcome) => outcome.deployments);
  const replicaSets = makeListFn((outcome) => outcome.replicaSets);
  const pods = makeListFn((outcome) => outcome.pods);
  const services = makeListFn((outcome) => outcome.services);

  return {
    listDeployments: deployments.fn,
    listReplicaSets: replicaSets.fn,
    listPods: pods.fn,
    listServices: services.fn,
    // Reported against the Pod list specifically — the field every prior
    // M6-A test already asserted against, preserved for continuity.
    callCount: pods.callCount,
  };
}
