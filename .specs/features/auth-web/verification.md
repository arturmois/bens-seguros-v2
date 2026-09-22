# Auth web verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 9f18e6d..e068875
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Verified at `e068875`. Real-tree baseline `git status --porcelain` = `?? .specs/features/staging/checks.md`
(created by the orchestrator, not part of this feature); identical after fault injection and after
every run.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-003-authentication.md` | yes - read in full | none - `better-auth` is imported only in `apps/web/src/lib/auth-client.ts:1-2` (rg over `apps/web/src` outside `src/api`); no `useSession` anywhere; user data comes from `/api/v1/me` (`apps/web/src/hooks/use-me.ts:6-8`). Note: the client is also used for sign-out (`apps/web/src/routes/_app.tsx:68`) and 2FA (`apps/web/src/routes/_app/settings/security.tsx:51,71,163`), wider than the ADR's literal "login, cadastro e reset"; the plan names it and no check says otherwise | - |
| `docs/decisions/ADR-008-deployment.md` | yes - read in full | none - "Playwright em `main`" matches `.github/workflows/ci.yml:81-82` | - (note: the GitHub job itself has never run; see C24) |
| `docs/architecture.md` §9 | yes - read §9 | none - `(auth)/*` + `_app.tsx` with `beforeLoad` + `ensureQueryData(/me)` (`apps/web/src/routes/_app.tsx:20-28`), RHF + Zod in `features/auth/schemas.ts`, search params validated with Zod. Note: §9 "mutations embrulhadas em `features/*/hooks`" is not followed for the Better Auth calls (inline in screens, e.g. `security.tsx:28,51-54`); they are not Orval mutations, so recorded as a note, not a contradiction | - |
| `.specs/STATE.md` | yes | none - AD-004 (Origin) respected: the e2e API context sends `origin` (`apps/web/e2e/support.ts:43`); CI e2e job reuses `APP_URL=http://localhost:3000` (`ci.yml:111`) | - |
| `CLAUDE.md` (Web rules, pt-BR) | yes | none in the checks. Code notes: `use-me.ts:6-9` wraps the generated `getMe`/`getGetMeQueryKey` in `useSuspenseQuery` instead of the generated `useGetMe` hook (letter of "dados via hooks gerados pelo Orval"); 4-state rule n/a (no listagem in this feature); every UI string read in the diff is pt-BR with correct accents (`Não`, `Verificação`, `Código`, `Aguarde…`, `Segurança`) | - |

## Checks

Proof run for C1-C22 (one invocation): `pnpm --filter @bens/web exec playwright test e2e/register.spec.ts e2e/login.spec.ts e2e/password-reset.spec.ts e2e/two-factor.spec.ts --reporter=list -g "<23 names>"` - 23 listed individually, 23 passed, exit 0, against `pnpm dev` + docker compose.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | register -> `/verify-email?email=` + text + e-mail in Mailpit | batch above, `registers and asks to confirm the e-mail` passed | `apps/web/e2e/register.spec.ts:13` - `toHaveURL(\`/verify-email?email=${encodeURIComponent(email)}\`)`; `:14` - `getByText(\`Enviamos um link de confirmação para ${email}.\`)`; `:17` - `.toEqual(['Confirme seu e-mail'])` | PASS |
| C2 | 3 field errors pt-BR, no sign-up request | batch, `validates the form before calling the api` passed | `apps/web/e2e/register.spec.ts:31-33` - `getByText('Informe seu nome.')`, `'Informe um e-mail válido.'`, `'A senha precisa ter pelo menos 8 caracteres.'`; `:34` - `expect(calls).toEqual([])` | PASS |
| C3 | resend ok + 429 message | batch, `resends the verification e-mail` passed | `apps/web/e2e/register.spec.ts:42` - `getByText('E-mail reenviado.')`; `:48-50` - `getByText('Muitas tentativas. Aguarde alguns minutos e tente de novo.')` | PASS |
| C4 | valid link -> `/dashboard` "Olá, <nome>"; invalid -> `/login` + message | batch, `the e-mail link signs in` and `an invalid e-mail link lands on login` passed | `apps/web/e2e/register.spec.ts:58-59` - `toHaveURL('/dashboard')`, `getByRole('heading', { name: \`Olá, ${NAME}\` })`; `:65-68` - `toHaveURL(/\/login\?error=/)`, `getByText('Link inválido ou expirado. Faça login para receber outro.')`. Note: the account comes from the API helper (`support.ts:82`, its own `callbackURL`), not from the `/register` screen | PASS |
| C5 | login -> `redirect` target, else `/dashboard` | batch, `signs in to the redirect target` passed | `apps/web/e2e/login.spec.ts:18` - `toHaveURL('/settings/security')`; `:22` - `toHaveURL('/dashboard')` | PASS |
| C6 | 3 bad `redirect` values -> `/dashboard` same origin | batch, `ignores an external redirect` passed; F1 and F2 killed | `apps/web/e2e/login.spec.ts:28-31` - loop over `['https://evil.example', '//evil.example', 'dashboard']`, `toHaveURL(\`${baseURL}/dashboard\`)` | PASS |
| C7 | wrong password message + e-mail kept | batch, `shows wrong credentials` passed | `apps/web/e2e/login.spec.ts:40` - `getByText('E-mail ou senha incorretos.')`; `:41` - `getByLabel('E-mail')).toHaveValue(user.email)` | PASS |
| C8 | unverified message + link to `/verify-email?email=` | batch, `asks to confirm the e-mail` passed | `apps/web/e2e/login.spec.ts:49` - `getByText('Confirme seu e-mail para entrar.')`; `:52` - `toHaveAttribute('href', \`/verify-email?email=${encodeURIComponent(user.email)}\`)` | PASS |
| C9 | 429 message at login | batch, `shows the rate limit message` passed | `apps/web/e2e/login.spec.ts:56-57` - `route.fulfill({ status: 429 ... })`; `:62` - `getByText(rateLimited)` | PASS |
| C10 | `/dashboard` signed out -> `/login?redirect=%2Fdashboard` and "Olá," **never** appears | batch, `guards app routes` passed | `apps/web/e2e/login.spec.ts:68` - `toHaveURL('/login?redirect=%2Fdashboard')` settles the redirect. `:69` - `getByText('Olá,')).toHaveCount(0)` is a single end-state sample taken after the URL already changed: a component-level guard that flashes the page and then redirects passes it too. "never" is not reached (precision gap) | PARTIAL |
| C11 | signed in, `/login` and `/register` -> `/dashboard` | batch, `sends a signed-in user away from auth pages` passed | `apps/web/e2e/login.spec.ts:78,80` - `toHaveURL('/dashboard')` after `goto('/login')` and `goto('/register')` | PASS |
| C12 | "Sair" -> `/login`; `/dashboard` again -> guard | batch, `signs out` passed | `apps/web/e2e/login.spec.ts:89` - `toHaveURL('/login')`; `:92` - `toHaveURL('/login?redirect=%2Fdashboard')`. The check's own claim holds, but `:91` is a full `page.goto`, which discards the in-memory QueryClient: AC 12's "limpar o cache do TanStack Query" (and Swept "data lifecycle: C12") is not proven - F3 survived | PASS |
| C13 | loading indicator; 500 -> error + "Tentar de novo" recovers | batch, `shows loading and error states for the account` passed | `apps/web/e2e/login.spec.ts:105` - `getByText('Carregando sua conta…')`; `:116` - `getByText('Não foi possível carregar sua conta.')`; `:121-122` - click `Tentar de novo`, `getByRole('heading', { name: \`Olá, ${NAME}\` })` | PASS |
| C14 | same message for known/unknown e-mail; mail only to known | batch, `requests a reset without revealing the account` passed | `apps/web/e2e/password-reset.spec.ts:15` - `getByText(sent)` per e-mail; `:18` - `emailLink(user.email, 'Redefina sua senha')`; `:19` - `expect(await inbox(stranger)).toEqual([])` | PASS |
| C15 | link -> `/reset-password?token=`; reset -> `/login` notice; new password works | batch, `resets the password from the e-mail link` passed | `apps/web/e2e/password-reset.spec.ts:30` - `toHaveURL(/\/reset-password\?token=/)`; `:35-36` - `toHaveURL('/login?reset=true')`, `getByText('Senha redefinida. Entre com a nova senha.')`; `:40` - heading `Olá, ${NAME}` | PASS |
| C16 | `?error=` and a bad token -> "Link inválido ou expirado." + link to `/forgot-password` | batch, `rejects an invalid reset link` passed | `apps/web/e2e/password-reset.spec.ts:45-49` - `getByText('Link inválido ou expirado.')`, `toHaveAttribute('href', '/forgot-password')`; `:55-56` - same text + link after submitting `token-invalido` | PASS |
| C17 | mismatch -> "As senhas não conferem." without request | batch, `checks the confirmation before calling the api` passed; F5 killed | `apps/web/e2e/password-reset.spec.ts:70` - `getByText('As senhas não conferem.')`; `:71` - `expect(calls).toEqual([])` | PASS |
| C18 | QR (`svg`), key, backup codes, 6-digit field | batch, `shows the qr code, the key and the backup codes` passed | `apps/web/e2e/two-factor.spec.ts:26` - `getByLabel('QR code do autenticador')).toBeVisible()` (the `svg` tag itself is not asserted); `:27` - `toHaveText(/^[A-Z2-7]+=*$/)`; `:28` - `locator('li')).not.toHaveCount(0)`; `:29` - `getByLabel('Código de 6 dígitos')` | PASS |
| C19 | correct TOTP -> "ativada" + `/me.twoFactorEnabled: true` | batch, `enables two-factor with a valid code` passed | `apps/web/e2e/two-factor.spec.ts:44` - `getByText('Verificação em duas etapas ativada.')`; `:45` - `expect(await twoFactorEnabled(page)).toBe(true)` | PASS |
| C20 | 2FA login -> `/two-factor`; wrong -> "Código inválido."; right -> `/dashboard` | batch, `asks for the code at sign-in` passed | `apps/web/e2e/two-factor.spec.ts:52` - `toHaveURL(/\/two-factor/)`; `:57` - `getByText('Código inválido.')`; `:61` - `toHaveURL('/dashboard')` | PASS |
| C21 | backup code -> `/dashboard` | batch, `accepts a backup code` passed | `apps/web/e2e/two-factor.spec.ts:70-74` - click `Usar código de backup`, fill `backupCodes[0]`, `toHaveURL('/dashboard')` | PASS |
| C22 | password + "Desativar" -> "desativada" + `/me` false | batch, `disables two-factor` passed | `apps/web/e2e/two-factor.spec.ts:88` - `getByText('Verificação em duas etapas desativada.')`; `:89` - `expect(await twoFactorEnabled(page)).toBe(false)` | PASS |
| C23 | `pnpm e2e` runs all of `apps/web/e2e`, exit 0 | `pnpm e2e` - 23 passed, exit 0 | `apps/web/playwright.config.ts:6` - `testDir: 'e2e'`; `package.json:17` - `"e2e": "pnpm --filter @bens/web e2e"` | PASS |
| C24 | CI e2e job only on push to `main`, built server + web, migrations, `pnpm e2e` | `python3 .specs/features/auth-web/ci-e2e-check.py` - `e2e job: ok`, exit 0. Also read the job and emulated it locally: `pnpm build`, `NODE_ENV=production node dist/server.js` + `vite preview --port 3000`, `pnpm e2e` - 23 passed | `.github/workflows/ci.yml:82` - `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`; `:139` - `prisma migrate deploy`; `:141` - `pnpm build`; `:149-150` - `node dist/server.js`, `preview --port 3000`; `:154` - `pnpm e2e`. The proof is structural; the GitHub job itself has not run yet (Handoff says so) | PASS |
| C25 | no `/api/auth` outside `lib/auth-client.ts`; `_app` uses `getGetMeQueryOptions` | `rg -n "/api/auth" apps/web/src --glob '!**/lib/auth-client.ts'` - no output (exit 1); `rg -n "getGetMeQueryOptions" apps/web/src/routes/_app.tsx` - 2 hits | `apps/web/src/routes/_app.tsx:22` - `await context.queryClient.ensureQueryData(getGetMeQueryOptions())` | PASS |

## Coverage

Recomputed from plan `Surface`/`Landing`/`Impact`/`Observable`/Criteria and from the code.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| rotas `(auth)` (6) | plan Surface; `apps/web/src/routes/(auth)/*.tsx` | `/login` C5 · `/register` C1 · `/verify-email` C3 · `/forgot-password` C14 · `/reset-password` C15 · `/two-factor` C20 | - |
| rotas `_app` (2) | plan Surface; `routes/_app/*` | `/dashboard` C10 · `/settings/security` C5, C18 | - |
| estados de `_app` (4) | `_app.tsx:20-33` | carregando C13 · erro C13 · sem sessão C10 · sucesso C5 | - |
| search params (8) | plan Surface + `validateSearch` in code | `/login` `redirect` C5 · `/login` `error` C4 · `/login` `reset` C15 (in code, missing from Surface) · `/verify-email` `email` C1, C3 · `/reset-password` `token` C15 · `/reset-password` `error` C16 · `/two-factor` `redirect` (in code `two-factor.tsx:14,41` and Landing 1b "com o mesmo `redirect`", Surface says "—") -> no proof | `/two-factor` `redirect` (Landing 1b: login preserves `redirect` through 2FA, `login.tsx:52`; `safeRedirect` on that path) |
| `safeRedirect` rejection rules (4) | `apps/web/src/lib/auth-client.ts:31` | absolute C6 · `//` C6 (F2 killed) · no leading slash C6 · `/\` -> no proof | `/\` prefix rule |
| `authErrorMessage` table (11 + fallback) | `apps/web/src/lib/auth-client.ts:10-26` | `429` C9, C3 · `INVALID_EMAIL_OR_PASSWORD` C7 · `EMAIL_NOT_VERIFIED` C8 · `INVALID_CODE` C20 · `INVALID_TOKEN`/`TOKEN_EXPIRED` -> C16 shows the static `InvalidLink` text (`reset-password.tsx:52-54,71`), not the mapped message | `INVALID_BACKUP_CODE` · `INVALID_PASSWORD` · `PASSWORD_TOO_SHORT` · `PASSWORD_TOO_LONG` · `ACCOUNT_TEMPORARILY_LOCKED` · fallback `Não foi possível concluir. Tente de novo.` |
| resultados em `/settings/security` (5) | `security.tsx:46-77,161-166` | ativar C18 · confirmar código C19 · desativar C22 · senha errada (ativar/desativar, Observable "ação destrutiva confirma - exige a senha") -> no proof · código de ativação errado -> no proof | senha errada · código de ativação errado |
| cláusulas de AC não carregadas pelas checks (3) | plan Criteria AC 1, 3, 12 | AC 1 `callbackURL: '/login'` from `/register` (`register.tsx:30`; C4 signs up through `support.ts:82` with its own `callbackURL`) · AC 3 resend `callbackURL` (`verify-email.tsx:26`) · AC 12 "limpar o cache do TanStack Query" (`_app.tsx:69`, F3 survived) | AC 1 `callbackURL` · AC 3 `callbackURL` · AC 12 cache clear |
| Impact / Observable decisions (2) | plan Impact "um `401` redireciona na hora"; Observable "botões ... desabilitados com 'Aguarde…'" | 401 not retried (`main.tsx:14-15`) -> F4 survived · "Aguarde…" -> no assertion in `apps/web/e2e` | 401 immediacy · submit loading state |
| mensagens de erro do login (3) | plan AC 7-9 | credenciais C7 · não confirmado C8 · `429` C9 | - |
| validação do cadastro (3) | AC 2; `schemas.ts:14-18` | senha curta · e-mail inválido · nome vazio - C2 | - |
| resultados do link de verificação (2) | AC 4 | válido C4 · inválido C4 | - |
| resultados do reset (3) | AC 15-17 | sucesso C15 · `error`/token inválido C16 · senhas diferentes C17 | - |
| resultados do 2FA no login (3) | AC 20-21 | TOTP correto C20 · TOTP errado C20 · backup válido C21 | - |
| startup config `E2E_BASE_URL` (2 assemblies) | `apps/web/playwright.config.ts:14`; `.github/workflows/ci.yml:147-154` (read directly) | dev default `http://localhost:3000` C23 · CI `vite preview --port 3000` C24 (structural + local emulation) | - |
| Landing doors (4) | plan Landing 1, 1b, 2, 3 | 1 client C25 (`auth-client.ts:6`) · 1b login handles `twoFactorRedirect` C20 (redirect preservation unproven, row above) · 2 guard C10, C25 · 3 e2e C23, C24 | - (1b's `redirect` counted in the search-param row) |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Screen behaviour (navigation, messages, states) | `routes/(auth)/*.tsx`, `routes/_app.tsx`, `routes/_app/*` | one e2e per decision, each message and each redirect asserted in the browser | no - redirect through `/two-factor` (`two-factor.tsx:41`), cache clear on sign-out (`_app.tsx:69`), wrong password on `/settings/security`, "Aguarde…" states, and C10's "never renders" have no discriminating e2e |
| Pure helper that decides (`safeRedirect`, `authErrorMessage`) | `apps/web/src/lib/auth-client.ts` | every row of its table asserted through the screen | no - `authErrorMessage` has 11 keyed rows + fallback, 4 asserted (the checks' evidence line says "≥ 4 codes", understating the table); `safeRedirect` `/\` rule unasserted |
| Generated client, shadcn primitives | `src/api/**`, `components/ui/*` | none of their own | yes - exercised by every screen proof |

## Faults injected

Isolated worktree at `scratchpad/wt-auth-web` (HEAD `e068875`), its Vite on :3000, main-tree server on :3001. Worktree removed; real-tree porcelain equal to baseline.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 `safeRedirect` returns any non-empty value | `apps/web/src/lib/auth-client.ts:31` | yes - C6 failed at `https://evil.example` (`chrome-error://chromewebdata/`) |
| F2 `safeRedirect` drops only the `//` rule (`startsWith('/')`) | `apps/web/src/lib/auth-client.ts:31` | yes - C6 failed at `//evil.example` (ended at `/evil.example`) |
| F3 sign-out no longer calls `queryClient.clear()` | `apps/web/src/routes/_app.tsx:69` | no - C12 `signs out` passed (full `page.goto` resets the cache anyway) |
| F4 retry predicate retries every error, 4xx included (`failures < 2`) | `apps/web/src/main.tsx:14-15` | no - C10, C11, C12 passed (`guards app routes` 0.2 s -> 3.6 s, still inside the 10 s expect timeout) |
| F5 reset confirmation refine always true | `apps/web/src/features/auth/schemas.ts:24` | yes - C17 failed (`As senhas não conferem.` not visible) |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` - exit 0: Biome checked 108 files, typecheck clean, 22 files / 130 tests passed, 0 failed, web and server built.
`pnpm e2e` - 23 passed, 0 failed (against `pnpm dev`), and 23 passed against the built server (`NODE_ENV=production`) + `vite preview`.

## Ranked gaps

1. Surviving mutant F3 - sign-out's cache clear is unproven; AC 12 clause dropped from C12 and Swept cites C12 for it - C12 - `apps/web/src/routes/_app.tsx:69`, proof `apps/web/e2e/login.spec.ts:91` (full reload)
2. Surviving mutant F4 - "401 redireciona na hora" (plan Impact) has no proof; retrying 401s passes every check - no check - `apps/web/src/main.tsx:14-15`
3. C10 "nunca aparece" asserted as an end-state sample only - C10 - `apps/web/e2e/login.spec.ts:69`
4. Landing 1b: `redirect` preserved through `/two-factor` unproven, and `/two-factor` `redirect` missing from Surface - no check - `apps/web/src/routes/(auth)/login.tsx:52`, `two-factor.tsx:41`
5. Test policy row "every row of its table": `authErrorMessage` 7 of 11 rows + fallback unasserted (backup code, wrong password on 2FA settings, lockout, length) - C7-C9/C16 - `apps/web/src/lib/auth-client.ts:14-26`
6. AC 1 `callbackURL: '/login'` from the `/register` screen unproven (C4 signs up through the API helper) - C1/C4 - `apps/web/src/routes/(auth)/register.tsx:30`
7. `/settings/security` wrong password / wrong enrollment code unproven (Observable "exige a senha") - C18/C22 - `apps/web/src/routes/_app/settings/security.tsx:52,72,164`
8. `safeRedirect` `/\` rule unproven - C6 - `apps/web/src/lib/auth-client.ts:31`
9. Observable "Aguarde…" submit state unasserted - no check - e.g. `apps/web/src/routes/(auth)/login.tsx:121`
10. Low: `useMe` wraps generated fetcher instead of a generated hook (CLAUDE.md Web rule, letter) - `apps/web/src/hooks/use-me.ts:6-9`; C18 does not assert the `svg` tag - `apps/web/e2e/two-factor.spec.ts:26`; C24 is structural until the first push to `main`
