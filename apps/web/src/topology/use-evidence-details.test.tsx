import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { topologyRequestCache } from "./session.ts";
import {
  buildEvidenceDetailResult,
  FIXTURE_EVIDENCE_IDENTIFIER,
} from "./test-support/fixtures.ts";
import { useEvidenceDetails } from "./use-evidence-details.ts";

afterEach(() => {
  cleanup();
  topologyRequestCache.clear();
  vi.unstubAllGlobals();
});

describe("useEvidenceDetails", () => {
  it("reports a validated API error and retries the exact Evidence lookup", async () => {
    let attempt = 0;
    const fetchStub =
      vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
    fetchStub.mockImplementation((): Promise<Response> => {
      attempt += 1;
      const firstAttempt = attempt === 1;
      return Promise.resolve({
        ok: !firstAttempt,
        json: (): Promise<unknown> =>
          Promise.resolve(
            firstAttempt
              ? {
                  code: "UNKNOWN_IDENTIFIER",
                  message: "This Evidence record is not available.",
                  details: {
                    identifierKind: "evidence",
                    identifier: FIXTURE_EVIDENCE_IDENTIFIER,
                  },
                }
              : buildEvidenceDetailResult(),
          ),
      } as Response);
    });
    vi.stubGlobal("fetch", fetchStub);

    const { result } = renderHook(() =>
      useEvidenceDetails([FIXTURE_EVIDENCE_IDENTIFIER]),
    );

    await waitFor(() => {
      expect(result.current.states[FIXTURE_EVIDENCE_IDENTIFIER]).toEqual({
        status: "api-error",
        error: {
          code: "UNKNOWN_IDENTIFIER",
          message: "This Evidence record is not available.",
          details: {
            identifierKind: "evidence",
            identifier: FIXTURE_EVIDENCE_IDENTIFIER,
          },
        },
      });
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.states[FIXTURE_EVIDENCE_IDENTIFIER]).toEqual({
        status: "loaded",
        data: buildEvidenceDetailResult(),
      });
    });
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls[0]?.[0]).toBe(fetchStub.mock.calls[1]?.[0]);
  });
});
