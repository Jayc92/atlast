# ADR-0036: M5 Kubernetes Client Library and Connector Module Boundary

**Status:** Accepted
**Date:** 2026-08-20

> **Approval note (2026-08-20):** ADR-0036 was independently reviewed alongside [docs/m5-plan.md](../m5-plan.md) and [ADR-0037](0037-m5-read-only-credential-and-rbac-design.md); the review's required changes (§ 2's cross-reference to ADR-0037's now CI-enforced import-restriction mechanism, and this ADR's Consequences correspondingly aligned to the same strengthened mechanism) were applied. With the M5-P baseline's separate authentication-policy governance decision also resolved ([docs/m5-plan.md § 12](../m5-plan.md#12-authentication-scope--unresolved-governance-decision); [GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security), amended via [PR #87](https://github.com/Jayc92/atlast/pull/87)), **this ADR was explicitly accepted by Joseph Carfagno on 2026-08-20 as part of the complete M5-P baseline.** **Acceptance authorizes the M5-A implementation gate to be considered — it does not itself authorize M5-A implementation.** M5-A still requires its own separate, explicit implementation authorization, effective only after this acceptance record merges to `main` and local `main` is synchronized cleanly.

## Context

Joseph Carfagno explicitly authorized M5 at the milestone level on 2026-08-20, within the exact scope [docs/milestones.md M5](../milestones.md#m5--read-only-local-kubernetes-connector-gated) and [docs/m5-plan.md](../m5-plan.md) state: one read-only discovery adapter, one disposable local Kind cluster, one namespace, Pods only for the first slice, emitting Evidence in the existing normalized format the synthetic fixtures already use. `packages/connectors` has been an empty `export {}` M0/M1-era shell since M0, explicitly reserved for exactly this milestone (`packages/connectors/src/index.ts`: "The discovery connector implementation... arrives in M5, once that milestone is explicitly authorized"). This ADR gives that package its first real content.

[GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards) states plainly: "Dependencies are liabilities. Each new dependency requires justification in the PR; prefer well-maintained, security-supported libraries; prefer none." This is the first new runtime dependency proposed since [ADR-0005](0005-shared-validation-and-typing.md) (`zod`, M1) and the first that touches a real, external system rather than only in-process logic.

## Problem

Choose a Kubernetes client library for Node.js/TypeScript that supports read-only `list`/`watch` operations against a Pod resource, is well-maintained and typed, and design the `packages/connectors` module boundary so that only a narrow, read-only surface is ever exposed to the rest of the codebase — mirroring the existing narrow-interface discipline `EvidenceStore` and `packages/impact-model`/`packages/overlay-model` already establish.

## Decision

### 1. Client library: `@kubernetes/client-node`

Use the official Kubernetes JavaScript client (`@kubernetes/client-node`, published under the `kubernetes-client` GitHub organization), pinned to an exact version with no semver range, consistent with every other dependency in this repository (ADR-0001's frozen-lockfile discipline; `zod`'s exact pin under ADR-0005). It is TypeScript-native, tracks the Kubernetes API directly, and is the most widely used client in its ecosystem — the "boring option" [GUARDRAILS.md § 1.3](../../GUARDRAILS.md#13-change-discipline) directs this project to prefer.

### 2. Module boundary: `packages/connectors/src/kubernetes/`

The Kubernetes connector lives entirely under `packages/connectors/src/kubernetes/` and depends only on `@atlast/shared` (for the `Evidence`/`evidenceCollectionSchema` contract) and `@kubernetes/client-node` — no dependency on `@atlast/graph-model`, `@atlast/overlay-model`, `@atlast/impact-model`, or any `apps/api` internal, exactly mirroring the dependency boundary [ADR-0029 § 5](0029-m3-overlay-model-and-temporal-semantics.md) established for `packages/overlay-model` and [ADR-0032 § 6](0032-m4-change-impact-domain-model.md) restated for `packages/impact-model`.

Three colocated modules, each with one job:

- **`client.ts`** — the only file that imports `@kubernetes/client-node` directly. It exposes exactly one function for the first slice, `listPods(namespace): Promise<readonly V1Pod[]>` (naming subject to implementation review), constructed from an explicitly supplied kubeconfig context (never a default/ambient one — [ADR-0037](0037-m5-read-only-credential-and-rbac-design.md) governs credential supply). It never imports, re-exports, or calls a `create*`/`patch*`/`delete*`/`replace*`/`exec*`-named client method.
- **`evidence-mapping.ts`** — a pure function translating a listed `V1Pod` into one Entity-observation `Evidence` record in the existing normalized shape (`sourceScopedIdentity: { source: "kubernetes", sourceNativeId: <namespace>/<name> }`), reusing the unmodified `@atlast/shared` `Evidence` contract. No I/O, no clock read (the caller supplies `observedAt`/`recordedAt` via an injected `Clock`, per the existing `packages/graph-model/src/clock.ts` pattern), directly unit-testable with a stubbed `V1Pod` value and no real cluster.
- **`index.ts`** — the package's only public export surface for this connector: the narrow `listPods` function and the pure mapping function, nothing else. No raw client object, `KubeConfig`, or API-class instance is ever exported.

That `client.ts` is "the only file that imports `@kubernetes/client-node` directly" is a design statement here; [ADR-0037 § 5](0037-m5-read-only-credential-and-rbac-design.md) specifies the CI-enforced mechanism (a lint-restricted-import rule plus regression probes, mirroring the existing `apps/web` boundary) that makes this statement a checked fact rather than an unenforced convention.

### 3. Sequence-number ownership stays with the caller

`EvidenceStore.appendEvidence` requires a strictly increasing `recordedSequence` across the whole store it is called against. The `packages/connectors` Kubernetes module does not assign sequence numbers itself; that remains the responsibility of whatever polling-loop code calls `appendEvidence` in the M5 experiment entrypoint (`apps/api` or a dedicated M5 script, per [docs/m5-plan.md § 3](../m5-plan.md#3-first-slice-boundary-m5-a)), keeping this module a stateless translator rather than a second place that tracks store state.

### 4. Polling, not watch, for the first slice

`@kubernetes/client-node` supports both `list` and `watch`; this ADR authorizes only the `list`-based polling shape the approved first-slice boundary specifies. Watch-stream support is deferred to a later, separately authorized slice ([docs/m5-plan.md § 6](../m5-plan.md#6-deferred-m5-slices)) — this ADR does not need to be revisited to add it, since the same client library already supports it; only a new implementation authorization is required.

## Alternatives Considered

- **Shell out to `kubectl` via `child_process` and parse its JSON output.** Rejected: `child_process`/shell-execution capability is exactly the category every synthetic-boundary audit in this repository (§ 14/16/18/20 of [docs/audits/m0-synthetic-boundary-audit.md](../audits/m0-synthetic-boundary-audit.md)) has scanned for and found absent across four milestones. Introducing it now, even for a read-only list operation, reintroduces a capability class this project has deliberately kept clean, and is fragile to `kubectl` version and output-format drift.
- **Hand-rolled REST calls against the Kubernetes API server via plain `fetch`, avoiding a new dependency entirely.** Rejected: this would require reimplementing authentication, TLS, and API-object (de)serialization the official client already solves and maintains against Kubernetes API changes. A hand-rolled client is a larger, less-reviewed liability than one well-maintained, narrowly-used, pinned dependency — the opposite of "prefer the boring option."
- **A higher-level "operator SDK"-style framework.** Rejected: far more capability and surface than one read-only `list` operation needs, and such frameworks commonly bundle write/reconciliation abstractions this project must never import, even unused — violates "simplicity over completeness" ([PROJECT_SPEC.md Principle 7](../../PROJECT_SPEC.md#3-guiding-principles)).
- **A real `watch` stream instead of polling for the first slice.** Deferred, not rejected (§ Decision 4) — the approved first-slice boundary specifies polling; this ADR's dependency choice does not foreclose watch support later.

## Tradeoffs

- **Chosen:** an official, maintained, typed client narrows correctness risk for authentication and API serialization and matches "prefer well-maintained, security-supported libraries" ([GUARDRAILS.md § 1.3](../../GUARDRAILS.md#13-change-discipline)).
- **Given up:** a slightly heavier dependency footprint than a hand-rolled `fetch` call, and reliance on an external project's maintenance cadence for tracking Kubernetes API version changes.

## Consequences

- `packages/connectors` gains its first real runtime dependency and its first real runtime behavior since M0 — the dependency surface every synthetic-boundary audit checks ([docs/audits/m0-synthetic-boundary-audit.md § 7](../audits/m0-synthetic-boundary-audit.md)'s method) must be re-run once this lands, naming exactly this one addition.
- The narrow `index.ts` re-export surface, together with the CI-enforced import restriction confining `@kubernetes/client-node` to `client.ts` alone ([ADR-0037 § 5](0037-m5-read-only-credential-and-rbac-design.md)), becomes an enforceable, testable no-side-door boundary for this connector — checkable the same way `apps/web/src/eslint-boundary.test.ts` checks the browser boundary today, and not merely by inspecting one module's export list.
- `pnpm-lock.yaml` gains a new top-level dependency entry; no existing package's dependency set changes.

## Risks

- Client-library major-version churn tracking Kubernetes API changes. Mitigation: exact version pin, deliberate upgrade PRs, exactly as this project already handles every other dependency (ADR-0001).
- A client-library defect or misconfiguration could theoretically expose more than list/watch capability at the TypeScript API surface even while RBAC still blocks it server-side. Mitigation: [ADR-0037](0037-m5-read-only-credential-and-rbac-design.md)'s structural and live-rejection proofs are a second, independent layer — this ADR's narrow module exports are not treated as a sufficient safeguard on their own.

## Why This Fits Atlast

- **E2 — Pluggable discovery** ([PROJECT_SPEC.md § 2.2](../../PROJECT_SPEC.md#22-engineering-goals)): this is the first adapter behind the discovery contract the product spec names; the module boundary is designed so a future, separately authorized second adapter would conform to the same contract rather than requiring core changes.
- **Boring core, isolated intelligence** ([docs/architecture.md § 1.5](../architecture.md#15-boring-core-isolated-intelligence)): an official, typed, widely-supported library is chosen over a bespoke implementation, consistent with every other M0 technology choice.
- **Determinism is injected** ([GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards)): the Evidence-mapping function remains pure and takes its `Clock` by injection, exactly like every other transformation in this codebase.

## Conditions That Would Justify Changing This Decision

- A second discovery adapter (post-M5, unscheduled) reveals this module boundary does not generalize to a different real-system protocol.
- `@kubernetes/client-node` is deprecated, becomes unmaintained, or develops an unresolved security issue.
- Measured behavior shows the client's `list`/`watch` implementation is unreliable at real Kind-cluster scale in a way profiling attributes to the library itself.
- A later, separately authorized slice upgrading from polling to a real `watch` stream requires a client capability this ADR did not anticipate.

This Accepted ADR does not itself authorize implementation. The first M5 implementation slice (M5-A) requires its own separate, explicit human authorization, effective only after this ADR's and [ADR-0037](0037-m5-read-only-credential-and-rbac-design.md)'s acceptance record merges to `main` with local `main` synchronized cleanly.
