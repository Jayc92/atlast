import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Stub-tool subprocess tests genuinely take longer than a pure-unit
    // test; this workspace has no browser/network dependency to isolate.
    testTimeout: 15_000,
  },
});
