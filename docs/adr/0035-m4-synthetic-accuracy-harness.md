# ADR-0035: M4 Synthetic Scenario Accuracy Harness

**Status:** Accepted
**Date:** 2026-08-17

> **Approval note (2026-08-17):** Drafted under Joseph Carfagno's 2026-08-17 authorization of M4 planning and pre-release architecture/ADR review only ([TASKS.md](../../TASKS.md), [HANDOFF.md](../../HANDOFF.md)), depending on [ADR-0032](0032-m4-change-impact-domain-model.md), independently reviewed and corrected, then **explicitly accepted by Joseph Carfagno on 2026-08-17** as part of the M4 implementation baseline alongside [docs/m4-plan.md](../m4-plan.md) and ADRs 0032–0034. Acceptance becomes operational only after this record merges to `main` and local `main` is synchronized cleanly. Acceptance does not release M4-A/M4-B and does not authorize M5+.

## Context

[docs/milestones.md](../milestones.md) sets a hard M4 exit criterion: "The synthetic scenario harness runs in CI and scores impact quality automatically." [docs/architecture.md § 7](../architecture.md#7-open-questions) has carried an open question since M0: "How is prediction accuracy measured before real incident data accumulates? (Candidate: retrospective replay against historical incidents in fixtures.)," assigned to the M4 planning ADR as its decision gate. This ADR is that decision.

ADR-0032 defines a **deterministic** engine, not a probabilistic or ML predictor. This matters directly to what "accuracy" can mean here: a deterministic function is either correct against its own specification or it is defective — there is no calibration curve, confusion matrix, or sampling error to characterize, because there is no model uncertainty to characterize. No real incident data exists or will exist through M5 (M5's only real-system contact is a disposable local Kubernetes cluster with no incident history); "retrospective replay against historical incidents" is therefore necessarily replay against **hand-authored synthetic scenarios standing in for incidents**, exactly as the M1 fixture catalog's scenarios stand in for real corroboration/conflict/staleness cases a real deployment would eventually produce.

## Decision

### 1. Measure correctness against hand-authored ground truth, not a statistical score

The M4 accuracy harness is a **regression suite**, not a statistical accuracy measurement. For each scripted scenario, a human author reasons by hand over the existing `demo-company` topology fixtures (read-only; no new Evidence, no modification of the M1 catalog) and records the exact expected `ImpactResult` set ADR-0032/0033 define: entity identifiers, rank scores, path edge counts, and evidence paths, in their expected final order. The harness runs the real deterministic engine against the real fixture-backed repositories at a fixed pinned identity and asserts the actual output is **exactly** equal to the scripted expectation — the same "byte-identical replay" discipline this repository already applies to canonical serialization (ADR-0021), reconciliation (ADR-0022), and snapshot construction (ADR-0023).

The harness reports a plain pass/total count (for example, "12/12 scripted scenarios matched exactly") as its visible measurement, recorded in `TASKS.md` alongside every other M4 measurement — never a fuzzy percentage, precision/recall score, or confidence interval. Framing this as a statistical "accuracy" score would misstate what is being tested: it would imply the ground truth itself might be probabilistically uncertain, which is not the model this deterministic baseline operates under. This resolves docs/architecture.md § 7's open question for the M4 gate: accuracy is measured by exact-match scripted-scenario replay against synthetic fixtures, not by any statistical technique.

This measurement proves the engine matches its own specification correctly, on the topologies available to it. It does **not** and cannot prove real-world predictive accuracy — no real incidents exist to validate against before M5, and M5 introduces no incident history either. [PROJECT_SPEC.md § 2.3](../../PROJECT_SPEC.md#23-success-criteria-long-term)'s "prediction value" success criterion remains explicitly open beyond this ADR's scope, to be revisited only once real incident data exists (post-M5, unscheduled).

### 2. A new, separate, read-only scenario catalog

A new fixture subdirectory, `fixtures/demo-company/impact-scenarios/`, holds the scripted catalog — mirroring the precedent ADR-0029 § 1 already set by keeping `fixtures/demo-company/overlays/` separate from the M1 Evidence catalog, because these scenarios are test expectations about the engine, not Evidence and not inputs to reconciliation. Each scenario file declares, at minimum:

- the origin Entity identifier;
- `changeType`, `direction`, `depth`, and `minimumConfidence`;
- the complete `(asOf, horizon, derivationVersion)` pin the scenario is authored against;
- the expected ordered `ImpactResult` set, in full (entity identifiers, rank scores, path edge counts, and complete evidence paths).

This catalog is created during M4-B implementation, not by this planning baseline — this ADR fixes its location, shape, and scoring discipline only; it creates no fixture file itself, consistent with the M4-planning boundary's prohibition on fixture changes. The direct engine contract suite is created with the M4-A engine.

### 3. Separate fixture-backed accuracy scenarios from exhaustive engine contracts

The existing 20-record `demo-company` Evidence catalog is deliberately small. It does not contain a 500-subject traversal or a simultaneous multi-path diamond, and this ADR does not authorize manufacturing topology Evidence merely to make those shapes appear. Verification therefore has two complementary layers with different claims:

The fixture-backed accuracy catalog must include, at minimum:

- one three-scenario invariance group with the same origin, bounds, and pin and with only `changeType` varied across `removal`, `degradation`, and `interface-change`; all three record the identical expected ranked results and paths;
- at least one nonempty multi-hop scenario available in the existing retained topology;
- at least one zero-impact scenario, proving an empty ranked list is a correctly scripted, non-error outcome;
- at least one confidence-floor exclusion scenario, proving a real but weakly evidenced path is correctly excluded at the scripted `minimumConfidence`;
- at least one historical pin whose expected result differs from the latest retained topology, proving scenario replay is temporally bound rather than accidentally latest-only.

The `packages/impact-model` engine contract suite separately supplies hand-authored, deeply immutable `TraversalResult` inputs for shapes the retained fixture does not contain: multiple candidate paths, every widest-path tie-break stage, cycles, upstream and downstream path ordering, and `traversal.truncated: true`. These are deterministic unit/contract inputs, not Evidence, repository fixtures, or additions to the M1 catalog. They prove the engine's complete policy; the fixture-backed catalog proves exact end-to-end replay over the real retained synthetic topology. Neither layer may claim coverage supplied only by the other.

### 4. No new script, no new CI stage

The harness is a colocated Vitest suite (location decided at implementation time, in `packages/impact-model` or `apps/api` depending on where the scripted-scenario loader naturally sits relative to the engine and the repository fixtures), executed by the existing, unmodified `pnpm test` and therefore by the existing, unmodified `scripts/verify.sh` — satisfying the milestone's "runs in CI" criterion without adding a script, a CI stage, or any change to the protected verification contract (ADR-0013). This mirrors exactly how the M1 contract-test suite, the M2 storage-forcing-point measurements, and the M3 six-state coverage tests all run today: as ordinary colocated tests inside the one existing verifier.

### 5. Determinism discipline carries over unchanged

Scenario authoring and scoring follow the same determinism rules as every other suite in this repository: no scenario or scoring step reads wall-clock time or randomness; every scenario pins its complete `(asOf, horizon, derivationVersion)` identity explicitly; a scenario's expected result is recorded once by hand and never regenerated by running the engine and copying its output, which would make the harness circular and unable to catch a regression in the engine it is meant to check.

## Consequences

- The M4 exit criterion ("the synthetic scenario harness runs in CI and scores impact quality automatically") is satisfied by ordinary, already-established repository testing mechanics — no new tooling, dependency, or script is introduced.
- "Accuracy" in every M4 artifact (this ADR, docs/m4-plan.md, TASKS.md) means exact-match scenario-regression correctness, not statistical prediction quality; documentation must use this vocabulary precisely to avoid overstating what the harness proves.
- Authoring the scripted catalog by hand is itself a form of independent review of the engine's expected behavior and must be done by reasoning about the fixtures directly, not by trusting the engine's own output — this makes catalog authorship slower than generating it, deliberately.
- docs/architecture.md § 7's M4 open question can be marked Resolved only once this ADR (or its accepted successor) is itself Accepted — this document does not edit architecture.md, consistent with this project's established convention of marking a question Resolved only after its deciding ADR is Accepted, not while Proposed.

## Alternatives Rejected

- **A statistical accuracy/precision/recall score:** would misrepresent a deterministic function's correctness as if it had calibration uncertainty; rejected (§ 1).
- **Property-based random scenario generation:** randomness in test scenarios conflicts with this repository's standing determinism-for-tests rule ("no test depends on wall-clock time, network, ordering luck, or randomness," GUARDRAILS.md § 5) and would make a failing scenario non-reproducible; rejected.
- **Generate expected results by running the engine once and snapshotting its output:** circular — it would validate that the engine agrees with itself, not that it is correct, and could not catch a regression introduced before the first snapshot was taken; rejected.
- **Wait for real incident data before measuring anything:** contradicts the explicit M4 exit criterion, which requires the harness to exist and run in CI now, using synthetic scenarios as PROJECT_SPEC § 8's registered mitigation ("accuracy measured against synthetic fixtures from M1") already anticipates.
- **A new dedicated CI stage or script for the harness:** unnecessary and would weaken ADR-0013's "CI runs exactly `scripts/verify.sh`" philosophy for no benefit, since the harness is an ordinary Vitest suite like any other.

## Verification Obligations

- Every scripted scenario in the catalog passes exact-match verification against the real engine and real fixture-backed repositories.
- Every fixture-backed coverage class in § 3 is present, including one three-change-type invariance group whose expected ranked results are identical.
- The separate engine contract suite covers multi-path selection, all tie-break stages, cycles, both directions, and truncation using hand-authored immutable `TraversalResult` values without changing the Evidence catalog.
- A scenario whose recorded expectation is deliberately mutated to a wrong value causes the corresponding test to fail — proving the harness can actually detect a regression, not merely pass vacuously.
- The harness runs under the unmodified `scripts/verify.sh` with no new script or CI stage.
- Catalog schema-rejection tests (malformed scenario shape, missing pin components, unknown `changeType`) analogous to the M1/M3 fixture-catalog rejection tests.

## Change Conditions

Revisit before: any real incident data becomes available (post-M5, unscheduled) — at that point, a genuinely statistical accuracy measurement against real outcomes becomes possible and would need its own ADR; any ML- or LLM-based prediction layer, which would need its own, different accuracy methodology entirely; or any change to the scenario catalog's minimum coverage requirements.

This Accepted ADR does not authorize implementation. M4-A/M4-B (§ [docs/m4-plan.md](../m4-plan.md)) require their own separate, explicit implementation release.
