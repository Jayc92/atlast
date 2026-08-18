# Atlast - Handoff and Checkpoint Document

The canonical, model-neutral resume document for Atlast. Read this file with the governing documents and inspect real Git state before acting.

## 1. Document Control

- **Last updated:** 2026-08-17
- **Checkpoint name:** `m4-a-authorized`
- **Latest merged implementation commit:** `6103ced` (`chore: complete M3 hardening audit (#68)`), squash-merged through [PR #68](https://github.com/Jayc92/atlast/pull/68) on 2026-08-17. M4-A is authorized but not yet implemented, so this remains the latest merged _product-implementation_ commit; the M4 baseline acceptance (PR #71) is a documentation-only commit.
- **Verification:** PR #68 GitHub Actions `verify` passed in 3m56s. The complete seven-stage verifier passed again on the real merge commit: shared 420/420, overlay-model 23/23, graph-model 372/372, API 89/89, web 229/229, browser acceptance 34/34, plus whitespace, formatting, lint, types, and production builds. PR #71 (M4 baseline acceptance, documentation-only) separately passed GitHub Actions `verify`.
- **Milestone state:** M0 through M3 are formally complete. The M4 implementation baseline — [docs/m4-plan.md](docs/m4-plan.md) and ADRs 0032–0035 — was independently reviewed, corrected, and explicitly accepted by Joseph Carfagno; the acceptance record merged through [PR #71](https://github.com/Jayc92/atlast/pull/71) at `8e93d10` on 2026-08-17. Joseph then explicitly authorized **M4-A** as the only active implementation slice, within the exact boundary [docs/m4-plan.md § 6](docs/m4-plan.md#6-proposed-implementation-slices) and [TASKS.md](TASKS.md) state. M4-A is not yet implemented. M4-B through M4-E and M5+ remain unauthorized.
- **Authorization branch:** `docs/m4-a-authorization`, based on synchronized, clean `main` at `8e93d10`.
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
- [docs/m3-plan.md](docs/m3-plan.md): completed M3 baseline and slice record.
- [docs/adr/README.md](docs/adr/README.md): Accepted ADRs 0001-0031 and amendment map.
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

| Milestone | State                              | Evidence                                 |
| --------- | ---------------------------------- | ---------------------------------------- |
| M0        | Complete - 2026-07-22              | Foundation and closure audit             |
| M1        | Complete - 2026-08-12              | S1-S8; checkpoint `m1-complete`          |
| M2        | Complete - 2026-08-16              | M2-A-F; checkpoint `m2-complete`         |
| M3        | Complete - 2026-08-17              | M3-A-F; PR #68; checkpoint `m3-complete` |
| M4        | Baseline accepted; M4-A authorized | M4-A not yet implemented; M4-B+ gated    |
| M5        | Unauthorized                       | No planning or implementation may begin  |

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

## 5. M3-F Closure Evidence

- Exact merged scope: eight approved files, independently re-derived from `71f0e7e..6103ced` and recorded in audit §19.
- Browser no-side-door enforcement now rejects direct and deep overlay-model imports.
- Empty immutable overlay collections are accepted while individual frames remain strictly validated and nonempty.
- `/health` and topology routes remain operational without overlay data; health-context returns its existing typed closed error.
- Zero literal NUL bytes across all 273 tracked files.
- M1 Evidence fixtures, overlay fixtures, dependencies, topology semantics, scripts, and CI were unchanged.
- Final bundle record: eager JS 431.78 kB / 129.12 kB gzip; eager CSS 18.06 kB / 4.08 kB gzip; lazy graph JS 1,615.56 kB / 501.71 kB gzip.
- Joseph Carfagno explicitly approved the remediated candidate and audit for publication before merge.

## 6. Current Git State

At the M4-A-authorization checkpoint before this documentation commit:

```text
8e93d10 (HEAD -> main, origin/main, origin/HEAD) docs: accept M4 architecture baseline (#71)
ba87a29 docs: authorize M4 planning phase (#70)
539860d docs: close M3 operational health milestone (#69)
6103ced chore: complete M3 hardening audit (#68)
71f0e7e docs: close M3-E and authorize M3-F (#67)
```

Always inspect real Git state before trusting this snapshot.

## 7. Authorized Work

**M4-A** is the only active authorized implementation slice, within the exact boundary [docs/m4-plan.md § 6](docs/m4-plan.md#6-proposed-implementation-slices) and [TASKS.md](TASKS.md) state: additive `packages/shared` impact contracts (`impactChangeTypeSchema`, `ImpactPathStep`, `ImpactResult`, the impact-query HTTP envelope per ADR-0033 § 2); the new workspace package `packages/impact-model` implementing the pure deterministic engine per ADR-0032 §§ 3–4 (eligible-edge qualification, the two-phase widest-path/maximin search and its exact tie-break chain, upstream/downstream path orientation, rank-score/ordering), depending only on `@atlast/shared`, with its manifest/tsconfig/build plumbing and the resulting deterministic `pnpm-lock.yaml` importer-block change; focused unit tests; and the ADR-0035 § 3 engine contract-test suite (hand-authored immutable `TraversalResult` vectors, no new Evidence or fixture). No `apps/api` route, fixture catalog, `apps/web` change, or new third-party dependency is authorized.

## 8. Prohibited Work

- Any M4-A implementation beyond the exact boundary above.
- Any M4-B through M4-E implementation before M4-A's implementation is independently reviewed, verified, merged, and M4-B is separately released.
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

M0 through M3 are formally complete. The M4 implementation baseline
(docs/m4-plan.md, ADRs 0032-0035) was independently reviewed, corrected, and
explicitly accepted by Joseph Carfagno, merging through PR #71 at 8e93d10 on
2026-08-17. Joseph then explicitly authorized M4-A as the only active
implementation slice, within the exact boundary docs/m4-plan.md § 6 and
TASKS.md state. Checkpoint m4-a-authorized is the current boundary. M4-A is
not yet implemented. M4-B through M4-E and M5+ are unauthorized.

Preserve synthetic-only, query-API-only, Evidence-first, deterministic,
read-only, and fail-honest boundaries. Implement only the exact M4-A boundary:
additive packages/shared impact contracts, the new packages/impact-model pure
engine, its unit tests, and the ADR-0035 engine contract-test suite. Do not
add an apps/api route, a fixture catalog, or any apps/web change — those are
M4-B+. Do not plan or implement M5+. Begin by reporting your understanding of
checkpoint m4-a-authorized.
```
