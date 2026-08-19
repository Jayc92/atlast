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

describe("parseTopologyUrlState — M3-D health overlay fields", () => {
  it("accepts health=on with no healthStates or overlayFrame", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams("health=on"),
    );
    expect(state.health).toBe(true);
    expect(state.healthStates).toBeUndefined();
    expect(state.overlayFrame).toBeUndefined();
    expect(wasCanonicalized).toBe(false);
  });

  it.each([
    ["off", "health=off"],
    ["empty", "health="],
    ["true", "health=true"],
  ])(
    "drops an invalid health value (%s) and flags canonicalization",
    (_description, query) => {
      const { state, wasCanonicalized } = parseTopologyUrlState(
        new URLSearchParams(query),
      );
      expect(state.health).toBeUndefined();
      expect(wasCanonicalized).toBe(true);
    },
  );

  it("accepts a valid healthStates list and reorders it canonically", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams("health=on&healthStates=down%2Chealthy%2Cdegraded"),
    );
    expect(state.healthStates).toEqual(["healthy", "degraded", "down"]);
    expect(wasCanonicalized).toBe(false);
  });

  it("deduplicates repeated valid tokens in healthStates", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams("health=on&healthStates=down%2Cdown"),
    );
    expect(state.healthStates).toEqual(["down"]);
    expect(wasCanonicalized).toBe(false);
  });

  it.each([
    ["an empty token", "health=on&healthStates=healthy%2C%2Cdown"],
    ["an unknown token", "health=on&healthStates=healthy%2Cunreported"],
    ["an entirely empty value", "health=on&healthStates="],
  ])(
    "drops healthStates for %s and flags canonicalization",
    (_description, query) => {
      const { state, wasCanonicalized } = parseTopologyUrlState(
        new URLSearchParams(query),
      );
      expect(state.healthStates).toBeUndefined();
      expect(wasCanonicalized).toBe(true);
    },
  );

  it("drops a syntactically valid healthStates value when health is not on", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams("healthStates=down"),
    );
    expect(state.health).toBeUndefined();
    expect(state.healthStates).toBeUndefined();
    expect(wasCanonicalized).toBe(true);
  });

  it("drops the whole healthStates value when the key is repeated", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams("health=on&healthStates=healthy&healthStates=down"),
    );
    expect(state.health).toBe(true);
    expect(state.healthStates).toBeUndefined();
    expect(wasCanonicalized).toBe(true);
  });

  it("accepts overlayFrame only alongside health=on and a complete pin", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `health=on&overlayFrame=${encodeURIComponent(
          "atlast:overlay-frame:demo-company/active-conditions",
        )}&asOf=${encodeURIComponent(VALID_PIN.asOf)}&horizon=20&derivationVersion=m1-v1`,
      ),
    );
    expect(state.overlayFrame).toBe(
      "atlast:overlay-frame:demo-company/active-conditions",
    );
    expect(wasCanonicalized).toBe(false);
  });

  it("drops overlayFrame without health=on, flagging canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `overlayFrame=${encodeURIComponent(
          "atlast:overlay-frame:demo-company/active-conditions",
        )}&asOf=${encodeURIComponent(VALID_PIN.asOf)}&horizon=20&derivationVersion=m1-v1`,
      ),
    );
    expect(state.overlayFrame).toBeUndefined();
    expect(state.pin).toEqual(VALID_PIN);
    expect(wasCanonicalized).toBe(true);
  });

  it("drops overlayFrame without a complete pin, flagging canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `health=on&overlayFrame=${encodeURIComponent(
          "atlast:overlay-frame:demo-company/active-conditions",
        )}`,
      ),
    );
    expect(state.overlayFrame).toBeUndefined();
    expect(state.health).toBe(true);
    expect(wasCanonicalized).toBe(true);
  });

  it("drops a malformed overlayFrame token and flags canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `health=on&overlayFrame=not-a-valid-frame&asOf=${encodeURIComponent(
          VALID_PIN.asOf,
        )}&horizon=20&derivationVersion=m1-v1`,
      ),
    );
    expect(state.overlayFrame).toBeUndefined();
    expect(wasCanonicalized).toBe(true);
  });

  it("an invalid health value drops both dependent overlay fields while preserving topology state", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `q=checkout&health=off&healthStates=down&overlayFrame=${encodeURIComponent(
          "atlast:overlay-frame:demo-company/active-conditions",
        )}&asOf=${encodeURIComponent(VALID_PIN.asOf)}&horizon=20&derivationVersion=m1-v1`,
      ),
    );
    expect(state).toEqual({ q: "checkout", pin: VALID_PIN });
    expect(wasCanonicalized).toBe(true);
  });
});

describe("parseTopologyUrlState — M4-C changeType field", () => {
  const ENTITY_SELECTED = "atlast:entity:service/checkout";
  const RELATIONSHIP_SELECTED = "atlast:relationship:calls/checkout-orders";

  it("accepts a valid changeType alongside an Entity-shaped selected", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(`selected=${ENTITY_SELECTED}&changeType=removal`),
    );
    expect(state.changeType).toBe("removal");
    expect(wasCanonicalized).toBe(false);
  });

  it.each([
    ["removal", "removal"],
    ["degradation", "degradation"],
    ["interface-change", "interface-change"],
  ])("accepts the %s changeType value", (_description, value) => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(`selected=${ENTITY_SELECTED}&changeType=${value}`),
    );
    expect(state.changeType).toBe(value);
    expect(wasCanonicalized).toBe(false);
  });

  it("drops an unrecognized changeType value and flags canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(`selected=${ENTITY_SELECTED}&changeType=upgrade`),
    );
    expect(state.changeType).toBeUndefined();
    expect(wasCanonicalized).toBe(true);
  });

  it("drops changeType with no selected present, flagging canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams("changeType=removal"),
    );
    expect(state.changeType).toBeUndefined();
    expect(state.selected).toBeUndefined();
    expect(wasCanonicalized).toBe(true);
  });

  it("drops changeType when selected names a Relationship, flagging canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `selected=${RELATIONSHIP_SELECTED}&changeType=removal`,
      ),
    );
    expect(state.changeType).toBeUndefined();
    expect(state.selected).toBe(RELATIONSHIP_SELECTED);
    expect(wasCanonicalized).toBe(true);
  });

  it("drops the whole changeType value for a repeated parameter and flags canonicalization", () => {
    const { state, wasCanonicalized } = parseTopologyUrlState(
      new URLSearchParams(
        `selected=${ENTITY_SELECTED}&changeType=removal&changeType=degradation`,
      ),
    );
    expect(state.changeType).toBeUndefined();
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

  it("writes every parameter in the exact ADR-0031 § 2 / ADR-0034 § 1 canonical order", () => {
    const state: TopologyUrlState = {
      q: "checkout",
      direction: "downstream",
      depth: 2,
      minConfidence: 0.25,
      view: "graph",
      selected: "atlast:entity:service/checkout",
      health: true,
      healthStates: ["down", "healthy"],
      pin: VALID_PIN,
      overlayFrame: "atlast:overlay-frame:demo-company/active-conditions",
      changeType: "removal",
    };
    const serialized = serializeTopologyUrlState(state);
    expect([...serialized.keys()]).toEqual([
      "q",
      "direction",
      "depth",
      "minConfidence",
      "view",
      "selected",
      "health",
      "healthStates",
      "asOf",
      "horizon",
      "derivationVersion",
      "overlayFrame",
      "changeType",
    ]);
    // healthStates is deduplicated and reordered canonically at serialization,
    // independent of the order supplied by the caller.
    expect(serialized.get("healthStates")).toBe("healthy,down");
  });

  it("round-trips a complete changeType state deterministically", () => {
    const state: TopologyUrlState = {
      selected: "atlast:entity:service/checkout",
      changeType: "interface-change",
    };
    const serialized = serializeTopologyUrlState(state);
    const { state: reparsed, wasCanonicalized } =
      parseTopologyUrlState(serialized);
    expect(reparsed).toEqual(state);
    expect(wasCanonicalized).toBe(false);
  });

  it("never writes changeType when selected does not name an Entity", () => {
    const serialized = serializeTopologyUrlState({
      selected: "atlast:relationship:calls/checkout-orders",
      changeType: "removal",
    } as unknown as TopologyUrlState);
    expect(serialized.has("changeType")).toBe(false);
  });

  it("never writes changeType with no selected present", () => {
    const serialized = serializeTopologyUrlState({
      changeType: "removal",
    } as unknown as TopologyUrlState);
    expect(serialized.has("changeType")).toBe(false);
  });

  it("round-trips a complete health-overlay state deterministically", () => {
    const state: TopologyUrlState = {
      health: true,
      healthStates: ["latent-downstream-risk", "down"],
      pin: VALID_PIN,
      overlayFrame: "atlast:overlay-frame:demo-company/active-conditions",
    };
    const serialized = serializeTopologyUrlState(state);
    const { state: reparsed, wasCanonicalized } =
      parseTopologyUrlState(serialized);
    expect(reparsed).toEqual({
      health: true,
      healthStates: ["down", "latent-downstream-risk"],
      pin: VALID_PIN,
      overlayFrame: "atlast:overlay-frame:demo-company/active-conditions",
    });
    expect(wasCanonicalized).toBe(false);
  });

  it("never writes healthStates or overlayFrame when health is not true", () => {
    const serialized = serializeTopologyUrlState({
      healthStates: ["down"],
      pin: VALID_PIN,
      overlayFrame: "atlast:overlay-frame:demo-company/active-conditions",
    } as unknown as TopologyUrlState);
    expect(serialized.has("health")).toBe(false);
    expect(serialized.has("healthStates")).toBe(false);
    expect(serialized.has("overlayFrame")).toBe(false);
  });

  it("never writes overlayFrame without a complete pin", () => {
    const serialized = serializeTopologyUrlState({
      health: true,
      overlayFrame: "atlast:overlay-frame:demo-company/active-conditions",
    } as unknown as TopologyUrlState);
    expect(serialized.has("overlayFrame")).toBe(false);
  });
});
