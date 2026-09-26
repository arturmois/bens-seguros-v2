# Web chat e2e Turnstile verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 907b4a4..ac92db3
**Round**: 2 - scoped (no fix diff: HEAD is still `ac92db3`, as in round 1. The only change is that `origin/main` now points at it. Scope: C3, the one verdict that was not PASS)
**Verifier**: independent sub-agent (author != verifier)

C3 is now proven. After `git fetch origin`, `git rev-parse HEAD origin/main` returned
`ac92db3994155ca8ec29f4dcfceca2faacebd485` for both refs, and `git log origin/main..HEAD` was
empty, so `7cad1f6` is on the remote. `gh run list --workflow CI --limit 3` shows run
`36250587672` (`push`, branch `main`) on `ac92db3`: `completed`/`success`. Both of its jobs
passed: `ci` (`108427744617`) and `e2e` (`108428114825`). The previous run, `36215793650` on
`907b4a4`, is the `failure` round 1 cited. The code and tests are unchanged since round 1, so
C1, C2, C4 and C5 carry forward. The CI run also re-ran their tests at this commit.

## Binding sources

Carried from ac92db3 (round 1): none. There is no plan and the profile is `light`, so step 1 does
not run.

## Checks

C3 verified at ac92db3 (round 2). C1, C2, C4 and C5 carried from ac92db3 (round 1), same commit.
I re-ran the C1 greps and refreshed citations from the tree: `grep -rn "turnstileToken: ''" e2e/`
exited 1 with no output, and the lines below are unchanged. I restarted no server and ran no
Playwright locally: C2 and C5's local runs are round 1's. The CI log listed below is a new
green on the same tests, with the Turnstile test keys.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | one `TURNSTILE_TEST_TOKEN` constant, used by `signUp` and the direct POST; no `turnstileToken: ''` | carried from round 1; greps re-run at ac92db3: no `turnstileToken: ''`, and 4 `TURNSTILE_TEST_TOKEN` hits | `apps/web/e2e/support.ts:83` `export const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'`; `apps/web/e2e/support.ts:88` `headers: { 'x-captcha-response': TURNSTILE_TEST_TOKEN }`; `apps/web/e2e/web-chat.spec.ts:138` `turnstileToken: TURNSTILE_TEST_TOKEN,` | PASS |
| C2 | passes with CI Turnstile keys; the old `''` token gives 403 | carried from round 1 (local run plus fault check). CI run `36250587672` also shows `✓ 102 ... web-chat.spec.ts:126:3 › web chat › shows a human reply in under two seconds; reloads messages after events resync (4.5s)` | `apps/web/e2e/web-chat.spec.ts:143` `expect(prior.status()).toBe(201)` | PASS |
| C3 | GitHub CI `e2e` job passes on the pushed commit | `gh run list --workflow CI --limit 3 --json databaseId,headSha,conclusion,status`: `36250587672` on `ac92db3…` `completed`/`success`. `gh run view 36250587672`: job `e2e` (`108428114825`) `success`, job `ci` `success`. `gh run view 36250587672 --log --job 108428114825`: the job env shows `SIGNUP_MODE: self_serve`, `TURNSTILE_SITE_KEY: 1x00000000000000000000AA` and `TURNSTILE_SECRET_KEY: 1x0000000000000000000000000000000AA` (Cloudflare's public test keys, not secrets), and the summary reads `104 passed (4.6m)`. All 7 web-chat tests are listed with `✓`, among them `102 … web-chat.spec.ts:126:3 › … shows a human reply in under two seconds; reloads messages after events resync (4.5s)` and `104 … web-chat.spec.ts:199:3 › … reconnects the visitor socket after reload (3.4s)`. A grep over the log for `✘`, `flaky` and `failed` matched none of the test lines, so no test failed or went flaky, so CI's `retries: 1` (`playwright.config.ts:9`) never fired | `apps/web/e2e/web-chat.spec.ts:143` `expect(prior.status()).toBe(201)` (green on the runner with the secret set); `apps/web/e2e/web-chat.spec.ts:221` `await expect(page.getByTestId('web-chat-thread')).toBeVisible()` and `:225` `expect(starts).toBe(0)` (reconnect test green on the runner) | PASS |
| C4 | no standalone follow-up test; the start test's title carries the phrase and its body sends `FOLLOW_UP` | carried from round 1. CI shows `✓ 100 … web-chat.spec.ts:78:3 › … starts a session and shows the first message; stores the visitor token for the socket; sends a follow-up message in the thread (2.8s)` | `apps/web/e2e/web-chat.spec.ts:78` test title ending `; sends a follow-up message in the thread`; `apps/web/e2e/web-chat.spec.ts:102` `await expect(page.getByTestId('web-chat-message').filter({ hasText: FOLLOW_UP })).toBeVisible()` | PASS |
| C5 | whole file passes under CI keys (no 429 on reconnect), the whole e2e suite passes, and the file passes without a secret | carried from round 1 (local: 104 passed with CI keys; 7 passed without a secret). CI adds `104 passed (4.6m)` with the keys set | `apps/web/e2e/web-chat.spec.ts:221` `await expect(page.getByTestId('web-chat-thread')).toBeVisible()`; `apps/web/e2e/web-chat.spec.ts:225` `expect(starts).toBe(0)` | PASS |

## Coverage

Profile `light`: the Coverage recompute does not run. The member round 1 left open on GitHub's
runner ("secret set, as on CI: C3") is now proven by C3 above.

## Swept existing

Carried from ac92db3 (round 1). No row cites an existing constraint.

## Observations (not findings)

- The rate-limit risk from round 1 did not happen on CI. `inbox.spec.ts` ran as tests 7 to 10,
  including `inbox.spec.ts:78:3 › … commercial replies and visitor sees it then close removes it
  from inbox views (6.2s)`, which starts a public session. `web-chat.spec.ts` ran as tests 98 to
  104, near the end of a 4.6-minute run, and all 7 passed on the first try. The risk still exists
  in principle, because the 5/IP/min budget at `apps/server/src/modules/channels/public-chat.routes.ts:74`
  is shared across files. It would only matter if the gap between the two files shrank below one
  minute.

## Gate

CI run `36250587672` on `ac92db3`, job `e2e`: `104 passed (4.6m)`, 0 failed, 0 flaky. Job `ci`:
success.

---

# History

Round 1 is kept verbatim below. Its line numbers refer to ac92db3. It sits inside a fenced block
so the completion gate reads only the current round: its FAIL verdict and C3's NOT PROVEN row are
history, and this round supersedes them.

```text
# Web chat e2e Turnstile verification

**Verdict**: FAIL
**Profile**: light
**Diff range**: 907b4a4..7cad1f6
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

The fix works on this machine. C1, C2, C4 and C5 are proven at HEAD (`ac92db3`). The two commits
after `7cad1f6` do not touch `apps/web/e2e/`, and they change no server code (`git diff --stat
7cad1f6..HEAD`). The verdict is FAIL for one reason: C3 cannot be proven yet. `7cad1f6` has not been
pushed. `git log origin/main..HEAD` lists it plus 2 more commits, and the latest CI run
(`gh run list --workflow CI --limit 1`) is `failure` on `907b4a4`. The user has not authorized a
push. Once CI goes green on the pushed commit, re-verify C3 alone.

## Binding sources

None: there is no `plan.md` (`Plan: none` in checks.md), no binding source is named, and the profile
is `light`, so step 1 does not run.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | one `TURNSTILE_TEST_TOKEN` constant, used by `signUp` and the direct POST; no `turnstileToken: ''` | `grep -rn "turnstileToken: ''" e2e/` printed nothing (exit 1); `grep -rn "TURNSTILE_TEST_TOKEN" e2e/` matched 4 lines: the export, `signUp`, and the import and use in web-chat.spec.ts. A wider `grep -rn "turnstileToken\|DUMMY\|captcha" e2e/` finds no other literal token (`signup-gates.spec.ts:128` `'token-e2e'` is a mocked-widget assertion and out of scope) | `apps/web/e2e/support.ts:83` `export const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'`; `apps/web/e2e/support.ts:88` `headers: { 'x-captcha-response': TURNSTILE_TEST_TOKEN }`; `apps/web/e2e/web-chat.spec.ts:138` `turnstileToken: TURNSTILE_TEST_TOKEN,` | PASS |
| C2 | passes with CI Turnstile keys; the old `''` token gives 403 | Server restarted with `SIGNUP_MODE=self_serve TURNSTILE_SITE_KEY=1x00000000000000000000AA TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`; `signup-config` returned `turnstileSiteKey: "1x00000000000000000000AA"`. `pnpm exec playwright test e2e/web-chat.spec.ts -g "shows a human reply"` exit 0, `✓ ... shows a human reply in under two seconds; reloads messages after events resync`. After 65 s, line 138 was temporarily set back to `turnstileToken: ''` and the same command exited 1 with `Expected: 201` / `Received: 403` at `web-chat.spec.ts:143:28`. Restored with `git checkout -- apps/web/e2e/web-chat.spec.ts`, and `git status --porcelain` came back empty | `apps/web/e2e/web-chat.spec.ts:143` `expect(prior.status()).toBe(201)` (the assertion that turns red with `''` and green with the constant) | PASS |
| C3 | GitHub CI `e2e` job passes on the pushed commit | not run: the commit has not been pushed, and pushing is not authorized. `git log origin/main..HEAD` lists `7cad1f6`, `cd06bfc` and `ac92db3`; `gh run list --workflow CI --limit 1 --json conclusion,headSha` shows `failure` on `907b4a4` | no evidence yet: the proof needs a push that has not happened | NOT PROVEN (pending push) |
| C4 | no standalone follow-up test; the start test's title carries the phrase and its body sends `FOLLOW_UP` | `pnpm exec playwright test e2e/web-chat.spec.ts -g "sends a follow-up message in the thread" --list` printed `Total: 1 test in 1 file`, i.e. `web-chat.spec.ts:78:3 › ... starts a session ...; sends a follow-up message in the thread`. `grep -rn "sends a follow-up" e2e/` has a single hit, at :78 | `apps/web/e2e/web-chat.spec.ts:78` test title ending `; sends a follow-up message in the thread`; `apps/web/e2e/web-chat.spec.ts:100` `.fill(FOLLOW_UP)`; `:101` click `Enviar`; `:102` `await expect(page.getByTestId('web-chat-message').filter({ hasText: FOLLOW_UP })).toBeVisible()` | PASS |
| C5 | whole file passes under CI keys (no 429 on reconnect), the whole e2e suite passes, and the file passes without a secret | CI keys: `pnpm exec playwright test e2e/web-chat.spec.ts` exit 0, `7 passed`, with `✓ ... reconnects the visitor socket after reload` listed. `pnpm exec playwright test` exit 0, `104 passed (5.2m)`, 0 failed and 0 flaky (local `retries: 0`, `playwright.config.ts:9`), and all 7 web-chat tests are listed individually. No secret (the server as found, `turnstileSiteKey: null`): `pnpm exec playwright test e2e/web-chat.spec.ts` exit 0, `7 passed`. Every web-chat run was 65 s or more after the previous one | `apps/web/e2e/web-chat.spec.ts:221` `await expect(page.getByTestId('web-chat-thread')).toBeVisible()` (it would not render after a 429); `apps/web/e2e/web-chat.spec.ts:225` `expect(starts).toBe(0)` | PASS |

## Coverage

Profile `light`: the Coverage recompute does not run. The artifact's three rows were read. Each
member points at a check proven above, except "secret set, as on CI: C3", which falls back to C2
and C5 locally. On GitHub's runner that member is still unproven until C3 runs.

## Swept existing

Every `Swept` row is `n/a` or points at a check (C2, C5). No row cites an existing constraint, so
there is nothing in the code to re-read. The limit that the concurrency row relies on was still
confirmed where it is defined: `apps/server/src/modules/channels/public-chat.routes.ts:74`
`{ max: 5, key: byIp }` inside `limitStarts`.

## Observations (not findings)

- `apps/web/e2e/inbox.spec.ts` also starts public chat sessions. The whole suite passed locally
  because `inbox` and `web-chat` run minutes apart, and several files sit between them. The
  5/IP/min budget is shared across files, so if the runner speeds up a lot this could matter
  again. C3 is the proof that settles it on CI.
- On CI, `retries: 1` (`playwright.config.ts:9`) means that a failed web-chat test adds its own
  session starts. That only happens after a failure, so it cannot turn green into red.

## Gate

`pnpm exec playwright test` (CI Turnstile keys): 104 passed, 0 failed. `pnpm exec playwright test
e2e/web-chat.spec.ts` (no secret): 7 passed, 0 failed.
```
