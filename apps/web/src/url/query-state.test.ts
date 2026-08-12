import { describe, expect, it } from "vitest";
import {
  parseTopologyUrlState,
  serializeTopologyUrlState,
  type TopologyUrlState,
} from "./query-state.ts";

const VALID_PIN = {
  asOf: "2026-08-12T00:00:00.000Z",
  horizon: 20,
  derivationVersion: "m1-v1",
};

describe("parseTopologyUrlState — complete-pin rule", () => {
  it("resolves latest (no pin) when none of the three components are present", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(""),
    );
    expect(state.pin).toBeUndefined();
    expect(wasCanonicalized).toBe(false);
  });

  it("accepts the complete pin when all three components are present and valid", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `asOf=${encodeURIComponent(VALID_PIN.asOf)}&horizon=20&derivationVersion=m1-v1`,
      ),
    );
    expect(state.pin).toEqual(VALID_PIN);
    expect(wasCanonicalized).toBe(false);
  });

  it.each([
    ["only asOf", `asOf=${encodeURIComponent(VALID_PIN.asOf)}`],
    ["only horizon", "horizon=20"],
    ["only derivationVersion", "derivationVersion=m1-v1"],
    [
      "asOf and horizon but not derivationVersion",
      `asOf=${encodeURIComponent(VALID_PIN.asOf)}&horizon=20`,
    ],
  ])(
    "drops a partial pin (%s) to latest and flags canonicalization",
    (_description, query) => {
      const { state, wasCanonicalized } = parseTopologyUrlState(
        new URLSearchParams(query),
      );
      expect(state.pin).toBeUndefined();
      expect(wasCanonicalized).toBe(true);
    },
  );

  it("drops a complete but malformed pin (invalid horizon) to latest", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `asOf=${encodeURIComponent(VALID_PIN.asOf)}&horizon=not-a-number&derivationVersion=m1-v1`,
      ),
    );
    expect(state.pin).toBeUndefined();
    expect(wasCanonicalized).toBe(true);
  });

  it("drops a complete but malformed pin (invalid derivationVersion casing) to latest", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `asOf=${encodeURIComponent(VALID_PIN.asOf)}&horizon=20&derivationVersion=M1-V1`,
      ),
    );
    expect(state.pin).toBeUndefined();
    expect(wasCanonicalized).toBe(true);
  });
});

describe("parseTopologyUrlState — other canonical fields", () => {
  it("accepts a valid direction/depth/minConfidence/view/selected/q combination", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        "q=checkout&direction=upstream&depth=3&minConfidence=0.5&view=list&selected=atlast%3Aentity%3Aservice%2Fcheckout",
      ),
    );
    expect(state).toEqual({
      q: "checkout",
      direction: "upstream",
      depth: 3,
      minConfidence: 0.5,
      view: "list",
      selected: "atlast:entity:service/checkout",
    });
    expect(wasCanonicalized).toBe(false);
  });

  it.each([
    ["an unrecognized direction", "direction=sideways"],
    ["a depth of 0", "depth=0"],
    ["a depth above the maximum", "depth=6"],
    ["a non-integer depth", "depth=2.5"],
    ["a minConfidence above 1", "minConfidence=1.5"],
    ["a negative minConfidence", "minConfidence=-0.1"],
    ["an unrecognized view", "view=table"],
  ])("drops %s and flags canonicalization", (_description, query) => {
    const { wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(query),
    );
    expect(wasCanonicalized).toBe(true);
  });

  it("drops empty q and selected values and flags canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams("q=&selected="),
    );
    expect(state.q).toBeUndefined();
    expect(state.selected).toBeUndefined();
    expect(wasCanonicalized).toBe(true);
  });

  it("drops unknown parameters and flags canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams("q=checkout&unsupported=value"),
    );
    expect(state).toEqual({ q: "checkout" });
    expect(wasCanonicalized).toBe(true);
  });

  it("uses one safe value for a repeated parameter and flags canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams("view=list&view=graph"),
    );
    expect(state.view).toBe("list");
    expect(wasCanonicalized).toBe(true);
  });
});

describe("serializeTopologyUrlState", () => {
  it("round-trips a complete state deterministically", () => {
    const state: TopologyUrlState = {
      q: "checkout",
      direction: "downstream",
      depth: 2,
      minConfidence: 0.25,
      view: "graph",
      selected: "atlast:entity:service/checkout",
      pin: VALID_PIN,
    };
    const serialized = serializeTopologyUrlState(state);
    const { state: reparsed, wasCanonicalized } =
      parseTopologyUrlState(serialized);
    expect(reparsed).toEqual(state);
    expect(wasCanonicalized).toBe(false);
  });

  it("produces byte-identical output for the same state regardless of construction order", () => {
    const stateA: TopologyUrlState = { q: "a", direction: "upstream" };
    const stateB: TopologyUrlState = { direction: "upstream", q: "a" };
    expect(serializeTopologyUrlState(stateA).toString()).toBe(
      serializeTopologyUrlState(stateB).toString(),
    );
  });

  it("omits the pin entirely for latest exploration", () => {
    const serialized = serializeTopologyUrlState({ q: "checkout" });
    expect(serialized.has("asOf")).toBe(false);
    expect(serialized.has("horizon")).toBe(false);
    expect(serialized.has("derivationVersion")).toBe(false);
  });
});
