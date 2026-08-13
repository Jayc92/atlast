import { expect, test, type Page } from "@playwright/test";

async function usedBrowserHeapBytes(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const memory = (
      performance as Performance & {
        readonly memory?: { readonly usedJSHeapSize: number };
      }
    ).memory;
    return memory?.usedJSHeapSize ?? null;
  });
}

test("bounded topology graph and structured view remain equivalent", async ({
  page,
}, testInfo) => {
  const heapSamples: number[] = [];
  await page.goto("/topology");
  const inventoryHeap = await usedBrowserHeapBytes(page);
  if (inventoryHeap !== null) {
    heapSamples.push(inventoryHeap);
  }

  const traversalStartedAt = Date.now();
  const traversalResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/traversal?"),
  );
  await page.getByRole("link", { name: /atlast:entity:checkout/ }).click();
  const traversalResponse = await traversalResponsePromise;
  const coordinatedReadLatencyMs = Date.now() - traversalStartedAt;
  const traversalPayload = (await traversalResponse.json()) as {
    readonly items: readonly unknown[];
    readonly traversal: {
      readonly truncated: boolean;
      readonly subjectCount: number;
    };
  };

  await expect(
    page.getByRole("heading", { name: "Relationship workspace" }),
  ).toBeVisible();
  const initialEntityUrl = new URL(page.url());
  expect(decodeURIComponent(initialEntityUrl.pathname)).toBe(
    "/entities/atlast:entity:checkout",
  );
  expect(initialEntityUrl.search).toBe("");

  if (testInfo.project.name === "mobile-chromium") {
    await expect(page.getByLabel("Structured topology view")).toBeVisible();
  } else {
    await expect(page.getByLabel("Interactive topology graph")).toBeVisible();
    const graphHeap = await usedBrowserHeapBytes(page);
    if (graphHeap !== null) {
      heapSamples.push(graphHeap);
    }
    await page.getByRole("button", { name: "Structured" }).click();
  }

  await expect(page.getByLabel("Structured topology view")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Relationship candidates" }),
  ).toBeVisible();
  await expect(
    page.getByText(/checkout/, { exact: false }).first(),
  ).toBeVisible();

  const firstSelectable = page
    .getByLabel("Structured topology view")
    .getByRole("button")
    .first();
  await firstSelectable.click();
  await expect(firstSelectable).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/selected=/);
  const selectedUrl = new URL(page.url());
  expect(selectedUrl.searchParams.has("asOf")).toBe(false);
  expect(selectedUrl.searchParams.has("horizon")).toBe(false);
  expect(selectedUrl.searchParams.has("derivationVersion")).toBe(false);
  const structuredHeap = await usedBrowserHeapBytes(page);
  if (structuredHeap !== null) {
    heapSamples.push(structuredHeap);
  }

  const horizontalOverflowPixels = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(horizontalOverflowPixels).toBe(0);

  test.info().annotations.push({
    type: "m2-c-measurement",
    description: JSON.stringify({
      coordinatedReadLatencyMs,
      traversalItemCount: traversalPayload.items.length,
      traversalSubjectCount: traversalPayload.traversal.subjectCount,
      traversalTruncated: traversalPayload.traversal.truncated,
      sampledPeakBrowserHeapBytes:
        heapSamples.length > 0 ? Math.max(...heapSamples) : null,
    }),
  });
});
