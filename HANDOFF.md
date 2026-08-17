# Atlast — Handoff and Checkpoint Document

The canonical, model-neutral resume document for Atlast. A replacement conductor, implementation assistant, or human engineer must be able to read this file, follow its pointers, and continue safely without reconstructing history from conversation logs.

## 1. Document Control

- **Last updated:** 2026-08-17
- **Checkpoint name:** `m3-e-accessibility-hardening-merged`
- **Latest merged implementation commit:** `9b4343e` (`test: harden M3 health overlay acceptance (#66)`), squash-merged through [PR #66](https://github.com/Jayc92/atlast/pull/66) on 2026-08-17.
- **Verification:** PR #66 GitHub Actions `verify` passed in 4m28s. The complete seven-stage local verifier passed: shared 419/419, overlay-model 22/22, graph-model 372/372, API 88/88, web 227/227, production builds, and browser acceptance 34/34. Product bundles were unchanged, and Joseph Carfagno explicitly approved human browser and VoiceOver QA.
- **Milestone state:** M0, M1, and M2 are formally complete. M3-A through M3-E are complete. Joseph Carfagno explicitly authorized M3-F only on 2026-08-17; activation requires the combined M3-E closeout/M3-F authorization record to merge and local `main` to synchronize cleanly. M4+ remain unauthorized.
- **Branch state while recording M3-E closeout and M3-F authorization:** `docs/m3-e-closeout-m3-f-authorization`, based on synchronized, clean `main` at `9b4343e`.
- **Version history:** this file is updated in place at every checkpoint; Git history preserves prior versions.
- **Precedence:** [PROJECT_SPEC.md](PROJECT_SPEC.md), [GUARDRAILS.md](GUARDRAILS.md), [docs/milestones.md](docs/milestones.md), approved implementation plans, Accepted ADRs, [TASKS.md](TASKS.md), and [CLAUDE.md](CLAUDE.md) override this summary wherever they conflict.

## 2. Product Summary

Atlast is an AI-powered Engineering Topology Platform: continuous system discovery, a living versioned dependency graph, operational health overlays, and deterministic change-impact analysis.

The user problem is the loss of fast, trustworthy answers to three questions: what do we run, what depends on what, and what breaks if this changes? Atlast's answer is evidence-first: every displayed fact carries provenance, confidence, freshness, conflict/ambiguity state, and reproducible snapshot identity.

Binding principles:

1. Evidence-first: no graph fact without dereferenceable Evidence.
2. Query-API-only consumption: consumers never read fixtures, repositories, graph-model internals, or storage directly.
3. Deterministic before AI: deterministic engines are complete and validated before any LLM reasoning.
4. Read-only toward observed systems, permanently.
5. Synthetic-first through M4; M5 is the first possible real-system contact and only with a disposable local cluster.
6. Fail honestly: unavailable, stale, conflicting, ambiguous, invalid, or truncated state remains visible.

## 3. Source Locations

- **Repository:** `/Users/joseph.carfagno/joseph.carfagno/apps/atlast`
- **GitHub:** <https://github.com/Jayc92/atlast>
- [README.md](README.md): entry point and verification commands.
- [PROJECT_SPEC.md](PROJECT_SPEC.md): approved vision, principles, scope, and non-goals.
- [GUARDRAILS.md](GUARDRAILS.md): binding engineering standards.
- [CLAUDE.md](CLAUDE.md): AI-assistant instructions and authorization boundaries.
- [TASKS.md](TASKS.md): the only in-flight work ledger.
- [docs/architecture.md](docs/architecture.md): architecture philosophy.
- [docs/milestones.md](docs/milestones.md): M0–M5 sequence and exit criteria.
- [docs/m1-plan.md](docs/m1-plan.md): completed M1 baseline.
- [docs/m2-plan.md](docs/m2-plan.md): completed M2 baseline and slice record.
- [docs/m3-plan.md](docs/m3-plan.md): approved M3 implementation baseline and exact slice boundaries; M3-A through M3-E are complete and M3-F is separately authorized pending activation.
- [docs/adr/README.md](docs/adr/README.md): Accepted ADRs 0001-0031 and amendment map.
- [docs/audits/m0-synthetic-boundary-audit.md](docs/audits/m0-synthetic-boundary-audit.md): synthetic-boundary history; § 17 is the M2 closure revalidation.
- `fixtures/demo-company`: seven-scenario, 20-Evidence synthetic catalog.
- `packages/shared`: schemas, repository contracts, HTTP contracts, browser health contract, snapshot-anchor contract, and M3 overlay/health-context contracts.
- `packages/graph-model`: temporal foundations, reconciliation, snapshots, and in-memory repositories.
- `apps/api`: loopback-only health endpoint and read-only query API.
- `apps/web`: delivered M2 topology interface.
- `tests/acceptance`: built-preview desktop/mobile acceptance suite.

No credential, token, machine secret, employer data, customer data, or proprietary source may be added.

## 4. Roadmap Position

| Milestone | State                              | Evidence                                         |
| --------- | ---------------------------------- | ------------------------------------------------ |
| M0        | Complete — 2026-07-22              | Foundation and closure audit                     |
| M1        | Complete — 2026-08-12              | S1–S8; checkpoint `m1-complete`                  |
| M2        | Complete — 2026-08-16              | M2-A–F; PR #51; checkpoint `m2-complete`         |
| M3        | M3-F authorized pending activation | M3-E merged through PR #66; bounded M3-F release |
| M4        | Unauthorized                       | No work may begin                                |
| M5        | Unauthorized                       | No work may begin                                |

M1 delivered the synthetic topology model and read-only query API. M2 separately delivered the browser interface, one bounded slice at a time:

| Slice | Delivered capability                                                                               | Merge            |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------- |
| M2-A  | Validated browser client/cache/coordinator, complete-pin URL state, router/proxy/import boundaries | PR #36 `fa38812` |
| M2-B  | Topology shell, inventory, identifier search, Entity detail, honest UI states                      | PR #39 `9dd507b` |
| M2-C  | Bounded traversal, deterministic projection/ELK layout, graph and structured views                 | PR #42 `a43b0c5` |
| M2-D  | Entity/Relationship trust inspector and direct Evidence dereferencing                              | PR #45 `a41d799` |
| M2-E  | Bounded snapshot-anchor API and complete-pin history playback                                      | PR #49 `62eb684` |
| M2-F  | Acceptance expansion, accessibility hardening, storage review, final audit                         | PR #51 `5aeb11d` |

Both M2 exit criteria are closed:

- Users can navigate/search the topology and inspect Evidence behind edges entirely in the UI.
- The browser reads graph facts exclusively through the query API; the lint boundary and audit prove there is no side door.

## 5. M2-F Closure Evidence

- Exact merged scope: seven approved files only, recorded in audit § 17.
- Human QA passed keyboard graph-node/edge focus and activation, keyboard-only trust inspection with focus return, reduced-motion behavior, offline failure plus successful retry, responsive behavior, and VoiceOver named-dialog announcement.
- ADR-0018 review outcome: **retain the accepted in-memory implementation for the measured M2 workload**. No change condition was triggered and no migration ADR is warranted.
- Source hygiene: zero literal NUL bytes across all 238 tracked files.
- Query API remains read-only and loopback-only. Fixtures, domain/storage behavior, accepted ADRs, dependencies, scripts, and CI were unchanged by M2-F.
- Post-merge verifier on `5aeb11d`: shared 387/387, graph-model 372/372, API 69/69, web 154/154, browser acceptance 24/24, plus formatting, lint, typecheck, builds, and whitespace checks.
- Final bundle record: eager JS 416.01 kB / 125.41 kB gzip; eager CSS 16.11 kB / 3.77 kB gzip; lazy graph JS 1,615.25 kB / 501.57 kB gzip; lazy graph CSS 15.41 kB / 2.56 kB gzip. The lazy graph payload remains a tracked risk for later optimization, not an M2 blocker.

## 6. Current Git State

At the product checkpoint before this documentation commit:

```text
9b4343e (HEAD -> main, origin/main, origin/HEAD) test: harden M3 health overlay acceptance (#66)
ce6c146 docs: close M3-D and authorize M3-E (#65)
a2c2d92 feat: add M3 operational health overlay UI (#64)
3b55c05 docs: authorize M3 implementation slice D (#63)
5f2d038 docs: close M3 implementation slice C (#62)
```

M3-E merged through PR #66 at `9b4343e`, and local `main` was synchronized cleanly. Joseph Carfagno then explicitly authorized M3-F only on 2026-08-17. Always inspect real Git state before trusting this snapshot.

## 7. Authorized Work

**M3-F is the only authorized implementation slice, pending activation.** After the combined M3-E closeout/M3-F authorization record merges and local `main` is synchronized cleanly, permitted work is strictly limited to:

- re-running the synthetic-boundary and no-side-door audits;
- proving overlay removal loses no topology;
- recording bundle, latency, memory, frame, gap, and result cardinalities;
- correcting factual documentation and closing M3 only after the bounded work merges and post-merge verification passes.

No new product behavior, data source, API behavior, fixture, schema, dependency, overlay-model behavior, topology mutation, or M4+ work is authorized.

## 8. Prohibited Work

- Any M3-F implementation before the combined closeout/authorization record merges and local `main` is synchronized cleanly.
- Any M4+ planning or implementation before separate authorization.
- Real systems, credentials, employer/customer data, connectors, authentication, deployment, or external publication.
- Product writes or mutation routes.
- Browser imports from fixtures, graph-model, repository/storage, or API server modules.
- Accepted ADR edits; amend or supersede through a new ADR.
- Dependency, manifest, lockfile, verification-script, bootstrap-script, or CI changes without their own justified and reviewed scope.
- Any weakening of `scripts/verify.sh`, failure honesty, Evidence traceability, deterministic behavior, or synthetic-only boundaries.

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

> human release → bounded work → tests/verifier → independent review → human QA/approval → PR/CI → merge → post-merge revalidation when required → HANDOFF update → next decision

No milestone or slice closes merely because implementation exists. The merged commit, clean synchronized `main`, verification evidence, checkpoint update, and explicit human release are all required.

## 10. Open Risks

- Trustworthy graph correctness remains the primary product risk; every fact must preserve provenance, confidence, freshness, conflict, ambiguity, and reproducible snapshot identity.
- The lazy graph chunk is approximately 501.57 kB gzip. It is intentionally lazy and passed M2 review, but future planning should continue to measure it.
- The synthetic catalog is deliberately small. Future planning must not extrapolate current latency/cardinality measurements to enterprise scale without new evidence.
- Relationship deep links still rehydrate through bounded identifier search because no relationship-detail route exists by design.
- M3 overlays must never author topology or create phantom nodes; unknown references must surface as gaps.
- Same-model coder/reviewer pairing weakens independence; preserve a strict human review gate.

## 11. Ready-to-Paste Replacement-Conductor Prompt

```text
You are taking over as the conductor for Atlast at
/Users/joseph.carfagno/joseph.carfagno/apps/atlast
(GitHub: https://github.com/Jayc92/atlast).

Before acting, read HANDOFF.md, PROJECT_SPEC.md, GUARDRAILS.md, CLAUDE.md,
TASKS.md, docs/architecture.md, docs/milestones.md, docs/m3-plan.md, and the
ADR index. Inspect git status and git log; real Git state overrides stale text.

M0, M1, and M2 are formally complete. The accepted M3 baseline merged through
PR #53 at b85be38. M3-A closed through PR #56 at a767c93, M3-B closed through
PR #59 at b932539, M3-C closed through PR #62 at 5f2d038, M3-D merged through
PR #64 at a2c2d92, and M3-E merged through PR #66 at 9b4343e after independent
review, complete verification, and explicit human browser and VoiceOver QA
approval. Checkpoint m3-e-accessibility-hardening-merged records the complete
built-preview coverage for all six health states, gaps, historical frames,
retry, keyboard operation, structured equivalence, reduced motion, zoom/reflow,
and non-color semantics. Joseph Carfagno explicitly authorized M3-F only on
2026-08-17. Its activation requires the combined closeout/authorization record
to merge and local main to synchronize cleanly. M4+ remain unauthorized.

Preserve synthetic-only, query-API-only, Evidence-first, deterministic, read-only,
and fail-honest boundaries. M3-F is audit-and-closeout-only: re-run the
synthetic-boundary and no-side-door audits; prove overlay removal loses no
topology; record bundle, latency, memory, frame, gap, and result cardinalities;
and correct factual documentation. Do not add product behavior, API behavior,
data sources, fixtures, schemas, dependencies, overlay-model behavior, topology
mutations, or M4+ work.

Begin by reporting your understanding of checkpoint
m3-e-accessibility-hardening-merged and the M3-F activation preconditions.
```
