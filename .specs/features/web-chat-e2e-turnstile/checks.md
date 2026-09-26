# Web chat e2e Turnstile checks

Profile: light
Plan: none - change under ~3 files, no one-way door (see Intent)

## Intent

The GitHub CI job `e2e` is red on `main` (runs 36213032124, 36214552561, 36215793650, 2026-09-26):
`apps/web/e2e/web-chat.spec.ts` "shows a human reply in under two seconds; reloads messages after
events resync" gets `403` instead of `201` from `POST /api/public/chat/:key/sessions`, on the first
try and on the retry. The test opens a "prior" session straight through the API with
`turnstileToken: ''`. CI sets `TURNSTILE_SECRET_KEY` to Cloudflare's always-pass test secret, so
`verifyTurnstile` (`apps/server/src/modules/channels/turnstile.ts`) calls the real siteverify, which
refuses an empty token; locally there is no secret and the check is skipped, so the test passes.
The browser path passes on CI because the widget (test site key) yields the dummy token.

Fixing the token exposes a second failure the 403 was hiding: the prior POST now succeeds, so the
file makes six `POST /sessions` from one IP within a minute, and the limit is 5/IP/min
(`public-chat.routes.ts`, `limitStarts`). "reconnects the visitor socket after reload" then gets
`429` (reproduced locally with the CI keys). The user chose (2026-09-26) to fold the duplicate
"sends a follow-up message in the thread" test into the start test, whose steps it repeated; the
start test's title gains that phrase, so the `-g` proof of `web-chat-ui` C10 keeps matching.

When this ships, every e2e request that the server gates with Turnstile sends Cloudflare's dummy
token `XXXX.DUMMY.TOKEN.XXXX` from one constant in `apps/web/e2e/support.ts`, the test passes with
and without a Turnstile secret, and the CI `e2e` job goes green. Application code does not change.

5 checks in 1 slice · 0 one-way doors · 0 open

Every command runs from `apps/web` against a running stack (docker compose + server on :3001 +
web on :3000), as in `apps/web/playwright.config.ts`.

## Checks

### S1 - the e2e sends a token the always-pass secret accepts · 2 files · ~17 KB · ~5k

**C1** - `apps/web/e2e/support.ts` exports one constant `TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'`; `signUp` and the direct `POST /api/public/chat/:key/sessions` in `web-chat.spec.ts` both use it, and no e2e file sends `turnstileToken: ''`
Proof: `grep -rn "turnstileToken: ''" e2e/` prints nothing, and `grep -rn "TURNSTILE_TEST_TOKEN" e2e/` matches the export, `signUp` and `web-chat.spec.ts`

**C2** - With the server started as on CI (`SIGNUP_MODE=self_serve`, `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`, `TURNSTILE_SITE_KEY=1x00000000000000000000AA`), the test passes, and with the old `''` token it fails with `403` (the reproduction)
Proof: `pnpm exec playwright test e2e/web-chat.spec.ts -g "shows a human reply"` exits 0 against that server
Proof: the same command with `''` restored reports `Expected: 201` / `Received: 403`

**C4** - `web-chat.spec.ts` has no test of its own titled "sends a follow-up message in the thread"; the start test's title ends with "; sends a follow-up message in the thread" and its body fills `FOLLOW_UP`, clicks `Enviar` and asserts the message is visible, so `-g "sends a follow-up message in the thread"` selects exactly one test
Proof: `pnpm exec playwright test e2e/web-chat.spec.ts -g "sends a follow-up message in the thread" --list` prints `Total: 1 test`

**C5** - With the server started as in C2, the whole `web-chat.spec.ts` passes, "reconnects the visitor socket after reload" included (no `429`), and the whole e2e suite passes
Proof: `pnpm exec playwright test e2e/web-chat.spec.ts` exits 0 with 7 passed
Proof: `pnpm exec playwright test` exits 0
Proof: with the server restarted without `TURNSTILE_SECRET_KEY` (local default, `turnstileSiteKey: null`), `pnpm exec playwright test e2e/web-chat.spec.ts` exits 0 with 7 passed

**C3** - The GitHub CI `e2e` job passes on the pushed commit
Proof: `gh run list --workflow CI --limit 1 --json conclusion` shows `success` after the push (needs the user's go-ahead to push)

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| e2e requests gated by Turnstile (2) | sign-up header C1 · public chat session POST C1, C2 | - |
| `POST /sessions` statuses the file must avoid (2) | 403 C2 · 429 C5 | - |
| Turnstile config of the server (2) | secret set, as on CI C2, C3 · no secret, local default C5 | - |

- Only C3 runs off this machine.

## Swept

- validation: n/a - no input schema changes
- failure modes: C2 (the 403 reproduced and gone)
- idempotency: n/a - test data only
- authorization: n/a - the Turnstile gate itself is unchanged
- concurrency: C5 (the per-IP start limit across the sequential tests of one file)
- data lifecycle: n/a - no data changes
- dependency failure: n/a - siteverify behaviour unchanged; fails closed as before
- state transitions: n/a - none
- observability: n/a - no log changes

## Handoff

- S1 ≈ 5k, one builder.
