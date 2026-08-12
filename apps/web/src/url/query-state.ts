/**
 * Complete-pin URL parsing and canonicalization (docs/m2-plan.md § 5;
 * ADR-0026 § 2/§ 4). The canonical query parameters are `q`, `direction`,
 * `depth`, `minConfidence`, `view`, `selected`, and the pin triple `asOf`,
 * `horizon`, `derivationVersion` — present together or absent together.
 *
 * Invalid or partial URL state is never half-honored: an unrecognized value
 * or a partial pin is dropped (canonicalized to its "absent" meaning) rather
 * than guessed at, matching Journey F ("Invalid URL state is replaced with a
 * safe canonical state") — the caller is told whether anything was corrected
 * so it can show that explanation, but the *state itself* is always safe to
 * act on immediately.
 */
import {
  snapshotIdentitySchema,
  type SnapshotIdentity,
  type TraversalDirection,
} from "@atlast/shared";

export type TopologyViewMode = "graph" | "list";

export interface TopologyUrlState {
  readonly q?: string;
  readonly direction?: TraversalDirection;
  readonly depth?: number;
  readonly minConfidence?: number;
  readonly view?: TopologyViewMode;
  readonly selected?: string;
  /** The complete pin, or `undefined` for latest (unpinned) exploration. */
  readonly pin?: SnapshotIdentity;
}

export interface ParsedTopologyUrlState {
  readonly state: TopologyUrlState;
  /** True if any field was dropped because it was invalid, partial, or malformed. */
  readonly wasCanonicalized: boolean;
}

const MINIMUM_TRAVERSAL_DEPTH = 1;
const MAXIMUM_TRAVERSAL_DEPTH = 5;
const DIRECTION_VALUES: ReadonlySet<string> = new Set([
  "upstream",
  "downstream",
]);
const VIEW_VALUES: ReadonlySet<string> = new Set(["graph", "list"]);
const CANONICAL_PARAMETER_NAMES: ReadonlySet<string> = new Set([
  "q",
  "direction",
  "depth",
  "minConfidence",
  "view",
  "selected",
  "asOf",
  "horizon",
  "derivationVersion",
]);

function hasNonCanonicalParameterShape(searchParams: URLSearchParams): boolean {
  const counts = new Map<string, number>();
  for (const key of searchParams.keys()) {
    if (!CANONICAL_PARAMETER_NAMES.has(key)) {
      return true;
    }
    const count = (counts.get(key) ?? 0) + 1;
    if (count > 1) {
      return true;
    }
    counts.set(key, count);
  }

  return searchParams.get("q") === "" || searchParams.get("selected") === "";
}

function nonEmptyOrUndefined(raw: string | null): string | undefined {
  return raw !== null && raw.length > 0 ? raw : undefined;
}

function parseDirection(raw: string | null): {
  readonly value: TraversalDirection | undefined;
  readonly invalid: boolean;
} {
  if (raw === null) {
    return { value: undefined, invalid: false };
  }
  return DIRECTION_VALUES.has(raw)
    ? { value: raw as TraversalDirection, invalid: false }
    : { value: undefined, invalid: true };
}

function parseView(raw: string | null): {
  readonly value: TopologyViewMode | undefined;
  readonly invalid: boolean;
} {
  if (raw === null) {
    return { value: undefined, invalid: false };
  }
  return VIEW_VALUES.has(raw)
    ? { value: raw as TopologyViewMode, invalid: false }
    : { value: undefined, invalid: true };
}

function parseIntegerInRange(
  raw: string | null,
  minimum: number,
  maximum: number,
): { readonly value: number | undefined; readonly invalid: boolean } {
  if (raw === null) {
    return { value: undefined, invalid: false };
  }
  if (!/^\d+$/.test(raw)) {
    return { value: undefined, invalid: true };
  }
  const parsed = Number(raw);
  return parsed >= minimum && parsed <= maximum
    ? { value: parsed, invalid: false }
    : { value: undefined, invalid: true };
}

function parseDecimalInRange(
  raw: string | null,
  minimum: number,
  maximum: number,
): { readonly value: number | undefined; readonly invalid: boolean } {
  if (raw === null) {
    return { value: undefined, invalid: false };
  }
  if (!/^\d+(?:\.\d+)?$/.test(raw)) {
    return { value: undefined, invalid: true };
  }
  const parsed = Number(raw);
  return parsed >= minimum && parsed <= maximum
    ? { value: parsed, invalid: false }
    : { value: undefined, invalid: true };
}

/**
 * The complete-pin rule: `asOf`, `horizon`, and `derivationVersion` present
 * together validate through the shared `snapshotIdentitySchema`; one or two
 * present is a partial pin and is dropped entirely (never half-pinned);
 * zero present means latest. A well-formed-looking but semantically invalid
 * triple (e.g. a malformed timestamp) is dropped exactly like a partial one.
 */
function parsePin(searchParams: URLSearchParams): {
  readonly value: SnapshotIdentity | undefined;
  readonly invalid: boolean;
} {
  const asOf = searchParams.get("asOf");
  const horizonRaw = searchParams.get("horizon");
  const derivationVersion = searchParams.get("derivationVersion");
  const presentCount = [asOf, horizonRaw, derivationVersion].filter(
    (component) => component !== null,
  ).length;

  if (presentCount === 0) {
    return { value: undefined, invalid: false };
  }
  if (presentCount < 3) {
    return { value: undefined, invalid: true };
  }

  const horizon =
    horizonRaw !== null && /^\d+$/.test(horizonRaw)
      ? Number(horizonRaw)
      : Number.NaN;
  const parsed = snapshotIdentitySchema.safeParse({
    asOf,
    horizon,
    derivationVersion,
  });
  return parsed.success
    ? { value: parsed.data, invalid: false }
    : { value: undefined, invalid: true };
}

export function parseTopologyUrlState(
  searchParams: URLSearchParams,
): ParsedTopologyUrlState {
  const q = nonEmptyOrUndefined(searchParams.get("q"));
  const direction = parseDirection(searchParams.get("direction"));
  const depth = parseIntegerInRange(
    searchParams.get("depth"),
    MINIMUM_TRAVERSAL_DEPTH,
    MAXIMUM_TRAVERSAL_DEPTH,
  );
  const minConfidence = parseDecimalInRange(
    searchParams.get("minConfidence"),
    0,
    1,
  );
  const view = parseView(searchParams.get("view"));
  const selected = nonEmptyOrUndefined(searchParams.get("selected"));
  const pin = parsePin(searchParams);

  const state: TopologyUrlState = {
    ...(q !== undefined ? { q } : {}),
    ...(direction.value !== undefined ? { direction: direction.value } : {}),
    ...(depth.value !== undefined ? { depth: depth.value } : {}),
    ...(minConfidence.value !== undefined
      ? { minConfidence: minConfidence.value }
      : {}),
    ...(view.value !== undefined ? { view: view.value } : {}),
    ...(selected !== undefined ? { selected } : {}),
    ...(pin.value !== undefined ? { pin: pin.value } : {}),
  };

  const wasCanonicalized =
    hasNonCanonicalParameterShape(searchParams) ||
    direction.invalid ||
    depth.invalid ||
    minConfidence.invalid ||
    view.invalid ||
    pin.invalid;

  return { state, wasCanonicalized };
}

/**
 * Deterministic serialization in one fixed field order (docs/m2-plan.md
 * § 5's canonical order), so a copied URL and a freshly-built one for the
 * same state are byte-identical — the reproducibility a copied link needs.
 */
export function serializeTopologyUrlState(
  state: TopologyUrlState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q !== undefined) {
    params.set("q", state.q);
  }
  if (state.direction !== undefined) {
    params.set("direction", state.direction);
  }
  if (state.depth !== undefined) {
    params.set("depth", String(state.depth));
  }
  if (state.minConfidence !== undefined) {
    params.set("minConfidence", String(state.minConfidence));
  }
  if (state.view !== undefined) {
    params.set("view", state.view);
  }
  if (state.selected !== undefined) {
    params.set("selected", state.selected);
  }
  if (state.pin !== undefined) {
    params.set("asOf", state.pin.asOf);
    params.set("horizon", String(state.pin.horizon));
    params.set("derivationVersion", state.pin.derivationVersion);
  }
  return params;
}
