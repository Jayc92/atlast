# ADR-0004: Backend API Framework — Fastify

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

M0 delivers a backend API shell that will grow into the query API — the single read contract for every consumer ([architecture § 3.6](../architecture.md#36-query-api)). It must carry provenance/confidence/freshness in its response types and be testable deterministically against fixtures with no live infrastructure. The stack is TypeScript on Node.js (ADR-0011).

**Authentication is deliberately out of M0 scope** (human review decision, 2026-07-22). M0 implements no users, sessions, OAuth, SSO, API keys, or identity provider; the M0 API binds to **localhost by default**, so the unauthenticated shell is never network-exposed. Per [GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security), the M0 local shell is exempt, while the first _externally reachable or real-system-connected_ query API must require authentication, governed by a separately approved authentication ADR, and must not be implemented before its milestone is explicitly authorized. The M0 design preserves a clean future authentication boundary — a single top-level request-lifecycle hook point where an auth plugin will attach — without implementing it now.

## Problem

Choose an HTTP framework that gives typed, schema-validated request/response boundaries, first-class in-process testing (no network sockets in tests), and a stability record fit for a component that must out-survive the systems it maps.

## Decision

Use **Fastify** as the backend API framework, with JSON-schema-backed route validation wired to the shared Zod schemas (ADR-0005) so request and response contracts are validated at the boundary and typed end to end.

## Alternatives Considered

- **Express** — the strongest alternative by ubiquity. Rejected because it validates nothing by default (input validation would be hand-rolled per route, a standing security risk), its TypeScript story is bolt-on, and its middleware-everything model makes contract enforcement conventions rather than structure.
- **NestJS** — full application framework with DI, decorators, and modules. Rejected as directly contrary to "simplicity over cleverness": a large abstraction layer for an API whose core is one read contract.
- **Hono** — modern, fast, multi-runtime. Rejected as younger and optimized for edge runtimes we are not targeting; less battle-tested for a long-lived server.
- **tRPC (alone)** — end-to-end types without codegen, but couples all consumers to TypeScript clients. The query API must serve _any_ consumer (external integrations are in scope, [PROJECT_SPEC.md § 5.1](../../PROJECT_SPEC.md#51-in-scope)), so an HTTP/JSON contract is required; tRPC could only ever be a supplement.

## Tradeoffs

- **Chosen:** schema validation at every boundary by design (inputs rejected before handlers run), excellent TypeScript typing, `fastify.inject()` for fully in-process HTTP tests, a stable plugin model with clear encapsulation.
- **Given up:** Express's unmatched middleware ecosystem breadth (Fastify's is smaller but covers everything we need); NestJS's prescriptive structure (we impose our own thinner structure instead).

## Consequences

- Every route declares its input/output schema — the query API contract becomes machine-readable, which later supports generated API docs and client types.
- Integration tests (ADR-0009) run against `fastify.inject()` with zero open ports, keeping the suite deterministic and CI hermetic.
- Fastify's plugin encapsulation provides the future authentication boundary: when the separately approved authentication ADR introduces authentication (required before the query API becomes externally reachable or real-system-connected, per [GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security)), it attaches as a top-level plugin without restructuring routes. In M0, no such plugin exists and the server binds to localhost by default.

## Risks

- Fastify major versions have historically required plugin-ecosystem catch-up. Mitigation: minimal plugin usage; version pinning; upgrades as deliberate PRs.
- Schema-first routing is more upfront ceremony per route. Accepted: for this product, the contract _is_ the product surface — ceremony at the boundary is the point.

## Why This Fits Atlast

- **Evidence and honesty requirements:** validated, typed boundaries make provenance/confidence/freshness structurally present in every response type, not optional metadata.
- **Boring core:** Fastify is mature, conservative, and widely deployed — ambition stays at the edges.
- **Deterministic testing:** in-process injection testing is exactly the fixture-first, no-live-infrastructure model [GUARDRAILS.md § 5](../../GUARDRAILS.md#5-testing-philosophy) requires.

## Conditions That Would Justify Changing This Decision

- The query API's needs shift decisively toward a graph-native protocol (e.g., a GraphQL or purpose-built query surface — an open question in [architecture § 7](../architecture.md#7-open-questions)) that another server model serves fundamentally better; that would arrive as an M1 ADR with this one superseded explicitly.
- Fastify maintenance or security response degrades.
- Measured performance of the query API under realistic graph load proves inadequate and profiling attributes it to the framework layer (unlikely; storage will dominate).
