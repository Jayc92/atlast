/**
 * Tests for the `/topology` route: identity coordination (one shared
 * resolution feeds inventory/search/pagination), inventory and search
 * rendering, honest canonical states, pagination, URL correction, and
 * accessibility semantics. Rendered through `createMemoryRouter` so real
 * URL navigation (search params, browser history) is exercised, not a
 * hand-rolled substitute.
 */
import { StrictMode } from "react";
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
  buildEntityReadResult,
  buildRelationshipSubjectReadResult,
  buildSubjectPage,
  buildSubjectReadResult,
  FIXTURE_IDENTITY,
  FIXTURE_EVIDENCE_IDENTIFIER,
} from "./test-support/fixtures.ts";
import { jsonRoute, stubApiFetch } from "./test-support/stub-fetch.ts";

afterEach(() => {
  cleanup();
  topologyRequestCache.clear();
  // The exploration coordinator is a module singleton (ADR-0026 § 4: one
  // coordinator for the whole session); each test must start a fresh
  // exploration generation so an identity resolved by one test can never be
  // silently reused — and so never leak — into the next.
  topologySessionCoordinator.beginNewGeneration();
});

function renderTopology(
  initialEntry: string,
): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter([...topologyRouteDefinitions], {
    initialEntries: [initialEntry],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("TopologyPage — inventory", () => {
  it("resolves and renders under the production Strict Mode lifecycle", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);
    const router = createMemoryRouter([...topologyRouteDefinitions], {
      initialEntries: ["/topology"],
    });

    render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );

    expect(
      await screen.findByText("No entities are visible in this snapshot."),
    ).toBeDefined();
  });

  it("resolves latest identity once and renders the entity inventory", async () => {
    const inventoryPage = buildEntityPage([
      buildEntityReadResult({
        identifier: "atlast:entity:service/checkout",
        entityType: "service",
      }),
      buildEntityReadResult({
        identifier: "atlast:entity:database/orders",
        entityType: "database",
      }),
    ]);
    const fetchStub = stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/entities"), inventoryPage),
    ]);

    renderTopology("/topology");

    expect(
      screen.getByRole("heading", { level: 1, name: "Topology" }),
    ).toBeDefined();
    expect(
      await screen.findByRole("link", {
        name: "atlast:entity:service/checkout",
      }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "atlast:entity:database/orders" }),
    ).toBeDefined();

    // The identity probe and the real inventory read are both entity
    // inventory requests at limit:1 vs. the real page — both count, but the
    // established identity must not be re-resolved by a second probe.
    const inventoryCalls = fetchStub.mock.calls.filter(([url]) =>
      url.includes("/api/v1/entities"),
    );
    expect(inventoryCalls.length).toBe(2);
  });

  it("shows the empty state when the inventory has no entities", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    renderTopology("/topology");

    expect(
      await screen.findByText("No entities are visible in this snapshot."),
    ).toBeDefined();
  });

  it("shows an expected API error with a working retry", async () => {
    let requestCount = 0;
    const fetchStub = stubApiFetch([
      {
        test: (url) => url.includes("/api/v1/entities"),
        respond: () => {
          requestCount += 1;
          // The first request is the identity-resolution probe (also a real
          // /api/v1/entities read, ADR-0026 § 4); failing it surfaces the
          // page's identity-level error/retry UI. Every later request (the
          // retried probe, then the real inventory read) succeeds.
          return requestCount === 1
            ? {
                ok: false,
                jsonPayload: {
                  code: "INVALID_READ_COORDINATE",
                  message: "The evidence store is empty.",
                  details: { reason: "EMPTY_EVIDENCE_STORE" },
                },
              }
            : { ok: true, jsonPayload: buildEntityPage([]) };
        },
      },
    ]);

    renderTopology("/topology");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The evidence store is empty.");

    await act(async () => {
      screen.getByRole("button", { name: "Try again" }).click();
      await Promise.resolve();
    });

    await screen.findByText("No entities are visible in this snapshot.");
    expect(fetchStub.mock.calls.length).toBeGreaterThan(2);
  });

  it("shows a redacted internal-error state for a malformed response, never the raw payload", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/entities"), { garbage: true }),
    ]);

    renderTopology("/topology");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("garbage");
  });

  it("fails closed when a dependent page reports a different resolved identity", async () => {
    let requestCount = 0;
    stubApiFetch([
      {
        test: (url) => url.includes("/api/v1/entities"),
        respond: () => {
          requestCount += 1;
          const page = buildEntityPage([]);
          return requestCount === 1
            ? { ok: true, jsonPayload: page }
            : {
                ok: true,
                jsonPayload: {
                  ...page,
                  meta: {
                    ...page.meta,
                    resolvedIdentity: {
                      ...page.meta.resolvedIdentity,
                      horizon: page.meta.resolvedIdentity.horizon + 1,
                    },
                  },
                },
              };
        },
      },
    ]);

    renderTopology("/topology");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("isn’t safe to show directly");
    expect(
      screen.queryByText("No entities are visible in this snapshot."),
    ).toBeNull();
  });

  it("paginates forward and back using only opaque cursor tokens, reusing the cache on return", async () => {
    const pageOne = buildEntityPage(
      [
        buildEntityReadResult({
          identifier: "atlast:entity:service/checkout",
          entityType: "service",
        }),
      ],
      { hasMore: true, nextCursor: "opaque-cursor-token-1" },
    );
    const pageTwo = buildEntityPage([
      buildEntityReadResult({
        identifier: "atlast:entity:database/orders",
        entityType: "database",
      }),
    ]);
    let sawCursorOnRequest = false;
    const fetchStub = stubApiFetch([
      {
        test: (url) => url.includes("/api/v1/entities"),
        respond: (url) => {
          if (url.includes("cursor=opaque-cursor-token-1")) {
            sawCursorOnRequest = true;
            return { ok: true, jsonPayload: pageTwo };
          }
          return { ok: true, jsonPayload: pageOne };
        },
      },
    ]);

    renderTopology("/topology");
    await screen.findByRole("link", { name: "atlast:entity:service/checkout" });

    const callsBeforeNext = fetchStub.mock.calls.length;
    await act(async () => {
      screen.getByRole("button", { name: "Next page" }).click();
      await Promise.resolve();
    });
    await screen.findByRole("link", { name: "atlast:entity:database/orders" });
    expect(sawCursorOnRequest).toBe(true);
    const callsAfterNext = fetchStub.mock.calls.length;
    expect(callsAfterNext).toBeGreaterThan(callsBeforeNext);

    await act(async () => {
      screen.getByRole("button", { name: "Previous page" }).click();
      await Promise.resolve();
    });
    await screen.findByRole("link", { name: "atlast:entity:service/checkout" });
    // Page one was already cached under its own cursor key — returning to it
    // issues no new request.
    expect(fetchStub.mock.calls.length).toBe(callsAfterNext);
  });
});

describe("TopologyPage — search", () => {
  it("shows an inline hint and disables submission for a too-short query", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    renderTopology("/topology");
    await screen.findByText("No entities are visible in this snapshot.");

    const searchInput = screen.getByLabelText("Search by exact identifier");
    fireEvent.change(searchInput, { target: { value: "c" } });

    expect(
      screen.getByRole("button", { name: "Search" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText("Enter at least 2 characters to search."),
    ).toBeDefined();
  });

  it("searches on submit and renders entity and relationship results distinctly", async () => {
    const searchResults = buildSubjectPage([
      buildSubjectReadResult({
        identifier: "atlast:entity:service/checkout",
        entityType: "service",
      }),
      buildRelationshipSubjectReadResult({
        identifier: "atlast:relationship:checkout-calls-ledger",
        relationshipType: "calls",
        sourceEntityIdentifier: "atlast:entity:service/checkout",
        targetEntityIdentifier: "atlast:entity:service/ledger",
      }),
    ]);
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/search"), searchResults),
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    renderTopology("/topology");
    await screen.findByText("No entities are visible in this snapshot.");

    const searchInput = screen.getByLabelText("Search by exact identifier");
    fireEvent.change(searchInput, { target: { value: "checkout" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("search"));
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("link", {
        name: "atlast:entity:service/checkout",
      }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", {
        name: "Inspect atlast:relationship:checkout-calls-ledger",
      }),
    ).toBeDefined();
    // A relationship result is shown honestly but is never a navigable
    // entity-detail link (M2-D trust inspector remains out of M2-B scope).
    expect(
      screen.queryByRole("link", {
        name: "atlast:relationship:checkout-calls-ledger",
      }),
    ).toBeNull();
  });

  it("synchronizes the search control when browser history changes the URL query", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/search"), buildSubjectPage([])),
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    const router = renderTopology("/topology?q=checkout");
    await screen.findByText("No subjects match this search.");
    expect(
      screen.getByLabelText<HTMLInputElement>("Search by exact identifier")
        .value,
    ).toBe("checkout");

    await act(async () => {
      await router.navigate("/topology?q=orders");
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText<HTMLInputElement>("Search by exact identifier")
          .value,
      ).toBe("orders");
    });
  });

  it("opens trust for an exact Relationship search result without inventing an Entity route", async () => {
    const relationship = buildRelationshipSubjectReadResult({
      identifier: "atlast:relationship:checkout-calls-ledger",
      relationshipType: "calls",
      sourceEntityIdentifier: "atlast:entity:service/checkout",
      targetEntityIdentifier: "atlast:entity:service/ledger",
    });
    stubApiFetch([
      jsonRoute(
        (url) => url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
        buildEvidenceDetailResult(),
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/search"),
        buildSubjectPage([relationship]),
      ),
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);
    const router = renderTopology("/topology?q=checkout");

    const invoker = await screen.findByRole("button", {
      name: `Inspect ${relationship.subject.identifier}`,
    });
    fireEvent.click(invoker);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Trust inspector" }),
    ).toBeDefined();
    expect(screen.getByText("calls")).toBeDefined();
    expect(router.state.location.search).toContain(
      `selected=${encodeURIComponent(relationship.subject.identifier)}`,
    );
    expect(
      screen.queryByRole("link", { name: relationship.subject.identifier }),
    ).toBeNull();
  });

  it("rehydrates a directly linked Relationship selection by exact identifier only", async () => {
    const relationship = buildRelationshipSubjectReadResult({
      identifier: "atlast:relationship:checkout-calls-ledger",
      relationshipType: "calls",
      sourceEntityIdentifier: "atlast:entity:service/checkout",
      targetEntityIdentifier: "atlast:entity:service/ledger",
    });
    const fetchStub = stubApiFetch([
      jsonRoute(
        (url) => url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
        buildEvidenceDetailResult(),
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/search"),
        buildSubjectPage([relationship]),
      ),
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    renderTopology(
      `/topology?selected=${encodeURIComponent(relationship.subject.identifier)}`,
    );

    expect(
      await screen.findByRole("heading", { level: 2, name: "Trust inspector" }),
    ).toBeDefined();
    const exactSearch = fetchStub.mock.calls.find(([url]) =>
      url.includes("/api/v1/search"),
    );
    expect(exactSearch?.[0]).toContain(
      `q=${encodeURIComponent(relationship.subject.identifier)}`,
    );
  });

  it("fails honestly when a directly linked Relationship is absent", async () => {
    const relationshipIdentifier = "atlast:relationship:checkout-calls-missing";
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/search"), buildSubjectPage([])),
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    renderTopology(
      `/topology?selected=${encodeURIComponent(relationshipIdentifier)}`,
    );

    expect(
      await screen.findByText(
        "The exact Relationship identifier is not visible at this snapshot.",
      ),
    ).toBeDefined();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Trust inspector" }),
    ).toBeNull();
  });

  it("shows a validated API error while rehydrating Relationship trust", async () => {
    const relationshipIdentifier = "atlast:relationship:checkout-calls-missing";
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/api/v1/search"),
        {
          code: "UNKNOWN_IDENTIFIER",
          message: "The requested Relationship is not available.",
          details: {
            identifierKind: "subject",
            identifier: relationshipIdentifier,
            resolvedIdentity: FIXTURE_IDENTITY,
          },
        },
        false,
      ),
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    renderTopology(
      `/topology?selected=${encodeURIComponent(relationshipIdentifier)}`,
    );

    expect(
      await screen.findByText("The requested Relationship is not available."),
    ).toBeDefined();
  });

  it("redacts a malformed Relationship rehydration response", async () => {
    const relationshipIdentifier =
      "atlast:relationship:checkout-calls-malformed";
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/search"), {
        leakedDetail: "must not render",
      }),
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    renderTopology(
      `/topology?selected=${encodeURIComponent(relationshipIdentifier)}`,
    );

    expect(await screen.findByText(/failure has been hidden/i)).toBeDefined();
    expect(screen.queryByText("must not render")).toBeNull();
  });
});

describe("TopologyPage — URL correction", () => {
  it("canonicalizes an unrecognized query parameter and shows the correction notice", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    const router = renderTopology("/topology?bogus=1");
    await screen.findByText(/was not a valid topology address/i);

    await waitFor(() => {
      expect(router.state.location.search).toBe("");
    });
  });

  it("drops a partial snapshot pin rather than half-honoring it", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
    ]);

    const router = renderTopology(
      `/topology?asOf=${encodeURIComponent(FIXTURE_IDENTITY.asOf)}`,
    );
    await screen.findByText(/was not a valid topology address/i);
    await waitFor(() => {
      expect(router.state.location.search).toBe("");
    });
  });
});
