/**
 * Playwright configuration for the M0 browser acceptance suite (ADR-0010).
 *
 * This is the only test layer that exercises the fully assembled system:
 * the real built API server, the real built web bundle behind the Vite
 * preview proxy, and a real browser over genuine HTTP. Both servers are
 * built, started, and torn down by Playwright itself so the suite never
 * depends on pre-existing dist/ output or manually started processes, and
 * everything stays on the loopback interface (GUARDRAILS.md § 1.4).
 */
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Both webServer commands run from the repository root so pnpm's --filter
 * resolution works no matter where `playwright test` was launched from.
 */
const repositoryRoot: string = path.resolve(import.meta.dirname, "..", "..");

const LOOPBACK_HOST = "127.0.0.1";
const API_PORT = 3001;
const WEB_PREVIEW_PORT = 4173;

export default defineConfig({
  testDir: "./specs",
  // Determinism is non-negotiable (GUARDRAILS.md § 5): a test that needs a
  // retry to pass is a broken test, so retries stay at zero everywhere.
  retries: 0,
  // `only` left in a spec would silently shrink the acceptance surface.
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://${LOOPBACK_HOST}:${String(WEB_PREVIEW_PORT)}`,
    // Debugging artifacts are kept only for failures (ADR-0010: traces and
    // screenshots are the post-mortem record for acceptance regressions).
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      // Build the API from source, then run the genuine built server — the
      // acceptance layer proves the artifacts that would ship, not the dev
      // loop (ADR-0010).
      command:
        "pnpm --filter @atlast/api build && pnpm --filter @atlast/api start",
      url: `http://${LOOPBACK_HOST}:${String(API_PORT)}/health`,
      cwd: repositoryRoot,
      env: { ATLAST_API_PORT: String(API_PORT) },
      reuseExistingServer: false,
      // Readiness ceiling only — success is signaled by the URL responding,
      // never by waiting this long. Raised above Playwright's default to
      // absorb a cold `tsc` build before the server can even start.
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Build the web bundle, then serve it with Vite preview, which also
      // provides the real /api proxy to the API server above. --strictPort
      // makes a port collision a loud failure instead of Vite silently
      // drifting to a port the readiness URL is not watching.
      command: `pnpm --filter @atlast/web build && pnpm --filter @atlast/web preview --port ${String(WEB_PREVIEW_PORT)} --strictPort`,
      url: `http://${LOOPBACK_HOST}:${String(WEB_PREVIEW_PORT)}/`,
      cwd: repositoryRoot,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
