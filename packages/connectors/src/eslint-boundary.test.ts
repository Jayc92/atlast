// @vitest-environment node
/**
 * Direct proof that the M5-A structural read-only boundary
 * (`eslint.config.mjs`'s `packages/connectors/src/**` block, ADR-0037 § 5)
 * actually rejects a direct `@kubernetes/client-node` import from any file
 * other than `kubernetes/client.ts`, and does not reject `client.ts`
 * itself — mirroring `apps/web/src/eslint-boundary.test.ts`'s exact proof
 * style for a different boundary.
 *
 * Spawns the real root ESLint CLI as a subprocess, exactly as
 * `pnpm lint`/`scripts/verify.sh` already do, so no package declares a new
 * dependency merely to run this proof. The probe file is written to a real
 * path under `packages/connectors/src/` only for the duration of this
 * test and is always removed afterward, in `finally`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

interface EslintJsonResult {
  readonly filePath: string;
  readonly messages: readonly { readonly ruleId: string | null }[];
}

/**
 * Lints `sourceText` as if it were the real file at `relativeProbePath`.
 * If a real, already-tracked file exists at that path, its exact original
 * bytes are captured first and restored in `finally` — this path is never
 * deleted. Only used for the one probe that must target the real
 * `client.ts` (the ESLint exception matches an exact file path, not a
 * directory, so no synthetic filename can stand in for it). Every other
 * probe in this file uses a `__probe_*__.ts` filename that does not exist
 * beforehand and is deleted afterward, exactly like
 * `apps/web/src/eslint-boundary.test.ts`'s existing convention.
 */
function lintProbeSource(
  relativeProbePath: string,
  sourceText: string,
): readonly { readonly ruleId: string | null }[] {
  const probePath = join(repositoryRoot, relativeProbePath);
  const hadRealFile = existsSync(probePath);
  const originalContent = hadRealFile
    ? readFileSync(probePath, "utf-8")
    : undefined;
  writeFileSync(probePath, sourceText, "utf-8");
  try {
    const eslintProcess = spawnSync(
      "pnpm",
      ["exec", "eslint", "--format", "json", relativeProbePath],
      { cwd: repositoryRoot, encoding: "utf-8" },
    );
    if (eslintProcess.error) {
      throw eslintProcess.error;
    }
    const results = JSON.parse(
      eslintProcess.stdout,
    ) as readonly EslintJsonResult[];
    const fileResult = results.find((result) =>
      result.filePath.endsWith(relativeProbePath),
    );
    return fileResult?.messages ?? [];
  } finally {
    if (hadRealFile && originalContent !== undefined) {
      writeFileSync(probePath, originalContent, "utf-8");
    } else {
      rmSync(probePath, { force: true });
    }
  }
}

describe("ADR-0037 § 5 Kubernetes-client import boundary — direct proof", () => {
  it("rejects a direct @kubernetes/client-node import outside client.ts", () => {
    const messages = lintProbeSource(
      "packages/connectors/src/kubernetes/__probe_raw_client__.ts",
      'import { KubeConfig } from "@kubernetes/client-node";\nexport const probe = KubeConfig;\n',
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true,
    );
  }, 30_000);

  it("rejects a deep import path into @kubernetes/client-node outside client.ts", () => {
    const messages = lintProbeSource(
      "packages/connectors/src/kubernetes/__probe_raw_client_deep__.ts",
      'import { KubeConfig } from "@kubernetes/client-node/dist/config.js";\nexport const probe = KubeConfig;\n',
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true,
    );
  }, 30_000);

  it("does not reject the approved import inside client.ts itself", () => {
    const messages = lintProbeSource(
      "packages/connectors/src/kubernetes/client.ts",
      [
        'import { CoreV1Api, KubeConfig } from "@kubernetes/client-node";',
        'import { assertLocalKindTarget } from "./target-guard.ts";',
        'import type { ObservedPod } from "./observed-pod.ts";',
        "",
        "export function probe(): [typeof CoreV1Api, typeof KubeConfig, typeof assertLocalKindTarget] {",
        "  return [CoreV1Api, KubeConfig, assertLocalKindTarget];",
        "}",
        "export type { ObservedPod };",
        "",
      ].join("\n"),
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      false,
    );
  }, 30_000);

  it("does not reject the approved @atlast/shared import elsewhere in the connector", () => {
    const messages = lintProbeSource(
      "packages/connectors/src/kubernetes/__probe_shared_allowed__.ts",
      'import { evidenceSchema } from "@atlast/shared";\nexport const probe = evidenceSchema;\n',
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      false,
    );
  }, 30_000);
});
