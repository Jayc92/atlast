# Atlast M6 Plan — Internal Pilot Validation (Proposed)

**Status:** Proposed — not yet accepted. This document, and every ADR it references as Proposed, authorizes no implementation.

> **Planning authorization boundary:** Joseph Carfagno explicitly authorized M6 planning and ADR drafting only, on 2026-08-24, following the internal-product-validation reconnaissance recorded in this session's conversation history (no separate audit-document record exists for that reconnaissance; it was read-only and produced no file changes). This authorization releases M6 planning and pre-release architecture/ADR review only — this plan and its accompanying Proposed ADRs ([0039](adr/0039-m6-kubernetes-topology-extension.md), [0040](adr/0040-m6-composition-root-unification.md), [0041](adr/0041-m6-pilot-feedback-storage-boundary.md)) require their own independent review and explicit human acceptance before any implementation slice can be released, exactly as the M1 plan (ADRs 0014–0018), the M4 plan (ADRs 0032–0035), and the M5 plan (ADRs 0036–0037) each preceded their own first implementation slice. **No M6 code, dependency, schema, or Kubernetes-manifest change exists yet.**

> **Adversarial review note (2026-08-24, same day):** an independent adversarial architecture/product/security review of the first draft found material corrections required in the Kubernetes topology/ownership semantics, the Service-relationship vocabulary, the composition-root dataset model and connector lifecycle, the pilot-feedback verdict vocabulary, and the exact hypothetical-change contract (this plan's first draft loosely said "describe" a change, but the accepted contract supports only three predefined `changeType` values, never free text). It also found that the originally drafted ADR-0042 (self-service connect/launch) did not meet this project's own bar for a standalone ADR and folded its content into § 8 below. Every correction is reflected directly in the sections below and in ADRs 0039–0041; this note is not a duplicate changelog. **This plan remains Proposed, not Accepted, after this review.**

## 1. Purpose

M5 proved the M1–M4 architecture against a real, disposable Kubernetes cluster from the inside — an Atlast developer ran the connector, drove the query API directly, and recorded the evidence. M5 never proved the product is _usable_ by anyone else. M6 answers the next honest question: **can a technically competent employee who did not build Atlast independently connect a real (if disposable) system, see what Atlast discovered, judge whether the map is right, run a hypothetical change, and judge whether the impact analysis is right — end to end, through the ordinary product, without a developer driving it for them?**

This is a product-testability milestone, not a scale, integration, or intelligence milestone. It proves the product can be independently exercised and honestly measured; it does not prove the product is accurate at scale, and it explicitly does not require the product to _be_ accurate for the pilot to succeed (§ 5).

## 2. Real-System Safety Boundary (binding, unchanged from M5)

This section restates M5's existing binding boundary ([docs/m5-plan.md § 2](m5-plan.md#2-real-system-safety-boundary-binding-non-negotiable)) — it creates no new one, and M6 does not weaken it. Pilot #1's environment is in scope only if **all** of M5's existing conditions hold simultaneously:

- provisioned entirely on the tester's own workstation — no remote host of any kind;
- runs on a local container/runtime environment already present on that machine;
- involves no cloud account of any kind;
- involves no billable managed-Kubernetes resource;
- has no persistent or shared infrastructure component;
- is never an employer, shared, staging, or production cluster, under any circumstance.

**M6 does not expand this boundary.** "An approved sandbox" for Pilot #1 means exactly a disposable local Kind (or equivalent) cluster the tester provisions themselves — the identical shape M5-A already used, not a company-hosted, shared, or staging environment. A shared or company-hosted sandbox is explicitly **not** in scope for this milestone and would require its own separate, explicit, human-approved [PROJECT_SPEC.md](../PROJECT_SPEC.md) amendment before any future pilot could target one — this plan does not propose or assume that amendment.

## 3. Target Tester, Milestone Purpose, and the Exact "Unaided" Boundary

- **One** technically competent internal employee who did not build Atlast and who knows the pilot sandbox's real topology well enough to judge Atlast's map against it.
- The tester may receive prerequisite/setup documentation and prerequisite assistance **before** the pilot begins — this is explicitly permitted and does not count against "unaided."
- **One independent tester and one environment is sufficient for this milestone to close**, provided the exit criteria (§ 14) are met. This milestone proves internal testability — that the product _can_ be independently exercised and truthfully measured — not statistically meaningful product accuracy. Further testers and pilots, and any accuracy claim beyond this one session, are explicitly out of scope and occur only after a separately authorized later phase.

**Exact pilot-start boundary (binding definition, resolving what "unaided" means):**

> The pilot begins the moment the documented prerequisites pass and the tester has received the official M6 pilot instructions. From that point forward, an Atlast developer MUST NOT: run commands for the tester; drive API calls on the tester's behalf; operate the UI for the tester; interactively repair the environment; or tell the tester which verdict to record.

If a developer intervenes after the pilot has begun:

- the intervention is recorded in the pilot artifact ([ADR-0041 § 3](adr/0041-m6-pilot-feedback-storage-boundary.md#3-conceptual-schema-revised))'s session metadata, never concealed;
- the run remains useful evidence — it is not discarded;
- but the **independent-completion exit criterion** (§ 14, criterion 6) **fails for that run**, specifically and only that criterion. Incorrect or honestly-unknown mappings never fail any exit criterion on their own (§ 5); developer-driven completion fails this one, precisely because it is the one thing this milestone exists to prove is possible without.

## 4. Kubernetes Topology Scope

Per [ADR-0039](adr/0039-m6-kubernetes-topology-extension.md) (Proposed, revised after adversarial review): the minimum truthful real topology is

```
Deployment → ReplicaSet → Pod   (via ownerReferences, matched by UID)
Service    → Pod                (via label-selector matching)
```

using Kubernetes-native Evidence only. Binding constraints:

- **Ownership.** A Pod/ReplicaSet's controller owner reference is at most one, deterministic, and MUST be matched to its parent by Kubernetes **UID**, never by name alone — names can be reused after a real object is deleted and recreated. One Deployment legitimately owning multiple ReplicaSets simultaneously (a rolling update) is normal multiplicity, not ambiguity, and MUST NOT be collapsed to one. An ownerless Pod or ReplicaSet is a legitimate state, represented honestly as no-parent, never as an invented Deployment/ReplicaSet.
- **Service relationships — six distinguished states, not one "unknown" bucket** (full detail: [ADR-0039 § 3](adr/0039-m6-kubernetes-topology-extension.md#3-selection-relationship-service--pod-via-label-selector-matching)): a **known zero-match** Service (a positive, computed fact) is different from **insufficient evidence to evaluate** (genuinely unknown), different from **no selector at all** (not applicable), different from a Service backed by **EndpointSlice/manual Endpoints** (explicitly out of scope for M6 — disclosed as a scope limitation, never represented as "no backing Pods"). Atlast MUST NOT assume or force 1:1 Service:Pod cardinality; zero, one, or many matches are all valid.
- **A disclosed, unresolved identity-continuity limitation** ([ADR-0039 § 5](adr/0039-m6-kubernetes-topology-extension.md#5-kubernetes-uid-ownership-matching-and-a-disclosed-identity-continuity-limitation)): Atlast's human-facing entity identity remains namespace/name-based, unchanged from the accepted `m1-v1` policy. A real object deleted and recreated with the same name will read to Atlast as continuing corroboration of the same entity, even though the underlying object changed. This ADR captures Kubernetes UID for ownership-matching correctness and provenance only — it does not change the accepted identity policy, and this limitation is disclosed, not fixed, exactly as M5-A's own hyphen-join finding was.
- Every positive mapping must remain Evidence-traceable exactly as every existing M1–M5 fact already is.
- Atlast MUST NOT invent a direct `Deployment → Service` or `Deployment → Pod` edge merely for visual simplicity.
- ReplicaSet is retained in the underlying model wherever required for truthful ownership provenance; the UI **may** visually collapse it — model fidelity and UI presentation are separable decisions this plan does not settle now.

## 5. Unknown Policy (binding)

Honest **UNKNOWN** is an acceptable, and potentially correct, pilot result. Invented topology is not. Milestone success does **not** require Atlast to map 100% of the pilot environment — it requires that whatever Atlast does assert is Evidence-traceable, and that whatever it cannot establish is surfaced as an honest gap rather than papered over. This directly restates [PROJECT_SPEC.md Principle 8](../PROJECT_SPEC.md#3-guiding-principles) for this milestone's specific new topology surface, and is reflected in the six-state Service vocabulary (§ 4) and the pilot verdict vocabulary (§ 10).

## 6. Target Employee Journey

1. Start Atlast (the normal, unified product — not a special experiment process; see § 7).
2. Connect an approved sandbox using the documented self-service flow (§ 8).
3. Verify the connection is read-only/safe (the existing ADR-0037 structural and live-rejection proofs, unchanged).
4. Discovery runs against the sandbox.
5. Open the normal Atlast website.
6. See the real discovered topology visually, distinguishable from any synthetic/demo data via the visible dataset-mode indicator (§ 9, [ADR-0040 § 1](adr/0040-m6-composition-root-unification.md#1-dataset-mode-connector-only-mutually-exclusive-with-fixtures-with-a-visible-mode-indicator)).
7. Click entities/relationships and inspect source, Evidence, freshness, confidence, and rule-trace/explanation (already delivered — see [ADR-0028](adr/0028-m2-snapshot-navigation-and-trust-contract.md)'s trust contract, reused unmodified).
8. Judge whether each mapping is correct, incorrect, missing, or honestly-unknown/uncertain, and record that judgment (§ 10).
9. Select a real discovered entity.
10. **Select one of the three existing, predefined `changeType` values** (`removal`, `degradation`, or `interface-change` — the accepted, closed contract; there is no free-text change description) — already delivered, the existing impact panel, reused unmodified per [ADR-0033](adr/0033-m4-impact-query-api-contract.md).
11. Run impact analysis.
12. See ranked, potentially affected entities.
13. Traverse why each entity may be affected (already delivered — the existing trust/evidence drill-down, reused unmodified).
14. Judge whether the impact result is correct, incorrect, incomplete, uncertain, or has an unusable explanation, and record that judgment (§ 10).
15. Produce a durable pilot scorecard (§ 11) that tells us where Atlast worked and where it did not.

## 7. Composition-Root Requirement

Per [ADR-0040](adr/0040-m6-composition-root-unification.md) (Proposed, revised after adversarial review): today, `apps/api/src/server.ts` and `apps/api/src/server-m5-kubernetes-experiment.ts` construct two completely separate, independently seeded stores in two separate processes — connector-derived Evidence is structurally invisible to the browser today. M6 requires:

```
Kubernetes connector → shared application EvidenceStore → reconciliation/TopologyGraphStore → normal Atlast API → normal Atlast web UI
```

- **Exactly one dataset is active per process at a time** — fixture-seeded (today's unmodified default) or connector-seeded (this milestone's new opt-in path) — never both simultaneously. This is a chosen, reviewed decision among four alternatives (see [ADR-0040 § 1](adr/0040-m6-composition-root-unification.md#1-dataset-mode-connector-only-mutually-exclusive-with-fixtures-with-a-visible-mode-indicator)), not an oversight.
- The active dataset mode MUST be **visibly, authoritatively reported** (an extended `/health` response field), so the tester and the § 9 UI work can confirm unambiguously which topology is being evaluated — not merely infer it from which entities happen to appear.
- **Connector failure is a defined lifecycle, not an afterthought** ([ADR-0040 § 6](adr/0040-m6-composition-root-unification.md#6-connector-operational-lifecycle-new--the-first-draft-did-not-address-this)): a pre-flight (target-guard/RBAC) failure MUST prevent the process from ever starting to serve; a mid-session Kubernetes outage MUST behave exactly as M5's own already-proven source-loss/freshness-aging behavior does — no new design needed there.
- The existing M5-A experiment entrypoint MAY remain as historical/test tooling but MUST NOT be the pilot's product path.
- Existing fixture/synthetic capability (M0–M5) MUST remain fully intact and selectable.

## 8. Connect/Scan Experience

_(This section supersedes the retracted [ADR-0042](adr/0042-m6-self-service-connector-launch-and-credential-model.md), whose content is folded in here after adversarial review found it did not meet this project's bar for a standalone architectural decision — see that file's Rejection rationale.)_

The smallest safe, CLI/script-based connection experience, not a browser credential/setup wizard, in this exact order:

```
preflight
→ verify local Kind target (existing ADR-0037 § 4 mechanism, unchanged)
→ establish/verify least-privilege RBAC (existing ADR-0037 §§ 2, 5, 6 mechanisms, unchanged)
→ prove reads succeed (a real list/get call against the target)
→ prove mutation is forbidden (a real representative mutating call, rejected 403)
→ configure discovery
→ launch the normal Atlast application
→ print the browser URL
→ provide cleanup command/instructions (how to tear the pilot down afterward)
```

Exact command naming is not decided by this plan. **Credentials MUST NOT be entered or stored through any browser UI** — this directly extends [ADR-0037 § 3](adr/0037-m5-read-only-credential-and-rbac-design.md#3-explicit-injected-credential--never-ambient-resolution)'s existing "explicit, injected credential — never ambient resolution" principle to this milestone's launch surface; it is not a new principle.

**RBAC provisioning — three options considered, one chosen:**

| Option                                                                                       | Shape                                                                                                                            | Verdict                                                                                                   |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A. Atlast automatically creates the ServiceAccount/Role/RoleBinding.                         | Requires Atlast's own tooling to hold RBAC-_management_ privileges — broader than the read-only scope it is trying to establish. | **Rejected**: ironically requires more privilege than the property it's trying to prove.                  |
| B. Atlast provides a reviewable manifest the tester explicitly applies (`kubectl apply -f`). | The tester sees and applies exactly what will be granted, before any Atlast code runs.                                           | **Chosen** — matches ADR-0037's existing, unchanged design and this project's least-privilege discipline. |
| C. No manifest at all; tester hand-writes RBAC from documentation.                           | Error-prone, inconsistent across testers.                                                                                        | **Rejected** for this milestone; a provided manifest is strictly safer and no more effort.                |

The tester does not need to understand the M5-A experiment entrypoint's internals. The wrong-cluster failure mode (an unexpected context name or non-loopback server) MUST fail loudly and closed, reusing the existing `TargetGuardError`/`assertLocalKindTarget` mechanism unmodified.

## 9. Visual Source/Freshness Requirements

The graph viewport, trust inspector, and impact panel are already fully data-source-agnostic and require no change to function against real Kubernetes-derived entities (confirmed by the reconnaissance's UI audit). The minimum productization requirement is a **glanceable visual distinction** — a source/entity-kind/namespace indicator on graph nodes and in the structured list view, keyed off the new authoritative dataset-mode signal ([ADR-0040 § 1](adr/0040-m6-composition-root-unification.md#1-dataset-mode-connector-only-mutually-exclusive-with-fixtures-with-a-visible-mode-indicator)) rather than inferred from Evidence text alone — sufficient for the tester to tell real Kubernetes data apart from synthetic fixture data without opening every entity's trust inspector first.

## 10. Pilot-Feedback Boundary and Verdict Vocabulary

Per [ADR-0041](adr/0041-m6-pilot-feedback-storage-boundary.md) (Proposed, revised after adversarial review): human pilot judgments MUST remain separate from Atlast's Evidence/domain model, in a standalone artifact never read by reconciliation. The verdict vocabulary distinguishes Atlast's own honest computed states from the tester's subjective uncertainty — collapsing these into one "uncertain" bucket was the first draft's error, corrected here:

- **Entity:** `correctly-discovered` / `incorrectly-represented` / `missing` / `explicitly-unknown` (Atlast's own honest gap, e.g. an ownerless Pod) / `tester-uncertain`.
- **Relationship:** `correct` / `incorrect` / `missing` / `known-zero` (a confirmed, honest zero-match Service) / `unknown-insufficient-evidence` (Atlast could not evaluate it at all) / `tester-uncertain`.
- **Impact result:** `correct` / `incorrect` / `incomplete` / `explanation-unusable` (the ranking may be right but the tester can't understand why from the evidence trail — a distinct explainability signal) / `uncertain`.

"Missing" and "explicitly-unknown" judgments carry a human-entered description/reference rather than a fabricated Atlast identifier, since the corresponding object may have no Atlast identifier at all. Every judgment carries optional notes and enough session metadata (tester role, dataset-mode/environment identifier, timestamps, developer-intervention record per § 3) to make the record durable and understandable independent of this conversation. The recommended lifecycle is session-local review state → explicit export → one versioned local JSON artifact, never a database, never `EvidenceStore`, never a `GraphAssertion` mutation ([ADR-0041 § 5](adr/0041-m6-pilot-feedback-storage-boundary.md#5-recommended-lifecycle-session-local-review-state--explicit-export--one-versioned-local-artifact)). The artifact stays outside the git-tracked repository, mirroring existing kubeconfig-handling precedent ([ADR-0041 § 7](adr/0041-m6-pilot-feedback-storage-boundary.md#7-sensitive-notes-handling)).

## 11. Pilot Scorecard

The scorecard aggregates § 10's verdicts into **factual counts**, with no invented aggregate accuracy percentage (no defensible denominator or ground truth exists at n=1):

- discovered entities; discovered relationships;
- reviewed entities; reviewed relationships;
- entity verdict counts (all five § 10 entity verdicts); relationship verdict counts (all six § 10 relationship verdicts);
- honestly surfaced unknowns/known-zeros (counted, not conflated);
- hypothetical changes tested; impact results reviewed; impact verdict counts (all five § 10 impact verdicts, including `explanation-unusable` counted separately from correctness);
- whether developer assistance was required, and for what, per § 3's exact boundary;
- time to complete the workflow;
- qualitative tester notes.

**For Pilot #1, complete review of the intentionally small deterministic sandbox (§ 12) is recommended over statistical sampling** — at this scale, sampling would discard information for no benefit. A later, separately authorized multi-pilot phase may define defensible aggregate accuracy metrics; this milestone does not attempt to.

## 12. Deterministic Pilot Sandbox (recommendation, not implemented by this plan)

To make the pilot meaningful and repeatable, Pilot #1 should use a deliberately small, deterministic, **real** Kubernetes topology — created as real objects via `kubectl apply` against the tester's own disposable cluster and discovered through the real connector, never an Atlast fixture substitution. Recommended minimum shape, sufficient to exercise every case named in §§ 4 and 10 without requiring statistical sampling:

- One namespace.
- One Deployment with 2 replicas (producing one ReplicaSet owning two Pods) — exercises the ownership chain and Pod multiplicity.
- One Service whose selector matches that Deployment's Pods — exercises the normal multi-match Service→Pod case (§ 4, case C).
- One Service with a selector that deliberately matches no existing Pod — exercises the honest **known-zero-match** case (§ 4, case A) directly and deliberately, rather than hoping one occurs by accident.
- One additional, unrelated Deployment/Pod with no Service — gives the tester a genuinely uninteresting control entity, and exercises the ownerless/no-relationship honesty path if created without any owner.
- Enough connectivity that a non-trivial impact analysis is possible: the recommended hypothetical change for this sandbox is `changeType: "removal"` applied to the shared Service or its backing Deployment, so the ranked impact result spans multiple real Pods the tester can independently verify against the sandbox they built.

The tester should know this intended sandbox topology well enough to provide ground truth — this is what makes the pilot's judgments meaningful rather than guesswork. This sandbox definition is a recommendation for implementation/pilot-execution time, not something this planning document creates.

## 13. Hypothetical-Change Workflow

Pilot #1 uses the **existing, already-delivered, closed-contract** Atlast impact workflow — confirmed by the reconnaissance to require no new engine or major UI work: select a real discovered entity → select one of the three existing predefined `changeType` values (`removal` / `degradation` / `interface-change` — [ADR-0033](adr/0033-m4-impact-query-api-contract.md); **there is no free-text or natural-language change description in the accepted contract, and this plan must not be read as though there were**) → run impact analysis → see ranked affected entities → traverse the why/Evidence → record a judgment (§ 10). No GitHub, Jira, ServiceNow, or Terraform integration is proposed or needed. § 12 names the recommended non-trivial change for the deterministic sandbox.

## 14. Acceptance Test

An end-to-end acceptance test in which a non-author employee:

1. provisions or uses their own disposable local sandbox, meeting § 2's exact boundary (ideally the § 12 deterministic shape);
2. connects Atlast using only the documented self-service flow (§ 8);
3. opens the normal Atlast website (§ 7's unified path);
4. sees the real discovered topology, visually distinguishable from synthetic data via the dataset-mode indicator (§ 9);
5. inspects Evidence/trust for entities and relationships;
6. records mapping judgments using the full § 10 vocabulary, including any honest unknowns/known-zeros;
7. selects a real entity, selects a predefined `changeType`, and runs impact analysis (§ 13);
8. reviews the ranked impact result and its evidence-traceable explanation;
9. records an impact judgment, including whether the explanation itself was usable (§ 10);
10. produces the pilot scorecard (§ 11);
11. completes all of the above within the exact § 3 "unaided" boundary — any developer intervention recorded, not concealed.

**The outcome may contain incorrect or unknown mappings and still constitute a valid, complete pilot.** Milestone success is about making the product independently testable and truthfully measurable — not about forcing every mapping to be correct.

## 15. M6 Exit Criteria

Product-level, not implementation-completion, criteria. Incorrect or honestly-unknown mappings do not, on their own, fail any of these; developer-driven completion fails criterion 6 specifically (§ 3).

- [ ] 1. An unaided tester (§ 3's exact boundary) can connect and start the approved local pilot after documented prerequisites, using only the documented self-service flow (§ 8).
- [ ] 2. Real, connector-derived topology appears through the **normal** Atlast website — not a special experiment process — and is visually distinguishable from synthetic data via the dataset-mode indicator.
- [ ] 3. The tester can inspect Evidence, trust, source, and freshness for the real discovered topology.
- [ ] 4. The tester completes a mapping evaluation capable of recording every applicable § 10 verdict — correct, incorrect, missing, known-zero, unknown/insufficient-evidence, and tester-uncertain — as appropriate to what was actually observed.
- [ ] 5. The tester runs and evaluates at least one non-trivial hypothetical change (§ 12's recommended shape or equivalent) through the existing impact workflow, including judging whether the explanation itself was usable.
- [ ] 6. The pilot produces a durable scorecard/artifact, and the independent-completion result (whether the tester needed developer assistance, and for what) is objectively recorded — an unaided run and an assisted run are both valid pilot evidence, but only an unaided run satisfies this specific criterion.

None of these is satisfied by this plan; this document authorizes no implementation and marks no criterion complete.

## 16. Explicit Non-Goals

- Real `watch` streams (Kubernetes polling remains, per ADR-0036 § 4, unchanged).
- Multi-cluster, production/shared/staging clusters, or any customer environment.
- GitHub, Jira, ServiceNow, or Terraform integration of any kind.
- Predictive AI, ML, or LLM-based reasoning.
- Multi-cloud discovery adapters.
- Multi-source enterprise reconciliation.
- Persistence/database migration.
- EndpointSlice/manually-managed-Endpoints observation (§ 4's disclosed scope limitation).
- Polished, hosted, or enterprise-packaged distribution (§ 17).
- Any new browser feature beyond what § 9 names.
- Broadening the real-system safety boundary in any way (§ 2).
- Resolving the identity-continuity limitation (§ 4) — disclosed, not fixed, this milestone.

## 17. Distribution for Pilot #1

Clone-and-run-locally — the same local-dev model every prior milestone already uses. No Docker Compose packaging, installer packaging, hosted deployment, or enterprise distribution mechanism is proposed.

## 18. Deferred M6 Slices

Explicitly not part of the first slice, and not authorized by this plan:

- Additional Kubernetes resource types beyond Deployments/ReplicaSets/Services/Pods, EndpointSlice coverage, or a second discovery adapter.
- Any broadening of the pilot environment definition (§ 2) to a shared or company-hosted sandbox.
- Any multi-tester or multi-environment pilot phase, or any aggregate accuracy claim.
- Resolving the identity-continuity limitation (§ 4).

## 19. Checkpoint Sequencing

1. This plan and ADRs 0039–0041 (0042 rejected/folded — § 8) receive independent architecture review.
2. Every blocking finding is corrected and re-reviewed.
3. Joseph Carfagno explicitly accepts the complete M6 baseline (this plan and ADRs 0039–0041).
4. The acceptance record merges to `main` and local `main` is synchronized cleanly.
5. Each implementation slice below (§ 20) receives its own separate, explicit implementation authorization, effective only once its own documentation record merges and local `main` synchronizes cleanly.
6. Each slice is implemented, independently reviewed, verified against the complete local `./scripts/verify.sh`, PR-approved with GitHub Actions `verify` passing, and merged.
7. The acceptance test (§ 14) is run against a real tester and a real disposable sandbox, and its transcript and scorecard recorded as closeout evidence.
8. Only after step 7 does any deferred slice (§ 18) become eligible for its own separate authorization request.

## 20. Proposed Implementation Slices (shapes only — none authorized)

- **M6-A (proposed shape):** composition-root unification with the visible dataset-mode indicator and connector-failure lifecycle (ADR-0040), and the self-service connect/scan flow (§ 8, folded from the retracted ADR-0042), keeping the Kubernetes topology scope at M5's existing Pods-only coverage. This alone proves the single largest blocker — the browser cannot see connector data today — is resolved, independently of any topology expansion.
- **M6-B (proposed shape):** the Kubernetes topology extension (ADR-0039: Deployments, ReplicaSets, Services, UID-based ownership matching, and the full six-state Service-relationship vocabulary), the minimum visual productization (§ 9), and the pilot-feedback artifact (ADR-0041).
- **M6-C (proposed shape, evidence/closeout slice — not primarily code):** build the deterministic pilot sandbox (§ 12), run the acceptance test (§ 14) with a real tester, record the scorecard, evaluate the exit criteria (§ 15) directly against the merged repository state, and prepare the milestone closeout.

No slice beyond M6-A is authorized by this plan. Each later slice requires its own separate, explicit human authorization after its predecessor merges and `main` synchronizes cleanly.

## 21. Dependencies and Technology

No new third-party dependency is currently anticipated: the topology extension (ADR-0039) reuses the already-approved `@kubernetes/client-node` (ADR-0036) with additional read-only API calls; composition-root unification (ADR-0040) and the connect/scan flow (§ 8) are internal composition and tooling changes; the pilot-feedback artifact (ADR-0041) is a new, small, local data structure, not a new package or service. Any dependency that later proves necessary during implementation-feasibility review requires its own justification at PR, per [GUARDRAILS.md § 2](../GUARDRAILS.md#2-coding-standards).

## 22. Review and Release Gates

Before M6-A may begin implementation:

1. this plan and ADRs 0039–0041 receive independent architecture review — **the adversarial pass recorded in this revision is a first such review; a further, independent (not self-authored) review remains outstanding**;
2. every blocking finding is corrected and re-reviewed;
3. Joseph Carfagno explicitly accepts the complete M6 baseline (this plan and ADRs 0039–0041);
4. the acceptance record merges to `main` and local `main` is synchronized cleanly;
5. M6-A receives a separate, explicit implementation authorization, effective only once the record for gate 4 above has merged to `main` and local `main` is synchronized cleanly.

**No M6 implementation file may be created before all five gates above are satisfied.** This plan and its accompanying ADRs are Proposed, not Accepted. **Acceptance of the baseline, when and if it occurs, will not itself authorize M6-A implementation.**
