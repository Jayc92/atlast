/**
 * Vitest configuration for @atlast/api (ADR-0008). Mirrors
 * packages/graph-model's vitest.config.ts convention: `@atlast/graph-model`
 * and `@atlast/shared` are consumed as TypeScript source inside the
 * workspace for tests (their built dist/ output is a build-time-only
 * concern), so both package names resolve to their source index here
 * exactly as they do for the type checker (ADR-0024 § 14).
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@atlast/graph-model": fileURLToPath(
        new URL("../../packages/graph-model/src/index.ts", import.meta.url),
      ),
      "@atlast/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
});
