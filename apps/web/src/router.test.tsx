/**
 * Routing-foundation tests (ADR-0026 § 2/§ 8 verification obligations:
 * "Browser back/forward and copied-URL acceptance tests"). Exercised at the
 * component level with `createMemoryRouter` — the same route shape
 * `AppRouter` wires into `createBrowserRouter` for production.
 *
 * `fetch` is stubbed because the `/` route renders the existing `App` shell,
 * which performs its own health check on mount (App.test.tsx already covers
 * that behavior in isolation) — no test here contacts a real network
 * endpoint.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { topologyRouteDefinitions } from "./router.tsx";

function stubHealthEndpoint(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: (): Promise<unknown> =>
          Promise.resolve({ status: "ok", service: "atlast-api" }),
      } as Response),
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it("renders a reserved, contentless placeholder at /topology", () => {
    const router = createMemoryRouter([...topologyRouteDefinitions], {
      initialEntries: ["/topology"],
    });
    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Topology exploration \(reserved for M2-B\)/,
      }),
    ).toBeDefined();
    // No topology feature content of any kind exists on this route.
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("search")).toBeNull();
  });

  it("renders a reserved entity placeholder naming the requested identifier at /entities/:entityId", () => {
    const router = createMemoryRouter([...topologyRouteDefinitions], {
      initialEntries: ["/entities/atlast:entity:service%2Fcheckout"],
    });
    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Entity detail \(reserved for M2-B\)/,
      }),
    ).toBeDefined();
    expect(screen.getByText(/atlast:entity:service\/checkout/)).toBeDefined();
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
      screen.getByRole("heading", {
        level: 1,
        name: /Topology exploration/,
      }),
    ).toBeDefined();
    expect(router.state.location.search).toBe("?view=list&depth=2");

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
        name: /Topology exploration/,
      }),
    ).toBeDefined();
    expect(router.state.location.search).toBe("?view=list&depth=2");
  });
});
