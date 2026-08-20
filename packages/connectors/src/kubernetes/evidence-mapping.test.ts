import { describe, expect, it } from "vitest";
import { mapObservedPodToEvidence } from "./evidence-mapping.ts";

const OBSERVED_AT = "2026-08-20T18:00:00.000Z";
const RECORDED_AT = "2026-08-20T18:00:01.000Z";

describe("mapObservedPodToEvidence", () => {
  it("maps an observed Pod into a valid Entity-observation Evidence record", () => {
    const evidence = mapObservedPodToEvidence({
      pod: { namespace: "atlast-m5", name: "atlast-m5-boot-probe" },
      recordedSequence: 1,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });

    expect(evidence).toEqual({
      schemaVersion: "atlast-domain-v1",
      identifier: "atlast:evidence:kubernetes/atlast-m5/atlast-m5-boot-probe/1",
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      recordedSequence: 1,
      sourceScopedIdentity: {
        source: "kubernetes",
        sourceNativeId: "atlast-m5-atlast-m5-boot-probe",
      },
      observation: {
        observationKind: "entity",
        entityType: "kubernetes-pod",
      },
      detail: {
        namespace: "atlast-m5",
        name: "atlast-m5-boot-probe",
      },
    });
  });

  it("produces a distinct identifier for a distinct recordedSequence, never reusing one", () => {
    const pod = { namespace: "atlast-m5", name: "same-pod" };
    const first = mapObservedPodToEvidence({
      pod,
      recordedSequence: 1,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });
    const second = mapObservedPodToEvidence({
      pod,
      recordedSequence: 2,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });
    expect(first.identifier).not.toBe(second.identifier);
  });

  it("produces a sourceNativeId matching the accepted m1-v1 identity grammar — the M5-A identity case study regression (docs/m5-plan.md § 4.2)", () => {
    // Mirrors packages/graph-model/src/identity-normalization.ts's
    // LOWERCASE_ASCII_KEY_PATTERN (ADR-0022 § 2) as a literal regex here,
    // deliberately, rather than importing @atlast/graph-model — this
    // package depends only on @atlast/shared (ADR-0036 § 2). A real
    // Kubernetes Pod's namespace/name compound identity, if slash-joined,
    // is rejected outright by that grammar (reproduced directly against
    // the real disposable cluster before this connector hyphen-joined it
    // instead); this test proves the connector's own output never
    // regresses back to a slash.
    const LOWERCASE_ASCII_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const evidence = mapObservedPodToEvidence({
      pod: { namespace: "atlast-m5", name: "atlast-m5-live-pod" },
      recordedSequence: 1,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });
    expect(evidence.sourceScopedIdentity.sourceNativeId).not.toContain("/");
    expect(evidence.sourceScopedIdentity.sourceNativeId).toMatch(
      LOWERCASE_ASCII_KEY_PATTERN,
    );
  });

  it("rejects a recordedSequence the shared Evidence schema itself rejects, rather than swallowing it", () => {
    expect(() =>
      mapObservedPodToEvidence({
        pod: { namespace: "atlast-m5", name: "same-pod" },
        recordedSequence: 0,
        observedAt: OBSERVED_AT,
        recordedAt: RECORDED_AT,
      }),
    ).toThrow();
  });
});
