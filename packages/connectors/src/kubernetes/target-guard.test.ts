import { describe, expect, it } from "vitest";
import { assertLocalKindTarget, TargetGuardError } from "./target-guard.ts";

describe("assertLocalKindTarget", () => {
  it("passes when the context carries the kind- prefix and the server is loopback", () => {
    expect(() => {
      assertLocalKindTarget("kind-atlast-m5", "https://127.0.0.1:63200");
    }).not.toThrow();
  });

  it("accepts localhost as an equivalent loopback host", () => {
    expect(() => {
      assertLocalKindTarget("kind-atlast-m5", "https://localhost:6443");
    }).not.toThrow();
  });

  it("rejects a context without the kind- prefix, even against a loopback server", () => {
    expect(() => {
      assertLocalKindTarget("minikube", "https://127.0.0.1:63200");
    }).toThrow(TargetGuardError);
  });

  it("rejects a kind- context whose server is not loopback — the port-forward/proxy case", () => {
    expect(() => {
      assertLocalKindTarget("kind-atlast-m5", "https://203.0.113.5:6443");
    }).toThrow(TargetGuardError);
  });

  it("rejects an unparseable server URL rather than silently passing", () => {
    expect(() => {
      assertLocalKindTarget("kind-atlast-m5", "not a url");
    }).toThrow(TargetGuardError);
  });

  it("rejects a context that is neither kind-prefixed nor loopback", () => {
    expect(() => {
      assertLocalKindTarget("production", "https://api.example.invalid:6443");
    }).toThrow(TargetGuardError);
  });
});
