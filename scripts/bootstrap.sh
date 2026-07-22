#!/usr/bin/env bash
# Atlast development environment bootstrap (M0 Phase B).
#
# Verifies the pinned toolchain (Node 24 line per ADR-0011, exact pnpm version
# per ADR-0001) and performs a frozen-lockfile install. Per ADR-0001, Corepack
# is never assumed and nothing is installed or enabled automatically: every
# failure prints the exact command for the contributor to run, then exits
# nonzero. This script never installs global tools and never modifies shell
# configuration.
set -euo pipefail

# --- Stage 0: resolve the repository root so this works from any directory ---
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/.." && pwd)"
cd "${repository_root}"

print_stage() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

print_stage "Checking Node.js version (expected: 24 line, per .nvmrc / package.json engines)"
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not on PATH. Install Node.js 24 (see .nvmrc for the exact version) with your version manager, e.g.: nvm install && nvm use"
fi
node_version="$(node --version)"
case "${node_version}" in
  v24.*)
    printf 'Node.js %s OK\n' "${node_version}"
    ;;
  *)
    fail "Node.js ${node_version} is not on the supported Node 24 line. Run your version manager against .nvmrc, e.g.: nvm install && nvm use"
    ;;
esac

print_stage "Reading pinned pnpm version from package.json (packageManager field)"
# package.json is the single source of truth for the pnpm pin (ADR-0001);
# parse it with Node instead of duplicating the version here.
expected_pnpm_version="$(node --print "
  const packageManagerPin = require('./package.json').packageManager ?? '';
  const match = packageManagerPin.match(/^pnpm@(\\d+\\.\\d+\\.\\d+)$/);
  if (!match) {
    console.error('package.json packageManager is not a pnpm pin: ' + JSON.stringify(packageManagerPin));
    process.exit(1);
  }
  match[1];
")"
printf 'Expected pnpm version: %s\n' "${expected_pnpm_version}"

print_stage "Checking pnpm availability"
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    printf 'pnpm is not on PATH, but Corepack is available.\n' >&2
    printf 'Run the following command, then re-run this script:\n\n' >&2
    printf '  corepack enable pnpm\n\n' >&2
    printf 'If that fails with a permission error (the default install directory is not\n' >&2
    printf 'writable), point Corepack at a writable directory that is already on PATH:\n\n' >&2
    printf '  corepack enable --install-directory "$HOME/.npm-global/bin" pnpm\n\n' >&2
    exit 1
  fi
  printf 'pnpm is not on PATH and Corepack is not available.\n' >&2
  printf 'Install and enable Corepack (ships with Node.js 24 but may be removed by some installers), then re-run this script:\n\n' >&2
  printf '  npm install --global corepack\n' >&2
  printf '  corepack enable pnpm\n\n' >&2
  exit 1
fi

print_stage "Verifying pnpm version matches the packageManager pin exactly"
actual_pnpm_version="$(pnpm --version)"
if [ "${actual_pnpm_version}" != "${expected_pnpm_version}" ]; then
  printf 'pnpm %s is on PATH, but package.json pins pnpm@%s.\n' "${actual_pnpm_version}" "${expected_pnpm_version}" >&2
  printf 'Once the Corepack shim is active, the packageManager pin in package.json\n' >&2
  printf 'selects the exact pnpm version automatically. Enable the shim, then re-run\n' >&2
  printf 'this script:\n\n' >&2
  printf '  corepack enable pnpm\n\n' >&2
  printf 'If that fails with a permission error (the default install directory is not\n' >&2
  printf 'writable), point Corepack at a writable directory that is already on PATH:\n\n' >&2
  printf '  corepack enable --install-directory "$HOME/.npm-global/bin" pnpm\n\n' >&2
  exit 1
fi
printf 'pnpm %s OK\n' "${actual_pnpm_version}"

print_stage "Checking for committed lockfile (pnpm-lock.yaml)"
if [ ! -f "${repository_root}/pnpm-lock.yaml" ]; then
  fail "pnpm-lock.yaml not found at the repository root. The lockfile is a committed artifact (ADR-0001); restore it from version control rather than regenerating it."
fi
printf 'pnpm-lock.yaml present\n'

print_stage "Installing dependencies with a frozen lockfile"
pnpm install --frozen-lockfile

print_stage "Bootstrap complete"
printf 'Toolchain verified (Node %s, pnpm %s) and workspace installed.\n' "${node_version}" "${actual_pnpm_version}"
