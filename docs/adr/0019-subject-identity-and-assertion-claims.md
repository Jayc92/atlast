# ADR-0019: Subject Identity and Assertion Claims — Subjects Carry Identity Only; the Canonical Claim Owns Type and Endpoints

**Status:** Accepted — amends ADR-0014 and ADR-0015
**Date:** 2026-07-23

> **Approval note (2026-07-23):** The **identity-only subject decision was approved by human review**. ADR-0019 amends **only** the identified subject/type clauses of ADR-0014 and their dependent wording in ADR-0015 (scope in § "Relationship to ADR-0014 and ADR-0015" below); every other accepted decision stands. **Acceptance unblocks Slice S1** ([TASKS.md](../../TASKS.md)) — it does **not** authorize S2–S8, which remain gated on per-slice release after the preceding slice is reviewed and merged, nor M2 and later milestones, which remain gated on their own explicit authorizations.

## Context

ADR-0014 (accepted) separates **stable subjects** (what a claim is about) from **GraphAssertions** (evidence-derived claims about them), and makes conflict preservation structural: "When Evidence supports contradictory claims about one subject, reconciliation records a conflict structure holding both revisions and their provenance … Silently picking a winner is a defect of the highest severity." ADR-0015 (accepted) gives the canonical example: "two sources assert different types for one entity" must surface as a conflict with per-claim confidence and **no winner**.

But ADR-0014 also states that the Entity subject is "a **typed**, identified thing" whose record "carries only identity **and type**," and that a Relationship subject is "a **directed, typed** connection referencing exactly two **stable endpoint Entity identifiers**." Its Alternatives section repeats it ("they carry identity and type only"), and its invariant 4 validates endpoints on the **subject** ("Every Relationship subject references two existing stable Entity identifiers").

## Problem

These two accepted positions contradict each other, and Slice S1 cannot define schemas that satisfy both:

- If the Entity subject record carries a singular `type` field, then when two sources assert incompatible types for one stable identity, that field must hold **one** of the claims — which silently selects a winner, the highest-severity defect ADR-0014 itself defines. Holding both on the subject turns the subject into a mutable claim aggregate, which contradicts the same ADR's insistence that subjects are "not facts" and that "everything else Atlast believes about it lives in assertions."
- The same failure applies to a Relationship subject carrying type and endpoint identifiers: sources can disagree about a connection's type or endpoints while agreeing it is the same stable connection. Fixing type/endpoints on the subject either picks a winner or fragments one identity into several.
- Type on the subject is **evidence-derived** — it comes from observations, not from identity assignment — so placing it on the subject also violates the evidence-in/assertions-out boundary ([architecture § 1.1](../architecture.md#11-evidence-in-assertions-out)) that everything else in ADR-0014 enforces.

A singular typed subject cannot honestly represent coexisting incompatible type claims. One of the two clauses has to move.

## Decision (proposed)

### 1. Stable subjects carry identity only

Subjects are pure identity anchors — the stable thing assertion revisions attach to — and carry **no evidence-derived facts whatsoever**:

- An **`EntitySubject`** contains exactly: `schemaVersion`, `identifier` (per the ADR-0014 identifier scheme), and `subjectKind: "entity"`.
- A **`RelationshipSubject`** contains exactly: `schemaVersion`, `identifier`, and `subjectKind: "relationship"`.
- Subjects contain **no entity type, no relationship type, no endpoints, no ownership, and no other evidence-derived fact**. The `subjectKind` discriminant is not a claim about the world; it is part of identity itself (an entity identity and a relationship identity are different kinds of identity, assigned by reconciliation when the subject is created, per ADR-0015).

This sharpens, rather than changes, ADR-0014's own principle: "Subjects are not facts; they are the stable identity that assertion revisions attach to." Everything ADR-0014 already says about subject visibility remains binding — a subject still never appears in any read result without at least one supporting assertion revision valid under the query's pinned parameters.

### 2. The GraphAssertion owns the canonical claim

The **canonical claim** inside each GraphAssertion revision (ADR-0014 already names it as an identifying component) is where type and endpoint facts live:

- An **entity assertion claim** contains the entity **classification/type** (service, database, queue, scheduled job, etc.).
- A **relationship assertion claim** contains the **relationship type** (e.g., `calls`, `reads-from`, `publishes-to`, `deployed-on`), the **source Entity identifier**, and the **target Entity identifier** — direction is expressed by the source/target roles in the claim.
- Claim shapes form a **discriminated union** (discriminated by claim kind, matching the subject's `subjectKind`), defined once as Zod schemas in `packages/shared` per ADR-0005/ADR-0014; a claim of one kind attached to a subject of the other kind is structurally invalid and rejected at schema validation.
- **Provenance, confidence, validity interval, rule trace, and conflict/ambiguity state remain on the immutable, content-addressed assertion revision**, exactly as ADR-0014 defines them — this ADR moves nothing off the assertion.
- The **canonical claim remains part of the content-addressed assertion identifier** (ADR-0014's identifying content is unchanged in composition: derivation version, subject identifier, canonical claim, validity interval at the pinned horizon, sorted provenance identifiers, rule trace, conflict/ambiguity state). Two revisions asserting different types for one subject therefore have different identifiers by construction.

### 3. Conflict behavior

With claims on assertions, ADR-0014's conflict rule becomes representable without contradiction:

- **Multiple incompatible classification claims** may reference the same stable Entity subject — each as its own assertion revision with its own provenance and confidence, held together by the ADR-0014 conflict structure.
- **Multiple incompatible type or endpoint claims** may reference the same stable Relationship subject, under the same rule.
- **No subject field silently selects a winning claim** — structurally guaranteed, because the subject has no field that could hold one.
- **Relationship referential integrity is validated per assertion claim**: both the source and target Entity identifiers in every relationship claim must **eventually resolve to existing stable Entity subjects**. This restates ADR-0014 invariant 4 at the claim level, where the endpoint facts now live. Endpoint-disagreeing claims about one Relationship subject each pass or fail referential integrity independently. Existence checking is a **repository responsibility, not an S1 schema responsibility** — the layer split is fixed in § 4 below.

Ambiguity semantics (ADR-0015) are unaffected: near-matches still stay split and flagged; this ADR changes where a claim lives, not how identities merge.

### 4. Validation-layer ownership

This ADR relocates fields; it must not relocate slice responsibilities. Each validation obligation above belongs to exactly one layer, owned by the slice the approved plan already assigns it ([docs/m1-plan.md § 4](../m1-plan.md#4-proposed-implementation-slices)):

- **S1 — schema validation (`packages/shared`), the only currently authorized slice.** S1's Zod schemas validate **shape only**, with no I/O and no store access:
  - Subjects contain **exactly** `schemaVersion`, `identifier`, and `subjectKind`; any additional field is rejected.
  - Claim kind and subject kind **must match**; a mismatched pair is rejected.
  - Relationship claim endpoints must be **syntactically valid Entity identifiers** (well-formed per the ADR-0014 identifier scheme, `atlast:entity:…`).
  - S1 performs **no repository lookups** and does **not** prove that a referenced subject exists. A schema cannot see the store; pretending otherwise would smuggle repository behavior into S1 and expand the slice beyond its authorization.
- **S2 — repository contract.** The repository interfaces and their storage-agnostic contract-test suite **define** the referential-integrity requirement: every relationship claim's source and target identifiers resolve to existing Entity subjects. S2 states the obligation and its contract tests; it does not implement storage.
- **Later implementing slices.** The repository implementation (S6, where the in-memory stores land) must **satisfy** the S2 contract tests when it lands. Likewise, conflict coexistence and reconciliation behavior are proven by S5, and content-address computation by S4/S6 — each by its already-assigned slice per the approved plan, **none pulled into S1**.

### 5. Relationship to ADR-0014 and ADR-0015

- ADR-0019 **amends and overrides only the conflicting subject/type clauses of ADR-0014** — the "typed, identified thing" / "carries only identity and type" wording for Entity subjects, the "directed, typed connection referencing exactly two stable endpoint Entity identifiers" wording for Relationship subjects, the "identity and type only" repetition in its Alternatives section, and invariant 4's subject-level referential-integrity phrasing (now per-claim, per § 3) — **and the dependent wording in ADR-0015** that assumes typed subjects (its conflict example describing "different types for one entity" as a subject-level fact; the semantics of that example — coexisting conflicting claims, no winner — are preserved and strengthened).
- **All other accepted decisions and authorization boundaries remain intact**: content addressing, immutability and revision-not-mutation, provenance/confidence/freshness semantics, the identifier scheme, validation and `schemaVersion` rules, package boundaries, the reconciliation policy `m1-v1`, temporal semantics (ADR-0016), the query surface (ADR-0017 — unaffected in practice, since subjects were already "never serialized bare"), storage (ADR-0018), and the slice gating of M1 implementation.
- **With ADR-0019's acceptance (2026-07-23)**, ADR-0014's and ADR-0015's metadata and their [index entries](README.md) are marked **"Accepted; amended by ADR-0019"**. The markers are **metadata-only**: their accepted decision text is preserved verbatim — accepted ADRs are never silently rewritten ([docs/m1-plan.md § 10](../m1-plan.md#10-protected-files-and-prohibited-actions-during-m1-implementation)); this document is the sole normative source for what changed.

## Alternatives Considered

- **Keep type on the subject; treat a type conflict as two subjects** — preserves ADR-0014's wording, but fragments one stable identity into several the moment sources disagree, which is exactly the identity-churn failure ADR-0014's own Alternatives section rejects ("conflicting claims about one thing become two things"). Rejected.
- **Keep a singular type on the subject as the "current best" claim, with conflicts recorded alongside** — the conventional CMDB compromise. Rejected: the subject field is then a silently selected winner, the highest-severity defect ADR-0014 defines; every read of the subject would launder the conflict away.
- **Make the subject's type field a set of all claimed types** — avoids picking a winner but turns the subject into a mutable claim aggregate: it would need updating as claims arrive, breaking "subjects are not facts" and re-introducing the mutable-record shape ADR-0014 rejects. Endpoint sets on Relationship subjects fail the same way, worse.
- **Collapse subjects into assertions entirely** (no subject records at all) — already considered and rejected by ADR-0014 for identity-churn reasons; this ADR keeps the subject, just strips it to pure identity.
- **Split Relationship endpoints from type: endpoints on the subject, type on the claim** — tempting because endpoints feel identity-like, but endpoints are still evidence-derived facts sources can disagree on, and a subject holding them silently wins endpoint conflicts. Rejected for the same reason as type; direction and endpoints live in the claim.

## Tradeoffs

- **Chosen:** structural honesty — the conflict-preservation guardrail becomes unrepresentable to violate; the evidence-in/assertions-out boundary applies uniformly to every fact including type; S1 schemas have one unambiguous shape to implement.
- **Given up:** subject records alone are no longer self-describing — knowing what kind of thing an entity is always requires reading its assertions. This is mild in practice: ADR-0014 and ADR-0017 already forbid subjects from appearing without their assertions on every read path, so no consumer ever holds a bare subject. Traversal and type-filtered queries must consult claims rather than subject fields; at M1 fixture scale this costs nothing measurable.

## Consequences

- **S1 is unblocked by this acceptance** and implements subjects and claims as defined here — schema validation only, within the § 4 layer split. S1 remains the only authorized slice; S2–S8 remain gated on per-slice release.
- ADR-0014 and ADR-0015 metadata and index entries are marked "Accepted; amended by ADR-0019" (§ 5); [docs/m1-plan.md](../m1-plan.md) S1 wording ("Entity/Relationship subjects" schemas) is read as identity-only subjects plus the claim union; the fixture scenario catalog is unchanged (scenario 3's conflicting-types case becomes representable exactly as written).
- ADR-0016 is untouched: canonical serialization, snapshot identity, and the replay invariant operate on the same identifying content, now with the claim's composition made explicit.
- ADR-0017 is untouched: subjects were already serialized only with their supporting revisions; responses gain no new shape, and type filters (if any query family grows them later) bind to claims.
- ADR-0018 is untouched: the contract-test suite exercises the same interfaces; the per-claim referential-integrity invariant joins the suite in S2 as planned.

## Risks

- **Amendment precedent.** Amending accepted ADRs could normalize relitigating settled decisions. Mitigation: this ADR amends only a demonstrated internal contradiction between two accepted documents — a defect by the project's own definition ("a contradiction between docs is a defect," [CLAUDE.md](../../CLAUDE.md)) — and changes no authorization boundary; the amendment markers require human acceptance.
- **Claim-union sprawl.** The discriminated union could accrete claim kinds beyond entity/relationship. Mitigation: M1 defines exactly the two kinds; any new claim kind is a schema-version-incrementing change and ADR-worthy per ADR-0014's versioning rules.
- **Consumers assuming a singular type.** M2+ UI work might expect `entity.type`. Mitigation: the query API (ADR-0017) never returned bare subjects, so no such field ever existed on the wire; M2 designs against the assertion-bearing response shape.

## Testable Invariants and Acceptance Evidence

Invariants extending (not replacing) the ADR-0014 list. Per § 4, **each invariant names the validation layer that owns it and the slice that proves it** — no invariant is owed by S1 beyond schema validation:

1. **S1 — schema validation:** `EntitySubject` and `RelationshipSubject` schemas validate exactly `{schemaVersion, identifier, subjectKind}` and reject any record carrying a type, endpoint, ownership, or other claim-bearing field (subject-purity rejection test).
2. **S1 — schema validation:** an entity claim attached to a `subjectKind: "relationship"` subject — and vice versa — is rejected at schema validation (claim/subject kind-mismatch test).
3. **S1 — schema validation:** relationship claim endpoint identifiers that are not syntactically valid Entity identifiers (malformed, or not in the `atlast:entity:…` namespace) are rejected at schema validation (endpoint-syntax rejection test). **No existence check** — schema validation performs no repository lookup.
4. **S2 defines, S6 proves — repository contract:** every relationship claim's source and target identifiers resolve to existing Entity subjects; a claim referencing a missing or non-entity subject is rejected by the repository (per-claim referential-integrity contract test, superseding the subject-level form of ADR-0014 invariant 4; the requirement and its storage-agnostic contract tests are defined in S2, and the repository implementation satisfies them when it lands in S6).
5. **S5 — reconciliation:** two assertion revisions asserting incompatible classifications for one Entity subject coexist, each with its own provenance and confidence, joined by a conflict structure; no read path exposes a subject-level type (restates ADR-0014 invariant 5 at the claim level).
6. **S5 — reconciliation:** two assertion revisions asserting incompatible types or endpoints for one Relationship subject coexist under the same rule.
7. **S4/S6 — content addressing:** the canonical claim participates in the content-addressed identifier: altering only the claim's type or an endpoint produces a different assertion identifier (extends ADR-0014 invariant 9; canonical serialization lands in S4, identifier computation is exercised end-to-end in S6).

**Acceptance evidence at review time:** this document, read against ADR-0014 §§ "Concept boundaries"/"Lifecycle without destructive deletion" and ADR-0015 § "Conflict", demonstrating the contradiction and that every other accepted invariant survives the amendment unchanged.

## Dependencies on Other ADRs

- **Amends:** ADR-0014 (the subject/type and subject-level endpoint clauses only) and ADR-0015 (dependent typed-subject wording only).
- **Preserves and depends on:** ADR-0005 (Zod single-source schemas), ADR-0014 (all other decisions), ADR-0015 (reconciliation semantics), ADR-0016 (canonical serialization and snapshot identity), ADR-0017 (assertion-bearing response shapes), ADR-0018 (contract-test suite).

## Why This Fits Atlast

- **Fail honest, structurally:** the "silently chosen winner" defect becomes impossible to express, not merely forbidden — the strongest available form of the guardrail.
- **Evidence in, assertions out, uniformly:** no fact — not even type — exists outside an evidence-backed assertion.
- **Boring core:** the change is a relocation of two fields into an already-mandated structure (the canonical claim), not a new mechanism.

## Conditions That Would Justify Changing This Decision

- A demonstrated M2 interactive-scale cost of resolving type via claims on every traversal filter — would motivate a derived (never authoritative) subject-side index as an ADR-0018 evolution, not a model change.
- The domain vocabulary in PROJECT_SPEC.md § 4 changing what Entity or Relationship mean (spec change first, model follows).
- Real-source evidence (M5+) revealing identity kinds beyond entity/relationship — a schema-version increment and its own ADR.
