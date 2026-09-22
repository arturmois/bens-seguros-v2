# Auth web

> Fase 3, feature 2 de 5 (ver `.specs/STATE.md`). Depende de `auth-core` (server).

## Problem

Depois de `auth-core`, o server autentica, mas o web não tem uma tela sequer para isso: não dá para
se cadastrar, confirmar o e-mail, entrar, recuperar a senha nem ligar o 2FA sem chamar a API à mão,
e nenhuma rota do web separa quem está logado de quem não está. O critério de aceite da fase
("login funcionando no staging") é de ponta a ponta, então sem as telas a fase não fecha. Não há
usuário real esperando: é a primeira versão das telas.

Com isso pronto, uma pessoa faz todo o ciclo de conta pelo navegador, em pt-BR, e qualquer página
do app redireciona para o login quando a sessão não existe ou expirou.

## Flow

Reusa o client oficial do Better Auth (ADR-003: `better-auth/react` só nas telas de auth), o hook
do Orval de `GET /api/v1/me` para tudo o que não é tela de auth, e o `http.ts`/`ApiError`
existentes; nenhuma chamada de auth é escrita à mão com `fetch`.

1. telas `(auth)/*` → `lib/auth-client.ts` (door 1) → `/api/auth/*` (exists, `auth-core`) → cookie de sessão
2. erro do Better Auth → mapa `code → mensagem pt-BR` em `lib/auth-client.ts` (door 1) → exibido no formulário
3. rota sob `_app` → `beforeLoad` com `queryClient.ensureQueryData(getMe)` (hook do Orval, exists após `pnpm api:generate`) → `401` vira `redirect({ to: '/login', search: { redirect } })` (door 2)
4. login com `twoFactorRedirect` → `/two-factor` → `authClient.twoFactor.verifyTotp` → destino
5. links dos e-mails → `/api/auth/verify-email` ou `/api/auth/reset-password/:token` (exists) → redirecionam para `/login` ou `/reset-password?token=…` do web
6. out: `/dashboard` (placeholder autenticado) e `/settings/security` (2FA)

## Impact

| Front | What changes |
| --- | --- |
| domain | novo termo: **`_app`** — layout de toda rota autenticada; a arquitetura (§9) já o previa; toda tela das Fases 4+ nasce sob ele |
| domain | novo termo: **destino pós-login** — search param `redirect`, aceito só se for caminho interno (começa com `/` e não com `//`) |
| web | dependências novas: `better-auth` (client), `react-hook-form`, `@hookform/resolvers`, `react-qr-code`, `@base-ui/react` (base dos componentes shadcn `base-nova`); dev: `@playwright/test`, `pg` (o e2e zera o contador de rate limit entre testes). Componentes shadcn (button, input, label, card, alert) entram em `components/ui`; o `Label` exige `htmlFor` |
| web | o QueryClient só repete query em erro de rede ou 5xx: um `401` redireciona na hora |
| web | `src/api/` ganha o hook de `getMe` (gerado) |
| CI | ganha o job de e2e em push para `main` (ADR-008) |
| stored data | nada |

## Relations

None - no stored-data shape change

## Surface

Rotas do web (consumidas pelo navegador e pelos links dos e-mails):

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `/login` | search `redirect?`, `error?` | formulário; sucesso → `redirect` interno ou `/dashboard` | `200` (SPA) |
| `/register` | — | formulário; sucesso → `/verify-email?email=` | `200` (SPA) |
| `/verify-email` | search `email` | aviso "confira seu e-mail" + reenviar | `200` (SPA) |
| `/forgot-password` | — | formulário; sucesso → aviso | `200` (SPA) |
| `/reset-password` | search `token?`, `error?` | formulário de senha nova | `200` (SPA) |
| `/two-factor` | — | formulário do código TOTP ou de backup | `200` (SPA) |
| `/dashboard`, `/settings/security` | cookie | páginas autenticadas | `200` (SPA); sem sessão → `/login?redirect=` |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. client de auth | `export const authClient = createAuthClient({ plugins: [twoFactorClient({ onTwoFactorRedirect: () => router.navigate({ to: '/two-factor' }) })] })` sem `baseURL` (mesma origem) em `lib/auth-client.ts`, com `authErrorMessage(code)` → pt-BR | chamar `/api/auth/*` pelo Orval - as rotas do Better Auth são `hide: true` no OpenAPI e o contrato é dele |
| 2. guard das rotas autenticadas | `createFileRoute('/_app')({ beforeLoad: async ({ context, location }) => { try { await context.queryClient.ensureQueryData(getGetMeQueryOptions()) } catch (e) { if (e instanceof ApiError && e.status === 401) throw redirect({ to: '/login', search: { redirect: location.href } }); throw e } } })` | checar `authClient.useSession()` no componente - pisca a tela protegida antes de redirecionar e duplica a fonte de verdade do `/me` (ADR-003) |
| 3. e2e | `@playwright/test` em `apps/web/e2e/`, `baseURL` de `E2E_BASE_URL` (padrão `http://localhost:3000`), lendo e-mails pela API do Mailpit (`E2E_MAILPIT_URL`, padrão `http://localhost:8025`); `pnpm e2e` na raiz; no CI só em push para `main` | Cypress - segunda ferramenta de browser no repo, e o ADR-008 já nomeia o Playwright |
| 1b. redirecionamento do 2FA no login (achado no build) | `twoFactorClient()` sem opções; o formulário de `/login` lê `data.twoFactorRedirect` e navega para `/two-factor` com o mesmo `redirect` | `onTwoFactorRedirect` no client (door 1) - o client importaria o router, que importa as rotas, que importam o client: import circular, e o `redirect` do search se perderia |

- Nothing else in this change is hard to reverse

## Criteria

### S1: Cadastro e verificação pelo navegador (P1)

**Acceptance Criteria**

1. WHEN o formulário de `/register` é enviado com nome, e-mail e senha válidos THEN o web SHALL chamar `sign-up/email` com `callbackURL: '/login'` e SHALL navegar para `/verify-email?email=<e-mail>`, que mostra "Enviamos um link de confirmação para <e-mail>"
2. IF o formulário de `/register` tem senha com menos de 8 caracteres, e-mail inválido ou nome vazio THEN o web SHALL mostrar o erro do campo em pt-BR e SHALL não chamar a API
3. WHEN "Reenviar e-mail" é clicado em `/verify-email` THEN o web SHALL chamar `send-verification-email` e SHALL mostrar "E-mail reenviado."; IF a API responde `429` THEN SHALL mostrar "Muitas tentativas. Aguarde alguns minutos e tente de novo."
4. WHEN o link de verificação do e-mail é aberto THEN o navegador SHALL terminar em `/dashboard` já logado; IF o token é inválido ou expirou THEN SHALL terminar em `/login` com o aviso "Link inválido ou expirado. Faça login para receber outro."

**Independent test:** e2e — cadastro, link lido no Mailpit, `/dashboard` mostra "Olá, <nome>".

### S2: Login, logout e guard (P1)

**Acceptance Criteria**

5. WHEN `/login` é enviado com credenciais corretas THEN o web SHALL navegar para o `redirect` do search, ou `/dashboard` quando ausente
6. IF o `redirect` do search não começa com `/` ou começa com `//` THEN o web SHALL navegar para `/dashboard`
7. IF o login falha com credenciais erradas THEN o web SHALL mostrar "E-mail ou senha incorretos." e SHALL manter o e-mail preenchido
8. IF o login falha porque o e-mail não foi confirmado THEN o web SHALL mostrar "Confirme seu e-mail para entrar." com um link para `/verify-email?email=<e-mail>`
9. IF a API responde `429` no login THEN o web SHALL mostrar "Muitas tentativas. Aguarde alguns minutos e tente de novo."
10. WHEN uma rota sob `_app` é aberta sem sessão válida THEN o web SHALL redirecionar para `/login?redirect=<caminho original>` sem renderizar a página protegida
11. WHEN uma rota `(auth)` (`/login`, `/register`) é aberta com sessão válida THEN o web SHALL redirecionar para `/dashboard`
12. WHEN "Sair" é clicado no layout `_app` THEN o web SHALL chamar `sign-out`, SHALL limpar o cache do TanStack Query e SHALL navegar para `/login`
13. WHILE o `/me` do `_app` carrega the web SHALL mostrar um indicador de carregamento; IF o `/me` falha com erro diferente de `401` THEN SHALL mostrar "Não foi possível carregar sua conta." com botão "Tentar de novo"

**Independent test:** e2e — `/dashboard` sem sessão cai em `/login?redirect=%2Fdashboard`; login volta para `/dashboard`; "Sair" volta para `/login`.

### S3: Recuperação de senha (P1)

**Acceptance Criteria**

14. WHEN `/forgot-password` é enviado com um e-mail THEN o web SHALL chamar `request-password-reset` com `redirectTo: '/reset-password'` e SHALL mostrar "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." qualquer que seja a resposta `200`
15. WHEN `/reset-password?token=…` é enviado com senha nova e confirmação iguais THEN o web SHALL chamar `reset-password` e SHALL navegar para `/login` com o aviso "Senha redefinida. Entre com a nova senha."
16. IF `/reset-password` abre com `error` no search, ou a API responde token inválido THEN o web SHALL mostrar "Link inválido ou expirado." com link para `/forgot-password`
17. IF a senha e a confirmação diferem THEN o web SHALL mostrar "As senhas não conferem." sem chamar a API

**Independent test:** e2e — pedir reset, abrir o link do Mailpit, trocar a senha, entrar com a nova.

### S4: 2FA no navegador (P2)

**Acceptance Criteria**

18. WHEN, em `/settings/security`, o usuário informa a senha e clica "Ativar verificação em duas etapas" THEN o web SHALL mostrar o QR code do `totpURI`, a chave em texto e os códigos de backup, e SHALL pedir um código de 6 dígitos para concluir
19. WHEN o código de 6 dígitos correto é enviado THEN o web SHALL mostrar "Verificação em duas etapas ativada." e o `/me` SHALL passar a `twoFactorEnabled: true`
20. WHEN o login de um usuário com 2FA responde `twoFactorRedirect` THEN o web SHALL navegar para `/two-factor`; WHEN o código TOTP correto é enviado ali THEN SHALL navegar para `/dashboard`; IF o código está errado THEN SHALL mostrar "Código inválido."
21. WHEN o usuário escolhe "Usar código de backup" em `/two-factor` e envia um código de backup válido THEN o web SHALL navegar para `/dashboard`
22. WHEN, em `/settings/security` com 2FA ativo, o usuário informa a senha e clica "Desativar" THEN o web SHALL mostrar "Verificação em duas etapas desativada."

**Independent test:** e2e — ativar 2FA com código calculado no teste, sair, entrar e passar pelo `/two-factor`.

### S5: E2E no pipeline (P2)

**Acceptance Criteria**

23. WHEN `pnpm e2e` roda com o server, o web e o docker compose no ar THEN os cenários de S1 a S4 SHALL passar
24. WHEN há push para `main` THEN o CI SHALL subir server e web contra o Postgres e o Mailpit do job, aplicar as migrations e rodar `pnpm e2e`

**Independent test:** `pnpm e2e` local, com `pnpm dev` e `docker compose up -d`.

## Out of scope

| Excluded | Why |
| --- | --- |
| Turnstile e aviso de cadastro fechado no `/register` | feature `signup-gates` |
| tela de aceite de termos | feature `terms` |
| seletor de organização, onboarding, menu por permissão | Fase 4 |
| dashboard real | Fase 10; `/dashboard` aqui é placeholder autenticado |
| troca de senha e de nome logado, lista de sessões ativas | fora do legado e da checklist da fase |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| rota inicial autenticada | `/dashboard` placeholder ("Olá, <nome>") | a Fase 10 constrói o dashboard; o guard precisa de um destino | n |
| QR code do 2FA | `react-qr-code` (SVG, sem dependências) | apps de autenticação leem QR; a chave em texto fica como alternativa | n |
| formulários | React Hook Form + Zod em `features/auth/schemas.ts` | arquitetura §9 | y |
| e2e no CI | só em push para `main`, contra `vite preview` + server buildado | ADR-008; PRs continuam rápidos | n |
| `/verify-email` exposto sem sessão | mostra só o e-mail do search e o botão de reenviar | o Better Auth responde igual para e-mail inexistente (sem enumeração) | n |

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| telas `(auth)/*` | empty state | n/a - formulários, não listagens |
| telas `(auth)/*` | loading | AC 13 para o `/me`; botões de envio ficam desabilitados com "Aguarde…" durante a chamada (convenção dos formulários) |
| telas `(auth)/*` | error state | AC 2, 3, 7, 8, 9, 16, 17, 20 |
| telas `(auth)/*` | unauthorised | AC 11 (logado não vê login/cadastro) |
| layout `_app` | unauthorised | AC 10 |
| layout `_app` | loading e error | AC 13 |
| tela `/settings/security` | ação destrutiva confirma | AC 22 - exige a senha |
| documento: mensagens pt-BR | tom e próximo passo | AC 3, 4, 7, 8, 9, 14, 15, 16 |
| comando `pnpm e2e` | o que imprime ao falhar | existing - reporter padrão do Playwright + trace no primeiro retry |

## Sources

- `docs/decisions/ADR-003-authentication.md` - `better-auth/react` só nas telas de auth; o resto do `/me`
- `docs/architecture.md` §9 - `(auth)/*`, `_app` com `beforeLoad`, React Hook Form + Zod
- `docs/decisions/ADR-008-deployment.md` - Playwright em `main`
