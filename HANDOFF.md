# Atlast — Handoff and Checkpoint Document

The canonical, model-neutral resume document for Atlast. A replacement conductor, implementation assistant, or human engineer must be able to read this file, follow its pointers, and continue safely without reconstructing history from conversation logs.

## 1. Document Control

- **Last updated:** 2026-08-16
- **Checkpoint name:** `m2-complete`
- **Latest merged checkpoint commit:** `b8cd2ee` (`docs: close M2 interactive topology milestone (#52)`), squash-merged through [PR #52](https://github.com/Jayc92/atlast/pull/52) on 2026-08-16.
- **Verification:** PR #52 GitHub Actions `verify` passed in 3m16s. M2-F's direct post-merge revalidation on `5aeb11d` also passed the complete local verifier and boundary audit. The independently corrected M3 planning candidate passes the unchanged seven-stage local verifier: shared 387/387, graph-model 372/372, API 69/69, web 154/154, and browser acceptance 24/24.
- **Milestone state:** M0, M1, and M2 are formally complete. The first M3 baseline candidate is Proposed, independently reviewed, and corrected; explicit human approval is still pending. M3 product implementation and M4+ remain unauthorized.
- **Branch state while preparing this planning candidate:** `docs/m3-planning`, based on synchronized, clean `main` at `b8cd2ee`.
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
- [docs/m3-plan.md](docs/m3-plan.md): Proposed M3 baseline; not implementation authority.
- [docs/adr/README.md](docs/adr/README.md): Accepted ADRs 0001-0028, Proposed ADRs 0029-0031, and amendment map.
- [docs/audits/m0-synthetic-boundary-audit.md](docs/audits/m0-synthetic-boundary-audit.md): synthetic-boundary history; § 17 is the M2 closure revalidation.
- `fixtures/demo-company`: seven-scenario, 20-Evidence synthetic catalog.
- `packages/shared`: schemas, repository contracts, HTTP contracts, browser health contract, snapshot-anchor contract.
- `packages/graph-model`: temporal foundations, reconciliation, snapshots, and in-memory repositories.
- `apps/api`: loopback-only health endpoint and read-only query API.
- `apps/web`: delivered M2 topology interface.
- `tests/acceptance`: built-preview desktop/mobile acceptance suite.

No credential, token, machine secret, employer data, customer data, or proprietary source may be added.

## 4. Roadmap Position

| Milestone | State                                     | Evidence                                 |
| --------- | ----------------------------------------- | ---------------------------------------- |
| M0        | Complete — 2026-07-22                     | Foundation and closure audit             |
| M1        | Complete — 2026-08-12                     | S1–S8; checkpoint `m1-complete`          |
| M2        | Complete — 2026-08-16                     | M2-A–F; PR #51; checkpoint `m2-complete` |
| M3        | Planning authorized; implementation gated | Architecture/ADR planning only           |
| M4        | Unauthorized                              | No work may begin                        |
| M5        | Unauthorized                              | No work may begin                        |

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
b8cd2ee (HEAD -> main, origin/main, origin/HEAD) docs: close M2 interactive topology milestone (#52)
5aeb11d chore: harden and audit M2 interface (#51)
a7e0f21 docs: close M2 implementation slice E (#50)
```

The M3 planning candidate is prepared and independently corrected on `docs/m3-planning` from clean synchronized `main` at `b8cd2ee`. Always inspect real Git state before trusting this snapshot.

## 7. Authorized Work

**No implementation slice is active.** Permitted work is:

- M3 planning and pre-release architecture/ADR review, including corrections to [docs/m3-plan.md](docs/m3-plan.md) and Proposed ADRs 0029-0031;
- maintenance and factual corrections to completed milestones within Accepted ADRs and explicit scope.

M3 planning may inventory the existing topology/health boundaries, define synthetic overlay semantics, propose architecture and ADRs, define bounded implementation slices, and establish verification and exit criteria. It must not implement product behavior.

M3 product implementation requires all of the following before any code is written:

1. a complete proposed M3 architecture baseline and ADR set;
2. independent architecture review and correction;
3. explicit human approval of that baseline;
4. a separately recorded implementation-slice release;
5. clean synchronized `main` containing the release.

## 8. Prohibited Work

- Any M3 product implementation before the five gates above.
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

M0, M1, and M2 are formally complete. M2-F merged through PR #51 at 5aeb11d
and passed post-merge verifier and boundary revalidation; checkpoint m2-complete
records closure. The first M3 planning candidate is docs/m3-plan.md plus Proposed
ADRs 0029-0031. Independent architecture review and correction are complete, but
the baseline has not been human-approved. M3 product implementation requires
explicit human approval and a separate implementation release. M4+ remain
unauthorized.

Preserve synthetic-only, query-API-only, Evidence-first, deterministic, read-only,
and fail-honest boundaries. Do not write or commission product code until the
human separately releases a bounded M3 implementation slice.

Begin by reporting your understanding of the checkpoint and the bounded M3
planning work now permitted.
```
