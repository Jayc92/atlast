/**
 * M2-A proxy-correction proof (ADR-0026 § 6 verification obligation):
 * "Built preview -> real API tests for `/api/health` and at least one
 * `/api/v1` route." This proves the corrected two-rule Vite proxy against
 * the real built web preview and the real built, fixture-backed API server
 * — not a mocked or dev-loop stand-in — reaching both the legacy health
 * alias and a real versioned route unchanged.
 */
import { expect, test } from "@playwright/test";

test("the built preview proxies /api/health to the built API unchanged", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    service: "atlast-api",
    datasetMode: "fixture",
  });
});

test("the built preview proxies a real /api/v1 route unchanged, not the nonexistent stripped-prefix path", async ({
  request,
}) => {
  const response = await request.get("/api/v1/entities");
  expect(response.status()).toBe(200);

  const payload: unknown = await response.json();
  expect(payload).toMatchObject({
    items: expect.any(Array),
    page: { hasMore: expect.any(Boolean) },
    meta: {
      resolvedIdentity: {
        asOf: expect.any(String),
        horizon: expect.any(Number),
        derivationVersion: expect.any(String),
      },
      schemaVersion: expect.any(String),
    },
  });

  // The Content-Type proves this is the real API JSON envelope, not Vite
  // preview's SPA-fallback index.html. The old catch-all rewrite would have
  // stripped "/api", turning this request into the nonexistent backend path
  // "/v1/entities" — the preview server's SPA fallback answers any unproxied,
  // unmatched path with `index.html` (a 200, but the wrong body), which
  // this Content-Type check distinguishes from a real API response.
  expect(response.headers()["content-type"]).toMatch(/application\/json/);
});
