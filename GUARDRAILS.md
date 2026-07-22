# Atlast — Guardrails

Engineering, coding, repository, documentation, and testing standards for this project. These apply to every contributor — human or AI — and to every artifact in this repository. Key words "MUST", "MUST NOT", "SHOULD", and "MAY" are per RFC 2119.

The stack direction is a TypeScript monorepo, established in M0 Phase B; specific tools (linter, formatter, test runner, build, browser acceptance checks, storage) require human-approved ADRs before use. Standards here are stack-agnostic; language-specific standards are added as an appendix in M0 Phase B without weakening anything below.

---

## 1. Engineering Standards

### 1.1 Product boundaries are hard constraints

- All work MUST stay within the scope of [PROJECT_SPEC.md](PROJECT_SPEC.md). The non-goals in § 7 are not suggestions; a change that moves Atlast toward monitoring, incident management, hand-edited CMDB, deployment, or autonomous remediation MUST be rejected regardless of local merit.
- Atlast is read-only toward observed systems, permanently. No component may hold write-capable credentials to a system it observes. This constraint applies at the design level: violations are rejected in review, not mitigated with policy.

### 1.2 Evidence and honesty requirements

- Every fact in the graph MUST carry provenance, confidence, and freshness. Any API or UI that displays a fact MUST be able to expose all three.
- Components MUST have defined behavior for missing, stale, or conflicting input, and it MUST be visible degradation — silent guessing is a defect of the highest severity.
- AI-produced outputs MUST include evidence citations and interrogable reasoning. An unexplainable output is rejected at the API boundary, not shipped with a caveat.

### 1.3 Change discipline

- Significant technical decisions MUST be recorded as Architecture Decision Records in `docs/adr/` (`NNNN-short-title.md`: context, options considered, decision, consequences). "Significant" = expensive to reverse, or contested.
- Prefer the boring option in the core; ambition lives at the edges ([architecture.md § 1.5](docs/architecture.md)).
- Delete before adding: complexity in the core requires stronger justification than a new adapter or view.

### 1.4 Security

- Least privilege everywhere: each discovery adapter gets its own minimal, read-only credential scope.
- No credentials, tokens, or secrets in source, fixtures, or documentation — ever, including "example" values that are real.
- The topology graph is itself sensitive data (it maps the organization's attack surface). The query API MUST require authentication from its first version.
- Security-sensitive changes MUST be flagged for human review explicitly in the PR description.

---

## 2. Coding Standards

Stack-agnostic rules that will bind whatever languages are chosen:

- **Types on.** Use the strongest typing the language offers; public interfaces MUST be fully typed/annotated.
- **Names are documentation.** Verbose, descriptive names over abbreviations. `unresolvedEvidenceCount`, not `uec`. The domain vocabulary of [PROJECT_SPEC.md § 4](PROJECT_SPEC.md#4-core-concepts-domain-language) MUST be used verbatim in code: an `Entity` is an entity, a `Relationship` is a relationship — no synonyms (`node`, `component`, `link`) in the model layer.
- **Comments explain why, not what.** Comment complex logic, invariants, and non-obvious constraints. Do not narrate the code.
- **Errors are handled explicitly.** No silent catch-alls, no swallowed failures, no returning empty defaults on error. Failures either recover meaningfully or propagate with context.
- **Determinism is injected.** Time, randomness, and external I/O are consumed through injectable interfaces so tests are reproducible against fixtures.
- **No side doors.** Consumers read the graph only through the query API. Direct storage access outside the graph layer is a review-blocking defect.
- **Dependencies are liabilities.** Each new dependency requires justification in the PR; prefer well-maintained, security-supported libraries; prefer none.

---

## 3. Repository Standards

### 3.1 Layout

Fixed top-level structure (extended, not reorganized, as implementation begins):

```
README.md            Entry point and documentation map
PROJECT_SPEC.md      Vision, goals, principles, scope, non-goals
TASKS.md             Active work breakdown
GUARDRAILS.md        This document
CLAUDE.md            AI assistant working instructions
docs/                Long-form documentation
  architecture.md    Architecture philosophy and conceptual design
  milestones.md      Phased delivery plan
  adr/               Architecture Decision Records (created with first ADR)
fixtures/            Deterministic test data (miniature topologies, evidence samples)
scripts/             Development and verification tooling
tests/               Test suites
```

### 3.2 Branching and commits

- `main` is always releasable (for now: always internally consistent documentation). Work happens on short-lived branches merged via pull request.
- Branch names: `docs/<topic>`, `feat/<topic>`, `fix/<topic>`, `adr/<topic>`.
- Commits follow Conventional Commits (`docs:`, `feat:`, `fix:`, `test:`, `refactor:`, `chore:`), imperative mood, subject ≤ 72 chars, body explains *why* when it isn't obvious.
- Commits are atomic: one logical change each. No "misc fixes" commits.

### 3.3 Pull requests

- Every change to `main` goes through a PR, including documentation.
- The PR description states what changed, why, and — when applicable — which spec/architecture section authorizes it.
- A PR that changes product scope MUST link the spec change first; code never leads the spec across a scope boundary.
- Generated artifacts, build output, editor config, and secrets are never committed (enforced via `.gitignore` when the stack lands).

---

## 4. Documentation Standards

- **Documentation is a deliverable**, not exhaust. A feature is done when its documentation is done.
- **Single source of truth.** Each fact lives in exactly one document; everything else links to it. (Vision lives in PROJECT_SPEC.md; architecture in docs/architecture.md; if two documents disagree, that is a defect — fix one and link.)
- **Documents state their status** (Draft / Current / Superseded) and are updated in the same PR as the change that invalidates them.
- **Plain language.** Short sentences, active voice, defined terms. New domain terms MUST be added to [PROJECT_SPEC.md § 4](PROJECT_SPEC.md#4-core-concepts-domain-language) before use elsewhere.
- **Decisions get ADRs; explanations get docs/.** TASKS.md is the only document that tracks in-flight work; documentation never contains "TODO: describe later" placeholders.
- Diagrams are text-based (ASCII or a text-diagram format) so they diff and review like code.

---

## 5. Testing Philosophy

The testing strategy exists to protect one thing above all: **trust in the graph**. A wrong edge is worse than a missing edge; tests are biased accordingly.

- **Fixture-first.** Every component MUST be testable against `fixtures/` with no live infrastructure. Fixtures model realistic miniature topologies, including messy ones: conflicting evidence, stale sources, ambiguous identities. CI never touches a real environment.
- **Test behavior at contracts.** The prime test surfaces are the system's contracts — the evidence format, the reconciliation rules, the query API. Tests assert observable behavior at those boundaries, not internal implementation, so refactoring doesn't shred the suite.
- **The unhappy path is the point.** For a system whose whole job is honesty under degradation, tests for source outage, conflict, staleness, and partial data are not edge-case garnish — they are the core suite. Every "degrade visibly" requirement in this document MUST have a test proving the degradation is visible.
- **Accuracy is a tested property.** From M1, graph correctness against synthetic fixtures is an automated measurement, and from M4, impact-analysis quality is scored by a synthetic change-scenario harness. Correctness claims that aren't measured don't count.
- **Determinism is non-negotiable.** No test depends on wall-clock time, network, ordering luck, or randomness. A flaky test is treated as a broken test and fixed or deleted immediately.
- **New behavior arrives with its tests** in the same PR; bug fixes arrive with a test that fails without the fix. Coverage percentage is a smell detector, not a goal — a meaningless test to raise a number is a defect.
- `scripts/verify.sh` is the single entry point that runs everything CI runs; it MUST pass locally before any PR.

---

## 6. AI Assistant Guardrails

Binding on any AI coding assistant working in this repository (operational detail in [CLAUDE.md](CLAUDE.md)):

- AI assistants follow every standard above with no relaxation.
- AI assistants MUST NOT expand scope beyond PROJECT_SPEC.md, introduce dependencies without justification, or scaffold implementation before the relevant milestone authorizes it.
- Generated code and docs are proposals; human review is the gate. Security-sensitive or architecturally significant AI output MUST be explicitly flagged as such for review.
- If a request conflicts with these guardrails, the assistant states the conflict and asks, rather than silently complying or silently refusing.

---

## 7. Amending This Document

Guardrails change only by PR with explicit maintainer approval, and the amendment PR must state which principle or standard changes and why. Standards that merely inconvenience are enforced; standards that prove wrong are amended — not ignored.
