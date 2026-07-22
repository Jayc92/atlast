# ADR-0005: Shared Validation and Typing Strategy — Strict TypeScript + Zod Schemas in a Shared Package

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

The domain model — Entity, Relationship, Evidence, Overlay, Snapshot, Impact query ([PROJECT_SPEC.md § 4](../../PROJECT_SPEC.md#4-core-concepts-domain-language)) — is consumed by the backend API, the web application, fixtures, and tests. Guardrails require the strongest available typing on all public interfaces, mandatory provenance/confidence/freshness on every fact, and explicit validation of all inputs. Types alone stop at compile time; data crossing runtime boundaries (HTTP requests, fixture files) needs runtime validation that cannot drift from the static types.

## Problem

Keep one definition of every domain shape that yields both compile-time types and runtime validation, shared across all packages, so the frontend, backend, and fixtures can never disagree about what an `Entity` is.

## Decision

- **TypeScript in maximally strict mode** everywhere: `strict: true` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, in a single shared `tsconfig` base that packages extend.
- **Zod schemas as the single source of truth for domain shapes**, defined once in a shared workspace package (e.g., `packages/shared-domain`). Static types are derived via `z.infer<>` — never hand-written in parallel.
- **Validation at every trust boundary:** API request/response payloads (wired into Fastify per ADR-0004) and fixture files are parsed through these schemas; internal code then works with proven types. Invalid data fails loudly at the boundary — no silent coercion, no empty defaults, per the explicit-error guardrail.

## Alternatives Considered

- **TypeScript types/interfaces only, hand-rolled runtime guards** — no dependency, but two parallel definitions per shape that _will_ drift; hand-written guards are precisely the boring-but-error-prone code schema libraries exist to eliminate.
- **JSON Schema as the source of truth (with type generation)** — language-neutral and Fastify-native, but authoring complex schemas in JSON is poor DX, and codegen adds a build step where Zod's inference is instantaneous. Fastify interop is achievable from Zod instead.
- **Valibot / ArkType** — smaller or faster than Zod, but younger with smaller ecosystems; "boring, stable" favors Zod, the de-facto standard.
- **Protobuf / OpenAPI-first codegen** — appropriate for polyglot organizations; heavyweight for a single-language monorepo at M0. The schema-per-route approach keeps a later OpenAPI export possible.

## Tradeoffs

- **Chosen:** one definition per domain shape; runtime and compile-time guarantees cannot diverge; validation errors are structured and reportable.
- **Given up:** zero-dependency purity (Zod is a core dependency now); some runtime validation cost on hot paths (negligible at synthetic-data scale; measurable later and optimizable per-boundary if ever needed).

## Consequences

- The shared domain package becomes the most load-bearing package in the monorepo; changes to it are effectively contract changes and reviewed as such.
- Provenance, confidence, and freshness are **required fields** in the base fact schemas — code that omits them fails type-check _and_ runtime validation, making [GUARDRAILS.md § 1.2](../../GUARDRAILS.md#12-evidence-and-honesty-requirements) structurally enforced.
- Domain vocabulary is enforced at the type level: the schemas export `Entity`, `Relationship`, `Evidence` — no synonyms can exist in the model layer.

## Risks

- Zod schema definitions can accrete cleverness (deep transforms, refinements-as-business-logic). Mitigation: schemas define _shape and constraint_, not behavior; review enforces this line.
- A future non-TypeScript consumer would need a translated contract. Mitigation: schema-per-route (ADR-0004) preserves a path to exporting JSON Schema/OpenAPI.

## Why This Fits Atlast

- **Honest degradation starts at the boundary:** you cannot degrade visibly if malformed data slips in silently; boundary validation is the enforcement mechanism.
- **Fixture-first testing:** fixtures validated by the same schemas as production inputs make it impossible for tests to pass against data the real boundary would reject.
- **Single source of truth:** the documentation standard ([GUARDRAILS.md § 4](../../GUARDRAILS.md#4-documentation-standards)) applied to types.

## Conditions That Would Justify Changing This Decision

- A committed polyglot consumer (non-TypeScript adapter or client) makes a language-neutral schema source (JSON Schema / OpenAPI-first) the better single source of truth.
- Measured validation overhead on the query API's hot path becomes material at real scale and cannot be solved by per-boundary compilation.
- Zod's maintenance or the TypeScript inference it relies on regresses badly across major versions.
