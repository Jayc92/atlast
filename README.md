# Atlast

**An AI-powered Engineering Topology Platform.**

Atlast continuously discovers the systems your organization runs, builds a living dependency graph of how they connect, overlays real-time operational health, and predicts the downstream impact of technical changes before they happen.

> **Status: Pre-implementation.** This repository currently contains foundational documentation only. No application code exists yet. Read [PROJECT_SPEC.md](PROJECT_SPEC.md) before contributing anything.

---

## Why Atlast Exists

Every engineering organization eventually loses the ability to answer three questions quickly and confidently:

1. **What do we actually run?** Service catalogs go stale the day they are written.
2. **What depends on what?** Dependency knowledge lives in the heads of senior engineers and is lost when they leave.
3. **What breaks if we change this?** Impact analysis is guesswork, so changes are either reckless or overly cautious.

Atlast answers all three continuously, from observed reality rather than manually maintained records. The map is derived from the territory — never the other way around.

## What Atlast Does

- **Continuous discovery** — automatically finds services, data stores, queues, jobs, and infrastructure by observing traffic, configuration, deployment metadata, and code.
- **Living dependency graph** — maintains a versioned, queryable graph of every system and the relationships between them, updated as reality changes.
- **Operational health overlay** — projects alerts, SLO status, incident state, and deployment activity onto the graph so topology and health are one picture.
- **Change impact prediction** — given a proposed change ("upgrade this database", "deprecate this API", "deploy this service"), predicts the blast radius and ranks downstream risk.

## What Atlast Is Not

Atlast has deliberate boundaries. It is **not** a monitoring system, an incident management tool, a CMDB you edit by hand, a deployment platform, or an autonomous remediation engine. The full list of non-goals — and why they are non-goals — lives in [PROJECT_SPEC.md § Non-Goals](PROJECT_SPEC.md#7-non-goals--what-atlast-will-not-become).

## Documentation Map

| Document | Purpose |
|---|---|
| [PROJECT_SPEC.md](PROJECT_SPEC.md) | Vision, goals, guiding principles, scope, and non-goals |
| [docs/architecture.md](docs/architecture.md) | Architecture philosophy and conceptual system design |
| [docs/milestones.md](docs/milestones.md) | Synthetic-first delivery plan (M0 foundation → M1 synthetic topology model → M2 interactive interface → M3 health overlays → M4 change-impact simulation → M5 read-only local Kubernetes connector); predictive AI is post-M5 |
| [TASKS.md](TASKS.md) | Current work breakdown and task tracking |
| [GUARDRAILS.md](GUARDRAILS.md) | Engineering, coding, repository, documentation, and testing standards |
| [CLAUDE.md](CLAUDE.md) | Working instructions for AI coding assistants in this repository |

## Contributing

Implementation has not started. Until it does, contributions take the form of documentation review and refinement. All contributions — documentation or code — must comply with [GUARDRAILS.md](GUARDRAILS.md).

## License

TBD — to be decided before the first public release.
