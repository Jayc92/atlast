import { describe, expect, it } from "vitest";
import type { ObservedPod } from "./observed-pod.ts";
import type { ObservedService } from "./observed-service.ts";
import { evaluateServiceSelector } from "./service-selector-matching.ts";

function pod(name: string, labels: Record<string, string>): ObservedPod {
  return {
    namespace: "atlast-m6-pilot",
    name,
    labels,
    controllerOwnerReference: null,
  };
}

const SELECTOR_APP_CHECKOUT = { app: "checkout" };

describe("evaluateServiceSelector", () => {
  it("case A — known zero: a selector-backed Service against a complete Pod set that matches nothing", () => {
    const service: ObservedService = {
      namespace: "atlast-m6-pilot",
      name: "unused-service",
      selector: SELECTOR_APP_CHECKOUT,
    };
    const result = evaluateServiceSelector(service, {
      status: "observed",
      pods: [pod("unrelated", { app: "something-else" })],
    });
    expect(result.evaluationState).toStrictEqual({
      hasSelector: true,
      matchedPodCount: 0,
      evaluatedAgainstCompletePodSet: true,
    });
    expect(result.matchedPods).toStrictEqual([]);
  });

  it("case B — exactly one match", () => {
    const service: ObservedService = {
      namespace: "atlast-m6-pilot",
      name: "checkout-lb",
      selector: SELECTOR_APP_CHECKOUT,
    };
    const onlyMatch = pod("checkout-1", { app: "checkout" });
    const result = evaluateServiceSelector(service, {
      status: "observed",
      pods: [onlyMatch, pod("other", { app: "other" })],
    });
    expect(result.evaluationState.matchedPodCount).toBe(1);
    expect(result.matchedPods).toStrictEqual([onlyMatch]);
  });

  it("case C — multiple matches, none discarded", () => {
    const service: ObservedService = {
      namespace: "atlast-m6-pilot",
      name: "checkout-lb",
      selector: SELECTOR_APP_CHECKOUT,
    };
    const first = pod("checkout-1", { app: "checkout" });
    const second = pod("checkout-2", { app: "checkout" });
    const result = evaluateServiceSelector(service, {
      status: "observed",
      pods: [first, second, pod("other", { app: "other" })],
    });
    expect(result.evaluationState.matchedPodCount).toBe(2);
    expect(result.matchedPods).toStrictEqual([first, second]);
  });

  it("case D — insufficient evidence: the Pod set for this cycle was not observed at all, never defaulted to zero", () => {
    const service: ObservedService = {
      namespace: "atlast-m6-pilot",
      name: "checkout-lb",
      selector: SELECTOR_APP_CHECKOUT,
    };
    const result = evaluateServiceSelector(service, { status: "not-observed" });
    expect(result.evaluationState).toStrictEqual({
      hasSelector: true,
      matchedPodCount: null,
      evaluatedAgainstCompletePodSet: false,
    });
    expect(result.matchedPods).toStrictEqual([]);
  });

  it("case E — selectorless: not-applicable, never conflated with known-zero or unknown", () => {
    const service: ObservedService = {
      namespace: "atlast-m6-pilot",
      name: "external-or-selectorless",
      selector: null,
    };
    const result = evaluateServiceSelector(service, {
      status: "observed",
      pods: [pod("checkout-1", { app: "checkout" })],
    });
    expect(result.evaluationState).toStrictEqual({
      hasSelector: false,
      matchedPodCount: null,
      evaluatedAgainstCompletePodSet: false,
    });
  });

  it("selectorless takes precedence even when the Pod set itself was not observed — no selector means the search never applies", () => {
    const service: ObservedService = {
      namespace: "atlast-m6-pilot",
      name: "external-or-selectorless",
      selector: null,
    };
    const result = evaluateServiceSelector(service, { status: "not-observed" });
    expect(result.evaluationState.hasSelector).toBe(false);
  });

  it("requires an exact match on every selector key=value pair — a partial label match is not a match", () => {
    const service: ObservedService = {
      namespace: "atlast-m6-pilot",
      name: "multi-key",
      selector: { app: "checkout", tier: "frontend" },
    };
    const result = evaluateServiceSelector(service, {
      status: "observed",
      pods: [pod("partial-match", { app: "checkout" })],
    });
    expect(result.evaluationState.matchedPodCount).toBe(0);
  });
});
