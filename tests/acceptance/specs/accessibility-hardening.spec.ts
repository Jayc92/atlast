/**
 * M2-F accessibility/keyboard/reduced-motion/honest-failure hardening
 * (docs/m2-plan.md § 10 M2-F: "accessibility and responsive hardening of the
 * existing M2 interface" and § 11: "keyboard operation," "reduced motion,"
 * and "Honest failure: API unavailable or deterministic intercepted error
 * renders a visible, non-stale failure state" — none of which had dedicated
 * acceptance coverage through M2-A/E). Every check here runs against the
 * real built API and built web preview, not a mock.
 */
import { expect, test } from "@playwright/test";

interface EntityInventoryPayload {
  readonly meta: {
    readonly resolvedIdentity: {
      readonly asOf: string;
      readonly horizon: number;
      readonly derivationVersion: string;
    };
  };
}

test("the interactive graph viewport is keyboard-operable and shows a visible focus indicator", async ({
  page,
}) => {
  await page.goto("/entities/atlast:entity:checkout?view=graph");
  await expect(page.getByLabel("Interactive topology graph")).toBeVisible();

  const node = page.locator('[data-id="atlast:entity:checkout"]');
  await expect(node).toBeVisible();
  await node.focus();

  // The interaction library's own stylesheet sets `outline: none` on every
  // focused, selectable node/edge; the M2-F CSS override must restore a
  // real, visible indicator rather than leaving keyboard focus invisible.
  await expect(node).toHaveCSS("outline-style", "solid");
  await expect(node).toHaveCSS("outline-width", "3px");

  // The interaction library's own keydown handler updates only its internal
  // selection store and never calls back into the application — pressing
  // Enter here must still open the trust inspector, exactly as a mouse
  // click on the same node already does.
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Trust inspector" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close inspector" }).click();

  // React Flow renders edges as focusable SVG <g> elements rather than HTML
  // elements. Exercise that real DOM shape so edge keyboard activation cannot
  // be accidentally covered only by the unit test's component mock.
  const edge = page.locator(".react-flow__edge").first();
  await expect(edge).toBeVisible();
  await edge.focus();
  await expect(edge.locator(".react-flow__edge-path")).toHaveCSS(
    "stroke-width",
    "3px",
  );
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("heading", { name: "Trust inspector" }),
  ).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("selected"))
    .toMatch(/^atlast:relationship:/);
});

test("a full search-to-trust-inspection journey is reachable by keyboard alone", async ({
  page,
}) => {
  await page.goto("/topology");

  await page.getByLabel("Search by exact identifier").focus();
  await page.keyboard.type("checkout");
  await page.keyboard.press("Enter");

  const entityLink = page.getByRole("link", { name: /atlast:entity:checkout/ });
  await expect(entityLink).toBeVisible();
  await entityLink.focus();
  await page.keyboard.press("Enter");

  const inspectButton = page.getByRole("button", {
    name: "Inspect entity trust",
  });
  await expect(inspectButton).toBeVisible();
  await inspectButton.focus();
  await page.keyboard.press("Enter");

  const inspectorHeading = page.getByRole("heading", {
    name: "Trust inspector",
  });
  await expect(inspectorHeading).toBeVisible();
  await expect(inspectorHeading).toBeFocused();

  await page.getByRole("button", { name: "Close inspector" }).focus();
  await page.keyboard.press("Enter");
  await expect(inspectorHeading).toHaveCount(0);
  await expect(inspectButton).toBeFocused();
});

test("the graph viewport disables non-essential motion under prefers-reduced-motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/entities/atlast:entity:checkout?view=graph");
  const viewport = page.locator(".react-flow__viewport");
  await expect(viewport).toBeVisible();
  await expect(viewport).toHaveCSS("transition-duration", "0s");
  await expect(viewport).toHaveCSS("animation-duration", "0s");
});

test("an intercepted API failure renders a visible, non-stale failure state and recovers on retry", async ({
  page,
  request,
}) => {
  const probeResponse = await request.get("/api/v1/entities?limit=1");
  expect(probeResponse.status()).toBe(200);
  const { meta } = (await probeResponse.json()) as EntityInventoryPayload;
  const pin = new URLSearchParams({
    asOf: meta.resolvedIdentity.asOf,
    horizon: String(meta.resolvedIdentity.horizon),
    derivationVersion: meta.resolvedIdentity.derivationVersion,
  });

  let interceptFailures = true;
  await page.route("**/api/v1/entities?*", async (route) => {
    if (!interceptFailures) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "text/plain",
      body: "deliberately malformed, not a validated error envelope",
    });
  });

  await page.goto(`/topology?${pin.toString()}`);

  const failure = page.getByRole("alert").filter({
    hasText: "Something went wrong loading this data",
  });
  await expect(failure).toBeVisible();
  // The failure must not be mistaken for an empty inventory: the honest
  // failure text is visible, and no inventory list has rendered underneath.
  await expect(page.locator(".topology-result-list")).toHaveCount(0);

  interceptFailures = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.locator(".topology-result-list")).toBeVisible();
});
