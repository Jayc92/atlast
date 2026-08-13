/**
 * Shared canonical-URL-state wiring for every M2-B topology route (Journey F:
 * "Invalid URL state is replaced with a safe canonical state and an
 * accessible explanation"). Built entirely on the existing M2-A
 * `parseTopologyUrlState`/`serializeTopologyUrlState` foundation and React
 * Router's own `useSearchParams` — no parallel URL mechanism.
 *
 * Once a correction is detected, `wasCorrected` stays true for the lifetime
 * of this component instance (even after the URL itself is fixed up) so the
 * accessible explanation stays visible long enough to be noticed, rather
 * than flashing for a single render.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, type SetURLSearchParams } from "react-router";
import {
  parseTopologyUrlState,
  serializeTopologyUrlState,
  type TopologyUrlState,
} from "../url/query-state.ts";

export interface CanonicalTopologyUrlState {
  readonly state: TopologyUrlState;
  readonly wasCorrected: boolean;
  readonly setSearchParams: SetURLSearchParams;
}

export function useCanonicalTopologyUrlState(): CanonicalTopologyUrlState {
  const [searchParams, setSearchParams] = useSearchParams();
  const [wasCorrected, setWasCorrected] = useState(false);
  const searchParamsKey = searchParams.toString();
  // Recomputed exactly when the URL's query string actually changes —
  // `searchParamsKey` (not `searchParams`, a new object every render) is the
  // dependency, since this project has no react-hooks lint plugin to enforce
  // exhaustive-deps and the dependency must therefore be chosen deliberately.
  const parsed = useMemo(
    () => parseTopologyUrlState(searchParams),
    [searchParamsKey],
  );

  useEffect(() => {
    if (parsed.wasCanonicalized) {
      setWasCorrected(true);
      setSearchParams(serializeTopologyUrlState(parsed.state), {
        replace: true,
      });
    }
  }, [searchParamsKey]);

  return { state: parsed.state, wasCorrected, setSearchParams };
}
