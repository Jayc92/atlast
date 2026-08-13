/**
 * Unit tests for the M0 foundation page (ADR-0008: Vitest + jsdom).
 *
 * `fetch` is stubbed in every test — no test contacts a real network
 * endpoint, and state transitions are awaited with Testing Library's
 * polling queries rather than fixed sleeps (GUARDRAILS.md § 5: determinism
 * is non-negotiable).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";

type FetchLikeFunction = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** Stub the global fetch used by the health check with a canned outcome. */
function stubHealthEndpoint(outcome: {
  ok: boolean;
  jsonPayload?: unknown;
  rejectWith?: Error;
}): ReturnType<typeof vi.fn<FetchLikeFunction>> {
  const fetchStub = vi.fn<FetchLikeFunction>((): Promise<Response> => {
    if (outcome.rejectWith !== undefined) {
      return Promise.reject(outcome.rejectWith);
    }
    return Promise.resolve({
      ok: outcome.ok,
      json: (): Promise<unknown> => Promise.resolve(outcome.jsonPayload),
    } as Response);
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App — primary rendered content", () => {
  it("renders the product title, tagline, and M0 status area", async () => {
    stubHealthEndpoint({
      ok: true,
      jsonPayload: { status: "ok", service: "atlast-api" },
    });

    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Atlast" }),
    ).toBeDefined();
    expect(
      screen.getByText("The living map of your engineering organization."),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /M0 — Safe project foundation/,
      }),
    ).toBeDefined();

    // Let the in-flight health check settle so no state update lands after
    // teardown; the online state is asserted in its own test below.
    await screen.findByText("Local API connected");
  });

  it("shows M0 and M1 as delivered and every later milestone as gated", async () => {
    stubHealthEndpoint({
      ok: true,
      jsonPayload: { status: "ok", service: "atlast-api" },
    });

    render(<App />);

    expect(screen.getAllByText("delivered", { exact: true })).toHaveLength(2);
    expect(screen.getAllByText("gated")).toHaveLength(4);
    expect(screen.getByText(/M1 is delivered behind that API/)).toBeDefined();

    await screen.findByText("Local API connected");
  });

  it("links into the M2-B topology application", async () => {
    stubHealthEndpoint({
      ok: true,
      jsonPayload: { status: "ok", service: "atlast-api" },
    });

    render(<App />);

    const enterLink = screen.getByRole("link", {
      name: /Explore topology/,
    });
    expect(enterLink.getAttribute("href")).toBe("/topology");

    await screen.findByText("Local API connected");
  });
});

describe("App — API health states", () => {
  it("shows the online state for a valid health response", async () => {
    const fetchStub = stubHealthEndpoint({
      ok: true,
      jsonPayload: { status: "ok", service: "atlast-api" },
    });

    render(<App />);

    expect(await screen.findByText("Local API connected")).toBeDefined();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [requestedPath, requestInit] = fetchStub.mock.calls[0] ?? [];
    expect(requestedPath).toBe("/api/health");
    // The health check must be abortable so unmounting cleans up in-flight
    // requests.
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("shows the unavailable state when the request fails", async () => {
    stubHealthEndpoint({
      ok: false,
      rejectWith: new Error("connection refused"),
    });

    render(<App />);

    expect(await screen.findByText("Local API unavailable")).toBeDefined();
  });

  it("shows the unavailable state for a non-2xx response", async () => {
    stubHealthEndpoint({ ok: false, jsonPayload: {} });

    render(<App />);

    expect(await screen.findByText("Local API unavailable")).toBeDefined();
  });

  it("shows the unavailable state for a malformed payload", async () => {
    stubHealthEndpoint({
      ok: true,
      jsonPayload: { status: "ok", service: "not-the-atlast-api" },
    });

    render(<App />);

    expect(await screen.findByText("Local API unavailable")).toBeDefined();
  });
});
