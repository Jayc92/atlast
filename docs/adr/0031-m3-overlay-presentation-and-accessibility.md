# ADR-0031: M3 Overlay Presentation and Accessibility

**Status:** Proposed
**Date:** 2026-08-16

## Context

M2 established a query-only React SPA, canonical URL state, a graph viewport, an equivalent structured topology view, visible trust semantics, and WCAG 2.2 AA as the target. M3 must add operational state without reducing those guarantees or implying that Atlast is a monitoring console.

Color-only nodes, unlabeled icons, hidden gaps, or browser-derived risk would make the overlay attractive but untrustworthy. Overlay failure must not take down topology exploration.

## Decision

### 1. Make overlays an optional topology layer

A canonical `health=on` URL parameter enables health-in-context reads. Absence means overlays are off. A canonical `healthStates` parameter may filter the six effective states; values normalize to fixed enum order with duplicates removed. Filtering changes presentation only and never changes the API projection.

When overlays are off, the M2 topology experience and requests remain unchanged. Overlay failure leaves topology visible with a separately labeled error and retry action.

### 2. Coordinate frame and history explicitly

Pinned historical URLs with health enabled carry `overlayFrame` alongside the complete topology pin. Latest mode may omit all pins; the UI displays the identities resolved by the response. Refresh latest starts one new generation. Stale responses cannot publish into a newer generation.

Changing an M2 history anchor selects the newest eligible frame unless an exact compatible frame is already pinned. Invalid copied coordinates remain visible and offer explicit recovery; the UI never silently substitutes latest.

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
- Canonical URL, history, refresh-generation, invalid-coordinate, and browser Back/Forward tests.
- Keyboard focus/activation and inspector-return tests.
- Reduced-motion, non-color, zoom/reflow, responsive-overflow, and live-region tests.
- Built-preview desktop/mobile acceptance and representative VoiceOver QA.
- Overlay-off and overlay-failure tests proving topology remains usable.

## Change Conditions

Revisit before polling, streaming, notifications, alert acknowledgement, incident workflow, real data, or any state-based topology mutation.

This Proposed ADR authorizes no implementation.
