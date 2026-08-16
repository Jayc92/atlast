# ADR-0031: M3 Overlay Presentation and Accessibility

**Status:** Accepted
**Date:** 2026-08-16

> **Approval note (2026-08-16):** Explicitly accepted by Joseph Carfagno after independent architecture review, correction, and focused re-review. Acceptance establishes the M3 overlay-presentation and accessibility decision and approves it as part of the [M3 implementation baseline](../m3-plan.md). It becomes operational only after the acceptance record merges to `main` and local `main` is synchronized cleanly. Acceptance does not release M3-A or authorize M4+.

## Context

M2 established a query-only React SPA, canonical URL state, a graph viewport, an equivalent structured topology view, visible trust semantics, and WCAG 2.2 AA as the target. M3 must add operational state without reducing those guarantees or implying that Atlast is a monitoring console.

Color-only nodes, unlabeled icons, hidden gaps, or browser-derived risk would make the overlay attractive but untrustworthy. Overlay failure must not take down topology exploration.

## Decision

### 1. Make overlays an optional topology layer

A canonical `health=on` URL parameter enables health-in-context reads; no other `health` value is valid, and absence means overlays are off. `healthStates` is one scalar comma-separated list drawn from the six effective states. Serialization removes duplicates and writes values in the exact order `healthy`, `degraded`, `down`, `disconnected`, `expiring-certificate`, `latent-downstream-risk`. Repeated keys and empty or unknown tokens are invalid URL state: the whole `healthStates` value is dropped, the safe absent meaning is used, and the existing canonicalization notice is shown. Absence means all reported states are emphasized.

These are state-emphasis controls, not topology filters. Matching projections receive their state treatment; nonmatching and unreported Entities remain present with neutral treatment. Edges, structured rows, and gap records remain present. The API projection is unchanged.

When overlays are off, the M2 topology experience and requests remain unchanged. The M2 traversal response remains the base topology source when overlays are on. Health-context is an additional validated projection and may publish only when its complete resolved topology identity and ordered traversal subject identifiers exactly match the base traversal for the same origin and bounds. Overlay failure or coordinate mismatch leaves topology visible with a separately labeled error and retry action.

### 2. Coordinate frame and history explicitly

`overlayFrame` is valid only when `health=on` and the complete topology pin is present. Pinned historical URLs with health enabled carry `overlayFrame` alongside that pin. In latest mode, the URL omits both coordinate families, but the browser first uses the M2 single-flight coordinator to establish one latest topology identity and then issues health-context pinned to that identity. The UI displays the identities returned by the response. Refresh latest starts one new generation. Stale responses cannot publish into a newer generation.

Changing an M2 history anchor first clears the old `overlayFrame`, then selects the greatest eligible frame by `(effectiveAt, frame identifier)`, and finally writes the exact returned frame identifier into the URL. An exact frame already compatible with an unchanged topology pin remains selected. Invalid copied coordinates remain visible and offer explicit recovery; the UI never silently substitutes latest.

The complete canonical serialization order is `q`, `direction`, `depth`, `minConfidence`, `view`, `selected`, `health`, `healthStates`, `asOf`, `horizon`, `derivationVersion`, `overlayFrame`. `healthStates` without `health=on` is dropped. `overlayFrame` without both `health=on` and a valid complete pin is dropped. An invalid `health` value disables health and drops both dependent overlay fields while preserving otherwise valid topology state. Unknown or repeated keys and these invalid dependency combinations are flagged as canonicalized and explained through the existing correction notice.

### 3. Use non-color semantics everywhere

Every state has a stable text label and icon or pattern in addition to color. Graph nodes expose the state in their accessible names. The structured view presents the same direct condition, effective state, and derivation explanation.

Disconnected does not remove edges. Latent downstream risk names the triggering Entity and exposes the canonical path. Unreported Entities remain visible and labeled `No overlay report`.

### 4. Make gaps first-class

Frame-wide unknown-target gaps appear in a dedicated, keyboard-reachable region with target identifier, source frame, direct condition, and reason. A known Entity outside the loaded neighborhood is not a gap. Gaps never appear as graph nodes or traversal counts. Empty gaps are stated, not inferred from a missing panel.

### 5. Preserve accessibility and responsive behavior

- Graph and structured views share selection, filter, and inspector state.
- Every control is keyboard operable with visible focus.
- Status and failure changes use appropriate live-region semantics without repeated announcements.
- State meaning never depends on color, animation, hover, or canvas position.
- Narrow layouts keep filters, legends, gaps, and explanations readable without horizontal page overflow.
- Reduced motion disables overlay transitions.
- Representative VoiceOver QA is required before closeout.

### 6. Keep trust language precise

The UI says `Synthetic operational overlay`, not live, real-time, alert, incident, or monitored status. Direct observations and derived contextual risk are labeled separately. Overlay timestamps are frame effective times, not topology observation times or freshness classifications.

## Consequences

- M3 state is visible in both visual and semantic representations.
- Overlay absence or failure cannot erase topology.
- Canonical URLs grow but preserve copied historical context.
- Six-state non-color treatment and gap presentation require manual QA in addition to automation.
- No new frontend dependency is required.

## Alternatives Rejected

- **Color-only node fills:** inaccessible and ambiguous.
- **Replace topology with a health dashboard:** violates product scope and loses graph context.
- **Hide unknown targets:** conceals discovery gaps.
- **Remove disconnected edges:** rewrites topology based on ephemeral state.
- **Browser-computed latent risk:** creates a non-authoritative second policy engine.
- **Auto-refresh polling:** implies live monitoring and introduces nondeterministic UI behavior.

## Verification Obligations

- Component tests for all six labels, icons/patterns, direct/derived text, unreported state, and gaps.
- Graph/structured equivalence tests over the same validated response.
- Exact URL wire-format, dependency, ordering, canonical-correction, history, refresh-generation, invalid-coordinate, and browser Back/Forward tests.
- Keyboard focus/activation and inspector-return tests.
- Reduced-motion, non-color, zoom/reflow, responsive-overflow, and live-region tests.
- Built-preview desktop/mobile acceptance and representative VoiceOver QA.
- Overlay-off, response-identity/subject mismatch, and overlay-failure tests proving base topology remains usable and unchanged.

## Change Conditions

Revisit before polling, streaming, notifications, alert acknowledgement, incident workflow, real data, or any state-based topology mutation.

This Accepted ADR does not authorize implementation. M3-A requires a separate explicit release.
