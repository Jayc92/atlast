/**
 * Injected-stub-tool harness for testing scripts/setup-kubernetes-pilot.sh
 * and scripts/cleanup-kubernetes-pilot.sh without a real Kind cluster,
 * Docker daemon, or Kubernetes API — every external tool the scripts shell
 * out to (git, node, docker, kubectl, kind) is replaced by a tiny stub
 * executable whose behavior is controlled entirely by environment
 * variables, so CI never depends on Docker/Kind.
 */
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
  unlinkSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

/**
 * The minimal set of genuine POSIX utilities `setup-kubernetes-pilot.sh`
 * itself invokes (`bash` to launch it via its own shebang, plus every
 * external command the script body calls) — resolved once, up front,
 * against the real ambient PATH, then symlinked into a small dedicated
 * directory. This (not `/usr/bin:/bin`) is the only directory besides the
 * stub tool directory ever placed on a test's PATH: `/usr/bin`/`/bin` on
 * GitHub's `ubuntu-latest` runner happen to also contain real `kubectl` and
 * `docker` binaries, which previously defeated the "missing tool"
 * simulation by leaving a real fallback copy reachable even after the
 * injected stub was removed. Naming only these seven utilities keeps the
 * simulation genuinely hermetic without guessing at, or depending on,
 * where any given host happens to install kubectl/docker/kind/etc.
 */
const REQUIRED_SYSTEM_UTILITIES = [
  "bash",
  "cat",
  "dirname",
  "grep",
  "seq",
  "sleep",
  "tr",
  "wc",
] as const;

let cachedSafeUtilsDir: string | undefined;

function resolveRealPath(executableName: string): string {
  return execFileSync("bash", ["-c", `command -v ${executableName}`], {
    encoding: "utf-8",
  }).trim();
}

/** Built once per process and reused — these resolved paths never change
 * mid-run, and rebuilding per test would just repeat the same lookups. */
function safeUtilsDir(): string {
  if (cachedSafeUtilsDir !== undefined) {
    return cachedSafeUtilsDir;
  }
  const dir = mkdtempSync(join(tmpdir(), "atlast-m6-c-safe-utils-"));
  for (const name of REQUIRED_SYSTEM_UTILITIES) {
    symlinkSync(resolveRealPath(name), join(dir, name));
  }
  cachedSafeUtilsDir = dir;
  return dir;
}

const GIT_STUB = `#!/usr/bin/env bash
exit 0
`;

const NODE_STUB = `#!/usr/bin/env bash
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' "\${STUB_NODE_VERSION:-v24.15.0}"
  exit 0
fi
exit 0
`;

const DOCKER_STUB = `#!/usr/bin/env bash
if [ "\${1:-}" = "info" ]; then
  exit "\${STUB_DOCKER_INFO_EXIT:-0}"
fi
exit 0
`;

const KIND_STUB = `#!/usr/bin/env bash
if [ -n "\${STUB_LOG_FILE:-}" ]; then
  printf 'kind %s\\n' "$*" >> "\${STUB_LOG_FILE}"
fi
case "\${1:-}" in
  get)
    printf '%s\\n' "\${STUB_KIND_EXISTING_CLUSTERS:-}"
    exit 0
    ;;
  create)
    exit "\${STUB_KIND_CREATE_EXIT:-0}"
    ;;
  delete)
    exit "\${STUB_KIND_DELETE_EXIT:-0}"
    ;;
  *)
    exit 0
    ;;
esac
`;

const KUBECTL_STUB = `#!/usr/bin/env bash
if [ -n "\${STUB_LOG_FILE:-}" ]; then
  printf 'kubectl %s\\n' "$*" >> "\${STUB_LOG_FILE}"
fi
args="$*"
contains() { printf '%s' "\${args}" | grep -qF -- "$1"; }

if contains "apply -f"; then
  exit "\${STUB_KUBECTL_APPLY_EXIT:-0}"
fi
if contains "get serviceaccount default"; then
  exit "\${STUB_DEFAULT_SERVICEACCOUNT_EXIT:-0}"
fi
if contains "rollout status deployment/checkout"; then
  exit "\${STUB_ROLLOUT_EXIT:-0}"
fi
if contains "get deployment checkout -o jsonpath={.spec.replicas}"; then
  printf '%s' "\${STUB_CHECKOUT_REPLICAS:-2}"
  exit 0
fi
if contains "get replicasets -l app=checkout -o jsonpath={.items[0].metadata.name}"; then
  printf '%s' "\${STUB_REPLICASET_NAME:-checkout-abc123}"
  exit 0
fi
if contains "get replicaset \${STUB_REPLICASET_NAME:-checkout-abc123} -o jsonpath={.metadata.ownerReferences[0].kind}"; then
  printf '%s' "\${STUB_REPLICASET_OWNER_KIND:-Deployment}"
  exit 0
fi
if contains "get pods -l app=checkout -o jsonpath={.items[*].metadata.name}"; then
  printf '%s' "\${STUB_CHECKOUT_POD_NAMES:-checkout-abc123-aaa checkout-abc123-bbb}"
  exit 0
fi
if contains "get service checkout-service -o jsonpath={.spec.selector.app}"; then
  printf '%s' "\${STUB_CHECKOUT_SERVICE_SELECTOR:-checkout}"
  exit 0
fi
if contains "get service unused-service -o jsonpath={.spec.selector.app}"; then
  printf '%s' "\${STUB_UNUSED_SERVICE_SELECTOR:-nothing-matches-this}"
  exit 0
fi
if contains "get pods -l app=nothing-matches-this -o jsonpath={.items[*].metadata.name}"; then
  printf '%s' "\${STUB_UNUSED_MATCH_NAMES:-}"
  exit 0
fi
if contains "get service external-or-selectorless -o jsonpath={.spec.selector}"; then
  printf '%s' "\${STUB_SELECTORLESS_SELECTOR:-}"
  exit 0
fi
if contains "get pod bare-standalone-pod -o jsonpath={.metadata.ownerReferences}"; then
  printf '%s' "\${STUB_BARE_POD_OWNERS:-}"
  exit 0
fi
if contains "get deployment checkout" || contains "get service checkout-service" || contains "get service unused-service" || contains "get service external-or-selectorless" || contains "get pod bare-standalone-pod"; then
  exit "\${STUB_EXISTENCE_EXIT:-0}"
fi
exit 0
`;

const BOOTSTRAP_STUB = `#!/usr/bin/env bash
if [ -n "\${STUB_LOG_FILE:-}" ]; then
  printf 'bootstrap invoked\\n' >> "\${STUB_LOG_FILE}"
fi
exit "\${STUB_BOOTSTRAP_EXIT:-0}"
`;

const COREPACK_STUB = `#!/usr/bin/env bash
exit 0
`;

/**
 * Simulates the real root `pnpm build` producing the `dist/index.js` a real
 * clean clone is missing until built (this is what setup-kubernetes-pilot.sh
 * actually invokes at Stage 3) — writes to `STUB_BUILD_MARKER_FILE` only
 * when invoked with the literal `build` argument, standing in for the real
 * build artifact without running a real compiler or committing one.
 */
const PNPM_STUB = `#!/usr/bin/env bash
if [ -n "\${STUB_LOG_FILE:-}" ]; then
  printf 'pnpm %s\\n' "$*" >> "\${STUB_LOG_FILE}"
fi
if [ "\${1:-}" = "build" ] && [ -n "\${STUB_BUILD_MARKER_FILE:-}" ]; then
  : > "\${STUB_BUILD_MARKER_FILE}"
fi
exit "\${STUB_PNPM_BUILD_EXIT:-0}"
`;

export type StubTool =
  | "git"
  | "node"
  | "docker"
  | "kubectl"
  | "kind"
  | "corepack"
  | "pnpm"
  | "bootstrap";

export interface StubBin {
  readonly dir: string;
  readonly bootstrapScriptPath: string;
  /** Removes one tool's stub so `command -v <tool>` reports it missing. */
  removeTool(tool: StubTool): void;
  cleanup(): void;
}

const STUB_SOURCE: Record<StubTool, string> = {
  git: GIT_STUB,
  node: NODE_STUB,
  docker: DOCKER_STUB,
  kubectl: KUBECTL_STUB,
  kind: KIND_STUB,
  corepack: COREPACK_STUB,
  pnpm: PNPM_STUB,
  bootstrap: BOOTSTRAP_STUB,
};

export function createStubBin(): StubBin {
  const dir = mkdtempSync(join(tmpdir(), "atlast-m6-c-stub-bin-"));
  for (const tool of Object.keys(STUB_SOURCE) as StubTool[]) {
    const filePath = join(dir, tool === "bootstrap" ? "bootstrap.sh" : tool);
    writeFileSync(filePath, STUB_SOURCE[tool]);
    chmodSync(filePath, 0o755);
  }
  return {
    dir,
    bootstrapScriptPath: join(dir, "bootstrap.sh"),
    removeTool(tool: StubTool): void {
      unlinkSync(join(dir, tool === "bootstrap" ? "bootstrap.sh" : tool));
    },
    cleanup(): void {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface RunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a script with a hermetic PATH: only the stub tool directory plus a
 * dedicated directory of resolved symlinks for the exact POSIX utilities
 * the script itself needs (never `/usr/bin`/`/bin` wholesale, which on some
 * hosts — e.g. GitHub's `ubuntu-latest` runner — also contain real
 * `kubectl`/`docker` binaries that would defeat a "missing tool" test). */
export function runScript(
  scriptPath: string,
  args: readonly string[],
  stubBinDir: string,
  extraEnv: Readonly<Record<string, string>>,
): RunResult {
  const result = spawnSync(scriptPath, args, {
    env: {
      ...extraEnv,
      PATH: `${stubBinDir}:${safeUtilsDir()}`,
      HOME: process.env.HOME ?? "",
    },
    encoding: "utf-8",
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
