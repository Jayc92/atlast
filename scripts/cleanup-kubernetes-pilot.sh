#!/usr/bin/env bash
# M6-C pilot cleanup: removes exactly the one disposable Kind cluster
# scripts/setup-kubernetes-pilot.sh created — never another cluster, never a
# Docker container by broad pattern, never another kubectl context. The
# Atlast launcher (scripts/connect-kubernetes-pilot.sh) already owns its own
# process/port/credential cleanup on Ctrl+C; this script owns only the
# disposable cluster's teardown, run after the launcher has already stopped.
set -euo pipefail

KIND_CLUSTER_NAME="${ATLAST_M6_KIND_CLUSTER_NAME:-atlast-m6-a}"

printf 'Cleaning up the Atlast Kubernetes pilot environment.\n'

if kind get clusters 2>/dev/null | grep -qx "${KIND_CLUSTER_NAME}"; then
  printf 'This will delete Kind cluster: %s\n' "${KIND_CLUSTER_NAME}"
  kind delete cluster --name "${KIND_CLUSTER_NAME}"
  printf 'Deleted Kind cluster %s.\n' "${KIND_CLUSTER_NAME}"
else
  printf 'nothing to clean\n'
fi
