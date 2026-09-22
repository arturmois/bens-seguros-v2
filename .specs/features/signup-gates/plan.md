# Signup gates

> Fase 3, feature 4 de 5 (ver `.specs/STATE.md`). Depende de `auth-core` e `auth-web`.

## Problem

Depois de `auth-core`, qualquer um cria conta em `/api/auth/sign-up/email`: um robô cria contas
em volume, um e-mail descartável (mailinator e afins) passa, e não há como fechar o cadastro
público quando a corretora só deve entrar por convite. O legado tinha os três bloqueios
(`SIGNUP_MODE`, lista de e-mail temporário, Turnstile) e eles estão na checklist de paridade.
Quem paga: a operação, com contas lixo, e-mails de verificação queimando a reputação do domínio
de envio e, a partir da Fase 5, trials abertos por quem não é cliente. Sem evidência de abuso no
v2 (não está no ar); o legado os adicionou depois de abuso (Fase 7D do legado).

Com isso pronto, o cadastro público só aceita uma pessoa que passou pelo desafio anti-robô, com
e-mail não descartável, e só quando o cadastro está aberto; com o cadastro fechado, a tela de
cadastro diz isso em vez de mostrar um formulário que sempre falha.

## Flow

Reusa o plugin `captcha` do próprio Better Auth (provider `cloudflare-turnstile`) em vez do
middleware próprio do legado, e o `hooks.before` do Better Auth para as outras duas regras, então
os três bloqueios respondem no mesmo formato de erro que o client de auth já trata.

1. `POST /api/auth/sign-up/email` → mount (exists, `auth-core`) → rate limit do Better Auth (exists)
2. → `hooks.before` do Better Auth (door 1): `SIGNUP_MODE=closed` → `403 SIGNUP_CLOSED`; domínio descartável → `403 EMAIL_DOMAIN_NOT_ALLOWED`
3. → plugin `captcha` (door 2), registrado só quando há `TURNSTILE_SECRET_KEY` e o cadastro está aberto: valida `x-captcha-response` no `siteverify` da Cloudflare → `403` sem token ou com token recusado; indisponível → erro (fail-closed)
4. → cadastro normal (exists)
5. web: `/register` → `GET /api/public/signup-config` (door 3) → cadastro fechado mostra aviso; com `turnstileSiteKey` renderiza o widget e manda o token no header `x-captcha-response`

## Impact

| Front | What changes |
| --- | --- |
| domain | novo termo: **`SIGNUP_MODE`** — `closed` \| `self_serve` (padrão `self_serve`); `closed` bloqueia só o cadastro público; login, verificação e reset continuam; o cadastro por convite (Fase 4) não passa por aqui |
| config | chaves novas: `SIGNUP_MODE`, `TURNSTILE_SECRET_KEY` (opcional), `TURNSTILE_SITE_KEY` (opcional); em `production` com `self_serve`, as duas chaves do Turnstile são obrigatórias (boot falha sem elas) |
| web | `/register` ganha o widget do Turnstile e o estado "cadastro fechado"; mapa de erros ganha os códigos novos. Dependência nova `@marsidev/react-turnstile` |
| infra | CSP do `Caddyfile` (feature `staging`) passa a permitir `https://challenges.cloudflare.com` em `script-src` e `frame-src` |
| stored data | nada |

## Relations

None - no stored-data shape change

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `POST /api/auth/sign-up/email` (muda) | + header `x-captcha-response` quando o Turnstile está ligado | inalterado | + `403` (`SIGNUP_CLOSED`, `EMAIL_DOMAIN_NOT_ALLOWED`, captcha ausente/inválido) |
| `GET /api/public/signup-config` | — | `signupMode` · `turnstileSiteKey` (texto ou `null`) | `200` |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. regras de cadastro no Better Auth | `hooks: { before: createAuthMiddleware(async (ctx) => { if (ctx.path !== '/sign-up/email') return; if (config.SIGNUP_MODE === 'closed') throw new APIError('FORBIDDEN', { code: 'SIGNUP_CLOSED', message: 'O cadastro está fechado. Peça um convite à sua corretora.' }); if (isDisposableEmail(ctx.body.email)) throw new APIError('FORBIDDEN', { code: 'EMAIL_DOMAIN_NOT_ALLOWED', message: 'E-mails descartáveis não são permitidos. Use um e-mail pessoal ou corporativo.' }) }) }`; lista de `disposable-email-domains-js` | preHandler do Fastify como no legado - responderia no formato `{ error }` da API enquanto o resto de `/api/auth/*` responde no formato do Better Auth, e o client teria dois caminhos de erro |
| 2. Turnstile pelo plugin `captcha` | `captcha({ provider: 'cloudflare-turnstile', secretKey: TURNSTILE_SECRET_KEY, endpoints: ['/sign-up/email'] })`, token em `x-captcha-response`; o teste aponta `siteVerifyURLOverride` para um servidor HTTP local | middleware próprio com fail-open (legado) - código a manter e um robô passa sempre que a Cloudflare oscila |
| 3. config pública do cadastro | `GET /api/public/signup-config` → `{ signupMode: 'closed' \| 'self_serve', turnstileSiteKey: string \| null }`, `operationId: 'getSignupConfig'`, sem sessão | site key em variável `VITE_*` no build - a mesma imagem do web não serviria staging e produção com chaves diferentes, e o web não saberia do `SIGNUP_MODE` |
| 4. dependências novas | `disposable-email-domains-js` (server; mesma lista upstream do legado, publicada continuamente), `@marsidev/react-turnstile` (web) | `disposable-email-domains` do legado - sem publicação desde 2022 |

- Nothing else in this change is hard to reverse

## Criteria

### S1: Cadastro fechado (P1)

**Acceptance Criteria**

1. WHILE `SIGNUP_MODE` é `closed`, WHEN `POST /api/auth/sign-up/email` é chamado com dados válidos THEN o sistema SHALL responder `403` com `code: 'SIGNUP_CLOSED'` e SHALL não criar `User` nem enfileirar e-mail
2. WHILE `SIGNUP_MODE` é `closed` the system SHALL continuar aceitando `sign-in/email`, `verify-email` e `request-password-reset` de usuários existentes
3. WHILE `SIGNUP_MODE` é `closed`, WHEN `/register` é aberto THEN o web SHALL mostrar "O cadastro está fechado. Peça um convite à sua corretora." sem o formulário

**Independent test:** app de teste com `SIGNUP_MODE=closed` → `sign-up` `403 SIGNUP_CLOSED`, `sign-in` de usuário existente `200`.

### S2: E-mail descartável (P1)

**Acceptance Criteria**

4. IF `POST /api/auth/sign-up/email` recebe e-mail de domínio da lista (`@mailinator.com`, inclusive em maiúsculas `@MAILINATOR.COM`) THEN o sistema SHALL responder `403` com `code: 'EMAIL_DOMAIN_NOT_ALLOWED'` e SHALL não criar `User`
5. WHEN o domínio não está na lista (`@gmail.com`, `@corretora.com.br`) THEN o cadastro SHALL seguir normalmente
6. WHEN o web recebe `EMAIL_DOMAIN_NOT_ALLOWED` THEN SHALL mostrar "E-mails descartáveis não são permitidos. Use um e-mail pessoal ou corporativo." no campo de e-mail

**Independent test:** `sign-up` com `x@mailinator.com` → `403`; com `x@gmail.com` → `200`.

### S3: Turnstile (P1)

**Acceptance Criteria**

7. WHERE `TURNSTILE_SECRET_KEY` está definido, IF `POST /api/auth/sign-up/email` chega sem `x-captcha-response` THEN o sistema SHALL responder `403` e SHALL não criar `User` nem chamar o `siteverify`
8. WHERE `TURNSTILE_SECRET_KEY` está definido, IF o `siteverify` responde `success: false` THEN o sistema SHALL responder `403` e SHALL não criar `User`
9. WHERE `TURNSTILE_SECRET_KEY` está definido, WHEN o `siteverify` responde `success: true` THEN o cadastro SHALL seguir normalmente, e o `siteverify` SHALL ter recebido o `secret` e o token enviado
10. IF o `siteverify` está inacessível THEN o sistema SHALL recusar o cadastro (status ≥ `400`) e SHALL não criar `User`
11. WHERE `TURNSTILE_SECRET_KEY` não está definido the system SHALL aceitar o cadastro sem `x-captcha-response`
12. The Turnstile SHALL não ser exigido em `sign-in/email` nem em `request-password-reset`
13. IF `NODE_ENV=production` e `SIGNUP_MODE=self_serve` sem `TURNSTILE_SECRET_KEY` ou sem `TURNSTILE_SITE_KEY` THEN o server SHALL sair com código 1 no boot citando a variável
14. WHERE `turnstileSiteKey` não é `null`, WHEN `/register` é aberto THEN o web SHALL renderizar o widget do Turnstile e SHALL manter "Criar conta" desabilitado até o widget entregar um token; o token SHALL ir no header `x-captcha-response`
15. IF o cadastro falha pelo captcha THEN o web SHALL mostrar "Não foi possível confirmar que você não é um robô. Tente de novo." e SHALL reiniciar o widget

**Independent test:** servidor `siteverify` falso respondendo `success: false` e depois `true`; o primeiro `sign-up` recebe `403`, o segundo `200`.

### S4: Config pública (P1)

**Acceptance Criteria**

16. WHEN `GET /api/public/signup-config` é chamado sem sessão THEN o sistema SHALL responder `200` com `signupMode` igual ao `SIGNUP_MODE` e `turnstileSiteKey` igual a `TURNSTILE_SITE_KEY` ou `null`
17. The resposta de `GET /api/public/signup-config` SHALL não conter `TURNSTILE_SECRET_KEY`

**Independent test:** `app.inject` com e sem `TURNSTILE_SITE_KEY`.

## Out of scope

| Excluded | Why |
| --- | --- |
| cadastro por convite | Fase 4 (`/api/v1/invitations/:id/accept`), fora deste gate |
| captcha no login e no reset | não estava no legado; rate limit por IP cobre (`auth-core`) |
| bloqueio por subdomínio de domínio descartável | o legado comparava o domínio exato; a lista upstream também |
| rate limit por e-mail no cadastro | ver Assumptions de `auth-core` |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Cloudflare fora do ar | **fail-closed** (plugin do Better Auth): o cadastro para enquanto o `siteverify` não responde | o legado era fail-open; fechar é o comportamento do plugin e o mais seguro; indisponibilidade da Cloudflare é rara e só afeta cadastro novo. **Diverge do legado — confirmar** | n |
| padrão de `SIGNUP_MODE` | `self_serve` | paridade com o legado | n |
| ordem dos bloqueios | rate limit → cadastro fechado → e-mail descartável → Turnstile | o mais barato primeiro; com o cadastro fechado o plugin nem é registrado | n |

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API `POST /api/auth/sign-up/email` | error shape e códigos | AC 1, 4, 7, 8, 10 |
| API `POST /api/auth/sign-up/email` | quem pode chamar, rate limit | existing - rate limit de `auth-core` (5/h por IP) |
| API `GET /api/public/signup-config` | response shape, quem pode chamar | AC 16, 17 |
| API `GET /api/public/signup-config` | rate limit, versionamento | n/a - leitura pública de 2 campos de config; prefixo `/api/public` da arquitetura §8 |
| tela `/register` | estado fechado | AC 3 |
| tela `/register` | loading | o formulário espera o `signup-config` com indicador de carregamento, e mostra "Não foi possível carregar o cadastro." com "Tentar de novo" em erro (mesma convenção de `auth-web` AC 13) |
| tela `/register` | error state | AC 6, 15 |
| boot do server | o que imprime ao falhar | AC 13 |

## Sources

- `docs/migration.md` (Auth / Organizations) - Turnstile, e-mail temporário, `SIGNUP_MODE`
- legado `apps/server/src/middlewares/{signup-gate,tempmail-gate,turnstile-gate}.ts` - códigos, mensagens, fail-open
- Better Auth 1.7 docs, plugin `captcha` (Context7 `/better-auth/better-auth`)
