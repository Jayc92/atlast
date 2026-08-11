# ADR-0025: S7 Source-Alias and Erasable-Syntax Compatibility — the `IdentityNormalizationError` Refactor

**Status:** Accepted — authorizes exactly the narrow `identity-normalization.ts` refactor described below; amends ADR-0022 and ADR-0024 via metadata-only notices
**Date:** 2026-08-11 (drafted, independently corrected twice, and accepted, all 2026-08-11)

> **Approval note (2026-08-11):** ADR-0025 was **explicitly accepted by Joseph Carfagno on 2026-08-11**, after the independent review and two correction passes recorded in this repository's history for this ADR. **Acceptance authorizes exactly the one named `packages/graph-model/src/identity-normalization.ts` compatibility refactor described in § "Decision" below, plus a factual `TASKS.md` progress update accompanying it** — no second, separate implementation release is required, because Slice S7 is already explicitly authorized and active, and this ADR only widens S7's exact path boundary for this one prerequisite fix. **Acceptance does not approve any M1 Slice S7-A or S7-B implementation output**, and **does not authorize Slice S8 or any M2+ work**. **The authorized refactor is not yet implemented.** Consistent with this project's standing checkpoint discipline ([HANDOFF.md § 7](../../HANDOFF.md), [CLAUDE.md](../../CLAUDE.md)), **this acceptance becomes operational, and the refactor may begin, only after the PR recording this acceptance merges to `main` and the primary S7 implementation branch (`feat/m1-s7-query-api`) is rebased or otherwise synchronized onto that merged `main` checkpoint.** Until then, **Slice S7 remains the only active authorized implementation slice, and remains temporarily blocked** on the TS1294 contradiction this ADR documents.

## Context

Accepted [ADR-0024](0024-m1-query-api-runtime-contract.md) § 14 step 5 requires `apps/api` to gain "its own source-alias convention for typecheck and test only" — a new `paths` entry in `apps/api/tsconfig.json` mapping **both** `@atlast/graph-model` and `@atlast/shared` to each package's `src/index.ts`, because [`scripts/verify.sh`](../../scripts/verify.sh) runs `pnpm typecheck` before `pnpm build` (ADR-0013), so typecheck cannot depend on either package's `dist/*.d.ts` existing yet. Accepted [ADR-0011](0011-local-development-runtime.md) separately fixes `apps/api`'s `erasableSyntaxOnly: true` compiler option, so that its source stays directly runnable by Node's native type-stripping dev loop (no `tsx`) — confirmed still set, unchanged, in the current `apps/api/tsconfig.json`.

**An actual M1 Slice S7-B implementation attempt** — writing the ADR-0024 § 12 composition root (`buildApplication`/`initializeApplication` in `apps/api/src/app.ts`, importing `InMemoryEvidenceStore`, `InMemoryTopologyGraphStore`, `Clock`, and `assertValidClockReading` from `@atlast/graph-model`, exactly as § 12's literal code requires) — reproduced this finding: the moment `apps/api` source actually imports anything from `@atlast/graph-model`, `pnpm --filter @atlast/api run typecheck` fails:

```
../../packages/graph-model/src/identity-normalization.ts(25,5): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
../../packages/graph-model/src/identity-normalization.ts(26,5): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
```

**Independently reproduced for this ADR.** TypeScript applies the _consuming_ project's compiler options to every file reachable through a `paths` alias inside the same compilation program — not the aliased package's own `tsconfig.json` options. Once `apps/api` imports through the `@atlast/graph-model` alias, TypeScript pulls that package's entire `src/index.ts` export barrel and its whole transitive module graph (which itself imports from `@atlast/shared`, pulling that package's export barrel too) into `apps/api`'s own `erasableSyntaxOnly`-enabled program, and re-checks every one of those files under that stricter rule — regardless of which named export `apps/api` actually uses, since TypeScript does not tree-shake type-checking of a re-exporting barrel module.

**Root cause, confirmed by direct inspection:** `packages/graph-model/src/identity-normalization.ts`'s `IdentityNormalizationError` class constructor (lines 23–31) declares two **parameter properties**:

```ts
export class IdentityNormalizationError extends Error {
  constructor(
    message: string,
    readonly evidenceIdentifier: string,
    readonly failingKey: string,
  ) {
    super(message);
    this.name = "IdentityNormalizationError";
  }
}
```

Parameter properties carry real runtime semantics — TypeScript emits an implicit `this.evidenceIdentifier = evidenceIdentifier; this.failingKey = failingKey;` immediately after the `super(message)` call — so erasing only the type annotations would silently drop that assignment. `erasableSyntaxOnly` exists precisely to reject syntax whose _type-annotation-only_ portion cannot be erased without changing runtime behavior, and TS1294 is exactly that rejection.

**Scope confirmation (independently reproduced for this ADR, not merely asserted).** The complete `apps/api` source-alias closure is exactly the non-test `.ts` source reachable from `packages/graph-model/src/index.ts` and `packages/shared/src/index.ts` — the only two entry points either alias can ever resolve to, and the only files a re-exporting barrel module pulls into the same program (test files are never imported by anything else, so they never enter this closure). Both packages' complete non-test source was searched for every `erasableSyntaxOnly`-incompatible construct:

- **Enums** (`enum`/`const enum`) — none found in either package.
- **`namespace`/`module` declarations carrying runtime code** — none found in either package.
- **Legacy `import`/`export =` (require-style) syntax** — none found in either package.
- **Constructor parameter properties** (a modifier — `readonly`/`private`/`protected`/`public` — directly on a constructor parameter) — **exactly one site**: `identity-normalization.ts`'s `IdentityNormalizationError` constructor, lines 25–26 (the two lines TS1294 already names). `packages/shared/src/contract-suite.ts`'s `ContractViolation` class uses `public constructor(caseName: string, detail: string)` — a visibility modifier on the constructor _method itself_, not a parameter property; its parameters carry no modifier and are never auto-assigned, so it is erasable and unaffected.

**This is the only non-erasable syntax site in the complete `apps/api` source-alias closure.** No broader scope exists to report.

**Why this was not caught earlier.** Neither ADR-0024's three independent correction passes nor Slice S7-A's own clean-build proof exercised this path: S7-A added the `apps/api/tsconfig.json` `paths` entries (ADR-0024 § 14 step 5) as pure plumbing, but no `apps/api` source file imported anything from `@atlast/graph-model` at that point, so `pnpm --filter @atlast/api run typecheck` passed — the alias was configured but never actually resolved through. TypeScript only pulls a path-aliased module's source into the consuming program when something actually imports through that specifier; a green typecheck with an unexercised alias proves nothing about what happens once it is exercised. This is exactly the class of gap ADR-0022, ADR-0023, and ADR-0024 each existed to close for their own slices — discovered here only because S7-B's real implementation, not a design review, exercised the path.

## Problem

Determine how `apps/api` can satisfy **both** accepted decisions at once — ADR-0024 § 14 step 5's `@atlast/graph-model` typecheck/test source alias, and ADR-0011's `erasableSyntaxOnly: true` — given that the only existing incompatibility between them is exactly two parameter-property declarations in one already-merged, otherwise-frozen S5 file, without relaxing either governing decision, without touching any file outside the narrowest possible fix, and without inventing new build-configuration policy.

## Decision (Accepted 2026-08-11)

1. **`apps/api`'s `erasableSyntaxOnly: true` setting and ADR-0011's native-type-stripping guardrail are preserved unchanged.** This ADR does not touch `apps/api/tsconfig.json`, and does not reopen ADR-0011.
2. **ADR-0024 § 14's source-alias strategy for typecheck/test, and its package-entry-point build strategy for production builds, are preserved unchanged.** This ADR does not touch either package's `tsconfig.build.json`, `package.json` build plumbing, or the `apps/api/tsconfig.build.json` `"paths": {}` override.
3. **Exactly one behavior-preserving syntax-compatibility refactor is authorized, confined to `packages/graph-model/src/identity-normalization.ts`.** No other file in either package is touched by this ADR.
4. **The refactor replaces `IdentityNormalizationError`'s two constructor parameter properties with `declare readonly` field declarations plus explicit constructor assignments after `super()`** — the identical pattern this package's own `repository-errors.ts` already uses for its conditional `readonly x?: T` fields (documented there: `declare` opts a field out of the `useDefineForClassFields` emitted definition, so only an explicit `this.x = value` assignment ever creates it):

   ```ts
   export class IdentityNormalizationError extends Error {
     declare readonly evidenceIdentifier: string;
     declare readonly failingKey: string;

     constructor(
       message: string,
       evidenceIdentifier: string,
       failingKey: string,
     ) {
       super(message);
       this.evidenceIdentifier = evidenceIdentifier;
       this.failingKey = failingKey;
       this.name = "IdentityNormalizationError";
     }
   }
   ```

   **This exact statement order is load-bearing, not cosmetic.** The original parameter-property emit is effectively `super(message); this.evidenceIdentifier = evidenceIdentifier; this.failingKey = failingKey; this.name = "IdentityNormalizationError";` — TypeScript inserts the two parameter-property assignments immediately after the `super()` call, in declaration order, _before_ any explicit statement already in the constructor body runs. The explicit replacement above reproduces that exact order: `super()`, then the two field assignments in the same declaration order, then `this.name` last — never `this.name` before either field assignment, which a naive transcription could otherwise get backwards.

5. **This preserves, exactly:** the emitted runtime field assignments (the same two `this.x = value` statements now execute explicitly rather than implicitly, in the identical order relative to `super()` and to `this.name` that the original parameter-property emit already produced — see the code block above); the public class shape (`readonly evidenceIdentifier: string`, `readonly failingKey: string`, both still enumerable, still assigned, still readable exactly as before); the `Error` message text and `.name` value; the class's construction API (identical constructor parameter list, identical call sites — every existing caller in `identity-normalization.ts` and its test file needs no change); and all S5 identity-normalization/reconciliation behavior, which this refactor does not touch in any other respect. This is a pure syntax substitution with identical runtime output — provable by the existing, completely unmodified `identity-normalization.test.ts` continuing to pass without a single edit.
6. **This ADR prohibits, and authorizes no one to make:** any change to the `m1-v1` reconciliation policy, normalization rules, or algorithm (ADR-0022 §§ 1–2); any change to identifier construction (ADR-0022 § 3); any change to the S6 repository error taxonomy (ADR-0023 § 9) or any other error class; any relaxation of `apps/api`'s or any other package's compiler options; any change to the S6 cursor payload shape or its binding semantics; any change to `packages/shared`; any fixture change; and any change to `packages/graph-model/src/**` beyond the single named class in the single named file.
7. **Required verification, once the authorized refactor is implemented:**
   - `identity-normalization.test.ts` is byte-for-byte unchanged and passes unmodified against the refactored class.
   - The full `packages/graph-model` test suite and typecheck pass with an unchanged test count.
   - `apps/api`'s own typecheck passes with both packages' `dist/` absent and both source aliases (`@atlast/graph-model`, `@atlast/shared`) active — the literal reproduction of the TS1294 failure this ADR responds to, now resolved.
   - A clean package build (`rm -rf` all three packages' `dist/`, then `pnpm build`) succeeds, and the compiled `apps/api` runtime starts and serves a request successfully.
   - The complete, unmodified `./scripts/verify.sh` passes.
8. **With this acceptance, this ADR amends ADR-0022 and ADR-0024 via metadata-only notices** — see § "Relationship to Accepted ADRs" below; both ADRs' accepted decision text is preserved verbatim.
9. **This ADR's acceptance, exactly as with any other explicit human decision recorded in this project, is itself the authorization to implement — no second, separate implementation release is required.** Slice S7 is already explicitly authorized and active (2026-08-11, recorded in [TASKS.md](../../TASKS.md)); this ADR does not authorize a new slice — it only widens S7's exact, already-authorized path boundary to name the one prerequisite compatibility fix in items 3–5. Concretely:
   - **Joseph Carfagno explicitly accepted ADR-0025 on 2026-08-11.** That acceptance authorizes exactly the named `packages/graph-model/src/identity-normalization.ts` refactor (items 3–5 above) and a factual `TASKS.md` progress update — nothing else, and nothing more is required before that specific, narrow implementation may begin, once the operational precondition in the approval note above (this record's own PR merged to `main`, and the primary S7 branch synchronized onto that checkpoint) is satisfied.
   - **The authorized refactor is not yet implemented.**
   - **Acceptance does not approve any M1 Slice S7-A or S7-B implementation output** — that output is reviewed on its own separate merits, unaffected by this ADR.
   - **Acceptance does not authorize Slice S8 or any M2+ work**, which remain separately gated.
10. **Current implementation state, recorded honestly:**
    - **M1 Slice S7-A** (package build plumbing and additive shared HTTP schemas) was **independently reviewed with no blocking findings** and is **locally checkpoint-committed at `747a32a`** on branch `feat/m1-s7-query-api`, in the primary implementation working tree — not on this documentation branch. **S7-A is not pushed, not PR-approved, and not merged to `main`.**
    - **M1 Slice S7-B** is **uncommitted** in that same working tree: it currently contains uncommitted HTTP support modules (request/response coercion, the closed error mapping, response-validation helpers), all seven route modules, the `app.ts` composition-root and `server.ts` rewrites, and the rewritten `app.test.ts` health test. **Comprehensive S7-B integration tests have not yet been added** — work stopped at the reproduced TS1294 typecheck blocker this ADR documents before any integration-test file was written. No S7-B file has been committed.
    - **No S7-A or S7-B implementation output is pushed, PR-approved, or merged.**
    - **ADR-0025 is now Accepted (2026-08-11), and its acceptance itself authorizes the named refactor** (item 9 above) **— but the refactor is not yet implemented.** **Slice S7 remains the only active authorized implementation slice, and remains temporarily blocked** on the TS1294 contradiction until this acceptance record merges to `main`, the primary S7 implementation branch (`feat/m1-s7-query-api`) is synchronized onto that checkpoint, and the authorized refactor is implemented and verified.

## Alternatives Considered

- **Relax or remove `erasableSyntaxOnly` in `apps/api/tsconfig.json`.** Rejected: this reopens accepted ADR-0011's native-type-stripping decision to work around two lines in an unrelated file, and ADR-0024 § 14 step 5 authorizes `apps/api/tsconfig.json` to change in exactly one way (the two new `paths` entries) — removing an existing compiler option is a different, unauthorized change to the same file and a strictly worse trade than a two-line source fix.
- **Find a TypeScript project-configuration mechanism to keep `packages/graph-model`'s source out of `apps/api`'s own type-checking program while still resolving the import.** Rejected on direct inspection: TypeScript has no per-subtree compiler-option scoping for files reached through a `paths` alias — `exclude` only prunes a project's own initial file discovery, not files pulled in transitively through an import, and `skipLibCheck` only affects `.d.ts` declaration files, never `.ts` source. No such mechanism exists to invoke.
- **Drop the `@atlast/graph-model` source alias entirely and force `apps/api` to typecheck only against built `dist/` output.** Rejected: this directly contradicts ADR-0024 § 14 step 5's own stated reason for the alias — `scripts/verify.sh` runs `pnpm typecheck` **before** `pnpm build` (ADR-0013), so `dist/*.d.ts` does not exist at typecheck time; removing the alias would require reordering the protected verification pipeline itself, a far larger and separately-gated decision than a two-line class fix.
- **Pre-emptively rewrite every parameter property across the whole monorepo, not just the one colliding site.** Rejected: the exhaustive search this ADR performed found exactly one site in the complete closure; a speculative repository-wide style change has no present justification and would itself be an unreviewed scope expansion.
- **Route `apps/api`'s consumption of `@atlast/graph-model` through a dynamic (`import()`) boundary to avoid static type-checking of the barrel.** Rejected: this defeats ADR-0005's strict, end-to-end static-typing discipline and the entire point of ADR-0024's typed direct workspace dependency; it is also not guaranteed to avoid the problem, since `apps/api`'s own type-checking of the dynamic import's resolved type still requires resolving the target module's declarations.

## Tradeoffs

- **Chosen:** a two-line, behavior-preserving syntax substitution in exactly one existing, already-merged file, leaving both governing decisions (ADR-0011, ADR-0024 § 14) completely intact.
- **Given up:** nothing behaviorally. The affected file's source text changes shape (parameter properties become `declare` fields plus explicit assignment) but not meaning, and its own test file is the proof — it requires no edit to keep passing.

## Consequences

- Once this ADR is accepted and its refactor implemented, `apps/api`'s typecheck of the complete source-alias closure (both `@atlast/graph-model` and `@atlast/shared`) succeeds without any `erasableSyntaxOnly` violation, unblocking Slice S7-B's composition root exactly where it stalled.
- This is the fourth ADR in the ADR-0022/0023/0024/0025 lineage that closes a gap discovered only once real implementation — not design review alone — exercised the accepted decisions against each other. The pattern is now well-established for this project: each slice's implementation attempt is itself part of the review process, not merely its execution.
- No other file in either package needs equivalent treatment today (confirmed by exhaustive search, § "Context" above). A future addition of a new parameter-property-shaped constructor anywhere in either package's `src/**`, while `apps/api`'s alias convention and `erasableSyntaxOnly` both remain active, would reintroduce this exact class of blocker and should be caught in review before merge, not rediscovered by a future S7-adjacent implementation attempt.

## Risks

- **A different `erasableSyntaxOnly`-incompatible construct is introduced later in either package's source**, by a future change unaware of this constraint, silently reopening the same class of blocker. Mitigation: this ADR's finding — that `apps/api`'s source-alias convention makes `packages/graph-model`'s and `packages/shared`'s source subject to `apps/api`'s stricter compiler options — should become a documented review point for any future PR touching either package's `src/**` while the alias convention is active; this ADR does not itself add a lint rule or CI check, which would be a separate, larger decision.
- **The proposed fix, once implemented, is verified only by re-running the specific reproduction**, not by a standing automated guard (e.g., a dedicated CI job type-checking `packages/graph-model`/`packages/shared` under `erasableSyntaxOnly` independent of `apps/api`). Accepted as proportionate to a two-line fix; a repository-wide guard is a larger, separate tooling decision this ADR does not make.

## Testable Invariants and Acceptance Evidence

The future implementation of this now-accepted ADR (authorized directly by ADR-0025's 2026-08-11 acceptance — no separate release needed, per § "Decision" item 9) must prove, at minimum:

1. `identity-normalization.test.ts` is unmodified and every existing case passes unchanged against the refactored class.
2. `new IdentityNormalizationError(message, evidenceIdentifier, failingKey)` produces an instance whose `.message`, `.name`, `.evidenceIdentifier`, and `.failingKey` are identical to the pre-refactor class for the same inputs, and which is `instanceof Error` and `instanceof IdentityNormalizationError`.
3. The complete `packages/graph-model` test suite and typecheck pass with the same test count as before this change (no test added, removed, or altered by this refactor).
4. `apps/api`'s own typecheck passes with `dist/` absent for both `@atlast/graph-model` and `@atlast/shared`, with both source aliases active — the exact scenario that previously failed with TS1294.
5. A clean build (`rm -rf` all three packages' `dist/`, then `pnpm build`) succeeds, and the compiled `apps/api` server starts and serves at least one request successfully before being stopped.
6. The complete, unmodified `./scripts/verify.sh` passes.

**Acceptance evidence at review time:** this document read against accepted ADR-0011 (the compiler-option constraint), accepted ADR-0022 §§ 1–3 (the file and class this ADR's refactor touches), accepted ADR-0024 § 14 step 5 (the source-alias requirement whose exercise surfaced this gap) and § 12 (the composition-root code whose literal implementation is what first imports `@atlast/graph-model` from `apps/api`), and the exhaustive closure search recorded in § "Context" — demonstrating that exactly one incompatibility exists, that it is fully described, and that the proposed fix changes nothing this project's accepted decisions already settled.

## Relationship to Accepted ADRs

**This ADR was accepted 2026-08-11, and with that acceptance amends two accepted ADRs via metadata-only notices** — applied with acceptance, never speculatively, consistent with this project's standing discipline (ADR-0019 § 5, ADR-0020 § 4, ADR-0021 § "Consequences", ADR-0022/0023/0024 § "Relationship to Accepted ADRs"). Every amended ADR's accepted decision text is preserved verbatim; the notices point here:

- **ADR-0022** — §§ 2–3 define `IdentityNormalizationError`'s role (thrown for every normalization failure, naming the offending Evidence identifier and failing key) without specifying the class's internal field-declaration syntax; this ADR's refactor changes only that syntax, not the error's semantics, message content, or the normalization algorithm ADR-0022 defines. A metadata-only notice now points here for the exact class-declaration-syntax detail ADR-0022 left as an implementation-time choice, which this ADR pins for `erasableSyntaxOnly` compatibility.
- **ADR-0024** — § 14 step 5 requires the `@atlast/graph-model` source alias without anticipating that exercising it would collide with `apps/api`'s own pre-existing `erasableSyntaxOnly` setting (ADR-0011), because no S7 draft's review, and no S7-A verification step, ever exercised an actual import through that alias. A metadata-only notice now points here as the prerequisite compatibility fix the alias strategy's actual completion requires, and extends § 15's/Exact S7 Boundary's authorized-file list to name `packages/graph-model/src/identity-normalization.ts` explicitly, scoped to exactly the class-declaration-syntax change this ADR describes.

Neither amended ADR's accepted decision text changes; this document is the sole normative source for the compatibility fix it adds.

## Exact Boundary This ADR Authorizes

Consistent with [docs/m1-plan.md § 5](../m1-plan.md#5-package-and-application-boundaries) and the exact-boundary discipline ADR-0022/0023/0024 each established: **this ADR's 2026-08-11 acceptance authorizes its implementation to change only**:

- `packages/graph-model/src/identity-normalization.ts` — exactly the `IdentityNormalizationError` class's constructor-declaration syntax (§ "Decision" items 3–5 above), no other line, no other export, no other file in the package.
- `TASKS.md` — solely for factual progress reporting of this specific fix.

**This ADR must NOT be used to justify, and its acceptance does not authorize:** any change to `reconciliation.ts`, `derivation-policy.ts`, `freshness.ts`, or any other `packages/graph-model/src/**` file; any change to `packages/shared/src/**`; any change to `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, or any other compiler-option file in any package; any change to `scripts/verify.sh` or `scripts/bootstrap.sh`; any fixture change; any S7-B route, application-composition, or integration-test implementation (that work remains gated on S7's own already-given authorization and its own independent review); or any S8 or M2+ work.

**This ADR's acceptance itself authorizes implementing the narrow refactor it proposes — no second, separate implementation release is required.** This differs from how ADR-0022/0023/0024 each gated their own new implementation _slice_ behind its own separate release: ADR-0025 does not open a new slice. Slice S7 is already explicitly authorized and active; this ADR only widens S7's own already-authorized exact boundary (§ "Decision" item 9) to name one prerequisite compatibility fix. Acceptance is the release — but, per the approval note above, the refactor's actual implementation must still wait for this acceptance record's own PR to merge to `main` and for the primary S7 branch (`feat/m1-s7-query-api`) to synchronize onto that checkpoint, exactly as every other decision in this project's standing checkpoint discipline requires.

## Conditions That Would Justify Changing This Decision

- A later finding that this ADR's proposed refactor is not, in fact, behavior-preserving (e.g., an unforeseen interaction with `useDefineForClassFields` or a build-target combination not yet exercised) — would require revisiting the exact replacement syntax before acceptance, never a silent implementation-time reinterpretation.
- A future decision to relax or remove `apps/api`'s `erasableSyntaxOnly` setting (its own reviewed amendment to ADR-0011) — would obsolete this ADR's necessity entirely, but is a separate decision this ADR does not make or presuppose.
- A future decision to reorder `scripts/verify.sh` so that `pnpm build` runs before `pnpm typecheck` (its own reviewed amendment to ADR-0013) — would remove the reason ADR-0024 § 14 step 5's source alias exists at all, and with it the mechanism that pulls `packages/graph-model` source into `apps/api`'s program; out of scope here, and a much larger change than this ADR's narrow fix.
- A future erasableSyntaxOnly-incompatible construct appearing anywhere else in the `apps/api` source-alias closure — would need its own identical-pattern fix, reviewed the same way this one was, never silently patched alongside unrelated work.
