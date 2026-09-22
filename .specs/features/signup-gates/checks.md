# Signup gates checks

Profile: standard
Plan: `.specs/features/signup-gates/plan.md`

20 checks in 4 slices · 4 one-way doors · 0 open

Proof command prefix for the server, omitted below: `pnpm --filter @bens/server exec vitest run`.

## Checks

### S1 - Server: modo, domínio e config · ~6 files · ~30 KB · ~8k

**C1** - Com `SIGNUP_MODE=closed`, `POST /api/auth/sign-up/email` com nome, e-mail e senha válidos responde `403` com `code: 'SIGNUP_CLOSED'` e mensagem `O cadastro está fechado. Peça um convite à sua corretora.`, e não cria `User` nem job `verify-email` (AC 1)
Proof: `src/modules/auth/signup-gates.spec.ts -t "closed signup returns SIGNUP_CLOSED and creates nothing"`

**C2** - Com `SIGNUP_MODE=closed`, `sign-in/email` de usuário existente responde `200`, o link de `verify-email` confirma o e-mail e `request-password-reset` enfileira `reset-password` (AC 2)
Proof: `src/modules/auth/signup-gates.spec.ts -t "closed signup still signs in, verifies and resets"`

**C3** - `POST /api/auth/sign-up/email` com `x@mailinator.com` e com `x@MAILINATOR.COM` responde `403` com `code: 'EMAIL_DOMAIN_NOT_ALLOWED'` e mensagem `E-mails descartáveis não são permitidos. Use um e-mail pessoal ou corporativo.`, e não cria `User` (AC 4)
Proof: `src/modules/auth/signup-gates.spec.ts -t "rejects a disposable domain"`

**C4** - `POST /api/auth/sign-up/email` com `@gmail.com` e com `@corretora.com.br` responde `200` e cria o `User` (AC 5)
Proof: `src/modules/auth/signup-gates.spec.ts -t "accepts a regular domain"`

**C5** - `GET /api/public/signup-config` sem sessão responde `200` com `signupMode` igual ao `SIGNUP_MODE` e `turnstileSiteKey` igual a `TURNSTILE_SITE_KEY` ou `null` quando a variável não está definida (AC 16)
Proof: `src/modules/auth/signup-gates.spec.ts -t "returns the public signup config"`

**C6** - O corpo de `GET /api/public/signup-config` não contém o valor de `TURNSTILE_SECRET_KEY` (AC 17)
Proof: `src/modules/auth/signup-gates.spec.ts -t "returns the public signup config"`

**C7** - `loadConfig` sem `SIGNUP_MODE` devolve `self_serve`; com `NODE_ENV=production` e `SIGNUP_MODE=self_serve`, faltar `TURNSTILE_SECRET_KEY` ou faltar `TURNSTILE_SITE_KEY` faz `src/server.ts` sair com código `1` e a mensagem citar a variável que falta (AC 13, assumption do padrão)
Proof: `src/modules/auth/signup-gates.spec.ts -t "defaults signup mode to self_serve"`
Proof: `src/modules/auth/signup-gates.spec.ts -t "production self_serve without turnstile exits 1"`

### S2 - Server: Turnstile · ~4 files · ~25 KB · ~6k

**C8** - Com `TURNSTILE_SECRET_KEY` definido, `POST /api/auth/sign-up/email` sem `x-captcha-response` responde `400` com `code: 'MISSING_RESPONSE'`, não cria `User` e o `siteverify` local recebe `0` requests (AC 7)
Proof: `src/modules/auth/signup-gates.spec.ts -t "missing captcha token"`

**C9** - Com `TURNSTILE_SECRET_KEY` definido, `siteverify` respondendo `{ success: false }` faz o cadastro responder `403` com `code: 'VERIFICATION_FAILED'` e não cria `User` (AC 8)
Proof: `src/modules/auth/signup-gates.spec.ts -t "rejected captcha"`

**C10** - Com `TURNSTILE_SECRET_KEY` definido, `siteverify` respondendo `{ success: true }` faz o cadastro responder `200` e criar o `User`, e o `siteverify` recebe `secret` igual à chave e `response` igual ao token do header (AC 9)
Proof: `src/modules/auth/signup-gates.spec.ts -t "accepted captcha"`

**C11** - Com o `siteverify` sem processo escutando, o cadastro responde `500` com `code: 'UNKNOWN_ERROR'` e não cria `User` (AC 10)
Proof: `src/modules/auth/signup-gates.spec.ts -t "captcha service down"`

**C12** - Sem `TURNSTILE_SECRET_KEY`, o cadastro sem `x-captcha-response` responde `200` (AC 11)
Proof: `src/modules/auth/signup-gates.spec.ts -t "signup without turnstile secret"`

**C13** - Com `TURNSTILE_SECRET_KEY` definido, `sign-in/email` e `request-password-reset` sem `x-captcha-response` seguem (login `200`, reset enfileira o e-mail) e o `siteverify` recebe `0` requests (AC 12)
Proof: `src/modules/auth/signup-gates.spec.ts -t "captcha is not required on sign-in or reset"`

**C14** - Com o `siteverify` aceitando o token, `x@mailinator.com` ainda responde `403` com `code: 'EMAIL_DOMAIN_NOT_ALLOWED'` e não cria `User` (assumption da ordem)
Proof: `src/modules/auth/signup-gates.spec.ts -t "disposable domain is rejected after a valid captcha"`

**C15** - O `Caddyfile` inclui `https://challenges.cloudflare.com` em `script-src` e em `frame-src` (Impact, AC 14)
Proof: `src/modules/auth/signup-gates.spec.ts -t "allows the turnstile host in the caddy csp"`

### S3 - Web: /register · ~5 files · ~20 KB · ~5k

Proof prefix: `pnpm --filter @bens/web exec playwright test`.

**C16** - Com `GET /api/public/signup-config` respondendo `signupMode: 'closed'`, `/register` mostra `O cadastro está fechado. Peça um convite à sua corretora.` e não mostra o campo Senha (AC 3)
Proof: `e2e/signup-gates.spec.ts -g "shows that signup is closed"`

**C17** - Cadastro respondendo `403` `EMAIL_DOMAIN_NOT_ALLOWED` mostra `E-mails descartáveis não são permitidos. Use um e-mail pessoal ou corporativo.` no alerta do formulário (AC 6)
Proof: `e2e/signup-gates.spec.ts -g "shows the disposable e-mail message"`

**C18** - Com `turnstileSiteKey` definido, `/register` mostra o widget do Turnstile, o botão `Criar conta` começa desabilitado e o `POST /api/auth/sign-up/email` sai com o header `x-captcha-response` igual ao token do widget (AC 14)
Proof: `e2e/signup-gates.spec.ts -g "requires the turnstile token"`

**C19** - Cadastro respondendo `403` `VERIFICATION_FAILED` mostra `Não foi possível confirmar que você não é um robô. Tente de novo.` e o widget volta ao estado sem token (botão `Criar conta` desabilitado de novo) (AC 15)
Proof: `e2e/signup-gates.spec.ts -g "shows the captcha failure and resets the widget"`

**C20** - Enquanto `signup-config` não responde, `/register` mostra `Carregando o cadastro…`; com a rota respondendo `500`, mostra `Não foi possível carregar o cadastro.` e `Tentar de novo`, que ao voltar `200` mostra o formulário (Observable)
Proof: `e2e/signup-gates.spec.ts -g "shows loading and error for signup config"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| sign-up outcomes (6) | 200 C4 · SIGNUP_CLOSED C1 · EMAIL_DOMAIN_NOT_ALLOWED C3 · MISSING_RESPONSE C8 · VERIFICATION_FAILED C9 · UNKNOWN_ERROR C11 | - |
| `GET /api/public/signup-config` statuses (1) | 200 C5 | - |
| `SIGNUP_MODE` (2) | closed C1 · self_serve C4 | - |
| disposable case (2) | mailinator.com C3 · MAILINATOR.COM C3 | - |
| allowed domains (2) | gmail.com C4 · corretora.com.br C4 | - |
| siteverify results (3) | missing C8 · false C9 · true C10 | - |
| captcha on endpoints (3) | `/api/auth/sign-up/email` C8 · `/api/auth/sign-in/email` C13 · `/api/auth/request-password-reset` C13 | - |
| production turnstile keys (2) | missing secret C7 · missing site key C7 | - |
| closed mode still-open flows (3) | sign-in C2 · verify-email C2 · request-password-reset C2 | - |
| web `/register` states (5) | closed C16 · disposable C17 · widget C18 · captcha error C19 · config error C20 | - |
| Landing doors (4) | hook C1 · captcha plugin C10 · public config C5 · packages C3 | - |
| startup config assemblies (2) | `loadConfig` C7 · test harness C12 | - |

- Claims naming a status code, route or response shape: C1, C3, C5, C8, C9, C11 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary and one at its own layer | the contract at the boundary; one asserted case per row of the decision table at its own layer |
| Decides, not reached across a boundary | one at its own layer | one asserted case per row of the decision table |
| Entry point that decides nothing | one at the boundary | accepted input, each rejected input, each error path |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- signup hook: two branches (`SIGNUP_MODE`, disposable domain) -> decides, reached at `POST /api/auth/sign-up/email`
- captcha plugin: three outcomes (missing, rejected, accepted) plus unreachable -> decides, reached at the same route; the plugin is the layer
- `GET /api/public/signup-config`: maps two config fields, no branch that changes the status -> entry point
- `/register`: branches on `signupMode`, `turnstileSiteKey` and error code -> decides, reached in the browser
- closest analogue: `apps/server/src/modules/auth/sign-up.spec.ts`, same `app.inject` boundary, one assertion per outcome

Cost: the boundary proofs above cover every named row. No separate pure-function suite: the hook and the route are the decision, and a unit test of a wrapper would re-assert the same status.

## Swept

- validation: C3, C4
- failure modes: C8, C9, C11, C20
- idempotency: n/a - cada cadastro é um e-mail novo; repetir o mesmo e-mail já está coberto por `auth-core`
- authorization: n/a - cadastro e `signup-config` são públicos; sessão não entra
- concurrency: n/a - sem contador nem estoque neste gate
- data lifecycle: n/a - nenhum dado novo é gravado
- dependency failure: C11
- state transitions: C1, C2
- observability: n/a - sem log novo exigido; o plugin já registra a falha do Turnstile

## Handoff

- S1 = 8k, S2 = 6k, S3 = 5k, total 19k, under the 150k budget - one builder
