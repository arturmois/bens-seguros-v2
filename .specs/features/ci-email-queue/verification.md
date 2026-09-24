# CI email queue verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: c82646b..be2b9a3
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

The fix works: the local failure reproduces at `c82646b` and disappears at `be2b9a3`, and the
diagnosis holds (details under Diagnosis). The verdict is FAIL for two reasons. C3 cannot be proven
yet: `be2b9a3` has not been pushed, and `origin/main` is 8 commits behind. Two mutants also
survived; both hit C2's "each test" and "only those" wording, which only a read of the source
proves.

## Binding sources

None: `checks.md` names no binding source, and the profile is not `ui`.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | suite passes at `--maxWorkers=1` and `2`, both queue tests reported passed | real tree at be2b9a3: `CI=true pnpm exec vitest run --maxWorkers=2` exit 0 (31 files, 308 tests), `--maxWorkers=1` exit 0 (308 tests). Cold results cache (the CI condition), HEAD worktree: `--maxWorkers=2 --reporter=verbose` exit 0, `--maxWorkers=1` exit 0, with `✓ ... delivers each template through the queue` and `✓ ... retries a failed send` printed individually | `apps/server/src/emails/send-email.spec.tsx:143` - `expect.poll(... inbox(to) ...).toEqual([subject])`; `apps/server/src/emails/send-email.spec.tsx:179` - `expect.poll(... retry_count ...).toBeGreaterThanOrEqual(1)` | PASS |
| C2 | each queue test deletes only `email.send` jobs in `created`/`retry` from its own `<schema>_pgboss.job` before starting its worker | `grep -n "state IN ('created', 'retry')" src/emails/send-email.spec.tsx` prints line 39; `CI=true pnpm exec vitest run src/emails/send-email.spec.tsx` exit 0 (6 tests) | `apps/server/src/emails/send-email.spec.tsx:39` - `DELETE FROM "${bossSchemaOf(target)}".job WHERE name = $1 AND state IN ('created', 'retry')` with `SEND_EMAIL` at :40; the schema comes from the test's own `DATABASE_URL` at :31; called before `registerWorkers` at :124 and :160 | PASS |
| C3 | GitHub CI job `ci` passes on the pushed commit | not run: `git log origin/main..HEAD` lists be2b9a3 and 7 more commits; `gh run list --workflow CI --limit 1` shows `failure` on `14fbe74` (origin/main), not on be2b9a3 | no evidence yet - the proof needs a push that has not happened | NOT PROVEN (pending push) |

**Precision gap in C1's proof.** The proof command does not pin the Vitest results cache. With a warm
cache, Vitest runs previously failed and longer files first (`node_modules/vitest/dist/chunks/index.DzobfTyw.js:13336`).
That puts `send-email.spec.tsx` ahead of the backlog. With a cold cache (as on CI) it sorts larger
files first (`index.DzobfTyw.js:13333`), and the backlog builds up ahead of it. Evidence: fault F1
survived a warm run (exit 0) and was killed in a cold run (exit 1). A C1 run on a dev machine can
therefore pass for the wrong reason. The C1 PASS above rests on the verifier's cold runs, where
`rm -rf node_modules/.vite/vitest` came before each run.

## Diagnosis

Holds. The evidence:

- The GitHub failure (latest CI run, `14fbe74`) has the same signature as the local run: the same two tests fail after about 15 s, with `expected [] to deeply equal [ 'Confirme seu e-mail' ]` and `expected 0 to be greater than or equal to 1`.
- It reproduces at `c82646b` with a cold cache: `--maxWorkers=2` exit 1 and `--maxWorkers=1` exit 1, with the same two failures. After the `--maxWorkers=1` run, `test_w1_pgboss.job` held 270 `email.send` rows in `created`.
- The only change between that failure and the pass at `be2b9a3` is the DELETE. Removing both calls (F1) makes it fail again with a cold cache.
- The mechanism matches pg-boss 12.33.3. The default poll is 2000 ms (`node_modules/pg-boss/dist/attorney.js:580`). Fetches take `batchSize = 1` and `orderByCreatedOn = true`, and there is no burst unless configured (`node_modules/pg-boss/dist/manager.js:843`, `:870`). The worker delays `interval - duration` between fetches (`node_modules/pg-boss/dist/worker.js`, `run()`).

One inaccuracy in the stated cause, which does not change the verdict. Intent and the comment at
`send-email.spec.tsx:34` say the other files "enqueue e-mails without starting a worker". That is
not possible: `enqueue` throws unless the queue has a registered worker
(`apps/server/src/infrastructure/queue.ts:40`). Every file that enqueues builds its app with
`buildTestApp({ workers: true })`. The leftovers come from files that close before their own worker
has drained its backlog at one job per 2 s. The fix is unaffected; the explanation in the comment
is wrong.

Concurrency: the DELETE cannot remove jobs from a test file that is running at the same time.
The schema is `test_w${VITEST_POOL_ID}` (`apps/server/test/setup-db.ts:25`). Vitest takes a free
pool id per file (`index.DzobfTyw.js:11433`, `getConcurrencyId` at :11547). It releases the id only
after that file has sent `testfileFinished` (`freeWorkerId` at :11487, after `await resolver.promise`).
Two files never share a schema at the same time. The server config sets no `concurrent`,
`isolate` or `fileParallelism` (grep over `apps/server`), so tests inside a file run one after
another. The jobs removed therefore belong to files that have already finished.

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| queue tests of `send-email.spec.tsx` (2) | the spec file, `it(` at :121 and :156 | delivers each template: C1 (cold w1, w2) · retries a failed send: C1 (cold w1, w2) | - |
| worker counts that fail (3) | CI log + local reproduction | 1: C1 cold · 2: C1 cold · GitHub runner: C3 | GitHub runner (C3 not run, commit not pushed) |
| job states the worker fetches (2) | pg-boss `JOB_STATES` order `created < retry < active` (`node_modules/pg-boss/dist/plans.js:32`) and fetch index `state < 'active'` (`plans.js:841`) | `created`: C2 grep + F1/F3 · `retry`: C2 grep only (no leftover `retry` job ahead of the tests in any run) | - |
| Vitest file order (2, swept: not in checks.md) | `index.DzobfTyw.js:13327-13338` | cold cache (CI): verifier's C1 runs · warm cache: not a CI condition | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| the setup of the two queue tests | `apps/server/src/emails/send-email.spec.tsx` | suite at `--maxWorkers=1` and `2` | yes - with a cold cache both tests pass and a foreign backlog is present (without the DELETE, F1 fails the same runs) |

## Faults injected

All in a HEAD worktree, with a cold Vitest cache (`rm -rf node_modules/.vite/vitest`), `CI=true pnpm exec vitest run --maxWorkers=2`.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1: remove both `clearPendingEmails` calls | `send-email.spec.tsx:124`, `:160` | yes - both queue tests fail at 15 s (exit 1); a warm-cache run of the same mutant exited 0 (the C1 precision gap above) |
| F2: remove only the call in "retries a failed send" | `send-email.spec.tsx:160` | survived - exit 0; the first test's DELETE already emptied the queue, so C2's "each of the two tests" rests only on reading lines 124 and 160 |
| F3: `state IN ('created', 'retry')` -> `state IN ('retry')` | `send-email.spec.tsx:39` | yes - C2 grep proof exits 1 (the created backlog is the F1 surface) |
| F4: drop the `name = $1` filter (DELETE every queue's pending jobs) | `send-email.spec.tsx:39` | survived - exit 0 and the C2 grep still matches; C2's "and only those (other queues stay)" has no executing proof. `test.dedupe.*` rows do sit in the same schema, but nothing reads them after their file ends |

Real tree `git status --porcelain` was empty before and after, and both worktrees were removed.

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` at be2b9a3 (real tree): lint exit 0, typecheck exit 0, test exit 0 (server: 31 files, 308 passed, 0 failed), build exit 0.

## Ranked gaps

1. C3 is not proven because the commit has not been pushed. It becomes provable after the push, with `gh run list --workflow CI --limit 1 --json conclusion,headSha`, whose `headSha` must be be2b9a3 or later.
2. F4 survived. C2 claims "only `email.send`" but no proof checks it. Either add a proof that fails when the filter is dropped, or drop the sub-claim.
3. F2 survived. The call in "retries a failed send" (`send-email.spec.tsx:160`) is redundant when the full file runs. Either the claim or the proof should say so.
4. Precision gap in C1: the proof does not clear `node_modules/.vite/vitest`, so on a warm dev machine it can go green without the fix.
5. The Intent and the comment at `send-email.spec.tsx:34` say the files run "without starting a worker". They do start one; the backlog comes from workers stopped before they drain.
