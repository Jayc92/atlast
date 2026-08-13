import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { SubjectReadResult } from "@atlast/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustInspector } from "./TrustInspector.tsx";
import { topologyRequestCache } from "./session.ts";
import {
  buildEvidenceDetailResult,
  buildSubjectReadResult,
  FIXTURE_EVIDENCE_IDENTIFIER,
  FIXTURE_IDENTITY,
} from "./test-support/fixtures.ts";
import { jsonRoute, stubApiFetch } from "./test-support/stub-fetch.ts";

const SECOND_EVIDENCE_IDENTIFIER = "atlast:evidence:catalog/observation-2";
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

function buildRichTrustSubject(): SubjectReadResult {
  const base = buildSubjectReadResult({
    identifier: "atlast:entity:checkout",
    entityType: "service",
  });
  const assertion = base.assertions[0];
  if (assertion === undefined) {
    throw new Error("Expected fixture assertion");
  }
  return {
    ...base,
    assertions: [
      {
        ...assertion,
        freshness: "stale",
        revision: {
          ...assertion.revision,
          validity: {
            validFrom: "2026-08-01T00:00:00.000Z",
            validTo: "2026-08-02T00:00:00.000Z",
          },
          provenance: [FIXTURE_EVIDENCE_IDENTIFIER],
          ruleTrace: [
            {
              ruleName: "identity-match",
              evidenceIdentifiers: [FIXTURE_EVIDENCE_IDENTIFIER],
              detail: "Normalized source identity matched exactly.",
            },
            {
              ruleName: "conflict-retained",
              evidenceIdentifiers: [SECOND_EVIDENCE_IDENTIFIER],
              detail: "Mutually exclusive claims remain visible.",
            },
          ],
          conflictState: {
            status: "conflicted",
            competingClaims: [
              {
                claim: { claimKind: "entity", entityType: "database" },
                provenance: [SECOND_EVIDENCE_IDENTIFIER],
                confidence: 0.55,
              },
            ],
          },
          ambiguityState: {
            status: "ambiguous",
            nearMatches: [
              {
                nearMatchSubjectIdentifier: "atlast:entity:checkout-api",
                reason: "The source-native names overlap but are not exact.",
              },
            ],
          },
        },
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  topologyRequestCache.clear();
  vi.unstubAllGlobals();
  if (originalClipboard === undefined) {
    Reflect.deleteProperty(navigator, "clipboard");
  } else {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  }
});

describe("TrustInspector", () => {
  it("shows complete trust semantics, dereferences unique Evidence, and keeps partial failures visible", async () => {
    const fetchStub = stubApiFetch([
      jsonRoute(
        (url) => url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
        buildEvidenceDetailResult(),
      ),
      jsonRoute(
        (url) => url.includes(encodeURIComponent(SECOND_EVIDENCE_IDENTIFIER)),
        { malformed: true },
      ),
    ]);

    render(
      <TrustInspector
        selection={{ subject: buildRichTrustSubject() }}
        snapshotIdentity={FIXTURE_IDENTITY}
        traversalTruncated
        returnFocus={null}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Trust inspector" }),
    ).toBe(document.activeElement);
    expect(screen.getByText(/none is treated as a winner/i)).toBeDefined();
    expect(
      screen.getByText(
        `stale — supporting Evidence is stale at snapshot ${FIXTURE_IDENTITY.asOf}`,
      ),
    ).toBeDefined();
    expect(
      screen.getByText("0.9 — uncalibrated synthetic score"),
    ).toBeDefined();
    expect(
      screen.getByText("[2026-08-01T00:00:00.000Z, 2026-08-02T00:00:00.000Z)"),
    ).toBeDefined();
    expect(screen.getByText("conflicted")).toBeDefined();
    expect(screen.getByText("ambiguous")).toBeDefined();
    expect(screen.getByText("Every competing claim")).toBeDefined();
    expect(screen.getByText("database")).toBeDefined();
    expect(screen.getByText("Every near match")).toBeDefined();
    expect(screen.getByText("atlast:entity:checkout-api")).toBeDefined();
    expect(screen.getByText("Ordered rule trace")).toBeDefined();
    expect(screen.getByText(/loaded traversal is truncated/i)).toBeDefined();

    expect(await screen.findByText(/production/)).toBeDefined();
    expect(await screen.findByText(/could not be loaded/i)).toBeDefined();
    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });
  });

  it("closes and returns keyboard focus to the invoking control", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
        buildEvidenceDetailResult(),
      ),
    ]);
    const invoker = document.createElement("button");
    document.body.append(invoker);
    const onClose = vi.fn();

    render(
      <TrustInspector
        selection={{
          subject: buildSubjectReadResult({
            identifier: "atlast:entity:checkout",
            entityType: "service",
          }),
        }}
        snapshotIdentity={FIXTURE_IDENTITY}
        returnFocus={invoker}
        onClose={onClose}
      />,
    );
    screen.getByRole("button", { name: "Close inspector" }).click();

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(document.activeElement).toBe(invoker);
    });
    invoker.remove();
  });

  it("copies the complete snapshot identity as one unit", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
        buildEvidenceDetailResult(),
      ),
    ]);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <TrustInspector
        selection={{
          subject: buildSubjectReadResult({
            identifier: "atlast:entity:checkout",
            entityType: "service",
          }),
        }}
        snapshotIdentity={FIXTURE_IDENTITY}
        returnFocus={null}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByText("[2026-08-01T00:00:00.000Z, no recorded end)"),
    ).toBeDefined();
    screen.getByRole("button", { name: "Copy snapshot identity" }).click();

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(JSON.stringify(FIXTURE_IDENTITY));
      expect(screen.getByText("Snapshot identity copied.")).toBeDefined();
    });
  });
});
