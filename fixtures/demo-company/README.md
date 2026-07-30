# Fixture: demo-company

`demo-company` is a deterministic Evidence fixture for a fictional engineering organization. Every identity, timestamp, and topology indication is synthetic. The files contain no credentials, network locations, proprietary names, or connection configuration.

## Catalog contract

[`catalog.json`](catalog.json) is the deterministic manifest. Its scenario order is ingestion order: scenario files are loaded in catalog order and records retain their array order. Every valid record declares both timestamps and a globally unique `recordedSequence`; no loader may infer time or order from the filesystem.

Every scenario entry is self-describing: `fixtureKind` is `valid-evidence`, `factPurpose` states the raw Evidence seed’s factual purpose, and `evidenceFile` is a deterministic relative path. Optional `horizons` and `asOfSeeds` are request anchors, not computed results. The validation suite rejects unknown catalog, scenario, horizon, invalid-case, or snapshot-identity keys and rejects any undeclared file in `scenarios/` or `invalid/`.

The `snapshotIdentitySeeds` are request identities for later snapshot tests. They do not define or implement a derivation policy. In particular, `m1-v2` is only a seed proving that a policy-version change must produce a distinct pinned identity; S5 remains responsible for policy data and S6 for snapshot behavior.

`invalid/` contains deliberately invalid inputs used only to prove loud schema rejection. They must never be loaded as valid Evidence. Each catalog entry declares `fixtureKind: "invalid-evidence"`, a factual `reason`, and the exact `expectedIssuePath` and `expectedIssueCode` that must match at least one issue from the existing Evidence collection schema.

## Facts versus future outcomes

The JSON files contain only fixture facts: immutable Evidence observations and catalog-declared query anchors. They contain no Entity or Relationship subjects, GraphAssertion revisions, confidence values, freshness classifications, conflicts, ambiguity markers, validity intervals, snapshots, or precomputed graph state. The validation suite audits raw valid JSON and scenario/invalid metadata for forbidden derived-output keys, derived graph identifiers, and derived state values. The explicitly authorized `snapshotIdentitySeeds` remain excluded from that rejection because they are request identities, not snapshot output.

The “Future expectation” notes below are reviewer guidance from the approved M1 plan. They are not fixture facts and are not executable in S3. Reconciliation becomes executable in S5; repository and snapshot behavior becomes executable in S6.

## Scenario catalog

### 1. Corroborating evidence

Fixture facts: `deployment-inventory` observes `svc-checkout` as a service and `service-registry` observes `Checkout Service` as a service at the same `observedAt`. The two source-native identities normalize to the same key under the future `m1-v1` rules.

Future expectation: one stable Entity subject, one assertion revision with both Evidence records in provenance, and confidence `0.7`.

### 2. Late corroboration as a new revision seed

Fixture facts: `trace-index` later records `service-checkout` above horizon H1 (`2`). H2 is `3`. Its source-native identity also normalizes to the scenario 1 key.

Future expectation: H2 derives a new content-addressed revision with three-source provenance and confidence `0.8`; reads pinned to H1 remain byte-identical.

### 3. Conflicting evidence

Fixture facts: two sources identify the same normalized `orders` identity but make mutually exclusive `service` and `database` entity-type observations. Both records share `observedAt` and `recordedAt` values but have distinct sequences.

Future expectation: both claims remain visible against one subject with per-claim confidence and no selected winner.

### 4. Stale evidence

Fixture facts: `asset-catalog` observes `svc-notifications` once at `2026-02-01T00:00:00.000Z`. The catalog declares query anchors immediately before and exactly at the 7-day and 30-day thresholds.

Future expectation: the same immutable revision classifies `current`, then `stale`, then `historical` as `asOf` advances, while its confidence and identifier remain unchanged.

### 5. Ambiguous identity

Fixture facts: independent sources observe `ledger-api` and `ledger`. These are distinct source-scoped identities and distinct normalized keys; the catalog supplies them as the approved one-directional-alias ambiguity seed.

Future expectation: two stable Entity subjects remain separate and each reports the other as a near-match. No merge occurs.

### 6. Relationship appearance and disappearance

Fixture facts: endpoint Entity evidence exists for checkout, payments, and fulfillment. A `calls` observation from checkout to payments appears and is observed again. Later Evidence for the same source-native relationship identity changes the target to fulfillment. The fulfillment Entity record is also the late-old-observation case: it has an older `observedAt` but a higher ingestion sequence.

Future expectation: the original relationship revision opens at the appearance time and a later derived revision closes its half-open validity interval at `2026-03-10T00:00:00.000Z`. It is present immediately before that boundary and absent at the boundary, while earlier pinned reads remain unchanged. Merely stopping observation causes aging, not deletion.

### 7. Historical/as-of topology changes

Fixture facts: a multi-entity topology grows across the catalog’s three declared query points: web calls API, API publishes to worker, then worker writes to archive.

Future expectation: the three as-of reads produce three distinct historical shapes, and replaying an identical `(asOf, horizon, derivationVersion)` request is byte-identical.

## Required edge cases

| Edge case                                     | Seed                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Equal `recordedAt`, distinct sequence         | Scenario 3, sequences 4 and 5                                                       |
| Equal `observedAt`, sequence tie-break        | Scenarios 1 and 3                                                                   |
| Late-old observation above an earlier horizon | Scenario 6, sequence 12                                                             |
| Duplicate sequence rejection                  | `invalid/duplicate-recorded-sequence.json`                                          |
| Non-positive sequence rejection               | `invalid/zero-recorded-sequence.json` and `invalid/negative-recorded-sequence.json` |
| Unknown schema version rejection              | `invalid/unknown-schema-version.json`                                               |
| Derivation-version pinning                    | `catalog.json` snapshot identities using `m1-v1` and `m1-v2`                        |
| Half-open interval boundary                   | Scenario 6 anchors immediately before and exactly at `2026-03-10T00:00:00.000Z`     |

All valid data is checked by `packages/shared/src/fixture-catalog.test.ts` through the existing shared schemas.
