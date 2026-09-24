# ADR-013 — Conversa: estado × responsável, ordem, idempotência e fronteira de canal

**Status:** aceito · **Data:** 2026-09-23

## Context
Dois canais reais (Web Chat e WhatsApp) alimentam o mesmo domínio: contato, conversa, mensagem,
lead, IA e handoff (handoff §10). O v1 usava um status único
(`BOT_ACTIVE | WAITING_HUMAN | HUMAN_ACTIVE | CLOSED`), que mistura o estado da conversa com quem a
conduz, guardava mensagens sem índice único em `externalId` (duplicação por corrida) e não garantia
ordem.

Requisitos: nenhuma mensagem perdida, sem duplicação, ordem por conversa, reprocessamento (§5, §15);
estados de envio `PENDING/SENT/FAILED`; conversa fechada reabre ao receber mensagem, preservando o
histórico (§17, §21); só uma ação humana devolve a conversa para a IA (§20).

## Decision

### Estado × responsável
Dois campos independentes em `Conversation`:

- **`status`: `OPEN | WAITING | CLOSED`**
  - `WAITING` = **aguardando o cliente**: a última mensagem foi nossa (IA ou humano). É automático:
    vira `WAITING` ao gravar uma mensagem de saída e volta a `OPEN` quando o cliente escreve. Serve
    ao inbox ("precisa de resposta" × "aguardando cliente") e a um futuro auto-close por
    inatividade (fora do MVP);
  - qualquer estado → `CLOSED` por ação humana;
  - `CLOSED` + mensagem nova do cliente → `OPEN` **na mesma conversa** (histórico preservado).
- **`handler`: `AI | QUEUE | HUMAN`**, com `assigneeId` quando `HUMAN`:
  - `AI → QUEUE` (a IA pede humano, falha definitiva, limite de uso);
  - `AI → HUMAN` e `QUEUE → HUMAN` (humano assume, ou ADMIN/MANAGER atribui);
  - `HUMAN → QUEUE` (devolver à fila) e `HUMAN → AI` (**só por ação explícita do humano**);
  - **proibido:** qualquer transição automática para `AI` a partir de `QUEUE` ou `HUMAN`.
- **Reabertura:** a conversa reaberta volta para `AI` se a IA estiver habilitada (organização e
  canal) e dentro do limite; senão, `QUEUE`. Nunca volta direto para o humano anterior; se ele for o
  dono do contato, é notificado.
- As transições são **funções puras** (`conversation-state.ts`) com teste unitário de todas as
  combinações; o use case as aplica com **update condicional** (`WHERE handler IN (…)`; 0 linhas →
  409).

### Ordem e idempotência
- `Message.seq` por conversa, atribuído com `UPDATE conversation SET lastSeq = lastSeq + 1 …
  RETURNING` na transação da inserção. O lock da linha serializa entradas da mesma conversa;
  conversas diferentes seguem em paralelo. `@@unique([organizationId, conversationId, seq])`.
- Entrada idempotente: índice único parcial `(organizationId, channelId, externalId) WHERE externalId
  IS NOT NULL` + `INSERT … ON CONFLICT DO NOTHING`.
- Uma conversa aberta por contato e canal: índice único parcial `(organizationId, contactId,
  channelId) WHERE status <> 'CLOSED'`.
- Saída: `Message(deliveryStatus: PENDING)` gravada com o job de entrega e o evento na mesma
  transação; o canal marca `SENT` (com `externalId`) ou `FAILED` (com motivo) ao esgotar as tentativas.
- Reprocessar = reenfileirar pelo ID; todo handler checa o estado antes de agir.

### Fronteira de canal
Um contrato pequeno com os dois casos reais, sem interface genérica de provider:

```ts
// entrada: todo canal converte para isto e chama o mesmo use case
receiveInbound(tx, { channelId, externalId, fromPhoneE164, kind: 'TEXT' | 'UNSUPPORTED', text?, sentAt })
// saída: conversations grava Message(PENDING); o canal entrega
deliver(message) // Web Chat: SENT na própria transação + evento · WhatsApp: job `whatsapp.send`
```

A escolha é um `switch` sobre `channel.kind`. Mensagem não textual (`UNSUPPORTED`) é persistida sem
conteúdo e gera uma resposta de orientação (§16). `conversations` não importa `ai` nem o Baileys: o
adapter chama `conversations`, e a IA consome um job.

### Autoria e auditoria
`Message.author: CONTACT | AI | HUMAN | SYSTEM` (+ `authorUserId` quando `HUMAN`). A auditoria
precisa registrar atores que não são usuários (IA, sistema): `AuditLog.actorUserId` deixa de ser
obrigatório e ganha `actorType: USER | AI | SYSTEM`. A AD-008 é revisada na F2, junto com as ações
novas (atribuição, handoff, entrada e saída de humano).

## Why
- Separar estado e responsável elimina combinações ambíguas do v1 e deixa cada regra do handoff
  (§18–21) testável como transição pura.
- `seq` com lock de linha dá ordem total por conversa sem fila por conversa nem serviço externo.
- O único parcial transforma a deduplicação em garantia do banco, não em `findOne` + `create`.
- Dois adapters concretos atrás de dois pontos de entrada bastam; uma abstração maior não tem um
  terceiro caso.

## Alternatives considered
- **Status único (v1):** mistura dimensões e esconde transições proibidas.
- **`WAITING` manual (pausada pelo corretor)** e **sem `WAITING`:** descartados em 2026-09-23; o
  filtro "precisa de resposta" do inbox pesou mais.
- **Reabrir para o dono do contato:** a conversa pararia se ele estivesse ausente.
- **Ordem por `createdAt`:** empates e relógios diferentes entre processos.
- **Interface `ChannelProvider` genérica:** abstração especulativa (§10).

## Trade-offs
- `WAITING` muda a cada mensagem: uma escrita a mais por mensagem, na mesma transação.
- O lock de linha serializa mensagens simultâneas da mesma conversa (irrelevante na escala do MVP).
- Entrega at-least-once no WhatsApp (ADR-012).

## Consequences
- Módulos `contacts`, `conversations` e `channels` criados na F2 (`channels` com os adapters).
- Testes obrigatórios na F2: todas as transições; inbound duplicado; 50 inbounds concorrentes → `seq`
  contíguo; conversa fechada reabre preservando o histórico; evento só após commit.
