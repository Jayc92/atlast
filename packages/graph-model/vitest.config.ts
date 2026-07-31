/**
 * Vitest configuration for @atlast/graph-model (ADR-0008). The single
 * non-default setting mirrors tsconfig.json's `paths` mapping at runtime:
 * `@atlast/shared` is consumed as TypeScript source inside the workspace
 * (the shared package intentionally publishes no build output or
 * entry-point fields), so the package name resolves to its source index
 * here exactly as it does for the type checker.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@atlast/shared": fileURLToPath(
        new URL("../shared/src/index.ts", import.meta.url),
      ),
    },
  },
});
