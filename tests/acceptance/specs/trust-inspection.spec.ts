/**
 * M2-F browser-acceptance expansion: trust inspection had no dedicated
 * acceptance coverage through M2-D/M2-E (docs/m2-plan.md § 11 names it as a
 * required M2 primary journey — "Desktop: inventory -> entity -> traversal
 * -> relationship -> Evidence" — but no acceptance spec exercised the trust
 * inspector or Evidence dereferencing against the real built API before this
 * slice). This proves, against the real built API and built web preview,
 * that both entity-detail trust inspection (Journey A/C) and exact-Relationship
 * rehydration through search (Journey B/C) open the same trust inspector,
 * dereference real Evidence, and return focus to the invoking control on
 * close — in both the desktop and mobile projects.
 */
import { expect, test } from "@playwright/test";

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

async function findRelationshipWithEvidence(
  request: import("@playwright/test").APIRequestContext,
): Promise<{
  readonly identifier: string;
  readonly evidenceIdentifier: string;
}> {
  const response = await request.get(
    "/api/v1/search?q=atlast:relationship:&limit=100",
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as SearchPayload;
  for (const item of payload.items) {
    if (item.subject.subjectKind !== "relationship") {
      continue;
    }
    const evidenceIdentifier = item.assertions[0]?.revision.provenance[0];
    if (evidenceIdentifier !== undefined) {
      return { identifier: item.subject.identifier, evidenceIdentifier };
    }
  }
  throw new Error(
    "No Relationship subject with dereferenceable provenance was found in the fixture catalog",
  );
}

test("entity trust inspection dereferences real Evidence and returns focus on close", async ({
  page,
}) => {
  await page.goto("/entities/atlast:entity:checkout");
  const inspectButton = page.getByRole("button", {
    name: "Inspect entity trust",
  });
  await inspectButton.click();

  const inspectorHeading = page.getByRole("heading", {
    name: "Trust inspector",
  });
  await expect(inspectorHeading).toBeVisible();
  await expect(inspectorHeading).toBeFocused();

  await expect(
    page.getByRole("heading", { name: "Dereferenced Evidence" }),
  ).toBeVisible();
  // At least one citation resolves to a real Evidence record's fields, not a
  // loading placeholder or a redacted failure — proving the dereference
  // reached the real built API, not a fixture/side-door shortcut.
  await expect(page.getByText("Observed").first()).toBeVisible();
  await expect(page.getByText("Sequence").first()).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(inspectorHeading).toHaveCount(0);
  await expect(inspectButton).toBeFocused();
});

test("exact-Relationship search rehydration opens the same trust inspector with competing-claim/rule-trace semantics", async ({
  page,
  request,
}) => {
  const { identifier, evidenceIdentifier } =
    await findRelationshipWithEvidence(request);

  await page.goto("/topology");
  await page.getByLabel("Search by exact identifier").fill(identifier);
  await page.getByRole("button", { name: "Search", exact: true }).click();

  const inspectButton = page.getByRole("button", {
    name: `Inspect ${identifier}`,
  });
  await expect(inspectButton).toBeVisible();
  await inspectButton.click();

  const inspectorHeading = page.getByRole("heading", {
    name: "Trust inspector",
  });
  await expect(inspectorHeading).toBeVisible();
  await expect(inspectorHeading).toBeFocused();
  await expect(page.getByText(identifier).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ordered rule trace" }).first(),
  ).toBeVisible();
  // Every visible assertion revision is shown; none is ever labeled a winner.
  await expect(page.getByText(/none is treated as a winner/)).toBeVisible();
  await expect(page.getByText(evidenceIdentifier).last()).toBeVisible();

  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(inspectorHeading).toHaveCount(0);
  await expect(inspectButton).toBeFocused();
});
