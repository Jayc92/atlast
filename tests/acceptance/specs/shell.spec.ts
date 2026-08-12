/**
 * M0 primary shell journey (ADR-0010).
 *
 * One journey, run in both Chromium projects (desktop and mobile): the built
 * web shell loads in a real browser, renders the foundation page, and reaches
 * the "Local API connected" state through the genuine Vite preview proxy and
 * the built API server. Every assertion is web-first (auto-waiting) — fixed
 * sleeps are banned by ADR-0010 and GUARDRAILS.md § 5.
 */
import {
  expect,
  test,
  type ConsoleMessage,
  type Request,
} from "@playwright/test";

test("the M0 shell renders and connects to the local API", async ({ page }) => {
  // Observability hooks must be attached before navigation so nothing —
  // including the document request itself — escapes them.
  const browserConsoleErrors: string[] = [];
  const uncaughtPageErrors: string[] = [];
  const observedRequestUrls: string[] = [];

  page.on("console", (consoleMessage: ConsoleMessage) => {
    if (consoleMessage.type() === "error") {
      browserConsoleErrors.push(consoleMessage.text());
    }
  });
  page.on("pageerror", (pageError: Error) => {
    uncaughtPageErrors.push(pageError.message);
  });
  page.on("request", (request: Request) => {
    observedRequestUrls.push(request.url());
  });

  await page.goto("/");

  // The document identifies itself as Atlast.
  await expect(page).toHaveTitle(/Atlast/);

  // The hero content is visible: the Atlast h1 and the product tagline.
  await expect(
    page.getByRole("heading", { level: 1, name: "Atlast" }),
  ).toBeVisible();
  await expect(
    page.getByText("The living map of your engineering organization."),
  ).toBeVisible();

  // The current-state section names the active milestone.
  await expect(
    page.getByRole("heading", { name: /M0 — Safe project foundation/ }),
  ).toBeVisible();

  // The shell must not overclaim its own scope: M0 and M1 both show
  // delivered, every later milestone still shows gated, and M1 is named
  // as delivered behind the API — not as UI this page provides.
  await expect(page.getByText("delivered").first()).toBeVisible();
  await expect(page.getByText(/M1 is delivered behind that API/)).toBeVisible();

  // The health indicator must reach "connected" through the real proxied
  // round trip (browser → Vite preview /api proxy → built API /health).
  // The web-first assertion auto-waits through the transient "Checking
  // local API…" state; once connected, the failure state must be absent.
  await expect(page.getByRole("status")).toHaveText(/Local API connected/);
  await expect(page.getByText("Local API unavailable")).toBeHidden();

  // Exactly one h1 — the page has a single document heading.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  // No horizontal overflow at this viewport: the document must not be wider
  // than its scroll container (the reviewer checked this manually at both
  // viewports; this automates that check).
  const horizontalOverflowPixels: number = await page.evaluate(() => {
    const documentElement = document.documentElement;
    return documentElement.scrollWidth - documentElement.clientWidth;
  });
  expect(horizontalOverflowPixels).toBe(0);

  // The whole journey stays on the loopback interface — any request to a
  // non-loopback host would violate the M0 synthetic-data-only guarantee.
  const nonLoopbackRequestUrls: string[] = observedRequestUrls.filter(
    (requestUrl: string) => new URL(requestUrl).hostname !== "127.0.0.1",
  );
  expect(nonLoopbackRequestUrls).toEqual([]);

  // A clean console and zero uncaught errors are part of the acceptance bar.
  expect(browserConsoleErrors).toEqual([]);
  expect(uncaughtPageErrors).toEqual([]);
});
