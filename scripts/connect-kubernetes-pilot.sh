#!/usr/bin/env bash
# M6-A self-service connect/scan orchestration (ADR-0040 §§ 1-2; accepted
# docs/m6-plan.md § 8, folded from the retracted ADR-0042). Replaces having
# to manually reproduce the old M5-A experiment sequence by hand.
#
# Exact conceptual flow (docs/m6-plan.md § 8):
#   preflight
#   -> verify local Kind target
#   -> verify RBAC
#   -> prove read succeeds (policy preflight: `kubectl auth can-i`)
#   -> prove mutation is forbidden (real attempted mutation, rejected by the
#      real Kubernetes API with HTTP 403 — ADR-0037 § 6; a policy query alone
#      is not this proof, see Stage 6 below)
#   -> configure connector mode
#   -> launch NORMAL Atlast
#   -> report browser URL
#   -> provide cleanup instructions
#
# Prerequisite (documented, never performed automatically by this script,
# per the accepted Option B in docs/m6-plan.md § 8): a disposable local Kind
# cluster already exists, and scripts/kubernetes-pilot-rbac.yaml has already
# been applied to it by the tester (`kubectl apply -f
# scripts/kubernetes-pilot-rbac.yaml`) — this script never creates the
# cluster or the RBAC objects itself.
#
# Credentials never transit browser UI (ADR-0037 § 3 extended to this
# launch surface) — the restricted, ServiceAccount-scoped kubeconfig this
# script generates lives only in a private temporary file, never inside
# this repository, and is removed on exit.
set -euo pipefail
# Job control (`set -m`) makes each backgrounded pipeline below (Stage 7's
# API process, Stage 8's web process) the leader of its own new process
# group, distinct from this script's own group and from every other
# unrelated process on the machine. Combined with `exec`ing the actual
# long-running command as the last statement in each subshell (so the
# recorded PID becomes the real Node/pnpm process, never a wrapper shell
# that can die while its child survives), this lets `cleanup` below signal
# the exact process-group each launched command (and anything it itself
# forks, such as pnpm's own `vite` child) belongs to — never a broader,
# name-based kill.
set -m

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/.." && pwd)"
cd "${repository_root}"

KIND_CLUSTER_NAME="${ATLAST_M6_KIND_CLUSTER_NAME:-atlast-m6-a}"
NAMESPACE="${ATLAST_M6_NAMESPACE:-atlast-m6-a}"
SERVICE_ACCOUNT="${ATLAST_M6_SERVICE_ACCOUNT:-atlast-m6-a-discovery}"
KIND_CONTEXT="kind-${KIND_CLUSTER_NAME}"
API_PORT="${ATLAST_API_PORT:-3001}"
WEB_PORT="${ATLAST_WEB_PORT:-5173}"
POLL_INTERVAL_MS="${ATLAST_KUBERNETES_POLL_INTERVAL_MS:-2000}"

print_stage() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

api_pid=""
web_pid=""
restricted_kubeconfig=""
ca_file=""

# Terminates and reaps exactly one launched job's entire process group — the
# job's own PID (its process-group leader, per `set -m` above) plus anything
# it itself forked (e.g. pnpm's `vite` child) — never any other process on
# the machine. `kill -0` first confirms the leader is still alive (an
# already-exited child, e.g. one that crashed on its own, is tolerated
# silently, never a cleanup error); the negative PID form of `kill` targets
# the whole process group, not just the one leader process; `wait` then
# blocks until this script's own direct child (the group leader) has
# actually been reaped, so cleanup never reports done while a child is
# still mid-shutdown.
stop_and_reap() {
  local pid="$1"
  local label="$2"
  if [ -z "${pid}" ] || ! kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi
  printf 'Stopping %s (pid %s)...\n' "${label}" "${pid}"
  kill -TERM -- "-${pid}" 2>/dev/null || true
  wait "${pid}" 2>/dev/null || true
}

cleanup() {
  printf '\n==> Shutting down\n'
  stop_and_reap "${web_pid}" "web"
  stop_and_reap "${api_pid}" "API/connector polling"
  [ -n "${restricted_kubeconfig}" ] && rm -f "${restricted_kubeconfig}"
  [ -n "${ca_file}" ] && rm -f "${ca_file}"
  printf 'Stopped. Established Evidence lived only in this process'\''s memory and is now gone.\n'
  printf '\nCleanup: to remove the disposable cluster entirely, run:\n'
  printf '  kind delete cluster --name %s\n' "${KIND_CLUSTER_NAME}"
}
trap cleanup EXIT INT TERM

# --- Stage 1: prerequisites ---
print_stage "Stage 1/8: checking prerequisites"
command -v kind >/dev/null 2>&1 || fail "kind is not on PATH. Install it before running this script."
command -v kubectl >/dev/null 2>&1 || fail "kubectl is not on PATH. Install it before running this script."
command -v node >/dev/null 2>&1 || fail "node is not on PATH."
printf 'kind, kubectl, node all present.\n'

# --- Stage 2: verify local Kind target (fail-fast courtesy check; the real,
# binding enforcement is assertLocalKindTarget inside the TypeScript
# connector itself, ADR-0037 § 4 — this is a friendlier, earlier failure) ---
print_stage "Stage 2/8: verifying local Kind target"
if ! kind get clusters 2>/dev/null | grep -qx "${KIND_CLUSTER_NAME}"; then
  fail "No disposable Kind cluster named '${KIND_CLUSTER_NAME}' found. Create one first: kind create cluster --name ${KIND_CLUSTER_NAME}"
fi
cluster_server="$(kubectl config view --raw --minify --context "${KIND_CONTEXT}" -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null || true)"
[ -n "${cluster_server}" ] || fail "Context '${KIND_CONTEXT}' was not found in your kubeconfig. Is the cluster name correct?"
case "${cluster_server}" in
  https://127.0.0.1:*|https://localhost:*|http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Context '${KIND_CONTEXT}' resolves to server '${cluster_server}', which is not loopback. This script (and the connector's own target guard, ADR-0037 § 4) refuse anything but a real, local, Kind-named, loopback-resolved cluster." ;;
esac
printf 'Context %s resolves to loopback (%s). OK.\n' "${KIND_CONTEXT}" "${cluster_server}"

# --- Stage 3: verify the documented RBAC prerequisite already exists ---
print_stage "Stage 3/8: verifying the RBAC prerequisite (scripts/kubernetes-pilot-rbac.yaml) was already applied"
if ! kubectl --context "${KIND_CONTEXT}" get serviceaccount "${SERVICE_ACCOUNT}" -n "${NAMESPACE}" >/dev/null 2>&1; then
  fail "ServiceAccount '${SERVICE_ACCOUNT}' not found in namespace '${NAMESPACE}'. Apply the documented prerequisite manifest first: kubectl --context ${KIND_CONTEXT} apply -f scripts/kubernetes-pilot-rbac.yaml"
fi
printf 'ServiceAccount %s exists in namespace %s.\n' "${SERVICE_ACCOUNT}" "${NAMESPACE}"

# --- Stage 4: construct a restricted, ServiceAccount-scoped kubeconfig,
# never the ambient/default context (ADR-0037 § 3). Lives only in a private
# temp file, outside this repository, removed on exit. ---
print_stage "Stage 4/8: constructing a restricted kubeconfig for ${SERVICE_ACCOUNT} (outside the repository, never committed)"
restricted_kubeconfig="$(mktemp -t atlast-m6-a-kubeconfig)"
ca_file="$(mktemp -t atlast-m6-a-ca)"
# Both files hold credential/certificate material (a bearer token and a CA
# cert respectively) — chmod 600 immediately, defense-in-depth on top of
# mktemp's own platform default, before anything is written into them. Note:
# a SIGKILL (kill -9) bypasses the `trap ... EXIT INT TERM` below entirely —
# no shell script can catch SIGKILL, so cleanup on a hard kill is not
# something this script can guarantee; these files live under the OS temp
# directory and are subject to its own eventual cleanup in that case.
chmod 600 "${restricted_kubeconfig}" "${ca_file}"
kubectl config view --raw --minify --context "${KIND_CONTEXT}" \
  -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 --decode > "${ca_file}"
sa_token="$(kubectl --context "${KIND_CONTEXT}" create token "${SERVICE_ACCOUNT}" -n "${NAMESPACE}" --duration=1h)"
KUBECONFIG="${restricted_kubeconfig}" kubectl config set-cluster "${KIND_CONTEXT}" \
  --server="${cluster_server}" --certificate-authority="${ca_file}" --embed-certs=true >/dev/null
KUBECONFIG="${restricted_kubeconfig}" kubectl config set-credentials "${SERVICE_ACCOUNT}" \
  --token="${sa_token}" >/dev/null
KUBECONFIG="${restricted_kubeconfig}" kubectl config set-context "${KIND_CONTEXT}" \
  --cluster="${KIND_CONTEXT}" --user="${SERVICE_ACCOUNT}" --namespace="${NAMESPACE}" >/dev/null
KUBECONFIG="${restricted_kubeconfig}" kubectl config use-context "${KIND_CONTEXT}" >/dev/null
printf 'Restricted kubeconfig written to a private temp file (never inside this repository).\n'

# --- Stage 5: read proof across the complete M6-B RBAC grant, and a
# mutation POLICY preflight (ADR-0037 § 6, ADR-0039 § 4) ---
print_stage "Stage 5/8: proving read succeeds across pods/deployments/replicasets/services, and a policy-level mutation preflight, using the restricted credential"
# `kubectl auth can-i` exits 0 for "yes" and nonzero for "no" — both are
# expected, meaningful outcomes here, never a script failure, so `|| true`
# prevents `set -e` from treating the expected "no" as fatal. This is a
# POLICY QUERY only — it asks the API server whether an operation would be
# allowed, without attempting it. It is not, by itself, ADR-0037 § 6's
# required live-rejection proof; see Stage 6 below for that.
for resource_kind in pods deployments replicasets services; do
  can_list="$(KUBECONFIG="${restricted_kubeconfig}" kubectl auth can-i list "${resource_kind}" -n "${NAMESPACE}" || true)"
  [ "${can_list}" = "yes" ] || fail "Restricted credential cannot list ${resource_kind} in ${NAMESPACE} (expected 'yes', got '${can_list}'). Check the applied RBAC manifest."
  printf 'Read proof: list %s -> yes.\n' "${resource_kind}"
done
can_create="$(KUBECONFIG="${restricted_kubeconfig}" kubectl auth can-i create pods -n "${NAMESPACE}" || true)"
[ "${can_create}" = "no" ] || fail "Restricted credential CAN create Pods in ${NAMESPACE} (expected 'no', got '${can_create}') — this is a least-privilege violation of ADR-0037 § 2 and must not proceed."
printf 'POLICY PREFLIGHT: can-i create pods -> no.\n'

# --- Stage 6: a REAL attempted mutation, rejected by the live Kubernetes API
# (ADR-0037 § 6). Deletes a Pod name that need not even exist: RBAC
# authorization runs before Kubernetes ever checks whether the named object
# exists, so this proves the API server's own authorization layer rejects
# the attempt — never a resource being created or destroyed, never the
# admin/ambient credential, and never anything but this exact restricted
# ServiceAccount against the accepted local-Kind target. ---
print_stage "Stage 6/8: attempting one real mutation with the restricted credential (must be rejected by Kubernetes itself)"
mutation_target_pod="atlast-m6-a-mutation-proof-target"
set +e
mutation_output="$(KUBECONFIG="${restricted_kubeconfig}" kubectl --context "${KIND_CONTEXT}" \
  delete pod "${mutation_target_pod}" -n "${NAMESPACE}" --v=6 2>&1)"
mutation_exit_code=$?
set -e
if [ "${mutation_exit_code}" -eq 0 ]; then
  fail "The real mutation attempt (delete pod) UNEXPECTEDLY SUCCEEDED (exit 0) using the restricted credential. This is a least-privilege violation of ADR-0037 § 2 and must not proceed. Full output:
${mutation_output}"
fi
case "${mutation_output}" in
  *"403 Forbidden"*) ;;
  *) fail "The real mutation attempt failed, but not with the expected HTTP 403 Forbidden from the Kubernetes API server. Full output:
${mutation_output}" ;;
esac
case "${mutation_output}" in
  *"Error from server (Forbidden)"*) ;;
  *) fail "The real mutation attempt was rejected, but kubectl's own error did not report 'Forbidden'. Full output:
${mutation_output}" ;;
esac
printf 'LIVE AUTHORIZATION PROOF: real delete-pod attempt -> HTTP 403 Forbidden (Kubernetes itself rejected it, not a policy query).\n'

# The identical proof, repeated once against one of M6-B's newly-granted
# resource kinds (ADR-0039 § 4) — confirming the additive Role grant
# widened only reads, never mutation, for the new resources too.
mutation_target_deployment="atlast-m6-a-mutation-proof-target-deployment"
set +e
deployment_mutation_output="$(KUBECONFIG="${restricted_kubeconfig}" kubectl --context "${KIND_CONTEXT}" \
  delete deployment "${mutation_target_deployment}" -n "${NAMESPACE}" --v=6 2>&1)"
deployment_mutation_exit_code=$?
set -e
if [ "${deployment_mutation_exit_code}" -eq 0 ]; then
  fail "The real mutation attempt (delete deployment) UNEXPECTEDLY SUCCEEDED using the restricted credential. This is a least-privilege violation of ADR-0039 § 4 and must not proceed. Full output:
${deployment_mutation_output}"
fi
case "${deployment_mutation_output}" in
  *"403 Forbidden"*) ;;
  *) fail "The real Deployment mutation attempt failed, but not with the expected HTTP 403 Forbidden. Full output:
${deployment_mutation_output}" ;;
esac
printf 'LIVE AUTHORIZATION PROOF: real delete-deployment attempt -> HTTP 403 Forbidden.\n'

# --- Stage 7: launch the normal Atlast API in connector mode ---
print_stage "Stage 7/8: launching the normal Atlast API in connector dataset mode"
(
  cd "${repository_root}/apps/api"
  ATLAST_DATASET_MODE=connector \
  ATLAST_API_PORT="${API_PORT}" \
  ATLAST_KUBERNETES_KUBECONFIG="${restricted_kubeconfig}" \
  ATLAST_KUBERNETES_KUBE_CONTEXT="${KIND_CONTEXT}" \
  ATLAST_KUBERNETES_NAMESPACE="${NAMESPACE}" \
  ATLAST_KUBERNETES_POLL_INTERVAL_MS="${POLL_INTERVAL_MS}" \
  exec node src/server.ts
) &
api_pid=$!

ready=""
for _ in $(seq 1 30); do
  if health_body="$(curl -sf "http://127.0.0.1:${API_PORT}/health" 2>/dev/null)"; then
    case "${health_body}" in
      *'"datasetMode":"connector"'*) ready="yes" ;;
    esac
    [ -n "${ready}" ] && break
  fi
  kill -0 "${api_pid}" 2>/dev/null || fail "The API process exited before becoming ready — check its output above (pre-flight target-guard/RBAC failure fails closed, per ADR-0040 § 6)."
  sleep 1
done
[ -n "${ready}" ] || fail "The API did not report datasetMode=connector within 30 seconds."
printf 'Normal Atlast API is up on http://127.0.0.1:%s (dataset=connector).\n' "${API_PORT}"

# --- Stage 8: launch the normal Atlast website ---
print_stage "Stage 8/8: launching the normal Atlast website"
(
  cd "${repository_root}"
  exec pnpm --filter @atlast/web dev --port "${WEB_PORT}" --strictPort
) &
web_pid=$!

printf '\n==> Ready\n'
printf 'Open the NORMAL Atlast website at: http://127.0.0.1:%s\n' "${WEB_PORT}"
printf 'This is the same website every prior milestone uses — not a special M6 page.\n'
printf 'Press Ctrl+C to stop (this also stops Kubernetes polling cleanly).\n'

wait "${api_pid}" "${web_pid}"
