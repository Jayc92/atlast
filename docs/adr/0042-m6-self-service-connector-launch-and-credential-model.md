# ADR-0042: M6 Self-Service Local Connector Launch and Credential Model

**Status:** Rejected (2026-08-24, same-day adversarial review — folded into [docs/m6-plan.md § 8](../m6-plan.md#8-connectscan-experience) as a plan-level requirement, not retained as a standalone ADR)

**Date drafted:** 2026-08-24. **Date rejected:** 2026-08-24.

## Rejection rationale

An independent adversarial review of the complete Proposed M6 baseline, performed the same day this ADR was drafted, challenged whether this decision actually meets [GUARDRAILS.md § 1.3](../../GUARDRAILS.md#13-change-discipline)'s bar for an ADR: "Significant technical decisions MUST be recorded... 'Significant' = expensive to reverse, or contested." On reflection, this document did not establish a genuinely new architectural decision — it only:

1. sequenced the _existing_, already-Accepted [ADR-0037](0037-m5-read-only-credential-and-rbac-design.md) mechanisms (the target guard, the RBAC design, the structural and live read-only proofs) into an ordered CLI invocation, and
2. restated [ADR-0037 § 3](0037-m5-read-only-credential-and-rbac-design.md#3-explicit-injected-credential--never-ambient-resolution)'s already-binding "explicit, injected credential — never ambient resolution" principle as "credentials never transit browser UI."

Neither of those is expensive to reverse (swapping a CLI flow for a browser wizard later is an additive UI feature, not an architectural rewrite) or contested in any way this review could find — it is downstream _plan detail_ describing how an already-decided security architecture (ADR-0037) gets invoked for one specific milestone's pilot flow, not a new architectural decision in its own right. Retaining it as a fourth ADR merely because a draft already existed would have been exactly the failure mode the review was instructed to guard against ("do not retain an ADR merely because it has already been drafted").

**Disposition:** this document's substantive content — the exact ordered connect/scan flow, the RBAC-provisioning option comparison, the cleanup-instructions requirement, and the credentials-never-in-browser rule — is preserved, corrected, and expanded in [docs/m6-plan.md § 8](../m6-plan.md#8-connectscan-experience) as an ordinary planning requirement. This file is kept (rather than deleted) for historical traceability, per this repository's own `Proposed → Accepted → Superseded (or Rejected)` status convention (`docs/adr/README.md` line 3).

**This ADR authorizes nothing, was never Accepted, and requires no further action.** No M6 slice may cite it as authority; cite [docs/m6-plan.md § 8](../m6-plan.md#8-connectscan-experience) and [ADR-0037](0037-m5-read-only-credential-and-rbac-design.md) instead.

---

## Original draft (preserved for historical record; superseded by the rejection above)

### Context

M5-A's connect/scan experience required an Atlast developer to hand-run `kind`/`kubectl` commands, construct a restricted kubeconfig outside the repository, and start a bespoke experiment entrypoint with explicit environment variables. [docs/m6-plan.md § 3](../m6-plan.md#3-target-tester-and-milestone-purpose) requires a non-Atlast-developer tester to complete the equivalent flow unaided.

### Original decision (superseded)

A CLI/script-based flow, not a browser wizard, sequencing: verify target guard → verify RBAC → start discovery → point the tester at the website. Credentials never transit browser UI.

### Why this was folded rather than kept as an ADR

See the Rejection rationale above. The content was correct as far as it went; the finding was about _form_ (does this need to be its own ADR), not substance.
