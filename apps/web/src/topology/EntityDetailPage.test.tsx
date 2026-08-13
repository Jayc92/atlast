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
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { topologyRouteDefinitions } from "../router.tsx";
import { topologyRequestCache, topologySessionCoordinator } from "./session.ts";
import {
  buildEvidenceDetailResult,
  buildEntityPage,
  buildRelationshipSubjectReadResult,
  buildSubjectDetailResult,
  buildTraversalResult,
  FIXTURE_IDENTITY,
  FIXTURE_EVIDENCE_IDENTIFIER,
} from "./test-support/fixtures.ts";
import { jsonRoute, stubApiFetch } from "./test-support/stub-fetch.ts";

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
    // not perform the unpinned inventory probe used to resolve latest.
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(
      fetchStub.mock.calls.every(([url]) =>
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
});
