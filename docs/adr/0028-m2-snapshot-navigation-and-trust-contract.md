# ADR-0028: M2 Snapshot Navigation and Trust-Presentation Contract

**Status:** Proposed — proposes one additive M2 API route; does not amend an accepted ADR unless accepted
**Date:** 2026-08-12

## Context

M2 requires snapshot/history playback and Evidence-backed explanation. M1 supports reproducible pinned reads and validates a complete snapshot identity, but it exposes no bounded way to discover usable historical coordinates. The browser cannot inspect fixtures, EvidenceStore, or graph-model state without violating the query-API-only rule.

M1 also deliberately exposes no Relationship detail or Relationship evidence-chain route. Relationship subjects still carry complete assertions in search/traversal results, and every provenance identifier is directly dereferenceable through the existing Evidence route. M2 must use that accepted shape rather than silently widening the API.

## Decision

### 1. Add one bounded snapshot-anchor route

M2 proposes:

`GET /api/v1/snapshot-anchors`

The response is:

```ts
{
  items: Array<{
    identity: SnapshotIdentity;
    checksum: string;
    subjectCount: number;
  }>;
  truncated: boolean;
  meta: {
    schemaVersion: SchemaVersion;
    resolvedHorizon: RecordedSequence;
    derivationVersion: DerivationVersion;
  }
}
```

Semantics:

- The request resolves the current Evidence watermark and active derivation version once.
- It returns at most the 100 newest distinct retained `observedAt` instants that produce valid snapshots at that fixed horizon/version.
- Anchors sort `asOf` descending, newest first.
- `truncated` is `true` when more than 100 valid distinct anchors exist; no continuation cursor is exposed in M2.
- `identity.horizon` and `identity.derivationVersion` equal the response metadata for every item.
- Each item is generated through the same snapshot construction and checksum path as the existing snapshot-summary route.
- Empty Evidence rejects with the existing `INVALID_READ_COORDINATE / EMPTY_EVIDENCE_STORE` response.
- The route accepts no query parameters; unknown or repeated query keys follow ADR-0024's existing HTTP rules.
- No Evidence records or fixture metadata are exposed by this route.
- The route is read-only and loopback-only.

The API handler composes existing public interfaces only:

1. Read `EvidenceStore.getCurrentWatermark()` once.
2. Page through `EvidenceStore.listEvidence()` at that fixed horizon using the existing maximum page size until the retained collection is exhausted.
3. Collect and sort distinct `observedAt` values descending.
4. Resolve summaries through `TopologyGraphStore.getSnapshotSummary()` for at most the newest 101 candidates at the fixed horizon/version.
5. Return the first 100 valid anchors; the 101st establishes `truncated: true` and is not returned.

The implementation adds shared HTTP schemas and the API route only. It does not add a repository method, alter a graph-model contract, or reach into private implementation fields. The anchors are retained observation coordinates, not an assertion that every possible freshness-transition instant has been enumerated.

### 2. Make snapshot state complete and reproducible

- The browser URL carries either all of `asOf`, `horizon`, and `derivationVersion`, or none.
- Selecting an anchor pins all coordinated graph reads to its complete identity.
- Browser reload and copied links reproduce the same identity.
- “Latest” is an explicit mode represented by absence of all pin fields; after resolution, the UI displays the actual resolved identity.
- “Return to latest” makes a new latest request rather than assuming the newest listed anchor is equivalent to wall-clock latest.
- The UI displays the checksum and subject count for the selected anchor.

### 3. Define trust presentation as part of the interaction contract

For every selected assertion revision, the UI must show:

- exact claim kind and claim fields;
- numeric confidence;
- query-time freshness (`current`, `stale`, or `historical`);
- validity as half-open `[validFrom, validTo)`;
- uncontested/conflicted status and every competing claim;
- unambiguous/ambiguous status and every near match;
- ordered rule trace;
- every provenance Evidence identifier as a dereferenceable citation.

No compact view may hide the existence of conflict, ambiguity, stale/historical state, or truncation. Compact views may summarize counts only when an accessible action reveals the complete set.

### 4. Reuse the accepted Relationship traceability path

- Relationship detail comes from the validated search/traversal subject already loaded.
- Direct URL rehydration searches by the complete Relationship identifier and accepts only an exact identifier match.
- Relationship Evidence is fetched by dereferencing each assertion/competing-claim/rule-trace provenance identifier through `GET /api/v1/evidence/{evidenceId}`.
- M2 does not add a Relationship detail route, Relationship evidence-chain route, assertion route, or bulk-Evidence route.

### 5. Fail honestly across time changes

- A failed anchor load does not disable latest topology exploration.
- A failed pinned read keeps the requested identity visible and does not fall back silently to latest.
- If a copied historical URL becomes invalid, the UI displays the API's closed error and offers an explicit move to latest; it never substitutes another snapshot automatically.
- When changing snapshots, prior data may remain visible only with a clearly labeled loading veil naming the old and requested coordinates.

## Consequences

- M2 can provide real API-only history playback without importing fixtures.
- The additive endpoint expands the accepted M1 HTTP surface and therefore requires explicit human approval before M2-E.
- Anchor response size is capped at 100, while generation may scan retained Evidence through bounded existing pages; implementation review must measure that cost against the fixture catalog and preserve a future storage boundary.
- The fixed-horizon anchor list shows “history as known at this Evidence watermark,” including late-arriving Evidence; that semantic is explicit rather than silently conflated with ingestion-time history.
- Relationship provenance remains complete without new Relationship routes.
- This ADR does not authorize implementation.

## Alternatives Rejected

- **Hard-code fixture timestamps in the browser:** a forbidden data side door.
- **Offer only a free-form timestamp field:** technically permits pinned reads but does not satisfy usable playback.
- **Infer history from the latest visible assertions:** latest reads omit superseded revisions and cannot enumerate complete historical coordinates.
- **Expose bulk Evidence to the browser:** unnecessarily expands the public surface and leaks ingestion data to solve a snapshot-navigation problem.
- **Add Relationship detail/evidence-chain routes in M2:** not required for the M2 exit criteria because accepted search/traversal plus direct Evidence dereferencing are sufficient.

## Verification Obligations

- Anchor ordering, 100-item cap, truncation, empty-store, and rejected-query tests.
- Proof that every returned identity succeeds through the existing snapshot-summary route with the same checksum/count.
- Late-old-observation fixture proof at a fixed horizon.
- URL complete-pin and copied-link browser tests.
- Historical relationship -> provenance -> Evidence acceptance test.
- Explicit failed-pinned-read test proving there is no silent latest fallback.
