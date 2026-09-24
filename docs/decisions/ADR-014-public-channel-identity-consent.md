# ADR-014 — Canal público: tenant, identidade por telefone e consentimento LGPD

**Status:** aceito (o opt-in do WhatsApp depende de validação jurídica antes do go-live) · **Data:** 2026-09-23

## Context
O cliente final da corretora fala por um **link público, único e estável**, sem login (handoff §11),
ou pelo WhatsApp. O telefone é o identificador (§9), único por organização, mas no Web Chat ele é
**digitado, não verificado**. A LGPD exige aceite do aviso/termos **antes** do atendimento,
persistido no backend com versão e momento (§41). Canais públicos precisam de rate limiting (§43).

O v2 só conhece dois caminhos de tenant fora da sessão (`withUser`, AD-006; `withInvitation`,
AD-007), e o `CLAUDE.md` exige AD para qualquer caminho novo.

## Decision

### Tenant
- **Uma organização tem um link de Web Chat** (`/c/:slug`), ligado ao seu único canal `WEB_CHAT`,
  criado no onboarding. Vários canais só no WhatsApp (um por número).
- A rota pública resolve o tenant pelo **`publicChatKey`** do link, por um caminho dedicado no
  `database.ts` (mesmo padrão do `withInvitation`: a chave é a capacidade, o `organizationId` sai da
  linha). Daí em diante, `withTenant`. O tenant nunca vem de parâmetro do visitante. Entra como AD
  com política RLS própria na F3.
- No WhatsApp, o tenant vem da linha do `Channel` (ADR-012).

### Identidade do visitante
- O visitante recebe um **token de visitante**: cookie httpOnly, assinado, escopado a
  `/api/public/chat`, vinculado a `(organizationId, contactId, conversationId)`.
- Como o telefone não é verificado, **o visitante só vê as mensagens da conversa criada na própria
  sessão**, nunca o histórico anterior daquele contato. O comercial vê o histórico completo, com o
  canal de origem de cada conversa.
- Namespace Socket.IO próprio para visitantes, autenticado pelo token.

### Consentimento
- `ConsentRecord(contactId, conversationId, channelId, noticeVersion, acceptedAt)`, tenant-scoped.
  Local storage só ajuda a UX; o registro no banco é a fonte de verdade.
- **Web Chat:** checkbox do aviso antes da primeira mensagem; sem aceite, a API recusa (4xx).
- **WhatsApp (opt-in por resposta):** o cliente escreve antes de ver qualquer aviso. A primeira
  resposta envia o aviso com link e pede "responda SIM para continuar". Até a confirmação, as
  mensagens são **persistidas** (nenhuma se perde), mas a IA não processa o conteúdo e nada é
  gravado no lead. O "SIM" grava o `ConsentRecord`. Validação jurídica obrigatória antes do go-live.

### Abuso
`@fastify/rate-limit` em memória: início de conversa por IP e por `publicChatKey`; mensagens por
token de visitante; tamanho máximo de mensagem; Turnstile no formulário de início (já existe no v2).
Sem antifraude.

## Why
- Resolver o tenant por uma chave do link, num caminho igual ao do convite, mantém a regra "o tenant
  nunca vem do request" com um mecanismo que já foi verificado.
- Restringir o visitante à própria sessão fecha o vazamento de histórico a quem digitar o telefone
  de outra pessoa, sem exigir OTP no MVP.
- O mesmo `ConsentRecord` nos dois canais deixa o requisito do §41 auditável por consulta.

## Alternatives considered
- **Link por `channelId` ou `organizationId`:** expõe identificadores internos; o `publicChatKey` pode
  ser rotacionado.
- **OTP por SMS/WhatsApp no Web Chat:** custo e atrito; é a evolução se o risco se materializar.
- **WhatsApp com aviso só informativo (sem aceite):** menos atrito, mas diverge do §41; descartado
  em 2026-09-23.
- **Vários links por organização:** atribuição por campanha, mas além do §11.

## Trade-offs
- O cliente que volta pelo Web Chat não vê o próprio histórico anterior.
- O opt-in do WhatsApp adiciona um passo antes do primeiro atendimento.
- Rate limit em memória zera no restart e vale por instância (ADR-002).

## Consequences
- Revisa o ADR-003 (token de visitante escopado ao canal → este ADR) e o ADR-008/009 (`/embed/*`
  → `/c/:slug`, com o HTML Open Graph servido pela API para o preview do link).
- A lista `SESSION_ONLY` não muda: as rotas públicas ficam em `/api/public/*`, fora de `/api/v1`.
- Testes da F3: link da org A nunca cria dado na org B; visitante não lê conversa anterior do mesmo
  telefone; sem aceite → 4xx; rate limit dispara.
