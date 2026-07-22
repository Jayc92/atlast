# ADR-0009: Integration Testing — In-Process API Contract Tests over Fixtures (Vitest + fastify.inject)

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

[GUARDRAILS.md § 5](../../GUARDRAILS.md#5-testing-philosophy) names the system's contracts — the evidence format, the reconciliation rules, the query API — as the prime test surfaces, and requires that every component be testable against `fixtures/` with no live infrastructure. Through M4 there are no external systems _by design_, so "integration" cannot mean "test against real services"; it means testing assembled components through their real contracts.

## Problem

Define what integration testing means for Atlast and pick the mechanism, such that the tests are deterministic, hermetic, and assert behavior at contract boundaries rather than implementation details.

## Decision

Integration tests are **in-process tests that exercise the fully assembled application through its public contracts**, distinguished from unit tests by scope, not by tooling:

- **Backend:** boot the real Fastify application (all plugins, real routing, real validation — in whatever configuration the current milestone actually ships; M0 has no authentication per ADR-0004) and drive it via **`fastify.inject()`** — real HTTP semantics, zero network sockets. Storage is the real current storage layer (M0: fixture-backed in-memory per ADR-0012) loaded from `fixtures/`.
- **Runner:** **Vitest** (ADR-0008) — same runner, separate `*.integration.test.ts` suites so `verify.sh` reports them as a distinct step.
- **Doubles policy:** nothing inside the application under test is mocked. The only injected fakes are the deterministic seams the architecture already mandates — clock and randomness. When external discovery sources exist (M5+), they are replayed from recorded fixtures, never contacted live in CI.
- **Unhappy paths are first-class suites:** stale facts, conflicting evidence, missing entities — and, once the separately approved authentication ADR lands (required before the query API is externally reachable or real-system-connected, [GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security)), unauthenticated requests — get integration coverage from the first milestone that makes each representable.

## Alternatives Considered

- **Docker-Compose-based environment tests** (real ports, containerized services) — the conventional "integration test" shape. Rejected: there are no external services to containerize through M4, it would violate the no-deployment-tooling constraint of this phase, and containers introduce startup nondeterminism for zero added truth.
- **Network-socket tests against a listening server** (supertest-style over real ports) — marginally more "real" than injection, but adds port allocation and lifecycle flake; `fastify.inject()` exercises identical routing/validation/serialization paths.
- **Contract-testing frameworks (e.g., Pact)** — solves cross-team consumer/provider drift; Atlast's consumers and provider live in one monorepo sharing one schema package (ADR-0005), so the drift Pact prevents cannot occur yet.

## Tradeoffs

- **Chosen:** hermetic, fast, order-independent suites that CI runs identically to local; failures always attributable to code, never environment.
- **Given up:** coverage of true network-layer behavior (TCP, TLS, real client quirks) — deliberately deferred to browser acceptance tests (ADR-0010), which do cross a real HTTP boundary.

## Consequences

- Integration suites double as the query API's executable specification — every contract guarantee in the docs should trace to an integration test.
- The fixture suite becomes shared infrastructure between unit, integration, and acceptance layers; fixture quality is test quality.
- When M5's Kubernetes adapter arrives, its integration tests follow the same pattern (recorded/replayed API responses as fixtures), already established here.

## Risks

- In-process testing can mask assembly problems that only appear in a really-listening server (port binding, proxy headers). Mitigation: the browser acceptance layer boots the genuine server and would catch these.
- "Integration" suites can sprawl into slow re-tests of unit-level logic. Mitigation: the contract-boundary rule — if a test doesn't cross a package or API boundary, it's a unit test and lives there.

## Why This Fits Atlast

- **Test behavior at contracts:** this is the guardrail's testing philosophy implemented literally — the query API tested as consumers actually experience it.
- **Determinism is non-negotiable:** no containers, no ports, no timing races.
- **Synthetic-first sequencing:** the definition of integration testing itself respects that reality contact begins only at M5.

## Conditions That Would Justify Changing This Decision

- Adoption of out-of-process storage (see ADR-0012's change conditions) — at that point a real storage backend joins the integration environment, likely via ephemeral containers, and this ADR is superseded with that design.
- A second, independently deployed consumer of the query API outside the monorepo — cross-repo contract testing (Pact-style) becomes worth its cost.
- Evidence of a bug class that injection-based tests systematically miss.
