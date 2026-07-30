# ADR-0020: M1 Inventory and Search Semantics — Entity-Only Inventory with Claim-Level Type Filtering; Identifier-Only Search

**Status:** Accepted — amends ADR-0017
**Date:** 2026-07-29

> **Approval note (2026-07-29):** Accepted by human architecture review. ADR-0020 amends **only** the two identified inventory/search wording items in ADR-0017's query-family table (§ 4); every other ADR-0017 decision stands unchanged. **Complete canonical subject-identifier matching is approved for M1 search** (§ 3 — the match target is the full identifier string, including the `atlast:` prefix). Acceptance authorizes **only the remaining S2 contract remediation described in § 5** — the schema-validated `entityType` filter, the bounded filtered inventory read, the conflicting-claim visibility and match-by-any-claim contract cases, and the identifier-only search wording and tests. Acceptance does **not** approve S2 itself, which remains awaiting its final remediation and human review, and does **not** authorize S3–S8 or M2+, which remain gated on their own explicit releases ([TASKS.md](../../TASKS.md)).

## Context

ADR-0017 (accepted) defines the complete M1 query surface as seven bounded REST families. Its query-family table describes the Inventory family as "List entities; filter by type and status; paginated" and the Search family as "Deterministic normalized-substring match over identifiers and names; paginated." Both phrases predate [ADR-0019](0019-subject-identity-and-assertion-claims.md) (accepted), which relocated entity type from the subject record into the GraphAssertion's canonical claim, and both were written before Slice S1 fixed the concrete domain schemas ([TASKS.md](../../TASKS.md), merged via PR #7).

Human review of Slice S2 (repository interfaces + contract-test suite skeleton) surfaced that neither phrase can be implemented as written against the accepted domain model.

## Problem

Two contradictions between ADR-0017's wording and the rest of the accepted documentation set — each a defect by the project's own definition ("a contradiction between docs is a defect," [CLAUDE.md](../../CLAUDE.md)):

1. **"Filter by type and status" is doubly undefined.** After ADR-0019, an entity's type is not a subject field but a claim inside each assertion revision — and conflicting type claims may validly coexist with no winner. A "type filter" therefore has no defined semantics until someone says which claims it evaluates and what happens under conflict; a naive reading (filter on _the_ entity's type) silently selects a winning claim, the highest-severity defect ADR-0014 defines. And no concept named "status" exists anywhere in the accepted domain model: freshness classification, conflict state, ambiguity state, and validity are four distinct, individually defined concepts (ADRs 0014–0016), and operational health state belongs to the M3 overlay milestone ([docs/milestones.md M3](../milestones.md#m3--operational-health-overlays-gated)). A "status" filter could only be implemented by silently conflating or renaming one of them.
2. **"Identifiers and names" references a claim that does not exist.** The accepted domain model — ADR-0014 as amended by ADR-0019, and the S1 schemas implementing it — defines no display-name or name claim on any subject or assertion. Search over "names" is unimplementable; deriving names by parsing identifier segments would violate ADR-0014's identifier-opacity rule ("no parsing identifiers to infer facts").

## Decision (proposed)

### 1. Inventory: entity-only, with an optional claim-level `entityType` filter

- **M1 inventory remains entity-only.** `GET /api/v1/entities` lists Entity subjects (serialized with their supporting revisions per the ADR-0017 envelope, never bare). No relationship-inventory family is added; Relationship subjects reach consumers through entity detail and traversal, exactly as ADR-0017 already defines.
- **The inventory family gains one optional filter parameter, `entityType`**, defined as a Zod schema in `packages/shared` and validated as a classification token (the same lowercase kebab-case token schema the S1 canonical claims use). Absent means unfiltered; a malformed token is a schema-validation error (`400`), never a silent empty result.
- **Filter semantics are claim-level and snapshot-pinned:** an Entity subject matches `entityType=X` if and only if at least one entity assertion revision **visible under the resolved snapshot identity** — its validity interval contains the resolved `asOf`, evaluated at the pinned `horizon` and `derivationVersion` — carries a canonical claim whose `entityType` is `X`. Revisions not visible under the resolved identity never participate in filtering.
- **Conflict behavior is match-by-any-claim.** When conflicting valid `entityType` claims coexist on one subject, the entity matches the filter if **any** visible assertion carries the requested `entityType` — so a subject with conflicting claims `service` and `database` appears in both filtered inventories. The filter selects **subjects**; it never filters, drops, or reorders that subject's revisions: every visible revision, including every conflicting one with its conflict markers, remains serialized in-band per ADR-0017. Filtering must never select or imply a winning type.

### 2. No generic "status" filter in M1

- **M1 defines no generic entity "status" filter**, and the amended inventory wording (§ 5) removes the word. Freshness classification, conflict state, ambiguity state, and validity are **distinct concepts with distinct definitions** (ADRs 0014–0016) and **must not be silently combined, aliased, or renamed "status"** — in schemas, repository interfaces, routes, or documentation. Each already reaches consumers in-band on every response per ADR-0017; none needs a filter to be visible.
- **Operational health status belongs to the M3 health-overlay milestone** and is not pulled into M1 under any name. A future health filter is an M3 query-surface decision, made when M3 is authorized.

### 3. Search: stable subject identifiers only

- **M1 search matches stable Entity and Relationship subject identifiers only.** The match is evaluated against each subject's complete canonical identifier string (e.g., `atlast:entity:service/checkout`); results remain subject-with-revisions envelopes, and only subjects with at least one revision visible under the resolved snapshot identity are returned (the ADR-0014 subject-visibility rule, unchanged).
- **M1 defines no separate display-name or name claim.** Identifier segments may happen to be human-readable — that is what makes identifier search useful at fixture scale — but identifiers remain **opaque**: matching a substring of an identifier is string matching over an opaque token, and no component may parse identifier segments to infer topology facts (type, environment, ownership, or anything else), restating ADR-0014's identifier-opacity rule.
- **Adding display names or name-based search later requires an explicitly reviewed domain-contract change:** a name claim (or equivalent) added to the shared schemas through its own review, with this ADR's change conditions as the trigger — never an implementation-time convenience.
- **Search remains deterministic normalized-substring matching, with locale-independent normalization.** Stable identifiers are already schema-normalized lowercase ASCII (kebab-case segments, per the ADR-0014/0015 identifier scheme as implemented in S1), so query normalization is defined as exactly: the character-by-character ASCII case mapping `U+0041–U+005A` → `U+0061–U+007A`, and **nothing else** — no Unicode case folding, no locale-sensitive lowercasing (the Turkish dotted/dotless-I family must behave identically under every runtime locale), no diacritic stripping, no trimming beyond what the schema-enforced query bounds already reject. A match is a literal substring occurrence of the normalized query within the identifier string. Characters outside the identifier alphabet simply never match; they are not an error. ADR-0017's schema-enforced query length bounds (2–256) are unchanged.

### 4. What this ADR amends — and what it does not

**ADR-0020 amends only the affected inventory/search wording in ADR-0017's query-family table:**

| ADR-0017 item             | Accepted wording (preserved verbatim in ADR-0017)                                | Amended reading under this ADR                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Inventory family, purpose | "List entities; filter by type and status; paginated"                            | List entities; optional `entityType` filter over visible assertion claims (§ 1); no status filter (§ 2); paginated |
| Search family, purpose    | "Deterministic normalized-substring match over identifiers and names; paginated" | Deterministic normalized-substring match over stable subject identifiers only (§ 3); paginated                     |

**Every other ADR-0017 decision remains accepted and unchanged:** the seven query families, pinned/latest read modes, cursor semantics, all exact limits (page size, traversal depth and budget, search query length), the response envelope, in-band conflict/ambiguity serialization, deterministic ordering, error semantics, the no-side-door rule, and everything explicitly deferred. Per the project's amendment discipline ([docs/m1-plan.md § 10](../m1-plan.md#10-protected-files-and-prohibited-actions-during-m1-implementation), precedent in ADR-0019 § 5), ADR-0017 receives a **metadata-only amendment notice** pointing here; its accepted decision text is preserved verbatim, and this document is the sole normative source for what changed.

### 5. Consequences for Slice S2 — and what this ADR does not authorize

**Once ADR-0020 is accepted, S2 remediation must add:**

- a schema-validated optional `entityType` inventory filter in `packages/shared` (§ 1);
- a bounded entity-inventory repository read using that filter, alongside the other S2 contract reads;
- storage-agnostic contract cases proving that conflicting type claims remain visible and that match-by-any-claim behavior holds (§ 1, invariants 2–3 below);
- identifier-only search contract wording and tests (§ 3, invariants 4–5 below).

**ADR-0020 does not itself approve S2, authorize S3–S8, or authorize M2+.** S2 remains implemented and awaiting human review, and cannot be approved until this ADR is accepted and the corrections above are applied; every later slice and milestone gate is untouched ([TASKS.md](../../TASKS.md)).

## Alternatives Considered

- **Map "status" to freshness classification (or to conflict/ambiguity state) and keep the filter** — the path of least wording change. Rejected: it silently renames a precisely defined concept into an undefined umbrella term, inviting exactly the concept-conflation this project's vocabulary guardrail exists to prevent ([GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards)); and every one of those states is already visible in-band on every response, so the filter buys nothing M1 needs.
- **Resolve `entityType` filtering against a single winning type claim** (highest confidence, most recent, or most-corroborated) — the conventional reading of "filter by type." Rejected: it is a silently chosen winner, the highest-severity defect ADR-0014 defines, laundered through a query parameter.
- **Match-by-all-claims under conflict** (an entity matches `entityType=X` only if every visible claim says `X`) — avoids implying a winner from the other direction. Rejected: a conflicted entity would vanish from **every** type-filtered inventory, which is a silently cleaned-up graph — the same honesty failure as hiding the conflict, expressed as absence. Match-by-any-claim keeps conflicted entities discoverable through each of their claimed types, with the conflict serialized in-band.
- **Add a relationship-inventory family now** — symmetric, but it grows the accepted seven-family surface with no M1 consumer need; traversal and entity detail already reach every Relationship subject. Growing the API is ADR-0017's documented evolution path when a real need appears.
- **Add a name/display-name claim now so "identifiers and names" becomes implementable** — resolves the contradiction by expanding the domain contract instead of correcting the wording. Rejected: it adds an evidence-derived claim kind mid-slice with no fixture scenario, no consumer, and no review pressure demanding it; ADR-0019 fixed the discipline that new claim kinds are schema-version-incrementing, ADR-worthy changes. Decision § 3 records exactly this as the future path, explicitly reviewed.
- **Search over claim values (e.g., type tokens) as well as identifiers** — rejected for M1: type discovery is precisely what the § 1 inventory filter provides with defined conflict semantics; overlapping the two families blurs both contracts.
- **Unicode full case folding for search normalization** — maximally forgiving input handling, but locale-adjacent case behavior (dotted/dotless I, final sigma) makes "deterministic across environments" harder to prove than it is worth when the match target is schema-guaranteed lowercase ASCII. The ASCII-only mapping is exactly sufficient and trivially locale-independent.

## Tradeoffs

- **Chosen:** filter and search semantics that are implementable against the accepted model, conflict-honest by construction (match-by-any-claim cannot imply a winner), and deterministic across runtime locales; a wording amendment scoped to two table cells.
- **Given up:** filtering convenience (no status filter; one filterable claim field), search recall beyond identifiers (an entity is only as findable as its identifier is readable — acceptable at fixture scale, where identifiers are authored to be readable), and forgiving non-ASCII query handling (non-ASCII queries validly match nothing).

## Consequences

- ADR-0017 gains a metadata-only amendment notice pointing here; its index entry reflects the proposed amendment. Acceptance of this ADR converts both to "amended by ADR-0020" markers, following the ADR-0019 precedent.
- S2 review acquires a concrete completion condition (§ 5): the contract corrections land as S2 remediation after acceptance, inside the already-released S2 scope (repository interfaces and contract-test skeleton in `packages/shared`) — no slice gate moves.
- The M2 UI inherits precise semantics to design against: type-filtered inventory that can return the same entity under multiple types when sources disagree, and search that finds subjects by identifier only until a name claim is ever approved.
- [docs/m1-plan.md](../m1-plan.md) § 7 journey wording ("find `checkout` by search") is already consistent with identifier-only search; no plan-content change is required beyond status notes.

## Risks

- **Amendment precedent, round two.** Mitigation: as with ADR-0019, this ADR amends only demonstrated contradictions between accepted documents — a defect by the project's own definition — changes no authorization boundary, and requires human acceptance to take effect.
- **Match-by-any-claim misread as endorsement.** A consumer might read an entity's presence under `entityType=service` as Atlast asserting it _is_ a service. Mitigation: the response structurally carries every conflicting revision with its conflict markers (ADR-0017's envelope makes a cleaned-up read unrepresentable); the filter is documented as "any visible claim," never "the type."
- **Identifier-only search proves too weak for M2 UX.** Plausible; that is precisely the § 3 trigger for a reviewed name-claim addition, with evidence from M2 evaluation rather than speculation now.

## Testable Invariants and Acceptance Evidence

Each invariant names its owning layer and proving slice, per the ADR-0019 § 4 discipline (S2 defines contracts; the implementing slice proves them):

1. **S2 — schema validation:** the inventory filter schema accepts an absent `entityType` and any well-formed classification token, and rejects malformed tokens with a structured error (filter-schema test).
2. **S2 defines, S6 proves — repository contract:** an Entity subject carrying two conflicting visible `entityType` claims `X` and `Y` is returned by the bounded inventory read filtered by `X` **and** by the read filtered by `Y`, and in both results every conflicting revision serializes with its conflict state (match-by-any-claim and conflict-visibility contract case).
3. **S2 defines, S6 proves — repository contract:** an Entity subject matches no `entityType` filter that no revision visible under the resolved snapshot identity claims; revisions whose validity interval excludes the resolved `asOf` never contribute to filter matching (snapshot-pinned filtering contract case).
4. **S2 defines, S6/S7 prove — search contract:** a subject matches a search query if and only if the normalized query is a substring of its complete canonical identifier; a subject whose claim content contains the query term while its identifier does not must not match (identifier-only contract case).
5. **S2 defines, S6/S7 prove — search contract:** query normalization is exactly the ASCII case mapping — `"CHECKOUT"` matches `atlast:entity:service/checkout`; `"I"` normalizes to `"i"` under every runtime locale; a query containing `"İ"` (U+0130) is left unchanged by normalization and matches no identifier (locale-independence contract case).
6. **All M1 slices — review invariant:** no schema, repository interface, or route defines a parameter, field, or concept named "status" for graph subjects; freshness, conflict, ambiguity, and validity keep their own names everywhere (vocabulary check in review).

**Acceptance evidence at review time:** this document, read against ADR-0017's query-family table, ADR-0019 §§ 2–3, and the S1 schemas in `packages/shared/src/` (identifier and classification-token normalization), demonstrating both contradictions and that every other ADR-0017 decision survives unchanged.

## Dependencies on Other ADRs

- **Amends:** ADR-0017 — the two query-family-table wording items identified in § 4 only.
- **Preserves and depends on:** ADR-0014 as amended by ADR-0019 (identifier scheme and opacity rule, subject-visibility rule, conflict coexistence), ADR-0015 (conflict/ambiguity semantics and identifier normalization), ADR-0016 (resolved snapshot identity that pins filter and search evaluation), ADR-0017 (every other decision), ADR-0018 (the contract-test suite these cases join), ADR-0019 (claim-level type ownership and the layer-split discipline).

## Why This Fits Atlast

- **Fail honest, structurally:** match-by-any-claim plus mandatory in-band conflicts makes "filtering picked a winner" unrepresentable, extending ADR-0019's guarantee from the model into the query semantics.
- **Vocabulary is a guardrail:** refusing an undefined "status" term keeps four precisely defined concepts from collapsing into one vague one.
- **Boring core:** the smallest amendment that makes the accepted surface implementable — two table cells corrected, one optional filter defined, no new mechanism.

## Conditions That Would Justify Changing This Decision

- M2 evaluation demonstrating that identifier-only search measurably fails exploration UX — the trigger for a reviewed name-claim domain-contract change (§ 3), with its own schema-version and ADR discipline.
- M3 authorization — operational health state arrives as overlay queries per the milestone plan, which may motivate health-aware inventory filtering **as M3 surface**, never retrofitted into M1 semantics.
- A second filterable claim field with a demonstrated consumer need — grows the inventory filter contract through the same review path as any schema change.
