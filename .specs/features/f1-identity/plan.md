# F1 identity

> F1 do roadmap do MVP (Identity / Tenant / RBAC). F0 e Checkpoint H3 fechados. Este plano para antes dos checks. Perfil: standard (a fase tem permissões e uma invariante com concorrência; é o perfil de 14 das 17 features do repo).

## Problem

Hoje a organização tem os cinco papéis do ERP. `OWNER` repete o `ADMIN` na matriz, e `VIEWER` não tem caso de uso no MVP (ADR-016). A regra que impede uma corretora de ficar sem administrador é "OWNER único e imutável" (`Member_one_owner`, `OWNER_IMMUTABLE`). O produto pede outra: a organização tem sempre pelo menos um ADMIN ativo, e esse papel pode passar de uma pessoa para outra. Cada permissão nova da F2 à F8 (`lead:assign`, `conversation:attend`…) teria de ser decidida e testada para cinco papéis. Com dados de cliente no banco, trocar os papéis vira uma migração de dados reais.

Quem conclui o cadastro hoje ganha uma organização sem nada para mostrar ao cliente dela: não existe link público, e a corretora não tem logo, cor nem saudação (handoff §11, §12, §36: "Cadastro → organização → ADMIN → configuração mínima → Web Chat disponível"). Sem incidente: ainda não há cliente.

Quando isso for entregue, quem se cadastra vira ADMIN da corretora, vê em Configurações o link do Web Chat da corretora e define logo, cor e saudação. A página do chat ainda não existe: ela chega na F3. A corretora nunca fica sem um ADMIN ativo.

## Flow

Reusa o onboarding, o `GET`/`PATCH /api/v1/organization`, o `PATCH /api/v1/members/:id`, a matriz estática de `shared/permissions.ts`, o `audit.record` com a ação `organization.update` (já na lista fechada da AD-008) e o trial do `billing`. Nenhum módulo novo.

1. `POST /api/v1/onboarding` -> `organizations` (exists) - cria a `Organization` com `publicChatKey` (door 2), o `Member` como `ADMIN` (door 1), o trial (`billing`, exists) e a auditoria `organization.create` (exists), tudo na mesma transação.
2. `GET /api/v1/organization` -> `organizations` (exists) - devolve também `publicChatKey`, `brandColor`, `greeting` e `logoUpdatedAt` (door 3). O web monta o link `<origem>/c/<publicChatKey>` e o mostra em `/settings/organization` (exists), com botão de copiar.
3. `PATCH /api/v1/organization/branding` -> `organizations` (exists) - grava cor e saudação e registra `organization.update` sem PII.
4. `PUT` e `DELETE /api/v1/organization/logo` -> `organizations` (exists) - valida o tamanho e o tipo pelos magic bytes, grava ou apaga o `bytea` (door 3, door 4) e registra `organization.update` com `{ logo: [antes, depois] }` em booleanos, nunca com os bytes.
5. `GET /api/v1/organization/logo` -> `organizations` (exists) - devolve os bytes com o `Content-Type` gravado e `ETag`. O preview em `/settings/organization` usa `<img src>` com `?v=<logoUpdatedAt>`.
6. `PATCH /api/v1/members/:id` -> `organizations` (exists) - antes de rebaixar ou desativar um ADMIN ativo, trava as linhas de ADMIN ativo da organização (`FOR UPDATE`, ordem por `id`) e recusa com `422 LAST_ADMIN` se ele for o último (door 5).
7. `shared/permissions.ts` (exists) - a matriz perde `OWNER` e `VIEWER`. As permissões que o `OWNER` tinha continuam com o `ADMIN`, sem nenhuma nova. `/settings/members` e o convite (exists) oferecem só `ADMIN`, `MANAGER` e `COMMERCIAL`.

## Impact

| Front | What changes |
| --- | --- |
| domain | `Role` perde `OWNER` e `VIEWER`. Quem ramifica hoje: `permissions.ts` (+ spec), `member.ts` (`OWNER_IMMUTABLE`), `member.schema.ts`, `invitation.schema.ts` (`INVITABLE_ROLES`), `onboarding.ts`, `organization.schema.ts` (`onboardOutput.role`), `test/factories.ts`, oito specs do server, `labels.ts`, `members.tsx` e o e2e `org-web.spec.ts` |
| domain | termo novo: **link do Web Chat** - `<origem>/c/<publicChatKey>`, um por organização (ADR-014). Mora na `Organization` até a F2 criar o `Channel` |
| domain | termo novo: **identidade visual** - `brandColor`, `greeting` e logo da organização. O nome continua sendo `Organization.name` |
| stored data | as migrations anteriores foram substituídas por uma só (`20260924120000_init`), gerada do `schema.prisma` mais o SQL escrito à mão. O catálogo resultante é o mesmo da cadeia antiga com as mudanças da F1. Bancos locais precisam de `prisma migrate reset`; produção e staging não existem |
| API | `onboardOutput.role` passa de `'OWNER'` para `'ADMIN'`. Os enums de papel de `/me`, membros, convites e organização perdem dois valores. O único consumidor é o web deste repo, regenerado pelo Orval |
| docs | `architecture.md`: `Member` [F1] vira [existe]; `publicChatKey` e branding viram [existe]; o canal Web Chat padrão continua [F2] (ver Assumptions). `roadmap.md`: a F1 deixa de citar "canal Web Chat padrão" e a F2 passa a citar |

## Relations

`None - nenhuma entidade nova nem cardinalidade nova`. A `Organization` ganha atributos (door 2, door 3); `Member` e `Invitation` continuam N:1 com `Organization`. A restrição de mão única que muda é a troca de "um OWNER por organização" (índice parcial, apagado) por "pelo menos um ADMIN ativo" (door 5, no use case).

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `POST /api/v1/onboarding` | `name` | `role` passa a ser `'ADMIN'`; ganha `publicChatKey` | `200`, `401`, `422` |
| `GET /api/v1/organization` | — | ganha `publicChatKey` · `brandColor` · `greeting` · `logoUpdatedAt` | `200`, `401`, `403` |
| `PATCH /api/v1/organization/branding` | `brandColor?` (`#rrggbb` ou `null`) · `greeting?` (texto ou `null`) | `brandColor` · `greeting` | `200`, `400`, `401`, `403` |
| `PUT /api/v1/organization/logo` | `image` (base64) | `logoUpdatedAt` | `200`, `400`, `401`, `403`, `413` (corpo acima de 400 KB, `bodyLimit` da rota; acrescentado no build), `422` |
| `DELETE /api/v1/organization/logo` | — | `204` sem corpo | `204`, `401`, `403` |
| `GET /api/v1/organization/logo` | — | os bytes da imagem, `Content-Type` gravado, `ETag`, `Cache-Control: private, no-cache` | `200`, `304`, `401`, `403`, `404` |
| `PATCH /api/v1/members/:id` | `role?` só `ADMIN`/`MANAGER`/`COMMERCIAL` · `active?` | inalterado | `200`, `400`, `401`, `403`, `404`, `422` |
| `POST /api/v1/invitations` | `role` só `ADMIN`/`MANAGER`/`COMMERCIAL` | inalterado | `200`, `400`, `401`, `403`, `409`, `422` (inalterados; o `400` passa a cobrir `OWNER`/`VIEWER`) |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. Papéis do MVP | `enum Role { ADMIN MANAGER COMMERCIAL }`, sem `Member_one_owner`, na migration única `20260924120000_init`: o histórico de migrations foi recriado a partir do `schema.prisma` (decisão do usuário, 2026-09-24: sem produção nem staging publicado), com o SQL que o Prisma não expressa (RLS, políticas, índice parcial de convite, seed do plano `trial`) no fim do arquivo | manter os cinco e só esconder dois no web: cada permissão nova seria decidida para papéis sem uso, e o ADR-016 aceito diz o contrário; migration incremental com conversão de dados: sem produção, só acrescentava SQL e teste sem uso |
| 2. Chave pública do link | `Organization.publicChatKey`: `NOT NULL`, `UNIQUE` global (a `Organization` não tem `organizationId`), 32 caracteres hex minúsculos (`randomBytes(16).toString('hex')` no server). Link `/c/<publicChatKey>` | `/c/<slug>`: bonito, mas não pode ser rotacionado sem quebrar o slug, e o ADR-014 escolheu a chave; `channelId`/`organizationId` no link: expõe identificador interno (ADR-014) |
| 3. Identidade visual na `Organization` | colunas nulas `brandColor` (`#rrggbb`), `greeting` (≤ 500), `logo` (`bytea`), `logoMimeType` (`image/png`, `image/jpeg` ou `image/webp`) e `logoUpdatedAt`. Toda leitura da `Organization` usa `select` explícito, então o `bytea` só sai em `GET …/logo` | tabela `OrganizationBranding` 1:1: uma junção sem regra própria; storage de objeto: saiu na F0 e só volta com anexos (análise §10.4) |
| 4. Formato do upload do logo | `PUT` com JSON `{ image: <base64> }`, ≤ 200 KB decodificado, tipo decidido pelos magic bytes (PNG, JPEG, WebP; SVG recusado). Erros `422 LOGO_TOO_LARGE` e `422 LOGO_UNSUPPORTED_TYPE` | `multipart/form-data`: pede `@fastify/multipart` (dependência nova) e sai do padrão "schema Zod `.strict()` em toda rota"; corpo binário cru: o Orval não gera hook útil e cada rota binária pediria um parser próprio |
| 5. "≥ 1 ADMIN ativo" | no use case, dentro do `withTenant`: `SELECT id FROM "Member" WHERE role = 'ADMIN' AND active ORDER BY id FOR UPDATE` e, se a mudança tira o último ADMIN ativo, `422 LAST_ADMIN` ("A corretora precisa de pelo menos um administrador ativo."). Substitui `OWNER_IMMUTABLE` | trigger ou `CHECK` no banco: um `CHECK` não enxerga outras linhas, e um trigger esconderia uma regra de negócio fora do use case (o repo não tem nenhum); sem lock: dois ADMINs se rebaixando ao mesmo tempo deixariam a corretora sem nenhum |

- Nenhuma dependência nova. Nada mais nesta mudança é difícil de reverter.

## Criteria

### S1: Papéis do MVP e a corretora nunca sem ADMIN (P1)

Só existem ADMIN, MANAGER e COMMERCIAL, e o último ADMIN ativo não sai.

**Acceptance Criteria**

1. The system SHALL aceitar como papel de membro e de convite apenas `ADMIN`, `MANAGER` e `COMMERCIAL`; `OWNER` ou `VIEWER` no corpo de `PATCH /api/v1/members/:id` ou de `POST /api/v1/invitations` SHALL resultar em `400`
2. The system SHALL conceder a matriz: `ADMIN` = `organization:read`, `organization:update`, `invitation:create`, `member:update`, `portfolio:transfer`; `MANAGER` = `organization:read`; `COMMERCIAL` = `organization:read`
3. The system SHALL ter o enum `Role` só com `ADMIN`, `MANAGER` e `COMMERCIAL`, sem o índice `Member_one_owner`
4. IF um `PATCH /api/v1/members/:id` rebaixaria ou desativaria o único ADMIN ativo da organização THEN the system SHALL responder `422` com `code` `LAST_ADMIN`, sem alterar o membro e sem registro de auditoria
5. WHEN a organização tem dois ADMINs ativos e um deles é rebaixado THEN the system SHALL responder `200`, gravar o novo papel e registrar `member.update`
6. WHEN dois `PATCH /api/v1/members/:id` concorrentes rebaixam, cada um, um dos dois únicos ADMINs ativos THEN the system SHALL aplicar exatamente um (`200`) e recusar o outro com `422 LAST_ADMIN`, deixando um ADMIN ativo
7. WHEN um ADMIN rebaixa a si mesmo e existe outro ADMIN ativo THEN the system SHALL responder `200`, e o `GET /api/v1/me` seguinte SHALL trazer as permissões do novo papel
8. WHEN `/settings/members` lista papéis para convite ou alteração THEN the web SHALL oferecer só Administrador, Gerente e Comercial e, no `422 LAST_ADMIN`, SHALL mostrar a mensagem do server

**Independent test:** numa corretora com um ADMIN, tentar rebaixá-lo dá 422; convidar um segundo ADMIN, aceitar, e aí o rebaixamento passa.

### S2: Cadastro vira ADMIN com link do Web Chat (P1)

Quem cria a corretora é ADMIN e vê o link público em Configurações.

**Acceptance Criteria**

9. WHEN `POST /api/v1/onboarding` conclui THEN the system SHALL criar o `Member` do usuário com `role` `ADMIN`, responder `role: 'ADMIN'` e `publicChatKey` com 32 caracteres hex, e registrar `organization.create` com `changes.role = 'ADMIN'`
10. The system SHALL dar a cada organização um `publicChatKey` diferente do de todas as outras
11. The system SHALL guardar o `publicChatKey` como coluna obrigatória da `Organization`
12. WHEN `GET /api/v1/organization` é chamado por qualquer papel THEN the system SHALL devolver o `publicChatKey` da organização ativa, e o de outra organização SHALL nunca aparecer (`withTwoTenants`)
13. WHEN `/settings/organization` carrega THEN the web SHALL mostrar o link `<origem>/c/<publicChatKey>` e um botão Copiar que coloca esse texto na área de transferência

**Independent test:** cadastrar, criar a corretora, abrir Configurações → Corretora e copiar o link.

### S3: Identidade visual (P2)

O ADMIN define cor, saudação e logo, que o Web Chat da F3 vai usar.

**Acceptance Criteria**

14. WHEN um ADMIN envia `PATCH /api/v1/organization/branding` com `brandColor` `#1a2b3c` e `greeting` válida THEN the system SHALL gravar os dois, devolvê-los e registrar `organization.update` com as chaves alteradas
15. IF `brandColor` não casa com `^#[0-9a-f]{6}$` (maiúsculas são normalizadas para minúsculas antes) ou `greeting` tem mais de 500 caracteres depois do `trim` THEN the system SHALL responder `400` sem gravar
16. WHEN `brandColor` ou `greeting` é enviado como `null` THEN the system SHALL apagar o valor gravado
17. IF um MANAGER ou COMMERCIAL chama `PATCH …/branding`, `PUT …/logo` ou `DELETE …/logo` THEN the system SHALL responder `403`
18. WHEN um ADMIN envia `PUT /api/v1/organization/logo` com um PNG, JPEG ou WebP de até 200 KB THEN the system SHALL gravar os bytes e o tipo, atualizar `logoUpdatedAt` e registrar `organization.update` com `changes.logo` em booleanos, sem os bytes
19. IF a imagem decodificada passa de 200 KB THEN the system SHALL responder `422 LOGO_TOO_LARGE`; IF os magic bytes não são de PNG, JPEG ou WebP (inclusive SVG e base64 de texto) THEN `422 LOGO_UNSUPPORTED_TYPE`; IF o `image` não é base64 válido THEN `400`; em todos, nada é gravado
20. WHEN `GET /api/v1/organization/logo` é chamado com logo gravado THEN the system SHALL devolver `200` com os mesmos bytes, o `Content-Type` gravado e um `ETag`; com `If-None-Match` igual SHALL devolver `304`; sem logo SHALL devolver `404`; o logo de outra organização SHALL nunca sair (`withTwoTenants`)
21. WHEN `DELETE /api/v1/organization/logo` é chamado THEN the system SHALL apagar o logo e o tipo, zerar `logoUpdatedAt`, responder `204`, e o `GET …/logo` seguinte SHALL responder `404`
22. WHEN `/settings/organization` carrega THEN the web SHALL mostrar o preview do logo (ou o estado sem logo), a cor e a saudação, com formulário só para quem tem `organization:update`, e o erro do server na tela quando o upload falha

**Independent test:** em Configurações → Corretora, enviar um PNG, ver o preview, trocar a cor, remover o logo.

## Out of scope

| Excluded | Why |
| --- | --- |
| tabela `Channel` e o canal Web Chat padrão | `channels/` é [F2] no `architecture.md`; a F2 cria o `Channel` e o canal padrão de cada organização (ver Assumptions) |
| página do chat em `/c/:key` e rota pública de logo | F3 (ADR-014); o link da F1 ainda não abre um chat |
| rotacionar o `publicChatKey` | o ADR-014 prevê que dá para rotacionar, mas o handoff pede um link estável e nenhum requisito pede isso agora |
| `Organization.status`, `trialEndsAt` e `maxUsers` na organização | F10 (ADR-017); o trial continua no `billing` |
| remover membro | não existe rota de remoção; desativar é o caminho, e o S1 cobre |
| permissão própria para branding (`org:branding`) | `organization:update` já é do ADMIN e cobre o mesmo ato; permissão nova nasce de requisito que a diferencie |
| recortar ou redimensionar o logo | o server guarda o que recebe, dentro do limite |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| onde mora o canal Web Chat padrão | a F1 entrega só o `publicChatKey` na `Organization`; a F2 cria a tabela `Channel`, o canal `WEB_CHAT` de cada organização existente (backfill) e passa a criá-lo no onboarding. O `roadmap.md` e a análise mudam de acordo | o `architecture.md` põe `publicChatKey` na `Organization` [F1] e `Channel`/`channels/` na [F2]; antecipar a tabela criaria o módulo `channels/` sem nenhuma regra dele | y |
| para onde vão os papéis que saem | `OWNER`→`ADMIN`, `VIEWER`→`COMMERCIAL` | `OWNER` tinha as permissões do `ADMIN`; `COMMERCIAL` é o menor privilégio que sobra | y |
| quem edita a identidade visual | só `ADMIN` (`organization:update`) | handoff §7: o ADMIN administra a organização; MANAGER cuida da operação comercial | y |
| valor padrão de cor e saudação | `null` no banco; o padrão visual é decidido na F3, quando o chat existir | nada lê esses campos antes da F3 | y |
| cache do logo | `Cache-Control: private, no-cache` + `ETag` (hash dos bytes); o preview usa `?v=<logoUpdatedAt>` | a rota é autenticada; o cache público com imutabilidade fica para a rota pública da F3 | y |

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/settings/organization` | loading, erro e sucesso da organização | existing - `OrganizationSettings` já trata carregando e erro com "Tentar de novo" |
| screen `/settings/organization` | empty state | AC 22 (sem logo, sem cor, sem saudação) |
| screen `/settings/organization` | unauthorised | AC 22 (sem `organization:update`: só leitura); o server responde 403 (AC 17) |
| screen `/settings/organization` | destructive action confirms | n/a - remover o logo é reversível com um novo upload, e a tela de membros também não confirma a desativação |
| screen `/settings/organization` | density and ordering | n/a - um formulário de uma corretora, sem lista |
| screen `/settings/members` | papéis oferecidos e erro de regra | AC 8 |
| API `PATCH /api/v1/organization/branding` | error shape and codes | AC 15, AC 17; formato `{ error: { code, message } }` existente (`shared/errors.ts`) |
| API `PUT /api/v1/organization/logo` | error shape and codes | AC 19, AC 17 |
| API `GET /api/v1/organization/logo` | error shape and codes | AC 20 |
| API `PATCH /api/v1/members/:id` | error shape and codes | AC 4, AC 1 |
| all new `/api/v1/organization/*` | who may call it | AC 17 (escrita só ADMIN); leitura com `organization:read` (AC 12, AC 20) |
| all new `/api/v1/organization/*` | versioning, rate limits | n/a - o prefixo `/api/v1` já versiona, e as rotas são autenticadas e do painel, sem o rate limit dos canais públicos |
| document `architecture.md` e `roadmap.md` | o que o próximo agente faz | Impact (docs): as marcações [F1] viram [existe] e o canal padrão passa para a F2 |

## Sources

- `docs/decisions/ADR-016-roles-portfolio-assignment.md` - papéis, "≥ 1 ADMIN ativo", RBAC estático
- `docs/decisions/ADR-014-public-channel-identity-consent.md` - `publicChatKey` e o link `/c/`
- `docs/architecture-analysis.md` §10.4 e `docs/handoff.md` §7, §11, §12, §36 - logo `bytea` ≤ 200 KB por magic bytes; papéis; onboarding
