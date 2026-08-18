# Fixture: demo-company impact-scenarios

The M4-B hand-authored accuracy-harness scenario catalog (ADR-0035). Every scenario is a scripted test expectation about the deterministic `packages/impact-model` engine composed with the real `demo-company` topology — not Evidence, and not an input to reconciliation. No file here is loaded by the reconciliation engine or the production API; only the test-only loader in `apps/api/src/test-support/impact-scenario-catalog.ts` reads this directory.

## Catalog contract

[`catalog.json`](catalog.json) lists every valid scenario (`scenarios/`) and every deliberately invalid scenario (`invalid/`) by id and file path. Each valid scenario declares, per ADR-0035 § 2: the origin Entity identifier, `changeType`/`direction`/`depth`/`minimumConfidence`, the complete `(asOf, horizon, derivationVersion)` pin it is authored against, and the complete expected ordered `ImpactResult` set. Every expected result was derived by hand from the real reconciled topology (inspected via `TopologyGraphStore.traverse`, never by running the impact engine itself and copying its output) and the `m1-v1` confidence formula (`base + span × (1 − 2^−(s−1))`, ADR-0022 § 1) — never regenerated from the engine's own output (ADR-0035 § 5).

## Coverage (ADR-0035 § 3)

| Requirement                                          | Scenario(s)                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Three-changeType invariance group, identical results | `01`/`02`/`03` — origin `web`, downstream depth 3, full-catalog pin               |
| Nonempty multi-hop scenario                          | `01`/`02`/`03` (web → api → worker → archive, 1/2/3-edge results)                 |
| Zero-impact scenario                                 | `04` (`orders`, no Relationship evidence at all)                                  |
| Confidence-floor exclusion scenario                  | `05` (`checkout` → `fulfillment`, confidence exactly 0.5, floor 0.6 excludes it)  |
| Historical pin differing from the latest topology    | `06` (`web`, pinned to scenario 7's stage-1 `asOfSeed`, 2026-04-01T12:00:00.000Z) |

The separate `packages/impact-model` engine contract suite (`impact-engine.contract.test.ts`, created in M4-A) supplies the multi-path, tie-break, cycle, both-direction, and truncation shapes this small retained topology cannot produce — neither layer claims coverage supplied only by the other (ADR-0035 § 3).

## Schema-rejection cases

`invalid/malformed-shape.json`, `invalid/missing-pin-component.json`, and `invalid/unknown-change-type.json` are deliberately invalid and must never be loaded as a real scenario; the loader's rejection tests assert each fails structural validation for its declared reason.
