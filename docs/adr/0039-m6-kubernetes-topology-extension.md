# ADR-0039: M6 Kubernetes Topology Extension (Deployments, ReplicaSets, Services)

**Status:** Proposed
**Date:** 2026-08-24 (revised 2026-08-24 after independent adversarial review — see revision note)

> **Drafting note:** This ADR is drafted under Joseph Carfagno's 2026-08-24 authorization of M6 planning and ADR drafting only ([docs/m6-plan.md](../m6-plan.md)). It authorizes no implementation. It requires independent review and explicit human acceptance before any M6 slice referencing it can be released.

> **Revision note (adversarial review pass):** the first draft correctly identified ownerReference determinism and Service-selector cardinality but was incomplete on three points a rigorous review found: (1) it did not state that one Deployment legitimately owns multiple ReplicaSets simultaneously during a rolling update, which is normal multiplicity, not ambiguity; (2) it did not require ownership-edge matching to use Kubernetes UID rather than name, leaving a real delete/recreate false-continuity risk unaddressed; (3) it collapsed Service→Pod semantics into a single "zero, one, or many" bucket without distinguishing a **known** zero-match result from **missing evidence** from **no selector at all** from **EndpointSlice-backed** Services — four genuinely different states this milestone's own "prefer UNKNOWN over invented topology" principle requires to be told apart. All three are corrected below (§§ 2, 5, 3 respectively).

## Context

M5-A's connector (accepted [ADR-0036](0036-m5-kubernetes-client-and-connector-boundary.md)) observes exactly one Kubernetes resource kind — Pods, via `coreApi.listNamespacedPod` — and its Evidence-mapping translator (`packages/connectors/src/kubernetes/evidence-mapping.ts`) captures only `metadata.namespace` and `metadata.name`; `ownerReferences`, `metadata.labels`, and `spec` are read from the raw `V1Pod` object but discarded at the connector's own client boundary (`client.ts`'s `.map()` projects only `{namespace, name}` into `ObservedPod`). A single Pod entity with no relationships makes the [docs/m6-plan.md](../m6-plan.md) employee journey's impact-analysis steps trivially uninteresting — there is nothing to traverse. This ADR authorizes the minimum additional Kubernetes-native topology needed to make that journey meaningful, without inventing any relationship Kubernetes itself does not establish.

## Problem

Choose the smallest additional Kubernetes resource/relationship coverage that produces a topology another engineer could meaningfully judge, using only Kubernetes-native facts, with an explicit, honest representation for every case those facts cannot resolve unambiguously.

## Decision

### 1. Additional resource kinds observed

The connector additionally lists, read-only, in the same one configured namespace:

- **Deployments** (`appsApi.listNamespacedDeployment`)
- **ReplicaSets** (`appsApi.listNamespacedReplicaSet`)
- **Services** (`coreApi.listNamespacedService`)

Each becomes its own Entity-observation Evidence record, in the same normalized shape M5-A's Pod observation already uses (`sourceScopedIdentity.source: "kubernetes"`, an `entityType` per resource kind — e.g. `kubernetes-deployment`, `kubernetes-replicaset`, `kubernetes-service`, alongside the existing `kubernetes-pod`).

### 2. Ownership relationship: Deployment → ReplicaSet → Pod, via `ownerReferences`

Kubernetes guarantees **at most one** `controller: true` entry in any object's `ownerReferences` array — this is an API-level invariant, not an Atlast assumption. The connector's Evidence-mapping layer is extended to capture each object's controller owner reference (kind, name, **UID** — see § 5) as part of its observation, and the existing `m1-v1` reconciliation/relationship-derivation path (unmodified) establishes the resulting `Relationship` claim from that Evidence exactly as it already does for every other relationship in this codebase (ADR-0022).

- **Deterministic and unambiguous per child object**, by Kubernetes' own contract: a Pod has zero or one controller owner reference; a ReplicaSet has zero or one.
- **Multiplicity is normal, not ambiguity:** one Deployment MAY legitimately own multiple ReplicaSets simultaneously — this is the expected shape during a rolling update (the old ReplicaSet scaling to zero while the new one scales up), not a conflict. Atlast MUST represent every ReplicaSet a Deployment currently owns, including a ReplicaSet scaled to zero Pods; it MUST NOT assume, collapse to, or otherwise privilege exactly one ReplicaSet per Deployment.
- **Ownerless Pod or ReplicaSet (zero controller owner references):** a real, valid Kubernetes state (a bare Pod, or a ReplicaSet a user created directly). Atlast MUST represent this as an honest unknown/no-parent — it MUST NOT infer or invent a Deployment/ReplicaSet relationship in this case.
- ReplicaSet is retained in the underlying model as the real intermediate owner — this is what makes the ownership chain truthful, since a Pod's real controller is a ReplicaSet, never a Deployment directly. Whether the UI visually collapses the ReplicaSet hop is a presentation decision, out of this ADR's scope (see [docs/m6-plan.md § 4](../m6-plan.md#4-kubernetes-topology-scope)).

### 3. Selection relationship: Service → Pod, via label-selector matching

A Kubernetes `Service`'s `spec.selector` is an exact-match label query (an AND of key=value pairs, never fuzzy or regex matching) — the match test itself is deterministic. **Cardinality is not constrained to one-to-one.** This ADR requires the following six states to be represented distinctly — collapsing any of them into another is a defect, not a simplification:

| Case                                          | Kubernetes fact                                                                                                                                                                                                                    | Atlast representation                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Known zero matches**                     | The Service has a `spec.selector`; the connector has observed both the Service and the complete Pod set in the namespace this poll cycle; no Pod's labels satisfy the selector.                                                    | A **positive, computed fact**: this Service currently selects zero Pods. Represented by the Service entity existing with no `Service → Pod` relationship, which is a truthful zero — not silence, and not the same classification as case D.                                                                                                                                                    |
| **B. One match**                              | Selector matches exactly one Pod's labels.                                                                                                                                                                                         | One `Service → Pod` relationship.                                                                                                                                                                                                                                                                                                                                                               |
| **C. Multiple matches**                       | Selector matches more than one Pod's labels (normal — e.g. a multi-replica Deployment's Pods).                                                                                                                                     | One `Service → Pod` relationship per matching Pod — all equally valid; Atlast MUST NOT pick one and discard the rest.                                                                                                                                                                                                                                                                           |
| **D. Evidence insufficient to evaluate**      | The Service's selector was observed, but the corresponding Pod-set observation needed to evaluate it is missing or from an inconsistent poll cycle (e.g. a partial poll failure captured Services but not Pods in the same cycle). | **Genuinely UNKNOWN** — distinct from case A. Atlast MUST NOT default an evaluation failure to "zero matches"; it must be representable as "not yet evaluable," not "evaluated and found none."                                                                                                                                                                                                 |
| **E. No selector at all**                     | The Service has no `spec.selector` (e.g. an `ExternalName` Service, or a Service intentionally backed by manually managed Endpoints).                                                                                              | **Not selector-backed** — an explicit third state, distinct from both A and D: there is no selector to search with, so no Service→Pod relationship of this kind is even applicable. Atlast MUST NOT represent this as "zero matches" (which implies a search that found nothing) or as "unknown" (which implies a search that could not run) — it is neither; the search itself does not apply. |
| **F. EndpointSlice/manually-managed backing** | A Service's real traffic backing is established by EndpointSlice or manually maintained `Endpoints` objects rather than (or in addition to) selector matching.                                                                     | **Explicitly out of scope for M6.** This milestone observes only selector-derived `Service → Pod` relationships (§ Non-Goals). Atlast MUST NOT claim to know a Service's real backing when that backing is only knowable via EndpointSlice/manual Endpoints — this must read as an honest scope limitation, never as "this Service has no backing."                                             |

Case D's exact triggering mechanics (precisely when a poll cycle's per-resource-kind consistency window makes evaluation genuinely unsafe) is an open implementation-review question this ADR does not fully resolve — implementation review must define it explicitly rather than assuming the previous cycle's Pod set is always "current enough" to evaluate a newly observed Service against.

**M6 Non-Goal, stated explicitly:** this milestone does not add EndpointSlice or manual-`Endpoints` observation (case F). A future, separately authorized slice would be required to close that gap; this ADR does not propose or schedule it.

### 4. RBAC additions

Per [ADR-0037 § 2](0037-m5-read-only-credential-and-rbac-design.md)'s own "Conditions That Would Justify Changing This Decision," adding a resource kind "requires an additive `Role` update naming the new resource, not a redesign of this ADR's mechanism." This ADR proposes exactly that: the existing namespace-scoped `Role` gains

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch"]
```

No wildcard verb or resource, no `ClusterRole`, no write verb — identical least-privilege discipline to ADR-0037's original grant, additive only.

### 5. Kubernetes UID, ownership matching, and a disclosed identity-continuity limitation

Kubernetes objects can be deleted and recreated with the same namespace/name — the name is not a permanent identity; the object's `metadata.uid` is. This has two distinct consequences this ADR must address honestly rather than silently:

- **Ownership-edge matching MUST use UID, never name.** When deriving a `Deployment → ReplicaSet` or `ReplicaSet → Pod` relationship from an `ownerReferences` entry, the connector's Evidence-mapping layer captures the owner reference's `uid` (already named in § 2 above) and reconciliation MUST match the child's owner reference against the parent's own observed UID, not against a name-based lookup. Matching by name alone could silently attach a child to the wrong parent if an old, same-named parent object was deleted and a new, unrelated one created with the same name — a real, not hypothetical, Kubernetes behavior.
- **Atlast's human-facing entity identity remains namespace/name-based, unchanged from the accepted `m1-v1` policy — this ADR does not propose changing it.** This creates a genuine, disclosed, currently-unresolved limitation, directly analogous to M5-A's own disclosed hyphen-join collision risk (`docs/audits/m0-synthetic-boundary-audit.md § 21.7`): if a real Kubernetes object is deleted and a different object is created with the same namespace/name, Atlast's identity-normalization policy will treat the new object's Evidence as continuing corroboration of the _same_ entity, even though the underlying real object (and its UID) has changed. Kubernetes UID is captured in Evidence purely for ownership-matching correctness (the bullet above) and provenance completeness — it does **not** become part of the accepted human-facing identity key, and this ADR does not authorize that change. This limitation is recorded here explicitly so it is weighed deliberately during the pilot, not discovered by accident — exactly the same disclosure standard M5-A's own identity finding already set.

## Contractual Invariants This Extension Must Preserve

- Every new Entity/Relationship claim remains content-addressed, provenance-carrying, and confidence/freshness-classified exactly as every existing M1–M5 fact already is (ADR-0014/0022) — no new fact category is exempt from the existing contract.
- The existing `m1-v1` reconciliation policy (`packages/graph-model/src/reconciliation.ts`) is **not modified** by this ADR — new relationships are derived from new Evidence through the existing, unmodified pipeline, exactly as M5-A's Pod entities already were. If a genuinely new relationship-derivation rule proves necessary during implementation, that is a new finding requiring its own review, not something this ADR pre-authorizes.
- Prefer UNKNOWN over invented topology (§§ 2, 3 above) is binding, not aspirational — implementation review must verify the ownerless-Pod/ReplicaSet case and all six Service-relationship cases in § 3 are tested explicitly and distinctly, not merely assumed to degrade gracefully into one bucket.
- The accepted `m1-v1` identity-normalization policy (ADR-0022 § 2) is **not modified** by this ADR — § 5's UID capture is for ownership-matching and provenance only.

## Alternatives Considered

- **Deployment → Pod, direct edge, skipping ReplicaSet.** Rejected: not a real Kubernetes fact — a Deployment does not own Pods directly, and asserting it would be invented topology, exactly what [docs/m6-plan.md § 4](../m6-plan.md#4-kubernetes-topology-scope) forbids. The ReplicaSet hop may be visually collapsed later; it cannot be modeled away.
- **Assume exactly one ReplicaSet per Deployment.** Rejected on adversarial review: rolling updates routinely produce two (or briefly more) simultaneously owned ReplicaSets; forcing 1:1 would either drop a real, currently-relevant ReplicaSet or misattribute Pods.
- **Assume exactly one Service per Pod (pick the "best" match).** Rejected: no Kubernetes-native rule defines "best," and forcing 1:1 cardinality where none exists is exactly the kind of confident-but-wrong representation [PROJECT_SPEC.md Principle 8](../../PROJECT_SPEC.md#3-guiding-principles) forbids.
- **Collapse known-zero-matches, insufficient-evidence, no-selector, and EndpointSlice-backed into one "UNKNOWN" bucket.** Rejected on adversarial review: these are four different real states with different implications for the pilot tester's judgment (a Service correctly known to select nothing is a success story for Atlast's honesty, not a gap); conflating them would itself be a confidently-wrong-shaped simplification.
- **Match ownership edges by name instead of UID.** Rejected on adversarial review: a real, not merely theoretical, false-continuity risk across delete/recreate cycles that a UID match closes at negligible cost, since the owner reference already carries the UID.
- **Add every remaining Kubernetes resource kind now (ConfigMaps, Secrets, Ingresses, EndpointSlice, etc.) for a richer pilot.** Rejected: [docs/m6-plan.md § 15](../m6-plan.md#15-explicit-non-goals) scopes this milestone to the minimum topology needed for a meaningful pilot; broader coverage, including EndpointSlice (§ 3 case F), is deferred, unscheduled, out-of-scope work.
- **A real Kubernetes `watch` stream instead of polling, to reduce staleness for the richer topology.** Rejected for this ADR: [ADR-0036 § 4](0036-m5-kubernetes-client-and-connector-boundary.md) already defers watch-stream support to its own separately authorized slice; this ADR does not need to, and does not, revisit that decision.

## Tradeoffs

- **Chosen:** the smallest additional resource/relationship set that makes the pilot journey meaningful, using only deterministic Kubernetes-native facts, with six explicitly distinguished states for Service relationships and UID-based ownership matching — at the cost of retaining a ReplicaSet hop some future UI work may need to collapse for readability, and a disclosed, unresolved identity-continuity limitation.
- **Given up:** a visually simpler (but factually invented) direct Deployment→Pod/Deployment→Service edge set, and a simpler (but dishonestly collapsed) single-bucket Service-relationship model.

## Consequences

- `packages/connectors/src/kubernetes/client.ts` gains three new read-only list calls; `evidence-mapping.ts` gains three new observation-to-Evidence translators plus extraction of `ownerReferences` (including UID), `metadata.labels`, and `spec.selector` fields it currently discards.
- `packages/connectors/src/kubernetes/observed-pod.ts`-equivalent shapes are needed for the three new resource kinds (naming TBD at implementation), each carrying enough of the raw object (UID, owner references, labels/selector) to support §§ 2, 3, 5.
- No change to `packages/graph-model`'s reconciliation engine, its accepted `m1-v1` policy, or any existing contract — new topology flows through the existing, unmodified pipeline.
- ADR-0037's `Role` gains the additive grant in § 4 above; no other credential/target-guard mechanism changes.
- The identity-continuity limitation (§ 5) becomes a documented, standing pilot-evidence disclosure item, exactly as M5-A's hyphen-join finding already is.

## Risks

- **Silent 1:1 assumption creep during implementation.** The Service-selector cardinality property (§ 3) is easy to get wrong by habit. Mitigation: implementation review must include explicit test cases for all six § 3 states, not merely a single-match happy path.
- **RBAC over-grant risk.** Mitigation: the same "diff the applied Role against the intended manifest text" discipline ADR-0037's own Risks section already established must be re-run for this additive grant.
- **UID-matching implementation drift.** A future contributor could "simplify" ownership matching back to name-based lookup without realizing why UID matters. Mitigation: § 5's requirement and rationale must be preserved as an explicit code comment at the implementation site, mirroring how this codebase already documents non-obvious invariants elsewhere.

## Why This Fits Atlast

- **PROJECT_SPEC.md Principle 1** ("observed truth over declared truth") and **Principle 8** ("fail honest") are both directly implemented by §§ 2, 3, and 5's ownerless-object, six-state Service-relationship, and disclosed-identity-limitation handling.
- **E1 — Evidence-first data model** ([PROJECT_SPEC.md § 2.2](../../PROJECT_SPEC.md#22-engineering-goals)): every new fact carries the same provenance/confidence/freshness triple every existing fact does.
- **Boring core, isolated intelligence**: reuses the existing, unmodified reconciliation pipeline and Evidence contract rather than introducing new derivation machinery for this milestone.

## Conditions That Would Justify Changing This Decision

- A future, separately authorized slice needs a Kubernetes resource kind beyond Deployments/ReplicaSets/Services/Pods, or EndpointSlice/manual-Endpoints coverage (§ 3 case F) — requires its own ADR amendment naming the new resource, not a redesign of this one.
- Implementation review finds the `ownerReferences`/selector-matching approach, or the UID-matching requirement, cannot be expressed cleanly within the existing `m1-v1` reconciliation contract without a semantic change — in which case the relationship-derivation approach, not the topology scope, is the next question to resolve.
- A later milestone genuinely requires Deployment/Service coverage across multiple namespaces or clusters — out of this ADR's one-namespace, one-cluster scope, and [docs/m6-plan.md § 2](../m6-plan.md#2-real-system-safety-boundary-binding-unchanged-from-m5)'s boundary already forbids the multi-cluster case regardless.
- A future product decision decides the identity-continuity limitation (§ 5) must be resolved rather than merely disclosed — that would require its own ADR amending the accepted `m1-v1` identity policy, a materially larger decision than this milestone's scope.

This Proposed ADR does not itself authorize implementation. The first M6 implementation slice referencing it requires its own separate, explicit human authorization, effective only after this ADR's acceptance record merges to `main` with local `main` synchronized cleanly.
