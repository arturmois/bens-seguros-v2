# Auth web verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 9f18e6d..a3ce0fa (fix range e068875..a3ce0fa)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 1 (at `e068875`) was FAIL: F3 and F4 survived, C10 PARTIAL, 21 coverage members unproven, 2
Test policy rows unmet. The fix commit `a3ce0fa` changes `apps/web/src/lib/auth-client.ts`
(`authErrorMessage` map trimmed to the 6 codes a screen can receive), `apps/web/src/hooks/use-me.ts`
(generated `useGetMe()`), 3 e2e specs, `checks.md` (S6, C26-C34) and a `plan.md` Surface row.

All proofs re-run in full at `a3ce0fa`. Real-tree baseline `git status --porcelain` =
`?? .specs/features/staging/checks.md` (the orchestrator's file); the same after fault injection, the
probe and every run.

## Binding sources

Carried from `e068875` (the fix touched no binding source and no screen's interface). Re-checked at
`a3ce0fa` for the rows the fix touched: the CLAUDE.md Web rule and the plan's Surface.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-003-authentication.md` | yes - carried from e068875 | none - `better-auth` imported only in `apps/web/src/lib/auth-client.ts:1-2`; user data from `/api/v1/me` | - |
| `docs/decisions/ADR-008-deployment.md` | yes - carried from e068875 | none - Playwright on `main` at `.github/workflows/ci.yml:81-82` | - |
| `docs/architecture.md` §9 | yes - carried from e068875 | none - `_app` `beforeLoad` + `ensureQueryData(/me)` at `apps/web/src/routes/_app.tsx:20-28`; RHF + Zod in `features/auth/schemas.ts` | - |
| `.specs/STATE.md` | yes - carried from e068875 | none - AD-004 Origin respected (`apps/web/e2e/support.ts:43`) | - |
| `CLAUDE.md` (Web rules, pt-BR) | yes - verified at a3ce0fa | none - `useMe` now reads the generated hook (`apps/web/src/hooks/use-me.ts:6` - `const { data } = useGetMe()`); every new UI/e2e string is pt-BR with correct accents; 4-state rule n/a (no listagem) | - |
| plan Surface (`/two-factor` row added) | yes - verified at a3ce0fa | none - Surface now names search `redirect?`, matching `apps/web/src/routes/(auth)/two-factor.tsx:14` | - |

## Checks

Verified at `a3ce0fa`. Proof run for C1-C22 and C26-C33 (one invocation): `pnpm --filter @bens/web exec playwright test e2e/register.spec.ts e2e/login.spec.ts e2e/password-reset.spec.ts e2e/two-factor.spec.ts --reporter=list -g "<29 names>"` - 29 listed individually, 29 passed, exit 0, against `pnpm dev` + docker compose.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | register -> `/verify-email?email=` + text + e-mail in Mailpit | batch, `registers and asks to confirm the e-mail` passed | `apps/web/e2e/register.spec.ts:16` - `getByText(\`Enviamos um link de confirmação para ${email}.\`)`; `:19` - `.toEqual(['Confirme seu e-mail'])` | PASS |
| C2 | 3 field errors pt-BR, no sign-up request | batch, `validates the form before calling the api` passed | `apps/web/e2e/register.spec.ts:33-35` - `'Informe seu nome.'`, `'Informe um e-mail válido.'`, `'A senha precisa ter pelo menos 8 caracteres.'`; `:36` - `expect(calls).toEqual([])` | PASS |
| C3 | resend ok + 429 message | batch, `resends the verification e-mail` passed | `apps/web/e2e/register.spec.ts:46` - `getByText('E-mail reenviado.')`; `:53` - `getByText('Muitas tentativas. Aguarde alguns minutos e tente de novo.')` | PASS |
| C4 | valid link -> `/dashboard` "Olá, <nome>"; invalid -> `/login` + message | batch, `the e-mail link signs in` and `an invalid e-mail link lands on login` passed | `apps/web/e2e/register.spec.ts:78` - `getByRole('heading', { name: \`Olá, ${NAME}\` })`; `:86` - `getByText('Link inválido ou expirado. Faça login para receber outro.')` | PASS |
| C5 | login -> `redirect` target, else `/dashboard` | batch, `signs in to the redirect target` passed | `apps/web/e2e/login.spec.ts:18` - `toHaveURL('/settings/security')`; `:22` - `toHaveURL('/dashboard')` | PASS |
| C6 | bad `redirect` values -> `/dashboard` same origin | batch, `ignores an external redirect` passed; round-1 F1, F2 killed (carried) | `apps/web/e2e/login.spec.ts:28-36` - loop over `'https://evil.example'`, `'//evil.example'`, `'dashboard'`, `'/\\evil.example'`, `toHaveURL(\`${baseURL}/dashboard\`)` | PASS |
| C7 | wrong password message + e-mail kept | batch, `shows wrong credentials` passed | `apps/web/e2e/login.spec.ts:45` - `getByText('E-mail ou senha incorretos.')`; `:46` - `toHaveValue(user.email)` | PASS |
| C8 | unverified message + link to `/verify-email?email=` | batch, `asks to confirm the e-mail` passed | `apps/web/e2e/login.spec.ts:54` - `getByText('Confirme seu e-mail para entrar.')`; `:57` - `toHaveAttribute('href', \`/verify-email?email=${encodeURIComponent(user.email)}\`)` | PASS |
| C9 | 429 message at login | batch, `shows the rate limit message` passed | `apps/web/e2e/login.spec.ts:67` - `getByText(rateLimited)` | PASS |
| C10 | signed out `/dashboard` -> `/login?redirect=%2Fdashboard`, "Olá," never appears | batch, `guards app routes` passed; "never" settled by C27's proof | `apps/web/e2e/login.spec.ts:73` - `toHaveURL('/login?redirect=%2Fdashboard')`; `:134` - `expect(await page.evaluate(() => Reflect.get(window, '__seen').greeting)).toBe(false)` (MutationObserver from `addInitScript`, `:116-121`). Round-1 PARTIAL re-judged: the claim is now proven, although C10's own named proof (`:74`) still samples only the end state | PASS |
| C11 | signed in, `/login` and `/register` -> `/dashboard` | batch, `sends a signed-in user away from auth pages` passed | `apps/web/e2e/login.spec.ts:83,85` - `toHaveURL('/dashboard')` | PASS |
| C12 | "Sair" -> `/login`; `/dashboard` again -> guard | batch, `signs out` passed | `apps/web/e2e/login.spec.ts:94` - `toHaveURL('/login')`; `:97` - `toHaveURL('/login?redirect=%2Fdashboard')` | PASS |
| C13 | loading indicator; 500 -> error + "Tentar de novo" recovers | batch, `shows loading and error states for the account` passed | `apps/web/e2e/login.spec.ts:181` - `getByText('Carregando sua conta…')`; `:186` - `getByText('Não foi possível carregar sua conta.')`; `:191-192` - click `Tentar de novo`, heading `Olá, ${NAME}` | PASS |
| C14 | same message for known/unknown e-mail; mail only to known | batch, `requests a reset without revealing the account` passed | `apps/web/e2e/password-reset.spec.ts:15` - `getByText(sent)`; `:19` - `expect(await inbox(stranger)).toEqual([])` | PASS |
| C15 | reset link -> new password -> `/login` notice -> sign-in works | batch, `resets the password from the e-mail link` passed | `apps/web/e2e/password-reset.spec.ts:35-36` - `toHaveURL('/login?reset=true')`, `getByText('Senha redefinida. Entre com a nova senha.')`; `:40` - heading `Olá, ${NAME}` | PASS |
| C16 | `?error=` and a bad token -> invalid-link text + link to `/forgot-password` | batch, `rejects an invalid reset link` passed | `apps/web/e2e/password-reset.spec.ts:45-49` - `getByText('Link inválido ou expirado.')`, `toHaveAttribute('href', '/forgot-password')`; `:55-56` | PASS |
| C17 | mismatch -> "As senhas não conferem." without request | batch, `checks the confirmation before calling the api` passed; round-1 F5 killed (carried) | `apps/web/e2e/password-reset.spec.ts:70` - `getByText('As senhas não conferem.')`; `:71` - `expect(calls).toEqual([])` | PASS |
| C18 | QR, key, backup codes, 6-digit field | batch, `shows the qr code, the key and the backup codes` passed | `apps/web/e2e/two-factor.spec.ts:29` - `toHaveText(/^[A-Z2-7]+=*$/)`; `:30` - `locator('li')).not.toHaveCount(0)`; `:31` - `getByLabel('Código de 6 dígitos')` | PASS |
| C19 | correct TOTP -> "ativada" + `/me` true | batch, `enables two-factor with a valid code` passed | `apps/web/e2e/two-factor.spec.ts:46` - `getByText('Verificação em duas etapas ativada.')`; `:47` - `expect(await twoFactorEnabled(page)).toBe(true)` | PASS |
| C20 | 2FA login -> `/two-factor`; wrong -> "Código inválido."; right -> `/dashboard` | batch, `asks for the code at sign-in` passed | `apps/web/e2e/two-factor.spec.ts:54` - `toHaveURL(/\/two-factor/)`; `:59` - `getByText('Código inválido.')`; `:63` - `toHaveURL('/dashboard')` | PASS |
| C21 | backup code -> `/dashboard` | batch, `accepts a backup code` passed | `apps/web/e2e/two-factor.spec.ts:76` - `toHaveURL('/dashboard')` after filling `backupCodes[0]` | PASS |
| C22 | password + "Desativar" -> "desativada" + `/me` false | batch, `disables two-factor` passed | `apps/web/e2e/two-factor.spec.ts:90` - `getByText('Verificação em duas etapas desativada.')`; `:91` - `expect(await twoFactorEnabled(page)).toBe(false)` | PASS |
| C23 | `pnpm e2e` runs all of `apps/web/e2e`, exit 0 | `pnpm e2e` - 29 passed, exit 0 | `apps/web/playwright.config.ts:6` - `testDir: 'e2e'`; `package.json:17` - `"e2e": "pnpm --filter @bens/web e2e"` | PASS |
| C24 | CI e2e job on push to `main`, built apps, migrations, `pnpm e2e` | `python3 .specs/features/auth-web/ci-e2e-check.py` - `e2e job: ok`, exit 0 (workflow unchanged since round 1, whose local emulation with the built server + `vite preview` passed 23/23; carried from e068875) | `.github/workflows/ci.yml:82` - `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`; `:139` `prisma migrate deploy`; `:149-150` `node dist/server.js`, `preview --port 3000`; `:154` `pnpm e2e` | PASS |
| C25 | no `/api/auth` outside `lib/auth-client.ts`; `_app` uses `getGetMeQueryOptions` | `rg -n "/api/auth" apps/web/src --glob '!**/lib/auth-client.ts'` - no output (exit 1); `rg -n "getGetMeQueryOptions" apps/web/src/routes/_app.tsx` - 2 hits | `apps/web/src/routes/_app.tsx:22` - `await context.queryClient.ensureQueryData(getGetMeQueryOptions())` | PASS |
| C26 | after "Sair", history back to `/dashboard` (no reload) -> `/login?redirect=%2Fdashboard`, no "Olá," | batch, `sign-out clears the cached account` passed; F3 killed | `apps/web/e2e/login.spec.ts:109` - `page.goBack()`; `:111` - `toHaveURL('/login?redirect=%2Fdashboard')`; `:112` - `getByText('Olá,')).toHaveCount(0)` | PASS |
| C27 | signed-out `/dashboard`: exactly 2 `/me` requests; "Olá," never in the document | batch, `redirects on the first 401 without rendering the page` passed; F4 killed | `apps/web/e2e/login.spec.ts:133` - `expect(meRequests).toHaveLength(2)`; `:134` - `...__seen').greeting)).toBe(false)` | PASS |
| C28 | 2FA login with `redirect=/settings/security` ends there | batch, `keeps the redirect through the second factor` passed; F7 killed | `apps/web/e2e/two-factor.spec.ts:100` - `toHaveURL(/\/two-factor/)`; `:105` - `toHaveURL('/settings/security')` | PASS |
| C29 | every `authErrorMessage` row on a screen | batch, `shows each two-factor error` and `shows a generic message for an unknown error` passed; F6 killed | `apps/web/e2e/two-factor.spec.ts:116` - wrong backup code `getByText('Código inválido.')`; `:127` - mocked `ACCOUNT_TEMPORARILY_LOCKED` -> `'Muitas tentativas. Aguarde alguns minutos e tente de novo.'`; `:138-139` - disable with wrong password `'Senha incorreta.'`, `/me` still `true`; `:149` - enable with wrong password `'Senha incorreta.'`; `:157-158` - wrong enrollment code `'Código inválido.'`, `/me` `false`; `apps/web/e2e/register.spec.ts:68` - mocked `500` -> `'Não foi possível concluir. Tente de novo.'` | PASS |
| C30 | sign-up and resend send `callbackURL: '/login'` | batch, `registers and asks to confirm the e-mail` and `resends the verification e-mail` passed | `apps/web/e2e/register.spec.ts:14` - `expect((await signUp).postDataJSON()).toMatchObject({ email, callbackURL: '/login' })`; `:45` - same for `resend` | PASS |
| C31 | `redirect=/\evil.example` -> `/dashboard` same origin | batch, `ignores an external redirect` passed | `apps/web/e2e/login.spec.ts:32,36` - `'/\\evil.example'` in the loop, `toHaveURL(\`${baseURL}/dashboard\`)` | PASS |
| C32 | during sign-in the button reads "Aguarde…" and is disabled | batch, `disables the button while signing in` passed; F8 killed | `apps/web/e2e/login.spec.ts:156` - `expect(waiting).toBeVisible()`; `:157` - `expect(waiting).toBeDisabled()` | PASS |
| C33 | the QR code is an `svg` | batch, `shows the qr code, the key and the backup codes` passed | `apps/web/e2e/two-factor.spec.ts:28` - `expect(await qrCode.evaluate((element) => element.tagName.toLowerCase())).toBe('svg')` | PASS |
| C34 | `useMe` uses the generated `useGetMe` | `rg -n "useGetMe\(\)" apps/web/src/hooks/use-me.ts` - 1 hit; the checks.md `rg` for `useSuspenseQuery` or `queryFn` in `apps/web/src/hooks/use-me.ts` - no output (exit 1) | `apps/web/src/hooks/use-me.ts:6` - `const { data } = useGetMe()` | PASS |

## Coverage

Verified at `a3ce0fa` for every row whose authority the fix touched (the `authErrorMessage` map, the
`redirect` rules, the `/two-factor` Surface row, AC 1/3/12 clauses, Impact/Observable rows, the
`/settings/security` results, Landing 1b). The other rows are carried from `e068875`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| rotas `(auth)` (6) | plan Surface; `routes/(auth)/*.tsx` - carried from e068875 | `/login` C5 · `/register` C1 · `/verify-email` C3 · `/forgot-password` C14 · `/reset-password` C15 · `/two-factor` C20 | - |
| rotas `_app` (2) | plan Surface - carried from e068875 | `/dashboard` C10 · `/settings/security` C5, C18 | - |
| estados de `_app` (4) | `_app.tsx:20-33` - verified at a3ce0fa | carregando C13 · erro C13 · sem sessão C10, C27 · sucesso C5 | - |
| search params (8) | plan Surface + `validateSearch` in code - verified at a3ce0fa | `/login` `redirect` C5 · `/login` `error` C4 · `/login` `reset` C15 · `/verify-email` `email` C1, C3 · `/reset-password` `token` C15 · `/reset-password` `error` C16 · `/two-factor` `redirect` C28 (now in Surface) | - |
| `safeRedirect` rejection rules (4) | `apps/web/src/lib/auth-client.ts:29` - verified at a3ce0fa | absolute C6 · `//` C6 · no leading slash C6 · `/\` C31 | - |
| `authErrorMessage` table (6 codes + `429` + fallback = 8) | `apps/web/src/lib/auth-client.ts:12-24` - verified at a3ce0fa | `429` C9, C3 · `INVALID_EMAIL_OR_PASSWORD` C7 · `EMAIL_NOT_VERIFIED` C8 · `INVALID_CODE` C20, C29 · `INVALID_BACKUP_CODE` C29 (F6 killed) · `INVALID_PASSWORD` C29 · `ACCOUNT_TEMPORARILY_LOCKED` C29 · fallback C29 | - |
| resultados em `/settings/security` (5) | `security.tsx:46-77,161-166` - verified at a3ce0fa | ativar C18 · confirmar C19 · desativar C22 · senha errada (ativar e desativar) C29 · código de ativação errado C29 | - |
| efeitos do "Sair" (3) | `_app.tsx:67-71` - verified at a3ce0fa | `sign-out` C12 · cache limpo C26 (F3 killed) · navega para `/login` C12 | - |
| `callbackURL` enviados (2) | `register.tsx:30`, `verify-email.tsx:26` - verified at a3ce0fa | cadastro C30 · reenviar C30 | - |
| Impact / Observable decisions (2) | plan Impact, Observable - verified at a3ce0fa | 401 not retried C27 (F4 killed) · "Aguarde…" + disabled C32 (F8 killed) | - |
| mensagens de erro do login (3) | AC 7-9 - carried from e068875 | credenciais C7 · não confirmado C8 · `429` C9 | - |
| validação do cadastro (3) | AC 2 - carried from e068875 | senha curta · e-mail inválido · nome vazio - C2 | - |
| resultados do link de verificação (2) | AC 4 - carried from e068875 | válido C4 · inválido C4 | - |
| resultados do reset (3) | AC 15-17 - carried from e068875 | sucesso C15 · `error`/token inválido C16 · senhas diferentes C17 | - |
| resultados do 2FA no login (3) | AC 20-21 - carried from e068875 | TOTP correto C20 · TOTP errado C20 · backup válido C21 | - |
| startup config `E2E_BASE_URL` (2 assemblies) | `playwright.config.ts:14`; `ci.yml:147-154` read directly - carried from e068875 | dev default C23 · CI C24 | - |
| Landing doors (4) | plan Landing 1, 1b, 2, 3 - verified at a3ce0fa | 1 client C25 · 1b 2FA redirect C20, C28 (F7 killed) · 2 guard C10, C25, C27 · 3 e2e C23, C24 | - |

## Test policy rows

Verified at `a3ce0fa` (both round-1 unmet rows re-judged).

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Screen behaviour (navigation, messages, states) | `routes/(auth)/*.tsx`, `routes/_app.tsx`, `routes/_app/*` | one e2e per decision, each message and each redirect asserted in the browser | yes - the round-1 gaps now have e2e: 2FA redirect C28, sign-out cache C26, never-renders C27, security failures C29, "Aguarde…" C32 |
| Pure helper that decides (`safeRedirect`, `authErrorMessage`) | `apps/web/src/lib/auth-client.ts` | every row of its table asserted through the screen | yes - all 8 `authErrorMessage` rows (C7, C8, C9, C20, C29) and all 3 `safeRedirect` rejection rules (C6, C31) |
| Generated client, shadcn primitives | `src/api/**`, `components/ui/*` | none of their own | yes - exercised by every screen proof; carried from e068875 |

## Faults injected

Verified at `a3ce0fa`. Isolated worktree `scratchpad/wt-auth-web-r2` (HEAD `a3ce0fa`), its Vite on :3000 with the main-tree server on :3001. Worktree removed; real-tree porcelain equal to baseline. Round-1 F1, F2, F5 (killed) are carried from `e068875`; the code they mutate is unchanged apart from a line shift in `auth-client.ts`.

| Mutation | Location | Killed |
| --- | --- | --- |
| F3 (re-injected) sign-out no longer calls `queryClient.clear()` | `apps/web/src/routes/_app.tsx:69` | yes - C26 failed: `Expected "/login?redirect=%2Fdashboard"`, `Received "/dashboard"` |
| F4 (re-injected) retry predicate retries every error incl. 4xx (`failures < 2`) | `apps/web/src/main.tsx:14-15` | yes - C27 failed: `Expected length: 2`, `Received length: 6` |
| F6 `INVALID_BACKUP_CODE` row deleted from the map | `apps/web/src/lib/auth-client.ts:16` | yes - C29 failed (`Código inválido.` not visible after the wrong backup code) |
| F7 login navigates to `/two-factor` without the `redirect` search | `apps/web/src/routes/(auth)/login.tsx:52` | yes - C28 failed: `Expected "/settings/security"`, `Received "/dashboard"` |
| F8 login submit button no longer `disabled={isSubmitting}` | `apps/web/src/routes/(auth)/login.tsx:120` | yes - C32 failed: `toBeDisabled()` received `enabled` |

## Gate

Verified at `a3ce0fa`.
`pnpm lint && pnpm typecheck && pnpm test && pnpm build` - exit 0: Biome checked 108 files, typecheck clean, 22 files / 130 tests passed, 0 failed, web and server built.
`pnpm e2e` - 29 passed, 0 failed.

## Notes (not failing)

- C10's named proof (`apps/web/e2e/login.spec.ts:74`) is still an end-state sample; "never" is carried by C27 (`:134`). Adding C27 as a second `Proof:` line of C10 would make that explicit in `checks.md`.
- C27 pins exactly 2 `/me` requests, which couples it to the `/login` guard also fetching `/me` (`features/auth/guards.ts:8`). This is correct today, but any change to that guard will break C27 without a real regression.
- `useMe` now throws when the cache is empty (`apps/web/src/hooks/use-me.ts:7`). I checked that sign-out's `queryClient.clear()` does not flash the `_app` error screen with a scratch MutationObserver probe (outside the repo, 3 of 3 runs clean).
- C24 remains a structural proof until the first push to `main`.
- The `/\` rule (C31) was not mutated this round. The assertion is direct, and the fault budget went to surfaces that had not been tested before.
