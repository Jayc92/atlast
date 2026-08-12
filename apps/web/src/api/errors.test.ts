import { describe, expect, it } from "vitest";
import { isAbortError } from "./errors.ts";

describe("isAbortError", () => {
  it("recognizes a DOMException named AbortError", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("recognizes a plain Error named AbortError", () => {
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    expect(isAbortError(abortError)).toBe(true);
  });

  it.each([
    ["a different-named Error", new Error("network down")],
    ["a plain object with no name", {}],
    ["a string", "AbortError"],
    ["null", null],
    ["undefined", undefined],
  ])("does not misclassify %s as an abort", (_description, candidate) => {
    expect(isAbortError(candidate)).toBe(false);
  });
});
