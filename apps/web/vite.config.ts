/**
 * Vite configuration for the Atlast web application (M0 shell per ADR-0003;
 * M2-A per ADR-0026).
 *
 * The dev and preview servers bind to the loopback interface only — like the
 * API shell, the unauthenticated frontend is structurally unreachable from
 * the network (GUARDRAILS.md § 1.4). The API needs no CORS configuration and
 * the browser bundle never contains an API host.
 */
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const LOOPBACK_HOST = "127.0.0.1";

/**
 * Two exact, non-overlapping proxy rules (ADR-0026 § 6), replacing the prior
 * catch-all `/api` -> "" rewrite that supported only `/api/health` and would
 * have turned `/api/v1/entities` into the nonexistent `/v1/entities`:
 *
 * - `/api/health` -> backend `/health` (the legacy M0 shell health alias);
 * - `/api/v1/*` -> backend `/api/v1/*` unchanged — the backend's seven query
 *   routes are already registered at the literal `/api/v1/...` path
 *   (`apps/api/src/routes/*.ts`), so no rewrite is needed or applied.
 *
 * Vite matches proxy keys by string prefix, and neither key is a prefix of
 * the other, so the two rules cannot shadow each other regardless of order.
 */
const apiProxy = {
  "/api/health": {
    target: `http://${LOOPBACK_HOST}:3001`,
    rewrite: (requestPath: string): string =>
      requestPath.replace(/^\/api\/health$/, "/health"),
  },
  "/api/v1": {
    target: `http://${LOOPBACK_HOST}:3001`,
  },
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    host: LOOPBACK_HOST,
    proxy: apiProxy,
  },
  preview: {
    host: LOOPBACK_HOST,
    proxy: apiProxy,
  },
  // Build output is git-ignored (dist/ per the root .gitignore).
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    // @atlast/shared is consumed through its real dist/main/types/exports in
    // production builds (vite build/preview never see this alias); it is
    // consumed as TypeScript source only for Vitest, mirroring the ADR-0024
    // § 14 convention apps/api and packages/graph-model already use for
    // typecheck/test (ADR-0026 § 3).
    alias: {
      "@atlast/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
});
