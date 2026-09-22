# Auth core checks

Profile: standard
Plan: `.specs/features/auth-core/plan.md`

39 checks in 8 slices · 8 one-way doors · 0 open

Proof command prefix, omitted below: `pnpm --filter @bens/server exec vitest run`. Every proof
runs against the docker compose Postgres and Mailpit, like the existing suite.

## Checks

### S1 - Cadastro, verificação e login · ~8 files · ~60 KB · ~15k

**C1** - `sign-up/email` válido cria `User` com `emailVerified = false`, sem `set-cookie` de sessão, e enfileira `email.send` `verify-email` para o e-mail (AC 1)
Proof: `src/modules/auth/sign-up.spec.ts -t "creates an unverified user and queues the verification e-mail"`

**C2** - `sign-up/email` com e-mail existente responde igual ao cadastro novo (mesmo status e mesmas chaves no corpo) e o total de `User` com esse e-mail continua 1 (AC 2)
Proof: `src/modules/auth/sign-up.spec.ts -t "does not reveal an existing e-mail"`

**C3** - `sign-in/email` de usuário não verificado responde `403` sem `set-cookie` de sessão (AC 3)
Proof: `src/modules/auth/sign-in.spec.ts -t "rejects an unverified user with 403"`

**C4** - Abrir a URL do payload `verify-email` marca `emailVerified = true` e emite cookie de sessão que faz `/api/v1/me` responder `200` (AC 4)
Proof: `src/modules/auth/sign-up.spec.ts -t "verifying the e-mail signs the user in"`

**C5** - Login correto responde `200` com `set-cookie` do token contendo `HttpOnly`, `SameSite=Lax`, `Path=/` e sem `Domain` (AC 5)
Proof: `src/modules/auth/sign-in.spec.ts -t "issues a host-only lax http-only session cookie"`

**C6** - Com `APP_URL` `https`, o cookie de sessão tem `Secure` e nome com prefixo `__Secure-`; com `http`, não tem nenhum dos dois (AC 6)
Proof: `src/modules/auth/sign-in.spec.ts -t "uses a secure prefixed cookie under https"`

**C7** - Senha errada responde `401` sem `set-cookie` de sessão (AC 7)
Proof: `src/modules/auth/sign-in.spec.ts -t "rejects a wrong password with 401"`

**C8** - `sign-out` apaga a `Session` do banco e o mesmo cookie recebe `401` em `/api/v1/me` (AC 8)
Proof: `src/modules/auth/sign-in.spec.ts -t "sign-out deletes the session"`

### S2 - Recuperação de senha · ~3 files · ~20 KB · ~5k

**C9** - `request-password-reset` de usuário existente responde `200` e enfileira `email.send` `reset-password` para o e-mail (AC 9)
Proof: `src/modules/auth/password-reset.spec.ts -t "queues the reset e-mail for a known user"`

**C10** - `request-password-reset` de e-mail desconhecido responde `200` com corpo igual ao do caso conhecido e não enfileira e-mail (AC 10)
Proof: `src/modules/auth/password-reset.spec.ts -t "answers the same for an unknown e-mail"`

**C11** - `reset-password` com o token do job troca a senha, apaga todas as `Session` do usuário (cookie antigo → `401`), a senha antiga passa a receber `401` e a nova `200` (AC 11)
Proof: `src/modules/auth/password-reset.spec.ts -t "resets the password and revokes every session"`

**C12** - `reset-password` com token já usado responde `400` e com token expirado (mais de 1 h) responde `400`; a senha anterior continua valendo nos dois (AC 12)
Proof: `src/modules/auth/password-reset.spec.ts -t "rejects a used or expired token"`

### S3 - Sessão e contexto de usuário · ~5 files · ~30 KB · ~8k

**C13** - `/api/v1/me` com sessão válida responde `200` com exatamente `id`, `name`, `email`, `emailVerified`, `twoFactorEnabled`, `isSuperAdmin`, `activeOrganizationId` (`null`) (AC 13)
Proof: `src/modules/auth/me.spec.ts -t "returns the signed-in user"`

**C14** - `/api/v1/me` responde `401 { error: { code: 'UNAUTHENTICATED', message: 'Sessão inválida ou expirada.' } }` sem cookie, com token inexistente, com `expiresAt` no passado e com a `Session` apagada no banco (AC 14, 15)
Proof: `src/modules/auth/me.spec.ts -t "rejects every invalid session with 401"`

**C15** - A sessão criada no login tem `expiresAt` = login + 3 dias (±1 min); uma sessão com `updatedAt` há mais de 12 h tem `expiresAt` estendido ao ser usada; uma com menos de 12 h não muda (AC 15)
Proof: `src/modules/auth/me.spec.ts -t "session lasts three days and refreshes after twelve hours"`

**C16** - `isSuperAdmin` no `/me` e em `request.user`: `false` com flag `true` e 2FA desligado, `true` com os dois, `false` com flag `false` (AC 16)
Proof: `src/modules/auth/me.spec.ts -t "only an effective super-admin is a super-admin"`

**C17** - `isSuperAdmin` e `activeOrganizationId` enviados em `sign-up/email` e em `update-user` não são gravados (AC 17)
Proof: `src/modules/auth/me.spec.ts -t "ignores server-controlled fields from the client"`

### S4 - 2FA · ~3 files · ~20 KB · ~6k

**C18** - `two-factor/enable` com senha correta devolve `totpURI` com issuer `Bens Seguros` e códigos de backup; `twoFactorEnabled` só vira `true` depois de `verify-totp` com código válido (AC 18)
Proof: `src/modules/auth/two-factor.spec.ts -t "enables totp only after a valid code"`

**C19** - Com 2FA ligado, login correto responde `twoFactorRedirect: true` e nenhuma `Session` nova é criada (AC 19)
Proof: `src/modules/auth/two-factor.spec.ts -t "sign-in asks for the second factor"`

**C20** - `verify-totp` com código correto emite cookie que faz `/me` responder `200`; com código errado responde `401` sem sessão (AC 20)
Proof: `src/modules/auth/two-factor.spec.ts -t "verifies the totp code to finish sign-in"`

**C21** - `two-factor/disable` com senha correta volta `twoFactorEnabled` a `false` e o login seguinte emite sessão direto (AC 21)
Proof: `src/modules/auth/two-factor.spec.ts -t "disabling totp restores the plain sign-in"`

**C22** - `TwoFactor.secret` no banco difere do `secret` do `totpURI` (AC 22)
Proof: `src/modules/auth/two-factor.spec.ts -t "stores the totp secret encrypted"`

### S5 - Rate limit persistido · ~3 files · ~15 KB · ~5k

**C23** - 10 logins do mesmo IP em 15 min respondem sem `429` e o 11º responde `429` (AC 23)
Proof: `src/modules/auth/rate-limit.spec.ts -t "blocks the eleventh sign-in"`

**C24** - Após 10 logins, fechar o app e as dependências e subir outro no mesmo schema faz o 11º login responder `429` (AC 24)
Proof: `src/modules/auth/rate-limit.spec.ts -t "survives a restart"`

**C25** - Com `TRUST_PROXY=false`, 11 logins com 11 `x-forwarded-for` diferentes → o 11º responde `429` (AC 25)
Proof: `src/modules/auth/rate-limit.spec.ts -t "ignores a client x-forwarded-for without a trusted proxy"`

**C26** - Com `TRUST_PROXY=true`, 10 logins de `203.0.113.1` não bloqueiam o 1º de `203.0.113.2` (AC 26)
Proof: `src/modules/auth/rate-limit.spec.ts -t "buckets by the proxy client ip when trusted"`

**C27** - Cada regra responde `429` exatamente depois do limite: `/sign-up/email` 5, `/request-password-reset` 3, `/send-verification-email` 3, `/two-factor/verify-totp` 10 (AC 27)
Proof: `src/modules/auth/rate-limit.spec.ts -t "applies each path limit"`

### S6 - E-mail pela fila · ~5 files · ~25 KB · ~7k

**C28** - Worker com `verify-email` entrega no Mailpit para `to`, assunto `Confirme seu e-mail`, `url` no HTML e no texto (AC 28)
Proof: `src/emails/send-email.spec.tsx -t "sends the verification e-mail"`

**C29** - Worker com `reset-password` entrega assunto `Redefina sua senha` com o `url` no HTML e no texto (AC 29)
Proof: `src/emails/send-email.spec.tsx -t "sends the password reset e-mail"`

**C30** - Payload com `template` desconhecido e payload com `props.url` ausente fazem o handler lançar erro, e nada chega ao Mailpit (AC 30)
Proof: `src/emails/send-email.spec.tsx -t "rejects an invalid payload without sending"`

**C31** - A fila `email.send` é registrada com `retryLimit` 3 e `retryBackoff` true, e um handler que lança erro é executado de novo (AC 31)
Proof: `src/emails/send-email.spec.tsx -t "retries a failed send"`

### S7 - Origin, headers, docs e config · ~6 files · ~40 KB · ~10k

**C32** - `POST`, `PUT`, `PATCH`, `DELETE` em `/api/*` sem `Origin` e com `Origin: https://evil.example` respondem `403 { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origem da requisição não permitida.' } }` sem executar o handler; com `Origin` = `APP_URL` o handler roda (AC 32)
Proof: `src/app.spec.ts -t "rejects mutating requests from another origin"`
Proof: `src/modules/auth/sign-in.spec.ts -t "rejects sign-in from another origin"`

**C33** - `GET /api/health` sem `Origin` responde `200` (AC 33)
Proof: `src/app.spec.ts -t "accepts reads without an origin"`

**C34** - Respostas da API trazem `x-content-type-options: nosniff` e `strict-transport-security` (AC 34)
Proof: `src/app.spec.ts -t "sends security headers"`

**C35** - `GET /api/docs` responde `200` HTML com config `test` e `404` com config `production` (AC 35)
Proof: `src/app.spec.ts -t "serves api docs outside production only"`

**C36** - Config rejeita `BETTER_AUTH_SECRET` com 31 caracteres e `APP_URL` ausente, citando a variável; o boot com `BETTER_AUTH_SECRET` curto sai com código 1 citando-a (AC 36)
Proof: `src/shared/config.spec.ts -t "requires the auth secret and the app url"`
Proof: `test/boot.spec.ts -t "exits with code 1 when the auth secret is too short"`

### S8 - Socket autenticado · ~3 files · ~15 KB · ~5k

**C37** - Socket com cookie válido e `Origin` = `APP_URL` conecta e o servidor vê `socket.data.user.userId` = id do usuário (AC 37)
Proof: `src/infrastructure/realtime.spec.ts -t "accepts a socket with a valid session"`

**C38** - Socket sem cookie e com sessão revogada recebem `connect_error` com mensagem `UNAUTHENTICATED` (AC 38)
Proof: `src/infrastructure/realtime.spec.ts -t "rejects a socket without a valid session"`

**C39** - Socket com cookie válido e `Origin: https://evil.example` não conecta (AC 39)
Proof: `src/infrastructure/realtime.spec.ts -t "rejects a socket from another origin"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST/GET /api/auth/*` statuses (6) | 200 C5 · 302 C4 · 400 C12 · 401 C7 · 403 C3 · 429 C23 | - |
| `GET /api/v1/me` statuses (2) | 200 C13 · 401 C14 | - |
| `GET /api/docs` statuses (2) | 200 C35 · 404 C35 | - |
| socket `/socket.io` handshake outcomes (3) | aceita C37 · `Origin` estranho C39 · `UNAUTHENTICATED` C38 | - |
| `POST/PUT/PATCH/DELETE /api/*` × Origin inválido (8) | `POST` sem Origin C32 · `POST` estranho C32 · `PUT` sem Origin C32 · `PUT` estranho C32 · `PATCH` sem Origin C32 · `PATCH` estranho C32 · `DELETE` sem Origin C32 · `DELETE` estranho C32 | - |
| motivos de `401` no `/me` (4) | sem cookie C14 · token inexistente C14 · `expiresAt` passado C14 · `Session` apagada C14 | - |
| super-admin efetivo (3) | flag+2FA C16 · flag sem 2FA C16 · sem flag C16 | - |
| campos só do server × rota (4) | `isSuperAdmin` em `sign-up/email` C17 · `isSuperAdmin` em `update-user` C17 · `activeOrganizationId` em `sign-up/email` C17 · `activeOrganizationId` em `update-user` C17 | - |
| payloads `email.send` (4) | `verify-email` C28 · `reset-password` C29 · template desconhecido C30 · props inválidas C30 | - |
| regras de rate limit (5) | `/sign-in/email` C23 · `/sign-up/email` C27 · `/request-password-reset` C27 · `/send-verification-email` C27 · `/two-factor/*` C27 | - |
| fonte do IP (2) | `TRUST_PROXY=false` C25 · `TRUST_PROXY=true` C26 | - |
| tokens de reset inválidos (2) | usado C12 · expirado C12 | - |
| cookie por esquema de `APP_URL` (2) | `https` C6 · `http` C6 | - |
| tabelas novas sem `organizationId` (6) | `User` C40 · `Session` C40 · `Account` C40 · `Verification` C40 · `TwoFactor` C40 · `RateLimit` C40 | - |
| startup config: `BETTER_AUTH_SECRET`, `APP_URL`, `TRUST_PROXY` (4 assemblies) | `server.ts` C36 · `test/app.ts` C13 · `scripts/export-openapi.ts` C41 · `boot.spec.ts` C36 | - |
| Landing doors (8) | 1 mount C5 · 2 tabelas C40 · 3 payload C28 · 4 sessão C15 · 5 contexto C16 · 6 IP C25 · 7 Origin C32 · 8 dependências C34, C35 | - |

**C40** - O teste de schema continua verde com as 6 tabelas novas: nenhuma tem `organizationId`, e o catálogo mostra as 6 no schema do worker (Relations, door 2)
Proof: `test/schema.spec.ts -t "identity tables carry no tenant column"`

**C41** - `pnpm api:generate` roda sem config de ambiente e o `openapi.json` gerado contém `getMe` e não contém `/api/auth/` (startup config, Surface)
Proof: `pnpm api:generate` then `grep -q '"operationId": "getMe"' apps/server/openapi.json && ! grep -q '/api/auth/' apps/server/openapi.json`

- Claims naming a status code, route or response shape: C1–C14, C18–C27, C32–C39 - each proof crosses the HTTP or socket boundary with `app.inject` or a real client
- No other check claims more than the single case its proof exercises

## Test policy

The repo (`CLAUDE.md` "Testes") says pure rules get a unit test covering every transition and
endpoints get an integration test with real PostgreSQL; it does not say what proves a decision
reached **only** through an endpoint. These rows are the bar for this build.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary per decision row | every row of the decision table asserted at the boundary (`app.inject` / socket client) - the decisions here are few and each is cheap to reach end to end |
| Better Auth configuration (behaviour owned by the library) | one at the boundary per configured value | the configured value observed in a response or in the database, never the options object |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- `modules/auth/session-context.ts` (`requireSession`): 4 rejection reasons + super-admin combination (3) -> decides, reached across a boundary (C14, C16)
- origin hook: 4 methods × 3 origin states -> decides (C32, C33)
- `emails/send-email` worker: dispatch over 2 templates + validation -> decides (C28–C30)
- auth mount: rewrites one header and forwards -> instrumentation, proven by C25/C26 at the boundary
- closest analogue: `src/app.spec.ts` error handler, a decision table proven entirely through `app.inject`

Cost: no extra unit layer; ~39 boundary tests. Without these rows, a decision would be allowed to
hide behind one happy-path request.

## Swept

- validation: C1, C12, C30, C36
- failure modes: C30, C31
- idempotency: C2 (no duplicate `User`); e-mail duplicado em retry aceito (plan Assumptions)
- authorization: C3, C7, C14, C19, C32, C38
- concurrency: n/a - a unicidade de `User.email` e `Session.token` é do banco; nenhuma regra desta feature compara-e-grava fora do Better Auth
- data lifecycle: C8, C11, C15 (sessão apagada/expirada); expurgo de `Verification`/`RateLimit` expirados fica com o Better Auth
- dependency failure: C31 (SMTP); Postgres fora = erro 500 do handler existente
- state transitions: C4 (não verificado → verificado), C18, C21 (2FA desligado ↔ ligado)
- observability: n/a - nenhum requisito de log novo; requestId já em toda request, cookies já redigidos no pino

## Handoff

- S1–S8 ≈ 61k tokens (≈ 245 KB de arquivos tocados ÷ 4), todos em `modules/auth`, `emails`, `app.ts`, `infrastructure/realtime.ts`, `shared/`; abaixo do budget de 150k - one builder

- **Boundary:** C1-C41 closed at the commit `feat(server): authenticate with better auth` (gate green: lint, typecheck, 120 tests, build; `server.ts` booted with the dev `.env` and delivered the verification e-mail to Mailpit)
- **Settled mid-build:** C15 simulates "12 h since the last update" through `expiresAt` too (Better Auth derives the session age from it); C17 `update-user` answers `400 FIELD_NOT_ALLOWED` for `isSuperAdmin` and ignores `activeOrganizationId` (a session field); C24 also asserts the `RateLimit` row, because Better Auth's memory store is process-global and would pass a same-process restart; Landing door 9 (`withoutTenant`) added
- **Abandoned:** none

