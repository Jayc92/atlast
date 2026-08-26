/**
 * The Kubernetes connector's Service data shape (M6-B, ADR-0039 § 1, 3).
 * `selector` is `null` for a genuinely selectorless Service (case E, e.g.
 * `ExternalName`) — a real, valid Kubernetes state distinct from a
 * selector that happens to match nothing (case A). A Service's selector is
 * an exact-match AND of key=value pairs (ADR-0039 § 3) — never fuzzy or
 * regex matching.
 */
export interface ObservedService {
  readonly namespace: string;
  readonly name: string;
  readonly selector: Readonly<Record<string, string>> | null;
}
