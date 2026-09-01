# Atlast - Handoff and Checkpoint Document

The canonical, model-neutral resume document for Atlast. Read this file with the governing documents and inspect real Git state before acting.

## 1. Document Control

- **Last updated:** 2026-08-31
- **Checkpoint name:** `m6-criterion-4-remediation-merged` (latest **merged** checkpoint; the M6 milestone checkpoint itself remains `m6-c-pilot-evaluated` — see below)
- **Latest merged implementation commit:** `de1455533bef3e8ec0063774effd0bb941429475` (`fix: make known-zero pilot feedback recordable (#112)`) — the last commit touching product/pilot-feedback behavior, merged 2026-08-31.
- **Latest merged milestone-evaluation checkpoint commit:** `4df8a764362609253ec0a535400c7461b4d9825b` (`docs: record M6-C pilot evaluation (#111)`), merged through [PR #111](https://github.com/Jayc92/atlast/pull/111) on 2026-08-31 — the M6-C pilot authorization/evaluation closeout, checkpoint `m6-c-pilot-evaluated`. It records a real, unaided employee M6-C pilot session that occurred 2026-08-28 (session `608f7d89-4b68-414f-892b-0b36cd64ddd7`) and evaluates it against the Accepted six exit criteria: **5 PASS, 1 FAIL (criterion 4)** — full evidence in [TASKS.md](TASKS.md) and [docs/audits/m0-synthetic-boundary-audit.md § 28](docs/audits/m0-synthetic-boundary-audit.md). **M6 is NOT complete**, and this remains unchanged by the remediation merge recorded below.
- **Criterion-4 remediation status:** a bounded Criterion-4 corrective slice — scoped solely to making the accepted `known-zero` relationship verdict recordable, nothing broader — is implemented, independently adversarially reviewed, and verified by real developer/conductor acceptance against a real disposable Kind cluster. It is **merged to `main` through [PR #112](https://github.com/Jayc92/atlast/pull/112) at squash commit `de14555`** (GitHub Actions `verify` on `main`: SUCCESS). Full evidence: [docs/audits/m0-synthetic-boundary-audit.md § 29](docs/audits/m0-synthetic-boundary-audit.md). **The remediation capability is implemented and verified, but no targeted independent employee validation has occurred — developer/conductor acceptance does not substitute for it.** Criterion 4 remains FAIL until that validation occurs and is separately evaluated. **M6 remains open at 5 of 6 exit criteria.**
- **Verification:** PR #107 (readiness), the subsequent PR #109/#110 packaging corrections, PR #111 (the docs-only M6-C evaluation checkpoint), and PR #112 (the Criterion-4 remediation) each independently passed the complete, unmodified seven-stage verifier before merge, with GitHub Actions `verify` succeeding. On the merged `main` HEAD (`de14555`): shared **432/432**, impact-model **15/15**, graph-model **386/386**, overlay-model **23/23**, connectors **38/38**, web **293/293** (six new pilot-feedback tests), api **148/148**, scripts **25/25**, browser acceptance **46/46** — all seven stages pass.
- **Milestone state:** **M0 through M5 are complete** (checkpoint `m5-complete`, 2026-08-24; see § 6 below for the full M5 closure evidence, unchanged by this checkpoint). **M6 — Internal Pilot Validation — has an Accepted baseline** ([docs/m6-plan.md](docs/m6-plan.md) plus ADR-0039, ADR-0040, ADR-0041; ADR-0042 Rejected, folded into `docs/m6-plan.md § 8`), accepted 2026-08-24 and merged through [PR #98](https://github.com/Jayc92/atlast/pull/98). **M6-A — composition-root unification and the normal-website real-Kubernetes proof — is complete** ([PR #100](https://github.com/Jayc92/atlast/pull/100); [audit § 24](docs/audits/m0-synthetic-boundary-audit.md)). **M6-B — the Kubernetes topology extension, minimum visual productization, and pilot-feedback artifact — is complete** ([PR #104](https://github.com/Jayc92/atlast/pull/104) at `7ed90f9`; [audit § 25](docs/audits/m0-synthetic-boundary-audit.md)). **Pre-M6-C readiness hardening is complete** ([PR #107](https://github.com/Jayc92/atlast/pull/107); [audit § 26](docs/audits/m0-synthetic-boundary-audit.md)), and two pilot-packaging correction slices closing fresh-clone onboarding gaps are also complete ([PR #109](https://github.com/Jayc92/atlast/pull/109), [PR #110](https://github.com/Jayc92/atlast/pull/110); [audit § 27](docs/audits/m0-synthetic-boundary-audit.md)). **A real, unaided employee M6-C pilot session was executed on 2026-08-28, before any contemporaneously durable M6-C slice-authorization record existed; that sequencing gap was discovered during formal evaluation, and on 2026-08-31 the human maintainer explicitly acknowledged/authorized M6-C for governance purposes (not backdated to 2026-08-28) — see [TASKS.md](TASKS.md) § M6-C for the exact chronology. The pilot's content was evaluated on its actual merits against the Accepted six exit criteria and merged to `main` through [PR #111](https://github.com/Jayc92/atlast/pull/111) at checkpoint `m6-c-pilot-evaluated`** ([audit § 28](docs/audits/m0-synthetic-boundary-audit.md)): **criteria 1, 2, 3, 5, and 6 evaluate PASS; criterion 4 evaluates FAIL** (the accepted verdict vocabulary provided no way to record a `known-zero` relationship verdict for an observed, deliberately-built known-zero-match Service). **M6-C is complete as an executed, evaluated pilot slice. M6 itself is NOT complete** — this project has never closed a milestone with a failing exit criterion, and the Accepted plan contains no provision for deferring one. **A bounded Criterion-4 remediation is separately authorized, implemented, and merged to `main` through [PR #112](https://github.com/Jayc92/atlast/pull/112) at squash commit `de14555`** — it does not mark Criterion 4 PASS; only a subsequent targeted independent employee validation, separately evaluated, can do that, and that validation has not occurred. **M6 remains open, blocked specifically on criterion 4, at 5 of 6 exit criteria.** No other pilot finding has been fixed. M7 is not authorized.
- **Precedence:** [PROJECT_SPEC.md](PROJECT_SPEC.md), [GUARDRAILS.md](GUARDRAILS.md), [docs/milestones.md](docs/milestones.md), approved plans, Accepted ADRs, [TASKS.md](TASKS.md), and [CLAUDE.md](CLAUDE.md) override this summary wherever they conflict.

## 2. Product Summary

Atlast is an AI-powered Engineering Topology Platform: continuous system discovery, a living versioned dependency graph, operational health overlays, and deterministic change-impact analysis.

Binding principles:

1. Evidence-first: no graph fact without dereferenceable Evidence.
2. Query-API-only consumption: consumers never read fixtures, repositories, graph-model internals, overlay-model internals, or storage directly.
3. Deterministic before AI.
4. Read-only toward observed systems, permanently.
5. Synthetic-first through M4; M5 is the first possible real-system contact and only with a disposable local cluster.
6. Fail honestly: unavailable, stale, conflicting, ambiguous, invalid, truncated, or missing-overlay state remains visible.

## 3. Source Locations

- **Repository:** `/Users/joseph.carfagno/joseph.carfagno/apps/atlast`
- **GitHub:** <https://github.com/Jayc92/atlast>
- [README.md](README.md): entry point and verification commands.
- [PROJECT_SPEC.md](PROJECT_SPEC.md): approved vision, principles, scope, and non-goals.
- [GUARDRAILS.md](GUARDRAILS.md): binding engineering standards.
- [CLAUDE.md](CLAUDE.md): AI-assistant instructions and authorization boundaries.
- [TASKS.md](TASKS.md): in-flight work ledger and completed checkpoint evidence.
- [docs/milestones.md](docs/milestones.md): M0-M5 sequence and exit criteria.
- [docs/m4-plan.md](docs/m4-plan.md): accepted M4 baseline and bounded slice record.
- [docs/adr/README.md](docs/adr/README.md): Accepted ADRs 0001-0035 and amendment map.
- [docs/audits/m0-synthetic-boundary-audit.md](docs/audits/m0-synthetic-boundary-audit.md): synthetic-boundary history; §19 is the M3 closure revalidation.
- `fixtures/demo-company`: synthetic topology and operational-overlay catalogs.
- `packages/shared`: contracts and schemas.
- `packages/graph-model`: temporal graph, reconciliation, snapshots, and in-memory repositories.
- `packages/overlay-model`: immutable overlay store and deterministic projection.
- `apps/api`: loopback-only read-only query API and health-in-context composition.
- `apps/web`: delivered M2 topology interface plus M3 operational-health presentation.
- `tests/acceptance`: built-preview desktop/mobile acceptance suite.

No credential, token, machine secret, employer data, customer data, or proprietary source may be added.

## 4. Roadmap Position

| Milestone | State                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | Complete - 2026-07-22                                                                                                                                                      | Foundation and closure audit                                                                                                                                                                                                                             |
| M1        | Complete - 2026-08-12                                                                                                                                                      | S1-S8; checkpoint `m1-complete`                                                                                                                                                                                                                          |
| M2        | Complete - 2026-08-16                                                                                                                                                      | M2-A-F; checkpoint `m2-complete`                                                                                                                                                                                                                         |
| M3        | Complete - 2026-08-17                                                                                                                                                      | M3-A-F; PR #68; checkpoint `m3-complete`                                                                                                                                                                                                                 |
| M4        | Complete - 2026-08-20                                                                                                                                                      | PR #83; checkpoint `m4-complete`                                                                                                                                                                                                                         |
| M5        | Complete - 2026-08-24                                                                                                                                                      | PR #89, #91-#95; checkpoint `m5-complete`                                                                                                                                                                                                                |
| M6        | Open — M6-A/M6-B/readiness/packaging/M6-C-evaluation complete (5/6 PASS); criterion-4 remediation merged as PR #112; M6 blocked on criterion 4 pending employee validation | Baseline: PR #98. M6-A: PR #100. ADR-0043: PR #103. M6-B: PR #104. Readiness: PR #107. Packaging: PR #109/#110. M6-C evaluation: PR #111, checkpoint `m6-c-pilot-evaluated`, audit §28. Criterion-4 remediation: PR #112 (merged, `de14555`), audit §29. |

M3 delivered synthetic operational health without making overlays graph truth:

| Slice | Delivered capability                                                            | Merge            |
| ----- | ------------------------------------------------------------------------------- | ---------------- |
| M3-A  | Shared overlay contracts, store boundary, and synthetic fixture catalog         | PR #55 `e9afcd5` |
| M3-B  | Immutable overlay store and deterministic scope-relative projector              | PR #58 `98beb46` |
| M3-C  | Read-only health-in-context API with closed errors and historical composition   | PR #61 `e177fc0` |
| M3-D  | Canonical UI controls and equivalent graph/structured health presentation       | PR #64 `a2c2d92` |
| M3-E  | Accessibility, history, failure, responsive, and browser-acceptance hardening   | PR #66 `9b4343e` |
| M3-F  | Boundary audit, empty-overlay resilience, measurements, and milestone hardening | PR #68 `6103ced` |

Both M3 exit criteria are closed:

- All six accepted states are representable, visually distinguishable, and queryable in context.
- Overlay data loss loses no topology; empty-overlay startup preserves health and topology while health-context fails honestly.

## 5. M4 Closure Evidence

**M4-D** (accessibility and failure-state hardening) merged through PR #79 at `e5d4a2c`: unique React-scoped label ids for simultaneous trust inspectors, correct close/focus ownership for the impact-opened trust selection, and honest multi-hop/missing-relationship behavior, approved after human VoiceOver QA. Verifier passed 264/264 web tests and 46/46 browser cases; GitHub Actions passed in 4m26s.

**M4-E** (final boundary re-audit, enforcement fix, measurements, and exit-criterion evaluation) completed across two merged PRs, neither changing product behavior:

- **PR #82** (`2901463`, 2026-08-19): closed a confirmed browser import-enforcement gap — `eslint.config.mjs` had no rule prohibiting `apps/web` from importing `packages/impact-model`, despite ADR-0033 asserting one existed. No live violation existed. Fixed by extending the existing `no-restricted-imports` boundary and adding two regression probes to `apps/web/src/eslint-boundary.test.ts`, mirroring the existing `packages/overlay-model` pattern exactly.
- **PR #83** (`f04456a`, 2026-08-20): recorded the complete synthetic-boundary/no-side-door re-audit of the M4-A through M4-D delta, the PR #82 enforcement-fix record, and factual bundle/latency/memory/cardinality measurements — each with exact method, environment, commit, timestamp, and explicit limitations, plus a standing warning against extrapolating the small synthetic dataset — as [docs/audits/m0-synthetic-boundary-audit.md § 20](docs/audits/m0-synthetic-boundary-audit.md).

**M4 exit-criterion evaluation (2026-08-20), evaluated directly against the merged repository state and re-executed rather than taken on narrative:**

| #   | Exit criterion                                                                                       | Result                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An impact query returns ranked affected entities, each with a traversable, deterministic explanation | **PASS** — registered `GET /api/v1/entities/{entityId}/impact` route; pure deterministic `computeImpact` engine with its own contract-test proof; every result carries a dereferenceable `path`; the browser exposes it through the real `TrustInspector`; proven live in `tests/acceptance/specs/impact-analysis.spec.ts`                                           |
| 2   | The synthetic scenario harness runs in CI and scores impact quality automatically                    | **PASS** — real 6-valid/3-invalid scenario catalog; fixture-backed exact-match scoring test rerun live against the merged commit (**6/6 scripted scenarios matched exactly**); a deliberately mutated expectation proven to fail; GitHub Actions `verify` confirmed successful on both the harness's introducing merge (PR #75) and the current `main` HEAD (PR #83) |

**Checkpoint `m4-complete`: M4 is formally complete as of 2026-08-20.** This evaluation and closure make no claim of enterprise-scale performance, production scalability, absence of memory leaks, predictive AI, live Kubernetes discovery, or any other M5+ capability — the § 20 measurements are explicit that they describe only this small synthetic dataset on this one machine. **This closure authorizes nothing beyond M4; M5 remains gated and unauthorized.**

## 6. M5 Closure Evidence

**M5-A** (live Kubernetes ingestion, read-only proof, identity case study) merged through [PR #89](https://github.com/Jayc92/atlast/pull/89) at `73b8275` on 2026-08-20: a real Pod, created after the experiment process had already booted, observed on the next poll, appended through the real `EvidenceStore.appendEvidence`, and returned by the unmodified query API with its provenance dereferenced to a real Kubernetes-sourced Evidence record; a real `200` read and a real `403 Forbidden` mutation rejection against the live cluster using the identical ServiceAccount credential; a real Kubernetes identity finding (the natural slash-joined `sourceNativeId` correctly rejected by `m1-v1`'s grammar; the connector, not the policy, was changed to hyphen-join instead, with a resulting theoretical collision risk documented, not resolved). Durable evidence: [docs/audits/m0-synthetic-boundary-audit.md § 21](docs/audits/m0-synthetic-boundary-audit.md).

**Source-loss freshness proof** merged through [PR #91](https://github.com/Jayc92/atlast/pull/91) at `f414047` on 2026-08-20: a real `kind delete cluster --name atlast-m5`; the unrestarted experiment process observed persistent poll failure; provenance froze at 3,707 citations with the identical assertion identifier across reads; freshness transitioned honestly `current` → `stale` → `historical` via the existing pinned-`asOf` contract, with no corruption or phantom replacement. Durable evidence: [audit § 22](docs/audits/m0-synthetic-boundary-audit.md).

**ADR-0018 storage reassessment and ADR-0038 remedy.** The mandatory re-run of ADR-0018's named change conditions against the real M5 workload ([audit § 23](docs/audits/m0-synthetic-boundary-audit.md)) found a `"latest"` current-state read at the real observed cardinality (3,707 provenance citations) measured a **9.27 s median — ADR-0018 condition 2 fired** (conditions 1/3/4 did not). Root-cause analysis identified `m1-v1` reconciliation's repeated full-history rescan/re-sort/re-digest at every corroborating step as the dominant cost, not the storage engine. **[ADR-0038](docs/adr/0038-m5-reconciliation-scaling-remedy.md), accepted 2026-08-21** (merged through [PR #92](https://github.com/Jayc92/atlast/pull/92)/[PR #93](https://github.com/Jayc92/atlast/pull/93)), retained the in-memory `EvidenceStore`/`TopologyGraphStore` architecture and required the algorithmic defect fixed instead, resolved across two separately authorized implementation checkpoints:

- **Complexity Boundary (B)** — a single-slot `ReconciliationResult` cache in `SnapshotResolver` reusing an unchanged-horizon current-state read — merged through [PR #94](https://github.com/Jayc92/atlast/pull/94) (`perf: avoid repeated current-state reconciliation`).
- **Complexity Boundary (A)** — a dedicated, safety-first guarded incremental reconciler (`incremental-reconciliation.ts`) eliminating from-zero reconciliation on safe advancing horizons, with an unconditional fallback to the unmodified pure reference on any uncertainty, proven behavior-preserving by a 10-scenario differential-equivalence harness against the real fixture catalog — merged through [PR #95](https://github.com/Jayc92/atlast/pull/95) (`perf: incrementally reconcile advancing evidence`).

The same n = 3,707 cold read now medians **26.18 ms** (p95 28.14 ms), under this project's established sub-30 ms comfortably-interactive bar; every contractual output invariant matches the unmodified reference exactly across all differential tests and the complete 386/386 `packages/graph-model` regression suite. Memory conclusion is narrowed to the measured workload/session only. **Final ADR-0018 § 4.4 conclusion: (a) in-memory storage remains justified against the completed real M5 workload; no SQLite/PostgreSQL/graph-database migration is required.** ADR-0018 itself is unedited. Durable evidence: [audit §§ 23.5–23.10](docs/audits/m0-synthetic-boundary-audit.md).

**M5 exit-criterion and verification-obligation evaluation (2026-08-24), evaluated directly against the merged repository state:**

| #   | M5 exit criterion                                                                               | Result                        |
| --- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | A change in the local cluster appears in the graph without human action, with evidence attached | **PASS** — audit § 21, PR #89 |
| 2   | Deleting the cluster degrades freshness visibly; established facts age, nothing is corrupted    | **PASS** — audit § 22, PR #91 |
| 3   | With the connector disabled, all M0–M4 synthetic capability is intact                           | **PASS** — audit §§ 21.8/22.8 |

| #   | M5 verification obligation          | Result                                         |
| --- | ----------------------------------- | ---------------------------------------------- |
| 1   | Live post-boot ingestion            | **PASS** — audit § 21.3                        |
| 2   | Real Kubernetes identity case study | **PASS** — audit § 21.7                        |
| 3   | Structural read-only proof          | **PASS** — audit § 21.5                        |
| 4   | Storage decision reassessment       | **PASS** — audit §§ 23.6/23.10, conclusion (a) |

**Checkpoint `m5-complete`: M5 is formally complete as of 2026-08-24.** This closure makes no claim of enterprise-scale performance, production scalability, absence of memory leaks beyond the measured n = 3,707/single-session workload, predictive AI, broader Kubernetes resource coverage, or any post-M5 capability. M5-B (Deployments/Services) and M5-C (a real `watch` stream) were not required for this closure, were not authorized, and remain unimplemented, deferred future-expansion proposals. **This closure authorizes nothing beyond M5; post-M5 work remains gated and unauthorized.**

## 7. Current Git State

At the latest **merged** state on `main` (the Criterion-4 remediation, `docs/audits/m0-synthetic-boundary-audit.md § 29`, is merged through PR #112 at squash commit `de14555` — inspect real Git state rather than trusting a snapshot recorded here):

```text
de14555 fix: make known-zero pilot feedback recordable (#112)
4df8a76 docs: record M6-C pilot evaluation (#111)
13bea35 fix: build workspace during Kubernetes pilot setup (#110)
4a53a09 fix: package fresh-clone Kubernetes pilot (#109)
3f5ed68 docs: close pre-M6-C readiness checkpoint (#108)
2dd7b80 fix: harden Kubernetes pilot readiness (#107)
76d91a5 docs: align project status after M6-B (#106)
6da3376 docs: close M6-B checkpoint (#105)
7ed90f9 feat: validate real Kubernetes topology in Atlast (#104)
fba3978 docs: propose Kubernetes cross-kind source-native identity (ADR-0043) (#103)
6667ad1 docs: align project status after M6-A (#102)
89523d2 docs: close M6-A checkpoint (#101)
2288d65 feat: show real Kubernetes data in normal Atlast (#100)
a54f6a5 docs: propose M6 internal pilot baseline (#98)
0f31cf2 docs: align project status after M5 closeout (#99)
```

Always inspect real Git state before trusting this snapshot.

## 8. Authorized Work

M0 through M5 are complete (§ 6). The M6 baseline is Accepted ([PR #98](https://github.com/Jayc92/atlast/pull/98)) and **M6-A — composition-root unification and the normal-website real-Kubernetes proof — is complete** ([PR #100](https://github.com/Jayc92/atlast/pull/100); § 1, [audit § 24](docs/audits/m0-synthetic-boundary-audit.md)). **M6-B — the Kubernetes topology extension, minimum visual productization, and pilot-feedback artifact — is complete** ([PR #104](https://github.com/Jayc92/atlast/pull/104); § 1, [audit § 25](docs/audits/m0-synthetic-boundary-audit.md)), including the accepted [ADR-0043](docs/adr/0043-m6-kubernetes-cross-kind-source-native-identity.md) cross-kind identity correction ([PR #103](https://github.com/Jayc92/atlast/pull/103)). **Pre-M6-C readiness hardening is complete** ([PR #107](https://github.com/Jayc92/atlast/pull/107); § 1, [audit § 26](docs/audits/m0-synthetic-boundary-audit.md)): the two readiness gates the independent review of M6-B identified — (1) `scripts/connect-kubernetes-pilot.sh`'s Ctrl+C/TERM shutdown not stopping its launched API/web child processes; (2) the pilot-feedback panel discarding unexported session-local judgments if closed before export — both now evaluate **PASS**, proven live. **Two pilot-packaging correction slices are also complete** ([PR #109](https://github.com/Jayc92/atlast/pull/109), [PR #110](https://github.com/Jayc92/atlast/pull/110); [audit § 27](docs/audits/m0-synthetic-boundary-audit.md)), closing fresh-clone onboarding and build-workspace gaps. **M6-C — the deterministic pilot sandbox and real-tester acceptance run — was executed and evaluated, and is merged**: a real, unaided employee pilot session ran on 2026-08-28, before any contemporaneously durable M6-C slice-authorization record existed. That sequencing gap surfaced during formal evaluation of the pilot; on 2026-08-31 the human maintainer explicitly acknowledged/authorized M6-C as a slice for governance purposes — not backdated to 2026-08-28 (exact chronology: [TASKS.md](TASKS.md) § M6-C). The pilot's content was evaluated on its actual merits against the Accepted six exit criteria and merged to `main` through [PR #111](https://github.com/Jayc92/atlast/pull/111) at checkpoint `m6-c-pilot-evaluated` ([audit § 28](docs/audits/m0-synthetic-boundary-audit.md)): **5 PASS, 1 FAIL (criterion 4)**. **This does not complete M6.**

**A bounded Criterion-4 remediation slice** — explicitly authorized by Joseph Carfagno, scoped solely to making the accepted `known-zero` relationship verdict recordable, nothing broader. It is implemented, independently adversarially reviewed, verified, confirmed by real developer/conductor acceptance against a real disposable Kind cluster, and **merged to `main` through [PR #112](https://github.com/Jayc92/atlast/pull/112) at squash commit `de14555`** ([audit § 29](docs/audits/m0-synthetic-boundary-audit.md)). **This remediation does not mark Criterion 4 PASS or M6 complete** — only a subsequent, separately evaluated, targeted independent employee validation can do that; developer/conductor acceptance is not that validation and does not substitute for it, and that validation has not occurred. **Criterion 4 remains FAIL; M6 remains open at 5 of 6 exit criteria.** No other M6-C finding is fixed by this slice, and no further correction, M6-C/M6 work beyond PR #112's own exact scope, or M7 work is authorized. **No implementation slice is currently active.** Maintenance, corrections, and factual checkpoint documentation within the accepted ADRs and without extending product behavior remain permitted, per [CLAUDE.md](CLAUDE.md).

## 9. Prohibited Work

- Any implementation beyond PR #112's own exact bounded scope (making the `known-zero` relationship verdict recordable) — no other M6-C finding, and no broader pilot-feedback change, is authorized.
- Claiming or treating developer/conductor acceptance as a substitute for the targeted independent employee validation Criterion 4 still requires.
- Marking Criterion 4 PASS, or M6 complete, before that targeted independent employee validation occurs and is separately evaluated.
- Any M7, or other post-M6 planning or implementation before separate, explicit authorization.
- Real systems, credentials, employer/customer data, connectors, authentication, deployment, or external publication.
- Product writes or mutation routes.
- Browser imports from fixtures, graph-model, overlay-model, impact-model, repository/storage, or API server modules.
- Accepted ADR edits; amend or supersede through a new ADR.
- Dependency, manifest, lockfile, verification-script, bootstrap-script, or CI changes without justified and reviewed scope.
- Any weakening of verification, failure honesty, Evidence traceability, deterministic behavior, or synthetic-only boundaries.

## 10. Verification and Resume

From the repository root:

```bash
git status
git log --oneline --decorate -10
./scripts/bootstrap.sh
pnpm --filter @atlast/tests-acceptance browser:install
./scripts/verify.sh
```

The checkpoint cycle remains binding:

> human release -> bounded work -> tests/verifier -> independent review -> human QA/approval -> PR/CI -> merge -> post-merge revalidation when required -> HANDOFF update -> next decision

## 11. Open Risks

- Trustworthy graph correctness remains primary; every fact must preserve provenance, confidence, freshness, conflict, ambiguity, and reproducible snapshot identity.
- The lazy graph chunk is approximately 501.71 kB gzip and remains a tracked optimization risk.
- Current catalogs are deliberately small and synthetic; measurements must not be extrapolated to enterprise scale.
- Relationship deep links still rehydrate through bounded identifier search because no relationship-detail route exists by design.
- Overlays must never author topology or create phantom nodes; unknown references remain explicit gaps.
- Same-model coder/reviewer pairing weakens independence; preserve strict independent and human gates.
- M6 exit Criterion 4 currently evaluates FAIL (audit § 28.5, § 28.14: the original pilot found the accepted §10 verdict vocabulary had no way to record a `known-zero` relationship verdict for a zero-match Service). A bounded remediation is implemented, developer-verified, and merged through PR #112 at `de14555` (audit § 29), but not yet validated by a targeted independent employee — Criterion 4 remains FAIL and blocks M6 closeout until that validation occurs and is separately evaluated.
- The pilot found a same-kind identity-collision residual (ADR-0043 § 3, re-confirmed live in audit § 28.9) causes permanent, unflagged provenance fusion, and a deleted-object staleness gap (audit § 28.8) presents removed objects as current with no retraction/tombstone signal — both open, unfixed trust risks.

## 12. Ready-to-Paste Replacement-Conductor Prompt

```text
You are taking over as conductor for Atlast at
/Users/joseph.carfagno/joseph.carfagno/apps/atlast
(GitHub: https://github.com/Jayc92/atlast).

Before acting, read HANDOFF.md, PROJECT_SPEC.md, GUARDRAILS.md, CLAUDE.md,
TASKS.md, docs/architecture.md, docs/milestones.md, docs/m5-plan.md,
docs/m6-plan.md, the ADR index (ADRs 0036-0043), and
docs/audits/m0-synthetic-boundary-audit.md §§ 21-29. Inspect git status and
git log; real Git state overrides stale text. `main` is currently at
`de14555` (fix: make known-zero pilot feedback recordable, #112).

M0 through M5 are complete (checkpoints m4-complete, m5-complete). M6 —
Internal Pilot Validation — has an Accepted baseline (docs/m6-plan.md plus
ADR-0039, ADR-0040, ADR-0041; ADR-0042 Rejected), merged through PR #98 at
a54f6a5 on 2026-08-24. M6-A — composition-root unification and the
normal-website real-Kubernetes proof — was separately authorized (Gate 5 of
the Accepted baseline) and is complete, merged through PR #100 at 2288d65
on 2026-08-25 (audit § 24). M6-B — the Kubernetes topology extension
(Deployments, ReplicaSets, Services, UID-based ownership matching, the
six-state Service-relationship vocabulary), minimum visual productization,
and pilot-feedback artifact — was separately authorized and is now
complete: real Deployments/ReplicaSets/Pods/Services reach the normal
Atlast application's authoritative stores, the normal /api/v1 API, and the
normal Atlast website, with read-only enforcement proven by two real,
live Kubernetes-rejected mutations (audit § 25). During implementation, a
real cross-kind Kubernetes identity-collision defect was found, separately
resolved via Accepted ADR-0043 (PR #103, merged before the corrective
continuation), and implemented. Merged through PR #104 at 7ed90f9 on
2026-08-26, following an independent adversarial review that required two
documentation corrections (a file-count arithmetic error; an incomplete
source-loss transient disclosure) before this checkpoint. Pre-M6-C
readiness hardening — closing the two gates M6-B's review identified
(pilot-script process-tree shutdown; pilot-feedback session-state
preservation on panel close) — was subsequently and separately authorized
as one bounded slice, implemented, independently and adversarially reviewed
(one REQUIRED CHANGE found — an untested session-level Notes UI — and
corrected), and merged through PR #107 at 2dd7b80 on 2026-08-27. Both
readiness gates now evaluate PASS. Two further pilot-packaging correction
slices (fresh-clone onboarding, build-workspace) merged through PR #109 at
4a53a09 and PR #110 at 13bea35 (audit § 27).

A real, unaided internal-employee pilot session was executed 2026-08-28
(session 608f7d89), producing a versioned pilot-feedback artifact per
ADR-0041 — before any contemporaneously durable M6-C slice-authorization
record existed. That sequencing gap was discovered during formal
evaluation of the pilot against the six exit criteria; on 2026-08-31 the
human maintainer explicitly acknowledged/authorized M6-C as a slice for
governance purposes, not backdated to 2026-08-28. The pilot's content was
evaluated on its actual merits against the Accepted six exit criteria and
merged to main through PR #111 at 4df8a76, checkpoint
"m6-c-pilot-evaluated" (TASKS.md; audit § 28): criteria 1, 2, 3, 5, and 6
evaluate PASS; criterion 4 evaluates FAIL, because the accepted verdict
vocabulary had no way to record a `known-zero` relationship verdict for an
observed, deliberately-built known-zero-match Service. M6-C is complete as
an executed, evaluated pilot slice. Neither M6-B's completion, the
readiness closure, the packaging corrections, nor this M6-C evaluation
completes M6: this project has never closed a milestone with a failing
exit criterion, and the Accepted plan has no provision for deferring one.
M6 remains open, blocked specifically on criterion 4.

A bounded Criterion-4 remediation slice was subsequently and separately
authorized, scoped solely to making the `known-zero` relationship verdict
recordable, nothing broader. It is implemented, independently adversarially
reviewed, verified, and confirmed by real developer/conductor acceptance
against a real disposable Kind cluster (audit § 29), and is merged to main
through PR #112 at squash commit de14555. Developer/conductor acceptance
does not substitute for the targeted independent employee validation
Criterion 4's own re-evaluation still requires, and that validation has not
occurred. This remediation does not mark Criterion 4 PASS or M6 complete.
No implementation slice is currently active.

Preserve synthetic-only, query-API-only, Evidence-first, deterministic,
read-only, and fail-honest boundaries. Do not mark criterion 4 PASS, treat
developer testing as independent validation, plan/implement M7, or do any
work beyond this merged remediation's own exact scope, without Joseph
Carfagno's own separate, explicit authorization — this closure grants none.
Begin by reporting your understanding that the Criterion-4 remediation is
merged as PR #112 and confirming M6 is not complete and no M7 work is
authorized.
```
