/**
 * The M6-B minimum glanceable dataset-source distinction (accepted
 * `docs/m6-plan.md § 9`; ADR-0040 § 1). Purely presentational — its parent
 * (`TopologyShell`) owns the single `/health` fetch this badge and the
 * pilot-feedback panel's environment reference both need, so the two never
 * issue two independent, redundant requests for the same fact.
 */
import type { ReactElement } from "react";

export type DatasetModeBadgeState =
  | { readonly status: "loading" }
  | { readonly status: "unknown" }
  | { readonly status: "known"; readonly datasetMode: "fixture" | "connector" };

const DATASET_MODE_LABEL: Record<"fixture" | "connector", string> = {
  fixture: "Synthetic fixture data",
  connector: "Real Kubernetes data (connector)",
};

export function DatasetModeBadge({
  state,
}: {
  readonly state: DatasetModeBadgeState;
}): ReactElement {
  if (state.status === "loading") {
    return (
      <p className="topology-dataset-badge" role="status" aria-live="polite">
        Checking dataset source…
      </p>
    );
  }
  if (state.status === "unknown") {
    // Fails visibly, never silently, per GUARDRAILS.md § 1.2 — but as
    // `role="status"`, not `role="alert"`: this badge failing to load is
    // informational (the dataset source is merely unconfirmed), never as
    // urgent as a failed data query, and must never compete with this
    // page's own, more important, `role="alert"` failure for assistive
    // technology or test-selector attention.
    return (
      <p
        className="topology-dataset-badge topology-dataset-badge-unknown"
        role="status"
      >
        Dataset source unknown — /health could not be confirmed.
      </p>
    );
  }

  const { datasetMode } = state;
  return (
    <p
      className={`topology-dataset-badge topology-dataset-badge-${datasetMode}`}
      data-dataset-mode={datasetMode}
    >
      {DATASET_MODE_LABEL[datasetMode]}
    </p>
  );
}
