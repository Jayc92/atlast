/**
 * Deterministic stub `EvidenceStore`/`TopologyGraphStore` builders for
 * error-path integration tests that call `buildApplication` directly with
 * stubs (ADR-0024 § 12: "objects satisfying the `EvidenceStore`/
 * `TopologyGraphStore` interfaces without being the real in-memory
 * implementations") — the mechanism the ADR names for provoking response-
 * schema violations and other conditions the real in-memory stores cannot
 * be coerced into producing.
 *
 * Every method starts unimplemented (throws loudly if called unexpectedly);
 * a test overrides only the one method it exercises.
 */
import type {
  EvidenceStore,
  OperationalOverlayStore,
  TopologyGraphStore,
} from "@atlast/shared";

function unimplemented(methodName: string): () => never {
  return () => {
    throw new Error(`Stub method not implemented for this test: ${methodName}`);
  };
}

export function createStubEvidenceStore(
  overrides: Partial<EvidenceStore> = {},
): EvidenceStore {
  return {
    appendEvidence: unimplemented("appendEvidence"),
    getEvidenceByIdentifier: unimplemented("getEvidenceByIdentifier"),
    getCurrentWatermark: unimplemented("getCurrentWatermark"),
    listEvidence: unimplemented("listEvidence"),
    ...overrides,
  };
}

export function createStubTopologyGraphStore(
  overrides: Partial<TopologyGraphStore> = {},
): TopologyGraphStore {
  return {
    getSubject: unimplemented("getSubject"),
    getAssertionRevision: unimplemented("getAssertionRevision"),
    listEntities: unimplemented("listEntities"),
    searchSubjects: unimplemented("searchSubjects"),
    traverse: unimplemented("traverse"),
    getEvidenceChain: unimplemented("getEvidenceChain"),
    getSnapshotSummary: unimplemented("getSnapshotSummary"),
    ...overrides,
  };
}

export function createStubOperationalOverlayStore(
  overrides: Partial<OperationalOverlayStore> = {},
): OperationalOverlayStore {
  return {
    getFrameByIdentifier: unimplemented("getFrameByIdentifier"),
    getLatestFrameAtOrBefore: unimplemented("getLatestFrameAtOrBefore"),
    ...overrides,
  };
}
