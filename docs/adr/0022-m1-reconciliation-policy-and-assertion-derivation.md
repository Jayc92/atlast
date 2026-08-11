# ADR-0022: M1 Reconciliation Policy and Assertion Derivation — the Complete `m1-v1` Contract

**Status:** Accepted — closes the S5 implementation gaps of ADR-0015 (no accepted decision text changes); amended by ADR-0025
**Date:** 2026-07-31

> **Approval note (2026-08-05):** **Explicitly accepted by Joseph Carfagno on 2026-08-05 after independent review.** This ADR is the **binding `m1-v1` reconciliation specification** — the executable contract the S5 implementation and its review are measured against. **Acceptance authorizes M1 Slice S5 only**, within the § 14 boundary; **S5 becomes effective only after this documentation record merges to `main` and `main` is synchronized locally with a clean working tree** — no S5 file may be created before that. Acceptance does not imply approval of future S5 implementation output, which still requires implementation, independent review, passing local verification, PR/CI, merge, and checkpoint closeout. **S6–S8 and M2+ remain gated and unauthorized.** No accepted ADR's decision text is edited: ADR-0014 and ADR-0015 carry the metadata-only amendment notices described in § "Relationship to Accepted ADRs", applied with this acceptance per the ADR-0019/0020/0021 discipline.

> **Amendment notice (2026-08-11):** [ADR-0025](0025-s7-source-alias-erasable-syntax-compatibility.md) (**Accepted** 2026-08-11) amends this ADR via a metadata-only notice: §§ 2–3 define `IdentityNormalizationError`'s role (thrown for every normalization failure, naming the offending Evidence identifier and failing key) without specifying the class's internal field-declaration syntax. ADR-0025 pins that syntax detail — replacing the class's two constructor parameter properties with `declare readonly` fields plus explicit constructor assignment — solely so `packages/graph-model/src/identity-normalization.ts` satisfies `apps/api`'s `erasableSyntaxOnly` compiler option (ADR-0011) once actually imported through the ADR-0024 § 14 step 5 source alias; it changes nothing about the error's semantics, message content, construction API, or the normalization algorithm this ADR defines. This ADR's decision text below is **preserved verbatim**; ADR-0025 is the sole normative source for the syntax detail it adds.

## Context

ADR-0015 (accepted, amended by ADR-0019) fixed M1 reconciliation's shape: a pure, deterministic, rules-first function of (ordered Evidence set, derivation policy `m1-v1`), producing stable subjects and content-addressed GraphAssertion revisions with corroboration-driven confidence, coexisting conflicts, flagged ambiguity, and idempotent replay. ADR-0016 (accepted, amended by ADR-0021) fixed the temporal semantics those revisions live in, and Slice S4 (merged, PR #16) delivered the serialization, ordering, digest, and interval-membership primitives S5 must compose. Slices S1–S3 fixed the schemas, contracts, and fixture catalog reconciliation consumes.

Pre-implementation review of ADR-0015 against the merged schemas (`packages/shared/src/assertions.ts`, `claims.ts`, `evidence.ts`, `identifiers.ts`, `subjects.ts`), the S4 primitives (`packages/graph-model/src/index.ts`), and the seven fixture scenarios found that ADR-0015 deliberately left implementation-critical details open — normalization edge semantics, the alias data itself, identifier construction, claim grouping, conflict symmetry, validity derivation, rule-name vocabulary, the exact content-addressing payload, and the reconciliation function boundary. Left unresolved, each is a place where two correct-looking implementations produce different bytes — and byte-identical replay is ADR-0015 invariant 1 and ADR-0016 invariant 1.

## Problem

Specify every input that shapes reconciliation output — precisely enough that independent implementations of S5 produce byte-identical subjects, assertion revisions, content-addressed identifiers, confidences, conflicts, ambiguity markers, and rule traces from the same Evidence and policy — while preserving the accepted intent of ADRs 0014, 0015, 0016, 0019, and 0021 and keeping the S5/S6 boundary explicit.

## Decision (accepted 2026-08-05)

### 1. The `m1-v1` derivation-policy document

- **Location and shape:** one TypeScript module, `packages/graph-model/src/derivation-policy.ts`, exporting a single deeply frozen (`Object.freeze`, applied recursively) constant `M1_V1_DERIVATION_POLICY` with complete type annotations. The policy is **data reviewed like a contract** (ADR-0015): S5 code reads it; nothing mutates it.
- **Fields (exact):**
  - `schemaVersion: "atlast-domain-v1"` — the S1 schema version this policy pairs with;
  - `derivationVersion: "m1-v1"` — the token pinned into every assertion and snapshot identity;
  - `serializationVersion: "jcs-rfc8785"` — per ADR-0016 as amended by ADR-0021;
  - `digestAlgorithm: "sha-256"` — lowercase-hex output per ADR-0021 § 4;
  - `normalizationRules` — the exact ordered token list, stored literally as
    `["unicode-nfc", "ascii-lowercase", "trim-whitespace", "collapse-whitespace-to-hyphen", "strip-decorative-affixes-single-pass", "assert-lowercase-ascii-identifier-grammar"]`
    (the § 2 steps, one token per step, in execution order);
  - `whitespaceCodePoints` — the explicit reviewed trim/collapse whitespace set, stored literally as `[0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020]` (tab, LF, VT, FF, CR, space) — **no open-ended Unicode property reference**;
  - `decorativeAffixes` — `{ prefixes: ["svc-", "service-"], suffixes: ["-svc", "-service"] }` (ADR-0015's declared `m1-v1` list, split by position);
  - `aliases` — the § 4 alias entries;
  - `confidence` — `{ base: 0.5, span: 0.4 }` (the § 8 constants, labeled uncalibrated per ADR-0015);
  - `freshness` — `{ staleAfterDays: 7, historicalAfterDays: 30 }`;
- **Validation and immutability:** compile-time type annotations plus S5 unit tests assert the exact field values, deep frozenness, and internal consistency (affixes lowercase and non-empty; alias keys normalized-form and distinct; thresholds strictly increasing). No runtime schema library is added to `packages/graph-model` for this — the shared package's Zod schemas validate reconciliation **output** (§ 11); the policy constant is proven by tests. **Changing any field is a new derivation version** (`m1-v2`, …) per ADR-0015; the fixture catalog's `m1-v2` snapshot-identity seed exists to prove exactly that pinning, not to define a second policy.

### 2. Identity normalization — exact semantics

Normalization maps a source-native identity string to a **normalized identity key** by these ordered steps — exactly the `normalizationRules` tokens of § 1, exactly once each, in this order. Every step is pinned to literal data or ASCII-only mappings so the result is **independent of runtime locale and of Unicode-property-table drift across runtime versions**:

1. **`unicode-nfc`** — Unicode NFC normalization, applied once (required by accepted ADR-0015 rule 1). Normalization is **not** re-applied after any later step; any later-step output that would need re-normalization falls through to step 6's grammar check and is rejected loudly rather than silently re-normalized.
2. **`ascii-lowercase`** — **ASCII-only case mapping**: code points `U+0041`–`U+005A` (`A`–`Z`) map to `U+0061`–`U+007A` (`a`–`z`); **every other code point is left unchanged**. No `toLowerCase`, `toLocaleLowerCase`, or any Unicode/locale case mapping is used — non-ASCII letters are deliberately not lowercased and will fail step 6's grammar check unless step 1's NFC already mapped the input to allowed characters. (This is the same ASCII-only mapping discipline ADR-0020 § 3 fixed for search normalization.)
3. **`trim-whitespace`** — remove leading and trailing code points that are members of the policy's explicit `whitespaceCodePoints` list (§ 1: tab `U+0009`, LF `U+000A`, VT `U+000B`, FF `U+000C`, CR `U+000D`, space `U+0020`). **No Unicode `White_Space` property lookup** — the set is closed, literal, reviewed policy data; exotic Unicode spaces (e.g. `U+00A0`, `U+2003`) are _not_ whitespace under `m1-v1` and fall through to step 6 rejection.
4. **`collapse-whitespace-to-hyphen`** — replace every maximal internal run of one or more `whitespaceCodePoints` members with a single `-` (U+002D).
5. **`strip-decorative-affixes-single-pass`** — strip **at most one prefix** (the first entry of `decorativeAffixes.prefixes`, in declared order, that the key starts with) and then **at most one suffix** (the first entry of `decorativeAffixes.suffixes`, in declared order, that the remaining key ends with). Stripping is **not repeated** — no fixpoint iteration; `service-svc-checkout` strips `service-` only, leaving `svc-checkout` as the key (the fixtures contain no such stacked case; the rule exists so behavior is defined, not discovered).
6. **`assert-lowercase-ascii-identifier-grammar`** — the resulting key must be non-empty and match the S1 identifier-segment grammar `[a-z0-9]+(-[a-z0-9]+)*`. **Every code point outside ASCII letters `a–z`, digits `0–9`, and hyphen `-` — including surviving uppercase, non-ASCII letters, exotic Unicode spaces, punctuation, and control characters — is handled exactly one way: deterministic loud rejection here.** A key that is empty (e.g. the entire identity was a decorative affix) fails the same way. Derivation throws an explicit error naming the offending Evidence identifier and the failing key; no hashing, transliteration, or fallback key is ever produced silently.

There is **no implementation-defined behavior and no open-ended character-class reference**: every step is either literal policy data or a pinned ASCII mapping, and every failure is a loud rejection. **Normalized-key identity is global**: two Evidence records whose identities normalize to the same key resolve to the same stable subject whether they come from different sources or from one source — the source name (`sourceScopedIdentity.source`) affects corroboration and conflict counting (§ 7), never the stable subject namespace. Fixture confirmation: `svc-checkout` → `checkout`; `Checkout Service` → `checkout-service` → `checkout`; `service-checkout` → `checkout`; `svc-orders` and `orders-service` → `orders`; `ledger-api` → `ledger-api`; `ledger` → `ledger`.

### 3. Stable subject identifier construction

- **Entity subjects:** `atlast:entity:<normalized-key>` — the normalized identity key becomes the single identifier segment, verbatim. **Identity depends on the normalized key alone, never on any evidence-derived claim**: entity type lives in the canonical claim (ADR-0019), so no type token may appear in the identifier. (ADR-0014's pre-ADR-0019 example `atlast:entity:service/checkout` embedded a type segment; under this ADR the checkout fixture entity is `atlast:entity:checkout`.)
- **Relationship subjects:** `atlast:relationship:<normalized-key>`, where the key is the § 2 normalization of the Relationship Evidence's **own top-level `sourceScopedIdentity.sourceNativeId`** — never the endpoint identities, which are claim content (ADR-0019). Fixture confirmation: `checkout-payment-call` → `atlast:relationship:checkout-payment-call`, which persists across scenario 6's target change so the endpoint switch produces new revisions on one stable subject, exactly as the catalog expects.
- **Conversion is verbatim:** a § 2-valid normalized key already satisfies the lowercase-ASCII identifier grammar, so construction is prefix concatenation — no escaping, hashing, truncation, or segment splitting. **Unrepresentable keys never reach construction**: § 2 step 6 already rejected them deterministically.
- **Determinism:** the same accepted Evidence set under the same policy always yields the same identifier for the same source-native identity; the identifier is a pure function of (source-native identity string, policy `m1-v1`).

### 4. Alias semantics

- **Structure:** `aliases` is a list of **directed** entries `{ fromKey, toKey, directionality }` over **normalized keys** (never raw source strings). `m1-v1` defines exactly two directionality values with distinct meanings:
  - `"merging"` — a bidirectional equivalence: Evidence whose key is `fromKey` resolves to `toKey`'s subject (and the entry is treated symmetrically). **`m1-v1` contains zero merging aliases** — every fixture merge is achieved by § 2 normalization alone.
  - `"one-directional"` — a **near-match declaration**: the two keys remain **separate subjects**, and each side's assertions are flagged ambiguous referencing the other (§ 5). Per ADR-0015, a one-directional alias is exactly the "partial or uncertain match" case — it never merges.
- **The exact `m1-v1` alias data:** one entry — `{ fromKey: "ledger-api", toKey: "ledger", directionality: "one-directional" }` — the approved scenario 5 ambiguity seed ([fixtures/demo-company/README.md](../../fixtures/demo-company/README.md)).
- **Integrity rules, validated by the § 1 policy tests:** no entry may have `fromKey === toKey`; no duplicate `(fromKey, toKey)` pair; no two merging entries may chain or cycle (transitive resolution is a single hop — `m1-v1` has no merging entries, so the rule is vacuously satisfied but stated for `m1-v2+`); no merging entry's resolution may collide two keys that normalization already maps to different subjects unless that is the reviewed intent of the entry.
- **Aliases are policy data, never Evidence** (ADR-0015): no alias appears in any provenance set, carries no timestamp, and flows through no store. **Changing alias data is a new derivation version.**

### 5. Ambiguity semantics

- **The deterministic near-match rule:** subjects A and B are near-matches iff a `one-directional` alias entry links their normalized keys (in either position). `m1-v1` has exactly one such pair: `ledger-api` / `ledger`.
- **Why scenario 5 is ambiguous rather than merged or unrelated:** the two keys are distinct under § 2 normalization (not merged), but the reviewed policy declares them one-directionally aliased — the honest output for "these might be the same service" is two stable subjects, each flagged (ADR-0015: "unresolved is the correct output"). Merging would silently pick an identity; ignoring the declared alias would hide reviewed knowledge.
- **No dangling references — both subjects must exist first:** an ambiguity marker is emitted **only when both near-match subjects exist in the derived state at the pinned horizon and event-time step**. A marker may never reference a subject absent from the derived subject set. Fixture confirmation: at **H7** (only the `ledger-api` record selected), `atlast:entity:ledger` does not exist, so `ledger-api`'s revision is **unambiguous**; at **H8** both records are selected — at the `2026-02-10T14:00:00.000Z` step only `ledger-api` exists (still unambiguous), and at the `2026-02-10T14:01:00.000Z` step `ledger` appears, which **changes identifying content** (`ambiguityState`) on both sides and therefore creates new revisions at that `observedAt` timestamp (§ 7/§ 9): `ledger-api`'s unambiguous revision closes at `14:01` and an ambiguous successor opens there; `ledger`'s first revision opens ambiguous.
- **Symmetry:** once both subjects exist, ambiguity links are **symmetric**. Every subsequent revision on `atlast:entity:ledger-api` carries `ambiguityState.status = "ambiguous"` with a near-match referencing `atlast:entity:ledger`, and vice versa — regardless of the alias entry's direction, which records provenance of the declaration, not visibility.
- **Exact reason text:** `one-directional-alias:<fromKey>-><toKey>` with the policy entry's own key order — for `m1-v1`, the literal string `one-directional-alias:ledger-api->ledger` on **both** sides (the reason names the policy entry; it is identical text on both subjects so the pair is trivially correlatable).
- **Ordering and deduplication:** `nearMatches` is deduplicated by `nearMatchSubjectIdentifier` and sorted by that identifier via the S4 UTF-16 comparator.
- **Ambiguity never merges identities** — there is no code path from an ambiguity flag to a shared subject; resolving one requires new Evidence or a post-M1 mechanism (ADR-0015).

### 6. Relationship reconciliation

- **Subject identity** comes from § 3: the relationship Evidence's own source-native identity, normalized — independent of endpoints.
- **Endpoint resolution:** each endpoint's `sourceScopedIdentity.sourceNativeId` is resolved through the same § 2 normalization (+ § 4 merging aliases, of which `m1-v1` has none) to a stable Entity identifier, which becomes the claim's `sourceEntityIdentifier` / `targetEntityIdentifier`. Resolution is **syntactic**: it constructs the identifier; whether an Entity subject with that identifier has visible assertions is the S2 repository referential-integrity obligation, **proven by S6, not enforced or stored by S5**.
- **Unresolvable endpoints:** if an endpoint identity normalizes to an empty or grammar-invalid key, derivation fails with the same loud deterministic error as § 2 step 6, naming the Evidence record and endpoint role. No placeholder endpoint is invented.
- **Endpoint-disagreeing claims on one Relationship subject** follow § 7 exactly as entity-type disagreements do: relationship claims are equal iff `(relationshipType, sourceEntityIdentifier, targetEntityIdentifier)` are all equal; distinct standing claims from distinct sources conflict; one source's own later change supersedes (§ 9). Scenario 6 (one source, target changes payments→fulfillment) is supersession — a closed interval and a new revision — never a conflict.

### 7. Event-time derivation: claim grouping, standing support, corroboration, and conflict

**The derivation model is event-time, not horizon-wide.** Reconciliation at horizon H proceeds:

1. **Select** Evidence at H via the S4 `selectEvidenceAtHorizon`;
2. **Sort** it with the S4 `sortEvidenceByTotalOrder` (ADR-0016 total order);
3. **Group** all selected Evidence sharing the same `observedAt` timestamp into one **event-time step**; within a group, `recordedSequence` fixes deterministic processing order only — the group is applied **atomically**, and **no zero-length intermediate revision is ever emitted inside one timestamp group** (two same-instant corroborations produce one two-source revision, never a one-source revision alive for zero milliseconds);
4. **After each timestamp group**, derive the complete subject/assertion state at that event time: standing support, corroboration, provenance, confidence, conflict, and ambiguity are all **recomputed after every group**;
5. **Emit a new revision** for a subject/claim whenever any identifying payload component changed at that step — claim, validity, provenance, rule trace, conflict state, or ambiguity state; any such change **closes the previous revision and starts a new one at that timestamp** (§ 9).

The per-claim rules the recomputation applies:

- **Claim equality (exact):** two entity claims are equal iff their `entityType` tokens are identical; two relationship claims are equal iff `relationshipType`, `sourceEntityIdentifier`, and `targetEntityIdentifier` are all identical. Claims of different kinds never compare (the schema already binds claim kind to subject kind).
- **Mutual exclusivity:** all entity claims about one subject are mutually exclusive with each other, as are all relationship claims about one subject.
- **Standing support:** at each event-time step, a source's **standing claim** for a subject is determined from its **latest observation for that subject at or before that step** (within H). **A claim value remains standing while at least one source currently stands on it** — one source changing its claim does **not** make the old value disappear if another source still stands on it; only when its last standing source moves away does the claim value cease to be standing (and its revision closes **without a successor for that claim**, § 9). **Conflict** exists at a step iff distinct sources' standing claims for the subject differ at that step (scenario 3: `asset-index` stands on `service`, `runtime-scan` on `database` — conflicted, no winner). A single source's own claim change with no other source standing on the old value is supersession (§ 9), never a conflict. **Disappearance without new Evidence changes no standing claim and closes nothing.**
- **Provenance membership (event-time bounded, standing-source filtered):** a standing claim revision's provenance contains **exactly** the Evidence records that satisfy all four conditions: (1) selected at the pinned horizon H; (2) observed at or before the revision's event-time step; (3) asserting that revision's exact claim value for that subject; and (4) **belonging to a source whose standing claim at that step is still that exact claim value.** Provenance is sorted by Evidence identifier through the S4 `sortIdentifiers` helper. Two consequences of the causal bound and the standing-source filter:
  - **Evidence observed later never appears in a revision valid earlier** — provenance is causally bounded by the revision's own `validFrom`;
  - **withdrawn support never lingers**: when a source moves to a different standing claim, **all of its records — including its earlier same-claim observations — are excluded from the former claim's active successor provenance** from that step onward. Earlier same-claim observations from a source that **still** stands on the claim remain in provenance. If another source still stands on the former claim, that claim remains standing with only its currently standing sources' supporting Evidence; if its last standing source moves away, the claim closes with no successor revision. (The closed historical revisions from steps where the departed source did stand on the claim remain in the output unchanged — history is preserved, current support is not overstated.)
- **Standing-source membership changes are identifying-content changes:** whenever a step changes which sources stand on a claim that remains standing, its provenance changes, so the prior revision closes and a successor opens at that event timestamp (§ 9) — support shrinkage is visible history exactly as corroboration growth is.
- **Distinct-source counting and duplicates:** corroboration counts **distinct `sourceScopedIdentity.source` names** in the revision's **standing-source-filtered** provenance — corroboration and confidence (§ 8) are computed exclusively from that provenance, so withdrawn support contributes to neither. Duplicate observations from one currently standing source all enter provenance but count once (scenario 6's two `trace-index` payments observations → provenance of two, source count 1, confidence 0.5).
- **Conflict structure — alternatives only, symmetric:** when a subject is conflicted at a step, reconciliation emits **one revision per distinct standing claim value**, each with `conflictState.status = "conflicted"`. Each revision's own `claim` is its value; its `conflictState.competingClaims` contains **only the other standing claims** (never its own), each with that competing claim's provenance **built by the identical event-time-bounded, standing-source-filtered rule** and its § 8 confidence computed from that provenance. Every conflicting revision carries complete, symmetric conflict information — the union of any revision's own claim plus its competing claims is the same set from every side. `competingClaims` is ordered deterministically by the RFC 8785 canonical serialization of each competing `claim` object, compared with the S4 UTF-16 comparator. No ranking, winner, or silent deduplication exists anywhere.

### 8. Confidence — exact arithmetic

- The accepted ADR-0015 formula, evaluated in IEEE-754 double precision exactly as written, where `s` is the § 7 distinct-source count of the revision's own **standing-source-filtered** provenance (withdrawn support never contributes):

  ```
  confidence(s) = 0.5 + 0.4 × (1 − 2^(−(s − 1)))
  ```

  computed as the ECMAScript expression `0.5 + 0.4 * (1 - 2 ** -(s - 1))` with the § 1 constants (`base` = 0.5, `span` = 0.4). **No rounding, truncation, or decimal formatting is applied anywhere** — the double the expression produces is the value stored and serialized (JCS number serialization then renders it shortest-round-trip). s = 1 → 0.5, s = 2 → 0.7, s = 3 → 0.8, s = 4 → 0.85.

- **No timestamp participates in confidence** — corroboration counts sources, never ages (ADR-0015 orthogonality).
- **Competing claims** (§ 7) each carry the same formula applied to **their own** standing-source-filtered provenance's distinct-source count.
- Every produced value validates against the shared `confidenceSchema` (0 ≤ c ≤ 1) as part of § 11's whole-assertion validation; by construction the formula yields values in [0.5, 0.9).

### 9. Validity interval derivation and complete revision history

- **`validFrom` (exact):** the event timestamp at which the revision's **exact identifying payload first becomes active** — the `observedAt` of the event-time step (§ 7) whose recomputation produced this payload. (Scenario 1: both observations share `2026-01-10T09:00:00.000Z`, one atomic step → one two-source revision with `validFrom` exactly that instant.)
- **`validTo` (exact):** the **next event timestamp at which that exact payload ceases to be active** — because the claim value lost its last standing source (closing **without a successor** for that claim), or because any identifying component (provenance — including standing-source membership changes, § 7 — conflict state, ambiguity state, rule trace) changed there, producing a successor revision. `validTo` is **omitted** when the payload remains active through the end of the selected Evidence at H. Half-open per ADR-0016 throughout.
- **Every identifying-content change closes and reopens:** when a step changes any § 11 payload component for a standing claim — including provenance growth from new corroboration — the previous revision is emitted **closed** at that step's timestamp and a successor revision opens there with the new payload. Predecessor revisions with their closed intervals are part of the output (below), so growth is visible history, not mutation.
- **Complete revision history is the output:** reconciliation at horizon H returns **the complete revision history derivable at H** — every revision each subject/claim passed through with its interval, not only the final standing revisions — so S6 can evaluate historical snapshots at any `asOf` purely from intervals. (ADR-0016's snapshot-membership rule consumes exactly this.)
- **Disappearance closes nothing** (ADR-0016): a source that merely stops observing changes no standing claim, triggers no step, and leaves the interval open; the revision ages through freshness classifications (§ 13) — absence of Evidence is not evidence of absence.
- **Late-old Evidence and pinned horizons:** an observation with old `observedAt` but high `recordedSequence` participates only at horizons that include its sequence (ADR-0016 invariant 2). **A later horizon containing late-old Evidence recomputes the event timeline from scratch and may therefore produce new historical revisions** (earlier `validFrom`s, different intermediate payloads) — but derivation at every earlier pinned horizon, which excludes that Evidence by sequence, remains **byte-identical**. (Scenario 6's `svc-fulfillment` entity: invisible at horizons < 12; at horizons ≥ 12 its revision carries `validFrom` `2026-01-05T00:00:00.000Z`.)
- **Fixture walk-throughs (exact, provable by hand):**
  - **Scenario 1 (equal-time corroboration):** both checkout observations share one `observedAt`, so they form one atomic step → exactly one revision, two-source provenance, confidence 0.7, `validFrom` `2026-01-10T09:00:00.000Z`, open — **no zero-length one-source intermediate revision exists**.
  - **Scenario 2 (late corroboration across horizons):** at H₁ = 2 the history is scenario 1's single open revision — byte-identical before and after the third record exists. At H₂ = 3 the timeline gains the `2026-01-10T09:02:00.000Z` step: the two-source revision is emitted closed at that instant and a three-source successor (confidence 0.8) opens there — new history at H₂, untouched history at H₁.
  - **Scenario 6 (revision chain without future leakage):** the payments relationship revision opens at March 2 (`validFrom` `2026-03-02T00:00:00.000Z`, provenance of one); the March 5 re-observation is an identifying-content change (provenance grows), closing it at March 5 and opening a successor with two-record provenance (source count still 1, confidence 0.5); the March 10 fulfillment observation ends payments' standing support, closing the March 5 revision at `2026-03-10T00:00:00.000Z` and opening the fulfillment-target revision there. **No revision's provenance contains Evidence observed after its own interval began** — the March 2 revision never carries the March 5 record.
- **Boundary of slices:** S5 **derives** assertion validity intervals and the full revision history; S4's `isTimestampWithinValidity` only **evaluates** membership; S6 **consumes** the intervals for snapshot membership. Nothing in S5 computes snapshot membership.

### 10. Rule traces — schema-valid by construction

**The binding constraint** (merged `graphAssertionSchema`): a revision's top-level `provenance` contains **only Evidence supporting the revision's own canonical claim** (§ 7), and **every rule-trace citation must be a subset of that provenance**. All trace semantics below are defined to satisfy this without exception — no rule ever needs to cite Evidence outside its own revision's provenance:

- **The complete `m1-v1` rule-name vocabulary** (closed list; any other name is a policy violation caught by tests), each with its **exact citation rule**:
  1. `normalized-exact-match` — identity resolved by § 2 normalized-key equality. **Cites:** the revision's full provenance (every supporting record's identity resolved through § 2). Fires on every revision, so every trace is non-empty (ADR-0015 invariant 3).
  2. `distinct-source-corroboration` — provenance spans ≥ 2 distinct sources (§ 7). **Cites:** the revision's full provenance. Fires iff the distinct-source count is ≥ 2.
  3. `mutually-exclusive-claim-conflict` — the revision is conflicted (§ 7). **Cites:** the revision's **own** supporting provenance only. Competitor Evidence lives **exclusively** in `conflictState.competingClaims[*].provenance` — never in the top-level provenance, never in any trace citation. **The whole conflict structure — this revision's claim/provenance plus its competing claims with theirs — explains the disagreement; no single trace entry alone does or can.** Fires iff `conflictState.status` is `conflicted`.
  4. `one-directional-alias-near-match` — the revision is ambiguous (§ 5). **Cites:** the revision's own supporting provenance (the records whose § 2 keys sit in the alias pair). The near-match subject is referenced by `ambiguityState.nearMatches`, not by Evidence citation. Fires iff `ambiguityState.status` is `ambiguous`.
  5. `claim-supersession` — this revision's claim value newly gained standing at a step where another value lost it (§ 7/§ 9). **Appears only on the successor revision, whose own provenance contains the superseding Evidence; cites exactly that superseding Evidence** (a provenance subset by construction). **A closed predecessor never carries this rule and never imports superseding or competing Evidence into its provenance merely to explain its `validTo`** — interval closure is deterministic temporal derivation (§ 9), fully explained by the successor's existence and requiring no schema-invalid external citation on the predecessor.
- **Ordering (exact):** trace entries appear in the fixed vocabulary order above; each rule appears at most once per revision, present iff it fired for that revision.
- **Citation ordering:** every entry's citations are sorted with the S4 `sortIdentifiers` helper.
- **Detail text:** `m1-v1` **omits** the optional `detail` field entirely — deterministic trace bytes without prose drift; the rule name plus citations carry the explanation. (A future policy version may add fixed-template detail; free text never.)
- No trace content may depend on locale, clock, or iteration order — the vocabulary order, the per-rule citation rules, and sorted citations make trace bytes a pure function of Evidence and policy, and every emitted trace validates against the merged schema's citation-⊆-provenance refinement by construction.

### 11. GraphAssertion payload construction and content addressing

- **Identifying payload (exact shape):** a plain object with **exactly** these properties, matching ADR-0014's accepted identifying-content list:

  ```
  {
    derivationVersion,   // "m1-v1"
    subjectIdentifier,   // § 3
    claim,               // the revision's canonical claim
    validity,            // § 9 interval, validTo omitted when open
    provenance,          // § 7, sorted via the S4 sortIdentifiers helper
    ruleTrace,           // § 10, in vocabulary order with sorted citations
    conflictState,       // § 7; competingClaims ordered per § 7
    ambiguityState       // § 5; nearMatches ordered per § 5
  }
  ```

- **Excluded from the identifying payload:** the assertion `identifier` itself (it is the digest); `schemaVersion` (pinned by `derivationVersion` per ADR-0016's V definition); and the top-level `confidence`. **Confidence's treatment follows the accepted contract exactly:** ADR-0014's identifying-content list does not include it, and this ADR does not silently add it — nor does excluding it weaken content addressing, because confidence is a pure function of the included provenance (§ 8): identical payloads always imply identical confidence. (Per-claim confidences **inside** `conflictState.competingClaims` are part of the conflict structure ADR-0014 does include; they are equally provenance-determined, so determinism holds.)
- **Ordering inside collections:** provenance and rule-trace citations sorted by the S4 helper; `competingClaims` by canonical claim serialization (§ 7); `nearMatches` by near-match identifier (§ 5). Rule-trace entry order is the § 10 vocabulary order (an ordered list, never sorted alphabetically).
- **Serialization and digest:** the payload is serialized with the S4 `canonicalizeToUtf8Bytes` (RFC 8785 through the S1 `jsonValueSchema` boundary, per ADR-0021) and digested with the S4 `sha256HexOfBytes`; the identifier is the exact string concatenation `atlast:assertion:` + the 64-character lowercase-hex digest.
- **Final validation:** every finished assertion — identifier, `schemaVersion`, `confidence`, and all payload fields — is validated through the merged S1 `graphAssertionSchema` (imported from `@atlast/shared`); a validation failure is a loud derivation error, never a skipped record.

### 12. Reconciliation function boundary

- **Signature (pure):** reconciliation is one exported pure function taking `(evidenceRecords, horizon, policy)` — a validated Evidence collection, an explicit `recordedSequence` horizon (validated by the S4 `assertValidEvidenceHorizon` semantics), and the § 1 policy — and returning `{ subjects, assertions }`: the stable subjects and the **complete revision history derivable at that horizon** (§ 9 — every revision with its interval, closed and open, not only final standing revisions). No other inputs exist.
- **Validation before derivation:** the Evidence collection is validated through the shared `evidenceCollectionSchema` (individual records plus cross-record sequence/identifier uniqueness) before any derivation step; invalid input is a loud error.
- **Horizon handling:** Evidence above the horizon is excluded via the S4 `selectEvidenceAtHorizon` before any grouping; the ADR-0016 total order (S4 `sortEvidenceByTotalOrder`) fixes all iteration order.
- **Prohibited inputs:** no wall-clock time, filesystem, network, randomness, environment variables, or process-global mutable state on any code path (ADR-0015 invariant 10). The injected-clock rule is moot here by construction — no clock parameter exists on the derivation function at all; time enters only as Evidence data and the explicit horizon.
- **Deterministic output ordering:** returned subjects sorted by subject identifier and assertions by assertion identifier (both via the S4 helpers), so the function's complete output is byte-stable.
- **Replay and convergence:** the same `(evidenceRecords, horizon, policy)` triple returns byte-identical output across calls, processes, and independent implementations (ADR-0015 invariant 1); and derivation at horizon H equals derivation over any prefix batching that ends at H — batch versus incremental convergence (ADR-0015 invariant 2) is expressed by re-deriving from the full Evidence set at each horizon, which is the only mode S5 implements (no mutable incremental store exists before S6).

### 13. Freshness

- S5 supplies **only a pure query-time classification helper**: `classifyFreshness(latestSupportingObservedAt, asOf)` over canonical timestamps, returning `"current" | "stale" | "historical"` per the shared `freshnessSchema` tokens.
- **Exact arithmetic:** `age = epochMilliseconds(asOf) − epochMilliseconds(latestSupportingObservedAt)`, both parsed from the canonical fixed-width form; `current` iff `age < 7 × 86_400_000`; `stale` iff `7 × 86_400_000 ≤ age < 30 × 86_400_000`; `historical` iff `age ≥ 30 × 86_400_000`. The scenario 4 anchors land exactly: `2026-02-07T23:59:59.999Z` → current (age 7 d − 1 ms), `2026-02-08T00:00:00.000Z` → stale (exactly 7 d), `2026-03-03T00:00:00.000Z` → historical (exactly 30 d).
- **`asOf` earlier than the latest supporting observation throws a deterministic `RangeError`** — negative age is rejected, never classified. A correctly composed S6/S7 read cannot ask this question: a revision visible at `asOf` cannot have supporting Evidence observed after `asOf` (§ 7's event-time-bounded provenance and § 9's intervals guarantee it), so a negative age can only mean temporal leakage in the composing layer. Rejecting it catches that defect loudly rather than hiding it behind a plausible `current`.
- **Freshness never enters immutable GraphAssertion content** (ADR-0014): it is response data. Composing this helper into snapshot/read responses is **S6/S7**, not S5.

### 14. Slice boundary — exact authorized S5 files and content

**S5 may change only** (upon its separate implementation release; see the authorization note):

- `packages/graph-model/src/**` — the § 1 policy module, the §§ 2–12 reconciliation modules (normalization, identifier construction, alias/ambiguity resolution, claim grouping/conflict, confidence, validity derivation, rule traces, payload construction/content addressing, the pure derivation function), the § 13 freshness helper, and their colocated focused tests;
- `TASKS.md`, solely for factual S5 progress reporting.

**No package-manifest or lockfile change is expected or authorized**: S5 adds no dependency — it composes the existing S4 primitives and the already-declared `@atlast/shared` (whose exported schemas perform all runtime validation), with no direct third-party imports and no version changes. `pnpm-lock.yaml` is untouched.

**S5 must NOT implement or modify:** `packages/shared` or any S1/S2 contract; fixture JSON under `fixtures/demo-company/`; any repository or storage implementation; referential-integrity enforcement (S2-defined, S6-proven); snapshot construction, snapshot payload builders, replay, or snapshot checksums; the S2 contract-suite execution (first runs in S6); API routes; frontend behavior; connectors, authentication, deployment, or real-system access; any S6–S8 or M2+ work; any new third-party dependency or version upgrade; `scripts/verify.sh` or `scripts/bootstrap.sh`.

**S6 remains responsible** for the in-memory stores, snapshot layer, replay, checksums-on-snapshots, and passing the S2 contract suite end-to-end over the S5 engine's output.

## Alternatives Considered

- **Leave the gaps to S5 implementation-time judgment** — fastest start. Rejected: each § 2–§ 11 choice is a place where two correct-looking implementations diverge byte-wise, which breaks the replay invariants the whole design stands on; discovering the divergence in S6's contract run would be far costlier than deciding now.
- **Runtime-validate the policy with Zod inside `packages/graph-model`** — symmetry with the shared package. Rejected: it would add a direct third-party dependency declaration to graph-model for a constant that tests can prove exhaustively; the shared schemas already validate everything that crosses the derivation boundary (input Evidence, output assertions).
- **Embed the entity type in Entity identifiers (ADR-0014's original `service/checkout` example)** — more readable identifiers. Rejected: ADR-0019 moved type into claims precisely so conflicting types can coexist on one identity; a type-bearing identifier would fork the subject per claimed type and silently resolve scenario 3's conflict by construction.
- **Make relationship identity a function of resolved endpoints + type** — endpoint-derived identity. Rejected: scenario 6 requires the same relationship subject to persist across a target change (supersession on one identity); endpoint-derived identity would mint a new subject per endpoint set, converting supersession into unrelated appearance/disappearance and hiding the history.
- **Include own claim in `competingClaims`** — one uniform collection. Rejected: it duplicates the revision's own claim/provenance/confidence inside itself, bloating the content address for zero information; alternatives-only with symmetric emission carries the identical total information.
- **Include top-level confidence in the identifying payload** — "hash everything." Rejected: ADR-0014's accepted identifying-content list omits it, and adding it silently would change the accepted content-addressing contract; it is also fully determined by the included provenance, so its inclusion adds no discriminating power.
- **Timestamp-decayed confidence** — already rejected by accepted ADR-0015 (orthogonality); restated here only because the freshness helper (§ 13) sits near confidence code in S5.
- **Fixpoint (repeated) affix stripping** — handles stacked affixes like `svc-service-checkout`. Rejected for `m1-v1`: no fixture needs it, and single-pass is the smaller rule; a future policy version can revisit with evidence.

## Consequences

- With acceptance (2026-08-05), S5's implementation release is unblocked — effective only after the documentation/authorization record merges and `main` is synchronized — with this ADR as the executable specification the independent review measures the implementation against.
- ADR-0015's § "Identity keys" example identifiers and ADR-0014's `atlast:entity:service/checkout` example read, under this ADR, as pre-ADR-0019 illustrations: this ADR carries **metadata-only amendment notices** on ADR-0014 and ADR-0015 (applied with its 2026-08-05 acceptance) pointing here for the exact identifier-construction and policy-data decisions. No accepted decision text changes.
- The `m1-v1` policy document becomes a reviewed data artifact in `packages/graph-model`, exactly as ADR-0015 required; ADR-0016's snapshot identity pins its version.
- S6 inherits precise inputs: deterministic subjects and the **complete revision history** ordered by identifier, intervals per § 9 sufficient to evaluate historical snapshots at any `asOf`, and the freshness helper — the contract suite's seed-adequacy checks (S2/S3) should pass over scenario-derived output without reinterpretation. Snapshots, storage, repository implementation, replay, and query composition remain S6.

## Risks

- **Specification-implementation drift.** This ADR is detailed enough to diverge from code subtly. Mitigation: every § maps to at least one named invariant below, and the S5 review checks the implementation against this document clause by clause.
- **Standing-claim conflict semantics may surprise at M5 scale** (a source that flip-flops rapidly produces supersession chains, not conflicts). Accepted for M1: fixtures exercise exactly the flip (scenario 6) and the cross-source disagreement (scenario 3); real-source behavior is a documented change condition.
- **Alias vocabulary is minimal by design** (one entry). A future fixture or real source needing richer alias semantics forces `m1-v2` — which is the intended control, not a workaround.
- **Third amendment-notice layer on ADR-0014/0015.** Mitigation: notices are metadata-only, applied only on acceptance, and follow the established ADR-0019/0020/0021 discipline.

## Testable Invariants and Acceptance Evidence

The future S5 implementation must prove, at minimum:

1. **Replay determinism:** identical `(evidenceRecords, horizon, policy)` → byte-identical output including content-addressed identifiers, across repeated calls and shuffled input file order (§ 12; ADR-0015 invariant 1).
2. **Normalization vectors:** every § 2 fixture mapping; empty-key and non-ASCII rejection with errors naming the Evidence identifier; **locale independence** (identical keys under every runtime locale, including a Turkish-I probe); the **explicit whitespace list** (listed code points trim/collapse; `U+00A0` and other unlisted Unicode spaces are rejected at step 6, never treated as whitespace); **same-source collisions** (two records from one source normalizing to one key resolve to one subject) and **cross-source exact matches** (the same key across sources resolves to one subject) — normalized-key identity is global.
3. **Identifier construction:** the § 3 fixture identifiers exactly; no type or endpoint token in any subject identifier.
4. **Alias/ambiguity:** scenario 5 at H8 yields two subjects, both flagged, symmetric near-matches, the exact § 5 reason string, sorted deduplicated near-match lists, no merge; **at H7, `ledger-api` is unambiguous** (the near-match subject does not exist); at H8, `ledger`'s appearance at its `observedAt` step closes `ledger-api`'s unambiguous revision and opens an ambiguous successor; **no emitted marker references a subject absent from the derived subject set**.
5. **Event-time corroboration:** scenario 1 yields **exactly one** checkout revision — two-source provenance, confidence 0.7, `validFrom` at the shared instant — and **no zero-length one-source intermediate revision**; scenario 2 at H₂ = 3 yields the closed two-source revision plus the three-source successor (confidence 0.8) opening at `2026-01-10T09:02:00.000Z`, while derivation at H₁ = 2 is byte-identical to its pre-H₂ output.
6. **Conflict:** scenario 3 yields two revisions on one subject, alternatives-only symmetric `competingClaims` with per-claim standing-source-filtered provenance and confidence 0.5 each, deterministic ordering, no winner anywhere; **standing support holds** — a claim value with any remaining standing source stays standing when another source moves away.
7. **Withdrawn support (constructed S5 test vector, not a fixture change):** sources A and B initially stand on claim X (X's revision carries both sources' Evidence, confidence 0.7); source A later observes claim Y. At that step, X remains standing through B: X's prior revision closes and its **successor's provenance excludes all of A's old X Evidence** — containing only B's supporting records — so X's confidence falls to the one-source value 0.5; Y's revision opens with A's Y Evidence in provenance; X and Y coexist as a symmetric conflict with alternatives-only `competingClaims`; **no withdrawn support contributes to either claim's confidence or corroboration.**
8. **Duplicate-source counting:** scenario 6's two payments observations → provenance 2, distinct sources 1, confidence 0.5.
9. **Validity and complete history:** scenario 6 yields the § 9 chain exactly — payments open at March 2, closed at March 5 by its own provenance growth, the two-record successor closed at `2026-03-10T00:00:00.000Z`, the fulfillment revision opening there — with **no revision's provenance containing Evidence observed after its own `validFrom`**; the output contains the complete closed-and-open revision history at H, not only standing revisions; disappearance without superseding Evidence closes nothing; the late-old fulfillment Entity is invisible at horizons < 12 and carries `validFrom` `2026-01-05T00:00:00.000Z` at horizons ≥ 12, with earlier-horizon output byte-identical.
10. **Rule traces:** vocabulary-only names, § 10 order, per-rule citations exactly as § 10 defines, citations ⊆ own-claim provenance on every revision (schema-refinement satisfied by construction), `claim-supersession` only on successor revisions, closed predecessors importing no superseding or competing Evidence, no `detail` field, non-empty on every revision.
11. **Content addressing:** the identifying payload contains exactly the § 11 fields; recomputing any fixture assertion's digest from its payload reproduces its identifier; altering any identifying component changes the identifier (ADR-0014 invariant 9); top-level confidence excluded, conflict-internal confidences included.
12. **Schema validation:** every emitted subject and assertion — including every closed historical revision and every conflicted/ambiguous revision — passes the merged shared schemas unchanged; a constructed-invalid assertion fails loudly.
13. **Purity:** no reconciliation path reads clock, randomness, filesystem, network, or global state (code review + injected-nothing test harness); output ordering is deterministic under shuffled input.
14. **Freshness:** the § 13 boundary arithmetic at the three scenario 4 anchors; **`asOf` earlier than the latest supporting observation throws a deterministic `RangeError`** (temporal-leakage detection, never a silent `current`); classification absent from assertion bytes.
15. **Policy integrity:** the § 1 constant is deeply frozen, matches this ADR's exact literal values (including `normalizationRules` tokens and `whitespaceCodePoints`), and mutating a copy does not affect derivation (value capture, not reference leakage).

**Acceptance evidence at review time:** this document read against ADR-0014 §§ "Identity"/"Lifecycle", ADR-0015's decision sections, ADR-0016's temporal semantics, ADR-0019 §§ 1–4, ADR-0021 §§ 1–7, the merged shared schemas, the S4 exports, and all seven fixture scenario files — demonstrating that every decision here is forced by, or consistent with, the accepted set, and that the fixtures' expected outcomes — plus the invariant 7 withdrawn-support vector, which no fixture exercises and which S5 must construct as a focused test — are derivable from these rules by hand.

## Relationship to Accepted ADRs

- **ADR-0014:** implements its subject/assertion/content-addressing contract; carries a metadata-only amendment notice (applied with acceptance) marking the `atlast:entity:service/checkout` identifier example as superseded by § 3's type-free construction (a consequence of already-accepted ADR-0019). All other decisions consumed unchanged.
- **ADR-0015:** this ADR is its completion, not its revision — every § 2–§ 13 decision instantiates a clause ADR-0015 stated abstractly (normalization rule list, alias table, formula constants, thresholds, determinism). Carries a metadata-only amendment notice (applied with acceptance) pointing here as the binding `m1-v1` policy specification.
- **ADR-0016:** consumed unchanged — total order, horizons, half-open validity, snapshot identity pinning `m1-v1`, and the `superseded`-state reservation all bind § 9/§ 12.
- **ADR-0019:** consumed unchanged — identity-only subjects force § 3's type-free identifiers and § 6's endpoint-in-claim treatment; the S2/S6 referential-integrity layer split is restated in § 6.
- **ADR-0021:** consumed unchanged — § 11 serializes through the S4 RFC 8785 implementation and sorts collections with the S4 helpers, exactly the composition obligations ADR-0021 § 3 assigned to S5.

## Exact S5/S6 Boundary

S5 ends at the pure derivation function and its helpers (§ 12–§ 14): given Evidence and a horizon, it returns subjects and assertions in memory. S6 begins where state begins: in-memory stores implementing the S2 interfaces, snapshot computation and identity, replay across restarts, checksums-on-snapshots, and the end-to-end S2 contract-suite run. The freshness helper is S5 code first composed into responses by S6/S7.

## Conditions That Would Justify Changing This Decision

- Acceptance review finding any clause here contradicting an accepted contract — revise before acceptance.
- S6's contract-suite run demonstrating that a § 7/§ 9 rule produces output the S2/S3 seeds cannot satisfy — a reviewed `m1-v2` (new derivation version), never an in-place edit.
- Real heterogeneous sources (M5+) breaking the standing-claim or single-pass-affix assumptions — ADR-0015's own scheduled trigger, expressed as a new policy version through a new review.
- A future need for merging aliases, richer near-match rules, or trace detail text — all `m1-v2+` policy changes with snapshot-identity visibility.
