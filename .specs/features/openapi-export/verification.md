# OpenAPI export verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 8fb966f..1eaf414
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All proofs ran at `1eaf414` in a scratch worktree (`git worktree add --detach … 1eaf414`, `pnpm install --frozen-lockfile`), from the worktree root.

## Binding sources

No plan and no binding source: the change is under three files and `checks.md` carries `## Intent` in place of a plan. Step 1 runs only under `ui`.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `pnpm api:generate` exits 0 with the placeholder config, never starts the events listener, and leaves no diff in `apps/server/openapi.json` nor `apps/web/src/api` | `pnpm api:generate && git add --all --intent-to-add apps/server/openapi.json apps/web/src/api && git diff --exit-code -- apps/server/openapi.json apps/web/src/api` exit 0 (`tsx scripts/export-openapi.ts` then `orval` "converted into ready to use orval!"); `grep -c "events: { ...deps.events, start: async () => {} }" apps/server/scripts/export-openapi.ts` printed `1` | `apps/server/scripts/export-openapi.ts:19` - `const app = buildApp({ ...deps, events: { ...deps.events, start: async () => {} } })`; the only `onReady` hook is `apps/server/src/app.ts:123-125` - `await deps.events.start()`, so the stub is the start the hook reaches; `.github/workflows/ci.yml:61-66` runs the same command as the proof | PASS |

Notes on C1:
- The spread keeps `on`/`onReconnect` working: `createEventListener` (`apps/server/src/infrastructure/events.ts:50-160`) returns closures over local state, not `this`-bound methods, so `app.ts:113,121` still register on the real listener; only `start` is replaced.
- The "never started" part is proven by the grep plus the fault below: with the real `start`, `app.ready()` dials `localhost:5432` and the export dies (SASL against a local Postgres, as in CI where a `postgres` service runs; with no Postgres, `connect()` rejects with ECONNREFUSED at `events.ts:100-103` and `app.ready()` rejects too). Either way the first proof exits non-zero.

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| assemblies that call `buildApp` and reach `onReady` (3 in tree, 1 changed) | `git grep -n "buildApp("` at `1eaf414`: `scripts/export-openapi.ts:19`, `src/server.ts:22`, `test/app.ts:42` | `export-openapi.ts` -> C1; `server.ts:22` and `test/app.ts:42` pass the real `deps` unchanged (not in the diff), so the listener still starts there, as the checks state | - |
| `onReady` hooks that start a connection (1) | `git grep -n "onReady" -- apps/server/src`: `app.ts:123` only | C1 (stubbed start) | - |

No other enumeration is named in the Intent or the claim.

## Test policy rows

No `Test policy` section in `checks.md` ("the repo answers it"): a build script is proven by running it, which is what C1 does, and at the same level CI does (`ci.yml:61-66`). Level judged sufficient.

## Faults injected

| Mutation | Location | Killed |
| --- | --- | --- |
| reverted the fix: restored `const app = buildApp(createDependencies(config))` (listener starts on `onReady`) | `apps/server/scripts/export-openapi.ts:17-19` | yes - C1 first proof exit 1 (`Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` from `pg/lib/crypto/sasl.js:67`); C1 grep printed `0`, exit 1 |

One assertion surface (the export run plus the grep), one fault. Scratch worktrees removed with `git worktree remove --force`.

Real-tree porcelain after the run differed from the baseline only in `apps/server/openapi.json` and `apps/web/src/api/**` public-chat files: those carry the concurrent `public-chat` feature's routes, which do not exist at `1eaf414`, so they come from the other agent's own `api:generate`, not from this run (every command here ran inside the scratch worktrees). Not a finding for this feature.

## Gate

At `1eaf414` in the scratch worktree: `pnpm lint` exit 0, `pnpm typecheck` exit 0 (`apps/server/tsconfig.json` includes `scripts`, so the changed file is typechecked), `pnpm build` exit 0, C1 proofs exit 0. `pnpm test` not run: test schemas are named by `VITEST_POOL_ID` only (`apps/server/test/setup-db.ts:24-25`) against the shared local Postgres, so a run here would collide with the concurrent agent's test runs; the diff touches no code any vitest suite imports (`scripts/export-openapi.ts` is imported by nothing).
