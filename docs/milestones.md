# Atlast — Milestones

**Status:** Current. **M0 through M5 are complete.** M4-E's synthetic-boundary/no-side-door re-audit, `packages/impact-model` browser import-enforcement fix, and factual bundle/latency/memory/cardinality measurements merged through PR #82 at `2901463` and PR #83 at `f04456a`, recorded in [docs/audits/m0-synthetic-boundary-audit.md § 20](audits/m0-synthetic-boundary-audit.md). Both M4 exit criteria were evaluated directly against the merged repository state and classified **PASS**. Checkpoint `m4-complete` formally closed M4. M5 — the read-only local Kubernetes connector — was subsequently authorized: M5-A's live ingestion and read-only proof merged through [PR #89](https://github.com/Jayc92/atlast/pull/89), the source-loss freshness proof merged through [PR #91](https://github.com/Jayc92/atlast/pull/91), and the mandatory [ADR-0018](adr/0018-m1-storage-strategy.md) storage reassessment — which found condition 2 fired on the real workload and was resolved by [ADR-0038](adr/0038-m5-reconciliation-scaling-remedy.md)'s reconciliation-algorithm remedy rather than a storage-engine change — merged through PRs [#92](https://github.com/Jayc92/atlast/pull/92)–[#95](https://github.com/Jayc92/atlast/pull/95), all recorded in [docs/audits/m0-synthetic-boundary-audit.md §§ 21–23](audits/m0-synthetic-boundary-audit.md). All three M5 exit criteria and all four M5 verification obligations were evaluated directly against the merged repository state and classified **PASS**. Checkpoint `m5-complete` formally closes M5. Post-M5 work remains unauthorized.

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

## M1 — Synthetic Topology Model (complete — 2026-08-12)

> **Authorization status:** the M1 plan ([docs/m1-plan.md](m1-plan.md)) was approved 2026-07-23 as the M1 implementation baseline, ADRs [0014](adr/0014-core-topology-domain-model.md)–[0025](adr/0025-s7-source-alias-erasable-syntax-compatibility.md) are Accepted ([ADR-0019](adr/0019-subject-identity-and-assertion-claims.md) amends ADR-0014 and ADR-0015: identity-only subjects, with type and endpoints in assertion claims; [ADR-0020](adr/0020-m1-inventory-and-search-semantics.md) amends ADR-0017's inventory/search wording; [ADR-0021](adr/0021-jcs-canonicalization-clarifications.md) amends ADR-0016's canonicalization clauses; [ADR-0022](adr/0022-m1-reconciliation-policy-and-assertion-derivation.md) amends ADR-0014/0015 as the binding `m1-v1` reconciliation specification; [ADR-0023](adr/0023-m1-snapshot-and-in-memory-store-semantics.md), accepted 2026-08-05 after three independent-review correction passes, amends ADR-0016/0018/0019 and settles the nine S6 implementation-critical design gaps; [ADR-0024](adr/0024-m1-query-api-runtime-contract.md), accepted 2026-08-11 after the S7 pre-release review and three independent correction passes, amends ADR-0017/0020 and settles fifteen S7 implementation-critical HTTP-boundary and build-boundary gaps; [ADR-0025](adr/0025-s7-source-alias-erasable-syntax-compatibility.md), accepted 2026-08-11, amends ADR-0022/0024 and authorizes the one narrow `identity-normalization.ts` compatibility refactor S7 required), and **M1 implementation was explicitly authorized by human decision on 2026-07-23**. Execution is **slice-gated** per the plan: work proceeds one independently reviewed slice at a time, each slice released explicitly after its predecessor is reviewed and merged. **Slice S1 (domain schemas) is complete — merged through PR #7 on 2026-07-29. Slice S2 (repository interfaces + storage-agnostic contract-test suite skeleton) is complete — human-approved 2026-07-29 and merged through PR #10 on 2026-07-30; the S2 checkpoint/HANDOFF protocol merged through PR #11. Slice S3 (fixture suite v1) is complete — independently reviewed and approved, merged through PR #13 at `003bccc` on 2026-07-30 with GitHub Actions `verify` passing; its closeout checkpoint merged through PR #14. Slice S4 (temporal foundations) is complete — authorized through PR #15 with ADR-0021 accepted through the same PR, implemented, independently reviewed and remediated, and merged through PR #16 at `63bdfab` on 2026-07-31 with GitHub Actions `verify` passing. Slice S5 (reconciliation engine, `m1-v1`) is complete — human-authorized 2026-07-31, released by Joseph Carfagno's explicit acceptance of ADR-0022 — the binding `m1-v1` reconciliation specification — on 2026-08-05 after independent review (acceptance record merged through PR #18 at `f50f0d7`), implemented under accepted ADR-0022, independently reviewed with no blocking findings, and merged through PR #19 at `0923e9c` on 2026-08-05 with GitHub Actions `verify` passing.** The S6 pre-release architecture and authorization review is complete — ADR-0023 was explicitly accepted by Joseph Carfagno on 2026-08-05 after three independent-review correction passes, settling all nine identified S6 design gaps; it is the binding S6 clarification and remains Accepted. Separately from that acceptance, **Joseph Carfagno explicitly authorized Slice S6 on 2026-08-05** (recorded in [TASKS.md](../TASKS.md)): S6 (snapshot layer + in-memory stores implementing the S2 interfaces) was implemented under accepted ADR-0023, independently reviewed, and **is now complete — merged to `main` through [PR #23](https://github.com/Jayc92/atlast/pull/23) at `9bf7f09` on 2026-08-10 with GitHub Actions `verify` passing**. **Closing S6 does not authorize S7.** The S7 pre-release architecture and runtime contract is separately settled: **[ADR-0024](adr/0024-m1-query-api-runtime-contract.md) was explicitly accepted by Joseph Carfagno on 2026-08-11**, after the S7 pre-release review and three independent correction passes, settling fifteen implementation-critical gaps and amending ADR-0017/0020 via metadata-only notices. ADR-0024's acceptance did not itself authorize S7 implementation; **Joseph Carfagno then explicitly authorized Slice S7 on 2026-08-11** (recorded in [TASKS.md](../TASKS.md)). **An actual S7-B implementation attempt subsequently reproduced a genuine build-configuration contradiction** between `apps/api`'s `erasableSyntaxOnly` (ADR-0011) and the ADR-0024 § 14 step 5 source alias, surfaced through `packages/graph-model/src/identity-normalization.ts`'s constructor parameter properties (TS1294); **[ADR-0025](adr/0025-s7-source-alias-erasable-syntax-compatibility.md) was explicitly accepted by Joseph Carfagno on 2026-08-11**, authorizing exactly one narrow, behavior-preserving refactor to that file (amending ADR-0022 and ADR-0024 via metadata-only notices), which resolved the contradiction. **S7 (query API v1 routes implementing the ADR-0017/0024 contract as amended by ADR-0025) was then implemented, independently reviewed, and is now complete: merged to `main` through [PR #28](https://github.com/Jayc92/atlast/pull/28) at `a7624cd` on 2026-08-11 with GitHub Actions `verify` passing in 2m14s.** **S1–S7 are now complete.** S7's closeout checkpoint documentation merged through [PR #29](https://github.com/Jayc92/atlast/pull/29) at `9acfefa` on 2026-08-11. **Closing S7 did not authorize S8.** **Joseph Carfagno then explicitly authorized M1 Slice S8 in the conductor conversation on 2026-08-11** (recorded in [TASKS.md](../TASKS.md)): S8 (the M1 synthetic-boundary re-audit and documentation closeout, with browser acceptance additions only if the M0 shell's displayed status changes as part of that closeout, plus two separately authorized narrow extensions) was the only active authorized implementation slice. That authorization's own documentation PR merged through [PR #30](https://github.com/Jayc92/atlast/pull/30) at `a4c6a5d` on 2026-08-12. **S8 — the M1 synthetic-boundary re-audit, factual documentation closeout, a minimal `apps/web` shell-status correction, an exhaustive API traceability integration test, and a source-text-safe NUL-byte correction — was then implemented, independently reviewed, verified, and merged to `main` through [PR #31](https://github.com/Jayc92/atlast/pull/31) at `0477cbd` on 2026-08-12 with GitHub Actions `verify` passing in 2m27s.** An independent post-merge revalidation directly against that real commit ([docs/audits/m0-synthetic-boundary-audit.md § 15](audits/m0-synthetic-boundary-audit.md)) then confirmed no synthetic-boundary violation and zero literal NUL bytes across all 180 tracked files. **S1–S8 are now complete. M1 is formally complete as of 2026-08-12 — checkpoint `m1-complete`** (scope detail in [TASKS.md](../TASKS.md); checkpoint state in [HANDOFF.md](../HANDOFF.md)). **No M1 implementation slice is active. M2 was subsequently and separately authorized on 2026-08-12, with planning and pre-release architecture/ADR review as its only initially released phase; M2 product implementation remains gated, and M3+ remain unauthorized.**

**Goal:** The core domain — entities, relationships, evidence, provenance, confidence, freshness, snapshots — modeled and queryable, driven entirely by synthetic fixtures.

**Scope:**

- Topology graph model with provenance, confidence, and freshness on every fact.
- Versioning/snapshots with as-of-time queries.
- Query API v1: inventory, search, traversal, time travel.
- Synthetic fixture suite in `fixtures/`, including messy cases: conflicting evidence, stale facts, ambiguous identities.

**Hard constraint:** M1 **must not** connect to real systems. All evidence is synthetic, loaded from fixtures.

**Exit criteria (all met 2026-08-12):**

- [x] Model and query API run wholly from fixtures in CI with no external dependencies — _verified in [docs/audits/m0-synthetic-boundary-audit.md § 15](audits/m0-synthetic-boundary-audit.md), independently revalidated against the merged S8 commit `0477cbd`._
- [x] Every fact in the graph is traceable to its synthetic evidence via the API — _proven exhaustively by `apps/api/src/routes/evidence.test.ts` (all 20 valid Evidence records dereferenced through `GET /api/v1/evidence/{evidenceId}` alone, across all seven valid fixture scenarios)._
- [x] Graph/evidence representation decisions recorded as ADRs and human-approved — _ADRs 0014–0025, all Accepted._

**Authorization note:** M1's completion authorized M1 only. Joseph Carfagno separately authorized M2, whose six slices closed at checkpoint `m2-complete`. Joseph subsequently accepted the independently reviewed M3 baseline and separately released each M3 slice. M3-A through M3-E merged through PRs #55, #58, #61, #64, and #66. M3-F was released through PR #67, independently reviewed, explicitly human-approved, and merged through PR #68 at `6103ced`; post-merge verification passed. Checkpoint `m3-complete` formally closes M3. Joseph subsequently accepted the M4 baseline and separately released M4-A through M4-E. M4-E's boundary re-audit, enforcement fix, measurements, and exit-criterion evaluation merged through PR #82 and PR #83; both M4 exit criteria evaluated PASS. Checkpoint `m4-complete` formally closes M4. M5+ remain unauthorized.

---

## M2 — Interactive Topology Interface (complete — 2026-08-16)

> **Completion status:** M2-A through M2-F are complete. M2-F merged through PR #51 at `5aeb11d` and the post-merge audit revalidated the exact scope, full verifier, synthetic boundary, and no-side-door rule. Checkpoint `m2-complete` formally closes the milestone. The M3 baseline was later accepted and M3-A was separately delivered; this M2 completion record is unchanged.

**Goal:** People who don't write queries can explore the graph.

**Scope:**

- Interactive graph exploration UI: navigation and layout, search, entity detail.
- Provenance view — "why does Atlast believe this edge?" — with confidence and freshness on every displayed fact.
- Snapshot/history playback.
- Browser acceptance checks covering the primary exploration journeys.

**Exit criteria:**

- [x] A user can navigate a synthetic topology, search for entities, and inspect the Evidence behind any edge from the UI alone — _proven by the merged M2-A through M2-F interface and the 24-case desktop/mobile browser acceptance suite, including direct Evidence dereferencing and keyboard-only trust inspection._
- [x] The UI reads exclusively through the query API (no side doors) — _proven by the lint-enforced browser import boundary and the direct post-merge audit in [§ 17](audits/m0-synthetic-boundary-audit.md)._

---

## M3 — Operational Health Overlays (complete — 2026-08-17)

> **Completion status:** The accepted M3 baseline merged through PR #53 at `b85be38`; M3-A through M3-F were separately authorized, implemented, reviewed, verified, and merged. M3-F merged through PR #68 at `6103ced` after explicit human approval, and post-merge verification passed. Checkpoint `m3-complete` formally closes M3. Joseph subsequently accepted the M4 baseline; M4-A through M4-E are complete, and both M4 exit criteria evaluated PASS. Checkpoint `m4-complete` formally closes M4. M5+ remain unauthorized.

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

- [x] All six states are representable, visually distinguishable, and queryable in context - _proved by the M3-C API, M3-D UI, M3-E browser/VoiceOver acceptance, and complete 34-case browser suite._
- [x] Overlay data loss loses no topology (overlays proven ephemeral) - _proved at request and empty-store startup boundaries by audit §§ 18-19; health and topology remain operational while health-context fails honestly._

---

## M4 — Change-Impact Simulation (complete — 2026-08-20)

> **Completion status:** Joseph Carfagno accepted [docs/m4-plan.md](m4-plan.md) and ADRs [0032](adr/0032-m4-change-impact-domain-model.md)-[0035](adr/0035-m4-synthetic-accuracy-harness.md) as the M4 baseline through PR #71 at `8e93d10`, then separately released M4-A through M4-E. M4-D's accessibility, canonical-state, empty/failure-state, and built-preview acceptance hardening were independently reviewed, fully verified, explicitly approved after human VoiceOver QA, and merged through [PR #79](https://github.com/Jayc92/atlast/pull/79) at `e5d4a2c` on 2026-08-19 with GitHub Actions `verify` passing in 4m26s. Checkpoint `m4-d-impact-hardening-merged` recorded that closure. Joseph then explicitly authorized M4-E within the exact final audit, no-side-door enforcement, measurement, exit-criterion, and milestone-closeout boundary in [docs/m4-plan.md § 6](m4-plan.md#6-proposed-implementation-slices). **M4-E is now complete**: the boundary re-audit and the `packages/impact-model` browser import-enforcement fix merged through [PR #82](https://github.com/Jayc92/atlast/pull/82) at `2901463` on 2026-08-19 (touching only `eslint.config.mjs` and its test); the complete audit findings and factual bundle/latency/memory/cardinality measurements merged through [PR #83](https://github.com/Jayc92/atlast/pull/83) at `f04456a` on 2026-08-20, recorded in [docs/audits/m0-synthetic-boundary-audit.md § 20](audits/m0-synthetic-boundary-audit.md). Both exit criteria below were then evaluated directly against that merged state and classified **PASS**. **Checkpoint `m4-complete` formally closes M4. M5+ remain unauthorized** — this closure grants no successor permission.

**Goal:** Answer "if I change X, what is affected?" with deterministic, explainable analysis over synthetic topologies.

**Scope:**

- Impact query API: confidence-weighted upstream/downstream traversal with change-type semantics (removal vs. degradation vs. interface change).
- Ranked blast-radius results with the evidence path for every claim.
- Impact views in the UI.
- Accuracy harness: replay of synthetic change scenarios scoring predicted vs. scripted impact.

**Hard constraint:** the deterministic engine **must be complete and validated before any LLM-generated reasoning is added**. Any LLM use considered within M4 is limited to explaining deterministic results in natural language — it never produces conclusions the deterministic engine did not — and itself requires human approval. Predictive AI remains post-M5.

**Exit criteria (both evaluated PASS as of the 2026-08-20 M4-E exit-criterion evaluation, directly against the merged repository state):**

- [x] **An impact query returns ranked affected entities, each with a traversable, deterministic explanation → PASS.** Delivered end to end by M4-A through M4-C — the registered `GET /api/v1/entities/{entityId}/impact` route, the pure deterministic `computeImpact` engine (`packages/impact-model`) and its own contract-test proof of determinism across multi-path, tie-break, cycle, direction, and truncation cases, and a dereferenceable `path` of graph identifiers on every ranked result — plus browser presentation and real Evidence-path drill-down through [PR #77](https://github.com/Jayc92/atlast/pull/77). The M4-E evaluation re-confirmed this directly against the merged commit rather than on narrative alone; see [docs/audits/m0-synthetic-boundary-audit.md § 20](audits/m0-synthetic-boundary-audit.md).
- [x] **The synthetic scenario harness runs in CI and scores impact quality automatically → PASS.** The fixture-backed exact-match scoring suite (`fixtures/demo-company/impact-scenarios/`, [PR #75](https://github.com/Jayc92/atlast/pull/75)) matched **6/6 scripted scenarios exactly** — reconfirmed by re-running the suite live against the current merged `main` during the M4-E exit-criterion evaluation, with the identical result — and a deliberately mutated expectation was proven to fail, showing the harness is not vacuous. The suite runs as an ordinary colocated test under the existing, unmodified `scripts/verify.sh`; GitHub Actions `verify` succeeded on both the harness's introducing merge (PR #75) and the current `main` HEAD (PR #83). No enterprise-scale, production-scalability, or performance-guarantee claim is made by this criterion or its evidence — see [docs/audits/m0-synthetic-boundary-audit.md § 20.9–20.11](audits/m0-synthetic-boundary-audit.md) for the exact, explicitly bounded measurements and their limitations.

---

## M5 — Read-Only Local Kubernetes Connector (complete — 2026-08-24)

> **Completion status:** M5-A (the first live Kubernetes ingestion slice) was explicitly authorized by Joseph Carfagno on 2026-08-20, implemented, independently reviewed, and merged through [PR #89](https://github.com/Jayc92/atlast/pull/89) at `73b8275` on 2026-08-20 — live post-boot Pod ingestion, a real `200` read and a real `403 Forbidden` mutation rejection proving the structural read-only design, and a real Kubernetes identity case study, all recorded in [docs/audits/m0-synthetic-boundary-audit.md § 21](audits/m0-synthetic-boundary-audit.md). The source-loss freshness proof merged through [PR #91](https://github.com/Jayc92/atlast/pull/91): deleting the disposable `atlast-m5` cluster froze provenance at 3,707 citations with no corruption, and freshness classification transitioned honestly `current → stale → historical` via the existing pinned-`asOf` contract ([audit § 22](audits/m0-synthetic-boundary-audit.md)). The mandatory [ADR-0018](adr/0018-m1-storage-strategy.md) storage reassessment against this real workload found **condition 2 fired** — a measured 9.27 s median current-state read at n = 3,707 ([audit § 23](audits/m0-synthetic-boundary-audit.md)) — and root-cause analysis identified the `m1-v1` reconciliation algorithm's repeated full-history reconstruction, not the storage engine, as the cause. [ADR-0038](adr/0038-m5-reconciliation-scaling-remedy.md), accepted 2026-08-21, retained in-memory storage and required that algorithmic defect fixed instead; both of its Complexity Boundaries were implemented and measured — Boundary B, current-state read reuse ([PR #94](https://github.com/Jayc92/atlast/pull/94)) — and Boundary A, guarded incremental reconciliation ([PR #95](https://github.com/Jayc92/atlast/pull/95)) — bringing the same n = 3,707 cold read to a **26.18 ms** median, under this project's established sub-30 ms comfort bar, with every contractual output invariant proven identical to the reference implementation by differential testing. **Final storage conclusion: in-memory storage remains justified against the completed real M5 workload; no SQLite/PostgreSQL/graph-database migration is required.** All three M5 exit criteria and all four M5 verification obligations below evaluated **PASS** directly against this merged evidence. **Checkpoint `m5-complete` formally closes M5.** M5-B (Deployments/Services) and M5-C (a real Kubernetes `watch` stream) were not required for this closure, were not authorized, and remain unimplemented, deferred future-expansion proposals. **This closure authorizes nothing beyond M5 — post-M5 work remains unauthorized.**

**Goal:** First contact with a real — but disposable — system, proving the evidence pipeline against live observations.

**Scope:**

- **One** discovery adapter: read-only, targeting a **disposable, locally owned Kubernetes cluster** (e.g., [Kind](https://kind.sigs.k8s.io/)).
- The adapter emits evidence in the same normalized format the synthetic fixtures use; the existing pipeline builds the graph from it.
- Freshness instrumentation: a dead or deleted cluster degrades freshness visibly, corrupts nothing.

**Hard constraints:**

- Read-only credentials only; no write-capable Kubernetes client exists in any code path.
- The connector **must not** connect to an employer, shared, or production cluster — only to a disposable local environment created for this purpose. Broadening that target requires an explicit, human-approved spec amendment.

**Exit criteria (all evaluated PASS as of the 2026-08-24 M5 closeout, directly against the merged repository state):**

- [x] **A change in the local cluster appears in the graph without human action, with evidence attached → PASS.** A real Pod, created after the M5-A experiment process had already booted, was observed on the next poll, appended through the real, unmodified `EvidenceStore.appendEvidence`, and returned by the unmodified query API with its provenance dereferenced to a real Kubernetes-sourced Evidence record — [docs/audits/m0-synthetic-boundary-audit.md § 21](audits/m0-synthetic-boundary-audit.md), [PR #89](https://github.com/Jayc92/atlast/pull/89).
- [x] **Deleting the cluster degrades freshness visibly; established facts age, nothing is corrupted → PASS.** A real `kind delete cluster` froze provenance at 3,707 citations with the same assertion identifier and subject persisting throughout, no corruption or phantom replacement, and freshness transitioning honestly `current → stale → historical` via the existing pinned-`asOf` contract — [audit § 22](audits/m0-synthetic-boundary-audit.md), [PR #91](https://github.com/Jayc92/atlast/pull/91).
- [x] **With the connector disabled, all M0–M4 synthetic capability is intact → PASS.** The unmodified production entrypoint served the original 11 synthetic `demo-company` entities unaffected in the same session, and with the disposable `atlast-m5` cluster fully deleted the complete `./scripts/verify.sh` passed all seven stages twice — [audit §§ 21.8, 22.8](audits/m0-synthetic-boundary-audit.md).

**Verification obligations (added following the 2026-08-20 M5 readiness review; proof requirements, not additional product scope — all four evaluated PASS as of the 2026-08-24 M5 closeout):**

1. **Live post-boot ingestion → PASS.** A real Kubernetes observation arrived and was appended through the real `EvidenceStore`/ingestion path after Atlast was already running, with the graph visibly changing, no process restart, and no human graph authoring — [audit § 21.3](audits/m0-synthetic-boundary-audit.md), [PR #89](https://github.com/Jayc92/atlast/pull/89).
2. **Real Kubernetes identity case study → PASS.** The deterministic `m1-v1` identity-normalization policy was run against a real Kubernetes Pod name; the natural slash-joined form was correctly rejected by the existing grammar, the connector (not the policy) was changed to hyphen-join instead, and a resulting theoretical collision risk was documented as a factual, unresolved finding rather than assumed away — [audit § 21.7](audits/m0-synthetic-boundary-audit.md).
3. **Structural read-only proof → PASS.** A real `200` read and a real `403 Forbidden` mutation rejection against the live cluster, using the identical ServiceAccount credential, plus a CI-enforced ESLint boundary confining the Kubernetes client to one file and direct source inspection confirming zero write-capable call anywhere in the connector — [audit § 21.5](audits/m0-synthetic-boundary-audit.md).
4. **Storage decision reassessment → PASS.** [ADR-0018](adr/0018-m1-storage-strategy.md)'s condition 2 fired against the real M5 workload — a measured 9.27 s median current-state read at n = 3,707 ([audit § 23.5](audits/m0-synthetic-boundary-audit.md)) — and was resolved, not by a storage-engine change, but by [ADR-0038](adr/0038-m5-reconciliation-scaling-remedy.md)'s reconciliation-algorithm remedy, merged and measured across [PR #92](https://github.com/Jayc92/atlast/pull/92)–[PR #95](https://github.com/Jayc92/atlast/pull/95): the same read now medians 26.18 ms. **Conclusion (a): in-memory storage remains justified against the real M5 workload** — [audit §§ 23.6, 23.10](audits/m0-synthetic-boundary-audit.md). ADR-0018 itself is unedited, consistent with this project's amend-via-new-ADR convention.

These four obligations did not change M5's scope, hard constraints, or exit criteria above; all four are now satisfied, and their satisfaction — together with the three exit criteria above — closes the milestone.

---

## M6 — Internal Pilot Validation (baseline accepted; implementation not authorized)

**Status note (2026-08-24):** M6 is a candidate milestone whose **architecture baseline is Accepted but whose implementation remains unauthorized** — it is not yet part of the authorized-and-implemented sequence above. After M5 formally closed at checkpoint `m5-complete`, Joseph Carfagno authorized M6 planning and ADR drafting, then, after both an adversarial review and a genuinely independent final review found no substantive blocker, **explicitly accepted the complete M6 baseline: [docs/m6-plan.md](m6-plan.md) plus ADR-0039, ADR-0040, and ADR-0041** ([ADR-0042](adr/0042-m6-self-service-connector-launch-and-credential-model.md) remains Rejected, folded into [docs/m6-plan.md § 8](m6-plan.md#8-connectscan-experience) — historical record only, not part of the accepted set). **This acceptance authorizes no implementation.** No M6 exit criterion below is satisfied, and no M6-A/B/C slice is authorized, until a separate, explicit human authorization of M6-A specifically is recorded after this acceptance record merges and local `main` synchronizes cleanly. This section keeps this document internally consistent with [TASKS.md](../TASKS.md) and [docs/adr/README.md](adr/README.md) — it grants no implementation permission.

**Goal (accepted baseline, not yet implemented):** Prove that a technically competent internal employee who did not build Atlast can independently connect an approved disposable local Kubernetes sandbox, see the real discovered topology in the browser, judge its accuracy, run a hypothetical change through the existing impact workflow, and judge the resulting analysis — end to end, without a developer driving it for them. This is a product-testability proof, not a broad accuracy or scale claim ([docs/m6-plan.md § 3](m6-plan.md#3-target-tester-and-milestone-purpose)).

**Scope (accepted baseline, not yet implemented):** the minimum truthful Kubernetes topology beyond M5's Pods-only coverage (Deployment→ReplicaSet→Pod, Service→Pod, both via Kubernetes-native facts only); unifying connector-derived Evidence with the normal browser-facing application, since it is currently invisible to it; a minimum visual source/freshness distinction; a self-service CLI connect/scan flow; and a pilot-evaluation artifact kept structurally separate from the Evidence/domain model.

**Real-system safety boundary:** unchanged from M5 — a disposable local cluster on the tester's own workstation only. M6 does not expand this boundary; any shared or company-hosted sandbox would require its own separate PROJECT_SPEC amendment, not authorized by this stub, the accepted M6 baseline, or any M6 planning document.

**Exit criteria (accepted, not yet satisfied):** see [docs/m6-plan.md § 15](m6-plan.md#15-m6-exit-criteria) for the complete, current list. None is checked; none is authorized scope for implementation until M6-A is separately authorized.

---

## Post-M5 (directional, uncommitted)

None of the following is scheduled; each graduates only by becoming a real milestone with exit criteria, human approval, and spec compliance:

- **Predictive AI** — risk-scored impact prediction and fragility analysis (SPOFs, circular dependencies, unowned criticals, drift), atop the M4 deterministic baseline.
- **Multi-cloud integrations** — discovery adapters beyond the local Kubernetes connector.
- **Multi-source enterprise reconciliation** — identity resolution and conflict handling across heterogeneous real sources.
- **Advisory remediation recommendations** — Atlast may recommend or generate remediation _plans_ as advisory output. Executing changes against observed systems, or holding write-capable credentials, remains a permanent non-goal by human decision ([PROJECT_SPEC.md § 7](../PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become)) and is not on any roadmap.
