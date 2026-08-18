# ADR-0034: M4 Impact Presentation and Accessibility

**Status:** Accepted
**Date:** 2026-08-17

> **Approval note (2026-08-17):** Drafted under Joseph Carfagno's 2026-08-17 authorization of M4 planning and pre-release architecture/ADR review only ([TASKS.md](../../TASKS.md), [HANDOFF.md](../../HANDOFF.md)), depending on [ADR-0032](0032-m4-change-impact-domain-model.md) and [ADR-0033](0033-m4-impact-query-api-contract.md), independently reviewed and corrected, then **explicitly accepted by Joseph Carfagno on 2026-08-17** as part of the M4 implementation baseline alongside [docs/m4-plan.md](../m4-plan.md) and ADRs 0032/0033/0035. Acceptance becomes operational only after this record merges to `main` and local `main` is synchronized cleanly. Acceptance does not release M4-C/M4-D and does not authorize M5+.

## Context

M2 established a query-only React SPA, canonical URL state, a graph viewport with an equivalent accessible structured view, and WCAG 2.2 AA as the target. M3 added an optional health overlay layer without weakening any of that. M4 adds a second optional layer — impact analysis — over the same trust-presentation foundation. A ranked list with numeric confidence and an evidence path is exactly the kind of trust-sensitive content [ADR-0028 § 3](0028-m2-snapshot-navigation-and-trust-contract.md) and [docs/m2-plan.md § 7](../m2-plan.md#7-trust-presentation-rules) already govern; M4 must extend, not duplicate, that rule set.

Unlike M3's overlay, impact has no second temporal coordinate (ADR-0033 § 2) and no "unknown target" gap concept — it is a single-request, single-response ranked list scoped to one origin Entity already selected in the M2/M3 interface. This keeps its URL and state footprint smaller than M3's.

## Decision

### 1. Make impact an optional, entity-scoped analysis layer

A canonical `changeType` URL parameter, valid only when `selected` names an Entity, both requests and displays the impact query: its absence means the impact panel is closed; its presence with one of `removal`, `degradation`, `interface-change` opens it for the selected Entity using the already-established traversal `direction`/`depth`/`minConfidence` state. No separate boolean toggle parameter is added — unlike M3's `health`/`healthStates` split (needed because `healthStates` is a multi-value filter independent of the on/off state), `changeType` is a single required enum with no meaningful "on but unset" state, so presence-with-a-valid-value already carries both meanings. An unknown or repeated `changeType` value is invalid URL state: the whole parameter is dropped, the safe closed-panel meaning is used, and the existing M2 canonicalization notice is shown — the identical recovery rule ADR-0031 § 2 already established for `health`.

Opening impact analysis does not change `direction`/`depth`/`minConfidence`; it reads the exploration's existing traversal bounds. Changing those bounds while impact is open re-issues the impact query at the new bounds, exactly as changing them already re-issues the base traversal (M2 Journey D). The complete canonical serialization order (ADR-0031 § 2) gains exactly one new trailing key: `..., overlayFrame, changeType`.

### 2. Keep the ranking server-authoritative

The browser renders `results` and `path` exactly as returned; it does not recompute rank scores, reorder results, or assign comparative severity to `changeType`. This is the identical authority split [ADR-0030 § 3](0030-m3-health-in-context-api-contract.md) already established for health projections: "The API, not the browser, applies [domain] semantics... The browser validates and presents the result without recomputation."

### 3. Use precise, non-color semantics for rank and change type

Every ranked result shows its exact numeric `rankScore` together with the explicit label **"uncalibrated synthetic score"**, reusing the trust language already established by M2. M4 defines no "high"/"medium"/"low" bands because the underlying assertion confidence is not calibrated to those qualitative claims. `changeType` is shown as the stable text label for the hypothetical question and may also use a redundant icon; the icon or color is never the only distinction. The evidence path is shown as an ordered, traversable sequence of steps, each dereferencing its `relationshipIdentifier` and citing its `assertionIdentifier` and the Evidence behind it through the existing M2 trust inspector ([docs/m2-plan.md § M2-D](../m2-plan.md#exact-m2-d-authorization-boundary)) and Evidence-dereferencing machinery ([ADR-0028 §§ 3–4](0028-m2-snapshot-navigation-and-trust-contract.md)) — no new Evidence-presentation mechanism is introduced.

`pathEdgeCount` is shown as the path's length so a user can distinguish a direct dependent from an indirect one without recomputing it from the path array.

### 4. Make truncation and emptiness first-class, honest states

When `traversal.truncated` is `true`, the impact panel shows an explicit, persistent notice that the ranked list may be incomplete beyond the loaded neighborhood — the identical discipline [docs/m3-plan.md § 4](../m3-plan.md#4-deterministic-health-semantics) already states for latent-risk derivation: truncation is "never presented as proof that no latent risk exists outside the loaded subgraph." An empty `results` array renders a specific, worded empty state ("no reachable entities meet these bounds"), not a blank panel and not the loading state.

### 5. Preserve failure honesty exactly as the existing layers do

Impact analysis follows the identical Journey F failure taxonomy ([docs/m2-plan.md § 4](../m2-plan.md#4-primary-journeys)) and its ADR-0031 § 1 overlay-specific extension: an expected API error renders a specific recoverable state; an unexpected or malformed response renders a redacted failure state; a resolved-identity mismatch against the already-pinned exploration identity is a visible impact-query failure that never touches the already-rendered topology or the already-open trust inspector; the previous successful impact result is never relabeled current after a failed refresh. Closing and reopening the impact panel, or changing `changeType`, starts a new request generation exactly as changing traversal bounds already does.

### 6. Preserve accessibility and responsive behavior

- The impact panel is keyboard-reachable from entity detail and the graph/structured inspector, with deliberate focus movement on open and focus return to the invoking Entity on close — the identical pattern [docs/m2-plan.md § 9](../m2-plan.md#9-responsive-and-accessibility-baseline)'s trust inspector already uses.
- Every ranked result and every path step is an individually keyboard-operable, individually focusable control; the ranked list is not a single opaque block.
- Status and failure changes use live-region semantics only when the announcement is useful, matching M2's existing "not noisy" rule.
- Rank, change type, and truncation meaning never depend on color, animation, hover, or canvas position.
- Narrow layouts present the impact panel as one primary pane, consistent with M2/M3's existing narrow-screen pattern; no desktop-sized ranked table is forced into mobile.
- Reduced motion disables any impact-panel transition.
- Representative VoiceOver QA is required before M4 closeout, exactly as M3-E required it.

### 7. Keep trust language precise

The UI states plainly that impact results are a deterministic, evidence-derived analysis over the currently loaded synthetic topology — never "prediction," "risk score," "AI," or "recommendation," none of which apply to this deterministic baseline. `changeType` is presented as the question the user asked ("if this entity were removed / degraded / had an interface change"), not as an observed or forecast event.

## Consequences

- Impact analysis reuses the entire M2/M3 trust-presentation, accessibility, and failure-recovery vocabulary; no new interaction pattern is introduced.
- The canonical URL gains exactly one new key, keeping copied-link reproducibility intact.
- Six-state-style manual QA is unnecessary here (impact has three change types, not six operational states), but path drill-down and truncation honesty still require manual accessibility QA in addition to automation.
- No new frontend dependency is required.

## Alternatives Rejected

- **A separate boolean toggle plus a `changeType` value parameter:** unnecessary duplication given `changeType` has no meaningful "on but unset" state; rejected in favor of the simpler single-parameter design (§ 1).
- **Qualitative confidence bands:** would overstate the meaning of an uncalibrated synthetic score; rejected in favor of the exact numeric value plus explicit trust-language label.
- **Browser-side path re-ranking or filtering:** creates a second, non-authoritative ranking engine in the client, the identical anti-pattern ADR-0031 rejected for latent risk.
- **Keep showing the prior result after traversal bounds change:** would silently mislabel a materially different query as current; rejected. Bounds changes re-issue the request with an explicit loading state and the M2 coordinator's stale-response suppression.
- **Merge the impact panel into the existing M3 health inspector:** impact and health are answers to different questions (deterministic hypothetical change vs. observed/derived operational state) and conflating them would blur that distinction for the user; kept as a separate, clearly labeled panel.

## Verification Obligations

- Component tests for exact numeric rank presentation, the "uncalibrated synthetic score" label, change-type labeling, and non-color treatment.
- Canonical URL wire-format, dependency, ordering, and canonicalization-correction tests for `changeType`.
- Graph/structured-inspector integration tests for path drill-down and Evidence dereferencing, reusing the existing M2 Evidence-lookup test patterns.
- Truncation-notice and empty-result tests.
- Resolved-identity-mismatch, stale-generation-suppression, and never-relabel-stale-as-current tests, mirroring ADR-0031's existing overlay-failure tests.
- Keyboard focus/activation and inspector-return tests.
- Reduced-motion, non-color, and responsive-overflow tests.
- Built-preview desktop/mobile acceptance and representative VoiceOver QA.

## Change Conditions

Revisit before: any natural-language explanation of impact results (an LLM layer requires its own ADR and separate human approval per docs/architecture.md § 3.7); multi-entity or multi-change-type comparison views; or any impact-driven topology annotation.

This Accepted ADR does not authorize implementation. M4-C/M4-D (§ [docs/m4-plan.md](../m4-plan.md)) require their own separate, explicit implementation release.
