/**
 * RFC 8785 canonical-serialization tests per accepted ADR-0021: the official
 * RFC vectors applicable to a JSON-value (not raw-text) implementation,
 * UTF-16 property ordering where code-unit and code-point order differ,
 * explicit-null preservation, rejection-first invalid-input coverage at the
 * public boundary, exact number serialization, BOM-free compact UTF-8, and
 * deep caller-non-mutation proof.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalizeToJcsString,
  canonicalizeToUtf8Bytes,
  toCanonicalJsonValue,
} from "./canonical-serialization.ts";

describe("canonicalizeToJcsString — RFC 8785 vectors", () => {
  it("reproduces the RFC 8785 § 3.2.3 sorting example (code-unit key order, nested objects, arrays)", () => {
    // The structure from RFC 8785's sorting discussion, expressed as an
    // in-memory value (raw-text parsing is out of S4 scope). Expected
    // canonical text derives from the RFC's rules: keys sorted as raw
    // UTF-16 code units, numbers per ECMAScript, compact output.
    const input = {
      "1": { f: { f: "hi", F: 5 }, "\n": 56.0 },
      "10": {},
      "": "empty",
      a: {},
      "111": [{ e: "yes", E: "no" }],
      A: {},
    };
    expect(canonicalizeToJcsString(input)).toBe(
      '{"":"empty","1":{"\\n":56,"f":{"F":5,"f":"hi"}},"10":{},"111":[{"E":"no","e":"yes"}],"A":{},"a":{}}',
    );
  });

  it("reproduces the RFC 8785 appendix-style literal/number/string vector", () => {
    const input = {
      // The RFC vector's source literal 333333333.33333329 parses to the
      // IEEE 754 double written here — the rounded form avoids a literal
      // that loses precision at runtime while exercising the same value.
      numbers: [333333333.3333333, 1e30, 4.5, 2e-3, 1e-27],
      string: `\u20ac$\nA'B"\\\\"/`,
      literals: [null, true, false],
    };
    expect(canonicalizeToJcsString(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"\u20ac$\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it("serializes numbers exactly per the ECMAScript algorithm, including negative zero and exponent boundaries", () => {
    expect(canonicalizeToJcsString(-0)).toBe("0");
    expect(canonicalizeToJcsString(0)).toBe("0");
    expect(canonicalizeToJcsString(4.5)).toBe("4.5");
    expect(canonicalizeToJcsString(1e21)).toBe("1e+21");
    expect(canonicalizeToJcsString(1e-7)).toBe("1e-7");
    expect(canonicalizeToJcsString(0.000001)).toBe("0.000001");
    expect(canonicalizeToJcsString(5e-324)).toBe("5e-324");
    expect(canonicalizeToJcsString(9007199254740996)).toBe("9007199254740996");
  });

  it("escapes strings per JCS: two-character escapes, lowercase \\u00xx control escapes, literal emission otherwise", () => {
    expect(canonicalizeToJcsString("\u000f\nA\t\u20ac")).toBe(
      '"\\u000f\\nA\\t\u20ac"',
    );
  });
});

describe("canonicalizeToJcsString — property ordering", () => {
  it("reproduces the exact RFC 8785 § 3.2.3 seven-property sorting vector", () => {
    // The RFC's property-sorting example, verbatim: carriage return, "1",
    // U+0080, U+00F6 (ö), the euro sign, the grinning-face supplementary
    // character (U+1F600, surrogate pair D83D DE00), and U+FB33 (dalet with
    // dagesh). The prescribed code-unit order puts the emoji BEFORE dalet —
    // the case where code-unit and code-point order diverge.
    const input = {
      "€": "Euro Sign",
      "\r": "Carriage Return",
      דּ: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "\u{1F600}": "Emoji: Grinning Face",
      "\u0080": "Control",
      ö: "Latin Small Letter O With Diaeresis",
    };
    expect(canonicalizeToJcsString(input)).toBe(
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","\u{1F600}":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
    );
  });

  it("sorts keys by raw UTF-16 code units where code-point order differs", () => {
    // U+1F600 (😀) has a HIGHER code point than U+FB33 (dalet with dagesh)
    // but its surrogate pair starts at U+D83D, which is a LOWER code unit —
    // conformant JCS puts the emoji key first. A code-point comparator
    // would order these the other way around.
    const emojiKey = "\u{1F600}";
    const daletKey = "\uFB33";
    const input = { [daletKey]: 1, [emojiKey]: 2 };
    expect(canonicalizeToJcsString(input)).toBe(
      `{"${emojiKey}":2,"${daletKey}":1}`,
    );
  });

  it("orders BMP keys by code unit, never by locale", () => {
    const input = { b: 1, A: 2, a: 3, "1": 4, "\r": 5, "\u20ac": 6 };
    expect(canonicalizeToJcsString(input)).toBe(
      '{"\\r":5,"1":4,"A":2,"a":3,"b":1,"\u20ac":6}',
    );
  });
});

describe("canonicalizeToJcsString — null preservation and array order", () => {
  it("preserves explicit null values, including nested in detail-like shapes", () => {
    const input = { detail: { reason: null }, top: null, list: [null, 1] };
    expect(canonicalizeToJcsString(input)).toBe(
      '{"detail":{"reason":null},"list":[null,1],"top":null}',
    );
  });

  it("preserves deeply nested explicit null at every level, never confusing it with absence", () => {
    const input = {
      spans: [{ sampled: true, reason: null, tags: [null, [null]] }],
      meta: { inner: { value: null } },
    };
    expect(canonicalizeToJcsString(input)).toBe(
      '{"meta":{"inner":{"value":null}},"spans":[{"reason":null,"sampled":true,"tags":[null,[null]]}]}',
    );
  });

  it("never converts undefined to null on any path — undefined input is a loud TypeError, and null output only ever comes from explicit null input", () => {
    // The public boundary rejects every undefined form outright…
    expect(() => canonicalizeToJcsString({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalizeToJcsString([undefined])).toThrow(TypeError);
    // …so a canonical "null" token can only originate from explicit null:
    expect(canonicalizeToJcsString({ a: null })).toBe('{"a":null}');
    expect(canonicalizeToJcsString({})).toBe("{}");
  });

  it("preserves generic array order exactly as given — arrays are never sorted", () => {
    const deliberatelyUnsorted = ["z", "a", "m", "b"];
    expect(canonicalizeToJcsString(deliberatelyUnsorted)).toBe(
      '["z","a","m","b"]',
    );
  });
});

describe("toCanonicalJsonValue — public-boundary rejection", () => {
  it("rejects an object property explicitly present with the value undefined", () => {
    expect(() => toCanonicalJsonValue({ present: undefined })).toThrow(
      TypeError,
    );
  });

  it("rejects an array containing an undefined entry", () => {
    expect(() => toCanonicalJsonValue([1, undefined, 3])).toThrow(TypeError);
  });

  it("rejects a sparse array hole instead of silently converting it to null", () => {
    // eslint-disable-next-line no-sparse-arrays -- the sparse hole IS the case under test
    expect(() => toCanonicalJsonValue([1, , 3])).toThrow(TypeError);
  });

  it.each([
    ["undefined itself", undefined],
    ["a BigInt", 1n],
    ["a function", () => 1],
    ["a symbol", Symbol("x")],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
    ["a Date object", new Date(0)],
    ["a nested non-JSON value", { latency: Number.NaN }],
  ])(
    "rejects %s with an explicit error",
    (_description: string, invalidInput: unknown) => {
      expect(() => toCanonicalJsonValue(invalidInput)).toThrow(TypeError);
    },
  );

  it("rejects a lone surrogate in a string value, at any depth", () => {
    expect(() => toCanonicalJsonValue("\uD800")).toThrow(
      /lone Unicode surrogate/,
    );
    expect(() => toCanonicalJsonValue({ nested: ["ok", "\uDFFF"] })).toThrow(
      /lone Unicode surrogate/,
    );
  });

  it("rejects a lone surrogate in a property name", () => {
    expect(() => toCanonicalJsonValue({ "\uD800": 1 })).toThrow(
      /property name/,
    );
  });

  it("accepts well-formed surrogate pairs everywhere", () => {
    expect(() =>
      toCanonicalJsonValue({ "\u{1F600}": "\u{1D11E}" }),
    ).not.toThrow();
  });
});

describe("canonicalizeToUtf8Bytes — encoding", () => {
  it("produces UTF-8 with no BOM and no insignificant whitespace", () => {
    const bytes = canonicalizeToUtf8Bytes({ a: 1, b: [2, 3] });
    // No BOM: the first byte is `{`, not EF BB BF.
    expect(bytes[0]).toBe(0x7b);
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe('{"a":1,"b":[2,3]}');
    expect(text).not.toMatch(/[ \t\n\r](?=(?:[^"]*"[^"]*")*[^"]*$)/);
  });

  it("encodes non-ASCII characters as multi-byte UTF-8", () => {
    const bytes = canonicalizeToUtf8Bytes("\u20ac");
    // "€" is E2 82 AC between the two quote bytes.
    expect([...bytes]).toEqual([0x22, 0xe2, 0x82, 0xac, 0x22]);
  });
});

describe("determinism and purity", () => {
  it("produces byte-identical output across repeated calls over equal input", () => {
    const build = (): unknown => ({
      z: [3, 1, 2],
      a: { nested: null, flag: true },
      "\u{1F600}": "supplementary",
    });
    const firstBytes = canonicalizeToUtf8Bytes(build());
    const secondBytes = canonicalizeToUtf8Bytes(build());
    expect([...firstBytes]).toEqual([...secondBytes]);
  });

  it("produces identical output regardless of property insertion order", () => {
    const insertionOrderOne: Record<string, number> = {};
    insertionOrderOne["b"] = 2;
    insertionOrderOne["a"] = 1;
    const insertionOrderTwo: Record<string, number> = {};
    insertionOrderTwo["a"] = 1;
    insertionOrderTwo["b"] = 2;
    expect(canonicalizeToJcsString(insertionOrderOne)).toBe(
      canonicalizeToJcsString(insertionOrderTwo),
    );
  });

  it("never mutates caller-owned objects or arrays, deeply", () => {
    const callerInput = {
      list: ["z", "a"],
      nested: { keep: null, arr: [2, 1] },
    };
    const deepSnapshot = structuredClone(callerInput);

    canonicalizeToJcsString(callerInput);
    canonicalizeToUtf8Bytes(callerInput);

    expect(callerInput).toEqual(deepSnapshot);
    // Array identity intact — no copied-array was written back.
    expect(callerInput.list[0]).toBe("z");
    expect(callerInput.nested.arr[0]).toBe(2);
  });
});
