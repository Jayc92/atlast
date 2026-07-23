#!/usr/bin/env bash
# Atlast verification contract (M0 Phase B).
#
# The single deterministic entry point that defines "verified" for this
# repository (GUARDRAILS.md § 5, ADR-0013): CI runs exactly this script and
# nothing else, so every check added here runs identically locally and in CI.
# Stages run cheapest-first and fail fast (ADR-0013 § 4). This script only
# verifies: it never installs or upgrades dependencies, never runs formatting
# in write mode, and does not intentionally modify tracked source, tests,
# configuration, documentation, manifests, or lockfiles. Its build and test
# stages do create or update generated, git-ignored artifacts (dist/,
# test-results/, Playwright failure reports). It touches no system beyond
# the loopback servers the acceptance suite boots and tears down itself
# (ADR-0010).
#
# Prerequisites (not verification stages — run them once beforehand):
#   ./scripts/bootstrap.sh                                  # toolchain + install
#   pnpm --filter @atlast/tests-acceptance browser:install  # one-time Chromium
set -euo pipefail

# --- Resolve the repository root so this works from any directory ---
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/.." && pwd)"
cd "${repository_root}"

print_stage() {
  printf '\n==> %s\n' "$1"
}

print_stage "Stage 1/7: Git whitespace validation (unstaged, then staged)"
git diff --check
git diff --cached --check
printf 'No whitespace errors.\n'

print_stage "Stage 2/7: Formatting verification (Prettier, per ADR-0007)"
pnpm format:check

print_stage "Stage 3/7: Linting (ESLint, per ADR-0006)"
pnpm lint

print_stage "Stage 4/7: Type checking (recursive tsc, per ADR-0002)"
pnpm typecheck

print_stage "Stage 5/7: Non-browser tests (Vitest suites, per ADR-0008/0009)"
# Every workspace test script except the browser acceptance suite, which has
# its own stage below so a browser failure is never conflated with a unit or
# contract failure. Packages without a test script are skipped.
pnpm --recursive --if-present --filter '!@atlast/tests-acceptance' run test

print_stage "Stage 6/7: Production builds (recursive, per ADR-0002)"
pnpm build

print_stage "Stage 7/7: Browser acceptance (Playwright, per ADR-0010)"
# The suite builds and boots the real API and web preview itself on loopback
# ports 3001/4173 and tears both down afterwards. A missing Chromium binary
# is a missing prerequisite, not a verification result — surface the fix
# without hiding the failure.
if ! pnpm --filter @atlast/tests-acceptance run test; then
  printf '\nBrowser acceptance failed. If the error above reports a missing\n' >&2
  printf 'Chromium executable, install the pinned browser once with:\n\n' >&2
  printf '  pnpm --filter @atlast/tests-acceptance browser:install\n\n' >&2
  printf 'then re-run this script.\n' >&2
  exit 1
fi

print_stage "Verification complete"
printf 'All stages passed: whitespace, formatting, lint, types, tests, builds, browser acceptance.\n'
