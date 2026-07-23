# M0 Synthetic-Data and External-Connection Boundary Audit

**Date:** 2026-07-22
**Audited commit:** `4111d24` (`main`)
**Status:** Complete — passed
**Auditor:** AI-assisted static audit (Claude), for human review per [GUARDRAILS.md § 6](../../GUARDRAILS.md#6-ai-assistant-guardrails)

This audit verifies the M0 exit criterion "nothing in the repository connects to, or holds credentials for, any external system" ([docs/milestones.md M0](../milestones.md#m0--safe-project-foundation-active)) and the synthetic-data-only constraint ([PROJECT_SPEC.md § 6](../../PROJECT_SPEC.md#6-constraints--assumptions)) against the Git-tracked content of the repository at the commit above. The criterion is evaluated in its product/runtime intent: what Atlast connects to and what credentials the repository holds — while recognizing the permitted developer-tooling connections (package-manager and browser-download) documented as explicit exceptions in § 9.

---

## 1. Scope and Exclusions

**In scope:** every Git-tracked file at commit `4111d24` (66 files: documentation, first-party source under `apps/`, `packages/`, `tests/`, `scripts/`, `fixtures/`, all workspace manifests, lockfile, and root configuration).

**Excluded, deliberately:**

- Dependency implementation inside `node_modules/` — third-party code is out of scope for this static audit; the dependency _surface_ (what is declared in manifests) is in scope (§ 6).
- Generated `dist/` output, Playwright browser binaries, and generated test reports — git-ignored build artifacts derived from audited sources.
- Runtime behavior of third-party tooling (pnpm, Vite, Playwright) beyond how first-party configuration invokes it.

No network requests were made during the audit; all inspection was local and read-only.

## 2. Method

Manual reading of every first-party source and configuration file, plus pattern scans over tracked content (`git ls-files`, `git grep`, plain `grep` cross-checks). Search categories:

| Category                           | Patterns searched                                                                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensitive file names               | `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `*.cer`, kubeconfig, credential/secret/token file names, SSH key names, service-account files                                                                                                              |
| High-confidence credential formats | AWS access key IDs (`AKIA…`), GitHub tokens (`ghp_`/`gho_`/`github_pat_`), Slack tokens (`xox…`), Stripe keys (`sk_live_`/`sk_test_`/`rk_live_`), Google API keys (`AIza…`), OAuth bearer tokens (`ya29.`), PEM private-key headers, JWT prefixes (`eyJhbGciOi`) |
| Suspicious assignments             | `password`, `api key`, `client secret`, `access/auth token`, `private/secret key` followed by `:` or `=`                                                                                                                                                         |
| Network primitives                 | URLs (`http/https/ws/wss/ftp`), IP addresses, `fetch`, `axios`, `got`, `undici`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `net`/`dgram`/`dns`/`http(s).request`, `createServer`, `listen(`, non-loopback bind addresses (`0.0.0.0`, `::`)                   |
| Shell/external execution           | `child_process`, `execSync`, `spawn`, `curl`, `wget`, `kubectl`, `terraform`, `aws`, `gcloud`, `az`                                                                                                                                                              |
| Environment access                 | `process.env`, `import.meta.env`                                                                                                                                                                                                                                 |
| External-capability dependencies   | cloud SDKs, Kubernetes clients, database clients, telemetry exporters, LLM SDKs, auth/identity SDKs, GitHub/CI SDKs (scanned across every workspace manifest)                                                                                                    |
| Employer/customer material         | employer names, internal domain suffixes (`.internal`, `.corp`), internal tooling names, ticket-ID shapes (`ABC-1234`), email addresses, git remote URLs                                                                                                         |

## 3. Network-Capable First-Party Locations

Every network-touching location found in first-party runtime code and configuration:

| Location                                               | What it does                                                                                                          | Classification                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/server.ts:13,51`                         | `application.listen({ host: "127.0.0.1", port })` — the only socket the API opens                                     | **Loopback-only bind.** `LOOPBACK_HOST` is a constant; no code path accepts another interface                              |
| `apps/web/src/App.tsx:109`                             | `fetch("/api/health")` — the page's only data request                                                                 | **Relative path.** Resolves against the serving origin (loopback dev/preview server); the bundle contains no absolute host |
| `apps/web/vite.config.ts:14,21–26`                     | Dev/preview servers on `host: "127.0.0.1"`; `/api` proxy targeting `http://127.0.0.1:3001`                            | **Loopback-only bind and loopback-only proxy target**                                                                      |
| `tests/acceptance/playwright.config.ts:20–24,33,66–86` | `baseURL http://127.0.0.1:4173`; webServer readiness URLs `http://127.0.0.1:3001/health` and `http://127.0.0.1:4173/` | **Loopback-only test infrastructure**, booted and torn down by Playwright                                                  |
| `tests/acceptance/specs/shell.spec.ts:74–78`           | Asserts every observed browser request has hostname `127.0.0.1`                                                       | **Guard, not a connection** — the suite _fails_ if any non-loopback request occurs                                         |

No WebSocket, EventSource, DNS, raw-socket, HTTP-client-library, or child-process/shell-execution usage exists in any first-party file. `packages/*/src/index.ts` are empty `export {}` boundaries with no runtime behavior. `scripts/bootstrap.sh` runs `pnpm install --frozen-lockfile` (registry access — development tooling, § 7); `scripts/verify.sh` invokes only repository-local commands.

**All Atlast product/runtime network paths, under the only authorized M0 execution configuration, are loopback-only.** The only configurable network value is a port number (§ 4); no hostname, URL, or bind address is configurable anywhere in product code. Two categories sit outside that product-runtime claim: (a) developer bootstrap and browser-install tooling (`scripts/bootstrap.sh`'s frozen-lockfile install, the documented `browser:install` command) may contact public package registries or browser distribution services — these are documented prerequisites and permitted development tooling (§ 9), not product runtime integrations; and (b) the web bundle's `fetch("/api/health")` is origin-relative — see the qualification below.

**Relative-fetch qualification.** `fetch("/api/health")` inherits whatever origin serves the web bundle. The only authorized and repository-configured M0 servers for that bundle — Vite dev and Vite preview — bind to `127.0.0.1`, so under every configuration this repository defines, the request stays on loopback. No deployment configuration exists in the repository. Hosting the built bundle anywhere else would change this assumption and would require a new security review and boundary audit before it is authorized.

## 4. Environment-Variable Access

Every first-party `process.env` / `import.meta.env` access in the repository:

| Location                    | Variable          | Effect                                                                                                             | Classification                                                                                                              |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/server.ts:31` | `ATLAST_API_PORT` | Overrides the API's listen **port**; validated as an integer 1–65535, rejects anything else with an explicit error | **Local-tooling only.** Cannot alter the bind address (hardcoded `127.0.0.1`), introduce an endpoint, or carry a credential |

Additionally, `tests/acceptance/playwright.config.ts:71` _sets_ `ATLAST_API_PORT=3001` for the API webServer process (a write, not a read). No other environment access exists — none can introduce an external endpoint, credential, or unsafe bind address.

## 5. Credentials and Sensitive Files — Result: none found

- No tracked `.env` or environment-specific secret files (`.gitignore` excludes `.env` / `.env.*`; `git ls-files` confirms none are tracked).
- No private keys, certificates, kubeconfigs, credential exports, token files, or cloud credential files by name or content.
- Zero matches for every high-confidence credential format listed in § 2.
- Zero suspicious password/token/client-secret/API-key assignments.
- Two pattern hits inside `pnpm-lock.yaml` (lines 817 and 908) were investigated and are **false positives**: the case-insensitive substrings `Vpn` and `PrD3` occurring inside base64-encoded SHA-512 package integrity hashes (`isexe@2.0.0`, `lightningcss-linux-x64-musl@1.33.0`). They are content-address checksums, not secrets or internal identifiers.

## 6. Employer / Customer Material — Result: none found

- No employer names, internal domains, proprietary service names, real architecture identifiers, customer data, employee data, internal ticket IDs, internal repository URLs, or company-specific configuration in any tracked file.
- No email addresses (scan excluding npm scope names like `@atlast/`, `@types/`).
- No git remote or code-hosting URLs.
- All service names in the codebase (`atlast-api`, `@atlast/*`, `demo-company`) are project-invented. Technology names present (Fastify, React, Vite, Kubernetes, Kind, etc.) are generic public technologies, not organizational data.

## 7. Dependency and Tooling Capabilities — Result: no product dependency provides external-system integration capability

The complete first-party dependency surface (19 unique packages across all manifests, all exact-pinned): `fastify`, `react`, `react-dom` (runtime); TypeScript/ESLint/Prettier toolchain, Vite, Vitest, jsdom, Testing Library, `@playwright/test`, `@types/*` (development). Scans found **no** cloud SDKs, Kubernetes clients, database clients, telemetry exporters, LLM SDKs, authentication/identity SDKs, GitHub/CI-provider SDKs, no observed-system integration capability of any kind, and no shell execution of `curl`, `wget`, `kubectl`, `terraform`, cloud CLIs, or deployment commands anywhere in first-party code or scripts. Ordinary package-manager and browser-download tooling (pnpm registry access, Playwright's Chromium download) remains an explicit permitted exception (§ 9) — development tooling, not a product integration.

No code capable of mutating an observed system exists; no component holds any credential, write-capable or otherwise ([GUARDRAILS.md § 1.1](../../GUARDRAILS.md#11-product-boundaries-are-hard-constraints)).

## 8. Fixtures — Result: synthetic, documentation-only

`fixtures/` currently contains exactly one tracked file: `fixtures/demo-company/README.md`, describing a **fictional** engineering organization to be populated from M0 Phase B / M1. The directory is **documentation-only — no fixture data exists yet**. The README contains no real company identifiers, domains, credentials, or copied production values. When fixture data lands (M1), it must be re-audited against the same criteria.

## 9. Permitted Tooling and Reference Exceptions

Findings that are explicitly _not_ violations:

| Item                                                                                                   | Why permitted                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm registry metadata in `pnpm-lock.yaml` (271 resolution/integrity entries)                           | Dependency-management tooling, not a product integration; installs are frozen-lockfile and reviewed                                                     |
| `pnpm --filter @atlast/tests-acceptance browser:install` (documented in README and verify.sh comments) | One-time development-tooling download of the pinned Chromium build; never runs at product runtime or inside verification stages                         |
| `https://kind.sigs.k8s.io/` in `docs/milestones.md`                                                    | Documentation hyperlink (reference to the M5 disposable-cluster tool); not executable                                                                   |
| Loopback HTTP (`127.0.0.1:3001/4173/5173`) in dev servers, proxy, and acceptance tests                 | Local development and testing on the loopback interface, explicitly permitted by the M0 design ([GUARDRAILS.md § 1.4](../../GUARDRAILS.md#14-security)) |

## 10. Findings Requiring Remediation

**None.**

## 11. Residual Limitations of Static Scanning

This audit is a point-in-time static review and cannot prove:

- **Absence of every possible secret.** Pattern scans catch known credential formats and naming conventions; a novel or obfuscated secret format could evade them. Mitigation: small reviewed surface, `.gitignore` exclusions, and human review of every change ([GUARDRAILS.md § 3.3](../../GUARDRAILS.md#33-pull-requests)).
- **Third-party dependency behavior.** Declared dependencies were audited by capability surface, not by reading their implementations. Supply-chain behavior (e.g., a compromised package making network calls) is outside static first-party review. Mitigation: exact version pins, frozen-lockfile installs, minimal dependency count.
- **Future changes.** This audit binds only commit `4111d24`. Any change adding dependencies, network code, environment access, or fixture data moves the boundary and warrants re-audit — in particular at M1 (fixture data) and M5 (first real connector).
- **Git history.** The audit examined the tracked tree at HEAD, not every historical blob. The repository is young and has been committed directly to `main` through explicit human review checkpoints — the current tree was reviewed at those checkpoints, but the full Git history was not independently secret-scanned.

## 12. Conclusion

At commit `4111d24`, within the limits stated in § 11: every Atlast product/runtime network path, under the only authorized M0 execution configuration, binds or targets `127.0.0.1` exclusively; the single environment variable in use can alter only a local port number; no credentials, sensitive files, or high-confidence secret patterns exist in tracked content; no employer or customer material is present; no product dependency provides cloud, Kubernetes, database, telemetry, LLM, identity, CI-provider, or observed-system integration capability (package-manager and browser-download tooling remain documented development-tooling exceptions, § 9); and the fixture directory is documentation-only and fictional. The static evidence supports the M0 exit criterion, read as it is intended — as a bound on the product/runtime: under the only authorized M0 configuration, Atlast product/runtime does not connect to any external system; Git-tracked repository content holds no external-system credentials; and the project operates on synthetic — currently absent — data. Permitted developer bootstrap and browser-download connections remain the explicit tooling exceptions documented in § 9.
