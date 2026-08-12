# ADR-0027: M2 Graph Rendering, Layout, and Accessibility

**Status:** Accepted
**Date:** 2026-08-12

> **Approval note (2026-08-12):** Explicitly accepted by Joseph Carfagno after independent architecture review, correction, and focused re-review found no remaining blocker. Acceptance becomes operational only after PR #34 merges and `main` is synchronized locally with a clean working tree. It establishes the M2 graph-rendering and accessibility decision but does not release M2-A, authorize dependency installation or implementation, or authorize M3+.

## Context

M2 needs interactive topology navigation, but the graph is a trust-bearing view rather than a decorative diagram. M1 traversal returns bounded mixed-kind subjects with complete assertions; it does not return presentation coordinates. Relationship claims may conflict, identities may be ambiguous, endpoints may lie outside the loaded neighborhood, and traversal may be truncated. The UI must represent those facts without inventing certainty.

A canvas-only or pointer-only graph would fail keyboard, screen-reader, mobile, and testability requirements. A hand-built pan/zoom/selection engine would consume substantial scope unrelated to Atlast's product differentiation.

## Decision

### 1. Use React Flow for the interactive viewport

Adopt `@xyflow/react` as the graph interaction/rendering layer. It owns viewport pan/zoom, node positioning, selection events, and edge rendering. It does not own domain state or transform graph meaning.

### 2. Use ELK for deterministic automatic layout

Adopt `elkjs` for layered directed layout. Before layout, all Entity nodes, Relationship claim edges, and ports are constructed in canonical identifier order. The chosen ELK options are fixed in code and covered by adapter tests. Layout output is presentation-only and never persisted as graph truth.

Exact package versions are pinned only in the separately authorized implementation slice. Both are significant dependencies and require explicit acceptance of this ADR before installation.

### 3. Keep a domain-to-view adapter boundary

One pure adapter converts validated traversal/search/detail results into:

- Entity view nodes keyed by stable Entity identifier;
- directed view edges keyed by Relationship subject identifier plus assertion/claim identity;
- inspector records preserving every source assertion, competing claim, ambiguity marker, provenance reference, confidence, freshness, and validity interval;
- explicit missing-endpoint and traversal-truncation records.

React Flow components never receive raw API responses and never choose among competing claims.

### 4. Render conflict honestly

- Uncontested Relationship claims render as ordinary directed edges.
- A conflicted Relationship renders every visible mutually exclusive claim as a separate candidate edge associated with the same stable Relationship subject.
- Candidate edges use text/icon/pattern treatment in addition to color and carry an explicit “conflicted” label.
- No edge is labeled canonical, resolved, or winning.
- A claim whose endpoint is outside the loaded result becomes an inspector-visible boundary reference; the UI does not synthesize a phantom Entity node.

### 5. Provide an equivalent structured topology view

Every loaded graph has a semantic structured representation available without the viewport:

- entities as a keyboard-operable list;
- relationships grouped by source/target and direction;
- the same selection and inspector actions;
- explicit confidence, freshness, conflict, ambiguity, and missing-endpoint text;
- traversal truncation and loaded-scope summary.

Graph and structured views share one selection model. Changing views does not lose focus target, selected subject, snapshot identity, or traversal bounds.

### 6. Responsive behavior

- At wide widths, controls, viewport/structured view, and inspector may coexist.
- At narrow widths, results/topology/inspector become explicit panes; the graph is not shrunk into an unusable desktop layout.
- Touch and keyboard controls have visible alternatives outside the canvas.
- `prefers-reduced-motion` disables nonessential animated transitions.

### 7. Set a concrete accessibility target

All M2 browser routes target [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/). The structured topology view is the normative semantic equivalent of the graph, not a reduced fallback. Automated checks supplement but do not replace keyboard, focus, zoom/reflow, reduced-motion, contrast/non-color, and representative screen-reader verification. Any applicable Level AA failure blocks M2 closeout unless a narrower exception is explicitly reviewed and recorded.

## Consequences

- The project avoids building low-level graph interaction and layout engines.
- Domain honesty is enforced before data reaches the rendering library.
- Accessibility does not depend on the third-party canvas/SVG implementation because the structured view is normative and equivalent.
- The browser bundle grows; M2-C must record production bundle size before/after and review lazy-loading of the graph viewport.
- Layout tests assert deterministic adapter input/output relationships and semantic invariants, not fragile pixel-perfect coordinates.
- This ADR does not authorize dependency installation or implementation.

## Alternatives Rejected

- **Custom SVG graph engine:** attractive for the tiny fixture catalog, but recreates pan/zoom, selection, edge routing, viewport controls, and ongoing browser behavior.
- **Canvas-only rendering:** weak semantic accessibility and harder deterministic browser testing.
- **Force-directed layout:** motion and nondeterministic settling undermine reproducibility and historical comparison.
- **Graph viewport as the only representation:** fails keyboard/screen-reader/mobile access and makes trust details too easy to hide.
- **Collapsing conflicting claims before rendering:** violates fail-honest and evidence-first principles.

## Verification Obligations

- Pure adapter tests for entity nodes, relationship claims, conflicts, ambiguity, missing endpoints, and truncation.
- Deterministic layout-input ordering tests.
- Keyboard-only component tests for selection and inspector transitions.
- Structured/graph view equivalence tests over the same fixture response.
- Mobile and desktop browser acceptance for the primary exploration journey.
- Reduced-motion and non-color state tests.
- WCAG 2.2 AA audit covering keyboard operation, focus order/visibility, semantics and names, zoom/reflow, contrast, status/error announcements, and target size, with manual evidence for behavior automation cannot establish.
