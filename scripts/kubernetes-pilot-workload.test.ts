import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workloadYaml = readFileSync(
  fileURLToPath(new URL("./kubernetes-pilot-workload.yaml", import.meta.url)),
  "utf-8",
);

describe("scripts/kubernetes-pilot-workload.yaml", () => {
  it("declares the checkout Deployment with exactly 2 replicas", () => {
    expect(workloadYaml).toMatch(/kind:\s*Deployment/);
    expect(workloadYaml).toMatch(/name:\s*checkout\b/);
    expect(workloadYaml).toMatch(/replicas:\s*2\b/);
  });

  it("declares checkout-service selecting app: checkout", () => {
    expect(workloadYaml).toMatch(/name:\s*checkout-service\b/);
    expect(workloadYaml).toMatch(/selector:\s*\n\s*app:\s*checkout\b/);
  });

  it("declares unused-service with a selector matching no real Pod", () => {
    expect(workloadYaml).toMatch(/name:\s*unused-service\b/);
    expect(workloadYaml).toMatch(
      /selector:\s*\n\s*app:\s*nothing-matches-this\b/,
    );
  });

  it("declares a selectorless Service", () => {
    expect(workloadYaml).toMatch(/name:\s*external-or-selectorless\b/);
    expect(workloadYaml).toMatch(/type:\s*ExternalName\b/);
    // A Service with type: ExternalName never has a spec.selector field —
    // confirm the literal key does not appear anywhere in that object's own
    // block (the only "selector:" keys in this file belong to the two
    // Services above, both already asserted).
    const selectorlessBlockStart = workloadYaml.indexOf(
      "name: external-or-selectorless",
    );
    const nextDocumentStart = workloadYaml.indexOf(
      "\n---",
      selectorlessBlockStart,
    );
    const selectorlessBlock = workloadYaml.slice(
      selectorlessBlockStart,
      nextDocumentStart === -1 ? undefined : nextDocumentStart,
    );
    expect(selectorlessBlock).not.toContain("selector:");
  });

  it("declares a bare/control Pod", () => {
    expect(workloadYaml).toMatch(/kind:\s*Pod\b/);
    expect(workloadYaml).toMatch(/name:\s*bare-standalone-pod\b/);
  });

  it("does not declare a ReplicaSet", () => {
    expect(workloadYaml).not.toMatch(/kind:\s*ReplicaSet\b/);
  });

  it("does not declare an explicit Deployment-owned checkout Pod", () => {
    // The only "kind: Pod" object in the file must be the bare/control Pod;
    // Kubernetes creates the Deployment's own Pods naturally, never this file.
    const podDocuments = workloadYaml
      .split(/^---$/m)
      .filter((document) => /kind:\s*Pod\b/.test(document));
    expect(podDocuments).toHaveLength(1);
    expect(podDocuments[0]).toMatch(/name:\s*bare-standalone-pod\b/);
  });

  it("does not declare a ClusterRole, Secret, or EndpointSlice", () => {
    expect(workloadYaml).not.toMatch(/kind:\s*ClusterRole\b/);
    expect(workloadYaml).not.toMatch(/kind:\s*Secret\b/);
    expect(workloadYaml).not.toMatch(/kind:\s*EndpointSlice\b/);
  });

  it("declares no mutation-capable RBAC of any kind (this file grants no RBAC at all)", () => {
    expect(workloadYaml).not.toMatch(/kind:\s*Role\b/);
    expect(workloadYaml).not.toMatch(/kind:\s*RoleBinding\b/);
    expect(workloadYaml).not.toMatch(/verbs:/);
  });

  it("never leaks Atlast's own verdict vocabulary or ADR case references (only plain Kubernetes rationale)", () => {
    const lowered = workloadYaml.toLowerCase();
    const forbiddenSubstrings = [
      "known-zero",
      "correctly-discovered",
      "adr-0039",
      "case a",
      "case c",
      "case e",
      "never unknown",
      "not a failure",
      "atlast:entity",
    ];
    for (const forbidden of forbiddenSubstrings) {
      expect(lowered).not.toContain(forbidden.toLowerCase());
    }
  });
});
