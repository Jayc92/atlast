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
);
