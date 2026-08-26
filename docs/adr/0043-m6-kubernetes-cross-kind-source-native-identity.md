# ADR-0043: Kubernetes Cross-Kind Source-Native Identity

**Status:** Proposed
**Date:** 2026-08-26

## Context

M6-B's pre-implementation inspection and a subsequent correctness investigation, both performed directly against the real, unmodified `packages/graph-model` identity-normalization and reconciliation engine (never inferred), proved a real, systemic defect: the Kubernetes connector's `sourceScopedIdentity.sourceNativeId` construction — `${namespace}-${name}`, unchanged since M5-A's Pods-only first slice — carries no Kubernetes resource-kind discriminator. M5-A/M6-A never exposed this, because exactly one resource kind (Pods) was ever observed; a constant that never varies causes no collision. M6-B's own act of observing four kinds (Deployments, ReplicaSets, Pods, Services — [ADR-0039](0039-m6-kubernetes-topology-extension.md)) is what exposes that `namespace-name` alone was never a complete encoding of "the source-native object" — it was only ever a complete encoding of "the source-native object, given exactly one kind."

**Proven, not inferred, using the real `normalizeIdentityKey`/`buildEntityIdentifier`/`M1_V1_DERIVATION_POLICY` and the real `reconcileEvidenceAtHorizon`/`computeImpact`:**

- A Deployment named `checkout` and a Service named `checkout-service` in the same namespace normalize to the identical Atlast Entity identifier — the accepted `m1-v1` policy's decorative-affix stripping (`suffixes: ["-svc", "-service"]`, [ADR-0022](0022-m1-reconciliation-policy-and-assertion-derivation.md) § 1) removes the `-service` suffix, and the two objects' otherwise-distinct `namespace-name` strings collapse. Reproduced for every representative pair tested (`checkout`/`checkout-service`, `checkout`/`checkout-svc`, `payments`/`payments-service`, `api`/`api-service`, `orders`/`orders-svc`) — this fires on the single most idiomatic Kubernetes Deployment+Service naming convention, not a rare edge case.
- **A second, more fundamental collision exists independent of affix stripping**: a Deployment, ReplicaSet, Pod, and Service that all happen to share the exact literal name in one namespace normalize identically too, since kind participates nowhere in the identity string.
- Running the real `reconcileEvidenceAtHorizon` on realistic Deployment+Service Evidence sharing one collided identity confirms the exact consequence: because both objects' Evidence carries the same `sourceScopedIdentity.source: "kubernetes"`, only one claim value can ever stand for that one source at a time (`standingBySource` is keyed by source name); the connector's own derivation order (Deployments/ReplicaSets/Pods before Services) makes the Service's `entityType` claim deterministically and permanently win every cycle. The result is stable, not flapping — and silently wrong: the Deployment's own Evidence is completely excluded from provenance, `conflictState` never leaves `"uncontested"`, and no signal of any kind marks the merge.
- Running the real `deriveEvidenceForCycle` (`packages/connectors`) together with the real reconciliation engine on the full topology confirms the relationship consequence: the merged entity — visibly claiming to be a `kubernetes-service` — also carries an outgoing `owns` relationship to the ReplicaSet, something no real Kubernetes Service ever does.
- Running the real `computeImpact` on that same merged topology confirms the result is schema-valid, does not error, and ranks the correct final set of entities in this specific case by coincidence — but flattens what should be a 1-hop (Service→Pod) and a 2-hop (Deployment→ReplicaSet→Pod) structure into one misleading, uniformly-1-hop picture.

An unaided employee whose real cluster contains a Deployment and Service following this common convention would see one entity, plausibly named, carrying real Evidence, silently and permanently mislabeled, with its Deployment identity and Evidence completely and silently gone — internally valid the entire time. This must be resolved before M6-B's cross-kind topology work can be considered correct.

## Problem

Decide how the Kubernetes connector's own source-native identity encoding must change so that distinct Kubernetes objects of different kinds, observed simultaneously in one namespace, can never collapse into one Atlast Entity solely because their names happen to normalize identically — without amending the frozen, Accepted `m1-v1` canonical normalization policy, without making Kubernetes UID part of Atlast's human-facing identity, and without silently relying on an asymmetric rule that special-cases one resource kind for no architectural reason.

## Decision

### 1. Kubernetes resource kind becomes part of the connector's own source-native identity

Per `packages/shared/src/evidence.ts`'s own contract, `sourceScopedIdentity.sourceNativeId` is "the identity claim exactly as the source expressed it — opaque": the accepted `m1-v1` canonical-normalization policy ([ADR-0022](0022-m1-reconciliation-policy-and-assertion-derivation.md) §§ 1–2) constrains only how that opaque string is normalized, never what semantic content the connector packs into it. The Kubernetes connector's construction of that string is therefore a **connector-local encoding decision** — exactly the same category of decision M5-A already made once, without a new ADR, when it hyphen-joined namespace and name instead of slash-joining them to satisfy the accepted identity grammar (`docs/audits/m0-synthetic-boundary-audit.md § 21.7`). This ADR makes the analogous, second connector-local encoding decision: the connector's `sourceNativeId` for every Kubernetes resource kind it observes is

```
<namespace>-<kind>-<name>
```

where `<kind>` is one of the literal, lowercase tokens `deployment`, `replicaset`, `pod`, `service` — the same vocabulary already used, minus the `kubernetes-` prefix, in each kind's `entityType` classification ([ADR-0039](0039-m6-kubernetes-topology-extension.md) § 1). **Kind is placed in the middle of the constructed string, between namespace and name, never as a leading prefix or trailing suffix.**

### 2. Why the middle position — proven, not assumed

The frozen `m1-v1` decorative-affix policy strips **at most one** entry from `prefixes: ["svc-", "service-"]` from the _start_ of the string, and **at most one** entry from `suffixes: ["-svc", "-service"]` from the _end_ — never from the interior. Placing kind as a **leading** token was tested directly against the real normalizer and found broken specifically for the `service` kind: `service-atlast-m6-a-checkout-service` normalizes to `atlast-m6-a-checkout` — the connector's own `service-` kind token is itself one of the two literal decorative prefixes the policy already strips, silently erasing the disambiguation this ADR exists to add. Placing kind as a **trailing** token has the identical failure mode via the suffix list. Placing kind **in the middle** — `<namespace>-<kind>-<name>` — is structurally immune: `stripDecorativeAffixesSinglePass` only ever inspects the whole string's own start and end, and a Kubernetes namespace or object name essentially never begins with `service-`/`svc-` or ends with `-service`/`-svc` as its _own_ leading/trailing token (that residual, narrower risk is unchanged from, and no worse than, the M5 § 21.7 disclosed namespace/name boundary-ambiguity finding this ADR does not attempt to resolve).

**Proven directly against the real `normalizeIdentityKey`, all required pairs, no exceptions found:**

| Pair                                                                                | Encoded                                | Normalized key                                     | Distinct?                                                     |
| ----------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Deployment `checkout`                                                               | `atlast-m6-a-deployment-checkout`      | `atlast-m6-a-deployment-checkout`                  | —                                                             |
| Service `checkout`                                                                  | `atlast-m6-a-service-checkout`         | `atlast-m6-a-service-checkout`                     | ✅ distinct from Deployment                                   |
| Service `checkout-service`                                                          | `atlast-m6-a-service-checkout-service` | `atlast-m6-a-service-checkout`                     | ✅ distinct from Deployment; same as Service `checkout` (§ 3) |
| Service `checkout-svc`                                                              | `atlast-m6-a-service-checkout-svc`     | `atlast-m6-a-service-checkout`                     | ✅ distinct from Deployment; same as Service `checkout` (§ 3) |
| Deployment `payments` / Service `payments-service`                                  | —                                      | `...-deployment-payments` / `...-service-payments` | ✅ distinct                                                   |
| Deployment `api` / Service `api-service`                                            | —                                      | `...-deployment-api` / `...-service-api`           | ✅ distinct                                                   |
| Deployment `orders` / Service `orders-svc`                                          | —                                      | `...-deployment-orders` / `...-service-orders`     | ✅ distinct                                                   |
| ReplicaSet `checkout` / Deployment `checkout` / Pod `checkout` / Service `checkout` | —                                      | four distinct keys                                 | ✅ all four distinct                                          |

An adversarial extension of this same test — objects literally _named_ `service` or `svc` (the affix words themselves) across all four kinds — also produced zero cross-kind collisions: `deployment/service`, `replicaset/service`, `pod/service`, and `service/service` all normalize distinctly. Every collision found in this extended probe was same-kind only (`deployment/svc` collapsing onto `deployment/service`; `service/svc` onto `service/service`) — exactly the § 3 residual below, never crossing a kind boundary. This holds by construction, not coincidence: `stripDecorativeAffixesSinglePass` only ever inspects the whole string's own leading and trailing characters; since a Kubernetes namespace and name are never empty, the middle-placed kind token can never be the substring stripping removes.

### 3. A deliberate, accepted residual: same-kind decorative collapsing is preserved, not eliminated

`Service/checkout`, `Service/checkout-service`, and `Service/checkout-svc` still normalize to the _same_ key as each other (`atlast-m6-a-service-checkout`) — this is **not** a defect this ADR leaves unfixed; it is the frozen policy's own, already-accepted "colloquial synonym" behavior (the same mechanism that already collapses `svc-checkout`/`checkout-service`/`service-checkout` in the original fixture domain), now correctly scoped to _within one kind_ rather than bleeding _across kinds_. Three genuinely distinct real Service objects in one namespace literally named `checkout`, `checkout-service`, and `checkout-svc` simultaneously would be a contrived scenario no real cluster administrator creates; this residual is accepted, not solved, by this decision.

### 3a. This decision inherits, and does not resolve, the M5 § 21.7 hyphen-boundary-ambiguity risk — now with one more segment

`docs/audits/m0-synthetic-boundary-audit.md § 21.7` already disclosed, and explicitly declined to fix, a real risk in hyphen-joining two components (namespace and name) into one identity string: two genuinely distinct real objects can theoretically produce the identical joined string if the hyphen boundary between components is reinterpreted differently (its own worked example: a Pod `live-pod` in namespace `atlast-m5` versus a Pod `m5-live-pod` in namespace `atlast`). This ADR's `<namespace>-<kind>-<name>` encoding is a **three-segment instance of the exact same general risk category**, not a new one — some combination of `(namespace, kind, name)` could in principle produce the same joined string as a different combination if a namespace or name component itself contains hyphens positioned adversarially. This ADR fixes the cross-kind collision (§§ 2–3) and does not attempt to, and does not claim to, resolve the broader hyphen-boundary-ambiguity risk class § 21.7 already disclosed — that remains open, exactly as before, now applying to one more segment boundary than it did previously.

### 3b. Explicit, unresolved textual tension with ADR-0039 § 5 (flagged for human acceptance, not silently resolved)

[ADR-0039](0039-m6-kubernetes-topology-extension.md) § 5 states: "Atlast's human-facing entity identity remains namespace/name-based, unchanged from the accepted `m1-v1` policy — this ADR does not propose changing it." That sentence was written entirely in the context of the UID-vs-name, same-kind delete/recreate question (§ 4 above) and never discusses or rules on the cross-kind case this ADR addresses. Read narrowly, this decision is compatible with it. Read literally, "remains namespace/name-based" could be understood to forbid _any_ extension of that shape, including a kind-qualified one — since `namespace-kind-name` is no longer purely "namespace/name-based" in the most literal sense. **This ADR does not assume the narrow reading is correct.** Accepting this ADR should be understood as also narrowly clarifying that ADR-0039 § 5's sentence was scoped to the UID question, not as a decision this ADR can make unilaterally by asserting compatibility. This is offered to the human reviewer as an explicit open question, not resolved here.

### 4. Kubernetes UID is explicitly rejected as canonical identity

Per [ADR-0039](0039-m6-kubernetes-topology-extension.md) § 5, Kubernetes UID **remains** required for controller-owner matching (`resolveControllerOwner`, unchanged) and **may** remain in Evidence `detail`/provenance where already appropriate. It **does not** become part of `sourceNativeId`, does not become part of Atlast's human-facing Entity identity, and this ADR does not authorize that change. Using UID as identity would silently change delete/recreate identity-continuity semantics — a materially larger, separate product decision ADR-0039 explicitly declined to make — and would need its own ADR amending the accepted `m1-v1` identity policy, not this one.

### 5. The frozen `m1-v1` canonical normalization policy is not modified

`M1_V1_DERIVATION_POLICY`, its `normalizationRules`, and its `decorativeAffixes` list are unchanged — this decision changes only the raw input string the Kubernetes connector hands to the existing, unmodified normalizer, exactly as ADR-0022 § 1 already anticipates for a connector's own encoding choices. No `m1-v2` derivation version is created.

### 6. Symmetric application — no resource kind is special-cased

The `<namespace>-<kind>-<name>` scheme applies identically to **all four** kinds the connector observes, including Pods. No principled architectural reason was found to exempt Pods and leave them at the bare `<namespace>-<name>` shape while qualifying the other three — doing so would be exactly the asymmetric rule this ADR rejects. This necessarily changes the _shape_ of every Kubernetes-connector-derived Pod Entity identifier from `atlast:entity:<namespace>-<name>` to `atlast:entity:<namespace>-pod-<name>`.

### 7. Relationship identity is updated consistently

Both the ownership (`Deployment → ReplicaSet`, `ReplicaSet → Pod`) and selection (`Service → Pod`) relationship derivations must construct their `observation.sourceEntityIdentity`/`targetEntityIdentity` using each endpoint's own new kind-qualified `sourceNativeId` — never the old bare shape — so endpoints continue to resolve to the correct, now-kind-qualified Entity identifiers ([ADR-0022](0022-m1-reconciliation-policy-and-assertion-derivation.md) § 6). The relationship Evidence's own top-level `sourceScopedIdentity.sourceNativeId` (which determines the Relationship _subject's_ own identity, independent of its endpoints) is constructed by joining both endpoints' already kind-qualified native IDs with the relationship's own literal type token (e.g. `<owner-native-id>-owns-<child-native-id>`) — proven directly against the real normalizer to remain distinct across different edges and to introduce no new collision class.

### 8. Historical audit records are not rewritten

`docs/audits/m0-synthetic-boundary-audit.md §§ 21, 22, 25.2` (and any other closed session's factual record) continue to report the identifier shapes that were actually observed during those already-closed, already-torn-down sessions, unedited. This ADR governs _future_ connector behavior only.

## Contractual Invariants This Decision Must Preserve

- `M1_V1_DERIVATION_POLICY` and its normalization rules are byte-for-byte unchanged; no new derivation version is introduced.
- Kubernetes UID never becomes part of `sourceNativeId` or any human-facing Atlast identifier.
- Every Entity/Relationship claim remains content-addressed, provenance-carrying, and confidence/freshness-classified exactly as every existing M1–M6 fact already is — no exemption for Kubernetes-derived facts.
- `packages/graph-model` is not modified by this decision — the fix is entirely connector-local, exactly as the M5-A hyphen-join precedent already established.
- Two distinct Kubernetes objects of different kinds, simultaneously observable in the same namespace, must not collapse into one Atlast Entity solely because their names normalize identically after decorative-affix stripping.

## Alternatives Considered

- **Leading kind prefix** (`<kind>-<namespace>-<name>`). Rejected: proven broken for the `service` kind specifically — the connector's own `service-` token collides with the frozen policy's `prefixes: ["service-"]` entry, silently re-erasing the disambiguation.
- **Trailing kind suffix** (`<namespace>-<name>-<kind>`). Rejected: identical failure mode via `suffixes: ["-service"]`.
- **Kubernetes UID as canonical identity.** Rejected: directly contradicts the explicit ADR-0039 § 5 text; changes delete/recreate continuity semantics; a materially larger decision this ADR does not make.
- **Amend `M1_V1_DERIVATION_POLICY`'s decorative-affix list** (e.g., remove `service`/`svc` from it, or make stripping kind-aware). Rejected: directly modifies the frozen, Accepted ADR-0022 policy, whose own text requires any field change to be a new derivation version (`m1-v2`) — a materially larger decision than a connector-local encoding fix, and it would only address the affix-stripping collision, not the more fundamental no-kind-discriminator collision that exists even without any affix involved.
- **Asymmetric encoding — qualify only Deployments/ReplicaSets/Services, leave Pods at the historical bare shape.** Rejected: no principled reason survives scrutiny once the M5-A/M6-A identifier shape is correctly classified as historical evidence, not a live compatibility promise (§ 9 below); an asymmetric rule adopted merely to avoid changing existing Pod identifiers would be exactly the kind of implementation-convenience-driven inconsistency this project's own architecture discipline rejects elsewhere.
- **Do nothing; rely on sandbox-naming avoidance only.** Sufficient for the current M6-B candidate's own deterministic sandbox (already applied, disclosed in `docs/audits/m0-synthetic-boundary-audit.md § 25.2`), but leaves the defect live for any real future deployment following an ordinary Kubernetes naming convention — rejected as the _general_ answer, though not incompatible with this ADR's own adoption timeline.

## Tradeoffs

- **Chosen:** a symmetric, middle-placed, kind-qualified connector-local `sourceNativeId` encoding, proven collision-free against the real normalizer for every tested case, touching no accepted canonical policy — at the cost of changing every Kubernetes-connector-derived Entity identifier's shape, including Pods', once.
- **Given up:** identifier-shape stability for the M5-A/M6-A experimental Kubernetes identifiers, in exchange for a topology that cannot silently misrepresent which real Kubernetes object a human is looking at.

## Consequences

- `packages/connectors/src/kubernetes/evidence-mapping.ts`'s `sourceNativeId` helper (and every relationship-endpoint construction that currently reuses it) changes its construction from `${namespace}-${name}` to `${namespace}-${kind}-${name}`, parameterized by each resource kind's own literal token.
- Every Kubernetes-connector-derived Entity identifier changes shape, including previously-Pods-only identifiers — a one-time, intentional break in identifier-string stability for connector-derived data specifically, not for fixture-derived data, which is entirely unaffected.
- No data migration exists or is needed: this project's storage is in-memory only; connector mode always starts from an empty store and rebuilds entirely from live observation (confirmed: no persistent Kubernetes-derived state exists anywhere in the accepted architecture).
- No previously-open M6-B implementation work (atomic observation cycle, referential-integrity safety, ownership/selector derivation, RBAC, dataset badge, pilot feedback) requires any change beyond consistently using the new `sourceNativeId` construction — the underlying derivation logic, six-state Service semantics, and impact engine are all unaffected in kind, only in the identity strings they operate over.

## Risks

- **A future contributor could "simplify" the encoding back to a leading or trailing kind token without re-deriving why that fails.** Mitigation: § 2's reasoning and the collision table must be preserved as an explicit code comment at the implementation site, mirroring how this project already documents the UID-matching and hyphen-join rationales.
- **The residual same-kind decorative-collapsing behavior (§ 3) could be mistaken for an unaddressed defect during future review.** Mitigation: explicitly named and accepted here, not silently left ambiguous.
- **Changing the Pod identifier shape could surprise a reviewer expecting M5-A/M6-A stability.** Mitigation: § 9 below states the compatibility position explicitly, for human acceptance, rather than assuming it.
- **This decision could be mistaken for a complete fix of Kubernetes identity collision risk.** It is not: § 3a's hyphen-boundary-ambiguity risk (extending M5 § 21.7) and § 3's same-kind decorative collapsing both remain, disclosed and accepted, not solved. Mitigation: both are named explicitly here rather than left for a future reviewer to rediscover.

## Why This Fits Atlast

- **PROJECT_SPEC.md Principle 1** ("observed truth over declared truth") and **Principle 8** ("fail honest"): a silently merged Entity is the opposite of honest observation; this decision restores the truthful one-object-per-real-object mapping ADR-0039's own topology extension already assumed.
- **Boring core, isolated intelligence**: the fix is entirely connector-local, reusing the existing, unmodified normalization/reconciliation/impact pipeline exactly as the M5-A hyphen-join precedent already established — no new derivation machinery.
- **E1 — Evidence-first data model**: every fact continues to carry the same provenance/confidence/freshness triple; this decision only corrects which subject that triple attaches to.

## Backward-Compatibility Position (for explicit human decision)

No Accepted ADR, publicly documented API contract, persisted data store, or live bookmarked/deep-linked state was found to depend on the specific M5-A/M6-A Kubernetes-connector-derived identifier shape continuing unchanged:

- ADR-0036/0037 govern the client/RBAC boundary, not identifier shape. ADR-0039 § 5 governs the _conceptual basis_ (namespace/name, not UID) for identity, not the literal string encoding. ADR-0040 governs composition-root unification, not identifier shape.
- The query-API contract treats every Entity identifier as an opaque string (`sourceScopedIdentitySchema`'s own doc: "opaque"); no accepted route contract publishes or guarantees a specific Kubernetes identifier format as a versioned external promise.
- `fixtures/demo-company`'s own tested identifiers (`atlast:entity:checkout`, etc.) are completely unrelated to Kubernetes-connector-derived identifiers and are unaffected by this decision.
- Storage is in-memory only; both M5-A's and M6-A's real disposable clusters were already deleted at the close of their own sessions, and no currently-running process depends on their specific past identifiers resolving to anything.
- Historical audit text (§ 21.7, § 22, § 25.2) records what was factually observed at the time and is preserved unedited by this decision (§ 8 above) — it is historical evidence, not a live contract.

**Recommended position, offered for explicit human acceptance, not assumed:** M5-A and M6-A were bounded local experiments preceding the independent employee pilot (M6-C). Their exact Kubernetes-connector-derived Entity identifier strings are historical evidence of what those experiments produced, not a production compatibility promise. M6-B may therefore intentionally and symmetrically change Kubernetes-connector-derived Entity identifier shapes once, now, before M6-C, to establish the correct cross-kind identity invariant — without requiring any data migration, without rewriting historical audit text, and without special-casing any resource kind.

## Conditions That Would Justify Changing This Decision

- A future resource kind's own idiomatic Kubernetes name is found to begin or end with one of the frozen policy's literal decorative affixes as a _namespace's_ own leading/trailing token (not merely the object's own name) — would require re-verifying § 2's middle-placement safety argument against that specific case, not necessarily a different encoding.
- A future need to reference a Kubernetes-connector-derived identifier from outside this process (a durable, versioned external contract) would require this ADR's compatibility position (§ 9) to be revisited before that contract is finalized.
- A future decision to resolve the M5 § 21.7 namespace/name hyphen-boundary ambiguity, or to adopt UID-based identity continuity, would each require their own separate ADR — neither is proposed or authorized here.

This Proposed ADR does not itself authorize implementation. Adopting it requires explicit human acceptance, exactly as every other M6 ADR required, before any M6-B implementation file changes to use this encoding.
