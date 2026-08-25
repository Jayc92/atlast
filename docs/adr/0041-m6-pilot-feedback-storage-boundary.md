# ADR-0041: M6 Pilot-Feedback Storage Boundary

**Status:** Accepted
**Date:** 2026-08-24 (revised 2026-08-24 after independent adversarial review; accepted 2026-08-24 as part of the complete M6 baseline — see acceptance note)

> **Acceptance note (2026-08-24):** Joseph Carfagno explicitly accepted this ADR on 2026-08-24 as part of the complete M6 baseline ([docs/m6-plan.md](../m6-plan.md)), after both an adversarial review and a genuinely independent final review found no substantive blocker. **Acceptance authorizes no implementation.** The first M6 implementation slice referencing this ADR (M6-B, per [docs/m6-plan.md § 20](../m6-plan.md#20-proposed-implementation-slices-shapes-only--none-authorized)) requires its own separate, explicit human authorization, effective only after this acceptance record merges to `main` and local `main` synchronizes cleanly.

> **Revision note (adversarial review pass):** the first draft's boundary decision (§ 1) and one-directional-reference design (§ 3) survived review unchanged. Its verdict vocabulary (§ 2) did not: a four-verdict scheme (`correct`/`incorrect`/`missing`/`uncertain`) conflates Atlast's own honest, computed unknown states (e.g. a known-zero-match Service, per [ADR-0039 § 3](0039-m6-kubernetes-topology-extension.md#3-selection-relationship-service--pod-via-label-selector-matching)) with the tester's subjective uncertainty about a claim Atlast _did_ make confidently — two different things a scorecard must not merge. § 2 is revised below to a vocabulary that distinguishes them. A concrete lifecycle model and explicit sensitive-notes handling are also added (§§ 5, 6), which the first draft left implicit.

## Context

[docs/m6-plan.md § 6](../m6-plan.md#6-target-employee-journey) requires the pilot tester to record a judgment on entities, relationships, and impact results Atlast presents. [PROJECT_SPEC.md Principle 1](../../PROJECT_SPEC.md#3-guiding-principles) states "the graph is derived from evidence... human declarations are annotations on the graph, never its source of record," and Principle 2 requires confidence and provenance to remain first-class, evidence-grounded properties. A human's opinion about whether a mapping is correct is not itself a discovery-source observation of the real system — it is a judgment about Atlast's own output. This ADR decides where that judgment lives and what vocabulary it uses.

## Problem

Design the smallest durable record of pilot judgments that (a) supports a verdict vocabulary precise enough to distinguish Atlast's own honest unknown/known-zero states from the tester's own uncertainty; (b) supports a "missing" verdict for real objects that have no Atlast identifier to attach to, without ever fabricating one; and (c) does not let human evaluation contaminate, or be confused with, Atlast's own discovered-truth model.

## Decision

### 1. A separate pilot-evaluation artifact, never Evidence or a GraphAssertion

Pilot judgments are recorded in a **new, standalone artifact** — not appended to `EvidenceStore`, not represented as a `GraphAssertion` revision, ruleTrace entry, or confidence adjustment, and not read by `reconcileEvidenceAtHorizon` or any other part of the accepted `m1-v1` pipeline. The existing Evidence/GraphAssertion contract (ADR-0014/0022) is **not modified, extended, or reinterpreted** by this ADR in any way.

### 2. Verdict vocabulary (revised)

**Entity judgments:**

- `correctly-discovered` — the tester confirms this Atlast entity matches a real object they independently know about.
- `incorrectly-represented` — the entity exists in both Atlast and reality, but some material fact about it (type, namespace, etc.) is wrong.
- `missing` — a real object the tester knows about has no corresponding Atlast entity at all.
- `explicitly-unknown` — Atlast itself surfaced this as an honest gap (e.g. an ownerless Pod, per [ADR-0039 § 2](0039-m6-kubernetes-topology-extension.md#2-ownership-relationship-deployment--replicaset--pod-via-ownerreferences)) — the tester is recording that Atlast's own honesty was itself correct, a success case, not a defect.
- `tester-uncertain` — the tester cannot confidently judge this item either way (distinct from `explicitly-unknown`, which is Atlast's own claim, not the tester's).

**Relationship judgments:**

- `correct`, `incorrect`, `missing` — same meaning as the entity verdicts above, applied to a relationship.
- `known-zero` — Atlast asserted a computed, honest zero-match state (e.g. [ADR-0039 § 3](0039-m6-kubernetes-topology-extension.md#3-selection-relationship-service--pod-via-label-selector-matching) case A), and the tester confirms that zero is indeed correct.
- `unknown-insufficient-evidence` — Atlast could not evaluate the relationship at all ([ADR-0039 § 3](0039-m6-kubernetes-topology-extension.md#3-selection-relationship-service--pod-via-label-selector-matching) case D), distinct from a confirmed known-zero.
- `tester-uncertain` — the tester's own uncertainty, distinct from either Atlast-reported state above.

**Impact-result judgments:**

- `correct`, `incorrect`, `incomplete` — the ranked result itself matches, contradicts, or partially covers the tester's own expectation.
- `explanation-unusable` — **new, distinct dimension**: the ranked result may be numerically defensible, but the tester cannot understand _why_ an entity is ranked as affected from the evidence/rule-trace path Atlast shows — a real signal about explainability ([PROJECT_SPEC.md Principle 5](../../PROJECT_SPEC.md#3-guiding-principles), "a prediction that can't be interrogated is worse than no prediction"), independent of whether the ranking itself is correct.
- `uncertain` — the tester cannot confidently judge the result either way.

### 3. Conceptual schema (revised)

A pilot-evaluation artifact is a session-scoped record containing:

- **`schemaVersion`** — an explicit version tag for the artifact's own shape, so a later multi-pilot phase can detect and migrate older records rather than silently misreading them.
- **Session metadata:** a session identifier; a tester identifier appropriate to an internal pilot (a role/description such as "Engineer, Platform team" — no unnecessary personal data; a pseudonymous handle is sufficient and preferred); an environment identifier (referencing the dataset-mode metadata [ADR-0040 § 1](0040-m6-composition-root-unification.md#1-dataset-mode-connector-only-mutually-exclusive-with-fixtures-with-a-visible-mode-indicator) makes authoritatively knowable); start/completion timestamps; free-text notes on whether/why developer assistance was required, keyed to the exact "unaided" boundary [docs/m6-plan.md § 3](../m6-plan.md#3-target-tester-and-milestone-purpose) defines.
- **Entity judgments:** the Atlast entity identifier when one exists; a human-entered description/reference of the real Kubernetes object when it does not (the `missing` case) — **existing objects use their stable Atlast identifier; a `missing` judgment MUST NOT receive a fabricated Atlast identifier**; one of § 2's entity verdicts; optional notes.
- **Relationship judgments:** the same shape, using § 2's relationship verdicts, with the same identifier/no-fabrication rule.
- **Impact-result judgments:** the origin entity identifier, the `changeType` exercised (one of the three existing accepted values — see [docs/m6-plan.md § 12](../m6-plan.md#12-hypothetical-change-workflow)), a reference to (or snapshot of) the ranked impact result reviewed, one of § 2's impact verdicts, optional notes.

Exact field types and storage format remain implementation-time decisions — the binding requirements are §§ 1, 2, and 4, not the file format.

### 4. One-directional reference, never a back-reference into domain data

The artifact **references** Atlast identifiers where they exist, but nothing in `packages/graph-model`, `packages/shared`, or any Evidence/GraphAssertion schema ever references, embeds, or is aware of the pilot artifact. The reference direction is strictly one-way: pilot record → Atlast identifier, never the reverse.

### 5. Recommended lifecycle: session-local review state → explicit export → one versioned local artifact

For Pilot #1, the smallest correct lifecycle is:

1. **Session-local review state** — as the tester works through the journey, judgments accumulate in memory/local session state (implementation TBD — could be as simple as a local scratch file the tester or a lightweight recording tool appends to).
2. **Explicit export** — at the end of the session, the accumulated judgments are explicitly exported/finalized into one artifact instance — never silently auto-persisted to a shared location, and never partially written mid-session in a way that could be mistaken for a live product state.
3. **One versioned local JSON file** (or equivalent structured local format) is the recommended artifact shape — no database, no `EvidenceStore` involvement, no `GraphAssertion` mutation, consistent with §§ 1, 4. Nothing in the existing architecture offers a simpler correct option: the reconnaissance found no existing storage mechanism this artifact could reuse without violating § 1's boundary (see Alternatives Considered).

### 6. Aggregation is computed, not stored redundantly

The pilot scorecard ([docs/m6-plan.md § 11](../m6-plan.md#11-pilot-scorecard)) is derived by counting/aggregating the artifact's records at report time — verdict tallies and the other factual counts named there are never separately, redundantly stored as their own persisted fields.

### 7. Sensitive-notes handling

The artifact's free-text notes fields may reference sandbox environment details (namespace names, resource names, tester observations). Given the M5/M6 real-system safety boundary already forbids any real employer/production data in the sandbox by construction ([docs/m6-plan.md § 2](../m6-plan.md#2-real-system-safety-boundary-binding-unchanged-from-m5)), residual sensitivity is low — but the artifact MUST NOT contain literal credential material of any kind, and MUST be kept outside the git-tracked repository, mirroring the existing precedent for kubeconfig handling (`docs/audits/m0-synthetic-boundary-audit.md § 21.6`: "constructed outside the repository... never copied into any tracked path"). The pilot artifact is a local file the tester/facilitator controls, not a committed or published document.

## Contractual Invariants This Boundary Must Preserve

- No existing `@atlast/shared` schema (`Evidence`, `GraphAssertion`, `ConflictState`, `AmbiguityState`, `RuleTraceEntry`, etc.) gains a new field, variant, or optional property because of this ADR.
- `packages/graph-model`'s reconciliation engine, confidence computation, and freshness classification remain completely unaware that a pilot artifact exists.
- The pilot artifact is never loaded by, or influences the output of, any query-API route — it is a separate report, not a second read path into the graph.
- Existing objects referenced by the artifact use their stable Atlast identifier; missing objects never receive a fabricated one (§ 3).

## Alternatives Considered

- **Store pilot verdicts as a new `GraphAssertion` `ruleTrace` entry or a new conflict/annotation type.** Rejected outright: this is precisely the "tester says this mapping is wrong" becoming observed-system Evidence that [docs/m6-plan.md § 10](../m6-plan.md#10-pilot-feedback-boundary) forbids, and it would require amending the frozen, accepted `m1-v1` contract (ADR-0022) for a concern that is not a discovery fact at all.
- **Store pilot verdicts as a new kind of Overlay.** Rejected: Overlays represent observed operational state projected from real external systems ([ADR-0029](0029-m3-overlay-model-and-temporal-semantics.md)) — a human's subjective correctness judgment is not an operational-state observation, and reusing the Overlay abstraction would blur a distinction this project has otherwise kept clean since M3.
- **No separate artifact — just qualitative notes in a document.** Rejected: the § 12 factual-count scorecard requires structured, countable verdicts per item, which unstructured notes cannot reliably produce.
- **A four-verdict scheme with no distinction between Atlast-reported unknown/known-zero states and tester subjectivity.** Rejected on adversarial review (revision note above) — conflates two materially different signals.

## Tradeoffs

- **Chosen:** a small, new, purpose-built artifact with a precise verdict vocabulary that keeps discovered truth and human evaluation of that truth strictly separate — at the cost of building one new (if small) data structure and a slightly longer verdict vocabulary than a naive four-state scheme.
- **Given up:** the convenience of piggybacking on an existing storage mechanism, and the simplicity (at the cost of honesty) of a shorter verdict list.

## Consequences

- A new, small conceptual schema exists that no other part of the accepted domain model needs to know about.
- The pilot scorecard is reproducible from the artifact alone, independent of the live Atlast process's own state at report time.
- Future multi-pilot phases would extend this same artifact shape (using its `schemaVersion` field) across sessions, not require a redesign.

## Risks

- **Implementation temptation to "just add a field to GraphAssertion for convenience."** Mitigation: § 1 and its explicit rejection above are the standing objection.
- **Verdict-vocabulary drift during implementation back toward a simpler, conflated scheme.** Mitigation: § 2's distinctions and their rationale must be preserved as explicit code comments at the implementation site.
- **The artifact silently becoming a second source of truth about topology if `missing` entries are mistaken for real Atlast facts.** Mitigation: `missing` judgments always carry a human-entered description precisely because no Atlast identifier exists.

## Why This Fits Atlast

- **PROJECT_SPEC.md Principle 1** is implemented literally: the pilot artifact is the annotation, kept structurally outside the graph's own source of record.
- **Principle 5 — explainable AI or no AI**: the `explanation-unusable` verdict directly measures this principle for the impact workflow, not merely whether the ranking is numerically right.
- **Simplicity over completeness** ([PROJECT_SPEC.md Principle 7](../../PROJECT_SPEC.md#3-guiding-principles)): a small, purpose-built artifact beats stretching an existing abstraction to fit a concern it was never designed for.

## Conditions That Would Justify Changing This Decision

- A future, separately authorized multi-pilot phase finds the conceptual schema in §§ 2–3 insufficient — requires its own ADR amendment to the artifact's shape (using `schemaVersion` to migrate), not a decision to fold it into the domain model.
- A future product decision decides pilot/user feedback should become a first-class, permanent Atlast capability — a materially different, larger product decision than this milestone's one-off internal pilot, requiring its own separate ADR and human product decision.

This Accepted ADR does not itself authorize implementation. The first M6 implementation slice referencing it requires its own separate, explicit human authorization, effective only after this acceptance record merges to `main` with local `main` synchronized cleanly.
