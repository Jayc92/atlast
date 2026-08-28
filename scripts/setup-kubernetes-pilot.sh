#!/usr/bin/env bash
# M6-C pilot-packaging bootstrap: takes a fresh clone of this repository, on
# a technically competent employee's own workstation, from zero to the exact
# deterministic Kubernetes sandbox scripts/connect-kubernetes-pilot.sh
# expects — without that employee needing prior Atlast development history,
# kubectl YAML authoring, or ServiceAccount token knowledge.
#
# This script never starts Atlast itself (scripts/connect-kubernetes-pilot.sh
# remains the separate, explicit next step, per docs/m6-plan.md § 8's
# preflight-then-launch ordering) and never installs system software — every
# missing prerequisite is diagnosed with the exact remediation command, then
# this script stops so the employee stays in control of what is installed on
# their own machine.
set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/.." && pwd)"
cd "${repository_root}"

KIND_CLUSTER_NAME="${ATLAST_M6_KIND_CLUSTER_NAME:-atlast-m6-a}"
NAMESPACE="${ATLAST_M6_NAMESPACE:-atlast-m6-a}"
KIND_CONTEXT="kind-${KIND_CLUSTER_NAME}"
RBAC_MANIFEST="${script_directory}/kubernetes-pilot-rbac.yaml"
WORKLOAD_MANIFEST="${script_directory}/kubernetes-pilot-workload.yaml"

print_stage() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

do_reset=""
for arg in "$@"; do
  case "${arg}" in
    --reset) do_reset="yes" ;;
    *) fail "Unrecognized argument: ${arg}. Supported: --reset" ;;
  esac
done

# --- Stage 1: prerequisite diagnosis. Every missing/unavailable tool is
# collected and reported together (not one at a time) so the employee does
# not have to re-run this script once per fixable problem; environment
# creation never begins if any prerequisite failed. ---
print_stage "Stage 1/7: diagnosing prerequisites"
prerequisite_failures=""
add_failure() {
  prerequisite_failures="${prerequisite_failures}
${1}"
}

if ! command -v git >/dev/null 2>&1; then
  add_failure "git is not on PATH.
  Install Git for your platform, then re-run: ./scripts/setup-kubernetes-pilot.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  add_failure "node is not on PATH.
  Atlast requires Node >=24.15.0 <25. Install it with your version manager,
  then re-run: ./scripts/setup-kubernetes-pilot.sh
  If you use nvm: nvm install && nvm use"
else
  node_version_raw="$(node --version)"
  node_version_stripped="${node_version_raw#v}"
  node_major="${node_version_stripped%%.*}"
  node_minor_and_patch="${node_version_stripped#*.}"
  node_minor="${node_minor_and_patch%%.*}"
  if ! { [ "${node_major}" = "24" ] && [ "${node_minor}" -ge 15 ] 2>/dev/null; }; then
    add_failure "node ${node_version_raw} is not on the supported line.
  Atlast requires >=24.15.0 <25. Use the repository .nvmrc with:
    nvm install
    nvm use
  Then re-run: ./scripts/setup-kubernetes-pilot.sh"
  fi
fi

if ! command -v pnpm >/dev/null 2>&1 && ! command -v corepack >/dev/null 2>&1; then
  add_failure "Neither pnpm nor Corepack is on PATH.
  Node 24 ships Corepack; enable it, then re-run: ./scripts/setup-kubernetes-pilot.sh
    corepack enable pnpm"
fi

if ! command -v docker >/dev/null 2>&1; then
  add_failure "The docker CLI is not on PATH.
  Install/start the approved Docker-compatible runtime (Docker Desktop or
  OrbStack), then re-run: ./scripts/setup-kubernetes-pilot.sh"
elif ! docker info >/dev/null 2>&1; then
  add_failure "The Docker CLI is present, but no Docker daemon answered.
  Start Docker Desktop/OrbStack and verify with: docker ps
  Then re-run: ./scripts/setup-kubernetes-pilot.sh"
fi

if ! command -v kubectl >/dev/null 2>&1; then
  add_failure "kubectl is not on PATH.
    brew install kubectl
  Then re-run: ./scripts/setup-kubernetes-pilot.sh"
fi

if ! command -v kind >/dev/null 2>&1; then
  add_failure "kind is not on PATH.
    brew install kind
  Then re-run: ./scripts/setup-kubernetes-pilot.sh"
fi

if [ -n "${prerequisite_failures}" ]; then
  printf 'One or more prerequisites are missing:\n%s\n\n' "${prerequisite_failures}" >&2
  fail "Fix the above, then re-run: ./scripts/setup-kubernetes-pilot.sh"
fi
printf 'git, node, pnpm/Corepack, docker (CLI + daemon), kubectl, kind all present.\n'

# --- Stage 2: bootstrap the Atlast workspace/toolchain itself, reusing the
# existing, unmodified script rather than duplicating its logic. The path is
# overridable only so automated tests can substitute a stub in place of a
# real `pnpm install`; real pilot runs always use the default. ---
print_stage "Stage 2/7: bootstrapping the Atlast workspace (./scripts/bootstrap.sh)"
bootstrap_script="${ATLAST_M6_BOOTSTRAP_SCRIPT:-${script_directory}/bootstrap.sh}"
"${bootstrap_script}"

# --- Stage 3: build workspace packages. `bootstrap.sh` only installs
# dependencies; every workspace package @atlast/api actually imports at
# runtime (@atlast/shared, @atlast/graph-model, @atlast/impact-model,
# @atlast/overlay-model, @atlast/connectors) declares "main": "./dist/...",
# so a fresh clone's plain `node src/server.ts` cannot resolve any of them
# until they are built at least once — a real fresh-clone failure this
# stage exists to prevent. Reuses the existing root `pnpm build` (recursive,
# per ADR-0002) rather than enumerating packages or their build order here,
# so this stays correct if that dependency set ever changes. @atlast/web's
# own dev server is unaffected (its Vite config aliases @atlast/shared
# straight to source in dev mode) but building it here is harmless. ---
print_stage "Stage 3/7: building workspace packages (pnpm build)"
(cd "${repository_root}" && pnpm build)

# --- Stage 4: disposable Kind cluster creation/reset ---
print_stage "Stage 4/7: preparing the disposable Kind cluster '${KIND_CLUSTER_NAME}'"
cluster_exists=""
if kind get clusters 2>/dev/null | grep -qx "${KIND_CLUSTER_NAME}"; then
  cluster_exists="yes"
fi

if [ -n "${do_reset}" ]; then
  if [ -n "${cluster_exists}" ]; then
    printf 'Deleting existing pilot cluster %s (--reset)...\n' "${KIND_CLUSTER_NAME}"
    kind delete cluster --name "${KIND_CLUSTER_NAME}"
  fi
  printf 'Creating pilot cluster %s...\n' "${KIND_CLUSTER_NAME}"
  kind create cluster --name "${KIND_CLUSTER_NAME}"
elif [ -n "${cluster_exists}" ]; then
  fail "Pilot cluster '${KIND_CLUSTER_NAME}' already exists.

For a deterministic clean pilot, run:

  ./scripts/setup-kubernetes-pilot.sh --reset"
else
  printf 'Creating pilot cluster %s...\n' "${KIND_CLUSTER_NAME}"
  kind create cluster --name "${KIND_CLUSTER_NAME}"
fi

# --- Stage 5: apply the accepted RBAC manifest, then the deterministic
# workload manifest, always against the explicit pilot context — never
# whatever kubectl context happens to be current. ---
print_stage "Stage 5/7: applying the read-only RBAC manifest and the deterministic sandbox workload"
kubectl --context "${KIND_CONTEXT}" apply -f "${RBAC_MANIFEST}"
# The namespace's own "default" ServiceAccount is created asynchronously by
# a Kubernetes controller shortly after the Namespace object itself — a real
# race found during developer acceptance testing, not a hypothetical: the
# workload manifest's bare Pod (which uses that default ServiceAccount, not
# the RBAC manifest's dedicated discovery one) can otherwise be rejected as
# Forbidden because the default ServiceAccount does not exist yet.
printf 'Waiting for namespace %s to be ready for workload creation...\n' "${NAMESPACE}"
# Attempt count/sleep are overridable only so automated tests can exercise
# the failure path quickly; real pilot runs always use the defaults.
sa_wait_attempts="${ATLAST_M6_SA_WAIT_ATTEMPTS:-30}"
sa_wait_sleep_seconds="${ATLAST_M6_SA_WAIT_SLEEP_SECONDS:-1}"
for _ in $(seq 1 "${sa_wait_attempts}"); do
  kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get serviceaccount default >/dev/null 2>&1 && break
  sleep "${sa_wait_sleep_seconds}"
done
kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get serviceaccount default >/dev/null 2>&1 \
  || fail "Namespace '${NAMESPACE}' never received its default ServiceAccount. Setup failed; Atlast was not started."
kubectl --context "${KIND_CONTEXT}" apply -f "${WORKLOAD_MANIFEST}"
printf 'Waiting for the checkout Deployment to become available...\n'
kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" rollout status deployment/checkout --timeout=120s

# --- Stage 6: verify actual Kubernetes ground truth before declaring the
# pilot environment ready. Never starts Atlast if any of this differs from
# the accepted deterministic sandbox. ---
print_stage "Stage 6/7: verifying real Kubernetes ground truth"

require_object() {
  local kind_and_name="$1"
  kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get ${kind_and_name} >/dev/null 2>&1 \
    || fail "Expected object not found: ${kind_and_name} in namespace ${NAMESPACE}. Setup failed; Atlast was not started."
}

require_object "deployment checkout"
desired_replicas="$(kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get deployment checkout -o jsonpath='{.spec.replicas}')"
[ "${desired_replicas}" = "2" ] || fail "Deployment 'checkout' has spec.replicas=${desired_replicas}, expected 2. Setup failed; Atlast was not started."

replicaset_name="$(kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get replicasets -l app=checkout -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
[ -n "${replicaset_name}" ] || fail "No ReplicaSet was naturally created for the checkout Deployment. Setup failed; Atlast was not started."
replicaset_owner_kind="$(kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get replicaset "${replicaset_name}" -o jsonpath='{.metadata.ownerReferences[0].kind}' 2>/dev/null || true)"
[ "${replicaset_owner_kind}" = "Deployment" ] || fail "ReplicaSet '${replicaset_name}' has no Deployment owner reference. Setup failed; Atlast was not started."

checkout_pod_count="$(kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get pods -l app=checkout -o jsonpath='{.items[*].metadata.name}' | wc -w | tr -d ' ')"
[ "${checkout_pod_count}" = "2" ] || fail "Expected exactly 2 checkout Pods, found ${checkout_pod_count}. Setup failed; Atlast was not started."

require_object "service checkout-service"
checkout_service_selector="$(kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get service checkout-service -o jsonpath='{.spec.selector.app}')"
[ "${checkout_service_selector}" = "checkout" ] || fail "Service 'checkout-service' selector.app=${checkout_service_selector}, expected 'checkout'. Setup failed; Atlast was not started."

require_object "service unused-service"
unused_service_selector="$(kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get service unused-service -o jsonpath='{.spec.selector.app}')"
[ "${unused_service_selector}" = "nothing-matches-this" ] || fail "Service 'unused-service' selector.app=${unused_service_selector}, expected 'nothing-matches-this'. Setup failed; Atlast was not started."
unused_match_count="$(kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get pods -l app=nothing-matches-this -o jsonpath='{.items[*].metadata.name}' | wc -w | tr -d ' ')"
[ "${unused_match_count}" = "0" ] || fail "Service 'unused-service' unexpectedly matches ${unused_match_count} Pod(s), expected zero (this Service's selector is deliberately built not to match any real Pod). Setup failed; Atlast was not started."

require_object "service external-or-selectorless"
selectorless_selector="$(kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get service external-or-selectorless -o jsonpath='{.spec.selector}')"
[ -z "${selectorless_selector}" ] || fail "Service 'external-or-selectorless' unexpectedly has a selector. Setup failed; Atlast was not started."

require_object "pod bare-standalone-pod"
bare_pod_owners="$(kubectl --context "${KIND_CONTEXT}" -n "${NAMESPACE}" get pod bare-standalone-pod -o jsonpath='{.metadata.ownerReferences}')"
[ -z "${bare_pod_owners}" ] || fail "Pod 'bare-standalone-pod' unexpectedly has an owner reference. Setup failed; Atlast was not started."

printf 'Ground truth confirmed: checkout Deployment (2 replicas) -> 1 ReplicaSet -> 2 Pods; checkout-service matches both; unused-service matches zero; external-or-selectorless has no selector; bare-standalone-pod has no controller owner.\n'

# --- Stage 7: print factual Kubernetes inspection commands and the next
# step. Never Atlast-specific expected output — only real Kubernetes state
# the employee can verify with their own eyes. Never starts Atlast: the
# official M6-C pilot start boundary remains a human/conductor decision. ---
print_stage "Stage 7/7: ready"
cat <<EOF

Atlast Kubernetes pilot environment is ready.

1. Inspect the real Kubernetes environment:

   kubectl --context ${KIND_CONTEXT} -n ${NAMESPACE} get deployments,replicasets,pods,services -o wide

   kubectl --context ${KIND_CONTEXT} -n ${NAMESPACE} describe service checkout-service

2. When you understand the environment, start Atlast:

   ./scripts/connect-kubernetes-pilot.sh

3. Open the URL printed by Atlast.

4. When completely finished, press Ctrl+C, then run:

   ./scripts/cleanup-kubernetes-pilot.sh
EOF
