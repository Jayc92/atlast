# Atlast - Handoff and Checkpoint Document

The canonical, model-neutral resume document for Atlast. Read this file with the governing documents and inspect real Git state before acting.

## 1. Document Control

- **Last updated:** 2026-08-20
- **Checkpoint name:** `m4-complete`
- **Latest merged implementation commit:** `2901463` (`test: enforce browser impact-model import boundary (#82)`), squash-merged through [PR #82](https://github.com/Jayc92/atlast/pull/82) on 2026-08-19 — the M4-E `packages/impact-model` browser import-enforcement fix; no product behavior changed.
- **Latest merged checkpoint commit:** `f04456a` (`docs: record M4-E audit and factual measurements (#83)`), squash-merged through [PR #83](https://github.com/Jayc92/atlast/pull/83) on 2026-08-20 — the M4-E synthetic-boundary/no-side-door audit and factual bundle/latency/memory/cardinality measurements, recorded in [docs/audits/m0-synthetic-boundary-audit.md § 20](docs/audits/m0-synthetic-boundary-audit.md).
- **Verification:** the M4-D candidate passed the complete seven-stage verifier (shared 429/429, impact-model 15/15, overlay-model 23/23, graph-model 372/372, API 123/123, web 264/264, browser acceptance 46/46) before PR #79 merged; the M4-E enforcement fix (PR #82) and audit/measurement documentation (PR #83) each independently repassed the same complete unmodified verifier before merge, with GitHub Actions `verify` succeeding on both (5m38s and 4m55s respectively) and on the current `main` HEAD.
- **Milestone state:** **M0 through M4 are complete.** The M4 baseline remains [docs/m4-plan.md](docs/m4-plan.md) plus ADRs 0032-0035. M4-E's boundary re-audit, enforcement fix, factual measurements, and exit-criterion evaluation are complete and merged (§ 5 below). **Both M4 exit criteria evaluated PASS. Checkpoint `m4-complete` formally closes M4.** No implementation slice is active. **M5+ remain unauthorized** — this closure grants no successor permission.
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

| Milestone | State                 | Evidence                                 |
| --------- | --------------------- | ---------------------------------------- |
| M0        | Complete - 2026-07-22 | Foundation and closure audit             |
| M1        | Complete - 2026-08-12 | S1-S8; checkpoint `m1-complete`          |
| M2        | Complete - 2026-08-16 | M2-A-F; checkpoint `m2-complete`         |
| M3        | Complete - 2026-08-17 | M3-A-F; PR #68; checkpoint `m3-complete` |
| M4        | Complete - 2026-08-20 | PR #83; checkpoint `m4-complete`         |
| M5        | Unauthorized          | No planning or implementation may begin  |

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

## 6. Current Git State

At the M4-complete checkpoint (this closure commit is the next commit on top of this state):

```text
f04456a (HEAD -> main, origin/main, origin/HEAD) docs: record M4-E audit and factual measurements (#83)
2901463 test: enforce browser impact-model import boundary (#82)
8ba81d3 docs: authorize M4-E boundary re-audit and closeout (#81)
a726caf docs: close M4 implementation slice D (#80)
e5d4a2c fix: harden M4 impact analysis accessibility (#79)
```

Always inspect real Git state before trusting this snapshot.

## 7. Authorized Work

**No implementation slice is currently active.** M0 through M4 are complete. Any future work requires its own separate, explicit human authorization, exactly as every prior milestone slice required — most immediately, M5 (the read-only local Kubernetes connector), which remains gated pending that authorization. Maintenance, corrections, and factual checkpoint documentation within the accepted ADRs and without extending product behavior remain permitted, per [CLAUDE.md](CLAUDE.md).

## 8. Prohibited Work

- Any M5+ planning or implementation before separate, explicit authorization.
- Real systems, credentials, employer/customer data, connectors, authentication, deployment, or external publication.
- Product writes or mutation routes.
- Browser imports from fixtures, graph-model, overlay-model, impact-model, repository/storage, or API server modules.
- Accepted ADR edits; amend or supersede through a new ADR.
- Dependency, manifest, lockfile, verification-script, bootstrap-script, or CI changes without justified and reviewed scope.
- Any weakening of verification, failure honesty, Evidence traceability, deterministic behavior, or synthetic-only boundaries.

## 9. Verification and Resume

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

## 10. Open Risks

- Trustworthy graph correctness remains primary; every fact must preserve provenance, confidence, freshness, conflict, ambiguity, and reproducible snapshot identity.
- The lazy graph chunk is approximately 501.71 kB gzip and remains a tracked optimization risk.
- Current catalogs are deliberately small and synthetic; measurements must not be extrapolated to enterprise scale.
- Relationship deep links still rehydrate through bounded identifier search because no relationship-detail route exists by design.
- Overlays must never author topology or create phantom nodes; unknown references remain explicit gaps.
- Same-model coder/reviewer pairing weakens independence; preserve strict independent and human gates.

## 11. Ready-to-Paste Replacement-Conductor Prompt

```text
You are taking over as conductor for Atlast at
/Users/joseph.carfagno/joseph.carfagno/apps/atlast
(GitHub: https://github.com/Jayc92/atlast).

Before acting, read HANDOFF.md, PROJECT_SPEC.md, GUARDRAILS.md, CLAUDE.md,
TASKS.md, docs/architecture.md, docs/milestones.md, docs/m4-plan.md,
docs/audits/m0-synthetic-boundary-audit.md § 20, and the ADR index (ADRs
0032-0035). Inspect git status and git log; real Git state overrides stale
text.

M0 through M4 are complete. M4-E's boundary re-audit and impact-model
import-enforcement fix merged through PR #82 at 2901463 on 2026-08-19; its
audit and factual measurement documentation merged through PR #83 at
f04456a on 2026-08-20. Both M4 exit criteria were evaluated directly against
the merged repository state and classified PASS. Checkpoint m4-complete
formally closes M4. No implementation slice is currently active.

Preserve synthetic-only, query-API-only, Evidence-first, deterministic,
read-only, and fail-honest boundaries. Do not plan or implement M5 or any
later milestone work without Joseph Carfagno's own separate, explicit
authorization — this closure grants none. Begin by reporting your
understanding of checkpoint m4-complete and confirming no successor
milestone is authorized.
```
