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

interface SnapshotIdentity {
  readonly asOf: string;
  readonly horizon: number;
  readonly derivationVersion: string;
}

interface SnapshotAnchor {
  readonly identity: SnapshotIdentity;
  readonly checksum: string;
  readonly subjectCount: number;
}

interface SnapshotAnchorsPayload {
  readonly items: readonly SnapshotAnchor[];
  readonly truncated: boolean;
  readonly meta: {
    readonly resolvedHorizon: number;
    readonly derivationVersion: string;
  };
}

interface SearchPayload {
  readonly items: readonly {
    readonly subject: {
      readonly subjectKind: "entity" | "relationship";
      readonly identifier: string;
    };
    readonly assertions: readonly {
      readonly revision: { readonly provenance: readonly string[] };
    }[];
  }[];
}

function pinParameters(identity: SnapshotIdentity): URLSearchParams {
  return new URLSearchParams({
    asOf: identity.asOf,
    horizon: String(identity.horizon),
    derivationVersion: identity.derivationVersion,
  });
}

test("historical playback preserves complete pins and Relationship Evidence traceability", async ({
  page,
  request,
}, testInfo) => {
  const anchorStartedAt = Date.now();
  const anchorsResponse = await request.get("/api/v1/snapshot-anchors");
  const anchorRouteLatencyMs = Date.now() - anchorStartedAt;
  expect(anchorsResponse.status()).toBe(200);
  const anchors = (await anchorsResponse.json()) as SnapshotAnchorsPayload;
  expect(anchors.items.length).toBeGreaterThan(0);

  let historical:
    | {
        readonly anchor: SnapshotAnchor;
        readonly relationshipIdentifier: string;
        readonly evidenceIdentifier: string;
      }
    | undefined;
  for (const anchor of anchors.items) {
    const query = pinParameters(anchor.identity);
    query.set("q", "atlast:relationship:");
    query.set("limit", "100");
    const searchResponse = await request.get(
      `/api/v1/search?${query.toString()}`,
    );
    expect(searchResponse.status()).toBe(200);
    const search = (await searchResponse.json()) as SearchPayload;
    const relationship = search.items.find(
      (item) =>
        item.subject.subjectKind === "relationship" &&
        item.assertions.some(
          (assertion) => assertion.revision.provenance.length > 0,
        ),
    );
    const evidenceIdentifier =
      relationship?.assertions[0]?.revision.provenance[0];
    if (relationship !== undefined && evidenceIdentifier !== undefined) {
      historical = {
        anchor,
        relationshipIdentifier: relationship.subject.identifier,
        evidenceIdentifier,
      };
      break;
    }
  }
  expect(historical).toBeDefined();
  if (historical === undefined) return;

  const copiedPin = pinParameters(historical.anchor.identity);
  copiedPin.set("q", historical.relationshipIdentifier);
  await page.goto(`/topology?${copiedPin.toString()}`);
  const historyRegion = page.getByRole("region", { name: "History playback" });
  await expect(
    historyRegion.getByText("Requested historical snapshot"),
  ).toBeVisible();
  await expect(
    historyRegion.getByText(historical.anchor.identity.asOf, { exact: false }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`horizon=${String(historical.anchor.identity.horizon)}`),
  );

  await page.reload();
  await expect(
    historyRegion.getByText("Requested historical snapshot"),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: `Inspect ${historical.relationshipIdentifier}`,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Trust inspector" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dereferenced Evidence" }),
  ).toBeVisible();
  await expect(
    page.getByText(historical.evidenceIdentifier, { exact: true }).last(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Browse history" }).click();
  await page
    .getByLabel("Retained observation anchor")
    .selectOption(
      `${historical.anchor.identity.asOf}|${String(historical.anchor.identity.horizon)}|${historical.anchor.identity.derivationVersion}`,
    );
  await expect(page.getByText("Checksum")).toBeVisible();
  await expect(
    page.getByText(historical.anchor.checksum, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(String(historical.anchor.subjectCount), { exact: true }),
  ).toBeVisible();
  testInfo.annotations.push({
    type: "m2-e-measurement",
    description: JSON.stringify({
      anchorRouteLatencyMs,
      anchorCount: anchors.items.length,
      anchorTruncated: anchors.truncated,
      usedBrowserHeapBytes: await usedBrowserHeapBytes(page),
    }),
  });
});

test("an invalid copied historical coordinate remains visible and never falls back to latest", async ({
  page,
  request,
}) => {
  const anchorsResponse = await request.get("/api/v1/snapshot-anchors");
  const anchors = (await anchorsResponse.json()) as SnapshotAnchorsPayload;
  const anchor = anchors.items[0];
  expect(anchor).toBeDefined();
  if (anchor === undefined) return;

  const invalidIdentity = {
    ...anchor.identity,
    horizon: anchors.meta.resolvedHorizon + 1,
  };
  await page.goto(`/topology?${pinParameters(invalidIdentity).toString()}`);

  const historyRegion = page.getByRole("region", { name: "History playback" });
  await expect(
    historyRegion.getByText("Requested historical snapshot"),
  ).toBeVisible();
  await expect(
    historyRegion.getByText(`horizon ${String(invalidIdentity.horizon)}`, {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText(/Snapshot: pinned/)).toBeVisible();
  await expect(page.getByText(/Snapshot: latest/)).toHaveCount(0);

  const latestResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/entities?limit=1") &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Return to latest" }).click();
  await latestResponse;
  const latestUrl = new URL(page.url());
  expect(latestUrl.searchParams.has("asOf")).toBe(false);
  expect(latestUrl.searchParams.has("horizon")).toBe(false);
  expect(latestUrl.searchParams.has("derivationVersion")).toBe(false);
  await expect(page.getByText(/Snapshot: latest/)).toBeVisible();
});
