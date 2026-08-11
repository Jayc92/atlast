# ADR-0024: M1 Query API Runtime Contract — Closing the S7 HTTP-Boundary Gaps

**Status:** Accepted — amends ADR-0017 and ADR-0020 (metadata-only notices; their accepted decision text is preserved)
**Date:** 2026-08-11 (drafted, revised three times after three independent correction passes, and accepted, all 2026-08-11)

> **Approval note (2026-08-11):** ADR-0024 was **explicitly accepted by Joseph Carfagno on 2026-08-11**, after the complete independent review and correction cycle: the S7 pre-release architecture and contract review, followed by three independent correction passes that closed the exact route-parameter matrix, the snapshot-summary HTTP envelope, the closed error-response contract, the ADR-0020 amendment framing, the Fastify repeated-key claim, asynchronous application initialization, the direct workspace-dependency decision, and the build/runtime package-entry-point strategy (including the `rewriteRelativeImportExtensions` fix). **Acceptance settles the S7 architecture and runtime contract defined in §§ 1–15 below.** **Acceptance does not authorize M1 Slice S7 implementation** — S7 remains gated pending a separate, explicit human release recorded in [TASKS.md](../../TASKS.md), exactly as [HANDOFF.md](../../HANDOFF.md) and [docs/milestones.md](../milestones.md) require. **No implementation slice is currently active.**

## Context

Slice S6 (merged PR #23, then closed through PR #24) delivered the in-memory `EvidenceStore`/`TopologyGraphStore` pair implementing accepted [ADR-0023](0023-m1-snapshot-and-in-memory-store-semantics.md), with the S2 repository contract suite passing end-to-end. Slice S7 — "Query API v1 routes in `apps/api` with pinned/latest modes, identity-bound cursors, shared response schemas, and error semantics; integration tests as executable specification" ([docs/m1-plan.md § 4](../m1-plan.md#4-proposed-implementation-slices)) — is the first slice where the graph model meets HTTP. [ADR-0017](0017-m1-query-api-surface.md), as amended by [ADR-0020](0020-m1-inventory-and-search-semantics.md), fixes the query API's architecture: seven bounded REST families, pinned/latest read modes, mandatory pagination with identity-bound cursors, a stable response envelope, and error-class-to-status-code intent. It was written, and ADR-0020 accepted, **before** any repository implementation existed to prove those decisions against a concrete `Clock`, a concrete cursor encoding, or a concrete closed error taxonomy — all of which S6 subsequently fixed as accepted [ADR-0023](0023-m1-snapshot-and-in-memory-store-semantics.md) §§ 1–9. It was also written before either `packages/shared` or `packages/graph-model` had any build output, so it could not anticipate what a _compiled_ `apps/api` needs from its workspace dependencies.

This ADR performs, for the ADR-0017/S6-to-S7 seam, the same closing pass [ADR-0022](0022-m1-reconciliation-policy-and-assertion-derivation.md) performed for the S5 gaps in ADR-0015, and accepted ADR-0023 performed for the S6 gaps in ADR-0016/0018/0019: it audits whether the accepted documents and the merged S2/S6 contracts specify every behavior S7 needs to implement deterministically, without S7 inventing HTTP-boundary policy, and it resolves what they do not. **The third-pass independent correction** found, on direct inspection of the current `tsconfig.json`/`tsconfig.build.json` files and the S6 cursor implementation (`packages/graph-model/src/cursor-payload.ts`, `topology-graph-store.ts`): the second draft's build strategy was incomplete (no `declaration` output despite a `types` entry point, and inherited source `paths` aliases left active during emit, which can pull dependency source outside a package's `rootDir`); its composition-root design created two different application shapes (a health-only one and a fully-wired one), which conflicts with ADR-0009's fully-assembled-application testing requirement; its cursor-transport policy asserted a distinction (whether a cursor's _originating_ request was itself latest or pinned) that the S6 cursor payload does not encode and cannot enforce; and its error-response schema was looser than the repository errors it mirrors, in three specific, correctable ways. **This revision responds to a fourth-pass independent correction**, narrowly scoped to one further build-configuration defect the third pass's own proof requirement (§ 14) was designed to catch: the proposed `tsconfig.build.json` files combined `noEmit: false` with the inherited `allowImportingTsExtensions: true` from each package's base config without setting `rewriteRelativeImportExtensions`, which `tsc` rejects outright (TS5096) rather than merely mishandling. Every correction across all four drafts is applied below; none narrows or reopens what the prior drafts already settled correctly, and the seven-route surface (§ 1) is unchanged.

## Problem

Determine whether accepted ADR-0017, as amended by ADR-0020, together with the merged S2 (`packages/shared`) and S6 (`packages/graph-model`) contracts, specifies every behavior S7 needs to wire a Fastify HTTP surface onto the `EvidenceStore`/`TopologyGraphStore` pair deterministically — so that independent implementations produce identical routes, identical request coercion, identical error responses, identical response envelopes, and build artifacts that actually run — while adding no new runtime dependency without an explicit decision, no S1/S2/S6 contract change, and no authorization for S7 itself.

## Audit Summary

Eighteen review points were assigned to the original audit. Seven were **already fully specified** by the accepted set and require no new decision (unchanged across all four drafts — relisted below for completeness). The remaining points resolve into **fifteen genuine, implementation-critical gaps**, a count unchanged by this revision — the third pass corrected and tightened four of the fifteen (§§ 9, 10, 12, 14); this fourth pass narrowly tightens § 14 further, the only section this revision touches.

### Already fully specified — no new decision needed

- **Loopback-only, synthetic-only, unauthenticated posture.** ADR-0004 § Context/Consequences, ADR-0017 § Context ("the API remains loopback-only, synthetic-data-only, and unauthenticated until the separately approved authentication ADR"), [GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security). S7 binds to `127.0.0.1` exactly as `apps/api/src/server.ts` already does; nothing here changes that. No gap.
- **No write routes, ever.** ADR-0017 invariant 9 ("no route mutates anything"), [PROJECT_SPEC.md § 7](../../PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become). S7 defines only `GET` routes. No gap — restated concretely in § 9 below only because it bears on where `EvidenceAppendError` can never surface.
- **`apps/web` stays untouched; no side doors.** ADR-0017 § "Consumers and the no-side-door rule", [docs/m1-plan.md § 5](../m1-plan.md#5-package-and-application-boundaries) ("`apps/web`: Unchanged M0 shell… Must not contain: Any import of `packages/graph-model`"). S7 touches only the files § 15 enumerates. No gap.
- **Integration-test mechanism.** [ADR-0009](0009-integration-testing.md) already fixes `fastify.inject()` over the fully assembled application as the integration-testing mechanism; [docs/m1-plan.md § 7](../m1-plan.md#7-api-journeys-and-acceptance-checks) already names the eight journeys (including unhappy paths) S7's suite must express. S7 executes this pattern; it does not invent a new one. § 12 below corrects how "the fully assembled application" is constructed so this requirement is actually met, but the mechanism itself (`fastify.inject()`) is unchanged. No gap.
- **The exact M1 read bounds.** Page size (25/100), traversal depth (1–5) and budget (500), search length (2–256) are already fixed by ADR-0017 and already implemented as constants in `packages/shared/src/read-contract.ts`. No gap.
- **Deterministic collection ordering.** ADR-0017 ("deterministic ordering… identifier ascending"), already implemented (`sortIdentifiers`, S4) and already proven end-to-end by the S6 contract-suite run. No gap.
- **Snapshot checksum determinism.** ADR-0016 as amended by ADR-0023 §§ 4–5 already fixes the checksum payload and semantic horizon validity; S7 only calls `getSnapshotSummary` and serializes its already-validated result (in the envelope § 6 fixes). No gap.

### Genuine gaps this ADR resolves

1. The exact, complete HTTP route inventory — including three routes ADR-0017's seven-family table implies but does not name, and one repository method with no public route at all. **Unchanged this pass.**
2. The exact route-by-route parameter matrix: path parameters, required/optional query parameters, defaults, and whether pagination and pinning apply. **Unchanged this pass.**
3. HTTP query-string-to-`ReadMode` coercion, including the exact partial-pin rejection rule. **Unchanged this pass.**
4. Exact query-parameter wire names, numeric/coercion rules, unknown- and repeated-key handling — stated as a verified Fastify behavioral contract, not a named-parser assumption. **Unchanged this pass.**
5. Percent-encoded multi-segment path-parameter identifiers. **Unchanged this pass.**
6. The exact snapshot-summary HTTP response shape, resolving the mismatch between ADR-0017's general envelope and the repository's flat `SnapshotSummary`. **Unchanged this pass.**
7. The Evidence-lookup response envelope and whether it carries snapshot metadata. **Unchanged this pass.**
8. Whether a public assertion-revision route exists (it does not), and how relationship provenance stays traceable without one. **Unchanged this pass.**
9. A complete, closed external error contract. **Corrected this pass:** the cursor-mismatch and derivation-version/identifier `details` shapes now reuse the repository's own bounded schemas and exact discriminated variants instead of permissive `z.string()`/optional-everything shapes, and the malformed-request claim is narrowed to what `setErrorHandler` actually governs.
10. Cursor-transport policy at the HTTP boundary. **Corrected this pass:** removes an unenforceable distinction (a cursor's _originating_ request mode) the S6 cursor payload does not encode, and states plainly what is and is not inferred.
11. The Zod-to-Fastify validation and serialization mechanism, including mandatory response-schema validation before every successful send. **Unchanged this pass.**
12. Asynchronous application initialization. **Corrected this pass:** removes the health-only application shape; `buildApplication` now always requires and wires the full repository dependency pair.
13. The exact, direct workspace dependencies `apps/api` requires. **Unchanged this pass.**
14. The production-valid build/runtime package-entry-point strategy. **Corrected this pass:** adds `declaration` output, clears inherited source-alias `paths` during emit builds, adds the `rewriteRelativeImportExtensions` setting `tsc` requires once `allowImportingTsExtensions` and emit are combined (its absence fails the build outright with TS5096, not merely imperfectly), and requires an explicit clean-build proof rather than asserting the strategy self-evidently works.
15. The exact path boundary across `apps/api`, `packages/shared`, and `packages/graph-model` that S7 is authorized to change. **Updated this pass** to reflect §§ 12/14's corrections.

## Decision (Accepted 2026-08-11)

All decisions below apply within `apps/api/src/**`, the narrow `packages/shared` additions § 15 names, and the narrowly enumerated build-plumbing files in `packages/shared` and `packages/graph-model` that § 14/§ 15 name explicitly. **None requires, and none may make, any change to `packages/graph-model`'s or `packages/shared`'s existing `src/**` behavior, any fixture file, or ADR-0017/0020's accepted decision text.**

### 1. The exact, complete M1 HTTP route inventory

The seven ADR-0017 families resolve to exactly these routes and repository calls. Three gaps close by explicit **absence** — stated here so no implementer adds a route "because the method exists." **Unchanged from the prior draft; restated for completeness, per this pass's requirement that the seven-route surface stay closed.**

| #   | Method & path                                                | Repository call                         | Notes                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `GET /api/v1/entities`                                       | `TopologyGraphStore.listEntities`       | Inventory, entity-only (ADR-0020 § 1).                                                                                                                                                                   |
| 2   | `GET /api/v1/entities/{entityId}`                            | `TopologyGraphStore.getSubject`         | `entityId` validated against the shared `entityIdentifierSchema` **before** calling `getSubject` — the route can never resolve a Relationship subject, by identifier shape, not by a runtime kind check. |
| 3   | `GET /api/v1/search?q=…`                                     | `TopologyGraphStore.searchSubjects`     | Identifier-only, both subject kinds (ADR-0020 § 3).                                                                                                                                                      |
| 4   | `GET /api/v1/entities/{entityId}/traversal`                  | `TopologyGraphStore.traverse`           | Origin must be an Entity identifier (ADR-0017); traversal results mix both subject kinds in `items`.                                                                                                     |
| 5   | `GET /api/v1/evidence/{evidenceId}`                          | `EvidenceStore.getEvidenceByIdentifier` | The **only** route that calls `EvidenceStore` directly rather than `TopologyGraphStore`.                                                                                                                 |
| 6   | `GET /api/v1/entities/{entityId}/evidence`                   | `TopologyGraphStore.getEvidenceChain`   | Entity-scoped only — see the negative finding below.                                                                                                                                                     |
| 7   | `GET /api/v1/snapshots?asOf=…&horizon=…&derivationVersion=…` | `TopologyGraphStore.getSnapshotSummary` | Requires the complete identity; no latest mode (§ 6 fixes its distinct response shape).                                                                                                                  |

The exact parameters each route accepts are fixed separately in § 2 — this table fixes only the route/method surface.

**Three negative findings, settled as M1's closed surface, not oversights to silently fix — no relationship-detail, relationship-scoped evidence-chain, bulk-Evidence, or assertion route is added by this or any prior draft:**

- **No relationship-detail route.** A Relationship subject's own detail is reached only through route 3 (search, by identifier substring) or embedded in route 4's traversal `items` — never through a dedicated `GET /api/v1/relationships/{relationshipId}`. **Accepted ADR-0020's consequences state that "Relationship subjects reach consumers through entity detail and traversal."** That phrase is imprecise: route 2 (entity detail) can never return a Relationship subject, because its path parameter is validated as an Entity identifier before any repository call — only _search_ (route 3) and _traversal_ (route 4) ever surface one. § "Relationship to Accepted ADRs" below records this as a metadata-only amendment to ADR-0020, applied with this ADR's acceptance. § 8 explains why the resulting limitation does not compromise M1 traceability.
- **No relationship-scoped evidence-chain route.** `TopologyGraphStore.getEvidenceChain` accepts any `SubjectIdentifier` (either kind), but route 6 is scoped to `/entities/{entityId}/evidence` only. **M1 exposes no route returning a Relationship subject's own evidence chain.** A real product-surface limitation, flagged for human awareness, not resolved unilaterally here. § 8 explains why relationship provenance remains fully traceable without it.
- **No public bulk-Evidence-listing route.** `EvidenceStore.listEvidence` has **no corresponding HTTP route**; its "Evidence cursor" kind (ADR-0023 § 2) exists only for the `EvidenceStore` interface's own completeness and the S2 contract suite. **No S7 route ever issues or consumes an Evidence cursor** — only graph cursors reach the HTTP boundary.
- **No public assertion-revision route** — resolved separately and explicitly in § 8.

### 2. The exact route-by-route parameter matrix

Every route's complete, closed parameter surface — nothing beyond this table's "Optional query" column is ever accepted; anything else rejects `VALIDATION_ERROR` (§ 9). **Unchanged this pass.**

| #   | Route                 | Path parameters | Required query                         | Optional query (default)                                          | Pinning (§ 3)                                                       | Pagination/cursor (§ 10)                                               |
| --- | --------------------- | --------------- | -------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Inventory             | —               | —                                      | `entityType` (unfiltered); `limit` (25, max 100); `cursor` (none) | Yes                                                                 | Yes                                                                    |
| 2   | Entity detail         | `entityId`      | —                                      | —                                                                 | Yes                                                                 | No                                                                     |
| 3   | Search                | —               | `q`                                    | `limit` (25, max 100); `cursor` (none)                            | Yes                                                                 | Yes                                                                    |
| 4   | Traversal             | `entityId`      | `direction`, `depth`                   | `minConfidence` (0)                                               | Yes                                                                 | No — a request carrying `limit` or `cursor` rejects `VALIDATION_ERROR` |
| 5   | Evidence lookup       | `evidenceId`    | —                                      | — (no pinning: Evidence carries no snapshot identity, § 7)        | No — `asOf`/`horizon`/`derivationVersion` reject `VALIDATION_ERROR` | No                                                                     |
| 6   | Entity evidence chain | `entityId`      | —                                      | `limit` (25, max 100); `cursor` (none)                            | Yes                                                                 | Yes                                                                    |
| 7   | Snapshot summary      | —               | `asOf`, `horizon`, `derivationVersion` | — (no `latest` mode; the three components are always required)    | Always pinned                                                       | No — `limit`/`cursor` reject `VALIDATION_ERROR`                        |

Notes: route 4 has no `limit`/`cursor` (bounded instead by `depth` and the 500-subject budget); route 5 has no pinning parameters at all (§ 7); route 7 has no `limit`/`cursor` and no latest mode (all three pin components are required, not optional); `minConfidence` defaults to `0`; `limit` defaults to `25`, maximum `100`; every unknown or repeated query key, on every route, rejects `VALIDATION_ERROR` (§ 9, § 4) — no exception.

### 3. HTTP query-string-to-`ReadMode` coercion and partial-pin rejection

Applies to every route § 2 marks "Pinning: Yes" (routes 1, 2, 3, 4, 6); route 5 accepts no pin parameters at all; route 7 always requires all three. **Unchanged this pass.**

- **Coercion rule**, for routes 1, 2, 3, 4, 6: reading the three optional query parameters `asOf`, `horizon`, `derivationVersion`:
  - **None present** → construct `{ mode: "latest" }`.
  - **All three present** → construct `{ mode: "pinned", identity: { asOf, horizon: <parsed integer>, derivationVersion } }` and validate through `snapshotIdentitySchema`.
  - **One or two present, but not all three** → reject with `VALIDATION_ERROR` (§ 9), naming each **missing** pin component. This rule applies identically **whether or not a `cursor` parameter is also present** — cursor presence never relaxes or changes it (§ 10 states this explicitly for the cursor-specific consequences).
- For route 7, the same three parameters are simply **required**; their absence is an ordinary missing-required-query-parameter `VALIDATION_ERROR`, not a "latest" resolution.
- This coercion runs **before** any repository call — a partial pin never reaches `EvidenceStore`/`TopologyGraphStore`.

### 4. Exact query-parameter wire names, coercion, and key handling

**Unchanged this pass** (corrected in the prior pass to remove an incorrect claim naming Fastify's query parser).

- **Fixed wire names**, one per route per § 2: `q`, `entityType`, `direction`, `depth`, `minConfidence`, `limit`, `cursor`, `asOf`, `horizon`, `derivationVersion`.
- **Naming seam:** the wire parameter is `minConfidence` (ADR-0017's literal text); S7 maps it to the internal `minimumConfidence` field.
- **Numeric coercion:** `horizon`, `depth`, `limit` — strict integer coercion, rejecting non-integer/empty/non-numeric strings with `VALIDATION_ERROR`. `minConfidence` — decimal, `[0, 1]`. `asOf`/`derivationVersion` — passed through as strings for their own schemas.
- **Unknown query keys reject `VALIDATION_ERROR`** — every route validates its complete query shape as a `z.strictObject`, the exact closed set § 2 tabulates.
- **Repeated keys reject `VALIDATION_ERROR` — stated as a verified behavioral contract, not a named library.** The pinned Fastify version's query-string parsing represents a repeated key as a **non-scalar (array) value**; every scalar query schema here is a plain `z.string()`/`z.number()`, so a repeated key's array value fails that shape check. This contract depends only on that observed array-vs-scalar behavior, never on which specific parsing library produces it.

### 5. Percent-encoded multi-segment path-parameter identifiers

**Unchanged this pass.** Stable identifiers contain literal `/` and `:` (`atlast:entity:service/checkout`). A client percent-encodes both (`/` → `%2F`, `:` → `%3A`); Fastify decodes the matched path-parameter value before handler invocation. An un-encoded multi-segment identifier is mis-routed as two path segments and produces `ROUTE_NOT_FOUND` (§ 9), not a silently "fixed" match. Every integration test constructing a `fastify.inject()` URL for an entity/evidence path parameter percent-encodes the identifier accordingly (testable invariant 4).

### 6. The exact snapshot-summary HTTP response shape

**Unchanged this pass.** Route 7's response reshapes `SnapshotSummary`'s four fields into the same envelope pattern every other single-item route uses: `resolvedReadMetadataSchema` supplies `meta` verbatim; a new, minimal `data` object carries only `checksum`/`subjectCount`.

```ts
export const snapshotSummaryDataSchema = z.strictObject({
  checksum: snapshotSummarySchema.shape.checksum,
  subjectCount: snapshotSummarySchema.shape.subjectCount,
});

export const snapshotDetailResultSchema = z.strictObject({
  data: snapshotSummaryDataSchema,
  meta: resolvedReadMetadataSchema,
});
```

The repository-level `SnapshotSummary` shape itself is unchanged; only route 7's handler restructures its already-validated result before sending.

### 7. The Evidence-lookup response envelope

**Unchanged this pass.** Route 5 returns `{ data: Evidence, meta: { schemaVersion } }` — no `resolvedIdentity`, because Evidence carries no snapshot identity.

```ts
export const evidenceDetailResultSchema = z.strictObject({
  data: evidenceSchema,
  meta: z.strictObject({ schemaVersion: schemaVersionSchema }),
});
```

### 8. No public assertion-revision route, and relationship traceability without one

**Unchanged this pass.** `TopologyGraphStore.getAssertionRevision` exists and is contract-suite-proven, but M1 defines no `GET /api/v1/assertions/{assertionId}` route and no other public route reaches it — assertion revisions are reached only embedded within subject-bearing responses. Every assertion revision — including a relationship assertion reached only through search or traversal — carries its complete `provenance` array in-band; a client dereferences each supporting Evidence identifier individually through route 5, satisfying ADR-0017 invariant 7 without a bulk relationship-evidence-chain route. This is the concrete account of why § 1's two relationship-scoped absences are an accepted limitation, not a defect.

### 9. A complete, closed error contract

ADR-0017 § "Validation and errors" fixes three cases (`400` schema-invalid, `404` unknown ID, `422` semantically invalid time parameters) and names a single structured error schema "(code, message, details)." Prior drafts of this ADR closed the code vocabulary but left several `details` shapes looser than the repository errors they mirror — a **third-pass correction, not merely a restatement**: `mismatchFields` was `z.array(z.string())` instead of the closed `CursorMismatchField` vocabulary; horizon/watermark fields were bare `z.number()` instead of the existing bounded `recordedSequenceSchema`; `unsupportedDerivationVersion` was bare `z.string()` instead of `derivationVersionSchema`; `CURSOR_BINDING_MISMATCH`'s graph and evidence variants were flattened into one shape with every field optional, rather than kept as the two disjoint, exactly-typed variants `InvalidReadCoordinateErrorParams` (`packages/graph-model/src/repository-errors.ts`) already defines; and the `MALFORMED_REQUEST` claim did not distinguish what `setErrorHandler` can and cannot govern. All four are corrected below.

**The closed vocabulary, one row per `code`, each with its exact `details` shape:**

| `code`                    | HTTP status | Source                                                                                                                | `details`                                                                                                                                                    | Exposed or redacted?                                                                                    |
| ------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`        | **400**     | Any request-schema failure (path or query parameter, or the coerced `ReadMode`)                                       | `{ issues: { path: (string \| number)[]; message: string }[] }`                                                                                              | Exposed — the client's own request.                                                                     |
| `MALFORMED_REQUEST`       | **400**     | A failure Fastify's own request pipeline surfaces to `setErrorHandler` before any route handler runs (narrowed below) | `{}`                                                                                                                                                         | N/A.                                                                                                    |
| `ROUTE_NOT_FOUND`         | **404**     | No route matches the request                                                                                          | `{ method: string; path: string }`                                                                                                                           | Exposed — the client's own request.                                                                     |
| `UNKNOWN_IDENTIFIER`      | **404**     | `UnknownIdentifierError`                                                                                              | Discriminated by `identifierKind` (below) — reuses `assertionIdentifierSchema`/`evidenceIdentifierSchema` where the repository variant guarantees that shape | Exposed — the client's own requested identifier, synthetic and non-sensitive.                           |
| `INVALID_READ_COORDINATE` | **422**     | `InvalidReadCoordinateError`                                                                                          | An exact mirror of `InvalidReadCoordinateErrorParams`'s discriminated variants (below), never a single permissive shape                                      | Exposed — ADR-0023 § 9 already guarantees this error's own fields are safe, deterministic, and bounded. |
| `REFERENTIAL_INTEGRITY`   | **500**     | `ReferentialIntegrityError`                                                                                           | `{ assertionIdentifier: AssertionIdentifier; endpointRole: "source" \| "target"; endpointIdentifier: EntityIdentifier; resolvedIdentity: SnapshotIdentity }` | **Exposed, deliberately** — see "Redaction policy" below.                                               |
| `INTERNAL_ERROR`          | **500**     | Any exception not one of the above (a genuine defect)                                                                 | `{}`                                                                                                                                                         | **Redacted** — see "Redaction policy" below.                                                            |

**`UNKNOWN_IDENTIFIER` details, discriminated by `identifierKind` — exposing the exact identifier shape each kind guarantees, not a bare `string`:**

```ts
const unknownIdentifierDetailsSchema = z.discriminatedUnion("identifierKind", [
  z.strictObject({
    identifierKind: z.literal("subject"),
    // SubjectIdentifier is opaque (entity- or relationship-shaped) even in
    // packages/shared itself — no single existing schema narrows it further.
    identifier: z.string(),
    resolvedIdentity: snapshotIdentitySchema.optional(),
  }),
  z.strictObject({
    identifierKind: z.literal("assertion"),
    identifier: assertionIdentifierSchema,
    resolvedIdentity: snapshotIdentitySchema.optional(),
  }),
  z.strictObject({
    identifierKind: z.literal("evidence"),
    identifier: evidenceIdentifierSchema,
    // No resolvedIdentity: Evidence lookups are not identity-scoped (ADR-0023 § 9).
  }),
]);
```

**`INVALID_READ_COORDINATE` details — an exact, closed mirror of `InvalidReadCoordinateErrorParams`.** Because two variants share the literal `reason: "CURSOR_BINDING_MISMATCH"` (distinguished only by `cursorKind`), this is a plain `z.union` of exact `z.strictObject`s, not a single `z.discriminatedUnion("reason", …)` with permissive optional fields:

```ts
const cursorMismatchFieldSchema = z.enum([
  "operation",
  "identity",
  "horizon",
  "filter",
  "searchQuery",
  "ordering",
  "pageSize",
]);

const invalidReadCoordinateDetailsSchema = z.union([
  z.strictObject({ reason: z.literal("EMPTY_EVIDENCE_STORE") }),
  z.strictObject({
    reason: z.literal("HORIZON_BEFORE_FIRST_EVIDENCE"),
    firstRecordedSequence: recordedSequenceSchema,
    currentWatermark: recordedSequenceSchema,
  }),
  z.strictObject({
    reason: z.literal("HORIZON_AFTER_CURRENT_WATERMARK"),
    firstRecordedSequence: recordedSequenceSchema,
    currentWatermark: recordedSequenceSchema,
  }),
  z.strictObject({
    reason: z.literal("UNSUPPORTED_DERIVATION_VERSION"),
    unsupportedDerivationVersion: derivationVersionSchema,
  }),
  z.strictObject({
    reason: z.literal("INVALID_CURSOR"),
    cursorKind: z.enum(["graph", "evidence"]).optional(),
  }),
  z.strictObject({
    reason: z.literal("CURSOR_BINDING_MISMATCH"),
    cursorKind: z.literal("graph"),
    cursorBoundIdentity: snapshotIdentitySchema,
    requestedIdentity: snapshotIdentitySchema.optional(),
    mismatchFields: z.array(cursorMismatchFieldSchema).min(1),
  }),
  z.strictObject({
    reason: z.literal("CURSOR_BINDING_MISMATCH"),
    cursorKind: z.literal("evidence"),
    requestedHorizon: recordedSequenceSchema,
    cursorBoundHorizon: recordedSequenceSchema,
    mismatchFields: z.array(cursorMismatchFieldSchema).min(1),
  }),
]);
```

`recordedSequenceSchema` (`packages/shared/src/evidence.ts`, already used by `read-contract.ts`) is safe to reuse for `firstRecordedSequence`/`currentWatermark`/`requestedHorizon`/`cursorBoundHorizon` specifically because every error-construction path that populates these fields only does so for a **non-empty** store or an **already-issued** Evidence cursor — both guarantee a value in `recordedSequenceSchema`'s `1..2^53−1` range; the sentinel `0` (empty-store watermark) never reaches any of these fields, since `HORIZON_BEFORE_FIRST_EVIDENCE`/`HORIZON_AFTER_CURRENT_WATERMARK` are only thrown once `firstRecordedSequence` is defined (`InMemoryEvidenceStore.assertSemanticallyValidHorizon`), and a horizon of `0` is "never... bound into a cursor" (ADR-0023 § 5). `derivationVersionSchema` is safe to reuse for `unsupportedDerivationVersion` because the token reaching this field has already passed the wire-level `derivationVersionSchema` grammar check during § 3's coercion (it is syntactically valid kebab-case, merely unsupported) before `resolveDerivationPolicy` ever rejects it.

**The complete external error-response schema:**

```ts
export const errorResponseSchema = z.discriminatedUnion("code", [
  z.strictObject({
    code: z.literal("VALIDATION_ERROR"),
    message: z.string(),
    details: z.strictObject({
      issues: z.array(
        z.strictObject({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        }),
      ),
    }),
  }),
  z.strictObject({
    code: z.literal("MALFORMED_REQUEST"),
    message: z.string(),
    details: z.strictObject({}),
  }),
  z.strictObject({
    code: z.literal("ROUTE_NOT_FOUND"),
    message: z.string(),
    details: z.strictObject({ method: z.string(), path: z.string() }),
  }),
  z.strictObject({
    code: z.literal("UNKNOWN_IDENTIFIER"),
    message: z.string(),
    details: unknownIdentifierDetailsSchema,
  }),
  z.strictObject({
    code: z.literal("INVALID_READ_COORDINATE"),
    message: z.string(),
    details: invalidReadCoordinateDetailsSchema,
  }),
  z.strictObject({
    code: z.literal("REFERENTIAL_INTEGRITY"),
    message: z.string(),
    details: z.strictObject({
      assertionIdentifier: assertionIdentifierSchema,
      endpointRole: z.enum(["source", "target"]),
      endpointIdentifier: entityIdentifierSchema,
      resolvedIdentity: snapshotIdentitySchema,
    }),
  }),
  z.strictObject({
    code: z.literal("INTERNAL_ERROR"),
    message: z.string(),
    details: z.strictObject({}),
  }),
]);
```

**Validation-error issue representation and field paths.** Every `VALIDATION_ERROR` issue's `path` is prefixed `["params", ...]` for a path parameter or `["query", ...]` for a query-string parameter, followed by the field name (e.g. `["query", "depth"]`, `["params", "entityId"]`). A partial-pin rejection (§ 3) reports one issue per **missing** component. Only `path` and `message` are carried — Zod's richer internal issue fields are not part of this external contract.

**`MALFORMED_REQUEST`, narrowed to what `setErrorHandler` actually governs.** _(Corrects the second draft's over-broad claim.)_ Fastify's `setErrorHandler` intercepts failures **Fastify's own request pipeline surfaces to the application** — an unparseable query string, invalid route-parameter decoding, or a request Fastify's own limits reject, all _after_ Node's HTTP layer has already accepted the request and handed it to Fastify. This ADR makes **no claim** about, and `errorResponseSchema` has no guaranteed reach over, raw Node-level HTTP parser failures occurring **before** Fastify ever receives the request (malformed request lines, invalid header framing) — those are rejected by Node's own HTTP server, outside Fastify's request-handling pipeline and outside this contract's scope entirely.

**Route-not-found.** A `setNotFoundHandler` returns `{ code: "ROUTE_NOT_FOUND", message: <fixed text>, details: { method, path } }` at `404`, so every "no matching route" case validates against the same closed union — distinct from `UNKNOWN_IDENTIFIER` (route matched, referenced identifier does not exist).

**Generic `INTERNAL_ERROR` handling.** Any exception not one of `UnknownIdentifierError`, `InvalidReadCoordinateError`, `ReferentialIntegrityError`, or a request-side `ZodError` already handled as `VALIDATION_ERROR`, is caught by the top-level `setErrorHandler` and mapped to `{ code: "INTERNAL_ERROR", message: "An unexpected internal error occurred.", details: {} }` at `500` — never the caught exception's own `.message`, never a stack trace. This is also the backstop for § 11's mandatory response-validation rule.

**Redaction policy, stated once, applied consistently:**

- **`REFERENTIAL_INTEGRITY` details are exposed, not redacted.** A `500`, but a **named, closed, fully-typed** error class whose fields ADR-0023 § 9 already restricts to safe, bounded metadata; M1 handles only synthetic data, and GUARDRAILS' "fail honest" favors a loud, diagnosable 500 over a vague one when the shape is already known and safe.
- **`INTERNAL_ERROR` details are redacted unconditionally** — an exception reaching this branch is, by definition, not one of the closed, audited shapes above, so nothing about it can be certified safe to expose.

**Deterministic message policy.** Every `message` is a fixed literal per `code` (or a template interpolating only the already-safe `details` fields) — never randomized, timestamped, or derived from a caught exception's own `.message`. `message` is documentation for a human reader, never a parseable contract; every test and consumer binds only to `code` and the typed `details` fields.

**`EvidenceAppendError` has no code at all** — `appendEvidence` is never called from any S7 route (§ 1).

### 10. Cursor-transport policy at the HTTP boundary

**Corrected this pass.** The S6 graph-cursor payload (`GraphCursorPayload`, `packages/graph-model/src/cursor-payload.ts`) binds the resolved `SnapshotIdentity`, the originating operation, coordinates, ordering, and page size — **it does not bind, and has no field for, whether the request that originally issued it declared `latest` or `pinned` mode.** `InMemoryTopologyGraphStore.resolveSnapshotForCursorContinuation` (`topology-graph-store.ts`) confirms this directly: it branches only on the **current** continuation request's own declared `ReadMode`, never on anything about the cursor's origin. A prior draft of this ADR asserted an invariant — "a latest continuation supplying any pin component alongside a cursor is rejected" — that does not correspond to any distinguishable behavior the repository implements, and is withdrawn.

- **The only two continuation behaviors that exist, both already implemented and contract-tested, restated precisely:**
  - **Zero pin fields present, plus a `cursor`** → the coerced `ReadMode` is `{ mode: "latest" }` (§ 3); the repository resolves the **cursor-bound** identity directly (`resolveCursorBoundSnapshot`), never re-invoking the `Clock` or the watermark.
  - **All three pin fields present, plus a `cursor`** → the coerced `ReadMode` is `{ mode: "pinned", identity }`; the repository requires that declared `identity` to **exactly match** the cursor-bound identity, rejecting `CURSOR_BINDING_MISMATCH` (§ 9) on any difference.
  - **One or two pin fields present** (with or without a `cursor`) → `VALIDATION_ERROR` (§ 3) — the cursor's presence changes nothing about this rule; there is no third, cursor-specific partial-pin behavior.
- **Transport mode history is not cursor-bound and is intentionally not inferred.** Nothing in this contract determines, or needs to determine, whether the request that first issued a given cursor was itself `latest` or `pinned` — the cursor payload carries only the resolved identity, and every continuation is evaluated solely against **its own** declared mode, exactly as the two bullets above state. A client that received a cursor from an initial `latest` request may legitimately continue with a `pinned` request naming that exact resolved identity, and vice versa is not applicable (a `pinned` cursor's bound identity was already fixed at issuance) — both are ordinary instances of the two behaviors above, not a special case.
- **No S7-level pre-filtering of cursor-accompanying parameters.** Filters, search queries, traversal bounds, and `limit` all pass through to the repository call unchanged; the repository's own binding-mismatch machinery is the single point that detects and rejects a conflict.

### 11. Zod-to-Fastify validation and serialization, including mandatory response validation

**Unchanged this pass.**

- S7 validates and serializes through **direct Zod calls inside route handlers** — no `schema` option supplying a JSON Schema to Fastify's own pipeline for these routes. Fastify remains transport/routing/lifecycle only; Zod remains the single source of validation truth, consistent with ADR-0005.
- **Request-side and response-side validation are two separate, explicit steps in every handler.** (1) parse/coerce the request, with failures becoming `VALIDATION_ERROR`; (2) call the repository; (3) **validate the repository's result against its exact response schema** before `reply.send`. A step-(3) failure is caught by the top-level `setErrorHandler` and mapped to `INTERNAL_ERROR` — never relabeled `VALIDATION_ERROR`, since the two steps validate different things.
- **No new dependency.** A Zod-to-JSON-Schema bridge is explicitly not adopted for M1 (Alternatives Considered).

### 12. Asynchronous application initialization

**Corrected this pass — the health-only application shape is removed.** A prior draft made `buildApplication`'s repository-dependency parameter optional, defaulting internally to an empty throwaway store pair when omitted, specifically to let the existing `/health`-only test keep calling it with zero arguments. That design produces **two different applications** — one exposing only `/health`, one exposing the real API — which conflicts directly with [ADR-0009](0009-integration-testing.md)'s requirement to test **the fully assembled application** through its real contracts. There is exactly one `buildApplication` shape from this draft forward.

- **`buildApplication` always requires its repository dependencies and always registers `/health` plus all seven v1 routes — no conditional registration:**

  ```ts
  export function buildApplication(
    dependencies: {
      evidenceStore: EvidenceStore;
      topologyGraphStore: TopologyGraphStore;
    },
    serverOptions: FastifyServerOptions = {},
  ): FastifyInstance;
  ```

  There is no zero-argument call form and no internally-constructed default pair. Every `FastifyInstance` `buildApplication` produces exposes the identical route set, whether in production or in any test.

- **`initializeApplication` asynchronously creates and seeds the concrete stores, then passes them to `buildApplication`:**

  ```ts
  export async function initializeApplication(
    clock: Clock,
    seedEvidence: readonly Evidence[],
    serverOptions: FastifyServerOptions = {},
  ): Promise<FastifyInstance> {
    const evidenceStore = new InMemoryEvidenceStore(clock);
    const topologyGraphStore = new InMemoryTopologyGraphStore(
      evidenceStore,
      clock,
    );
    await evidenceStore.appendEvidence(seedEvidence);
    return buildApplication(
      { evidenceStore, topologyGraphStore },
      serverOptions,
    );
  }
  ```

  Ingestion completes **before** `buildApplication` is ever called, so the returned `FastifyInstance` is fully populated the moment it exists — no caller can obtain an instance whose store is still being seeded.

- **The existing `app.test.ts` health test is updated during S7 — it does not remain byte-for-byte unchanged.** _(Corrects the prior draft's claim otherwise.)_ It is rewritten to construct the fully assembled application with deterministic dependencies — e.g. `await initializeApplication(fixedTestClock, [])` — and inject `GET /health` against that instance, exactly as every other integration test will. This is not a regression: `/health`'s behavior is identical regardless of what the store pair contains, and testing it against the real, fully-wired application (rather than a reduced one that happens to share a function name) is precisely what ADR-0009 requires.
- **Tests may call `buildApplication` directly with deterministic stubs** — objects satisfying the `EvidenceStore`/`TopologyGraphStore` interfaces without being the real in-memory implementations — when exercising error paths that are impractical or impossible to provoke through the real stores, **including response-validation failures**: a stub `TopologyGraphStore.listEntities` that resolves to a value deliberately violating `entityPageSchema` is how § 11's "response validated before send, or `INTERNAL_ERROR`" rule is proven, since the real `InMemoryTopologyGraphStore` cannot be coerced into producing a schema-violating result by construction.
- **No request can run before ingestion completes, in production or in tests, by the same construction as before:** production `server.ts` calls `await initializeApplication(systemClock, demoCompanyFixtureCatalog)` and only then `application.listen(...)`; every integration test calls `await initializeApplication(fixedTestClock, fixedTestSeedEvidence)` (or constructs stubs and calls `buildApplication` directly, for the error-path case above) before calling `.inject(...)`.
- **Startup failure requires no new mechanism.** `server.ts`'s existing `startServer().catch((startupError) => { console.error(...); process.exit(1); })` already treats any rejected promise as fatal; changing `startServer` to `await initializeApplication(...)` before its existing `listen` call routes a fixture-load or `appendEvidence` failure through that unchanged path.
- **Deterministic test injection** is the two explicit parameters `initializeApplication` takes — a fixed, non-wall-clock `Clock` and a small, deterministic `Evidence[]` array — never the production catalog or a real-time clock, mirroring S6-D's `RepositoryFactory` pattern one level up.
- **One store pair per application instance, never a shared singleton.** Each `initializeApplication` call constructs its own fresh pair; production calls it exactly once per process, every test suite calls it independently for full isolation.
- **The production `Clock` and fixture catalog are constructed/loaded only inside `server.ts`**, at the single call to `initializeApplication` — the one place `apps/api` may read wall-clock time.

### 13. Direct workspace dependencies

**Unchanged this pass.** `apps/api/package.json` declares **both** `@atlast/graph-model` and `@atlast/shared` as direct `workspace:*` dependencies — not one declared and the other relied upon transitively.

### 14. The production-valid build/runtime package-entry-point strategy

**Corrected this pass.** The proposed `tsconfig.build.json` files were incomplete in three ways, found on direct re-inspection of the actual current `tsconfig.json` files:

1. **No `declaration: true`.** `packages/shared/package.json` and `packages/graph-model/package.json` are specified (§ 15) to gain a `"types"` field pointing at `./dist/index.d.ts` — but without `declaration: true` in the build config, `tsc` never emits that file. Omitting it would make the `types` field point at a file that does not exist.
2. **Inherited source `paths` aliases left active during emit.** `packages/graph-model/tsconfig.json` already sets `"paths": { "@atlast/shared": ["../shared/src/index.ts"] }` for typecheck/test purposes (§ 14 step 5 below adds an analogous pair of aliases to `apps/api/tsconfig.json`). A `tsconfig.build.json` that simply `extends` the package's `tsconfig.json` **inherits that `paths` override into the emit build**, which would try to pull `@atlast/shared`'s source files into `packages/graph-model`'s own compilation program — and because `rootDir` is set to `packages/graph-model/src`, source files living in `packages/shared/src` fall **outside** that `rootDir`, which `tsc` rejects (or, in some configurations, would emit them into the wrong package's `dist`, corrupting the package boundary). The identical problem applies to `apps/api`'s build once it gains source aliases for **both** workspace packages.
3. **Missing `rewriteRelativeImportExtensions`, which `tsc` rejects outright (TS5096), not merely imperfectly.** `packages/shared/tsconfig.json` and `packages/graph-model/tsconfig.json` both set `"allowImportingTsExtensions": true` (their source uses real `.ts` extensions in relative imports) together with `"noEmit": true` — a combination TypeScript accepts only because `allowImportingTsExtensions` requires **one of** `noEmit`, `emitDeclarationOnly`, or `rewriteRelativeImportExtensions` to be set. A `tsconfig.build.json` that sets `noEmit: false` while inheriting `allowImportingTsExtensions: true` from the base config, without itself setting `emitDeclarationOnly` or `rewriteRelativeImportExtensions`, satisfies **none** of the three — `tsc` fails immediately with: `Option 'allowImportingTsExtensions' can only be used when one of 'noEmit', 'emitDeclarationOnly', or 'rewriteRelativeImportExtensions' is set.` This is not a subtlety that surfaces only in an edge case; it fails the build's very first compile.

**Decision — corrected build configuration, requiring no new third-party dependency:**

1. **`packages/shared/tsconfig.build.json`** (new file):

   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "noEmit": false,
       "declaration": true,
       "outDir": "dist",
       "rootDir": "src",
       "rewriteRelativeImportExtensions": true
     },
     "include": ["src/**/*.ts"],
     "exclude": ["src/**/*.test.ts"]
   }
   ```

   `packages/shared` has no workspace dependencies of its own, so no `paths` override exists to clear here. `rewriteRelativeImportExtensions: true` does two things at once, both required: it satisfies `allowImportingTsExtensions`'s own constraint (finding 3 above) now that `noEmit` is `false`, and it rewrites the package's relative `.ts` import specifiers to `.js` in the emitted output, so the emitted `dist/*.js` files import each other correctly under plain Node resolution. This setting belongs in the **build** config only — it is not added to `packages/shared/tsconfig.json` itself, which stays `noEmit: true` and therefore already satisfies `allowImportingTsExtensions`'s constraint without it.

2. **`packages/graph-model/tsconfig.build.json`** (new file) — the same settings, **plus an explicit empty `paths` override that replaces, rather than merges with, the inherited alias:**

   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "noEmit": false,
       "declaration": true,
       "outDir": "dist",
       "rootDir": "src",
       "paths": {},
       "rewriteRelativeImportExtensions": true
     },
     "include": ["src/**/*.ts"],
     "exclude": ["src/**/*.test.ts"]
   }
   ```

   Setting `"paths": {}` in the child config replaces (does not deep-merge with) the parent's `paths` entry — TypeScript's documented `extends` behavior for this field — so the build resolves `@atlast/shared` through **normal Node package resolution** (the pnpm workspace symlink plus `@atlast/shared`'s own now-real `main`/`types`/`exports` fields from step 1) instead of the source alias. This is also why `packages/shared` must already be built before `packages/graph-model`'s build runs (step 5 confirms this is the existing default order, not a new requirement this decision introduces). `rewriteRelativeImportExtensions: true` is required here for exactly the same reason as step 1 — `packages/graph-model/tsconfig.json` also combines `allowImportingTsExtensions: true` with what would otherwise be an emit-enabling build config — and, again, belongs only in this build config, not in `packages/graph-model/tsconfig.json` itself.

3. **Both packages gain a `"build": "tsc --project tsconfig.build.json"` script** in `package.json`, using the `typescript` already available at the workspace root.
4. **Both packages' `package.json` gain `main`, `types`, and `exports` fields:**

   ```json
   "main": "./dist/index.js",
   "types": "./dist/index.d.ts",
   "exports": {
     ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
   }
   ```

5. **`apps/api` gains its own source-alias convention for typecheck and test only** — a new `paths` entry in `apps/api/tsconfig.json` for **both** `@atlast/graph-model` and `@atlast/shared` (pointing at each package's `src/index.ts`), and a new `apps/api/vitest.config.ts` with a matching `resolve.alias` for both. Required because `scripts/verify.sh` runs `pnpm typecheck` **before** `pnpm build`, so typecheck cannot depend on `dist/*.d.ts` existing.
6. **`apps/api/tsconfig.build.json` overrides the same `paths` entry to an empty object**, for exactly the reason step 2 gives `packages/graph-model`'s build config the same override — without it, building `apps/api` would try to pull both workspace packages' source into `apps/api`'s own `rootDir`-bounded compilation:

   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "noEmit": false,
       "outDir": "dist",
       "rootDir": "src",
       "paths": {}
     },
     "include": ["src/**/*.ts"],
     "exclude": ["src/**/*.test.ts"]
   }
   ```

   **`apps/api`'s build config needs no `rewriteRelativeImportExtensions` addition of its own.** Unlike `packages/shared`/`packages/graph-model`, `apps/api/tsconfig.json` does not set `allowImportingTsExtensions` at all — it already sets `"rewriteRelativeImportExtensions": true` directly (the mechanism `apps/api` has used since its M0 shell, per its own existing comment: "relative imports use real .ts extensions, rewritten to .js on build emit"), which is self-sufficient without `allowImportingTsExtensions` and carries no `noEmit`/`emitDeclarationOnly` constraint to satisfy. `apps/api/tsconfig.build.json` extends `apps/api/tsconfig.json` and therefore inherits `rewriteRelativeImportExtensions: true` automatically — finding 3 above does not apply to `apps/api`, and no change to its build config beyond the `"paths": {}` override is needed.

7. **`packages/graph-model`'s own existing alias to `@atlast/shared` (its `tsconfig.json` `paths` and its `vitest.config.ts`) is unchanged** — it continues to serve typecheck/test only; step 2's override applies solely to `tsconfig.build.json`, never to `tsconfig.json` itself.
8. **No `pnpm-workspace.yaml` change.** `pnpm --recursive --if-present run build` already executes workspace scripts in dependency order by default; adding the missing `build` scripts (step 3) is what makes that already-relied-upon ordering produce real output for the first time.
9. **No `.gitignore` change.** The existing generic `dist/` entry already covers the new output directories.

**This strategy is not asserted to pass "by construction" — it must be proven during S7 with an explicit clean-build check, and this ADR requires that check as part of implementation, not as an optional nicety.** Finding 3 above is exactly why: a plausible-looking build config that omits `rewriteRelativeImportExtensions` does not merely risk a subtle runtime difference — it fails `tsc` immediately with TS5096, which only an actual build attempt (not a design review) reliably catches.

```bash
rm -rf packages/shared/dist packages/graph-model/dist apps/api/dist
pnpm build
node apps/api/dist/server.js   # must start and accept a request, then be stopped
```

A green `pnpm typecheck`/`pnpm test` run proves nothing about steps 1–9 above, because both already succeed today through the source-alias path alone; **only the clean-build-then-run sequence above proves the package-entry-point resolution actually works**, and S7's own verification evidence must include its output, not merely assert the design is sound.

### 15. The exact path boundary across `apps/api`, `packages/shared`, and `packages/graph-model`

**Updated this pass** to reflect §§ 12/14's corrections.

- **`packages/shared/src/**` additions**, additive only: `snapshotSummaryDataSchema`/`snapshotDetailResultSchema` (§ 6), `evidenceDetailResultSchema` (§ 7), `errorResponseSchema` and its `unknownIdentifierDetailsSchema`/`invalidReadCoordinateDetailsSchema`/`cursorMismatchFieldSchema` sub-shapes (§ 9), and any HTTP-query-coercion helper schemas needed for §§ 3–5. No existing S1/S2 schema, type, or exported name changes shape or is removed.
- **Build-plumbing files, a distinct and narrower authorization that does not open either package's existing `src/**` behavior:** exactly `packages/shared/tsconfig.build.json` (new), `packages/shared/package.json` (`build` script plus `main`/`types`/`exports`), and the identical three files in `packages/graph-model`, **including the `"paths": {}` override in each package's `tsconfig.build.json` specifically** (§ 14 steps 1–4). `packages/graph-model`'s existing `tsconfig.json`/`vitest.config.ts` alias is explicitly **not** part of this authorization to change (§ 14 step 7).
- **`apps/api` gains:** the seven routes (§ 1) and their exact parameters (§ 2); Zod-based request/response handling (§§ 3–5, 11); the closed error contract and its Fastify hooks (§ 9); the corrected cursor-transport handling (§ 10); the async composition root, including the rewritten `app.test.ts` (§ 12); its own new `tsconfig.json` paths / `vitest.config.ts` alias / `tsconfig.build.json` override (§ 14 steps 5–6); direct dependencies on both `@atlast/graph-model` and `@atlast/shared` (§ 13); and colocated `fastify.inject()` integration tests covering every [docs/m1-plan.md § 7](../m1-plan.md#7-api-journeys-and-acceptance-checks) journey.
- **What S7 must NOT change:** any existing S1 domain schema, S2 repository interface or its existing read-contract/read-result shapes, `packages/graph-model`'s or `packages/shared`'s existing `src/**` behavior beyond the additive schemas above, `fixtures/demo-company/**`, any package manifest or lockfile beyond the dependency and build-script declarations §§ 13–14 name, `apps/web`, `scripts/verify.sh`, `scripts/bootstrap.sh`, or any S8/M2+ work.

## Alternatives Considered

- **Leave every gap to S7 implementation-time judgment.** Rejected across all three drafts for the same reason: each correction pass found concretely what "left to judgment" produces — an incomplete build config, a duplicated application shape, an unenforceable cursor-mode distinction, a looser-than-necessary error schema — exactly where this project's ADR discipline exists to prevent it.
- **Omit `declaration: true` and rely on TypeScript inferring types from `.js` alone (§ 14).** Rejected: plain `.js` carries no type information at all; a consumer importing `@atlast/shared`/`@atlast/graph-model` from `node_modules` would get untyped `any` for everything, silently defeating ADR-0005's strict-typing discipline the moment the package crosses a real package boundary.
- **Let the build `tsconfig.build.json` inherit the source `paths` alias unmodified, accepting whatever `tsc` does with out-of-`rootDir` files (§ 14).** Rejected on direct inspection: this either fails the build outright (a `rootDir` violation) or risks emitting a dependency's source into the wrong package's `dist`, corrupting the package boundary the whole strategy exists to establish.
- **Declare the build strategy correct without a clean-build proof (§ 14).** Rejected, per this correction pass's own finding: `pnpm typecheck`/`pnpm test` already pass today via the source alias alone and prove nothing about whether the `main`/`exports`/`paths:{}` combination actually resolves at runtime; only an explicit clean-build-then-run sequence proves it, so this ADR requires that sequence as evidence rather than asserting the outcome.
- **Add `rewriteRelativeImportExtensions` to `packages/shared/tsconfig.json`/`packages/graph-model/tsconfig.json` themselves, rather than only to their new `tsconfig.build.json` files (§ 14).** Rejected: the base `tsconfig.json` files are `noEmit: true` and already satisfy `allowImportingTsExtensions`'s constraint through `noEmit` alone; adding an emit-oriented rewrite setting to a no-emit config changes nothing observable there and would blur which file is responsible for which concern — the base config governs typecheck/test, the build config governs emit, and each should carry only the options its own mode actually needs.
- **Drop `allowImportingTsExtensions` and rewrite every relative import in `packages/shared`/`packages/graph-model` to omit the `.ts` extension, avoiding the TS5096 constraint entirely (§ 14).** Rejected: it would touch every source file's import specifiers in both packages — a far larger, purely mechanical change to existing `src/**` behavior that this ADR's boundary otherwise avoids — to work around a constraint `rewriteRelativeImportExtensions` already satisfies with a single build-config line per package.
- **Keep `buildApplication`'s dependency parameter optional, with an internally-constructed default pair for the health-only case (§ 12).** Rejected: it creates two different applications under one function name, directly conflicting with ADR-0009's "boot the real Fastify application… in whatever configuration the current milestone actually ships" — M1 ships the full seven-route API, so "the real Fastify application" has exactly one shape from S7 forward.
- **Preserve `app.test.ts` byte-for-byte by keeping the health-only mode (§ 12).** Rejected for the same reason: preserving one test file unchanged is not worth maintaining a second, reduced application shape that no longer matches what ADR-0009 requires the integration suite to exercise.
- **Encode the cursor's originating request mode (latest vs. pinned) into the cursor payload itself, so a continuation could validate it (§ 10).** Rejected: it would require changing `packages/graph-model`'s existing S6 cursor payload shape (`GraphCursorPayload`) and the accepted ADR-0023 § 2 cursor-binding contract, both explicitly out of S7's authorized scope; and no accepted document identifies a need for this distinction — every actually-required behavior is already expressible in terms of the _current_ request's own declared mode, which the existing payload already supports fully.
- **Leave `mismatchFields`, horizon/watermark fields, and the derivation-version field as permissive `z.string()`/`z.number()` (§ 9).** Rejected this pass: each has an existing, already-bounded shared schema (`CursorMismatchField`'s literal set, `recordedSequenceSchema`, `derivationVersionSchema`) that the repository error already guarantees the value satisfies; using anything looser discards information the repository already proved.
- **Flatten `CURSOR_BINDING_MISMATCH`'s graph and evidence variants into one shape with every field optional (§ 9).** Rejected: it would let a client-facing type imply nonsensical combinations (e.g. `cursorBoundHorizon` alongside `cursorBoundIdentity`) that the internal `InvalidReadCoordinateErrorParams` union already proves can never co-occur; the exact two-variant mirror preserves that guarantee at the HTTP boundary.
- **Claim `errorResponseSchema` governs every possible malformed request, including raw Node-level HTTP parser failures (§ 9).** Rejected this pass: `setErrorHandler` only ever sees failures Fastify's own pipeline surfaces to it; claiming broader coverage would assert a guarantee this contract cannot actually keep.
- **Add a relationship-scoped evidence-chain route and a relationship-detail route now.** Rejected across all three drafts: growing the ADR-0017 surface is a scope decision reserved for demonstrated consumer need, not something a pre-release architecture review decides unilaterally.

## Tradeoffs

- **Chosen:** every S7-implementation-critical choice this audit and its two correction passes found is pinned to one deterministic, verified answer before any S7 code exists — including, this pass, requiring an explicit runtime proof for the build strategy rather than a plausible-sounding design.
- **Given up:** implementation flexibility on fifteen points, and — specifically this pass — the convenience of an optional `buildApplication` parameter and a permissive error schema, both of which would have shipped faster but at the cost of exactly the guarantees (one true application shape; an error contract as tight as the repository it fronts) this project's discipline exists to protect.

## Consequences

- With this ADR now accepted, S7's own future, separate, explicit release can proceed directly to implementation against §§ 1–15 without a mid-slice design pause.
- Two genuine M1 product-surface limitations remain on record for human attention: no relationship-scoped evidence-chain route, and no relationship-detail-by-identifier route (§ 8 explains why traceability survives them).
- `app.test.ts` is now explicitly scoped as an S7 change, not preserved unmodified — a small, previously-avoidable churn that this pass judged less costly than maintaining two application shapes.
- S7's own verification evidence must include the § 14 clean-build-and-run sequence's actual output, not merely a claim that the design should work.

## Risks

- **A further gap surfaces during S7 implementation that this audit and its two correction passes both missed.** Mitigation: the same discipline applies — a genuinely new implementation-critical ambiguity found during S7 is a reviewed follow-up, never an implementation-time judgment call.
- **The clean-build proof (§ 14) reveals a further build-configuration problem this pass did not anticipate.** This has already happened once in this same review cycle — the missing `rewriteRelativeImportExtensions` setting (TS5096) was found only by reasoning through the exact combination of existing compiler options, not by the design looking correct on inspection. Mitigation: this is precisely why § 14 requires the proof as part of implementation rather than treating the design as self-evidently sufficient — a failure there is expected to be caught before merge, not after.
- **Rewriting `app.test.ts` during S7 could be mistaken for scope creep into "unrelated test changes."** Mitigation: § 12 states explicitly why the rewrite is required (one application shape, per ADR-0009) so a reviewer sees it as a direct consequence of this ADR, not an incidental change.

## Testable Invariants and Acceptance Evidence

The future S7 implementation must prove, at minimum:

1. The complete route inventory in § 1 exists exactly as tabulated, and no additional route reaches `getAssertionRevision`, `EvidenceStore.listEvidence`, or a relationship identifier through the entity-scoped routes (2, 6).
2. Every route accepts exactly the path/query parameters § 2 tabulates for it — an unlisted query key on any route, `limit`/`cursor` on route 4 or 7, and any pinning parameter on route 5, each reject `VALIDATION_ERROR`.
3. A graph-read request supplying zero of `asOf`/`horizon`/`derivationVersion` resolves `latest`; all three resolves `pinned`; one or two rejects `VALIDATION_ERROR` naming each missing component, **identically whether or not a `cursor` is also present**; route 7 rejects a request missing any of the three as an ordinary missing-required-parameter `VALIDATION_ERROR`.
4. Every scalar query parameter rejects a repeated key and every route rejects an unrecognized query key; `horizon`/`depth`/`limit` reject non-integer strings; `minConfidence` populates `minimumConfidence` internally; the repeated-key test asserts only the observed array-vs-scalar behavior, never a specific parsing library.
5. A `/` and `:`-containing identifier, percent-encoded per § 5, round-trips exactly inside the handler; an un-encoded identifier produces `ROUTE_NOT_FOUND`.
6. `GET /api/v1/snapshots` returns exactly `snapshotDetailResultSchema`'s shape; `GET /api/v1/evidence/{evidenceId}` returns exactly `evidenceDetailResultSchema`'s shape with no `resolvedIdentity` anywhere.
7. No route or response schema names `getAssertionRevision`, `atlast:assertion:…`, or an `/assertions/` path segment; a relationship assertion found via search or traversal has every `provenance` identifier dereferenceable through route 5.
8. Every row of the § 9 error table produces its exact `code`/status from a test that deliberately triggers it, validating against `errorResponseSchema`; `UNKNOWN_IDENTIFIER`'s `details.identifier` validates against the exact identifier schema its `identifierKind` implies; every `CURSOR_BINDING_MISMATCH` case validates against its exact graph-or-evidence variant, never the other; `mismatchFields` values are drawn only from the closed `CursorMismatchField` set; `INTERNAL_ERROR` carries `details: {}` and the fixed message text, never the triggering exception's own message; a deliberately triggered `ReferentialIntegrityError` produces `REFERENTIAL_INTEGRITY` with full typed `details`, not redacted; no test asserts `errorResponseSchema` coverage of a raw Node-level (pre-Fastify) transport failure.
9. § 10's two continuation behaviors are proven directly (a `latest` continuation resolves the cursor-bound identity without invoking the Clock or watermark; a `pinned` continuation whose declared identity differs from the cursor-bound one rejects `CURSOR_BINDING_MISMATCH`), and no test asserts a distinct "cursor originating mode" behavior, since none exists.
10. No route handler passes a Zod-derived JSON Schema to Fastify's `schema` option; every successful repository result is validated against its exact response schema before `reply.send` — proven by a stub-repository test (§ 12) that forces a schema-violating result and confirms the route returns `INTERNAL_ERROR`, never an invalid `200`.
11. `buildApplication` has exactly one call signature (required dependencies) and registers the identical route set in every test and in production; `app.test.ts`'s `GET /health` test passes against a fully assembled application constructed via `initializeApplication`; `initializeApplication` cannot be observed to serve a request before its `appendEvidence` call resolves; a rejected `initializeApplication` promise reaches `server.ts`'s existing fatal-startup-error handler unchanged; two `initializeApplication` calls with different injected arguments produce fully isolated stores.
12. After `rm -rf`-ing all three packages' `dist/` directories, `pnpm build` succeeds **without a TS5096 (or any other) compiler error** and produces `packages/shared/dist/index.js`+`.d.ts`, `packages/graph-model/dist/index.js`+`.d.ts`, and `apps/api/dist/server.js`; every emitted relative import specifier in `packages/shared/dist/**`/`packages/graph-model/dist/**` ends in `.js`, never `.ts`; `node apps/api/dist/server.js` starts and serves a request successfully; `pnpm typecheck` and `pnpm test` both pass without requiring that clean-build step to have run first; `apps/api/package.json` declares both packages as direct dependencies; no third-party dependency or `pnpm-workspace.yaml` change accompanies any of this.

**Acceptance evidence at review time:** this document read against ADR-0004, ADR-0005, ADR-0009, ADR-0014, ADR-0016 (as amended by ADR-0021/0023), ADR-0017 (as amended by ADR-0020), ADR-0018 (as amended by ADR-0023), ADR-0019 (as amended by ADR-0023), ADR-0020, and ADR-0023, plus the merged S2/S6 sources and the actual current `packages/shared`, `packages/graph-model`, and `apps/api` manifests/tsconfigs and the S6 cursor implementation cited throughout §§ 1–15 and the Audit Summary — demonstrating that every decision here fills a gap those documents and that repository state left open, corrects what the prior two drafts left imprecise, and contradicts nothing they settled.

## Dependencies on Other ADRs

- **ADR-0004** supplies the Fastify/in-process-testing foundation this ADR wires concretely (§ 11).
- **ADR-0005** supplies the Zod-single-source-of-truth discipline § 11 extends to route handlers, and § 15's new `packages/shared` schemas obey.
- **ADR-0009** supplies the integration-testing mechanism this ADR's testable invariants and the m1-plan § 7 journeys are proven through — and, this pass, the specific requirement (a fully assembled application, one shape) § 12's correction directly serves.
- **ADR-0014/0016/0019** (as amended) supply the identifier scheme § 5's percent-encoding decision operates on, and the subject-visibility/referential-integrity rules § 9's `ReferentialIntegrityError` mapping protects.
- **ADR-0017, as amended by ADR-0020,** supplies the seven-family architecture, the pinned/latest read-mode concept, the envelope shape, and the three originally-specified error cases that §§ 1–10 make HTTP-concrete.
- **ADR-0023** supplies the closed repository error taxonomy, the two cursor kinds and their exact binding semantics (directly consumed by this pass's § 10 correction), the Clock-injection point, and the derivation-version lookup.

## Why This Fits Atlast

- **No side doors, precisely at the seam where they'd first appear:** the seam is exactly where an unreviewed shortcut — a second application shape, an unenforceable cursor claim, a looser-than-necessary error field — would first leak into the public contract; two correction passes finding and closing exactly these three shows the review process working as intended, not failing.
- **Fail honest, extended to the transport layer and its failure modes:** the exact error-schema mirror, the redaction distinction, and the refusal to claim more than `setErrorHandler` can actually guarantee all refuse to let an HTTP response claim a confidence — or a coverage — the underlying mechanism doesn't have.
- **Boring core, verified rather than assumed — twice over now:** the build strategy is proven with a real clean-build-and-run sequence rather than declared correct; the application has one shape, not a convenience-motivated second one; the cursor contract states only what the implementation actually enforces.

## Conditions That Would Justify Changing This Decision

- A later finding that any § 1–15 rule contradicts an accepted contract not identified here — would require a reviewed superseding or amending ADR.
- A demonstrated M2 (or earlier) consumer need for relationship-detail or relationship-scoped evidence-chain routes — would grow the ADR-0017 surface through its own documented evolution path.
- A measured need for OpenAPI-schema export or serialization-latency improvement — would reopen § 11's no-new-dependency choice under its own review.
- The separately approved authentication ADR (pre-external exposure) — will wrap this entire surface and may adjust error semantics for authorization failures.
- A future, real need to distinguish a cursor's originating transport mode — would require its own reviewed change to the S6 cursor payload shape (ADR-0023 § 2), never an S7-level workaround.
- A future real package-entry-point convention adopted repository-wide — would fold § 14's per-package pattern into a documented, reusable convention.

## Relationship to Accepted ADRs

**This ADR was accepted 2026-08-11, and with that acceptance amends two accepted ADRs via metadata-only notices** — applied with acceptance, consistent with the project's standing discipline (ADR-0019 § 5, ADR-0020 § 4, ADR-0021 § "Consequences", ADR-0022/0023 § "Relationship to Accepted ADRs"). Every amended ADR's accepted decision text is preserved verbatim; the notices point here:

- **ADR-0017** — §§ 1–5, 9–13 close the exact route inventory, per-route parameters, request-coercion, error-mapping, and composition-root specifics that ADR-0017 (as amended by ADR-0020) described only in general form.
- **ADR-0020** — its consequences state that Relationship subjects "reach consumers through entity detail and traversal"; § 1 establishes that the correct paths are _search_ and _traversal_ — entity detail can never return a Relationship subject, because its path parameter is validated as an Entity identifier before any repository call. This ADR amends that exact phrase, not merely reinterprets it.

Both ADRs' accepted decision text — including ADR-0020's phrase exactly as written — is **preserved verbatim**; this document is the sole normative source for the corrections and specifics it adds. The amendment notices are recorded in [docs/adr/0017-m1-query-api-surface.md](0017-m1-query-api-surface.md) and [docs/adr/0020-m1-inventory-and-search-semantics.md](0020-m1-inventory-and-search-semantics.md), each a metadata-only notice pointing here.

## Exact S7 Boundary (restated for this ADR's scope)

Consistent with [docs/m1-plan.md § 5](../m1-plan.md#5-package-and-application-boundaries): **upon S7's own explicit future release**, S7 may change only:

- `apps/api/src/**` — the seven routes (§ 1) and their exact per-route parameters (§ 2); request/response handling (§§ 3–5, 11); the closed error contract and its Fastify hooks (§ 9); the corrected cursor-transport handling (§ 10); the async composition root, **including a rewritten `app.test.ts`** (§ 12); and colocated `fastify.inject()` integration tests;
- `apps/api/tsconfig.json` — exactly the two new `paths` entries (§ 14 step 5);
- `apps/api/tsconfig.build.json` — exactly the `"paths": {}` override (§ 14 step 6);
- `apps/api/vitest.config.ts` — new file, exactly the `resolve.alias` entries (§ 14 step 5);
- `apps/api/package.json` — exactly two new dependency declarations (`@atlast/graph-model`, `@atlast/shared`, both workspace-sourced, § 13) and their deterministic `pnpm-lock.yaml` importer-block consequence; **no new third-party runtime dependency**;
- `packages/shared/src/**` — exactly the additive schemas § 15 names, with no existing S1/S2 schema, type, or exported name changed or removed;
- `packages/shared/tsconfig.json`, `packages/shared/tsconfig.build.json` (new, **including its `"rewriteRelativeImportExtensions": true` setting**), `packages/shared/package.json` — exactly the build-plumbing additions (§ 14 steps 1, 3–4);
- `packages/graph-model/tsconfig.build.json` (new, **including its `"paths": {}` and `"rewriteRelativeImportExtensions": true` settings**), `packages/graph-model/package.json` — exactly the build-plumbing additions (§ 14 steps 2–4); `packages/graph-model/tsconfig.json` and `vitest.config.ts` are explicitly **not** touched (§ 14 step 7);
- `TASKS.md`, solely for factual S7 progress reporting.

**S7 must NOT implement or modify, per this ADR or otherwise:** any existing S1/S2 domain or repository schema, type, or interface; `packages/graph-model`'s or `packages/shared`'s existing `src/**` behavior beyond the additive schemas named above; the S6 cursor payload shape (`GraphCursorPayload`/`EvidenceCursorPayload`) or its binding semantics; `fixtures/demo-company/**`; `apps/web`; connectors, authentication, deployment, or real-system access; any S8 or M2+ work; any new third-party dependency; `scripts/verify.sh` or `scripts/bootstrap.sh`; `pnpm-workspace.yaml`.

**This ADR's acceptance does not itself authorize S7 implementation.** Acceptance settles the S7 design gaps identified here exactly as ADR-0022/0023 settled S5's and S6's; S7 implementation still requires its own separate, explicit human release recorded in `TASKS.md`, per the standing checkpoint rule ([HANDOFF.md § 7](../../HANDOFF.md), [CLAUDE.md](../../CLAUDE.md)). **S6 remains the last merged implementation slice; no implementation slice is currently active.**
