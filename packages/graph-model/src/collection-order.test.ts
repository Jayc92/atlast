/**
 * Collection-ordering helper tests (ADR-0021 § 3, invariant 9): copied-array
 * identifier ordering by exact locale-free UTF-16 comparison, deterministic
 * under shuffled input, and no mutation of caller-owned arrays or elements.
 * These are the helpers S5/S6 payload builders must compose; no payload is
 * built here.
 */
import { describe, expect, it } from "vitest";
import { compareUtf16CodeUnits } from "./utf16-comparator.ts";
import { sortByIdentifier, sortIdentifiers } from "./collection-order.ts";

describe("compareUtf16CodeUnits", () => {
  it("implements the explicit locale-free comparator convention", () => {
    expect(compareUtf16CodeUnits("a", "b")).toBe(-1);
    expect(compareUtf16CodeUnits("b", "a")).toBe(1);
    expect(compareUtf16CodeUnits("same", "same")).toBe(0);
  });

  it("compares raw UTF-16 code units where code-point order differs", () => {
    // 😀 (U+1F600) sorts BELOW דּ (U+FB33) by code unit despite the higher
    // code point — the surrogate-pair case that distinguishes the required
    // ordering from a code-point comparator.
    expect(compareUtf16CodeUnits("\u{1F600}", "דּ")).toBe(-1);
  });

  it("is locale-free: uppercase Z sorts before lowercase a", () => {
    // localeCompare in typical locales orders "a" < "Z"; code-unit order
    // does the opposite (U+005A < U+0061), proving no locale is consulted.
    expect(compareUtf16CodeUnits("Z", "a")).toBe(-1);
  });
});

describe("sortIdentifiers", () => {
  const CANONICAL_ORDER = [
    "atlast:evidence:demo/0001",
    "atlast:evidence:demo/0002",
    "atlast:evidence:demo/0010",
  ];

  it("is deterministic under every shuffled input order", () => {
    const permutations = [
      [CANONICAL_ORDER[2], CANONICAL_ORDER[0], CANONICAL_ORDER[1]],
      [CANONICAL_ORDER[1], CANONICAL_ORDER[2], CANONICAL_ORDER[0]],
      [CANONICAL_ORDER[0], CANONICAL_ORDER[2], CANONICAL_ORDER[1]],
    ] as string[][];
    for (const permutation of permutations) {
      expect(sortIdentifiers(permutation)).toEqual(CANONICAL_ORDER);
    }
  });

  it("returns a copy and never mutates the caller's array", () => {
    const callerArray = ["b", "a", "c"];
    const snapshot = [...callerArray];
    const sorted = sortIdentifiers(callerArray);
    expect(sorted).not.toBe(callerArray);
    expect(callerArray).toEqual(snapshot);
  });
});

describe("sortByIdentifier", () => {
  interface IdentifiedElement {
    identifier: string;
    payload: { value: number };
  }

  const elementA: IdentifiedElement = {
    identifier: "atlast:entity:service/api",
    payload: { value: 1 },
  };
  const elementB: IdentifiedElement = {
    identifier: "atlast:entity:service/checkout",
    payload: { value: 2 },
  };
  const elementC: IdentifiedElement = {
    identifier: "atlast:entity:service/worker",
    payload: { value: 3 },
  };

  it("sorts elements by the extracted identifier, deterministically under shuffled input", () => {
    const expected = [elementA, elementB, elementC];
    const permutations = [
      [elementC, elementA, elementB],
      [elementB, elementC, elementA],
    ];
    for (const permutation of permutations) {
      expect(
        sortByIdentifier(permutation, (element) => element.identifier),
      ).toEqual(expected);
    }
  });

  it("evaluates the extractor exactly once per element (decorate–sort–undecorate)", () => {
    let extractorCallCount = 0;
    const elements = [elementC, elementA, elementB, elementC, elementA];

    sortByIdentifier(elements, (element) => {
      extractorCallCount += 1;
      return element.identifier;
    });

    expect(extractorCallCount).toBe(elements.length);
  });

  it("keeps input order for equal identifiers (stable sort)", () => {
    const firstDuplicate = { identifier: "atlast:entity:service/dup", tag: 1 };
    const secondDuplicate = { identifier: "atlast:entity:service/dup", tag: 2 };
    const sorted = sortByIdentifier(
      [secondDuplicate, firstDuplicate],
      (element) => element.identifier,
    );
    expect(sorted[0]).toBe(secondDuplicate);
    expect(sorted[1]).toBe(firstDuplicate);
  });

  it("carries elements by reference and never mutates the array or the elements", () => {
    const callerArray = [elementC, elementA];
    const arraySnapshot = [...callerArray];
    const elementSnapshot = structuredClone(elementC);

    const sorted = sortByIdentifier(
      callerArray,
      (element) => element.identifier,
    );

    expect(sorted).not.toBe(callerArray);
    expect(callerArray).toEqual(arraySnapshot);
    expect(elementC).toEqual(elementSnapshot);
    expect(sorted[0]).toBe(elementA);
    expect(sorted[1]).toBe(elementC);
  });
});
