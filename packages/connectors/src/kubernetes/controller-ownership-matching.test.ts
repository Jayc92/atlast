import { describe, expect, it } from "vitest";
import { resolveControllerOwner } from "./controller-ownership-matching.ts";

interface FakeOwner {
  readonly uid: string;
  readonly label: string;
}

const OWNER_A: FakeOwner = { uid: "uid-a", label: "owner-a" };
const OWNER_B: FakeOwner = { uid: "uid-b", label: "owner-b" };

describe("resolveControllerOwner", () => {
  it("returns null when the child has no controller owner reference at all — a real, valid ownerless state", () => {
    expect(resolveControllerOwner(null, "Deployment", [OWNER_A])).toBeNull();
  });

  it("resolves the exact owner whose UID matches, by UID, never by name", () => {
    const resolved = resolveControllerOwner(
      { kind: "Deployment", name: "owner-a", uid: "uid-a" },
      "Deployment",
      [OWNER_A, OWNER_B],
    );
    expect(resolved).toBe(OWNER_A);
  });

  it("does NOT match a same-name/different-UID owner — UID is the only matching key", () => {
    const resolved = resolveControllerOwner(
      { kind: "Deployment", name: "owner-a", uid: "uid-does-not-exist" },
      "Deployment",
      [OWNER_A, OWNER_B],
    );
    expect(resolved).toBeNull();
  });

  it("returns null, never throws, when the owner UID is absent from this cycle's observed candidates (dangling/unobserved owner)", () => {
    expect(() =>
      resolveControllerOwner(
        { kind: "Deployment", name: "ghost", uid: "uid-never-observed" },
        "Deployment",
        [OWNER_A],
      ),
    ).not.toThrow();
    expect(
      resolveControllerOwner(
        { kind: "Deployment", name: "ghost", uid: "uid-never-observed" },
        "Deployment",
        [OWNER_A],
      ),
    ).toBeNull();
  });

  it("returns null when the owner reference's kind does not match the expected parent kind", () => {
    const resolved = resolveControllerOwner(
      { kind: "StatefulSet", name: "owner-a", uid: "uid-a" },
      "Deployment",
      [OWNER_A],
    );
    expect(resolved).toBeNull();
  });
});
