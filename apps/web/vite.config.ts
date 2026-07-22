/**
 * Vite configuration for the Atlast web application (M0 shell per ADR-0003).
 *
 * The dev and preview servers bind to the loopback interface only — like the
 * API shell, the unauthenticated M0 frontend is structurally unreachable from
 * the network (GUARDRAILS.md § 1.4). The browser requests the relative path
 * `/api/health`; the proxy below forwards it to the API's `GET /health` on
 * localhost, so the API needs no CORS configuration and the browser bundle
 * never contains an API host.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const LOOPBACK_HOST = "127.0.0.1";

/**
 * Forward the browser-facing `/api/health` path to the backend API shell's
 * `GET /health` (default port 3001 per apps/api/src/server.ts). The rewrite
 * strips the `/api` prefix so the API's route surface stays unchanged.
 */
const apiHealthProxy = {
  "/api": {
    target: `http://${LOOPBACK_HOST}:3001`,
    rewrite: (requestPath: string): string => requestPath.replace(/^\/api/, ""),
  },
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    host: LOOPBACK_HOST,
    proxy: apiHealthProxy,
  },
  preview: {
    host: LOOPBACK_HOST,
    proxy: apiHealthProxy,
  },
  // Build output is git-ignored (dist/ per the root .gitignore).
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
  },
});
