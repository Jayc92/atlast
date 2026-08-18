# Atlast - Handoff and Checkpoint Document

The canonical, model-neutral resume document for Atlast. Read this file with the governing documents and inspect real Git state before acting.

## 1. Document Control

- **Last updated:** 2026-08-18
- **Checkpoint name:** `m4-b-impact-api-harness-merged`
- **Latest merged implementation commit:** `b4f6fc4` (`feat: add M4 impact query API and accuracy harness (#75)`), squash-merged through [PR #75](https://github.com/Jayc92/atlast/pull/75) on 2026-08-18.
- **Verification:** the corrected M4-B candidate passed the complete seven-stage verifier: shared 429/429, impact-model 15/15, overlay-model 23/23, graph-model 372/372, API 123/123, web 229/229, and browser acceptance 34/34, plus whitespace, formatting, lint, types, and production builds. PR #75 GitHub Actions `verify` passed in 4m22s.
- **Milestone state:** M0 through M3, M4-A, and M4-B are complete. The M4 baseline remains [docs/m4-plan.md](docs/m4-plan.md) plus ADRs 0032-0035. Joseph Carfagno explicitly authorized **M4-C** on 2026-08-18 within the exact browser impact-panel boundary in [docs/m4-plan.md § 6](docs/m4-plan.md#6-proposed-implementation-slices) and accepted ADR-0034. M4-C becomes operational only after this documentation record merges and local `main` synchronizes cleanly. M4-D through M4-E and M5+ remain unauthorized.
- **Authorization branch:** `docs/m4-b-closeout-m4-c-authorization`, based on synchronized, clean `main` at `b4f6fc4`.
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

| Milestone | State                            | Evidence                                  |
| --------- | -------------------------------- | ----------------------------------------- |
| M0        | Complete - 2026-07-22            | Foundation and closure audit              |
| M1        | Complete - 2026-08-12            | S1-S8; checkpoint `m1-complete`           |
| M2        | Complete - 2026-08-16            | M2-A-F; checkpoint `m2-complete`          |
| M3        | Complete - 2026-08-17            | M3-A-F; PR #68; checkpoint `m3-complete`  |
| M4        | M4-A/B complete; M4-C authorized | PR #75; M4-C gated on this record's merge |
| M5        | Unauthorized                     | No planning or implementation may begin   |

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

## 5. M4-B Closure Evidence

- The read-only impact route, exact closed error mapping, fixture-backed scenario catalog, and exact-match scoring harness merged through PR #75 at `b4f6fc4`.
- Every request performs exactly one bounded traversal and no additional repository read; `changeType` is validated and echoed but never influences ranking.
- Independent review corrected invalid `changeType` handling to ADR-0033's exact `MALFORMED_REQUEST` contract and found no remaining blocker.
- The harness matched 6/6 scripted scenarios exactly, proved three-change-type invariance, and proved a deliberately mutated expected rank fails.
- The complete verifier passed with 123/123 API tests and all existing suites green; GitHub Actions passed in 4m22s. No browser behavior or third-party dependency changed.

## 6. Current Git State

At the M4-B-merged checkpoint before this documentation commit:

```text
b4f6fc4 (HEAD -> main, origin/main, origin/HEAD) feat: add M4 impact query API and accuracy harness (#75)
0688fca docs: close M4-A and authorize M4-B (#74)
9ee21e4 feat: add M4 deterministic impact engine (#73)
5ebbdc4 docs: authorize M4 implementation slice A (#72)
8e93d10 docs: accept M4 architecture baseline (#71)
```

Always inspect real Git state before trusting this snapshot.

## 7. Authorized Work

**M4-C**, after this authorization record merges and local `main` synchronizes cleanly, is the only authorized implementation slice. Its exact boundary is [docs/m4-plan.md § 6](docs/m4-plan.md#6-proposed-implementation-slices), ADR-0034, and [TASKS.md](TASKS.md): add the query-API-only entity-scoped browser impact panel; canonicalize the single `changeType` URL parameter; render server-authoritative ranked results without recomputation; present exact numeric rank with the required trust language and explicit hypothetical change-type label; and provide evidence-path drill-down through the existing trust inspector and Evidence-dereferencing machinery, with directly corresponding `apps/web` tests and factual measurements. No M4-D accessibility/history/failure hardening, browser-acceptance expansion, API/domain/fixture change, or new dependency is authorized.

## 8. Prohibited Work

- Any M4-C work before this authorization record merges and local `main` synchronizes cleanly, or beyond the exact boundary above.
- Any M4-D through M4-E implementation before its own separate release.
- Any M5+ planning or implementation before separate authorization.
- Real systems, credentials, employer/customer data, connectors, authentication, deployment, or external publication.
- Product writes or mutation routes.
- Browser imports from fixtures, graph-model, overlay-model, repository/storage, or API server modules.
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
TASKS.md, docs/architecture.md, docs/milestones.md, docs/m4-plan.md, and the
ADR index (ADRs 0032-0035). Inspect git status and git log; real Git state
overrides stale text.

M0 through M3, M4-A, and M4-B are complete. M4-B was independently reviewed,
fully verified, and merged through PR #75 at b4f6fc4 on 2026-08-18. Checkpoint
m4-b-impact-api-harness-merged is the current boundary. Joseph Carfagno then
explicitly authorized M4-C within the exact docs/m4-plan.md § 6, ADR-0034,
and TASKS.md boundary. That release becomes operational only after its
documentation record merges and local main synchronizes cleanly. M4-D through
M4-E and M5+ are unauthorized.

Preserve synthetic-only, query-API-only, Evidence-first, deterministic,
read-only, and fail-honest boundaries. After verifying the authorization
record is merged and main is synchronized cleanly, implement only M4-C: the
query-API-only entity-scoped impact panel, canonical changeType URL state,
server-authoritative ranked results, precise rank/change-type presentation,
and Evidence-path drill-down through existing trust machinery, with directly
corresponding apps/web tests and factual measurements. Do not add M4-D
accessibility/history/failure hardening, browser-acceptance expansion, a new
dependency, API/domain/fixture changes, accepted-ADR changes, M4-D+, or M5+
work. Begin by reporting your understanding of checkpoint
m4-b-impact-api-harness-merged and the M4-C gate.
```
