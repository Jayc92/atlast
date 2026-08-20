# ADR-0037: M5 Read-Only Credential and RBAC Design (Real-System Safety Boundary)

**Status:** Accepted
**Date:** 2026-08-20

> **Approval note (2026-08-20):** ADR-0037 was independently reviewed alongside [docs/m5-plan.md](../m5-plan.md) and [ADR-0036](0036-m5-kubernetes-client-and-connector-boundary.md); the review's required changes (the CI-enforced import-restriction design in § 5, and the concrete, spoof-resistant target guard in § 4 requiring both a `kind`-prefixed context name and a loopback server URL) were applied. The separate authentication-policy governance decision this ADR's Context originally deferred to [docs/m5-plan.md § 12](../m5-plan.md#12-authentication-scope--unresolved-governance-decision) is now resolved — Joseph Carfagno approved a narrowly scoped GUARDRAILS.md amendment, merged through [PR #87](https://github.com/Jayc92/atlast/pull/87) at `9bbeec4` on 2026-08-20 ([GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security)). With both resolved, **this ADR was explicitly accepted by Joseph Carfagno on 2026-08-20 as part of the complete M5-P baseline.** **Acceptance authorizes the M5-A implementation gate to be considered — it does not itself authorize M5-A implementation.** M5-A still requires its own separate, explicit implementation authorization, effective only after this acceptance record merges to `main` and local `main` is synchronized cleanly.

## Context

M5 is the first real-system contact of any kind in this project's history. [GUARDRAILS.md § 1.1](../../GUARDRAILS.md#11-product-boundaries-are-hard-constraints) states the constraint this ADR must make real rather than aspirational: "Atlast is read-only toward observed systems, permanently. No component may hold write-capable credentials to a system it observes. This constraint applies at the design level: violations are rejected in review, not mitigated with policy." [GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security) adds: "Least privilege everywhere: each discovery adapter gets its own minimal, read-only credential scope." [docs/milestones.md M5](../milestones.md#m5--read-only-local-kubernetes-connector-gated)'s hard constraints already state the same requirement at the milestone level; this ADR is the binding mechanism, not a restatement.

The M5 readiness review ([conversation record; summarized in docs/milestones.md's verification obligations](../milestones.md#m5--read-only-local-kubernetes-connector-gated)) identified credential-scope slip as a named risk: "the read-only-credential constraint is currently a design principle with no real credential in the system to test it against; the first real kubeconfig/RBAC binding is exactly the place a 'read-only in spirit' implementation could accidentally request a broader scope... without a structural check catching it." This ADR exists to close that exact gap before any implementation begins.

**This ADR's read-only/RBAC design and the separate question of whether the M5-A query API requires authentication under [GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security)'s real-system-connected trigger were always independent gates, and neither substitutes for the other.** That authentication question — originally recorded as unresolved at [docs/m5-plan.md § 12](../m5-plan.md#12-authentication-scope--unresolved-governance-decision) — is now resolved: Joseph Carfagno approved a narrowly scoped GUARDRAILS.md amendment, merged through [PR #87](https://github.com/Jayc92/atlast/pull/87) at `9bbeec4` on 2026-08-20, and is now active, binding text in GUARDRAILS § 1.4 itself — the single source of truth for its exact conditions, not this ADR or § 12.

## Problem

Design a credential and authorization scheme for the M5 Kubernetes connector such that: (a) the adapter can never issue a write or mutating call, structurally, not merely by convention or code review; (b) the connection target can never be anything other than the one disposable local cluster created for this purpose; and (c) both properties are demonstrable with a real, reproducible test against a real cluster, not merely documented as an intention.

## Decision

### 1. A dedicated, namespace-scoped ServiceAccount

A Kubernetes `ServiceAccount` is created inside the disposable Kind cluster specifically for this connector — never the ambient/default kubeconfig context a developer's `kubectl` already uses, which on a typical development machine carries full cluster-admin access (confirmed present on the machine this plan was drafted on).

### 2. RBAC scoped to exactly the required verbs and resource

A namespace-scoped `Role` (never a `ClusterRole`) grants exactly:

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
```

bound to the ServiceAccount via a `RoleBinding` in the one namespace the first slice targets. No wildcard verb, no wildcard resource, and no additional resource kind (Deployments, Services, Secrets, or anything else) is granted in this slice. `watch` is included even though the first slice uses polling (ADR-0036 § 4), so that a later, separately authorized upgrade to a real watch stream requires no RBAC change — only a new implementation authorization.

### 3. Explicit, injected credential — never ambient resolution

The connector's Kubernetes client is constructed from an explicitly supplied kubeconfig context (e.g., a context name or a mounted ServiceAccount token path passed as configuration) — never the client library's default current-context resolution, which would silently pick up whatever context `kubectl` is currently pointed at. This mirrors the loopback-only, no-implicit-default discipline [ADR-0004](0004-backend-api-framework.md) already established for the API server's inbound bind address, applied here to the connector's outbound connection instead.

### 4. Cluster-target restriction, checked and not merely assumed

**A naive loopback-hostname check alone is not an acceptable guard**, per the M5-P independent review's finding: anyone running `kubectl proxy` or a port-forward against a real remote cluster can make that remote cluster's API server appear at `127.0.0.1`/`localhost`, which would spoof a bare loopback check while connecting to something outside the § 2 safety boundary entirely. The M5 experiment tooling must instead require **both** of the following signals to hold before connecting, and must fail loudly — not silently proceed — if either is absent, ambiguous, or inconsistent with the other:

1. **An explicitly selected kubeconfig context whose name carries Kind's own conventional `kind-` prefix** (the name Kind's own tooling assigns to every cluster it creates, e.g. `kind-<cluster-name>`) — the connector must read this context name explicitly and must not fall back to whatever context is merely "current" in an ambient kubeconfig.
2. **The resolved API server URL for that same context is loopback** (`127.0.0.1`/`localhost`, on any port).

If the context name does not carry the `kind-` prefix, or the resolved server URL is not loopback, or the two signals disagree in any way the guard cannot fully reconcile, the connector must refuse to connect and must fail with an explicit, loud error — never a silent fallback and never a partial connection. **Explicitly: a port-forwarded or proxied connection to a remote cluster that merely presents a loopback address, without also matching a real Kind-assigned context name, must not pass this guard.** Both signals are required specifically because either one alone is spoofable or coincidental — the `kind-` prefix alone doesn't prove the endpoint is actually loopback, and a loopback endpoint alone doesn't prove the context is actually Kind-managed.

### 5. Structural read-only proof (code-level, CI-enforced)

Checking only `packages/connectors/src/kubernetes/index.ts`'s exported surface is not a strong enough proof on its own, per the M5-P independent review's finding: nothing would stop a different file elsewhere under `packages/connectors/src` from importing `@kubernetes/client-node` directly and calling a mutating method, bypassing `client.ts` and `index.ts` entirely. This ADR therefore commits to the same class of mechanism this project already uses for its other real boundaries (the `apps/web` browser import boundary, ADR-0026 § 5, extended repeatedly through M2/M3/M4-E) — a lint-enforced, CI-checked import restriction, not merely one module's export shape:

- `@kubernetes/client-node` may be imported **only** from `packages/connectors/src/kubernetes/client.ts`. No other file anywhere under `packages/connectors/src` — and no file outside `packages/connectors` at all — may import it, directly or via a deep relative path.
- This restriction is enforced the same way the existing `apps/web/src/**` boundary is enforced today: a `no-restricted-imports`-style rule scoped to `packages/connectors/src/**`, naming `@kubernetes/client-node` (direct and deep-path forms) as restricted everywhere except `client.ts` itself.
- Regression probes exist in the same general style as `apps/web/src/eslint-boundary.test.ts`'s existing direct-proof pattern: spawning the real ESLint CLI against a probe file outside `client.ts` that imports `@kubernetes/client-node`, asserting the rule rejects it, alongside a negative control proving `client.ts` itself is not restricted.
- `client.ts`'s own exported surface still contains no create/patch/delete/replace/exec-named export (the original, narrower proof) — this remains true and is still checked, but it is now the second of two layers, not the only one.

**This ADR does not implement the ESLint rule or its tests now.** It records the design commitment the M5-A implementation slice must deliver — mirroring exactly how ADR-0033 named the `packages/impact-model` import-boundary extension as a requirement that the later M4-E slice actually implemented, rather than implementing it inside the ADR itself.

### 6. Live rejection proof (cluster-level, required before M5-A closes)

Before the first slice can close, a documented attempt to perform one representative mutating operation — for example, deleting the same Pod the connector observed, using the ServiceAccount's own credential — must be run against the real disposable Kind cluster and shown to be rejected with an HTTP `403 Forbidden` from the Kubernetes API server's own authorization layer. This proves the cluster itself enforces the boundary; the adapter's own restraint is never the only thing standing between it and a write.

### 7. Permanent, binding target restriction

No version of this connector, at any M5 slice or any later slice, may target an employer, shared, or production Kubernetes cluster, ever. Broadening the target beyond a disposable local cluster requires a separate, explicit, human-approved [PROJECT_SPEC.md](../../PROJECT_SPEC.md) amendment — already the standing rule this ADR restates as binding on its own scope, not a new rule this ADR introduces.

## Alternatives Considered

- **Rely solely on code review and documentation discipline ("we simply will not call a write method"), without RBAC scoping.** Rejected outright: [GUARDRAILS.md § 1.1](../../GUARDRAILS.md#11-product-boundaries-are-hard-constraints) explicitly requires this class of constraint "at the design level," not as policy; a documented-only intention is exactly what that section calls insufficient.
- **Reuse the cluster's default admin kubeconfig context and simply avoid calling a mutating client method in code.** Rejected: violates least privilege ([GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security)) even if the code path never calls a mutating method, because the credential itself would remain write-capable — a future contributor, a dependency defect, or a copy-pasted code change could then perform a real mutation the RBAC layer would otherwise have blocked outright, independent of what this project's own code does.
- **A `ClusterRole` scoped to all namespaces instead of one namespace-scoped `Role`.** Rejected: wider than the approved first-slice scope (one namespace) requires. Least privilege prefers the narrower binding whenever the broader one is not needed.
- **Omitting `watch` from the granted verbs since the first slice only polls.** Rejected: this would require a later RBAC change purely to add a capability the client library already supports and this ADR already anticipates; including it now costs nothing (it grants no broader read scope than `get`/`list` already imply in practice) and avoids unnecessary RBAC churn later.

## Tradeoffs

- **Chosen:** real, structurally-enforced least privilege, at the cost of a small amount of one-time cluster setup (creating the ServiceAccount/Role/RoleBinding) as a documented prerequisite before any adapter code runs against a real cluster.
- **Given up:** the convenience of reusing an already-authenticated default kubeconfig context, which would have required zero cluster-side setup but would have left the credential itself write-capable.

## Consequences

- The disposable Kind cluster requires a one-time, documented setup step (ServiceAccount + Role + RoleBinding) as a prerequisite to any M5-A work, distinct from and prior to writing adapter code.
- The structural-proof test (§ 5) becomes a permanent, re-runnable regression check, exactly like the browser's no-side-door probes.
- The live-rejection proof (§ 6) becomes required acceptance evidence for M5-A's closeout, already named in [docs/milestones.md](../milestones.md#m5--read-only-local-kubernetes-connector-gated)'s verification obligations and [docs/m5-plan.md § 4.3](../m5-plan.md#43-structural-read-only-proof).

## Risks

- A misconfigured RBAC binding (for example, accidentally applied as a `ClusterRole`, or bound in the wrong namespace) could grant broader read access than intended without granting any write access — the live-rejection proof (§ 6) would not, by itself, catch a read-only-but-wider-than-intended misconfiguration, only a write-capability leak. **Mitigation, stated honestly rather than papered over:** the applied `Role`'s actual rules (via `kubectl get role -o yaml`) must be diffed against this ADR's intended manifest text as part of the acceptance evidence, not assumed correct from the source manifest alone — the same "don't just assert, verify against the real system" discipline this project's boundary audits already practice.
- A future contributor could accidentally widen the granted verbs or resources in a later slice without recognizing the least-privilege intent behind the narrow first-slice grant. **Mitigation:** § 2's `Role` YAML is the canonical, reviewed text; any change to it is a change to this ADR's own decision and requires the same review discipline as the original.

## Why This Fits Atlast

- **GUARDRAILS.md § 1.1** ("read-only toward observed systems, permanently... structural, not policy") and **§ 1.4** (least privilege, "each discovery adapter gets its own minimal, read-only credential scope") are both direct, named requirements this design implements literally, not by analogy or good intention.
- **PROJECT_SPEC.md Principle 3** ("Read-only by design... This is a permanent architectural constraint, not a phase-one limitation") is exactly the property §§ 2, 5, and 6 together make structurally true and independently verifiable, rather than merely stated.

## Conditions That Would Justify Changing This Decision

- A later, separately authorized slice adds a second object kind or namespace (§ 6 of [docs/m5-plan.md](../m5-plan.md#6-deferred-m5-slices)) — requires an additive `Role` update naming the new resource, not a redesign of this ADR's mechanism.
- Any proposal to target more than one disposable cluster, or any non-disposable cluster, requires the PROJECT_SPEC amendment already named in § 7 above — never a change to this ADR alone.
- A future Kubernetes RBAC API change deprecates the `Role`/`RoleBinding` mechanism this ADR relies on.

This Accepted ADR does not itself authorize implementation. The first M5 implementation slice (M5-A) requires its own separate, explicit human authorization, effective only after this ADR's and [ADR-0036](0036-m5-kubernetes-client-and-connector-boundary.md)'s acceptance record merges to `main` with local `main` synchronized cleanly.
