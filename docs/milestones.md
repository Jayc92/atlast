# Atlast — Milestones

**Status:** Current — approved 2026-07-22 with the documentation set. Milestones are gated by exit criteria, not dates; a milestone is done when its criteria hold, and **each milestone requires explicit authorization**. M0 completed 2026-07-22. **M1 implementation was explicitly authorized 2026-07-23 and is active**, executing slice-gated: Slices S1–S7 are complete and merged (S7 via [PR #28](https://github.com/Jayc92/atlast/pull/28) at `a7624cd`, 2026-08-11); the S7 pre-release architecture and runtime contract was separately settled — **[ADR-0024](adr/0024-m1-query-api-runtime-contract.md) was explicitly accepted by Joseph Carfagno on 2026-08-11**, amending ADR-0017/0020 via metadata-only notices — and **Slice S7 was then explicitly authorized by Joseph Carfagno on 2026-08-11** in a separate authorization decision. An actual S7-B implementation attempt reproduced a genuine build-configuration contradiction, resolved by **[ADR-0025](adr/0025-s7-source-alias-erasable-syntax-compatibility.md)** — explicitly accepted by Joseph Carfagno on 2026-08-11, authorizing exactly one narrow refactor to `packages/graph-model/src/identity-normalization.ts`. **S7 was then implemented under accepted ADR-0024 as amended by ADR-0025, independently reviewed, and merged to `main` through PR #28 at `a7624cd` on 2026-08-11 with GitHub Actions `verify` passing in 2m14s.** **S1–S7 are now complete.** S7's closeout checkpoint documentation merged through PR #29 at `9acfefa` on 2026-08-11. **Closing S7 did not authorize S8.** **Joseph Carfagno then explicitly authorized M1 Slice S8 in the conductor conversation on 2026-08-11** — S8 is the only active authorized implementation slice, effective only after the documentation PR recording this authorization merges to `main` and `main` is synchronized locally with a clean working tree; see the M1 section below. **M1 must not be called complete until S8 is implemented, reviewed, verified, merged, and formally closed. M2 and later milestones remain unauthorized**, each gated on its own explicit authorization.

**Sequencing rationale — synthetic-first.** M0–M4 build the entire product loop (foundation, topology model, interactive interface, health overlays, change-impact simulation) exclusively against synthetic data, so correctness, honesty, and UX are proven before Atlast touches any real system. M5 is the first and only pre-enterprise contact with reality: a read-only connector to a disposable local Kubernetes cluster. Predictive AI, multi-cloud integrations, and multi-source enterprise reconciliation are all post-M5.

---

<a id="m0--safe-project-foundation-active"></a>

## M0 — Safe Project Foundation (completed 2026-07-22)

**Goal:** A safe, fully verifiable project skeleton — documentation approved first, then a foundation that runs entirely on synthetic data with no external connections.

### Phase A — Documentation (completed 2026-07-22)

- Foundational documentation drafted (this set) and submitted for human review.
- No implementation of any kind occurs in this phase.

### Phase B — Foundation build (completed 2026-07-22; authorized only after documentation approval)

- A **TypeScript monorepo**.
- A **web application** (shell).
- A **backend API** (shell).
- **Shared packages** for code used by both.
- Automated **linting, formatting, type checking, tests, builds, and browser acceptance checks**.
- **`scripts/verify.sh`** as the single verification entry point that runs all of the above.
- **Synthetic data only** — no connection to any real system, service, or credential.
- Draft tooling decisions recorded as ADRs in `docs/adr/` and approved by a human before scaffolding begins.

**Exit criteria (all met 2026-07-22):**

- [x] Documentation set approved by a human maintainer — _approved 2026-07-22._
- [x] M0 tooling ADRs written and human-approved — _ADRs 0001–0013 approved 2026-07-22._
- [x] Monorepo builds; `scripts/verify.sh` runs lint, format, type check, tests, build, and browser acceptance checks and passes in CI — _final `main` GitHub Actions run at commit `783e95c` succeeded 2026-07-22 ([run 29977876658](https://github.com/Jayc92/atlast/actions/runs/29977876658)); details in [TASKS.md](../TASKS.md)._
- [x] Nothing in the repository connects to, or holds credentials for, any external system — _verified by the [M0 synthetic boundary audit](audits/m0-synthetic-boundary-audit.md), including its closure revalidation at `783e95c`._

**Authorization note:** approval of the documentation authorized **M0 Phase B only**, and **completion of M0 did not authorize M1** — M1 work required its own explicit authorization, which was given separately on 2026-07-23 (see the M1 section below).

---

<a id="m1--synthetic-topology-model-gated"></a>

## M1 — Synthetic Topology Model (implementation authorized 2026-07-23 — active)

> **Authorization status:** the M1 plan ([docs/m1-plan.md](m1-plan.md)) was approved 2026-07-23 as the M1 implementation baseline, ADRs [0014](adr/0014-core-topology-domain-model.md)–[0025](adr/0025-s7-source-alias-erasable-syntax-compatibility.md) are Accepted ([ADR-0019](adr/0019-subject-identity-and-assertion-claims.md) amends ADR-0014 and ADR-0015: identity-only subjects, with type and endpoints in assertion claims; [ADR-0020](adr/0020-m1-inventory-and-search-semantics.md) amends ADR-0017's inventory/search wording; [ADR-0021](adr/0021-jcs-canonicalization-clarifications.md) amends ADR-0016's canonicalization clauses; [ADR-0022](adr/0022-m1-reconciliation-policy-and-assertion-derivation.md) amends ADR-0014/0015 as the binding `m1-v1` reconciliation specification; [ADR-0023](adr/0023-m1-snapshot-and-in-memory-store-semantics.md), accepted 2026-08-05 after three independent-review correction passes, amends ADR-0016/0018/0019 and settles the nine S6 implementation-critical design gaps; [ADR-0024](adr/0024-m1-query-api-runtime-contract.md), accepted 2026-08-11 after the S7 pre-release review and three independent correction passes, amends ADR-0017/0020 and settles fifteen S7 implementation-critical HTTP-boundary and build-boundary gaps; [ADR-0025](adr/0025-s7-source-alias-erasable-syntax-compatibility.md), accepted 2026-08-11, amends ADR-0022/0024 and authorizes the one narrow `identity-normalization.ts` compatibility refactor S7 required), and **M1 implementation was explicitly authorized by human decision on 2026-07-23**. Execution is **slice-gated** per the plan: work proceeds one independently reviewed slice at a time, each slice released explicitly after its predecessor is reviewed and merged. **Slice S1 (domain schemas) is complete — merged through PR #7 on 2026-07-29. Slice S2 (repository interfaces + storage-agnostic contract-test suite skeleton) is complete — human-approved 2026-07-29 and merged through PR #10 on 2026-07-30; the S2 checkpoint/HANDOFF protocol merged through PR #11. Slice S3 (fixture suite v1) is complete — independently reviewed and approved, merged through PR #13 at `003bccc` on 2026-07-30 with GitHub Actions `verify` passing; its closeout checkpoint merged through PR #14. Slice S4 (temporal foundations) is complete — authorized through PR #15 with ADR-0021 accepted through the same PR, implemented, independently reviewed and remediated, and merged through PR #16 at `63bdfab` on 2026-07-31 with GitHub Actions `verify` passing. Slice S5 (reconciliation engine, `m1-v1`) is complete — human-authorized 2026-07-31, released by Joseph Carfagno's explicit acceptance of ADR-0022 — the binding `m1-v1` reconciliation specification — on 2026-08-05 after independent review (acceptance record merged through PR #18 at `f50f0d7`), implemented under accepted ADR-0022, independently reviewed with no blocking findings, and merged through PR #19 at `0923e9c` on 2026-08-05 with GitHub Actions `verify` passing.** The S6 pre-release architecture and authorization review is complete — ADR-0023 was explicitly accepted by Joseph Carfagno on 2026-08-05 after three independent-review correction passes, settling all nine identified S6 design gaps; it is the binding S6 clarification and remains Accepted. Separately from that acceptance, **Joseph Carfagno explicitly authorized Slice S6 on 2026-08-05** (recorded in [TASKS.md](../TASKS.md)): S6 (snapshot layer + in-memory stores implementing the S2 interfaces) was implemented under accepted ADR-0023, independently reviewed, and **is now complete — merged to `main` through [PR #23](https://github.com/Jayc92/atlast/pull/23) at `9bf7f09` on 2026-08-10 with GitHub Actions `verify` passing**. **Closing S6 does not authorize S7.** The S7 pre-release architecture and runtime contract is separately settled: **[ADR-0024](adr/0024-m1-query-api-runtime-contract.md) was explicitly accepted by Joseph Carfagno on 2026-08-11**, after the S7 pre-release review and three independent correction passes, settling fifteen implementation-critical gaps and amending ADR-0017/0020 via metadata-only notices. ADR-0024's acceptance did not itself authorize S7 implementation; **Joseph Carfagno then explicitly authorized Slice S7 on 2026-08-11** (recorded in [TASKS.md](../TASKS.md)). **An actual S7-B implementation attempt subsequently reproduced a genuine build-configuration contradiction** between `apps/api`'s `erasableSyntaxOnly` (ADR-0011) and the ADR-0024 § 14 step 5 source alias, surfaced through `packages/graph-model/src/identity-normalization.ts`'s constructor parameter properties (TS1294); **[ADR-0025](adr/0025-s7-source-alias-erasable-syntax-compatibility.md) was explicitly accepted by Joseph Carfagno on 2026-08-11**, authorizing exactly one narrow, behavior-preserving refactor to that file (amending ADR-0022 and ADR-0024 via metadata-only notices), which resolved the contradiction. **S7 (query API v1 routes implementing the ADR-0017/0024 contract as amended by ADR-0025) was then implemented, independently reviewed, and is now complete: merged to `main` through [PR #28](https://github.com/Jayc92/atlast/pull/28) at `a7624cd` on 2026-08-11 with GitHub Actions `verify` passing in 2m14s.** **S1–S7 are now complete.** S7's closeout checkpoint documentation merged through [PR #29](https://github.com/Jayc92/atlast/pull/29) at `9acfefa` on 2026-08-11. **Closing S7 did not authorize S8.** **Joseph Carfagno then explicitly authorized M1 Slice S8 in the conductor conversation on 2026-08-11** (recorded in [TASKS.md](../TASKS.md)): S8 (the M1 synthetic-boundary re-audit and documentation closeout, with browser acceptance additions only if the M0 shell's displayed status changes as part of that closeout) is the only active authorized implementation slice — **effective only after the documentation PR recording this authorization merges to `main` and `main` is synchronized locally with a clean working tree**. Authorization does not approve future S8 implementation output — that output still requires implementation, independent review, complete local `./scripts/verify.sh` verification, PR approval, passing GitHub Actions `verify`, merge, and a final M1 closeout checkpoint (scope detail in [TASKS.md](../TASKS.md); checkpoint state in [HANDOFF.md](../HANDOFF.md)). **M1 must not be called complete until S8 is implemented, reviewed, verified, merged, and formally closed. M2 and later milestones remain unauthorized**, each requiring its own explicit authorization at M1 close.

**Goal:** The core domain — entities, relationships, evidence, provenance, confidence, freshness, snapshots — modeled and queryable, driven entirely by synthetic fixtures.

**Scope:**

- Topology graph model with provenance, confidence, and freshness on every fact.
- Versioning/snapshots with as-of-time queries.
- Query API v1: inventory, search, traversal, time travel.
- Synthetic fixture suite in `fixtures/`, including messy cases: conflicting evidence, stale facts, ambiguous identities.

**Hard constraint:** M1 **must not** connect to real systems. All evidence is synthetic, loaded from fixtures.

**Exit criteria:**

- [ ] Model and query API run wholly from fixtures in CI with no external dependencies.
- [ ] Every fact in the graph is traceable to its synthetic evidence via the API.
- [ ] Graph/evidence representation decisions recorded as ADRs and human-approved.

---

## M2 — Interactive Topology Interface (gated)

**Goal:** People who don't write queries can explore the graph.

**Scope:**

- Interactive graph exploration UI: navigation and layout, search, entity detail.
- Provenance view — "why does Atlast believe this edge?" — with confidence and freshness on every displayed fact.
- Snapshot/history playback.
- Browser acceptance checks covering the primary exploration journeys.

**Exit criteria:**

- [ ] A user can navigate a synthetic topology, search for entities, and inspect the evidence behind any edge from the UI alone.
- [ ] The UI reads exclusively through the query API (no side doors).

---

## M3 — Operational Health Overlays (gated)

**Goal:** Synthetic operational state projected onto the graph so topology and health are one picture.

**Scope:**

- Overlay model and a synthetic state generator covering, at minimum, these states:
  - **healthy**
  - **degraded**
  - **down**
  - **disconnected**
  - **expiring certificate**
  - **latent downstream risk**
- Health-in-context query family in the API; overlay toggles in the UI.
- Overlays never author topology; an overlay referencing an unknown entity surfaces as a gap, not a phantom node.

**Exit criteria:**

- [ ] All six states are representable, visually distinguishable, and queryable in context.
- [ ] Overlay data loss loses no topology (overlays proven ephemeral).

---

## M4 — Change-Impact Simulation (gated)

**Goal:** Answer "if I change X, what is affected?" with deterministic, explainable analysis over synthetic topologies.

**Scope:**

- Impact query API: confidence-weighted upstream/downstream traversal with change-type semantics (removal vs. degradation vs. interface change).
- Ranked blast-radius results with the evidence path for every claim.
- Impact views in the UI.
- Accuracy harness: replay of synthetic change scenarios scoring predicted vs. scripted impact.

**Hard constraint:** the deterministic engine **must be complete and validated before any LLM-generated reasoning is added**. Any LLM use considered within M4 is limited to explaining deterministic results in natural language — it never produces conclusions the deterministic engine did not — and itself requires human approval. Predictive AI remains post-M5.

**Exit criteria:**

- [ ] An impact query returns ranked affected entities, each with a traversable, deterministic explanation.
- [ ] The synthetic scenario harness runs in CI and scores impact quality automatically.

---

## M5 — Read-Only Local Kubernetes Connector (gated)

**Goal:** First contact with a real — but disposable — system, proving the evidence pipeline against live observations.

**Scope:**

- **One** discovery adapter: read-only, targeting a **disposable, locally owned Kubernetes cluster** (e.g., [Kind](https://kind.sigs.k8s.io/)).
- The adapter emits evidence in the same normalized format the synthetic fixtures use; the existing pipeline builds the graph from it.
- Freshness instrumentation: a dead or deleted cluster degrades freshness visibly, corrupts nothing.

**Hard constraints:**

- Read-only credentials only; no write-capable Kubernetes client exists in any code path.
- The connector **must not** connect to an employer, shared, or production cluster — only to a disposable local environment created for this purpose. Broadening that target requires an explicit, human-approved spec amendment.

**Exit criteria:**

- [ ] A change in the local cluster appears in the graph without human action, with evidence attached.
- [ ] Deleting the cluster degrades freshness visibly; established facts age, nothing is corrupted.
- [ ] With the connector disabled, all M0–M4 synthetic capability is intact.

---

## Post-M5 (directional, uncommitted)

None of the following is scheduled; each graduates only by becoming a real milestone with exit criteria, human approval, and spec compliance:

- **Predictive AI** — risk-scored impact prediction and fragility analysis (SPOFs, circular dependencies, unowned criticals, drift), atop the M4 deterministic baseline.
- **Multi-cloud integrations** — discovery adapters beyond the local Kubernetes connector.
- **Multi-source enterprise reconciliation** — identity resolution and conflict handling across heterogeneous real sources.
- **Advisory remediation recommendations** — Atlast may recommend or generate remediation _plans_ as advisory output. Executing changes against observed systems, or holding write-capable credentials, remains a permanent non-goal by human decision ([PROJECT_SPEC.md § 7](../PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become)) and is not on any roadmap.
