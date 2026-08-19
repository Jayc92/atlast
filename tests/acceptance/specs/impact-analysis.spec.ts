/**
 * M4-D built-preview acceptance hardening for the M4-C entity-scoped impact
 * panel (ADR-0032/0033/0034; docs/m4-plan.md § 6). No M4-A/B/C checkpoint
 * added browser-acceptance coverage for impact analysis — every check here
 * runs against the real built API and built web preview, never a mock, and
 * exercises the primary desktop/mobile impact journey, copied-link
 * reproducibility, the honest empty-result state (ADR-0032 § 5), evidence-path
 * drill-down through the real fixture-backed repositories, keyboard operation
 * and focus return, reduced motion/responsive reflow, and an honest,
 * retryable impact-query failure.
 *
 * `web`'s real retained downstream topology (`web -> api -> worker ->
 * archive`, depth 3) and `orders`'s real zero-Relationship-evidence topology
 * are the same fixtures the M4-B accuracy harness scenarios 01 and 04 already
 * prove the deterministic engine ranks correctly
 * (fixtures/demo-company/impact-scenarios/scenarios/{01,04}-*.json) — this
 * suite proves the browser renders that real, already-verified server output
 * honestly, not a second copy of the engine's own correctness.
 */
import { expect, test } from "@playwright/test";

test("the primary impact journey ranks real dependents, labels change type, and drills into real evidence", async ({
  page,
}) => {
  await page.goto("/entities/atlast:entity:web?direction=downstream&depth=3");

  const invoker = page.getByRole("button", {
    name: "Analyze impact on atlast:entity:web",
  });
  await expect(invoker).toBeVisible();
  await invoker.click();

  // Opening impact from the entity summary sets `selected` as a side effect
  // (ADR-0034 § 1), which also opens a trust inspector for the same Entity —
  // every impact-panel-scoped assertion below is scoped to `.impact-panel`
  // so it never collides with that separate, identically-headed dialog.
  const panel = page.locator(".impact-panel");
  const heading = panel.getByRole("heading", {
    level: 2,
    name: "Impact analysis",
  });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(panel.getByText(/not a prediction, risk score/i)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("changeType")).toBe("removal");

  // The real deterministic engine's exact ranked order for this retained
  // topology (fixtures/.../scenarios/01-web-downstream-removal-invariance.json).
  const results = panel.locator(".impact-result");
  await expect(results).toHaveCount(3);
  await expect(results.nth(0)).toContainText("atlast:entity:api");
  await expect(results.nth(0)).toContainText(
    "0.5 — uncalibrated synthetic score",
  );
  await expect(results.nth(0)).toContainText("1 edge");
  await expect(results.nth(1)).toContainText("atlast:entity:worker");
  await expect(results.nth(1)).toContainText("2 edges");
  await expect(results.nth(2)).toContainText("atlast:entity:archive");
  await expect(results.nth(2)).toContainText("3 edges");

  await panel.getByLabel("Hypothetical change").selectOption("degradation");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("changeType"))
    .toBe("degradation");
  await expect(results).toHaveCount(3);
  await expect(results.nth(0)).toContainText(
    "0.5 — uncalibrated synthetic score",
  );

  const inspectButton = panel.getByRole("button", {
    name: "Inspect evidence for atlast:entity:api step 1",
  });
  await inspectButton.click();
  const inspectorHeading = panel.getByRole("heading", {
    name: "Trust inspector",
  });
  await expect(inspectorHeading).toBeVisible();
  await expect(inspectorHeading).toBeFocused();
  await expect(
    panel.getByRole("heading", { name: "Dereferenced Evidence" }),
  ).toBeVisible();
  await expect(panel.getByText("Observed").first()).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);

  await panel.getByRole("button", { name: "Close inspector" }).click();
  await expect(inspectorHeading).toHaveCount(0);
  await expect(inspectButton).toBeFocused();

  await panel.getByRole("button", { name: "Close impact panel" }).click();
  await expect(heading).toHaveCount(0);
  await expect(invoker).toBeFocused();
  expect(new URL(page.url()).searchParams.has("changeType")).toBe(false);
  // Closing the impact panel also closes the trust inspector that only
  // opened as its side effect — no dialog the user never asked for lingers.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a copied impact link reproduces the same ranked results directly, with no interaction required", async ({
  page,
}) => {
  await page.goto(
    "/entities/atlast:entity:web?direction=downstream&depth=3&selected=" +
      encodeURIComponent("atlast:entity:web") +
      "&changeType=interface-change",
  );

  await expect(
    page.getByRole("heading", { level: 2, name: "Impact analysis" }),
  ).toBeVisible();
  await expect(page.getByLabel("Hypothetical change")).toHaveValue(
    "interface-change",
  );
  const results = page.locator(".impact-result");
  await expect(results).toHaveCount(3);
  await expect(results.nth(0)).toContainText("atlast:entity:api");
});

test("an origin with no qualifying Relationship evidence renders the honest empty-result state, never an error", async ({
  page,
}) => {
  await page.goto(
    "/entities/atlast:entity:orders?direction=downstream&depth=2",
  );

  await page
    .getByRole("button", { name: "Analyze impact on atlast:entity:orders" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Impact analysis" }),
  ).toBeVisible();
  await expect(
    page.getByText("No reachable entities meet these bounds."),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".impact-result")).toHaveCount(0);
});

test("an intercepted impact-query failure renders a redacted, retryable failure and recovers with real results", async ({
  page,
}) => {
  let failImpact = true;
  await page.route("**/api/v1/entities/*/impact?*", async (route) => {
    if (!failImpact) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "text/plain",
      body: "deliberately malformed, not a validated impact envelope",
    });
  });

  await page.goto("/entities/atlast:entity:web?direction=downstream&depth=3");
  await page
    .getByRole("button", { name: "Analyze impact on atlast:entity:web" })
    .click();

  const failure = page.getByRole("alert").filter({
    hasText: "isn’t safe to show directly",
  });
  await expect(failure).toBeVisible();
  await expect(page.locator(".impact-result")).toHaveCount(0);

  failImpact = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.locator(".impact-result")).toHaveCount(3);
});

test("the impact journey is reachable by keyboard alone, including evidence drill-down and close", async ({
  page,
}) => {
  await page.goto("/entities/atlast:entity:web?direction=downstream&depth=3");

  const invoker = page.getByRole("button", {
    name: "Analyze impact on atlast:entity:web",
  });
  await invoker.focus();
  await page.keyboard.press("Enter");

  // Scoped to `.impact-panel`: opening impact also opens a same-headed trust
  // inspector for this Entity as a side effect (ADR-0034 § 1).
  const panel = page.locator(".impact-panel");
  const heading = panel.getByRole("heading", {
    level: 2,
    name: "Impact analysis",
  });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();

  const inspectButton = panel.getByRole("button", {
    name: "Inspect evidence for atlast:entity:api step 1",
  });
  await inspectButton.focus();
  await page.keyboard.press("Enter");
  const inspectorHeading = panel.getByRole("heading", {
    name: "Trust inspector",
  });
  await expect(inspectorHeading).toBeVisible();
  await expect(inspectorHeading).toBeFocused();

  await panel.getByRole("button", { name: "Close inspector" }).focus();
  await page.keyboard.press("Enter");
  await expect(inspectorHeading).toHaveCount(0);
  await expect(inspectButton).toBeFocused();

  await panel.getByRole("button", { name: "Close impact panel" }).focus();
  await page.keyboard.press("Enter");
  await expect(heading).toHaveCount(0);
  await expect(invoker).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("reduced motion and narrow/mobile layout hold with the impact panel open, with no horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/entities/atlast:entity:web?direction=downstream&depth=3");
  await page
    .getByRole("button", { name: "Analyze impact on atlast:entity:web" })
    .click();

  const panel = page.locator(".impact-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS("transition-duration", "0s");

  const horizontalOverflowPixels = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(horizontalOverflowPixels).toBe(0);

  if (testInfo.project.name === "mobile-chromium") {
    // Narrow layouts present the impact panel as one primary pane, not a
    // desktop-sized ranked table (ADR-0034 § 6): the header stacks instead of
    // sitting side-by-side with the close control.
    await expect(page.locator(".impact-panel-header")).toHaveCSS(
      "display",
      "grid",
    );
  }
});
