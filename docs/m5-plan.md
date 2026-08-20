# Atlast M5 Plan — Read-Only Local Kubernetes Connector (First Real-System Experiment)

**Status:** Accepted — the M5 implementation baseline
**Date:** 2026-08-20

> **Planning authorization boundary (2026-08-20):** Joseph Carfagno explicitly authorized M5 at the milestone level on 2026-08-20, following the M5 readiness review and the merged M5 plan amendments in [docs/milestones.md](milestones.md). That authorization released M5 planning and pre-release architecture/ADR review only — this plan and its accompanying ADRs ([0036](adr/0036-m5-kubernetes-client-and-connector-boundary.md), [0037](adr/0037-m5-read-only-credential-and-rbac-design.md)) required their own independent review and explicit human acceptance before any implementation slice could be released, exactly as the M1 plan (ADRs 0014–0018) and the M4 plan (ADRs 0032–0035) each preceded their own first implementation slice.

> **Baseline acceptance (2026-08-20):** the M5-P independent architecture/security review's required changes were applied (the disposable-local-cluster definition, the CI-enforced structural read-only proof, the concrete target guard, the strengthened live-ingestion acceptance proof, the temporary-seam framing, the local-tooling-prerequisite disclosure, and the ADR-0009 reconciliation), and the authentication-policy governance decision this plan's § 12 raised was resolved: Joseph Carfagno explicitly approved a narrowly scoped GUARDRAILS.md amendment (option (a)), which merged through [PR #87](https://github.com/Jayc92/atlast/pull/87) at `9bbeec4` on 2026-08-20 and is now an active, binding rule — [GUARDRAILS.md § 1.4](../GUARDRAILS.md#14-security). With both the independent review's required changes and the authentication-policy decision resolved, **Joseph Carfagno explicitly accepted this complete M5-P baseline (this plan and ADRs 0036–0037) by human review on 2026-08-20.** **This acceptance authorizes the M5-A implementation gate to be considered — it does not itself authorize M5-A implementation.** M5-A still requires its own separate, explicit implementation authorization, effective only after this acceptance record merges to `main` and local `main` is synchronized cleanly. **This document itself authorizes no implementation.** No M5 code, dependency, or Kubernetes manifest exists yet.

## 1. Purpose

M5 answers the one question every prior milestone has deliberately deferred: does the M1–M4 architecture — Evidence, deterministic `m1-v1` reconciliation, the versioned graph, the query API, the browser UI — actually work against a real, observed system, or only against a hand-authored script? [docs/milestones.md M5](milestones.md#m5--read-only-local-kubernetes-connector-gated) frames this as "first contact with a real — but disposable — system, proving the evidence pipeline against live observations." M5 is an experiment that validates the architecture against reality; it is explicitly not a broad Kubernetes discovery product, not a second reconciliation source, and not a step toward predictive analysis.

## 2. Real-System Safety Boundary (binding, non-negotiable)

This section restates existing binding constraints — it does not create new ones, and nothing in this plan may weaken it:

- **Disposable local cluster, precisely defined.** [PROJECT_SPEC.md § 6](../PROJECT_SPEC.md#6-constraints--assumptions) and [docs/milestones.md M5](milestones.md#m5--read-only-local-kubernetes-connector-gated) name a disposable, locally owned Kubernetes cluster (Kind or equivalent) — this plan makes "or equivalent" precise rather than leaving it to inference, per the M5-P independent review's finding that the prior wording was too vague for a binding safety boundary. A cluster is in scope for M5 only if **all** of the following hold simultaneously:
  - it is provisioned **entirely on the developer's own machine** — no remote host of any kind;
  - it runs on a **local container/runtime environment already present on that machine** (e.g., Docker or Podman, the same runtimes Kind and this project's own Playwright tooling already rely on) — never a remote hypervisor or VM host;
  - it involves **no cloud account of any kind** — not a free tier, not a trial, not a personal account;
  - it involves **no billable managed-Kubernetes resource** — not EKS, GKE, AKS, or any hosted control plane, even a short-lived or "disposable" one;
  - it has **no persistent or shared infrastructure component** — no state, credential, or endpoint that outlives this one local session or is reachable by any other machine or person;
  - it is **never** an employer, shared, or production cluster, under any circumstance.

  **No version of any M5 slice may ever target a cluster failing any one of these conditions.** Broadening this definition requires a separate, explicit, human-approved PROJECT_SPEC amendment — not an implementation decision, and not anything this plan or its ADRs can authorize.

- **Read-only, structurally.** [GUARDRAILS.md § 1.1](../GUARDRAILS.md#11-product-boundaries-are-hard-constraints): "No component may hold write-capable credentials to a system it observes. This constraint applies at the design level: violations are rejected in review, not mitigated with policy." [ADR-0037](adr/0037-m5-read-only-credential-and-rbac-design.md) is the binding mechanism that makes this real rather than aspirational.
- **No real credentials of any other kind.** No employer identifier, real domain, or production configuration value may appear anywhere in this connector's code, tests, or fixtures — the same standard [docs/audits/m0-synthetic-boundary-audit.md](audits/m0-synthetic-boundary-audit.md) has verified for every prior milestone's delta.
- **One adapter, one namespace, one milestone's worth of scope.** Multi-source reconciliation, multi-cloud, and additional adapters are post-M5 and unscheduled per [docs/milestones.md § Post-M5](milestones.md#post-m5-directional-uncommitted); this plan does not propose or design for them.

## 3. First-Slice Boundary (M5-A)

Approved this session, restated here as the binding scope for the first implementation slice once authorized:

- One disposable local Kind cluster (or equivalent), one namespace.
- **Pods only** — no Deployments, Services, or relationship modeling in this slice.
- **Polling**, not a real `watch` stream.
- Read-only `get`/`list`/`watch` access only ([ADR-0037](adr/0037-m5-read-only-credential-and-rbac-design.md)).
- The existing, unmodified Evidence contract, reconciliation policy, graph model, query API, and browser UI — no schema, contract, or product-behavior change.
- **A new, separate, additive experiment entrypoint/process**, distinct from the existing production `apps/api/src/server.ts`, which remains completely untouched. This is what makes exit criterion 3 (§ 5) trivially true for this slice: the connector cannot affect the existing fixture-seeded path because it never runs inside it. **This split is a deliberate, temporary experimental seam for M5-A, not a permanent architectural decision.** Whether the experiment composition root should ever be unified with the normal application composition root — or remain permanently separate — is an explicit open question deferred to a later M5 slice or the M5 closeout decision (§ 6), not something this plan decides now by default through silence.
- The core acceptance bar is **live post-boot ingestion** (§ 4.1) — start Atlast first, create a real Pod afterward, observe it in Atlast without a restart and without human graph authoring.
- Pod deletion/freshness behavior may be observed opportunistically but is **not** a blocking acceptance criterion for this slice; the full freshness-loss exit criterion (§ 5) remains a later slice's obligation.

**Why the experiment seam does not violate ADR-0009's "one application shape" invariant.** The expected implementation shape is a new, additive function alongside the existing `apps/api/src/app.ts`'s `initializeApplication` — for example, an `initializeApplicationExposingStores`-style function that shares the same internal construction logic and calls the same, completely unmodified `buildApplication` — but also returns the constructed `EvidenceStore` reference to its caller, which `initializeApplication` deliberately does not do today. [ADR-0009](adr/0009-integration-testing.md) and `app.ts`'s own documented invariant ("every call requires the complete repository dependency pair — there is no default, throwaway, or health-only variant... satisfying ADR-0009's 'the fully assembled application' testing requirement with one application shape, never two") is about the **registered route/schema/query behavior** of the `FastifyInstance` `buildApplication` produces — and that stays completely identical regardless of which composition function calls it. This proposed addition does not create a second application contract: it is a second **composition/test seam** that exposes the already-constructed store to its caller, while the HTTP surface itself remains the one, unchanged shape every existing test already exercises. `initializeApplication` itself is not modified, so no existing test's behavior or assumption changes.

## 4. Proof Obligations

Carried forward from the merged [docs/milestones.md](milestones.md#m5--read-only-local-kubernetes-connector-gated) verification-obligations amendment. Each is a proof requirement, not a product feature.

### 4.1 Live post-boot ingestion

After the M5 experiment process is already running, a real Kubernetes Pod observation must be collected, appended through the real `EvidenceStore`/ingestion path (the same interface `packages/graph-model/src/evidence-store.ts`'s `appendEvidence` already implements and every existing test already exercises at the unit level), and reflected in a subsequent query-API read — without restarting the process and without any human authoring the graph fact by hand. This is the first slice's binding acceptance criterion (§ 3, § 6).

**"An entity appears in the list" is not sufficient evidence on its own** — per the M5-P independent review's finding, the acceptance test must prove the _complete_ real path, not merely that some record showed up. The acceptance test for this slice MUST, in order:

1. Create the real Pod **after** the M5 experiment process has already started and is already serving requests.
2. Find the resulting Entity through the existing, unmodified query API (`GET /api/v1/entities` or `GET /api/v1/entities/{id}`) — no restart, no manually authored fixture, no direct store manipulation outside the connector's own `appendEvidence` call.
3. Dereference that Entity's assertion `provenance` to the specific Kubernetes-sourced Evidence identifier(s) that produced it, via the existing, unmodified `GET /api/v1/evidence/{evidenceId}` route — exactly the dereferencing discipline M1's exhaustive traceability proof and M4's impact evidence-path drill-down already require, applied here to a real source instead of a fixture.
4. Retrieve that Evidence record and confirm its `sourceScopedIdentity.source` names the Kubernetes connector (not `demo-company` or any other fixture source name) and its `sourceNativeId` matches the real Pod's actual namespace/name.
5. Inspect the resulting assertion's `confidence`, `provenance`, and `ruleTrace` fields and confirm they were produced by the real, unmodified `m1-v1` reconciliation engine — not stubbed, hand-written, or bypassed.
6. Explicitly confirm the record is **not** one of the 20 existing `demo-company` fixture Evidence records — i.e., that no fixture record was substituted for, or mistaken as, the real observation.

Only a transcript satisfying all six steps counts as acceptance evidence for this obligation; a bare "the entity count increased" or "the Pod's name appears somewhere in the response" observation does not.

### 4.2 Real Kubernetes identity case study

Once live ingestion is proven, run the existing, unmodified `m1-v1` identity-normalization policy against actual Kubernetes Pod names from the real disposable cluster and document the observed identifier mapping and any ambiguity or collision behavior encountered — a factual record of real-world behavior, not an assumption that the fixture-tuned policy generalizes. This obligation depends on having real, running Pods to observe, so it follows the first slice rather than gating it.

### 4.3 Structural read-only proof

Per [ADR-0037](adr/0037-m5-read-only-credential-and-rbac-design.md): the adapter's required read/list/watch operations must succeed; a representative mutating Kubernetes operation, attempted with the same credential, must be rejected by the cluster's own authorization layer (not merely never attempted by the code); and the connector's implementation must contain no write-capable client code path, provable the same way `apps/web/src/eslint-boundary.test.ts` proves the browser's no-side-door boundary today — by direct inspection of the module's exported surface, not by trusting a comment.

### 4.4 Storage decision reassessment

Before M5 can close (not before the first slice, which produces too small a dataset to evaluate meaningfully), [ADR-0018](adr/0018-m1-storage-strategy.md)'s own named change conditions must be re-run against the real dataset the Kubernetes adapter actually produces — not the unchanged, fixed-size M1-era fixture ADR-0018 was last evaluated against at the M2 forcing point ([TASKS.md](../TASKS.md) line 228). The M5 closeout must explicitly conclude one of:

- **(a)** in-memory storage remains justified against the real M5 workload, with the measurements supporting that conclusion, exactly as the M2-F re-evaluation recorded its own conclusion; or
- **(b)** one or more of ADR-0018's named conditions has fired, in which case the closeout records that finding and a new storage-decision ADR is required before any further milestone proceeds.

ADR-0018 itself is not edited by either outcome, consistent with this project's amend-via-new-ADR convention.

## 5. M5 Exit Criteria

Unchanged from the already-approved [docs/milestones.md M5 section](milestones.md#m5--read-only-local-kubernetes-connector-gated); this plan does not add, remove, or reword any of them:

- A change in the local cluster appears in the graph without human action, with Evidence attached.
- Deleting the cluster degrades freshness visibly; established facts age, nothing is corrupted.
- With the connector disabled, all M0–M4 synthetic capability is intact.

## 6. Deferred M5 Slices

Explicitly not part of the first slice, and not authorized by this plan:

- **M5-B (proposed shape, not yet authorized):** Deployments and Services, and Deployment→Pod / Service→Pod relationship modeling, once M5-A's seam is proven.
- **M5-C (proposed shape, not yet authorized):** upgrading from polling to a real Kubernetes `watch` stream.
- **M5-D (proposed shape, not yet authorized):** the full freshness-degrades-on-cluster-loss exit criterion, exercised end-to-end (M5-A may observe this opportunistically but does not need to prove it).
- The real Kubernetes identity case study (§ 4.2) and the storage reassessment (§ 4.4) — both require a running dataset broader than one slice's Pods-only scope produces, and are named here as M5-level obligations to be satisfied before M5 closes, not necessarily inside M5-A itself.
- Any merging of live Kubernetes Evidence and synthetic fixture Evidence into one running store or one API process.
- **Open question, explicitly not decided now:** whether the M5-A experiment composition root (§ 3) should eventually be unified with the normal `apps/api/src/server.ts`/`app.ts` composition root, or should remain a permanently separate experimental path. This question is deferred to a later M5 slice or the M5 closeout decision; this plan neither commits to unification nor to permanent separation.

No implementation slice beyond M5-A is authorized by this plan. Each later slice requires its own separate, explicit human authorization after M5-A merges and `main` synchronizes cleanly, exactly as every M1 and M4 slice required.

## 7. STOP Conditions

Restated from the M5 readiness review, binding for every M5 slice:

- Any real Kubernetes identity collision or split the existing deterministic `m1-v1` policy cannot resolve without a redesign.
- Any evidence the in-memory store cannot sustain ordinary Kind-cluster load within a short session.
- Any code path — even latent — where the adapter's credential could perform a write or mutating call.
- Any output that is confidently wrong (stated as current/certain when actually stale or contested) rather than honestly degraded.
- Any accidental non-loopback network path, or any credential broader than the disposable Kind cluster, appearing anywhere in the implementation.

Any STOP condition halts the current slice for human review before further work continues; none of them is resolved by silently narrowing scope or weakening a test.

## 8. Checkpoint Sequencing

1. This plan and ADRs 0036–0037 receive independent architecture review.
2. Every blocking finding is corrected and re-reviewed.
3. Joseph Carfagno explicitly accepts the complete M5-A baseline (this plan and ADRs 0036–0037).
4. The acceptance record merges to `main` and local `main` is synchronized cleanly.
5. M5-A (§ 3) receives a separate, explicit implementation authorization, effective only once its own documentation record merges and local `main` synchronizes cleanly — mirroring [docs/m4-plan.md § 10](m4-plan.md#10-review-and-release-gates)'s gate sequence exactly.
6. M5-A is implemented, independently reviewed, verified against the complete local `./scripts/verify.sh`, PR-approved with GitHub Actions `verify` passing, and merged.
7. The live acceptance test (§ 4.1, § 9 of this document's companion test plan) is run against a real disposable Kind cluster and its transcript recorded as closeout evidence.
8. Only after step 7 does any M5-B/C/D slice (§ 6) become eligible for its own separate authorization request.

## 9. Dependencies and Technology

Exactly one new third-party **application** dependency is proposed, justified in [ADR-0036](adr/0036-m5-kubernetes-client-and-connector-boundary.md): a Kubernetes client library for `packages/connectors`. No other new dependency, manifest change, or lockfile change is proposed by this plan. `scripts/verify.sh` remains the single, unmodified verification entry point; no new script or CI stage is introduced.

**Local developer-tooling prerequisites (distinct from application/runtime dependencies — nothing here is a `package.json`/`pnpm-lock.yaml` dependency, and none of it ships in any built artifact):**

- The **`kind` CLI** — required to provision and tear down the disposable local cluster (§ 2). Not installed on the machine this plan was drafted on; a one-time local install is a documented prerequisite before any M5-A work can run, the same class of permitted development-tooling exception this project's own audit already recognizes for the one-time pinned Playwright Chromium download ([docs/audits/m0-synthetic-boundary-audit.md § 9](audits/m0-synthetic-boundary-audit.md)).
- A **local container runtime** (Docker or Podman) — required by `kind` itself to run cluster nodes as containers. Already present on the machine this plan was drafted on.
- Neither tool is a product dependency, is invoked by any first-party application code, or is required for `apps/api`/`apps/web` to build, test, or run their existing, unmodified paths.

## 10. Explicit Non-Goals

Restated from the authorized scope, none of which this plan proposes to change:

- Employer, shared, or production Kubernetes access of any kind, ever.
- Multi-cluster, multi-cloud, or multi-source enterprise reconciliation.
- Any monitoring/alerting/incident-management integration (Grafana, Prometheus, Datadog, PagerDuty, or equivalent).
- Predictive AI, ML, or LLM-based reasoning of any kind.
- Autonomous remediation.
- Authentication, multi-user state, or hosting.
- Broad Kubernetes resource coverage beyond Pods (this slice) and the explicitly deferred Deployments/Services (§ 6).
- Storage optimization or migration ahead of [ADR-0018](adr/0018-m1-storage-strategy.md)'s own named conditions actually firing (§ 4.4).
- Any new browser feature surface beyond displaying the real adapter's data through the existing, unmodified query API, if and when that becomes necessary.

## 11. Review and Release Gates

Before M5-A may begin implementation:

1. this plan and ADRs 0036–0037 receive independent architecture review — **complete**;
2. every blocking finding is corrected and re-reviewed — **complete**;
3. **the authentication-policy governance decision in § 12 is explicitly resolved by Joseph Carfagno** — this gate is independent of, and in addition to, gates 1–2 and 4–6 below, and was not satisfied merely by accepting this plan and its ADRs — **complete: resolved via the GUARDRAILS.md § 1.4 amendment, merged through [PR #87](https://github.com/Jayc92/atlast/pull/87) at `9bbeec4` on 2026-08-20** (§ 12);
4. Joseph Carfagno explicitly accepts the complete M5 baseline (this plan and ADRs 0036–0037) — **complete, 2026-08-20**;
5. the acceptance record merges to `main` and local `main` is synchronized cleanly;
6. M5-A receives a separate, explicit implementation authorization, effective only once the record for gate 5 above has merged to `main` and local `main` is synchronized cleanly.

**No M5 implementation file may be created before all six gates above are satisfied.** Gates 1–4 are now complete; gates 5–6 remain outstanding. This plan and its accompanying ADRs are Accepted, not merely Proposed, but **acceptance of the baseline does not itself authorize M5-A implementation** — nothing in this document authorizes writing code. **The exact remaining gate is: M5-A implementation requires a separate, explicit human authorization after this acceptance PR merges and local `main` synchronizes cleanly.**

## 12. Authentication Scope — Unresolved Governance Decision

**Status: RESOLVED (2026-08-20).** This section's heading is preserved unchanged from its original drafting because [GUARDRAILS.md § 1.4](../GUARDRAILS.md#14-security) now links directly to this section's anchor as part of its own merged, binding text — renaming this heading would break that reference. The decision this section originally raised as unresolved **is no longer open**: Joseph Carfagno explicitly approved option (a) below (a narrowly scoped GUARDRAILS.md amendment), it was drafted, reviewed, and merged through [PR #87](https://github.com/Jayc92/atlast/pull/87) at `9bbeec4` on 2026-08-20, and is now active, binding text in GUARDRAILS § 1.4. The rest of this section is preserved below as the historical record of the conflict as originally found and the options as originally offered — **it no longer states the current governing rule**. **GUARDRAILS.md § 1.4 is the single source of truth for the exact, authoritative exemption conditions going forward** (now ten conditions, not the seven paraphrased below, per the human approval); this section must not be read as a substitute for that text, and must not be duplicated or re-derived from here.

[GUARDRAILS.md § 1.4](../GUARDRAILS.md#14-security) states, in binding language: "The first externally reachable **or real-system-connected** query API MUST require authentication, MUST be governed by a separately approved authentication ADR, and MUST NOT be implemented before its milestone is explicitly authorized." The M5-A experiment's query API is genuinely **real-system-connected** — it will serve facts reconciled from an actual, if disposable, Kubernetes cluster (§ 2), even though the process remains loopback-bound and is never externally reachable. GUARDRAILS § 1.4's "or" is disjunctive: reachability and real-system-connectedness are named as two _independent_ triggers, and M5-A trips the second one on its own, regardless of the first.

**This plan does not assume the existing M0 local-shell exemption extends to M5-A.** That exemption ([ADR-0004](adr/0004-backend-api-framework.md), context section) was written for, and explicitly scoped to, an API serving **synthetic data only**. M5-A's API serves real, observed data. Silently reusing that exemption's reasoning without a fresh, explicit decision would be exactly the kind of unilateral guardrail reinterpretation [GUARDRAILS.md § 6](../GUARDRAILS.md#6-ai-assistant-guardrails) forbids: "If a request conflicts with these guardrails, the assistant states the conflict and asks, rather than silently complying or silently refusing."

**The proposed resolution, offered for explicit human approval — not adopted by this document:** a narrowly scoped, M5-A-specific local-experiment exemption from GUARDRAILS § 1.4's authentication requirement, conditioned on **all** of the following holding simultaneously, for as long as the exemption is in effect:

- the API process is loopback-only, exactly as every prior milestone's API has been;
- the connected cluster is a disposable, locally owned cluster meeting every condition in § 2 above — never anything else;
- the process runs only as a developer-machine experiment — it is never deployed anywhere;
- the process is never externally reachable, under any network configuration;
- no employer, shared, or production environment is ever involved, at any layer;
- no real enterprise credential of any kind is ever used;
- no persistent hosting of any kind exists for this process.

**Whether the current guardrail text permits this exemption without a formal amendment, or requires one:** [GUARDRAILS.md § 7](../GUARDRAILS.md#7-amending-this-document) states "Guardrails change only by PR with explicit maintainer approval, and the amendment PR must state which principle or standard changes and why." GUARDRAILS § 1.4 as currently written contains no carve-out mechanism for a real-system-connected API under any condition — it is an unconditional MUST. Granting the exemption above, even narrowly and reversibly, would carve a new exception into that MUST clause. **The honest conclusion is that this is not merely an ADR-level interpretation this plan or an accepted ADR can settle — it is a GUARDRAILS.md amendment**, and requires the § 7 amendment process (an explicit PR, explicit maintainer approval, stating which standard changes and why) before it is a governing fact, not merely a proposal recorded here.

**Required governance action, as originally stated (historical):** before M5-A implementation may begin, Joseph Carfagno must explicitly decide one of: **(a)** approve a narrow exemption as a formal GUARDRAILS.md amendment, via its own reviewed PR, restricted to a named condition list — not a general relaxation of § 1.4; **(b)** decline the exemption, requiring a real authentication mechanism satisfying GUARDRAILS § 1.4 literally before M5-A proceeds; or **(c)** determine that GUARDRAILS § 1.4 should be read some other way this document had not anticipated.

**Decision made: option (a).** Joseph Carfagno explicitly approved the narrow exemption on 2026-08-20. It was drafted as a GUARDRAILS.md amendment (ten conditions — an expansion of the seven this section originally proposed, adding an explicit developer-machine-only condition and an explicit requirement that M5-A itself carry its own separate implementation authorization recorded in TASKS.md), reviewed, and merged through [PR #87](https://github.com/Jayc92/atlast/pull/87) at `9bbeec4` on 2026-08-20. **This document does not itself implement authentication and does not itself amend GUARDRAILS.md** — the amendment is a fact of the real, merged `GUARDRAILS.md § 1.4`, not of this plan. Gate 3 in § 11 above is satisfied by that merge; gates 5–6 in § 11 remain the actual, outstanding path to M5-A implementation.
