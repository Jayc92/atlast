import { describe, expect, it } from "vitest";
import type { HealthContextResult, HealthProjection } from "@atlast/shared";
import {
  buildEntityReadResult,
  buildTraversalResult,
  FIXTURE_IDENTITY,
} from "./test-support/fixtures.ts";
import {
  buildHealthOverlayView,
  describeProjection,
  healthContextMatchesBaseTraversal,
  isEmphasized,
  presentationForProjection,
  UNREPORTED_PRESENTATION,
} from "./health-overlay-projection.ts";

const OVERLAY_META = {
  schemaVersion: "atlast-overlay-v1" as const,
  frameIdentifier: "atlast:overlay-frame:demo-company/active-conditions",
  effectiveAt: "2026-08-01T00:00:00.000Z",
};

function buildResult(
  projections: readonly HealthProjection[],
  overrides: {
    readonly originEntityIdentifier?: string;
    readonly items?: HealthContextResult["data"]["items"];
    readonly gaps?: HealthContextResult["data"]["gaps"];
    readonly truncated?: boolean;
  } = {},
): HealthContextResult {
  return {
    data: {
      originEntityIdentifier:
        overrides.originEntityIdentifier ?? "atlast:entity:checkout",
      items: overrides.items ?? [],
      projections: [...projections],
      gaps: overrides.gaps ?? [],
    },
    traversal: {
      truncated: overrides.truncated ?? false,
      subjectCount: overrides.items?.length ?? 0,
    },
    meta: {
      resolvedIdentity: FIXTURE_IDENTITY,
      schemaVersion: "atlast-domain-v1",
      overlay: OVERLAY_META,
    },
  };
}

describe("presentationForProjection", () => {
  it("presents unreported entities with a stable non-color label distinct from any state", () => {
    const projection: HealthProjection = {
      reportStatus: "unreported",
      entityIdentifier: "atlast:entity:checkout",
      contextCompleteness: "complete-within-requested-bounds",
    };
    expect(presentationForProjection(projection)).toBe(UNREPORTED_PRESENTATION);
    expect(UNREPORTED_PRESENTATION.label).toBe("No overlay report");
  });

  it("presents every direct condition with a distinct label and glyph", () => {
    const projections: readonly HealthProjection[] = [
      {
        reportStatus: "reported",
        entityIdentifier: "atlast:entity:x",
        directCondition: "healthy",
        effectiveState: "healthy",
        contextCompleteness: "complete-within-requested-bounds",
      },
      {
        reportStatus: "reported",
        entityIdentifier: "atlast:entity:x",
        directCondition: "degraded",
        effectiveState: "degraded",
        contextCompleteness: "complete-within-requested-bounds",
      },
      {
        reportStatus: "reported",
        entityIdentifier: "atlast:entity:x",
        directCondition: "down",
        effectiveState: "down",
        contextCompleteness: "complete-within-requested-bounds",
      },
      {
        reportStatus: "reported",
        entityIdentifier: "atlast:entity:x",
        directCondition: "disconnected",
        effectiveState: "disconnected",
        contextCompleteness: "complete-within-requested-bounds",
      },
      {
        reportStatus: "reported",
        entityIdentifier: "atlast:entity:x",
        directCondition: "expiring-certificate",
        effectiveState: "expiring-certificate",
        contextCompleteness: "complete-within-requested-bounds",
      },
    ];
    const seenLabels = new Set<string>();
    const seenGlyphs = new Set<string>();
    for (const projection of projections) {
      const presentation = presentationForProjection(projection);
      seenLabels.add(presentation.label);
      seenGlyphs.add(presentation.glyph);
    }
    expect(seenLabels.size).toBe(projections.length);
    expect(seenGlyphs.size).toBe(projections.length);
  });

  it("presents latent downstream risk distinctly from its healthy direct condition", () => {
    const latent: HealthProjection = {
      reportStatus: "reported",
      entityIdentifier: "atlast:entity:checkout",
      directCondition: "healthy",
      effectiveState: "latent-downstream-risk",
      contextCompleteness: "complete-within-requested-bounds",
      derivation: {
        triggerEntityIdentifier: "atlast:entity:fulfillment",
        triggerDirectCondition: "down",
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:checkout",
            targetEntityIdentifier: "atlast:entity:fulfillment",
            relationshipIdentifier:
              "atlast:relationship:checkout-calls-fulfillment",
            assertionIdentifier: `atlast:assertion:${"a".repeat(64)}`,
          },
        ],
      },
    };
    const healthy: HealthProjection = {
      reportStatus: "reported",
      entityIdentifier: "atlast:entity:other",
      directCondition: "healthy",
      effectiveState: "healthy",
      contextCompleteness: "complete-within-requested-bounds",
    };
    expect(presentationForProjection(latent).label).toBe(
      "Latent downstream risk",
    );
    expect(presentationForProjection(latent)).not.toBe(
      presentationForProjection(healthy),
    );
  });
});

describe("describeProjection", () => {
  it("names the triggering entity, its direct condition, and the canonical path for latent risk", () => {
    const projection: HealthProjection = {
      reportStatus: "reported",
      entityIdentifier: "atlast:entity:checkout",
      directCondition: "healthy",
      effectiveState: "latent-downstream-risk",
      contextCompleteness: "complete-within-requested-bounds",
      derivation: {
        triggerEntityIdentifier: "atlast:entity:fulfillment",
        triggerDirectCondition: "down",
        path: [
          {
            sourceEntityIdentifier: "atlast:entity:checkout",
            targetEntityIdentifier: "atlast:entity:fulfillment",
            relationshipIdentifier:
              "atlast:relationship:checkout-calls-fulfillment",
            assertionIdentifier: `atlast:assertion:${"a".repeat(64)}`,
          },
        ],
      },
    };
    const text = describeProjection(projection);
    expect(text).toContain("atlast:entity:fulfillment");
    expect(text).toContain("Down");
    expect(text).toContain(
      "atlast:entity:checkout → atlast:entity:fulfillment",
    );
  });

  it("labels a truncated context as incomplete rather than proving no risk exists", () => {
    const projection: HealthProjection = {
      reportStatus: "reported",
      entityIdentifier: "atlast:entity:checkout",
      directCondition: "healthy",
      effectiveState: "healthy",
      contextCompleteness: "truncated",
    };
    expect(describeProjection(projection)).toContain("Context is truncated");
  });

  it("states no overlay report for an unreported entity, distinct from healthy", () => {
    const projection: HealthProjection = {
      reportStatus: "unreported",
      entityIdentifier: "atlast:entity:checkout",
      contextCompleteness: "complete-within-requested-bounds",
    };
    expect(describeProjection(projection)).toBe("No overlay report.");
  });
});

describe("isEmphasized — state-emphasis controls, never topology filters", () => {
  const down: HealthProjection = {
    reportStatus: "reported",
    entityIdentifier: "atlast:entity:fulfillment",
    directCondition: "down",
    effectiveState: "down",
    contextCompleteness: "complete-within-requested-bounds",
  };
  const healthy: HealthProjection = {
    reportStatus: "reported",
    entityIdentifier: "atlast:entity:checkout",
    directCondition: "healthy",
    effectiveState: "healthy",
    contextCompleteness: "complete-within-requested-bounds",
  };
  const unreported: HealthProjection = {
    reportStatus: "unreported",
    entityIdentifier: "atlast:entity:ledger",
    contextCompleteness: "complete-within-requested-bounds",
  };

  it("emphasizes every reported state when no filter is present (URL-absence default)", () => {
    expect(isEmphasized(down, undefined)).toBe(true);
    expect(isEmphasized(healthy, undefined)).toBe(true);
  });

  it("never emphasizes an unreported entity, filter or no filter", () => {
    expect(isEmphasized(unreported, undefined)).toBe(false);
    expect(isEmphasized(unreported, ["down"])).toBe(false);
  });

  it("emphasizes only matching states when a filter is present, without removing nonmatching entities", () => {
    expect(isEmphasized(down, ["down"])).toBe(true);
    expect(isEmphasized(healthy, ["down"])).toBe(false);
  });
});

describe("buildHealthOverlayView", () => {
  it("indexes a presentation for the origin and every returned Entity, plus ordered gap presentations", () => {
    const result = buildResult(
      [
        {
          reportStatus: "reported",
          entityIdentifier: "atlast:entity:checkout",
          directCondition: "healthy",
          effectiveState: "healthy",
          contextCompleteness: "complete-within-requested-bounds",
        },
        {
          reportStatus: "reported",
          entityIdentifier: "atlast:entity:fulfillment",
          directCondition: "down",
          effectiveState: "down",
          contextCompleteness: "complete-within-requested-bounds",
        },
      ],
      {
        gaps: [
          {
            entryIdentifier:
              "atlast:overlay-entry:demo-company/active-conditions/mystery",
            targetEntityIdentifier: "atlast:entity:unknown-target",
            directCondition: "degraded",
            reason: "UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT",
          },
        ],
      },
    );

    const view = buildHealthOverlayView(result, undefined);
    expect(view.byEntityIdentifier.size).toBe(2);
    expect(
      view.byEntityIdentifier.get("atlast:entity:fulfillment")?.presentation
        .label,
    ).toBe("Down");
    expect(view.gaps).toHaveLength(1);
    expect(view.gaps[0]?.reasonText).toBe(
      "Unknown entity at the resolved topology snapshot.",
    );
    expect(view.overlay).toEqual(OVERLAY_META);
    expect(view.topologyIdentity).toEqual(FIXTURE_IDENTITY);
  });

  it("states an empty gap list explicitly rather than an absent panel implying no gaps were checked", () => {
    const result = buildResult([]);
    const view = buildHealthOverlayView(result, undefined);
    expect(view.gaps).toEqual([]);
  });
});

describe("healthContextMatchesBaseTraversal", () => {
  const fulfillment = buildEntityReadResult({
    identifier: "atlast:entity:fulfillment",
    entityType: "service",
  });
  const baseTraversal = buildTraversalResult([fulfillment]);

  it("matches when origin, identity, and ordered subjects agree", () => {
    const result = buildResult(
      [
        {
          reportStatus: "reported",
          entityIdentifier: "atlast:entity:checkout",
          directCondition: "healthy",
          effectiveState: "healthy",
          contextCompleteness: "complete-within-requested-bounds",
        },
      ],
      { items: [fulfillment] },
    );
    expect(
      healthContextMatchesBaseTraversal(
        result,
        "atlast:entity:checkout",
        baseTraversal,
      ),
    ).toBe(true);
  });

  it("rejects a mismatched origin entity", () => {
    const result = buildResult([], { items: [fulfillment] });
    expect(
      healthContextMatchesBaseTraversal(
        result,
        "atlast:entity:different-origin",
        baseTraversal,
      ),
    ).toBe(false);
  });

  it("rejects a resolved identity that differs from the base traversal", () => {
    const result = buildResult([], { items: [fulfillment] });
    const mismatchedIdentityTraversal = buildTraversalResult([fulfillment]);
    const mutated: typeof mismatchedIdentityTraversal = {
      ...mismatchedIdentityTraversal,
      meta: {
        ...mismatchedIdentityTraversal.meta,
        resolvedIdentity: {
          ...mismatchedIdentityTraversal.meta.resolvedIdentity,
          horizon:
            mismatchedIdentityTraversal.meta.resolvedIdentity.horizon + 1,
        },
      },
    };
    expect(
      healthContextMatchesBaseTraversal(
        result,
        "atlast:entity:checkout",
        mutated,
      ),
    ).toBe(false);
  });

  it("rejects ordered traversal subjects that differ from the base traversal", () => {
    const otherEntity = buildEntityReadResult({
      identifier: "atlast:entity:payments",
      entityType: "service",
    });
    const result = buildResult([], { items: [otherEntity] });
    expect(
      healthContextMatchesBaseTraversal(
        result,
        "atlast:entity:checkout",
        baseTraversal,
      ),
    ).toBe(false);
  });

  it("rejects a differing subject count", () => {
    const otherEntity = buildEntityReadResult({
      identifier: "atlast:entity:payments",
      entityType: "service",
    });
    const result = buildResult([], { items: [fulfillment, otherEntity] });
    expect(
      healthContextMatchesBaseTraversal(
        result,
        "atlast:entity:checkout",
        baseTraversal,
      ),
    ).toBe(false);
  });
});
