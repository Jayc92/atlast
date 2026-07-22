# ADR-0003: Frontend Framework — React with Vite (client-rendered SPA)

**Status:** Accepted
**Date:** 2026-07-22

> **Approval note (2026-07-22):** Formally approved by human review. Acceptance authorizes **M0 Phase B scaffolding only**; it does not authorize M1 or later milestone work, each of which requires its own explicit authorization ([docs/milestones.md](../milestones.md)).

## Context

M0 delivers a web application shell; M2 grows it into an interactive graph exploration UI — navigation and layout of a dependency graph, search, entity detail with provenance/confidence/freshness, overlay toggles (M3), impact views (M4), and history playback ([docs/milestones.md](../milestones.md)). The UI is architecturally a *view* over the query API with no state the API cannot serve ([architecture § 3.8](../architecture.md#38-exploration-ui)). There is no marketing site, no SEO requirement, no server-side rendering need, and — per this milestone's constraints — no deployment tooling or production infrastructure.

## Problem

Choose a frontend stack that supports a long-lived, highly interactive, canvas/SVG-heavy single-page application, is testable deterministically, and does not smuggle in server infrastructure we are forbidden to build yet.

## Decision

Build the web application as a **client-rendered single-page application using React, built with Vite**, in strict TypeScript. All data access goes through the backend query API (no side doors). Graph *visualization* libraries are explicitly **not** chosen here — that is an M2 decision with its own ADR.

## Alternatives Considered

- **Next.js** — the strongest alternative and the ecosystem default. Rejected because its value (SSR/SSG, routing conventions, server components, deployment integration) targets content-delivery problems Atlast does not have; it embeds a Node server and deployment assumptions into the frontend, violating "no deployment tooling / no production infrastructure" and adding a large framework surface to an app that is a pure API client.
- **Vue 3 + Vite** — technically excellent and comparably boring. Rejected on ecosystem grounds: React has the deepest pool of graph-visualization integrations, testing tooling, and contributors — relevant for M2's core deliverable.
- **SvelteKit / Solid** — smaller ecosystems and faster-moving APIs; conflicts with "prefer boring, stable technology" for a product meant to out-survive the systems it maps.

## Tradeoffs

- **Chosen:** the largest ecosystem and hiring pool; Vite's fast, simple dev server and build; a pure-SPA architecture that keeps the frontend a thin view with zero server-side surface.
- **Given up:** SSR/SEO (irrelevant — an authenticated internal tool); Next.js's batteries-included conventions (routing, data fetching), which we replace with small, boring libraries only as needed.

## Consequences

- The frontend is a static bundle talking to the backend API — the simplest possible deployment story when deployment eventually matters.
- Client-side routing and state management are our responsibility; M0 needs almost none (a shell), and additions are justified per-dependency per [GUARDRAILS.md § 2](../../GUARDRAILS.md#2-coding-standards).
- Browser acceptance testing (ADR-0010) targets a plain static app served by Vite — no framework-specific test adapters.

## Risks

- React's ecosystem churn (state-management fashion cycles) can invite dependency creep. Mitigation: the dependency-justification guardrail; the M0 shell takes React, React DOM, and Vite only.
- If a genuine SSR need ever emerges, retrofitting is real work. Assessed as very unlikely for an authenticated graph-exploration tool.

## Why This Fits Atlast

- **The UI is a view:** a client-rendered SPA over one API is the exact architectural shape [architecture § 3.8](../architecture.md#38-exploration-ui) prescribes.
- **Boring, stable:** React and Vite are among the most stable, widely supported choices in the ecosystem.
- **Minimize operational burden:** no frontend server process to run, monitor, or secure.

## Conditions That Would Justify Changing This Decision

- A validated requirement for server-side rendering or per-request server logic in the UI tier (none is foreseeable in M0–M5).
- Vite or React losing maintenance vitality (no realistic sign of either).
- M2 graph-visualization spikes revealing a hard technical blocker in React's rendering model for the required graph scale — this would reopen the decision with evidence in hand.
