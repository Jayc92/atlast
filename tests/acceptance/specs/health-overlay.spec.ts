/**
 * M3-E built-preview acceptance hardening for the M3-D synthetic operational
 * overlay (ADR-0029/0030/0031). None of the M3-A through M3-D checkpoints
 * added browser-acceptance coverage for the overlay — every check here runs
 * against the real built API and built web preview, never a mock, and
 * exercises the six effective states, an unknown-target gap, historical
 * frame coordination, keyboard operation, structured/graph equivalence,
 * reduced motion, zoom/responsive reflow, and honest overlay-failure retry.
 */
import { expect, test, type Page } from "@playwright/test";

interface OverlayMeta {
  readonly resolvedIdentity: {
    readonly asOf: string;
    readonly horizon: number;
    readonly derivationVersion: string;
  };
}

interface HealthContextPayload {
  readonly meta: OverlayMeta;
}

function pinParameters(
  identity: OverlayMeta["resolvedIdentity"],
): URLSearchParams {
  return new URLSearchParams({
    asOf: identity.asOf,
    horizon: String(identity.horizon),
    derivationVersion: identity.derivationVersion,
  });
}

function borderStyleOf(page: Page, entityId: string): Promise<string> {
  return page
    .locator(`[data-id="${entityId}"]`)
    .evaluate((element) => getComputedStyle(element).borderStyle);
}

/**
 * Border pattern changes flow through an async React re-render triggered by
 * a URL/state update (e.g. an emphasis checkbox), so this must poll rather
 * than read the computed style exactly once.
 */
async function expectBorderStyle(
  page: Page,
  entityId: string,
  style: string,
): Promise<void> {
  await expect.poll(() => borderStyleOf(page, entityId)).toBe(style);
}

test("the graph and structured views present latent downstream risk, a direct condition, and an unknown-target gap with non-color patterns", async ({
  page,
}, testInfo) => {
  const startedAt = Date.now();
  const healthContextResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/health-context?"),
  );
  await page.goto(
    "/entities/atlast:entity:checkout?health=on&direction=downstream&depth=1",
  );
  const healthContextResponse = await healthContextResponsePromise;
  const latencyMs = Date.now() - startedAt;
  const coordinate = page.locator(".health-overlay-coordinate");
  await expect(coordinate).toBeVisible();
  await expect(coordinate).toContainText(
    "atlast:overlay-frame:demo-company/active-conditions",
  );

  const gapsRegion = page.getByRole("region", {
    name: "Unknown overlay targets",
  });
  await expect(gapsRegion).toBeVisible();
  await expect(gapsRegion).toContainText("atlast:entity:retired-billing");
  await expect(gapsRegion).toContainText(
    "Unknown entity at the resolved topology snapshot.",
  );

  const isMobile = testInfo.project.name === "mobile-chromium";
  if (!isMobile) {
    await expect(page.getByLabel("Interactive topology graph")).toBeVisible();
    await expectBorderStyle(page, "atlast:entity:checkout", "ridge");
    await expectBorderStyle(page, "atlast:entity:fulfillment", "double");
    await expect(
      page.locator('[data-id="atlast:entity:checkout"]'),
    ).toContainText("Latent downstream risk");
    await expect(
      page.locator('[data-id="atlast:entity:fulfillment"]'),
    ).toContainText("Down");

    // Unchecking a state's emphasis is presentation only, never a topology
    // filter (ADR-0031 § 1): the "Down" node keeps its text label but loses
    // its distinct pattern, and no node/edge disappears.
    const downEmphasisCheckbox = page.getByRole("checkbox", {
      name: "Down",
      exact: true,
    });
    // `.uncheck()`/`.check()` read the DOM `checked` attribute for their
    // pre-click actionability check, but this controlled checkbox only ever
    // updates the live `checked` property on re-render — the attribute
    // stays frozen at its initial render value. A plain click toggles the
    // real state correctly; asserting the resulting URL/pattern proves it.
    await downEmphasisCheckbox.click();
    await expectBorderStyle(page, "atlast:entity:fulfillment", "dotted");
    await expect(
      page.locator('[data-id="atlast:entity:fulfillment"]'),
    ).toContainText("Down");
    await downEmphasisCheckbox.click();
    await expectBorderStyle(page, "atlast:entity:fulfillment", "double");

    await page.getByRole("button", { name: "Structured" }).click();
  }

  const structured = page.getByLabel("Structured topology view");
  await expect(structured).toBeVisible();
  await expect(structured).toContainText("Latent downstream risk");
  await expect(structured).toContainText(
    "derived from atlast:entity:fulfillment (Down)",
  );
  await expect(structured).toContainText("Down");

  const healthContextPayload =
    (await healthContextResponse.json()) as HealthContextPayload;
  test.info().annotations.push({
    type: "m3-e-measurement",
    description: JSON.stringify({
      healthContextLatencyMs: latencyMs,
      resolvedHorizon: healthContextPayload.meta.resolvedIdentity.horizon,
    }),
  });
});

test("keyboard alone can enable the overlay and reach the gaps panel", async ({
  page,
}) => {
  await page.goto(
    "/entities/atlast:entity:checkout?direction=downstream&depth=1",
  );

  const toggle = page.getByLabel("Show synthetic operational overlay");
  const healthContextResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/health-context?"),
  );
  await toggle.focus();
  await page.keyboard.press("Space");
  await healthContextResponsePromise;

  const gapsRegion = page.getByRole("region", {
    name: "Unknown overlay targets",
  });
  await expect(gapsRegion).toBeVisible();

  let reachedGapsByKeyboard = false;
  for (let step = 0; step < 20 && !reachedGapsByKeyboard; step += 1) {
    await page.keyboard.press("Tab");
    reachedGapsByKeyboard = await gapsRegion.evaluate(
      (element) => element === document.activeElement,
    );
  }
  expect(reachedGapsByKeyboard).toBe(true);
});

test("a historical overlay frame reports healthy, degraded, expiring-certificate, and disconnected without removing topology edges", async ({
  page,
  request,
}) => {
  const discovery = await request.get(
    "/api/v1/entities/atlast:entity:api/health-context?direction=downstream&depth=1",
  );
  expect(discovery.status()).toBe(200);
  const { meta } = (await discovery.json()) as HealthContextPayload;
  const pin = pinParameters(meta.resolvedIdentity);
  const baselineFrame = "atlast:overlay-frame:demo-company/baseline";

  // Depth 1 downstream from `api` reaches only `worker` (unreported under
  // the baseline frame), so `api` itself stays directly and effectively
  // healthy — a deeper traversal would reach the disconnected `archive` and
  // turn `api` into latent-downstream-risk instead, which is exercised in
  // the checkout/fulfillment scenario above.
  const apiQuery = new URLSearchParams(pin);
  apiQuery.set("health", "on");
  apiQuery.set("direction", "downstream");
  apiQuery.set("depth", "1");
  apiQuery.set("overlayFrame", baselineFrame);
  apiQuery.set("view", "graph");
  await page.goto(`/entities/atlast:entity:api?${apiQuery.toString()}`);
  await expect(page.locator(".health-overlay-coordinate")).toContainText(
    baselineFrame,
  );
  await expectBorderStyle(page, "atlast:entity:api", "solid");
  await expect(page.locator('[data-id="atlast:entity:api"]')).toContainText(
    "Healthy",
  );
  await expectBorderStyle(page, "atlast:entity:worker", "dotted");
  await expect(page.locator('[data-id="atlast:entity:worker"]')).toContainText(
    "No overlay report",
  );

  // Originating from `archive` itself (upstream depth 1) reports its own
  // direct `disconnected` condition without deriving latent risk for it
  // (only a directly healthy Entity may derive latent risk, ADR-0029 § 3),
  // and proves disconnected does not remove the incoming relationship edge.
  const archiveQuery = new URLSearchParams(pin);
  archiveQuery.set("health", "on");
  archiveQuery.set("direction", "upstream");
  archiveQuery.set("depth", "1");
  archiveQuery.set("overlayFrame", baselineFrame);
  archiveQuery.set("view", "graph");
  await page.goto(`/entities/atlast:entity:archive?${archiveQuery.toString()}`);
  await expect(page.locator(".health-overlay-coordinate")).toContainText(
    baselineFrame,
  );
  await expectBorderStyle(page, "atlast:entity:archive", "groove");
  await expect(page.locator('[data-id="atlast:entity:archive"]')).toContainText(
    "Disconnected",
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  const notificationsQuery = new URLSearchParams(pin);
  notificationsQuery.set("health", "on");
  notificationsQuery.set("direction", "downstream");
  notificationsQuery.set("depth", "1");
  notificationsQuery.set("overlayFrame", baselineFrame);
  notificationsQuery.set("view", "graph");
  await page.goto(
    `/entities/atlast:entity:notifications?${notificationsQuery.toString()}`,
  );
  await expect(
    page.locator('[data-id="atlast:entity:notifications"]'),
  ).toContainText("Expiring certificate");
  await expectBorderStyle(page, "atlast:entity:notifications", "dashed");

  await page.goto(
    "/entities/atlast:entity:orders?health=on&direction=downstream&depth=1&view=graph",
  );
  await expect(page.locator('[data-id="atlast:entity:orders"]')).toContainText(
    "Degraded",
  );
  await expectBorderStyle(page, "atlast:entity:orders", "dashed");
});

test("reduced motion and zoom/responsive reflow hold with the overlay enabled", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    "/entities/atlast:entity:checkout?health=on&direction=downstream&depth=1&view=graph",
  );
  await expect(page.locator(".health-overlay-coordinate")).toBeVisible();
  const node = page.locator('[data-id="atlast:entity:checkout"]');
  await expect(node).toBeVisible();
  await expect(node).toHaveCSS("transition-duration", "0s");

  if (testInfo.project.name !== "mobile-chromium") {
    const viewport = page.locator(".react-flow__viewport");
    const initialTransform = await viewport.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await page.locator(".react-flow__controls-zoomin").click();
    await expect
      .poll(() =>
        viewport.evaluate((element) => getComputedStyle(element).transform),
      )
      .not.toBe(initialTransform);
  }

  const horizontalOverflowPixels = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(horizontalOverflowPixels).toBe(0);
});

test("an overlay failure surfaces a distinct retryable error while base topology remains visible, and recovers", async ({
  page,
}) => {
  let failOverlay = true;
  await page.route("**/api/v1/entities/*/health-context?*", async (route) => {
    if (!failOverlay) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "text/plain",
      body: "deliberately malformed, not a validated error envelope",
    });
  });

  await page.goto(
    "/entities/atlast:entity:checkout?health=on&direction=downstream&depth=1",
  );

  const overlayFailure = page.getByRole("alert").filter({
    hasText: "The synthetic operational overlay could not be loaded",
  });
  await expect(overlayFailure).toBeVisible();
  // Base topology remains visible and unaffected by the overlay failure.
  await expect(
    page.getByRole("heading", { name: "Relationship workspace" }),
  ).toBeVisible();
  await expect(page.locator(".health-overlay-coordinate")).toHaveCount(0);

  failOverlay = false;
  const healthContextResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/health-context?"),
  );
  await page.getByRole("button", { name: "Try the overlay again" }).click();
  await healthContextResponsePromise;
  await expect(overlayFailure).toHaveCount(0);
  await expect(page.locator(".health-overlay-coordinate")).toBeVisible();
});
