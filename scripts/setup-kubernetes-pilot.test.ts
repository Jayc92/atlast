import { fileURLToPath } from "node:url";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createStubBin,
  runScript,
  type StubBin,
} from "./test-support/pilot-script-harness.ts";

const scriptPath = fileURLToPath(
  new URL("./setup-kubernetes-pilot.sh", import.meta.url),
);
const rbacManifestPath = fileURLToPath(
  new URL("./kubernetes-pilot-rbac.yaml", import.meta.url),
);
const workloadManifestPath = fileURLToPath(
  new URL("./kubernetes-pilot-workload.yaml", import.meta.url),
);

let activeStub: StubBin | undefined;
let activeLogDir: string | undefined;

afterEach(() => {
  activeStub?.cleanup();
  activeStub = undefined;
  if (activeLogDir !== undefined) {
    rmSync(activeLogDir, { recursive: true, force: true });
    activeLogDir = undefined;
  }
});

function stubBin(): StubBin {
  activeStub = createStubBin();
  return activeStub;
}

function newLogFile(): string {
  activeLogDir = mkdtempSync(join(tmpdir(), "atlast-m6-c-stub-log-"));
  return join(activeLogDir, "invocations.log");
}

/** Every environment variable a fully-succeeding happy-path run needs. */
function happyPathEnv(
  stub: StubBin,
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return {
    ATLAST_M6_BOOTSTRAP_SCRIPT: stub.bootstrapScriptPath,
    ...overrides,
  };
}

describe("scripts/setup-kubernetes-pilot.sh", () => {
  it("fails with exact remediation when kind is missing", () => {
    const stub = stubBin();
    stub.removeTool("kind");
    const result = runScript(scriptPath, [], stub.dir, happyPathEnv(stub));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("kind is not on PATH");
    expect(result.stderr).toContain("brew install kind");
  });

  it("fails with exact remediation when kubectl is missing", () => {
    const stub = stubBin();
    stub.removeTool("kubectl");
    const result = runScript(scriptPath, [], stub.dir, happyPathEnv(stub));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("kubectl is not on PATH");
    expect(result.stderr).toContain("brew install kubectl");
  });

  it("fails with exact remediation when the docker CLI is missing", () => {
    const stub = stubBin();
    stub.removeTool("docker");
    const result = runScript(scriptPath, [], stub.dir, happyPathEnv(stub));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("docker CLI is not on PATH");
    expect(result.stderr).toContain("Docker Desktop");
  });

  it("fails with exact remediation when the Docker daemon is unavailable", () => {
    const stub = stubBin();
    const result = runScript(
      scriptPath,
      [],
      stub.dir,
      happyPathEnv(stub, { STUB_DOCKER_INFO_EXIT: "1" }),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("no Docker daemon answered");
    expect(result.stderr).toContain("docker ps");
  });

  it("fails with exact remediation when Node is below the supported line", () => {
    const stub = stubBin();
    const result = runScript(
      scriptPath,
      [],
      stub.dir,
      happyPathEnv(stub, { STUB_NODE_VERSION: "v24.10.0" }),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("is not on the supported line");
    expect(result.stderr).toContain("nvm use");
  });

  it("stops with a --reset pointer when the pilot cluster already exists, without touching it", () => {
    const stub = stubBin();
    const log = newLogFile();
    const result = runScript(
      scriptPath,
      [],
      stub.dir,
      happyPathEnv(stub, {
        STUB_LOG_FILE: log,
        STUB_KIND_EXISTING_CLUSTERS: "atlast-m6-a",
      }),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("already exists");
    expect(result.stderr).toContain("--reset");
    const logText = readFileSync(log, "utf-8");
    expect(logText).not.toContain("delete cluster");
    expect(logText).not.toContain("create cluster");
  });

  it("--reset deletes and recreates exactly the configured pilot cluster, no other", () => {
    const stub = stubBin();
    const log = newLogFile();
    const result = runScript(
      scriptPath,
      ["--reset"],
      stub.dir,
      happyPathEnv(stub, {
        STUB_LOG_FILE: log,
        STUB_KIND_EXISTING_CLUSTERS: "atlast-m6-a",
      }),
    );
    expect(result.exitCode).toBe(0);
    const logLines = readFileSync(log, "utf-8").split("\n");
    const deleteLines = logLines.filter((line) =>
      line.includes("delete cluster"),
    );
    const createLines = logLines.filter((line) =>
      line.includes("create cluster"),
    );
    expect(deleteLines).toHaveLength(1);
    expect(createLines).toHaveLength(1);
    expect(deleteLines[0]).toContain("--name atlast-m6-a");
    expect(createLines[0]).toContain("--name atlast-m6-a");
    expect(deleteLines[0]).not.toMatch(/--name (?!atlast-m6-a)/);
    expect(createLines[0]).not.toMatch(/--name (?!atlast-m6-a)/);
  });

  it("every kubectl invocation uses the explicit kind-atlast-m6-a context", () => {
    const stub = stubBin();
    const log = newLogFile();
    const result = runScript(
      scriptPath,
      [],
      stub.dir,
      happyPathEnv(stub, { STUB_LOG_FILE: log }),
    );
    expect(result.exitCode).toBe(0);
    const kubectlLines = readFileSync(log, "utf-8")
      .split("\n")
      .filter((line) => line.startsWith("kubectl "));
    expect(kubectlLines.length).toBeGreaterThan(0);
    for (const line of kubectlLines) {
      expect(line).toContain("--context kind-atlast-m6-a");
    }
  });

  it("applies the RBAC manifest", () => {
    const stub = stubBin();
    const log = newLogFile();
    const result = runScript(
      scriptPath,
      [],
      stub.dir,
      happyPathEnv(stub, { STUB_LOG_FILE: log }),
    );
    expect(result.exitCode).toBe(0);
    const logText = readFileSync(log, "utf-8");
    expect(logText).toContain(`apply -f ${rbacManifestPath}`);
  });

  it("applies the deterministic workload manifest", () => {
    const stub = stubBin();
    const log = newLogFile();
    const result = runScript(
      scriptPath,
      [],
      stub.dir,
      happyPathEnv(stub, { STUB_LOG_FILE: log }),
    );
    expect(result.exitCode).toBe(0);
    const logText = readFileSync(log, "utf-8");
    expect(logText).toContain(`apply -f ${workloadManifestPath}`);
  });

  it("stops with an accurate message when the namespace never receives its default ServiceAccount", () => {
    const stub = stubBin();
    const result = runScript(
      scriptPath,
      [],
      stub.dir,
      happyPathEnv(stub, {
        STUB_DEFAULT_SERVICEACCOUNT_EXIT: "1",
        ATLAST_M6_SA_WAIT_ATTEMPTS: "2",
        ATLAST_M6_SA_WAIT_SLEEP_SECONDS: "0",
      }),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(
      "never received its default ServiceAccount",
    );
  });

  it("stops before declaring readiness when ground truth does not match", () => {
    const stub = stubBin();
    const result = runScript(
      scriptPath,
      [],
      stub.dir,
      happyPathEnv(stub, { STUB_CHECKOUT_REPLICAS: "1" }),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("expected 2");
    expect(result.stdout).not.toContain("pilot environment is ready");
  });

  it("prints the connect command on a successful setup, and never starts Atlast itself", () => {
    const stub = stubBin();
    const result = runScript(scriptPath, [], stub.dir, happyPathEnv(stub));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pilot environment is ready");
    expect(result.stdout).toContain("./scripts/connect-kubernetes-pilot.sh");
    expect(result.stdout).toContain("./scripts/cleanup-kubernetes-pilot.sh");
  });

  it("never leaks an expected Atlast answer (entity identifiers, impact hops, or verdicts)", () => {
    const scriptSource = readFileSync(scriptPath, "utf-8");
    const forbiddenSubstrings = [
      "atlast:entity",
      "atlast-m6-a-deployment-checkout",
      "atlast-m6-a-service-checkout",
      "correctly-discovered",
      "known-zero",
      " hop",
      "ranked",
    ];
    for (const forbidden of forbiddenSubstrings) {
      expect(scriptSource.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
