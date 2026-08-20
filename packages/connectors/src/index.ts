/**
 * Package boundary for `@atlast/connectors`, established during M0 as an
 * empty shell. The M5-A Kubernetes discovery connector (ADR-0036/0037) is
 * this package's first real content — one read-only, Pod-only, polling
 * adapter, re-exported here from its dedicated `kubernetes/` module.
 */
export * from "./kubernetes/index.ts";
