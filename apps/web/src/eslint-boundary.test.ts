// @vitest-environment node
/**
 * Direct proof that the ADR-0026 § 5 import-boundary rule
 * (`eslint.config.mjs`'s `apps/web/src/**` block) actually rejects
 * representative fixture, graph-model, repository, and API-server imports,
 * and does not reject the one approved `@atlast/shared` import.
 *
 * This spawns the already-installed root ESLint CLI as a subprocess — the
 * same tool `pnpm lint`/`scripts/verify.sh` already invoke — rather than
 * importing the `eslint` package as a JS module, so no package declares a
 * new dependency merely to run this proof (ESLint is already this
 * repository's linter, ADR-0006; `@atlast/web` gains no new devDependency).
 *
 * The probe file is written to a real path under `apps/web/src/` only for
 * the duration of this test (real, on-disk type-aware linting needs a real
 * file) and is always removed afterward, in `finally`, so it never lands in
 * the tracked tree the repository's own `pnpm lint`/`verify.sh` sweep runs
 * against.
 *
 * Forced to the Vitest "node" environment (overriding this package's
 * jsdom default): under jsdom, `import.meta.url` resolves through jsdom's
 * own `URL`/module-graph handling rather than a plain Node `file:` URL, so
 * `fileURLToPath` below would reject it — this module needs real Node path
 * resolution and process spawning, not a DOM.
 */
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

interface EslintJsonResult {
  readonly filePath: string;
  readonly messages: readonly { readonly ruleId: string | null }[];
}

/**
 * Lints `sourceText` as if it were a real file at
 * `apps/web/src/<probeFileName>`, returning the parsed `--format json`
 * result for that one file. The probe file is created under the real
 * `apps/web/src/` tree (type-aware linting needs a real file to resolve
 * against `apps/web/tsconfig.json`'s `include`) and is deleted before this
 * function returns, success or failure.
 */
function lintProbeSource(
  probeFileName: string,
  sourceText: string,
): readonly { readonly ruleId: string | null }[] {
  const probePath = join(repositoryRoot, "apps/web/src", probeFileName);
  writeFileSync(probePath, sourceText, "utf-8");
  try {
    const eslintProcess = spawnSync(
      "pnpm",
      ["exec", "eslint", "--format", "json", `apps/web/src/${probeFileName}`],
      { cwd: repositoryRoot, encoding: "utf-8" },
    );
    if (eslintProcess.error) {
      throw eslintProcess.error;
    }
    const results = JSON.parse(
      eslintProcess.stdout,
    ) as readonly EslintJsonResult[];
    const fileResult = results.find((result) =>
      result.filePath.endsWith(`apps/web/src/${probeFileName}`),
    );
    return fileResult?.messages ?? [];
  } finally {
    rmSync(probePath, { force: true });
  }
}

describe("ADR-0026 § 5 restricted-import boundary — direct proof", () => {
  it("rejects a direct @atlast/graph-model import", () => {
    const messages = lintProbeSource(
      "__probe_graph_model__.ts",
      'import { InMemoryEvidenceStore } from "@atlast/graph-model";\nexport const probe = InMemoryEvidenceStore;\n',
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true,
    );
  }, 30_000);

  it("rejects a deep relative import reaching into packages/graph-model", () => {
    const messages = lintProbeSource(
      "__probe_graph_model_relative__.ts",
      'import { InMemoryEvidenceStore } from "../../../packages/graph-model/src/evidence-store.ts";\nexport const probe = InMemoryEvidenceStore;\n',
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true,
    );
  }, 30_000);

  it("rejects a relative import reaching into fixtures", () => {
    const messages = lintProbeSource(
      "__probe_fixtures__.ts",
      'import catalog from "../../../fixtures/demo-company/catalog.json";\nexport const probe = catalog;\n',
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true,
    );
  }, 30_000);

  it("rejects a relative import reaching into an apps/api server module", () => {
    const messages = lintProbeSource(
      "__probe_api_server__.ts",
      'import { buildApplication } from "../../../apps/api/src/app.ts";\nexport const probe = buildApplication;\n',
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true,
    );
  }, 30_000);

  it("does not reject the approved @atlast/shared import", () => {
    const messages = lintProbeSource(
      "__probe_shared_allowed__.ts",
      'import { errorResponseSchema } from "@atlast/shared";\nexport const probe = errorResponseSchema;\n',
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      false,
    );
  }, 30_000);
});
