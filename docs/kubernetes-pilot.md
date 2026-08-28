# Atlast Kubernetes Pilot — Fresh-Clone Guide

## A. What this is

You've been asked to independently evaluate whether Atlast, an engineering topology platform, accurately and usefully maps a real (but disposable) Kubernetes environment. You don't need to have used Atlast before, and you don't need to know anything about how it's built.

## B. Safety

- Everything below runs entirely on **your own workstation**. Nothing is shared, remote, or hosted.
- The Kubernetes cluster is a **disposable local Kind cluster** — never your company's production, staging, or shared infrastructure.
- Atlast connects to that cluster with a **read-only** credential. It cannot create, modify, or delete anything in the cluster.

## C. Get the code

```bash
git clone https://github.com/Jayc92/atlast.git
cd atlast
```

## D. Set up the pilot environment

```bash
./scripts/setup-kubernetes-pilot.sh
```

This checks your machine for the required tools (Git, Node.js, pnpm, Docker, kubectl, Kind), installs the Atlast workspace, creates a disposable local Kind cluster, and builds a small, deterministic set of real Kubernetes objects for you to evaluate Atlast against.

**If a prerequisite is missing,** the script prints exactly what's missing and the exact command to fix it. Follow that instruction, then re-run:

```bash
./scripts/setup-kubernetes-pilot.sh
```

If the script reports that a pilot cluster already exists from a previous attempt, run it with `--reset` for a clean environment. **This deletes that disposable pilot cluster and everything in it before recreating it** — safe, since it's disposable and local, but not reversible:

```bash
./scripts/setup-kubernetes-pilot.sh --reset
```

## E. Inspect the real Kubernetes environment first

Before opening Atlast, look at what's actually running. The setup script prints the exact commands to do this — for example:

```bash
kubectl --context kind-atlast-m6-a -n atlast-m6-a get deployments,replicasets,pods,services -o wide
```

Understanding the real environment first is what makes your evaluation meaningful — you're comparing what Atlast shows against what you already know is really there.

## F. Start Atlast

```bash
./scripts/connect-kubernetes-pilot.sh
```

This connects Atlast to the cluster (with a series of live proofs that the connection is genuinely read-only) and starts the normal Atlast application.

## G. Open Atlast

Open the URL the previous command prints — normally:

```
http://127.0.0.1:5173
```

That's a page served from your own computer; `127.0.0.1` always means "this machine," never a remote server.

## H. Evaluate

Explore Atlast's system map and compare it against what you found in step E. Use the "Pilot feedback" panel in Atlast to record what you find — your conductor will give you specific instructions for what to evaluate and how to record it.

If Kubernetes changes while Atlast is open, refresh the browser to display newly discovered state.

## I. Stop Atlast

When you're completely finished, return to the terminal running `connect-kubernetes-pilot.sh` and press:

```
Ctrl+C
```

This stops Atlast and cleans up its own processes and temporary credentials.

## J. Clean up the pilot environment

```bash
./scripts/cleanup-kubernetes-pilot.sh
```

This removes the disposable Kind cluster. If there's nothing to remove, it says so and exits normally.
