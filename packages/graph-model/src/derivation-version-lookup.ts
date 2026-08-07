/**
 * S6-internal derivation-version lookup (accepted ADR-0023 § 3): exactly one
 * derivation policy exists in M1 — `M1_V1_DERIVATION_POLICY` — mapped from
 * its `derivationVersion` token. `latest`-mode reads always resolve to
 * `"m1-v1"`; a pinned read or `getSnapshotSummary` call naming any other
 * token (including the `m1-v2` fixture seed) rejects loudly. S6 must not
 * implement `m1-v2`.
 */
import {
  M1_V1_DERIVATION_POLICY,
  type M1V1DerivationPolicy,
} from "./derivation-policy.ts";
import { InvalidReadCoordinateError } from "./repository-errors.ts";

/** The only active M1 derivation policy token. */
export const ACTIVE_DERIVATION_VERSION = "m1-v1" as const;

/**
 * A `Map` keyed by token, never a plain object: a plain-object string-key
 * lookup resolves inherited `Object.prototype` members (`"constructor"`,
 * `"toString"`, `"__proto__"`, …) instead of rejecting them, which would
 * silently serve or mis-handle those valid-looking-but-unsupported tokens.
 * `Map` has no prototype chain over its keys, so lookup is exact by
 * construction.
 */
const DERIVATION_POLICY_LOOKUP: ReadonlyMap<string, M1V1DerivationPolicy> =
  new Map([[ACTIVE_DERIVATION_VERSION, M1_V1_DERIVATION_POLICY]]);

/**
 * Resolve a `derivationVersion` token to its policy, rejecting any token
 * other than `"m1-v1"` with `InvalidReadCoordinateError` carrying the
 * `UNSUPPORTED_DERIVATION_VERSION` reason — never silently substituting the
 * active policy, never returning an empty or default snapshot.
 */
export function resolveDerivationPolicy(
  derivationVersion: string,
): M1V1DerivationPolicy {
  const policy = DERIVATION_POLICY_LOOKUP.get(derivationVersion);
  if (policy === undefined) {
    throw new InvalidReadCoordinateError({
      reason: "UNSUPPORTED_DERIVATION_VERSION",
      unsupportedDerivationVersion: derivationVersion,
    });
  }
  return policy;
}
