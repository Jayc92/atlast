/**
 * Wraps a real `TopologyGraphStore` and counts calls to each of its seven
 * methods, so a test can assert the impact route composes exactly one
 * bounded `traverse` call and performs no additional repository read
 * (ADR-0033 § 2's "no additional repository read" obligation) — proven
 * against the real in-memory store's actual behavior, never a stub that
 * could pass vacuously.
 */
import type { TopologyGraphStore } from "@atlast/shared";

export interface CallCountingTopologyGraphStore extends TopologyGraphStore {
  readonly callCounts: Readonly<Record<keyof TopologyGraphStore, number>>;
}

export function createCallCountingTopologyGraphStore(
  delegate: TopologyGraphStore,
): CallCountingTopologyGraphStore {
  const callCounts: Record<keyof TopologyGraphStore, number> = {
    getSubject: 0,
    getAssertionRevision: 0,
    listEntities: 0,
    searchSubjects: 0,
    traverse: 0,
    getEvidenceChain: 0,
    getSnapshotSummary: 0,
  };

  function countedDelegate<MethodName extends keyof TopologyGraphStore>(
    methodName: MethodName,
  ): TopologyGraphStore[MethodName] {
    return ((...args: unknown[]) => {
      callCounts[methodName] += 1;
      // Calls delegate[methodName](...) directly at the call site (never
      // via an extracted reference) so `this` still binds to `delegate` —
      // the real in-memory store's methods read internal instance state.
      return (delegate[methodName] as (...methodArgs: unknown[]) => unknown)(
        ...args,
      );
    }) as TopologyGraphStore[MethodName];
  }

  return {
    callCounts,
    getSubject: countedDelegate("getSubject"),
    getAssertionRevision: countedDelegate("getAssertionRevision"),
    listEntities: countedDelegate("listEntities"),
    searchSubjects: countedDelegate("searchSubjects"),
    traverse: countedDelegate("traverse"),
    getEvidenceChain: countedDelegate("getEvidenceChain"),
    getSnapshotSummary: countedDelegate("getSnapshotSummary"),
  };
}
