/**
 * ADR-0043 corrective-continuation regression suite. Proves, against the
 * real Kubernetes connector, the real `m1-v1` normalizer/reconciliation
 * engine, and the real API/impact routes (never a mock of any of them),
 * that the newly proven cross-kind identity collision (a Deployment and a
 * Service sharing/normalizing to the same name silently merging into one
 * Atlast Entity, `docs/adr/0043-m6-kubernetes-cross-kind-source-native-identity.md`)
 * cannot recur, and that every invariant ADR-0043 requires still holds:
 * distinct cross-kind identity, preserved same-kind decorative
 * equivalence, correct relationship endpoints, correct impact hop
 * structure, and UID-driven ownership matching without UID becoming
 * canonical identity.
 */
import { describe, expect, it } from "vitest";
import {
  subjectDetailResultSchema,
  entityPageSchema,
  impactResultEnvelopeSchema,
  traversalResultSchema,
} from "@atlast/shared";
import {
  mapObservedDeploymentToEvidence,
  mapObservedPodToEvidence,
  mapObservedReplicaSetToEvidence,
  mapObservedServiceToEvidence,
  type ObservedDeployment,
  type ObservedPod,
  type ObservedReplicaSet,
  type ObservedService,
} from "@atlast/connectors";
import {
  M1_V1_DERIVATION_POLICY,
  normalizeIdentityKey,
} from "@atlast/graph-model";
import { startConnectorDatasetMode } from "./connector-mode.ts";
import { parseJsonBody } from "./test-support/parse-response.ts";
import { stubConnectorPort } from "./test-support/stub-connector-port.ts";

const FIXED_TEST_CLOCK = () => "2026-08-26T00:00:00.000Z";
const NAMESPACE = "atlast-m6-b-regression";
const BASE_OPTIONS = {
  kubeconfigPath: "/tmp/test-kubeconfig.yaml",
  contextName: "kind-atlast-m6-b-regression",
  namespace: NAMESPACE,
  clock: FIXED_TEST_CLOCK,
};

const SEQUENCE_ZERO = 1;
const OBSERVED_AT = "2026-08-26T00:00:00.000Z";
const RECORDED_AT = "2026-08-26T00:00:00.000Z";

/** The real, unstubbed `m1-v1` normalizer, called exactly as the reconciliation engine calls it. */
function normalized(sourceNativeId: string): string {
  return normalizeIdentityKey(
    sourceNativeId,
    M1_V1_DERIVATION_POLICY,
    "atlast:evidence:kubernetes-cross-kind-identity-regression-test/1",
  );
}

describe("ADR-0043 § 2 — cross-kind normalizer collision table (real m1-v1 normalizer, no cross-kind exceptions)", () => {
  const deployment = (namespace: string, name: string): ObservedDeployment => ({
    namespace,
    name,
    uid: "irrelevant-to-identity-uid",
  });
  const service = (namespace: string, name: string): ObservedService => ({
    namespace,
    name,
    selector: null,
  });

  const requiredPairs: ReadonlyArray<{
    readonly label: string;
    readonly deploymentName: string;
    readonly serviceName: string;
  }> = [
    { label: "checkout", deploymentName: "checkout", serviceName: "checkout" },
    {
      label: "checkout / checkout-service",
      deploymentName: "checkout",
      serviceName: "checkout-service",
    },
    {
      label: "checkout / checkout-svc",
      deploymentName: "checkout",
      serviceName: "checkout-svc",
    },
    {
      label: "payments / payments-service",
      deploymentName: "payments",
      serviceName: "payments-service",
    },
    {
      label: "api / api-service",
      deploymentName: "api",
      serviceName: "api-service",
    },
    {
      label: "orders / orders-svc",
      deploymentName: "orders",
      serviceName: "orders-svc",
    },
  ];

  it.each(requiredPairs)(
    "Deployment $deploymentName and Service $serviceName never collide ($label)",
    ({ deploymentName, serviceName }) => {
      const deploymentEvidence = mapObservedDeploymentToEvidence({
        deployment: deployment(NAMESPACE, deploymentName),
        recordedSequence: SEQUENCE_ZERO,
        observedAt: OBSERVED_AT,
        recordedAt: RECORDED_AT,
      });
      const serviceEvidence = mapObservedServiceToEvidence({
        service: service(NAMESPACE, serviceName),
        evaluationState: {
          hasSelector: false,
          matchedPodCount: 0,
          evaluatedAgainstCompletePodSet: false,
        },
        recordedSequence: SEQUENCE_ZERO,
        observedAt: OBSERVED_AT,
        recordedAt: RECORDED_AT,
      });

      expect(
        normalized(deploymentEvidence.sourceScopedIdentity.sourceNativeId),
      ).not.toBe(
        normalized(serviceEvidence.sourceScopedIdentity.sourceNativeId),
      );
    },
  );

  it("the four-way literal-name case: Deployment, ReplicaSet, Pod, and Service all named 'checkout' remain four distinct identities", () => {
    const deploymentEvidence = mapObservedDeploymentToEvidence({
      deployment: deployment(NAMESPACE, "checkout"),
      recordedSequence: SEQUENCE_ZERO,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });
    const replicaSetEvidence = mapObservedReplicaSetToEvidence({
      replicaSet: {
        namespace: NAMESPACE,
        name: "checkout",
        uid: "irrelevant-to-identity-uid",
        controllerOwnerReference: null,
      },
      recordedSequence: SEQUENCE_ZERO,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });
    const podEvidence = mapObservedPodToEvidence({
      pod: {
        namespace: NAMESPACE,
        name: "checkout",
        labels: {},
        controllerOwnerReference: null,
      },
      recordedSequence: SEQUENCE_ZERO,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });
    const serviceEvidence = mapObservedServiceToEvidence({
      service: service(NAMESPACE, "checkout"),
      evaluationState: {
        hasSelector: false,
        matchedPodCount: 0,
        evaluatedAgainstCompletePodSet: false,
      },
      recordedSequence: SEQUENCE_ZERO,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });

    const normalizedKeys = [
      deploymentEvidence,
      replicaSetEvidence,
      podEvidence,
      serviceEvidence,
    ].map((evidence) =>
      normalized(evidence.sourceScopedIdentity.sourceNativeId),
    );

    expect(new Set(normalizedKeys).size).toBe(4);
  });

  it("preserves the accepted same-kind decorative-affix residual (ADR-0043 § 3) — this is NOT a defect and must NOT be fixed here", () => {
    const bare = mapObservedServiceToEvidence({
      service: service(NAMESPACE, "checkout"),
      evaluationState: {
        hasSelector: false,
        matchedPodCount: 0,
        evaluatedAgainstCompletePodSet: false,
      },
      recordedSequence: SEQUENCE_ZERO,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });
    const withServiceSuffix = mapObservedServiceToEvidence({
      service: service(NAMESPACE, "checkout-service"),
      evaluationState: {
        hasSelector: false,
        matchedPodCount: 0,
        evaluatedAgainstCompletePodSet: false,
      },
      recordedSequence: SEQUENCE_ZERO,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });
    const withSvcSuffix = mapObservedServiceToEvidence({
      service: service(NAMESPACE, "checkout-svc"),
      evaluationState: {
        hasSelector: false,
        matchedPodCount: 0,
        evaluatedAgainstCompletePodSet: false,
      },
      recordedSequence: SEQUENCE_ZERO,
      observedAt: OBSERVED_AT,
      recordedAt: RECORDED_AT,
    });

    const keys = [bare, withServiceSuffix, withSvcSuffix].map((evidence) =>
      normalized(evidence.sourceScopedIdentity.sourceNativeId),
    );
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toBe(keys[2]);
  });
});

describe("ADR-0043 corrective continuation — full-stack reconciliation, relationship, and impact regression", () => {
  const DEPLOYMENT: ObservedDeployment = {
    namespace: NAMESPACE,
    name: "checkout",
    uid: "dep-uid-1",
  };
  const REPLICASET: ObservedReplicaSet = {
    namespace: NAMESPACE,
    name: "checkout-abc123",
    uid: "rs-uid-1",
    controllerOwnerReference: {
      kind: "Deployment",
      name: "checkout",
      uid: "dep-uid-1",
    },
  };
  const POD_A: ObservedPod = {
    namespace: NAMESPACE,
    name: "checkout-abc123-aaaa",
    labels: { app: "checkout" },
    controllerOwnerReference: {
      kind: "ReplicaSet",
      name: "checkout-abc123",
      uid: "rs-uid-1",
    },
  };
  const POD_B: ObservedPod = {
    namespace: NAMESPACE,
    name: "checkout-abc123-bbbb",
    labels: { app: "checkout" },
    controllerOwnerReference: {
      kind: "ReplicaSet",
      name: "checkout-abc123",
      uid: "rs-uid-1",
    },
  };
  // The ordinary Kubernetes naming convention (ADR-0043 § 1) that ADR-0043
  // exists specifically to stop from silently colliding with the
  // Deployment above — restored deliberately, per the corrective
  // continuation's explicit instruction, rather than avoided by naming.
  const SERVICE: ObservedService = {
    namespace: NAMESPACE,
    name: "checkout-service",
    selector: { app: "checkout" },
  };

  const DEPLOYMENT_ENTITY_ID = `atlast:entity:${NAMESPACE}-deployment-checkout`;
  const REPLICASET_ENTITY_ID = `atlast:entity:${NAMESPACE}-replicaset-checkout-abc123`;
  const POD_A_ENTITY_ID = `atlast:entity:${NAMESPACE}-pod-checkout-abc123-aaaa`;
  const POD_B_ENTITY_ID = `atlast:entity:${NAMESPACE}-pod-checkout-abc123-bbbb`;
  // The trailing "-service" token in the Service's own name is itself
  // stripped by the frozen m1-v1 suffix list — the accepted, disclosed
  // same-kind residual (ADR-0043 § 3), not a defect: this Service's
  // identity is indistinguishable from a bare Service named "checkout".
  // What ADR-0043 fixes is that it remains distinct from the Deployment
  // below, which it does.
  const SERVICE_ENTITY_ID = `atlast:entity:${NAMESPACE}-service-checkout`;

  it("Deployment/checkout and Service/checkout-service remain two distinct, correctly typed Entities — the exact defect ADR-0043 fixes", async () => {
    const connector = stubConnectorPort([
      {},
      {
        deployments: [DEPLOYMENT],
        replicaSets: [REPLICASET],
        pods: [POD_A, POD_B],
        services: [SERVICE],
      },
    ]);
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
      const identifiers = entities.map((entity) => entity.subject.identifier);
      expect(new Set(identifiers).size).toBe(5);
      expect(identifiers).toEqual(
        expect.arrayContaining([
          DEPLOYMENT_ENTITY_ID,
          REPLICASET_ENTITY_ID,
          POD_A_ENTITY_ID,
          POD_B_ENTITY_ID,
          SERVICE_ENTITY_ID,
        ]),
      );
      expect(DEPLOYMENT_ENTITY_ID).not.toBe(SERVICE_ENTITY_ID);

      const deploymentDetail = parseJsonBody(
        await application.inject({
          method: "GET",
          url: `/api/v1/entities/${encodeURIComponent(DEPLOYMENT_ENTITY_ID)}`,
        }),
        subjectDetailResultSchema,
      );
      expect(deploymentDetail.data.assertions[0]?.revision.claim).toEqual(
        expect.objectContaining({
          claimKind: "entity",
          entityType: "kubernetes-deployment",
        }),
      );
      // Not silently excluded: exactly the Deployment's own one Evidence
      // record supports it — never merged with, or overwritten by, the
      // Service's claim (the pre-ADR-0043 defect this proves fixed).
      expect(
        deploymentDetail.data.assertions[0]?.revision.provenance,
      ).toHaveLength(1);

      const serviceDetail = parseJsonBody(
        await application.inject({
          method: "GET",
          url: `/api/v1/entities/${encodeURIComponent(SERVICE_ENTITY_ID)}`,
        }),
        subjectDetailResultSchema,
      );
      expect(serviceDetail.data.assertions[0]?.revision.claim).toEqual(
        expect.objectContaining({
          claimKind: "entity",
          entityType: "kubernetes-service",
        }),
      );
    } finally {
      stopPolling();
      await application.close();
    }
  });

  it("Deployment owns ReplicaSet, Service selects both Pods, and Service does NOT own the ReplicaSet — no relationship endpoint uses the old bare identity shape", async () => {
    const connector = stubConnectorPort([
      {},
      {
        deployments: [DEPLOYMENT],
        replicaSets: [REPLICASET],
        pods: [POD_A, POD_B],
        services: [SERVICE],
      },
    ]);
    const { application, pollOnce, stopPolling } =
      await startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
        connector,
      );
    try {
      await pollOnce();

      const fromDeployment = parseJsonBody(
        await application.inject({
          method: "GET",
          url: `/api/v1/entities/${encodeURIComponent(DEPLOYMENT_ENTITY_ID)}/traversal?direction=downstream&depth=1`,
        }),
        traversalResultSchema,
      );
      const deploymentRelationships = fromDeployment.items
        .filter((item) => item.subject.subjectKind === "relationship")
        .map((item) => item.assertions[0]?.revision.claim);
      expect(deploymentRelationships).toEqual([
        expect.objectContaining({
          claimKind: "relationship",
          relationshipType: "owns",
          sourceEntityIdentifier: DEPLOYMENT_ENTITY_ID,
          targetEntityIdentifier: REPLICASET_ENTITY_ID,
        }),
      ]);
      // The Deployment's own downstream traversal never reaches the
      // Service at all — no edge from Deployment to Service exists.
      expect(
        fromDeployment.items.map((item) => item.subject.identifier),
      ).not.toContain(SERVICE_ENTITY_ID);

      const fromService = parseJsonBody(
        await application.inject({
          method: "GET",
          url: `/api/v1/entities/${encodeURIComponent(SERVICE_ENTITY_ID)}/traversal?direction=downstream&depth=1`,
        }),
        traversalResultSchema,
      );
      const serviceRelationships = fromService.items
        .filter((item) => item.subject.subjectKind === "relationship")
        .map((item) => item.assertions[0]?.revision.claim);
      expect(serviceRelationships).toHaveLength(2);
      for (const claim of serviceRelationships) {
        expect(claim).toEqual(
          expect.objectContaining({
            claimKind: "relationship",
            relationshipType: "selects",
            sourceEntityIdentifier: SERVICE_ENTITY_ID,
          }),
        );
      }
      const selectedTargets = serviceRelationships.map(
        (claim) =>
          claim &&
          "targetEntityIdentifier" in claim &&
          claim.targetEntityIdentifier,
      );
      expect(selectedTargets).toEqual(
        expect.arrayContaining([POD_A_ENTITY_ID, POD_B_ENTITY_ID]),
      );
      // Service never owns the ReplicaSet — only Deployment does.
      expect(
        serviceRelationships.some(
          (claim) =>
            claim !== undefined &&
            "relationshipType" in claim &&
            claim.relationshipType === "owns",
        ),
      ).toBe(false);
    } finally {
      stopPolling();
      await application.close();
    }
  });

  it("Deployment removal impact ranks ReplicaSet at 1 hop and both Pods at 2 hops — Service selector edges do not flatten or contaminate the path", async () => {
    const connector = stubConnectorPort([
      {},
      {
        deployments: [DEPLOYMENT],
        replicaSets: [REPLICASET],
        pods: [POD_A, POD_B],
        services: [SERVICE],
      },
    ]);
    const { application, pollOnce, stopPolling } =
      await startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
        connector,
      );
    try {
      await pollOnce();

      const impactResponse = await application.inject({
        method: "GET",
        url: `/api/v1/entities/${encodeURIComponent(DEPLOYMENT_ENTITY_ID)}/impact?changeType=removal&direction=downstream&depth=3`,
      });
      expect(impactResponse.statusCode).toBe(200);
      const impact = parseJsonBody(impactResponse, impactResultEnvelopeSchema);

      const byEntity = new Map(
        impact.data.results.map((result) => [
          result.entityIdentifier,
          result.pathEdgeCount,
        ]),
      );
      expect(byEntity.get(REPLICASET_ENTITY_ID)).toBe(1);
      expect(byEntity.get(POD_A_ENTITY_ID)).toBe(2);
      expect(byEntity.get(POD_B_ENTITY_ID)).toBe(2);
      // The Service is unreachable from the Deployment (no edge exists),
      // so it can never appear in the Deployment's own impact ranking.
      expect(byEntity.has(SERVICE_ENTITY_ID)).toBe(false);

      // The Service itself remains independently traversable to the Pods
      // it selects — its own edges are real, just not reachable from here.
      const serviceTraversal = parseJsonBody(
        await application.inject({
          method: "GET",
          url: `/api/v1/entities/${encodeURIComponent(SERVICE_ENTITY_ID)}/traversal?direction=downstream&depth=1`,
        }),
        traversalResultSchema,
      );
      expect(
        serviceTraversal.items.map((item) => item.subject.identifier),
      ).toEqual(expect.arrayContaining([POD_A_ENTITY_ID, POD_B_ENTITY_ID]));
    } finally {
      stopPolling();
      await application.close();
    }
  });

  it("preserves ADR-0039's name-based identity continuity: the same namespace/name maps to the same Entity across a delete/recreate UID change, while UID still drives ownership matching, not identity", async () => {
    const recreatedDeployment: ObservedDeployment = {
      namespace: NAMESPACE,
      name: "checkout",
      uid: "dep-uid-2-after-recreate",
    };
    // A ReplicaSet whose owner reference cites the OLD, now-stale UID must
    // not match the recreated Deployment by name alone — UID is the only
    // thing that may resolve ownership (ADR-0039 § 5, unchanged by
    // ADR-0043).
    const staleOwnedReplicaSet: ObservedReplicaSet = {
      namespace: NAMESPACE,
      name: "checkout-stale",
      uid: "rs-uid-stale",
      controllerOwnerReference: {
        kind: "Deployment",
        name: "checkout",
        uid: "dep-uid-1",
      },
    };
    const freshlyOwnedReplicaSet: ObservedReplicaSet = {
      namespace: NAMESPACE,
      name: "checkout-fresh",
      uid: "rs-uid-fresh",
      controllerOwnerReference: {
        kind: "Deployment",
        name: "checkout",
        uid: "dep-uid-2-after-recreate",
      },
    };

    const connector = stubConnectorPort([
      {},
      { deployments: [DEPLOYMENT] },
      {
        deployments: [recreatedDeployment],
        replicaSets: [staleOwnedReplicaSet, freshlyOwnedReplicaSet],
      },
    ]);
    const { application, pollOnce, stopPolling } =
      await startConnectorDatasetMode(
        { ...BASE_OPTIONS, pollIntervalMs: 60_000 },
        connector,
      );
    try {
      await pollOnce();
      const beforeRecreate = parseJsonBody(
        await application.inject({
          method: "GET",
          url: `/api/v1/entities/${encodeURIComponent(DEPLOYMENT_ENTITY_ID)}`,
        }),
        subjectDetailResultSchema,
      );
      expect(beforeRecreate.data.subject.identifier).toBe(DEPLOYMENT_ENTITY_ID);

      await pollOnce();
      const afterRecreate = parseJsonBody(
        await application.inject({
          method: "GET",
          url: `/api/v1/entities/${encodeURIComponent(DEPLOYMENT_ENTITY_ID)}`,
        }),
        subjectDetailResultSchema,
      );
      // Same Entity identity — a UID change alone never changes identity.
      expect(afterRecreate.data.subject.identifier).toBe(DEPLOYMENT_ENTITY_ID);

      const traversal = parseJsonBody(
        await application.inject({
          method: "GET",
          url: `/api/v1/entities/${encodeURIComponent(DEPLOYMENT_ENTITY_ID)}/traversal?direction=downstream&depth=1`,
        }),
        traversalResultSchema,
      );
      const ownedTargets = traversal.items
        .filter((item) => item.subject.subjectKind === "relationship")
        .map((item) => item.assertions[0]?.revision.claim)
        .filter(
          (claim) =>
            claim !== undefined &&
            claim.claimKind === "relationship" &&
            claim.relationshipType === "owns",
        )
        .map((claim) =>
          claim?.claimKind === "relationship"
            ? claim.targetEntityIdentifier
            : undefined,
        )
        .filter(
          (targetEntityIdentifier) => targetEntityIdentifier !== undefined,
        );

      // Only the freshly-UID-matched ReplicaSet is owned — the
      // stale-UID one never resolves, proving UID (not name) drives
      // ownership matching, exactly as before ADR-0043.
      expect(ownedTargets).toEqual([
        `atlast:entity:${NAMESPACE}-replicaset-checkout-fresh`,
      ]);
      expect(ownedTargets).not.toContain(
        `atlast:entity:${NAMESPACE}-replicaset-checkout-stale`,
      );
    } finally {
      stopPolling();
      await application.close();
    }
  });
});
