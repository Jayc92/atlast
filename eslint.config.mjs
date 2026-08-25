// Root flat ESLint configuration per ADR-0006: one shared, type-aware, strict
// config for every workspace package. Formatting rules are deliberately absent
// — formatting belongs to Prettier (ADR-0007), and the two tools must not
// overlap.
import js from "@eslint/js";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/coverage/",
    "**/*.generated.*",
    "pnpm-lock.yaml",
  ]),

  {
    linterOptions: {
      // An eslint-disable comment that no longer suppresses anything is a
      // stale escape hatch and must be removed, per ADR-0006.
      reportUnusedDisableDirectives: "error",
    },
  },

  js.configs.recommended,

  {
    // Every eslint-disable requires a written justification, and unused
    // disables are errors — suppression stays visible in review (ADR-0006).
    plugins: {
      "eslint-comments": eslintComments,
    },
    rules: {
      "eslint-comments/require-description": "error",
      "eslint-comments/no-unused-disable": "error",
    },
  },

  {
    // Type-aware strict baseline for all TypeScript sources (ADR-0006).
    // strictTypeChecked already enforces no-explicit-any and the no-unsafe-*
    // family as errors; the rules below are the guardrail-critical additions
    // it does not enable on its own.
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        // projectService discovers each package's tsconfig as packages gain
        // one — no per-package ESLint config edits needed later.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A dropped promise is a silently swallowed failure — banned by
      // GUARDRAILS.md § 2 ("errors are handled explicitly").
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // Public interfaces must be fully typed (GUARDRAILS.md § 2 "types on").
      "@typescript-eslint/explicit-module-boundary-types": "error",
    },
  },

  {
    // JavaScript and config files have no TypeScript project, so type-aware
    // rules cannot apply to them; untyped-language rules still do.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    // An empty catch block is the canonical silent catch-all
    // (GUARDRAILS.md § 2); js.recommended's no-empty permits it via option,
    // so pin the option shut everywhere.
    rules: {
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },

  {
    // The M2-A browser import boundary (ADR-0026 § 5; docs/m2-plan.md § 6),
    // extended by M4-E (ADR-0033 § 3.5) to also cover packages/impact-model:
    // apps/web must never import fixtures, packages/graph-model,
    // packages/overlay-model, packages/impact-model, or an apps/api server
    // module — every graph, overlay, and impact read happens over the query
    // API, never a side door. `@atlast/shared` (types and the additive HTTP
    // schemas) is apps/web's one approved workspace dependency and is
    // deliberately not matched by any pattern below. Enforced with the
    // built-in `no-restricted-imports` rule — no new ESLint plugin
    // dependency.
    files: ["apps/web/src/**/*.ts", "apps/web/src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@atlast/graph-model",
              message:
                "apps/web must never import packages/graph-model — read only through the query API (ADR-0026 § 3).",
            },
            {
              name: "@atlast/overlay-model",
              message:
                "apps/web must never import packages/overlay-model — read only through the query API (ADR-0026 § 3).",
            },
            {
              name: "@atlast/impact-model",
              message:
                "apps/web must never import packages/impact-model — read only through the query API (ADR-0033 § 3.5).",
            },
            {
              name: "@atlast/api",
              message:
                "apps/web must never import an API server module — read only through the query API over HTTP (ADR-0026 § 3).",
            },
            {
              name: "@atlast/connectors",
              message:
                "apps/web must never import packages/connectors — real-system discovery, credentials, and the Kubernetes client boundary stay server-side only; the browser reads discovered data only through the query API (ADR-0026 § 3; ADR-0040 § 1, M6-A).",
            },
          ],
          patterns: [
            {
              group: [
                "@atlast/graph-model/*",
                "**/packages/graph-model/**",
                "**/graph-model/**",
              ],
              message:
                "apps/web must never import packages/graph-model, or a repository implementation living inside it — read only through the query API (ADR-0026 § 3).",
            },
            {
              group: [
                "@atlast/overlay-model/*",
                "**/packages/overlay-model/**",
                "**/overlay-model/**",
              ],
              message:
                "apps/web must never import packages/overlay-model — read only through the query API (ADR-0026 § 3).",
            },
            {
              group: [
                "@atlast/connectors/*",
                "**/packages/connectors/**",
                "**/connectors/**",
              ],
              message:
                "apps/web must never import packages/connectors — real-system discovery, credentials, and the Kubernetes client boundary stay server-side only; the browser reads discovered data only through the query API (ADR-0026 § 3; ADR-0040 § 1, M6-A).",
            },
            {
              group: [
                "@atlast/impact-model/*",
                "**/packages/impact-model/**",
                "**/impact-model/**",
              ],
              message:
                "apps/web must never import packages/impact-model — read only through the query API (ADR-0033 § 3.5).",
            },
            {
              group: ["**/fixtures/**", "**/fixtures"],
              message:
                "apps/web must never import fixtures — read only through the query API (ADR-0026 § 3).",
            },
            {
              group: ["@atlast/api/*", "**/apps/api/**"],
              message:
                "apps/web must never import an API server module — read only through the query API over HTTP (ADR-0026 § 3).",
            },
          ],
        },
      ],
    },
  },

  {
    // The M5-A Kubernetes connector's structural read-only boundary
    // (ADR-0037 § 5): `@kubernetes/client-node` may be imported only from
    // the dedicated client wrapper, never from any other file in this
    // connector or anywhere else. This confines the raw client — and any
    // write-capable method it exposes — to one reviewed file, the same
    // "one narrow file, everything else restricted" discipline the
    // apps/web boundary above already applies to graph-model/overlay-model.
    files: ["packages/connectors/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@kubernetes/client-node",
              message:
                "packages/connectors must import @kubernetes/client-node only from src/kubernetes/client.ts — the M5-A structural read-only boundary (ADR-0037 § 5).",
            },
          ],
          patterns: [
            {
              group: ["@kubernetes/client-node/*"],
              message:
                "packages/connectors must import @kubernetes/client-node only from src/kubernetes/client.ts — the M5-A structural read-only boundary (ADR-0037 § 5).",
            },
          ],
        },
      ],
    },
  },
  {
    // The one authorized exception: client.ts itself is the sole file
    // permitted to import the raw client library. A later block always
    // wins over an earlier one for the same file in ESLint flat config.
    files: ["packages/connectors/src/kubernetes/client.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
