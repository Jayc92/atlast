/**
 * Tests for the `/entities/:entityId` route: structured detail presentation,
 * identity coordination shared with `/topology`, invalid-identifier
 * canonicalization, and honest failure states.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { topologyRouteDefinitions } from "../router.tsx";
import { topologyRequestCache, topologySessionCoordinator } from "./session.ts";
import {
  buildEvidenceDetailResult,
  buildEntityPage,
  buildEntityReadResult,
  buildImpactResultEnvelope,
  buildRelationshipSubjectReadResult,
  buildSubjectDetailResult,
  buildTraversalResult,
  FIXTURE_IDENTITY,
  FIXTURE_EVIDENCE_IDENTIFIER,
} from "./test-support/fixtures.ts";
import { jsonRoute, stubApiFetch } from "./test-support/stub-fetch.ts";

const OVERLAY_META = {
  schemaVersion: "atlast-overlay-v1" as const,
  frameIdentifier: "atlast:overlay-frame:demo-company/active-conditions",
  effectiveAt: "2026-08-01T00:00:00.000Z",
};

/** A runtime narrowing (not a type assertion) so this reads `.value` safely regardless of how `getByRole`'s declared return type resolves. */
function selectValue(element: HTMLElement): string {
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error("Expected an HTMLSelectElement");
  }
  return element.value;
}

/**
 * Builds a schema-valid `HealthContextResult` payload whose `items` and
 * `projections` are self-consistent (every origin/returned Entity gets
 * exactly one ordered projection, per `healthContextResultSchema`'s own
 * cross-field validation) — the same shape the real M3-C route returns.
 */
function healthContextPayload(options: {
  readonly originEntityIdentifier: string;
  readonly items?: readonly {
    readonly subject: { readonly identifier: string };
  }[];
  readonly directConditions?: Readonly<Record<string, string>>;
  readonly gaps?: readonly unknown[];
  readonly overlay?: typeof OVERLAY_META;
}): unknown {
  const items = options.items ?? [];
  const projections = [
    options.originEntityIdentifier,
    ...items.map((item) => item.subject.identifier),
  ]
    .sort()
    .map((entityIdentifier) => {
      const directCondition = options.directConditions?.[entityIdentifier];
      if (directCondition === undefined || directCondition === "unreported") {
        return {
          reportStatus: "unreported",
          entityIdentifier,
          contextCompleteness: "complete-within-requested-bounds",
        };
      }
      return {
        reportStatus: "reported",
        entityIdentifier,
        directCondition,
        effectiveState: directCondition,
        contextCompleteness: "complete-within-requested-bounds",
      };
    });
  return {
    data: {
      originEntityIdentifier: options.originEntityIdentifier,
      items,
      projections,
      gaps: options.gaps ?? [],
    },
    traversal: { truncated: false, subjectCount: items.length },
    meta: {
      resolvedIdentity: FIXTURE_IDENTITY,
      schemaVersion: "atlast-domain-v1",
      overlay: options.overlay ?? OVERLAY_META,
    },
  };
}

afterEach(() => {
  cleanup();
  topologyRequestCache.clear();
  topologySessionCoordinator.beginNewGeneration();
});

function renderEntityDetail(
  initialEntry: string,
): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter([...topologyRouteDefinitions], {
    initialEntries: [initialEntry],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("EntityDetailPage", () => {
  it("renders the entity identifier and every visible entity-type claim", async () => {
    const detail = buildSubjectDetailResult({
      identifier: "atlast:entity:service/checkout",
      entityType: "service",
    });
    stubApiFetch([
      jsonRoute((url) => url.includes("/traversal?"), buildTraversalResult([])),
      jsonRoute(
        (url) =>
          url.includes("/api/v1/entities/atlast%3Aentity%3Aservice%2Fcheckout"),
        detail,
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/entities?"),
        buildEntityPage([]),
      ),
    ]);

    renderEntityDetail("/entities/atlast%3Aentity%3Aservice%2Fcheckout");

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "atlast:entity:service/checkout",
      }),
    ).toBeDefined();
    expect(screen.getByText("service")).toBeDefined();
    expect(screen.getByText("1 visible assertion revision.")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Back to topology" }),
    ).toBeDefined();
  });

  it("redirects to /topology for an empty entity identifier", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    renderEntityDetail("/entities/%20");

    expect(
      await screen.findByText("No entities are visible in this snapshot."),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { level: 1, name: "Topology" }),
    ).toBeDefined();
  });

  it("shows an honest not-found error for an unknown entity, without inventing a result", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Aunknown"),
        {
          code: "UNKNOWN_IDENTIFIER",
          message: "No entity matches atlast:entity:unknown.",
          details: {
            identifierKind: "subject",
            identifier: "atlast:entity:unknown",
          },
        },
        false,
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/entities?"),
        buildEntityPage([]),
      ),
    ]);

    renderEntityDetail("/entities/atlast%3Aentity%3Aunknown");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "No entity matches atlast:entity:unknown.",
    );
  });

  it("preserves the pinned snapshot identity from the URL without re-resolving it", async () => {
    const detail = buildSubjectDetailResult({
      identifier: "atlast:entity:service/checkout",
      entityType: "service",
    });
    const fetchStub = stubApiFetch([
      jsonRoute((url) => url.includes("/traversal?"), buildTraversalResult([])),
      jsonRoute(
        (url) =>
          url.includes("/api/v1/entities/atlast%3Aentity%3Aservice%2Fcheckout"),
        detail,
      ),
      // The M6-B dataset-mode badge (TopologyShell) issues its own,
      // separate /api/health request on every topology page — unrelated
      // to this test's pinned-identity assertion, but every page render
      // triggers it, so it must resolve rather than throw as "no route
      // matched."
      jsonRoute((url) => url.includes("/api/health"), {
        status: "ok",
        service: "atlast-api",
        datasetMode: "fixture",
      }),
    ]);

    renderEntityDetail(
      `/entities/atlast%3Aentity%3Aservice%2Fcheckout?asOf=${encodeURIComponent(
        FIXTURE_IDENTITY.asOf,
      )}&horizon=${String(FIXTURE_IDENTITY.horizon)}&derivationVersion=${FIXTURE_IDENTITY.derivationVersion}`,
    );

    await screen.findByRole("heading", {
      level: 2,
      name: "atlast:entity:service/checkout",
    });
    await screen.findByRole("heading", {
      level: 2,
      name: "Relationship workspace",
    });
    // A complete pin goes directly to the detail and traversal reads; it does
    // not perform the unpinned inventory probe used to resolve latest. The
    // dataset-mode badge's own /api/health call is a third, independent
    // request every topology page now makes.
    expect(fetchStub).toHaveBeenCalledTimes(3);
    expect(
      fetchStub.mock.calls
        .filter(([url]) => !url.includes("/api/health"))
        .every(([url]) =>
          url.includes(`horizon=${String(FIXTURE_IDENTITY.horizon)}`),
        ),
    ).toBe(true);
    expect(screen.getByText(/Snapshot: pinned/)).toBeDefined();
  });

  it("canonicalizes a partial snapshot pin and shows the correction notice", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/traversal?"), buildTraversalResult([])),
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    const router = renderEntityDetail(
      `/entities/atlast%3Aentity%3Aservice%2Fcheckout?asOf=${encodeURIComponent(
        FIXTURE_IDENTITY.asOf,
      )}`,
    );

    await screen.findByText(/was not a valid topology address/i);
    await waitFor(() => {
      expect(router.state.location.search).toBe("");
    });
  });

  it("keeps the back-to-topology link keyboard reachable and preserving preserved state", async () => {
    const detail = buildSubjectDetailResult({
      identifier: "atlast:entity:service/checkout",
      entityType: "service",
    });
    stubApiFetch([
      jsonRoute((url) => url.includes("/traversal?"), buildTraversalResult([])),
      jsonRoute(
        (url) =>
          url.includes("/api/v1/entities/atlast%3Aentity%3Aservice%2Fcheckout"),
        detail,
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/entities?"),
        buildEntityPage([]),
      ),
    ]);

    renderEntityDetail(
      "/entities/atlast%3Aentity%3Aservice%2Fcheckout?q=checkout",
    );

    const backLink = await screen.findByRole("link", {
      name: "Back to topology",
    });
    expect(backLink.getAttribute("href")).toBe("/topology?q=checkout");
    expect(backLink.tagName).toBe("A");

    await act(async () => {
      backLink.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Topology" }),
    ).toBeDefined();
  });

  it("writes traversal controls and shared selection to a complete pinned URL", async () => {
    const checkout = buildSubjectDetailResult({
      identifier: "atlast:entity:checkout",
      entityType: "service",
    });
    const payments = buildSubjectDetailResult({
      identifier: "atlast:entity:payments",
      entityType: "service",
    }).data;
    const relationship = buildRelationshipSubjectReadResult({
      identifier: "atlast:relationship:checkout-calls-payments",
      relationshipType: "calls",
      sourceEntityIdentifier: checkout.data.subject.identifier,
      targetEntityIdentifier: payments.subject.identifier,
    });
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/traversal?"),
        buildTraversalResult([payments, relationship]),
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
        checkout,
      ),
    ]);
    const router = renderEntityDetail(
      `/entities/atlast%3Aentity%3Acheckout?view=list&asOf=${encodeURIComponent(
        FIXTURE_IDENTITY.asOf,
      )}&horizon=${String(FIXTURE_IDENTITY.horizon)}&derivationVersion=${FIXTURE_IDENTITY.derivationVersion}`,
    );

    const direction = await screen.findByRole("combobox", {
      name: "Direction",
    });
    fireEvent.change(direction, { target: { value: "upstream" } });
    await waitFor(() => {
      expect(router.state.location.search).toContain("direction=upstream");
    });

    const entityButton = await screen.findByRole("button", {
      name: "payments, service",
    });
    fireEvent.click(entityButton);
    await waitFor(() => {
      expect(router.state.location.search).toContain(
        `selected=${encodeURIComponent(payments.subject.identifier)}`,
      );
      expect(router.state.location.search).toContain("horizon=20");
    });
  });

  it("preserves latest mode when traversal controls and selection change", async () => {
    const checkout = buildSubjectDetailResult({
      identifier: "atlast:entity:checkout",
      entityType: "service",
    });
    const payments = buildSubjectDetailResult({
      identifier: "atlast:entity:payments",
      entityType: "service",
    }).data;
    const relationship = buildRelationshipSubjectReadResult({
      identifier: "atlast:relationship:checkout-calls-payments",
      relationshipType: "calls",
      sourceEntityIdentifier: checkout.data.subject.identifier,
      targetEntityIdentifier: payments.subject.identifier,
    });
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/traversal?"),
        buildTraversalResult([payments, relationship]),
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
        checkout,
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/entities?"),
        buildEntityPage([]),
      ),
    ]);
    const router = renderEntityDetail(
      "/entities/atlast%3Aentity%3Acheckout?view=list",
    );

    fireEvent.change(
      await screen.findByRole("combobox", { name: "Direction" }),
      { target: { value: "upstream" } },
    );
    await waitFor(() => {
      expect(router.state.location.search).toContain("direction=upstream");
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "payments, service" }),
    );

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("selected")).toBe(payments.subject.identifier);
      expect(params.has("asOf")).toBe(false);
      expect(params.has("horizon")).toBe(false);
      expect(params.has("derivationVersion")).toBe(false);
      expect(screen.getByText(/Snapshot: latest/)).toBeDefined();
    });
  });

  it("opens Entity trust, dereferences Evidence, and removes selection when closed", async () => {
    const detail = buildSubjectDetailResult({
      identifier: "atlast:entity:checkout",
      entityType: "service",
    });
    stubApiFetch([
      jsonRoute(
        (url) => url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
        buildEvidenceDetailResult(),
      ),
      jsonRoute((url) => url.includes("/traversal?"), buildTraversalResult([])),
      jsonRoute(
        (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
        detail,
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/entities?"),
        buildEntityPage([]),
      ),
    ]);
    const router = renderEntityDetail(
      "/entities/atlast%3Aentity%3Acheckout?view=list",
    );

    const invoker = await screen.findByRole("button", {
      name: "Inspect entity trust",
    });
    invoker.focus();
    fireEvent.click(invoker);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Trust inspector" }),
    ).toBeDefined();
    expect(await screen.findByText(/production/)).toBeDefined();
    expect(router.state.location.search).toContain(
      `selected=${encodeURIComponent(detail.data.subject.identifier)}`,
    );
    let params = new URLSearchParams(router.state.location.search);
    expect(params.has("asOf")).toBe(false);
    expect(params.has("horizon")).toBe(false);
    expect(params.has("derivationVersion")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    await waitFor(() => {
      expect(router.state.location.search).not.toContain("selected=");
      expect(document.activeElement).toBe(invoker);
    });
    params = new URLSearchParams(router.state.location.search);
    expect(params.has("asOf")).toBe(false);
    expect(params.has("horizon")).toBe(false);
    expect(params.has("derivationVersion")).toBe(false);
  });

  describe("M4-C impact panel", () => {
    it("opens the impact panel from entity detail with a default changeType and the page's traversal bounds", async () => {
      const detail = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      stubApiFetch([
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        // The impact route's URL contains the entity-detail matcher as a
        // substring, so it must be listed first — `stubApiFetch` returns the
        // first matching route (mirroring this file's existing
        // traversal-before-detail ordering convention).
        jsonRoute(
          (url) => url.includes("/impact?"),
          buildImpactResultEnvelope({
            originEntityIdentifier: "atlast:entity:checkout",
            changeType: "removal",
          }),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          detail,
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities?"),
          buildEntityPage([]),
        ),
      ]);
      const router = renderEntityDetail(
        "/entities/atlast%3Aentity%3Acheckout?view=list&depth=3",
      );

      const invoker = await screen.findByRole("button", {
        name: "Analyze impact on atlast:entity:checkout",
      });
      invoker.focus();
      fireEvent.click(invoker);

      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Impact analysis",
        }),
      ).toBeDefined();
      expect(router.state.location.search).toContain("changeType=removal");
      expect(router.state.location.search).toContain(
        `selected=${encodeURIComponent("atlast:entity:checkout")}`,
      );
      await screen.findByText(/no reachable entities meet these bounds/i);

      fireEvent.click(
        screen.getByRole("button", { name: "Close impact panel" }),
      );
      await waitFor(() => {
        expect(router.state.location.search).not.toContain("changeType=");
        expect(document.activeElement).toBe(invoker);
      });
    });

    it("closing the impact panel also closes a trust inspector that only opened as its side effect", async () => {
      const detail = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      stubApiFetch([
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        jsonRoute(
          (url) => url.includes("/impact?"),
          buildImpactResultEnvelope({
            originEntityIdentifier: "atlast:entity:checkout",
            changeType: "removal",
          }),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          detail,
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities?"),
          buildEntityPage([]),
        ),
      ]);
      renderEntityDetail("/entities/atlast%3Aentity%3Acheckout?view=list");

      // Opening impact from the entity summary (not from an already-open
      // trust inspector) sets `selected` as a side effect (ADR-0034 § 1),
      // which also opens a trust inspector the user never asked for.
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Analyze impact on atlast:entity:checkout",
        }),
      );
      await screen.findByRole("heading", {
        level: 2,
        name: "Impact analysis",
      });
      expect(
        screen.getByRole("dialog", { name: "Trust inspector" }),
      ).toBeDefined();

      fireEvent.click(
        screen.getByRole("button", { name: "Close impact panel" }),
      );

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: "Impact analysis" }),
        ).toBeNull();
      });
      expect(
        screen.queryByRole("dialog", { name: "Trust inspector" }),
      ).toBeNull();
    });

    it("closing the impact panel preserves a trust inspector the user deliberately opened first", async () => {
      const detail = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      stubApiFetch([
        jsonRoute(
          (url) =>
            url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
          buildEvidenceDetailResult(),
        ),
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        jsonRoute(
          (url) => url.includes("/impact?"),
          buildImpactResultEnvelope({
            originEntityIdentifier: "atlast:entity:checkout",
            changeType: "removal",
          }),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          detail,
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities?"),
          buildEntityPage([]),
        ),
      ]);
      renderEntityDetail("/entities/atlast%3Aentity%3Acheckout?view=list");

      fireEvent.click(
        await screen.findByRole("button", { name: "Inspect entity trust" }),
      );
      const inspectorDialog = await screen.findByRole("dialog", {
        name: "Trust inspector",
      });
      fireEvent.click(
        within(inspectorDialog).getByRole("button", {
          name: "Analyze impact on atlast:entity:checkout",
        }),
      );
      await screen.findByRole("heading", {
        level: 2,
        name: "Impact analysis",
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Close impact panel" }),
      );

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: "Impact analysis" }),
        ).toBeNull();
      });
      expect(
        screen.getByRole("dialog", { name: "Trust inspector" }),
      ).toBeDefined();
    });

    it("opens the impact panel from the trust inspector's Analyze impact control", async () => {
      const detail = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      stubApiFetch([
        jsonRoute(
          (url) =>
            url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
          buildEvidenceDetailResult(),
        ),
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        // Listed before the entity-detail matcher below, since the impact
        // URL contains that matcher as a substring (`stubApiFetch` returns
        // the first match).
        jsonRoute(
          (url) => url.includes("/impact?"),
          buildImpactResultEnvelope({
            originEntityIdentifier: "atlast:entity:checkout",
            changeType: "removal",
          }),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          detail,
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities?"),
          buildEntityPage([]),
        ),
      ]);
      renderEntityDetail("/entities/atlast%3Aentity%3Acheckout?view=list");

      fireEvent.click(
        await screen.findByRole("button", { name: "Inspect entity trust" }),
      );
      const inspectorDialog = await screen.findByRole("dialog", {
        name: "Trust inspector",
      });

      // Two identically-named "Analyze impact on ..." controls exist while
      // the inspector is open here (the entity summary's own, and the
      // inspector's, both correctly targeting the same entity) — scope to
      // the inspector to exercise its specific entry point (ADR-0034 § 6).
      fireEvent.click(
        within(inspectorDialog).getByRole("button", {
          name: "Analyze impact on atlast:entity:checkout",
        }),
      );

      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Impact analysis",
        }),
      ).toBeDefined();
    });

    it("renders the impact panel directly from a copied link naming an Entity and a valid changeType", async () => {
      const detail = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      stubApiFetch([
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        // Listed before the entity-detail matcher below, since the impact
        // URL contains that matcher as a substring (`stubApiFetch` returns
        // the first match).
        jsonRoute(
          (url) => url.includes("/impact?"),
          buildImpactResultEnvelope({
            originEntityIdentifier: "atlast:entity:checkout",
            changeType: "interface-change",
          }),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          detail,
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities?"),
          buildEntityPage([]),
        ),
      ]);

      renderEntityDetail(
        `/entities/atlast%3Aentity%3Acheckout?selected=${encodeURIComponent(
          "atlast:entity:checkout",
        )}&changeType=interface-change`,
      );

      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Impact analysis",
        }),
      ).toBeDefined();
      expect(
        selectValue(
          screen.getByRole("combobox", { name: "Hypothetical change" }),
        ),
      ).toBe("interface-change");
    });
  });

  describe("M3-D operational health overlay", () => {
    // The latest-mode identity probe (`GET /api/v1/entities?limit=1`) and the
    // real health-context path (`/entities/<id>/health-context?...`, which
    // shares the plain entity-detail URL as a literal prefix) both need their
    // own routes ordered *before* the loose entity-detail matcher, exactly
    // like the pre-existing `/traversal?` route above — `stubApiFetch` always
    // returns the first matching route.
    const inventoryProbeRoute = jsonRoute(
      (url) => url.includes("/api/v1/entities?"),
      buildEntityPage([]),
    );

    it("issues no health-context request and shows no overlay controls' status when health is off (overlay-off continuity)", async () => {
      const checkout = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      const fetchStub = stubApiFetch([
        inventoryProbeRoute,
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          checkout,
        ),
      ]);

      renderEntityDetail("/entities/atlast%3Aentity%3Acheckout");

      await screen.findByRole("heading", {
        level: 2,
        name: "Relationship workspace",
      });
      expect(
        fetchStub.mock.calls.some(([url]) => url.includes("/health-context")),
      ).toBe(false);
      expect(
        screen.getByRole("checkbox", {
          name: "Show synthetic operational overlay",
        }),
      ).toBeDefined();
    });

    it("renders all six states plus unreported with non-color labels, and keeps every entity present under a state-emphasis filter", async () => {
      const checkout = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      const down = buildEntityReadResult({
        identifier: "atlast:entity:down-service",
        entityType: "service",
      });
      const degraded = buildEntityReadResult({
        identifier: "atlast:entity:degraded-service",
        entityType: "service",
      });
      const disconnected = buildEntityReadResult({
        identifier: "atlast:entity:disconnected-service",
        entityType: "service",
      });
      const expiring = buildEntityReadResult({
        identifier: "atlast:entity:expiring-service",
        entityType: "service",
      });
      const healthyOther = buildEntityReadResult({
        identifier: "atlast:entity:healthy-service",
        entityType: "service",
      });
      const unreported = buildEntityReadResult({
        identifier: "atlast:entity:unreported-service",
        entityType: "service",
      });
      const traversal = buildTraversalResult([
        down,
        degraded,
        disconnected,
        expiring,
        healthyOther,
        unreported,
      ]);

      stubApiFetch([
        inventoryProbeRoute,
        jsonRoute(
          (url) => url.includes("/health-context?"),
          healthContextPayload({
            originEntityIdentifier: "atlast:entity:checkout",
            items: [
              down,
              degraded,
              disconnected,
              expiring,
              healthyOther,
              unreported,
            ],
            directConditions: {
              "atlast:entity:checkout": "healthy",
              "atlast:entity:down-service": "down",
              "atlast:entity:degraded-service": "degraded",
              "atlast:entity:disconnected-service": "disconnected",
              "atlast:entity:expiring-service": "expiring-certificate",
              "atlast:entity:healthy-service": "healthy",
            },
          }),
        ),
        jsonRoute((url) => url.includes("/traversal?"), traversal),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          checkout,
        ),
      ]);

      renderEntityDetail(
        "/entities/atlast%3Aentity%3Acheckout?view=list&health=on&healthStates=down",
      );

      await screen.findByRole("checkbox", {
        name: "Show synthetic operational overlay",
        checked: true,
      });
      await screen.findByRole("button", { name: /down-service.*Down/ });

      expect(
        screen.getByRole("button", { name: /degraded-service.*Degraded/ }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", {
          name: /disconnected-service.*Disconnected/,
        }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", {
          name: /expiring-service.*Expiring certificate/,
        }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", {
          name: /unreported-service.*No overlay report/,
        }),
      ).toBeDefined();

      // The "down" emphasis filter only changes visual treatment: every
      // entity remains present, and the nonmatching ones are explicitly
      // labeled as not emphasized rather than removed.
      expect(
        screen.getByRole("button", {
          name: /degraded-service.*Degraded.*not emphasized/,
        }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", {
          name: /down-service.*Down(?!.*not emphasized)/,
        }),
      ).toBeDefined();
    });

    it("names the trigger and canonical path for latent downstream risk", async () => {
      const checkout = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      const fulfillment = buildEntityReadResult({
        identifier: "atlast:entity:fulfillment",
        entityType: "service",
      });
      const relationship = buildRelationshipSubjectReadResult({
        identifier: "atlast:relationship:checkout-calls-fulfillment",
        relationshipType: "calls",
        sourceEntityIdentifier: "atlast:entity:checkout",
        targetEntityIdentifier: "atlast:entity:fulfillment",
      });
      const traversal = buildTraversalResult([fulfillment, relationship]);

      stubApiFetch([
        inventoryProbeRoute,
        jsonRoute((url) => url.includes("/health-context?"), {
          data: {
            originEntityIdentifier: "atlast:entity:checkout",
            items: [fulfillment, relationship],
            projections: [
              {
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
                      assertionIdentifier: `atlast:assertion:${"c".repeat(64)}`,
                    },
                  ],
                },
              },
              {
                reportStatus: "reported",
                entityIdentifier: "atlast:entity:fulfillment",
                directCondition: "down",
                effectiveState: "down",
                contextCompleteness: "complete-within-requested-bounds",
              },
            ],
            gaps: [],
          },
          traversal: { truncated: false, subjectCount: 2 },
          meta: {
            resolvedIdentity: FIXTURE_IDENTITY,
            schemaVersion: "atlast-domain-v1",
            overlay: OVERLAY_META,
          },
        }),
        jsonRoute((url) => url.includes("/traversal?"), traversal),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          checkout,
        ),
      ]);

      renderEntityDetail(
        "/entities/atlast%3Aentity%3Acheckout?view=list&health=on",
      );

      const checkoutButton = await screen.findByRole("button", {
        name: /checkout.*Latent downstream risk/,
      });
      expect(checkoutButton.textContent).toContain("atlast:entity:fulfillment");
      expect(checkoutButton.textContent).toContain("Down");
      expect(checkoutButton.textContent).toContain(
        "atlast:entity:checkout → atlast:entity:fulfillment",
      );
    });

    it("presents an unknown overlay target as a keyboard-reachable gap, never as a phantom graph node", async () => {
      const checkout = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      const traversal = buildTraversalResult([]);

      stubApiFetch([
        inventoryProbeRoute,
        jsonRoute(
          (url) => url.includes("/health-context?"),
          healthContextPayload({
            originEntityIdentifier: "atlast:entity:checkout",
            items: [],
            gaps: [
              {
                entryIdentifier:
                  "atlast:overlay-entry:demo-company/active-conditions/mystery",
                targetEntityIdentifier: "atlast:entity:unknown-target",
                directCondition: "degraded",
                reason: "UNKNOWN_ENTITY_AT_TOPOLOGY_SNAPSHOT",
              },
            ],
          }),
        ),
        jsonRoute((url) => url.includes("/traversal?"), traversal),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          checkout,
        ),
      ]);

      renderEntityDetail(
        "/entities/atlast%3Aentity%3Acheckout?view=list&health=on",
      );

      const gapsHeading = await screen.findByRole("heading", {
        name: "Unknown overlay targets",
      });
      expect(gapsHeading).toBeDefined();
      expect(screen.getByText("atlast:entity:unknown-target")).toBeDefined();
      // Never a graph/structured entity row.
      expect(
        screen.queryByRole("button", { name: /unknown-target/ }),
      ).toBeNull();
    });

    it("keeps topology visible and offers a separately labeled overlay error with successful retry", async () => {
      const checkout = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      const traversal = buildTraversalResult([]);
      let healthRequests = 0;

      stubApiFetch([
        inventoryProbeRoute,
        {
          test: (url) => url.includes("/health-context?"),
          respond: () => {
            healthRequests += 1;
            return healthRequests === 1
              ? {
                  ok: false,
                  jsonPayload: {
                    code: "OVERLAY_FRAME_NOT_FOUND",
                    message: "The requested overlay frame does not exist.",
                    details: {
                      overlayFrame: "atlast:overlay-frame:demo-company/gone",
                    },
                  },
                }
              : {
                  ok: true,
                  jsonPayload: healthContextPayload({
                    originEntityIdentifier: "atlast:entity:checkout",
                  }),
                };
          },
        },
        jsonRoute((url) => url.includes("/traversal?"), traversal),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          checkout,
        ),
      ]);

      renderEntityDetail(
        "/entities/atlast%3Aentity%3Acheckout?view=list&health=on",
      );

      await screen.findByRole("heading", {
        level: 2,
        name: "Relationship workspace",
      });
      const overlayError = await screen.findByRole("alert");
      expect(overlayError.textContent).toContain(
        "The requested overlay frame does not exist.",
      );
      // Base topology remains visible and usable during the overlay failure.
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: "Relationship workspace",
        }),
      ).toBeDefined();

      fireEvent.click(
        screen.getByRole("button", { name: "Try the overlay again" }),
      );
      await waitFor(() => {
        expect(screen.queryByRole("alert")).toBeNull();
      });
      expect(healthRequests).toBe(2);
    });

    it("clears an invalid copied frame and requests a compatible historical frame explicitly", async () => {
      const checkout = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      const healthRequestUrls: string[] = [];
      stubApiFetch([
        {
          test: (url) => url.includes("/health-context?"),
          respond: (url) => {
            healthRequestUrls.push(url);
            return healthRequestUrls.length === 1
              ? {
                  ok: false,
                  jsonPayload: {
                    code: "OVERLAY_FRAME_NOT_FOUND",
                    message: "The requested overlay frame does not exist.",
                    details: {
                      overlayFrame: "atlast:overlay-frame:demo-company/gone",
                    },
                  },
                }
              : {
                  ok: true,
                  jsonPayload: healthContextPayload({
                    originEntityIdentifier: "atlast:entity:checkout",
                  }),
                };
          },
        },
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          checkout,
        ),
      ]);

      const router = renderEntityDetail(
        `/entities/atlast%3Aentity%3Acheckout?view=list&health=on&asOf=${encodeURIComponent(
          FIXTURE_IDENTITY.asOf,
        )}&horizon=${String(FIXTURE_IDENTITY.horizon)}&derivationVersion=${FIXTURE_IDENTITY.derivationVersion}&overlayFrame=${encodeURIComponent(
          "atlast:overlay-frame:demo-company/gone",
        )}`,
      );

      fireEvent.click(
        await screen.findByRole("button", {
          name: "Select a compatible overlay frame",
        }),
      );
      await waitFor(() => {
        expect(healthRequestUrls).toHaveLength(2);
      });
      expect(
        new URL(
          healthRequestUrls[1] ?? "",
          "http://localhost",
        ).searchParams.has("overlayFrame"),
      ).toBe(false);
      await waitFor(() => {
        expect(
          new URLSearchParams(router.state.location.search).get("overlayFrame"),
        ).toBe(OVERLAY_META.frameIdentifier);
      });
    });

    it("toggling the overlay checkbox writes and removes health= (and its dependents) in the URL", async () => {
      const checkout = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      stubApiFetch([
        inventoryProbeRoute,
        jsonRoute(
          (url) => url.includes("/health-context?"),
          healthContextPayload({
            originEntityIdentifier: "atlast:entity:checkout",
          }),
        ),
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          checkout,
        ),
      ]);

      const router = renderEntityDetail(
        "/entities/atlast%3Aentity%3Acheckout?view=list",
      );

      fireEvent.click(
        await screen.findByRole("checkbox", {
          name: "Show synthetic operational overlay",
        }),
      );
      await waitFor(() => {
        expect(router.state.location.search).toContain("health=on");
      });

      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "Show synthetic operational overlay",
        }),
      );
      await waitFor(() => {
        expect(router.state.location.search).not.toContain("health=on");
      });
    });

    it("auto-selects and pins the resolved overlay frame into a historical URL", async () => {
      const checkout = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      stubApiFetch([
        jsonRoute(
          (url) => url.includes("/health-context?"),
          healthContextPayload({
            originEntityIdentifier: "atlast:entity:checkout",
          }),
        ),
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          checkout,
        ),
      ]);

      const router = renderEntityDetail(
        `/entities/atlast%3Aentity%3Acheckout?view=list&health=on&asOf=${encodeURIComponent(
          FIXTURE_IDENTITY.asOf,
        )}&horizon=${String(FIXTURE_IDENTITY.horizon)}&derivationVersion=${FIXTURE_IDENTITY.derivationVersion}`,
      );

      await waitFor(() => {
        const params = new URLSearchParams(router.state.location.search);
        expect(params.get("overlayFrame")).toBe(OVERLAY_META.frameIdentifier);
      });
    });

    it("preserves Entity trust inspection while the overlay is on", async () => {
      const checkout = buildSubjectDetailResult({
        identifier: "atlast:entity:checkout",
        entityType: "service",
      });
      stubApiFetch([
        inventoryProbeRoute,
        jsonRoute(
          (url) =>
            url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
          buildEvidenceDetailResult(),
        ),
        jsonRoute(
          (url) => url.includes("/health-context?"),
          healthContextPayload({
            originEntityIdentifier: "atlast:entity:checkout",
          }),
        ),
        jsonRoute(
          (url) => url.includes("/traversal?"),
          buildTraversalResult([]),
        ),
        jsonRoute(
          (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
          checkout,
        ),
      ]);

      renderEntityDetail(
        "/entities/atlast%3Aentity%3Acheckout?view=list&health=on",
      );

      const invoker = await screen.findByRole("button", {
        name: "Inspect entity trust",
      });
      fireEvent.click(invoker);

      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Trust inspector",
        }),
      ).toBeDefined();
    });
  });
});
