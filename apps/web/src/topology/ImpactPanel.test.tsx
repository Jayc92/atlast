/**
 * Tests for the M4-C impact panel (ADR-0034 verification obligations):
 * exact numeric rank presentation, the "uncalibrated synthetic score" label,
 * change-type labeling, truncation/empty honesty, evidence-path drill-down
 * through the existing trust inspector, failure honesty (expected API error,
 * redacted internal failure, resolved-identity mismatch), and keyboard focus
 * management on open/close.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImpactPanel } from "./ImpactPanel.tsx";
import { topologyRequestCache } from "./session.ts";
import {
  buildEvidenceDetailResult,
  buildImpactResult,
  buildImpactResultEnvelope,
  buildRelationshipSubjectReadResult,
  FIXTURE_EVIDENCE_IDENTIFIER,
  FIXTURE_IDENTITY,
} from "./test-support/fixtures.ts";
import { jsonRoute, stubApiFetch } from "./test-support/stub-fetch.ts";

const ORIGIN_ENTITY_IDENTIFIER = "atlast:entity:service/checkout";
const AFFECTED_ENTITY_IDENTIFIER = "atlast:entity:service/orders";
const RELATIONSHIP_IDENTIFIER = "atlast:relationship:calls/checkout-orders";
const ASSERTION_IDENTIFIER = `atlast:assertion:${"c".repeat(64)}`;

/** A runtime narrowing (not a type assertion) so this reads `.value` safely regardless of how `getByRole`'s declared return type resolves. */
function selectValue(element: HTMLElement): string {
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error("Expected an HTMLSelectElement");
  }
  return element.value;
}

function defaultProps(
  overrides: {
    readonly onChangeTypeChange?: (changeType: string) => void;
    readonly onClose?: () => void;
    readonly returnFocus?: HTMLElement | null;
  } = {},
): {
  readonly originEntityIdentifier: string;
  readonly changeType: "removal";
  readonly direction: "downstream";
  readonly depth: number;
  readonly minConfidence: number;
  readonly identity: typeof FIXTURE_IDENTITY;
  readonly returnFocus: HTMLElement | null;
  readonly onChangeTypeChange: (changeType: string) => void;
  readonly onClose: () => void;
} {
  return {
    originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
    changeType: "removal",
    direction: "downstream",
    depth: 2,
    minConfidence: 0,
    identity: FIXTURE_IDENTITY,
    returnFocus: overrides.returnFocus ?? null,
    onChangeTypeChange: overrides.onChangeTypeChange ?? (() => undefined),
    onClose: overrides.onClose ?? (() => undefined),
  };
}

afterEach(() => {
  cleanup();
  topologyRequestCache.clear();
  vi.unstubAllGlobals();
});

describe("ImpactPanel", () => {
  it("focuses its heading on open and shows the origin, trust language, and change-type selector", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/impact?"),
        buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "removal",
        }),
      ),
    ]);

    render(<ImpactPanel {...defaultProps()} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Impact analysis" }),
    ).toBe(document.activeElement);
    expect(screen.getByText(ORIGIN_ENTITY_IDENTIFIER)).toBeDefined();
    expect(screen.getByText(/not a prediction, risk score/i)).toBeDefined();
    expect(selectValue(screen.getByRole("combobox"))).toBe("removal");
    await screen.findByText(/no reachable entities meet these bounds/i);
  });

  it("shows the exact numeric rank score, the uncalibrated-synthetic-score label, and path length", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/impact?"),
        buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "removal",
          items: [
            buildRelationshipSubjectReadResult({
              identifier: RELATIONSHIP_IDENTIFIER,
              relationshipType: "calls",
              sourceEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
              targetEntityIdentifier: AFFECTED_ENTITY_IDENTIFIER,
            }),
          ],
          results: [
            buildImpactResult({
              entityIdentifier: AFFECTED_ENTITY_IDENTIFIER,
              rankScore: 0.734,
              path: [
                {
                  sourceEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
                  targetEntityIdentifier: AFFECTED_ENTITY_IDENTIFIER,
                  relationshipIdentifier: RELATIONSHIP_IDENTIFIER,
                  assertionIdentifier: ASSERTION_IDENTIFIER,
                },
              ],
            }),
          ],
        }),
      ),
    ]);

    render(<ImpactPanel {...defaultProps()} />);

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: AFFECTED_ENTITY_IDENTIFIER,
      }),
    ).toBeDefined();
    expect(
      screen.getByText("0.734 — uncalibrated synthetic score"),
    ).toBeDefined();
    expect(screen.getByText("1 edge")).toBeDefined();
  });

  it("keeps path-step inspect controls uniquely named across multiple ranked results", async () => {
    const SECOND_AFFECTED_ENTITY_IDENTIFIER = "atlast:entity:service/billing";
    const SECOND_RELATIONSHIP_IDENTIFIER =
      "atlast:relationship:calls/checkout-billing";
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/impact?"),
        buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "removal",
          items: [
            buildRelationshipSubjectReadResult({
              identifier: RELATIONSHIP_IDENTIFIER,
              relationshipType: "calls",
              sourceEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
              targetEntityIdentifier: AFFECTED_ENTITY_IDENTIFIER,
            }),
            buildRelationshipSubjectReadResult({
              identifier: SECOND_RELATIONSHIP_IDENTIFIER,
              relationshipType: "calls",
              sourceEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
              targetEntityIdentifier: SECOND_AFFECTED_ENTITY_IDENTIFIER,
            }),
          ],
          // Both results have exactly one path step, so each result's step
          // is index 0 ("step 1") — the button name must still disambiguate
          // by the affected entity, not just the step index.
          results: [
            buildImpactResult({
              entityIdentifier: AFFECTED_ENTITY_IDENTIFIER,
              rankScore: 0.9,
              path: [
                {
                  sourceEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
                  targetEntityIdentifier: AFFECTED_ENTITY_IDENTIFIER,
                  relationshipIdentifier: RELATIONSHIP_IDENTIFIER,
                  assertionIdentifier: ASSERTION_IDENTIFIER,
                },
              ],
            }),
            buildImpactResult({
              entityIdentifier: SECOND_AFFECTED_ENTITY_IDENTIFIER,
              rankScore: 0.5,
              path: [
                {
                  sourceEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
                  targetEntityIdentifier: SECOND_AFFECTED_ENTITY_IDENTIFIER,
                  relationshipIdentifier: SECOND_RELATIONSHIP_IDENTIFIER,
                  assertionIdentifier: ASSERTION_IDENTIFIER,
                },
              ],
            }),
          ],
        }),
      ),
    ]);

    render(<ImpactPanel {...defaultProps()} />);

    expect(
      await screen.findByRole("button", {
        name: `Inspect evidence for ${AFFECTED_ENTITY_IDENTIFIER} step 1`,
      }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", {
        name: `Inspect evidence for ${SECOND_AFFECTED_ENTITY_IDENTIFIER} step 1`,
      }),
    ).toBeDefined();
  });

  it("shows an explicit truncation notice when the traversal is truncated", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/impact?"),
        buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "removal",
          truncated: true,
        }),
      ),
    ]);

    render(<ImpactPanel {...defaultProps()} />);

    expect(
      await screen.findByText(/reached its bounded result budget/i),
    ).toBeDefined();
  });

  it("drills into a path step's evidence through the existing trust inspector", async () => {
    const relationship = buildRelationshipSubjectReadResult({
      identifier: RELATIONSHIP_IDENTIFIER,
      relationshipType: "calls",
      sourceEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
      targetEntityIdentifier: AFFECTED_ENTITY_IDENTIFIER,
    });
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/impact?"),
        buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "removal",
          items: [relationship],
          results: [
            buildImpactResult({
              entityIdentifier: AFFECTED_ENTITY_IDENTIFIER,
              rankScore: 0.5,
              path: [
                {
                  sourceEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
                  targetEntityIdentifier: AFFECTED_ENTITY_IDENTIFIER,
                  relationshipIdentifier: RELATIONSHIP_IDENTIFIER,
                  assertionIdentifier: ASSERTION_IDENTIFIER,
                },
              ],
            }),
          ],
        }),
      ),
      jsonRoute(
        (url) => url.includes(encodeURIComponent(FIXTURE_EVIDENCE_IDENTIFIER)),
        buildEvidenceDetailResult(),
      ),
    ]);

    render(<ImpactPanel {...defaultProps()} />);

    const inspectButton = await screen.findByRole("button", {
      name: `Inspect evidence for ${AFFECTED_ENTITY_IDENTIFIER} step 1`,
    });
    // Real keyboard/mouse activation focuses the control before it is
    // clicked; `fireEvent.click` alone does not move jsdom focus, so this
    // return-focus assertion needs the explicit `.focus()` a real user
    // interaction would already have produced.
    inspectButton.focus();
    fireEvent.click(inspectButton);

    expect(
      screen.getByRole("heading", { level: 2, name: "Trust inspector" }),
    ).toBe(document.activeElement);
    expect(screen.getByText(RELATIONSHIP_IDENTIFIER)).toBeDefined();
    expect(await screen.findByText(/production/)).toBeDefined();

    screen.getByRole("button", { name: "Close inspector" }).click();
    await waitFor(() => {
      expect(document.activeElement).toBe(inspectButton);
    });
  });

  it("renders an expected API error with retry", async () => {
    const fetchStub = stubApiFetch([
      jsonRoute(
        (url) => url.includes("/impact?"),
        {
          code: "UNKNOWN_IDENTIFIER",
          message: "No entity matches this identifier.",
          details: {
            identifierKind: "subject",
            identifier: ORIGIN_ENTITY_IDENTIFIER,
          },
        },
        false,
      ),
    ]);

    render(<ImpactPanel {...defaultProps()} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No entity matches this identifier.");
    screen.getByRole("button", { name: "Try again" }).click();
    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });
  });

  it("collapses a malformed response into a redacted internal failure", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/impact?"), {
        not: "a valid impact envelope",
      }),
    ]);

    render(<ImpactPanel {...defaultProps()} />);

    expect(
      await screen.findByText(/isn.t safe to show directly/i),
    ).toBeDefined();
  });

  it("treats a resolved-identity mismatch as a redacted internal failure", async () => {
    stubApiFetch([
      jsonRoute((url) => url.includes("/impact?"), {
        ...buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "removal",
        }),
        meta: {
          resolvedIdentity: { ...FIXTURE_IDENTITY, horizon: 999 },
          schemaVersion: "atlast-domain-v1",
        },
      }),
    ]);

    render(<ImpactPanel {...defaultProps()} />);

    expect(
      await screen.findByText(/isn.t safe to show directly/i),
    ).toBeDefined();
  });

  it("closes and returns keyboard focus to the invoking control", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/impact?"),
        buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "removal",
        }),
      ),
    ]);
    const invoker = document.createElement("button");
    document.body.append(invoker);
    const onClose = vi.fn();

    render(
      <ImpactPanel {...defaultProps({ onClose, returnFocus: invoker })} />,
    );
    screen.getByRole("button", { name: "Close impact panel" }).click();

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(document.activeElement).toBe(invoker);
    });
    invoker.remove();
  });

  it("invokes onChangeTypeChange when a different hypothetical change is selected", async () => {
    stubApiFetch([
      jsonRoute(
        (url) => url.includes("/impact?"),
        buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "removal",
        }),
      ),
    ]);
    const onChangeTypeChange = vi.fn();

    render(<ImpactPanel {...defaultProps({ onChangeTypeChange })} />);
    await screen.findByText(/no reachable entities meet these bounds/i);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "degradation" },
    });

    expect(onChangeTypeChange).toHaveBeenCalledWith("degradation");
  });

  it("re-issues the query when the changeType prop changes", async () => {
    const fetchStub = stubApiFetch([
      jsonRoute(
        (url) => url.includes("changeType=removal"),
        buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "removal",
        }),
      ),
      jsonRoute(
        (url) => url.includes("changeType=degradation"),
        buildImpactResultEnvelope({
          originEntityIdentifier: ORIGIN_ENTITY_IDENTIFIER,
          changeType: "degradation",
        }),
      ),
    ]);

    const { rerender } = render(<ImpactPanel {...defaultProps()} />);
    await screen.findByText(/no reachable entities meet these bounds/i);
    expect(fetchStub).toHaveBeenCalledTimes(1);

    rerender(<ImpactPanel {...defaultProps()} changeType="degradation" />);

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });
    expect(selectValue(screen.getByRole("combobox"))).toBe("degradation");
  });
});
