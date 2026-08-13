/**
 * Routing-foundation tests (ADR-0026 § 2/§ 8 verification obligations:
 * "Browser back/forward and copied-URL acceptance tests"). Exercised at the
 * component level with `createMemoryRouter` — the same route shape
 * `AppRouter` wires into `createBrowserRouter` for production.
 *
 * `/topology` and `/entities/:entityId` now render the real M2-B
 * application shell; their structured content is exercised in depth by
 * `topology/TopologyPage.test.tsx` and `topology/EntityDetailPage.test.tsx`.
 * This file stays focused on routing mechanics: addressability, redirects,
 * and browser history.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { topologyRouteDefinitions } from "./router.tsx";
import {
  topologyRequestCache,
  topologySessionCoordinator,
} from "./topology/session.ts";
import {
  buildEntityPage,
  buildSubjectDetailResult,
} from "./topology/test-support/fixtures.ts";
import { jsonRoute, stubApiFetch } from "./topology/test-support/stub-fetch.ts";

function stubHealthEndpoint(): void {
  stubApiFetch([
    jsonRoute((url) => url === "/api/health", {
      status: "ok",
      service: "atlast-api",
    }),
    jsonRoute((url) => url.includes("/api/v1/entities"), buildEntityPage([])),
  ]);
}

afterEach(() => {
  cleanup();
  topologyRequestCache.clear();
  topologySessionCoordinator.beginNewGeneration();
});

describe("topology routing foundation", () => {
  it("renders the existing foundation page at /", async () => {
    stubHealthEndpoint();
    const router = createMemoryRouter([...topologyRouteDefinitions], {
      initialEntries: ["/"],
    });
    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Atlast" }),
    ).toBeDefined();
    await screen.findByText("Local API connected");
  });

  it("renders the real M2-B topology application at /topology", async () => {
    stubHealthEndpoint();
    const router = createMemoryRouter([...topologyRouteDefinitions], {
      initialEntries: ["/topology"],
    });
    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Topology" }),
    ).toBeDefined();
    expect(screen.getByRole("search")).toBeDefined();
    await screen.findByText("No entities are visible in this snapshot.");
  });

  it("renders the real M2-B entity detail application at /entities/:entityId", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/api/v1/entities/atlast%3Aentity%3Acheckout"),
        buildSubjectDetailResult({
          identifier: "atlast:entity:checkout",
          entityType: "service",
        }),
      ),
      jsonRoute(
        (url) => url.includes("/api/v1/entities?"),
        buildEntityPage([]),
      ),
    ]);
    const router = createMemoryRouter([...topologyRouteDefinitions], {
      initialEntries: ["/entities/atlast%3Aentity%3Acheckout"],
    });
    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Entity detail" }),
    ).toBeDefined();
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "atlast:entity:checkout",
      }),
    ).toBeDefined();
  });

  it("redirects an unrecognized path back to /", () => {
    stubHealthEndpoint();
    const router = createMemoryRouter([...topologyRouteDefinitions], {
      initialEntries: ["/somewhere-unknown"],
    });
    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Atlast" }),
    ).toBeDefined();
  });

  it("preserves a copied URL and supports history-delta back and forward navigation", async () => {
    stubHealthEndpoint();
    const router = createMemoryRouter([...topologyRouteDefinitions], {
      initialEntries: ["/", "/topology?view=list&depth=2"],
      initialIndex: 1,
    });
    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Topology" }),
    ).toBeDefined();
    expect(router.state.location.search).toBe("?view=list&depth=2");
    await screen.findByText("No entities are visible in this snapshot.");

    await router.navigate(-1);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Atlast",
      }),
    ).toBeDefined();

    await router.navigate(1);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Topology",
      }),
    ).toBeDefined();
    expect(router.state.location.search).toBe("?view=list&depth=2");
  });
});
