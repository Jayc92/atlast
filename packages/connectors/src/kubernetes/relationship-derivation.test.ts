import { describe, expect, it } from "vitest";
import {
  deriveEvidenceForCycle,
  type ObservedResourceCycle,
} from "./relationship-derivation.ts";
import type { ObservedDeployment } from "./observed-deployment.ts";
import type { ObservedPod } from "./observed-pod.ts";
import type { ObservedReplicaSet } from "./observed-replicaset.ts";
import type { ObservedService } from "./observed-service.ts";

const OBSERVED_AT = "2026-08-25T18:00:00.000Z";
const RECORDED_AT = "2026-08-25T18:00:01.000Z";
const NAMESPACE = "atlast-m6-pilot";

function deployment(name: string, uid: string): ObservedDeployment {
  return { namespace: NAMESPACE, name, uid };
}

function replicaSet(
  name: string,
  uid: string,
  ownerUid: string | null,
): ObservedReplicaSet {
  return {
    namespace: NAMESPACE,
    name,
    uid,
    controllerOwnerReference:
      ownerUid === null
        ? null
        : { kind: "Deployment", name: "checkout", uid: ownerUid },
  };
}

function pod(
  name: string,
  labels: Record<string, string>,
  ownerUid: string | null,
): ObservedPod {
  return {
    namespace: NAMESPACE,
    name,
    labels,
    controllerOwnerReference:
      ownerUid === null
        ? null
        : { kind: "ReplicaSet", name: "checkout-rs", uid: ownerUid },
  };
}

function relationshipEvidence(
  records: ReturnType<typeof deriveEvidenceForCycle>["evidenceRecords"],
) {
  return records.filter(
    (record) => record.observation.observationKind === "relationship",
  );
}

function entityEvidence(
  records: ReturnType<typeof deriveEvidenceForCycle>["evidenceRecords"],
) {
  return records.filter(
    (record) => record.observation.observationKind === "entity",
  );
}

describe("deriveEvidenceForCycle", () => {
  it("derives one entity Evidence record per observed Deployment/ReplicaSet/Pod/Service", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [deployment("checkout", "dep-uid")],
      replicaSets: [replicaSet("checkout-rs", "rs-uid", "dep-uid")],
      pods: [pod("checkout-1", { app: "checkout" }, "rs-uid")],
      services: [
        {
          namespace: NAMESPACE,
          name: "checkout-lb",
          selector: { app: "checkout" },
        },
      ],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    expect(entityEvidence(result.evidenceRecords)).toHaveLength(4);
  });

  it("Deployment -> ReplicaSet ownership: matched by controller UID, never by name", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [deployment("checkout", "dep-uid")],
      replicaSets: [replicaSet("checkout-rs", "rs-uid", "dep-uid")],
      pods: [],
      services: [],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    const owns = relationshipEvidence(result.evidenceRecords).filter(
      (record) =>
        record.observation.observationKind === "relationship" &&
        record.observation.relationshipType === "owns",
    );
    expect(owns).toHaveLength(1);
    const claim = owns[0]?.observation;
    if (claim?.observationKind !== "relationship") {
      throw new Error("expected a relationship observation");
    }
    expect(claim.sourceEntityIdentity.sourceNativeId).toBe(
      "atlast-m6-pilot-deployment-checkout",
    );
    expect(claim.targetEntityIdentity.sourceNativeId).toBe(
      "atlast-m6-pilot-replicaset-checkout-rs",
    );
  });

  it("ReplicaSet -> Pod ownership: matched by controller UID", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [],
      replicaSets: [replicaSet("checkout-rs", "rs-uid", null)],
      pods: [pod("checkout-1", { app: "checkout" }, "rs-uid")],
      services: [],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    const owns = relationshipEvidence(result.evidenceRecords);
    expect(owns).toHaveLength(1);
  });

  it("supports two legitimate simultaneous ReplicaSets owned by one Deployment — normal rollout multiplicity, neither dropped nor privileged", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [deployment("checkout", "dep-uid")],
      replicaSets: [
        replicaSet("checkout-old-rs", "old-rs-uid", "dep-uid"),
        replicaSet("checkout-new-rs", "new-rs-uid", "dep-uid"),
      ],
      pods: [],
      services: [],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    const owns = relationshipEvidence(result.evidenceRecords).filter(
      (record) =>
        record.observation.observationKind === "relationship" &&
        record.observation.relationshipType === "owns",
    );
    expect(owns).toHaveLength(2);
  });

  it("supports multiple Pods owned by one ReplicaSet", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [],
      replicaSets: [replicaSet("checkout-rs", "rs-uid", null)],
      pods: [
        pod("checkout-1", { app: "checkout" }, "rs-uid"),
        pod("checkout-2", { app: "checkout" }, "rs-uid"),
      ],
      services: [],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    expect(relationshipEvidence(result.evidenceRecords)).toHaveLength(2);
  });

  it("an ownerless Pod (known no controller owner) produces no ownership relationship — a real, valid state, never invented", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [],
      replicaSets: [replicaSet("checkout-rs", "rs-uid", null)],
      pods: [pod("bare-pod", {}, null)],
      services: [],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    expect(relationshipEvidence(result.evidenceRecords)).toHaveLength(0);
    expect(entityEvidence(result.evidenceRecords)).toHaveLength(2);
  });

  it("same-name/different-UID does not falsely match an owner", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [deployment("checkout", "real-dep-uid")],
      replicaSets: [replicaSet("checkout-rs", "rs-uid", "impersonated-uid")],
      pods: [],
      services: [],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    expect(relationshipEvidence(result.evidenceRecords)).toHaveLength(0);
  });

  it("an owner UID absent from this cycle's own observed set produces no dangling edge and does not throw", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [],
      replicaSets: [
        replicaSet("checkout-rs", "rs-uid", "never-observed-dep-uid"),
      ],
      pods: [],
      services: [],
    };
    expect(() =>
      deriveEvidenceForCycle({
        cycle,
        observedAt: OBSERVED_AT,
        recordedAt: RECORDED_AT,
        firstRecordedSequence: 1,
      }),
    ).not.toThrow();
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    expect(relationshipEvidence(result.evidenceRecords)).toHaveLength(0);
  });

  it("Service one match, multiple matches, and known-zero all derive correctly within one cycle", () => {
    const matchingPodA = pod("checkout-1", { app: "checkout" }, null);
    const matchingPodB = pod("checkout-2", { app: "checkout" }, null);
    const unrelatedPod = pod("unrelated", { app: "unrelated" }, null);
    const services: readonly ObservedService[] = [
      {
        namespace: NAMESPACE,
        name: "checkout-lb",
        selector: { app: "checkout" },
      },
      {
        namespace: NAMESPACE,
        name: "unused-service",
        selector: { app: "nothing-matches-this" },
      },
    ];
    const cycle: ObservedResourceCycle = {
      deployments: [],
      replicaSets: [],
      pods: [matchingPodA, matchingPodB, unrelatedPod],
      services,
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    const selects = relationshipEvidence(result.evidenceRecords).filter(
      (record) =>
        record.observation.observationKind === "relationship" &&
        record.observation.relationshipType === "selects",
    );
    expect(selects).toHaveLength(2); // checkout-lb matches both checkout Pods

    const serviceEvidence = entityEvidence(result.evidenceRecords).filter(
      (record) =>
        record.observation.observationKind === "entity" &&
        record.observation.entityType === "kubernetes-service",
    );
    const unusedServiceEvidence = serviceEvidence.find((record) =>
      record.sourceScopedIdentity.sourceNativeId.includes("unused-service"),
    );
    expect(unusedServiceEvidence?.detail).toMatchObject({
      evaluation: {
        hasSelector: true,
        matchedPodCount: 0,
        evaluatedAgainstCompletePodSet: true,
      },
    });
  });

  it("a selectorless Service derives no relationship and reports hasSelector: false", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [],
      replicaSets: [],
      pods: [pod("checkout-1", { app: "checkout" }, null)],
      services: [
        {
          namespace: NAMESPACE,
          name: "external-or-selectorless",
          selector: null,
        },
      ],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    expect(relationshipEvidence(result.evidenceRecords)).toHaveLength(0);
    const serviceEvidence = entityEvidence(result.evidenceRecords).find(
      (record) =>
        record.observation.observationKind === "entity" &&
        record.observation.entityType === "kubernetes-service",
    );
    expect(serviceEvidence?.detail).toMatchObject({
      evaluation: { hasSelector: false },
    });
  });

  it("never emits a relationship whose endpoint entity was not also derived from this same cycle — no referential-integrity violation is even possible", () => {
    // Deliberately does NOT include the owning Deployment in this cycle at
    // all — proves the ReplicaSet's dangling owner reference produces no
    // edge, so the graph-model's referential-integrity check
    // (packages/graph-model/src/snapshot-construction.ts) can never fire
    // against connector-derived relationships.
    const cycle: ObservedResourceCycle = {
      deployments: [],
      replicaSets: [replicaSet("checkout-rs", "rs-uid", "some-deployment-uid")],
      pods: [pod("checkout-1", { app: "checkout" }, "rs-uid")],
      services: [],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 1,
    });
    const owns = relationshipEvidence(result.evidenceRecords).filter(
      (record) =>
        record.observation.observationKind === "relationship" &&
        record.observation.relationshipType === "owns",
    );
    // Only the ReplicaSet -> Pod edge, never a Deployment -> ReplicaSet edge
    // (its owner was never observed this cycle).
    expect(owns).toHaveLength(1);
    const claim = owns[0]?.observation;
    if (claim?.observationKind !== "relationship") {
      throw new Error("expected a relationship observation");
    }
    expect(claim.targetEntityIdentity.sourceNativeId).toBe(
      "atlast-m6-pilot-pod-checkout-1",
    );
  });

  it("allocates strictly increasing, gap-free recordedSequence values across every derived record", () => {
    const cycle: ObservedResourceCycle = {
      deployments: [deployment("checkout", "dep-uid")],
      replicaSets: [replicaSet("checkout-rs", "rs-uid", "dep-uid")],
      pods: [pod("checkout-1", { app: "checkout" }, "rs-uid")],
      services: [
        {
          namespace: NAMESPACE,
          name: "checkout-lb",
          selector: { app: "checkout" },
        },
      ],
    };
    const result = deriveEvidenceForCycle({
      cycle,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
      firstRecordedSequence: 5,
    });
    const sequences = result.evidenceRecords.map(
      (record) => record.recordedSequence,
    );
    expect(sequences).toStrictEqual(
      Array.from({ length: sequences.length }, (_, index) => index + 5),
    );
    expect(result.nextRecordedSequence).toBe(5 + result.evidenceRecords.length);
  });
});
