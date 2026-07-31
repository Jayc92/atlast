# ADR-0021: JCS Canonicalization Clarifications — Raw UTF-16 Property Ordering, Null Preservation, and the Generic-Serializer/Payload-Builder Boundary

**Status:** Accepted — amends the canonical-serialization clauses of ADR-0016
**Date:** 2026-07-31

> **Approval note (2026-07-31):** **Accepted by Joseph Carfagno on 2026-07-31 after independent review.** This ADR amends **only** ADR-0016's canonical-serialization clauses (raw UTF-16 property ordering; the scope of the omitted-vs-null rule); all reviewed decision content below is preserved as accepted, and ADR-0016 carries a metadata-only amendment notice per the ADR-0019/ADR-0020 discipline — its accepted text is unchanged. **Acceptance resolves the S4 pre-release blocker** recorded in [TASKS.md](../../TASKS.md): Slice S4 was explicitly human-authorized on 2026-07-31 and is now released, with implementation **effective only after the documentation PR recording this acceptance and release merges to `main` and `main` is synchronized locally with a clean working tree**. Acceptance does not imply approval of any future S4 implementation output, which still requires implementation, independent review, passing local verification, PR/CI, merge, and checkpoint closeout. **S5–S8 and M2+ remain gated and unauthorized.**

## Context

ADR-0016 (accepted) pins the M1 canonical serialization to **RFC 8785 (JSON Canonicalization Scheme, JCS)** as `jcs-rfc8785` in the derivation policy, and states Atlast-specific data rules on top of it. Slice S1 (merged, PR #7) fixed the domain schemas that canonicalization will consume — including `jsonValueSchema` (`packages/shared/src/json-value.ts`), which intentionally accepts JSON `null` in Evidence's source-native detail and rejects everything JSON cannot represent (`undefined`, `NaN`, infinities, dates, functions), with `null` acceptance explicitly tested (`packages/shared/src/json-value.test.ts`). Slice S4 — the slice that will implement the canonical-serialization primitives — was human-authorized on 2026-07-31, making this the last point at which the design can be corrected before any implementation exists.

Pre-implementation review found that two clauses of ADR-0016's canonical-serialization section contradict the very standard they pin and the already-merged S1 contract:

1. **"Object keys sorted lexicographically by Unicode code point (per JCS)"** — RFC 8785 § 3.2.3 actually requires property names to be sorted as arrays of **raw UTF-16 code units**, not Unicode code points. The two orderings differ for names containing characters outside the Basic Multilingual Plane: a supplementary character (e.g., `𝄞`, U+1D11E) has a code point above U+FFFF but is encoded as a surrogate pair whose first unit (U+D834) sorts _below_ BMP characters in the range U+E000–U+FFFF. A "code point" implementation would disagree with every conformant JCS implementation on such inputs — and checksum agreement with independent implementations is precisely what ADR-0016 invariant 1 demands.
2. **"`null` never appears in canonical serialization"** — JCS itself serializes JSON `null` (RFC 8785 § 3.2.1.1), and the merged S1 `jsonValueSchema` deliberately accepts `null` inside source-native Evidence detail. A generic serializer that globally strips or rejects `null` could not canonicalize valid S1 data and would silently alter payload meaning — the exact failure the JSON-safety tests exist to prevent.

## Problem

Clarify ADR-0016's canonical-serialization contract so that the S4 implementation conforms to RFC 8785 as published and to the merged S1 schemas — before a line of it is written — without weakening any accepted temporal, snapshot, or determinism decision, and while keeping the S4/S6 slice boundary explicit.

## Decision

### 1. Property ordering is raw UTF-16 code-unit order

- Object property names are sorted lexicographically as **arrays of raw UTF-16 code units**, exactly as RFC 8785 § 3.2.3 specifies. This — not Unicode code-point order — is the normative ordering; ADR-0016's "by Unicode code point" wording is corrected to this reading.
- **No locale-sensitive comparison, `localeCompare`, Unicode normalization, or Unicode code-point comparator may be used** in any ordering path — property ordering or collection ordering.
- **Native JavaScript string comparison is permitted only through an explicit locale-free comparator** equivalent to `a < b ? -1 : a > b ? 1 : 0` (ECMAScript's `<`/`>` on strings compare raw UTF-16 code units, which is exactly the required ordering). This decision is closed: the implementation uses this explicit comparator form, not bare relational operators scattered through sorting call sites, and tests it against cases where code-unit and code-point order differ.
- **Any array sorting operates on a copy** — never in place on a caller-owned array.
- **Lone Unicode surrogates are rejected as invalid input** with an explicit error. Well-formed input never contains an unpaired surrogate, so rejection — never silent replacement with U+FFFD or pass-through — is the only honest behavior ([GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards): no silent coercion).

### 2. Null is preserved; undefined is rejected; omission stays a domain rule

- **JCS supports explicit JSON `null`, and the generic JCS serializer must preserve it** wherever it appears in its input. A generic serializer that drops, rewrites, or rejects `null` would contradict both RFC 8785 and the merged S1 `jsonValueSchema`, which intentionally permits `null` in source-native Evidence detail.
- **Optional absent domain fields remain omitted entirely** — ADR-0016's omitted-vs-null rule survives as a rule about what Atlast domain payloads _contain_, enforced by the domain schemas and payload builders, not by the serializer. Domain payload builders may prohibit `null` for fields whose schema prohibits it; the generic serializer may not globally contradict `jsonValueSchema`.
- **`undefined` is not JSON and must be rejected with an explicit error, never silently converted** to `null`, skipped, or omitted by the serializer. (The `JSON.stringify` behavior of silently dropping `undefined` object properties is exactly the silent coercion this project prohibits.)
- **Source-native Evidence detail may contain `null`** because the accepted S1 schema permits it. Nothing in this ADR adds source-native detail to GraphAssertion identifying content: what the content address covers is fixed by ADR-0014 § "Identity" (derivation version, subject identifier, canonical claim, validity interval, sorted provenance identifiers, rule trace, conflict/ambiguity state), and this ADR neither extends nor implies extension of that list.

### 3. Arrays: base JCS preserves order; Atlast collection ordering belongs to payload builders

- **Base JCS preserves array order and never sorts arrays** (RFC 8785 § 3.2.2). The generic canonical serializer must never guess collection semantics or reorder any array it is given.
- **Atlast's collection-ordering rules (ADR-0016) are payload-builder responsibilities**: the code that assembles a snapshot or assertion payload sorts named collections **before** JCS serialization —
  - subjects by subject identifier;
  - assertion revisions by assertion identifier;
  - provenance by Evidence identifier.
- **S4 supplies the ordering helpers; later slices compose them.** S4 implements and tests only **reusable, pure, non-mutating collection-ordering helpers**: a copied-array identifier ordering helper using exact locale-free UTF-16 comparison, deterministic under shuffled input, never mutating caller-owned arrays or their elements. The payload builders themselves are future-slice composition:
  - **S5** must use and test these helpers when constructing GraphAssertion identifying payloads, including provenance order;
  - **S6** must use and test these helpers when constructing snapshot canonical payloads, including subject and assertion-revision order.
- **Current Atlast identifiers are lowercase ASCII** (S1 identifier grammar: lowercase kebab-case segments; assertion digests: lowercase hex — `packages/shared/src/identifiers.ts`), so UTF-16 code-unit order and Unicode code-point order are **equivalent for those identifiers today**; ADR-0016's "ascending by code point" collection wording is therefore correct in effect for current data. Any **future identifier-alphabet expansion must explicitly preserve deterministic ordering** — stating its comparator in UTF-16 terms — through its own reviewed contract change.

### 4. Input and encoding contract

- **The public generic canonicalization boundary accepts unknown runtime input** and operates on **in-memory values, never arbitrary raw JSON text**. Parsing raw text, if ever needed, is a separate concern with its own validation.
- **JSON-value validation reuses the merged S1 contract as the single source of truth**: the boundary validates unknown input with `jsonValueSchema` (`packages/shared/src/json-value.ts`) rather than independently redefining what a JSON-valid type is. S4 must **not** create a second, competing JSON schema; the S1 schema decides what counts as a JSON value, and this ADR adds only serialization-layer conditions on top of it.
- **After JSON-value validation, the boundary recursively validates the JCS-specific conditions** the S1 schema does not express — including well-formed Unicode in every string (no lone surrogates, § 1).
- **Explicit `null` remains valid** (§ 2). By contrast:
  - an object property **explicitly present with the value `undefined`** is rejected;
  - an array containing `undefined` **or a sparse hole** is rejected — never silently converted to `null` (the `JSON.stringify` behavior);
  - `BigInt`, functions, symbols, `NaN`, the infinities, and every other non-JSON runtime value are rejected with explicit errors.
- **Optional fields that are genuinely absent remain absent**: the serializer neither invents nor strips fields; what it validates is what it serializes.
- **Numbers must be finite IEEE-754 doubles**, serialized by the JCS/ECMAScript number-to-string algorithm (RFC 8785 § 3.2.2.3).
- **UTF-8 output carries no BOM and no insignificant whitespace** (restating ADR-0016's encoding rule).
- **Strings are preserved without Unicode normalization** — no NFC/NFD/NFKC/NFKD transformation anywhere in the canonicalization path; the bytes the payload declares are the bytes that are hashed.
- **SHA-256 output is lowercase hexadecimal** wherever a digest is requested (matching the S1 assertion-identifier grammar's 64 lowercase hex characters).
- **The serializer and hashing operations are pure**: they must not read time, randomness, filesystem state, network state, locale, or process-global mutable state, and must not mutate their input ([GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards) determinism rule).

### 5. Versioning consequence: `jcs-rfc8785` stands

- This clarification **aligns the unimplemented design with RFC 8785 as published and with the already-merged S1 schema**. No snapshot, canonical serializer, or derivation policy has been implemented or published — there is no existing output anywhere that this correction could change.
- **The serialization token remains `jcs-rfc8785`**: the amendment corrects the design to conform to the named standard, rather than changing the behavior of an existing implementation. A token bump now would falsely imply a superseded implementation existed.
- **Any future canonicalization change made after implementation exists would require a new derivation version**, exactly per ADR-0016 invariant 3 — this ADR consumes the last opportunity to correct the contract without one.

### 6. S4/S6 boundary

**S4 may implement only** (upon its separate implementation release — see the authorization note):

- deterministic Evidence ordering by `observedAt` then `recordedSequence` (ADR-0016's total order);
- immutable/non-mutating ordering and horizon-selection primitives;
- half-open validity-interval **membership helpers** operating on explicit timestamps supplied by the caller — **membership evaluation only**: these helpers may not create, derive, close, merge, split, or mutate validity intervals (this decision is closed; interval derivation is S5);
- RFC 8785 canonical-serialization primitives per this ADR;
- deterministic Atlast collection-ordering **helpers** (§ 3) — reusable, pure, non-mutating, copied-array, tested for determinism under shuffled input and for non-mutation of caller-owned arrays and elements;
- SHA-256 canonical-digest primitives (§ 4);
- focused tests, including the official RFC 8785 vectors.

**S4 must not implement:**

- reconciliation or identity matching (S5);
- confidence or freshness computation (S5);
- derivation policy `m1-v1` (S5);
- GraphAssertion derivation or **GraphAssertion payload builders / reconciliation output assembly** (S5);
- validity-interval **derivation** from Evidence (S5 — S4's interval helpers only evaluate membership for explicitly given intervals);
- snapshot construction, **snapshot payload builders / snapshot assembly**, replay, or storage (S6);
- repository implementations (S6);
- API routes or frontend behavior (S7);
- any S5+ work.

**Composition obligations fall to the later slices, each under its own separate authorization:** S5 must use and test the S4 ordering helpers when constructing GraphAssertion identifying payloads (including provenance order); S6 must use and test them when constructing snapshot canonical payloads (including subject and assertion-revision order), and remains responsible for composing all S4 primitives into snapshots, replay, checksums-on-snapshots, and the repository implementations that the S2 contract suite proves. **S4 proves helper correctness and non-mutation; S5/S6 prove payload-builder composition.**

### 7. Decisions closed at review

Human review of this proposal closed the three implementation choices it had left open, so no open implementation choice remains:

- **The serialization token stays `jcs-rfc8785`** (§ 5) — no prior implementation or published canonical output exists, so the amendment conforms the design to the named standard rather than superseding an implementation.
- **S4 validity helpers evaluate membership only** (§ 6) — they may not create, derive, close, merge, split, or mutate validity intervals; interval derivation is S5.
- **Native JavaScript string comparison is permitted only through the explicit locale-free comparator** equivalent to `a < b ? -1 : a > b ? 1 : 0` (§ 1); any array sorting operates on a copy; `localeCompare` and Unicode normalization remain forbidden everywhere in the canonicalization path.

## Alternatives Considered

- **Leave ADR-0016's wording and let S4 implement "Unicode code point" ordering as written** — no documentation churn. Rejected: it ships a knowingly non-conformant "JCS" whose checksums disagree with every correct RFC 8785 implementation on supplementary-plane property names, violating ADR-0016 invariant 1 (independent implementations agree) while claiming the standard's name.
- **Edit ADR-0016 in place** — smallest diff. Rejected: accepted ADRs are never edited (GUARDRAILS.md § 1.3, [docs/m1-plan.md § 10](../m1-plan.md#10-protected-files-and-prohibited-actions-during-m1-implementation)); the ADR-0019/ADR-0020 precedent is a new amending ADR plus a metadata-only notice on the amended one after acceptance.
- **Globally ban `null` from all canonicalizable data to preserve ADR-0016's "null never appears" sentence** — keeps the sentence true by fiat. Rejected: it contradicts the merged, human-approved S1 `jsonValueSchema` (which deliberately accepts `null` in source-native detail), would require a breaking S1 schema change with no domain justification, and misreads the sentence's intent — which was the omitted-vs-null rule for _optional domain fields_, correctly preserved in § 2 as a payload rule rather than a serializer rule.
- **Have the generic serializer sort arrays too, so collection ordering is automatic** — less for payload builders to do. Rejected: JCS explicitly preserves array order because arrays are semantically ordered in general (rule traces are ordered; ADR-0015 § rule traces); a serializer that sorts every array corrupts ordered data, and one that guesses which arrays to sort is nondeterministic by configuration. Explicit builder-side sorting keeps semantics where the semantics are known.
- **Bump the serialization token (e.g., `jcs-rfc8785-v2`) out of caution** — maximal versioning hygiene. Rejected: nothing has been implemented or published under the current token; bumping it would fabricate a phantom predecessor version and complicate the derivation-policy story for no reproducibility benefit (§ 5).
- **Replace lone-surrogate rejection with U+FFFD replacement (the Unicode default)** — maximally accepting. Rejected: silent replacement changes hashed bytes without the caller knowing — silent coercion, the project's highest-severity defect class. Validated domain data never contains lone surrogates, so rejection costs nothing legitimate.

## Tradeoffs

- **Chosen:** a canonical-serialization contract that conforms to RFC 8785 as published, agrees with independent implementations, respects the merged S1 schemas, and fixes the generic-serializer/payload-builder responsibility split before any code exists.
- **Given up:** documentation simplicity (ADR-0016's serialization section must now be read with this amendment) and a second amendment ADR in the index — the accepted-ADRs-are-immutable discipline makes that the standing cost of correcting accepted text.

## Consequences

- Upon acceptance, ADR-0016 gains a metadata-only amendment notice pointing here; its accepted text is preserved verbatim, and this document becomes the sole normative source for the corrected ordering and null rules. The ADR index marks 0016 "amended by ADR-0021".
- The S4 implementation, when separately released, implements property ordering, null handling, input validation, and purity per §§ 1–4, inside the § 6 boundary.
- The S2 contract surface, S3 fixture catalog, and all S1 schemas are unchanged: this ADR touches design prose only, and its null/ordering rules already agree with the merged code.
- ADR-0014's content-addressing description is unaffected: what goes into an assertion digest is unchanged; only the serialization rules those bytes obey are clarified.

## Risks

- **Amendment fatigue** — third amendment ADR in the set. Mitigation: like ADR-0019 and ADR-0020, this amends only demonstrated contradictions (against an external standard and merged code), moves no gate, and requires human acceptance to take effect.
- **UTF-16 ordering is subtle and easily mis-tested.** Mitigation: the testable invariants below require the official RFC 8785 test vectors plus targeted cases where code-unit and code-point order demonstrably differ; a reviewer can check the explicit comparator (§ 1, § 7) against the RFC directly.
- **Payload-builder sorting could be forgotten in S5/S6 composition**, since the generic serializer deliberately won't do it. Mitigation: invariants 13–14 below bind S5 and S6 to use and test the S4 helpers in their payload builders; ADR-0016 invariant 1's cross-implementation checksum agreement fails loudly if ordering drifts.

## Testable Invariants and Acceptance Evidence

**S4 must prove, at minimum** (helper and serializer correctness at the public boundary):

1. **Official RFC 8785 vectors:** the serializer reproduces the RFC 8785 appendix test vectors byte-for-byte.
2. **UTF-16 property-order edge cases:** property-name sets where raw UTF-16 code-unit order differs from Unicode code-point order (BMP names in U+E000–U+FFFF versus supplementary-plane names) serialize in code-unit order, via the explicit locale-free comparator (§ 1).
3. **Explicit null preservation:** `null` values in input (including nested in source-native detail shapes) appear as `null` in canonical output.
4. **Undefined and sparse-hole rejection at the public boundary:** an object property explicitly present with the value `undefined`, an array element that is `undefined`, and a sparse array hole are each rejected with an explicit error — never dropped, silently converted to `null`, or omitted by the serializer.
5. **Invalid-runtime-input rejection at the public boundary:** unknown runtime input is validated through the S1 `jsonValueSchema` (never a second competing schema) plus the recursive JCS-specific checks; lone surrogates, `NaN`, positive and negative infinity, `BigInt`, functions, symbols, and every other non-JSON runtime value are rejected with explicit errors.
6. **Number serialization:** negative zero, integer, fraction, and exponent boundary cases serialize exactly per the JCS/ECMAScript algorithm.
7. **Encoding:** output bytes are UTF-8 with no BOM and no insignificant whitespace.
8. **Array order preservation:** the generic serializer emits arrays in given order, proven with deliberately unsorted input.
9. **Ordering-helper correctness:** the copied-array identifier ordering helper sorts by exact locale-free UTF-16 comparison, is deterministic under shuffled input, and returns a new array without mutating the caller-owned array or its elements.
10. **Digest vectors:** SHA-256 digests are lowercase hexadecimal and match known vectors over canonical bytes.
11. **Repeated-call byte identity:** serializing the same value twice (and across process restarts) yields identical bytes.
12. **No caller mutation:** serialization and sorting helpers do not mutate caller-owned objects or arrays (input deep-equal before and after).

**S5/S6 must prove, when those slices are separately authorized** (payload-builder composition):

13. **S5 — assertion payload composition:** GraphAssertion identifying payloads are built with the S4 ordering helpers, provenance sorted by Evidence identifier, deterministic under shuffled input.
14. **S6 — snapshot payload composition:** snapshot canonical payloads are built with the S4 ordering helpers, subjects sorted by subject identifier and assertion revisions by assertion identifier, deterministic under shuffled input.

**Acceptance evidence at review time:** this document read against RFC 8785 §§ 3.2.1.1, 3.2.2, and 3.2.3, ADR-0016's canonical-serialization section, and the merged S1 sources `packages/shared/src/json-value.ts`, `json-value.test.ts`, and `identifiers.ts` — demonstrating both contradictions and that every other ADR-0016 decision survives unchanged.

## Dependencies on Other ADRs

- **Amends:** ADR-0016 — only the canonical-serialization clauses identified here (property-ordering wording; the omitted-vs-null sentence's scope). Every other ADR-0016 decision — the bitemporal axes, `recordedSequence`, horizons, snapshot identity, validity/freshness separation, total order, replay — stands unchanged.
- **Preserves and depends on:** ADR-0014 as amended by ADR-0019 (content-addressed identifying content, identifier grammar), ADR-0015 (ordered rule traces; the derivation policy that pins the serialization token), ADR-0005 (Zod schemas as the single shape source — `jsonValueSchema`), and the merged S1/S2/S3 slices.

## Why This Fits Atlast

- **Fail honest:** every ambiguous input (lone surrogate, `undefined`, non-finite number) is a loud rejection, never a silent guess — the serializer inherits the project's highest-severity defect rule.
- **Determinism with receipts:** conformance to the published RFC means independent implementations can verify Atlast's checksums, making snapshot identity checkable rather than asserted.
- **Boring core:** the correction adopts the standard as written instead of maintaining a private dialect of it.

## Conditions That Would Justify Changing This Decision

- Acceptance review finding that any clarified rule contradicts an accepted contract not identified here — would require revising this proposal before acceptance.
- A future identifier-alphabet expansion beyond lowercase ASCII — triggers the § 3 explicit-ordering review in its own contract change.
- Any post-implementation canonicalization change — requires a new derivation version per § 5 and ADR-0016 invariant 3, never an in-place redefinition of `jcs-rfc8785`.
