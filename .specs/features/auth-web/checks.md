# Auth web checks

Profile: standard
Plan: `.specs/features/auth-web/plan.md`

25 checks in 5 slices · 3 one-way doors · 0 open

Proof command prefix, omitted below: `pnpm --filter @bens/web exec playwright test`. The e2e runs
against `E2E_BASE_URL` (default `http://localhost:3000`, `pnpm dev`) with the docker compose
Postgres and Mailpit up; e-mails are read through the Mailpit API.

## Checks

### S1 - Cadastro e verificação · ~8 files · ~40 KB · ~10k

**C1** - Enviar `/register` com dados válidos leva a `/verify-email?email=<e-mail>` com o texto "Enviamos um link de confirmação para <e-mail>", e o e-mail de verificação chega ao Mailpit (AC 1)
Proof: `e2e/register.spec.ts -g "registers and asks to confirm the e-mail"`

**C2** - `/register` com senha de 7 caracteres, e-mail inválido e nome vazio mostra o erro pt-BR de cada campo e não faz request a `/api/auth/sign-up/email` (AC 2)
Proof: `e2e/register.spec.ts -g "validates the form before calling the api"`

**C3** - "Reenviar e-mail" mostra "E-mail reenviado."; com a API respondendo `429`, mostra "Muitas tentativas. Aguarde alguns minutos e tente de novo." (AC 3)
Proof: `e2e/register.spec.ts -g "resends the verification e-mail"`

**C4** - Abrir o link do e-mail termina em `/dashboard` com "Olá, <nome>"; um link com token inválido termina em `/login` com "Link inválido ou expirado. Faça login para receber outro." (AC 4)
Proof: `e2e/register.spec.ts -g "the e-mail link signs in"`
Proof: `e2e/register.spec.ts -g "an invalid e-mail link lands on login"`

### S2 - Login, logout e guard · ~8 files · ~40 KB · ~10k

**C5** - Login correto vai para o `redirect` do search (`/settings/security`) e, sem `redirect`, para `/dashboard` (AC 5)
Proof: `e2e/login.spec.ts -g "signs in to the redirect target"`

**C6** - Com `redirect` = `https://evil.example`, `//evil.example` e `dashboard` (sem barra), o login termina em `/dashboard` na mesma origem (AC 6)
Proof: `e2e/login.spec.ts -g "ignores an external redirect"`

**C7** - Senha errada mostra "E-mail ou senha incorretos." e mantém o e-mail no campo (AC 7)
Proof: `e2e/login.spec.ts -g "shows wrong credentials"`

**C8** - Login de e-mail não confirmado mostra "Confirme seu e-mail para entrar." com link para `/verify-email?email=<e-mail>` (AC 8)
Proof: `e2e/login.spec.ts -g "asks to confirm the e-mail"`

**C9** - Login com a API respondendo `429` mostra "Muitas tentativas. Aguarde alguns minutos e tente de novo." (AC 9)
Proof: `e2e/login.spec.ts -g "shows the rate limit message"`

**C10** - `/dashboard` sem sessão termina em `/login?redirect=%2Fdashboard` e o texto "Olá," nunca aparece (AC 10)
Proof: `e2e/login.spec.ts -g "guards app routes"`

**C11** - Logado, `/login` e `/register` redirecionam para `/dashboard` (AC 11)
Proof: `e2e/login.spec.ts -g "sends a signed-in user away from auth pages"`

**C12** - "Sair" termina em `/login`, e abrir `/dashboard` em seguida volta a `/login?redirect=%2Fdashboard` (AC 12)
Proof: `e2e/login.spec.ts -g "signs out"`

**C13** - Com o `/me` atrasado, `_app` mostra o indicador de carregamento; com o `/me` respondendo `500`, mostra "Não foi possível carregar sua conta." e "Tentar de novo", que recarrega e mostra a página quando o `/me` volta a `200` (AC 13)
Proof: `e2e/login.spec.ts -g "shows loading and error states for the account"`

### S3 - Recuperação de senha · ~5 files · ~25 KB · ~6k

**C14** - `/forgot-password` mostra "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." para e-mail cadastrado e para não cadastrado, e o e-mail de reset chega só para o cadastrado (AC 14)
Proof: `e2e/password-reset.spec.ts -g "requests a reset without revealing the account"`

**C15** - O link do e-mail abre `/reset-password?token=…`; nova senha + confirmação iguais levam a `/login` com "Senha redefinida. Entre com a nova senha.", e o login com a senha nova chega a `/dashboard` (AC 15)
Proof: `e2e/password-reset.spec.ts -g "resets the password from the e-mail link"`

**C16** - `/reset-password?error=INVALID_TOKEN` e um token inválido enviado mostram "Link inválido ou expirado." com link para `/forgot-password` (AC 16)
Proof: `e2e/password-reset.spec.ts -g "rejects an invalid reset link"`

**C17** - Senha e confirmação diferentes mostram "As senhas não conferem." sem request a `/api/auth/reset-password` (AC 17)
Proof: `e2e/password-reset.spec.ts -g "checks the confirmation before calling the api"`

### S4 - 2FA · ~6 files · ~30 KB · ~8k

**C18** - Em `/settings/security`, senha + "Ativar verificação em duas etapas" mostram um QR code (`svg`), a chave em texto e os códigos de backup, e pedem um código de 6 dígitos (AC 18)
Proof: `e2e/two-factor.spec.ts -g "shows the qr code, the key and the backup codes"`

**C19** - O código TOTP correto mostra "Verificação em duas etapas ativada." e o `/api/v1/me` passa a `twoFactorEnabled: true` (AC 19)
Proof: `e2e/two-factor.spec.ts -g "enables two-factor with a valid code"`

**C20** - Login de usuário com 2FA vai a `/two-factor`; código errado mostra "Código inválido."; código correto leva a `/dashboard` (AC 20)
Proof: `e2e/two-factor.spec.ts -g "asks for the code at sign-in"`

**C21** - "Usar código de backup" + um código de backup válido leva a `/dashboard` (AC 21)
Proof: `e2e/two-factor.spec.ts -g "accepts a backup code"`

**C22** - Senha + "Desativar" mostram "Verificação em duas etapas desativada." e o `/api/v1/me` volta a `twoFactorEnabled: false` (AC 22)
Proof: `e2e/two-factor.spec.ts -g "disables two-factor"`

### S5 - E2E no pipeline · ~4 files · ~10 KB · ~3k

**C23** - `pnpm e2e` (raiz) roda todos os arquivos de `apps/web/e2e` e termina com código 0 com `pnpm dev` e o docker compose no ar (AC 23)
Proof: `pnpm e2e`

**C24** - O workflow de CI tem um job de e2e que roda só em `push` para `main`, sobe o server e o web buildados, aplica as migrations e executa `pnpm e2e` (AC 24)
Proof: `python3 .specs/features/auth-web/ci-e2e-check.py`

**C25** - O web não chama `/api/auth/*` fora de `lib/auth-client.ts` e o `_app` usa o hook gerado de `getMe` (Landing doors 1 e 2)
Proof: `rg -n "/api/auth" apps/web/src --glob '!**/lib/auth-client.ts'` sem saída e `rg -n "getGetMeQueryOptions" apps/web/src/routes/_app.tsx` com saída

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| rotas `(auth)` (6) | `/login` C5 · `/register` C1 · `/verify-email` C3 · `/forgot-password` C14 · `/reset-password` C15 · `/two-factor` C20 | - |
| rotas `_app` (2) | `/dashboard` C10 · `/settings/security` C18 | - |
| estados de `_app` (4) | carregando C13 · erro C13 · sem sessão C10 · sucesso C5 | - |
| mensagens de erro do login (3) | credenciais C7 · e-mail não confirmado C8 · `429` C9 | - |
| `redirect` inválido (3) | absoluto C6 · `//` C6 · sem barra C6 | - |
| validação do cadastro (3) | senha curta C2 · e-mail inválido C2 · nome vazio C2 | - |
| resultados do link de verificação (2) | válido C4 · inválido C4 | - |
| resultados do reset (3) | sucesso C15 · link com `error` C16 · senhas diferentes C17 | - |
| resultados do 2FA no login (3) | TOTP correto C20 · TOTP errado C20 · código de backup C21 | - |
| startup config: `E2E_BASE_URL` (2 assemblies) | dev `http://localhost:3000` C23 · CI C24 | - |
| Landing doors (3) | 1 client C25 · 2 guard C10, C25 · 3 e2e C23, C24 | - |

- Claims naming a route or a message: every proof drives a real browser against the real server
- No other check claims more than the single case its proof exercises

## Test policy

`CLAUDE.md` covers server rules and endpoints; it says nothing about what proves web behaviour.
These rows are the bar for this build.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Screen behaviour (navigation, messages, states) | one e2e per decision | each message and each redirect asserted in the browser |
| Pure helper that decides (`safeRedirect`, `authErrorMessage`) | reached through the screen that uses it | every row of its table asserted through the screen (C6, C7–C9) |
| Generated client, shadcn primitives | none of their own | covered by the screens |

Evidence:

- `lib/auth-client.ts` `authErrorMessage`: maps ≥ 4 codes (credenciais, não confirmado, `429`, token inválido) + fallback -> decides, reached through C7, C8, C9, C16
- `safeRedirect`: 3 rejection rules -> decides, reached through C6
- the web has no unit test runner; adding one for two helpers is complexity the e2e already covers

Cost: 25 e2e cases. Without these rows, the redirect sanitizer would be proven by one happy path.

## Swept

- validation: C2, C17
- failure modes: C13, C16
- idempotency: n/a - telas; o envio repetido é tratado pelo server (`auth-core`) e o botão fica desabilitado durante o envio
- authorization: C10, C11
- concurrency: n/a - uma aba, sem estado compartilhado além do cookie
- data lifecycle: C12 (logout limpa o cache do `/me`)
- dependency failure: C9, C13
- state transitions: C19, C22 (2FA ligado ↔ desligado), C4 (não verificado → verificado)
- observability: n/a - sem requisito de log no web nesta fase

## Handoff

- S1–S5 ≈ 145 KB de arquivos novos no web (rotas, formulários, componentes, e2e, CI) ÷ 4 ≈ 37k tokens; abaixo do budget de 150k - one builder
- **Boundary:** C1-C25 closed at the commit `feat(web): add the authentication screens` (gate green, 130 server tests; `pnpm e2e` 23 passed against `pnpm dev`; C24 structural check ok, the job itself runs on the first push to `main`)
- **Settled mid-build:** the post-reset login flag is `?reset=true` (TanStack Router serializes search values as JSON; `'1'` became `%221%22`); the e2e clears the `RateLimit` table before each test because every browser request shares one client address; the shadcn CLI resolved `cn` to an npm package of that name - replaced by `@/lib/utils` and `@base-ui/react` added; plan Landing 1b (2FA redirect handled by the login form)
- **Abandoned:** `onTwoFactorRedirect` in the auth client (circular import; see Landing 1b)

