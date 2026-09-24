# Audit actors

> F2, feature 1 de 4 (`audit-actors` → `conversation-core` → `conversations-api` → `realtime-events`). Revisão da AD-008 pedida pelo ADR-013. Perfil: standard.

## Problem

A trilha de auditoria só aceita um usuário como autor: `AuditLog.actorUserId` é obrigatório e tem FK para `User`. A partir da F2, o sistema muda a conversa sozinho: uma mensagem do cliente numa conversa encerrada a reabre e a tira do humano que a atendia (ADR-013), e na F4 a IA muda dados do lead e pede humano. O handoff §35 manda registrar handoff e saída de atendimento humano, e hoje essas linhas não têm como ser gravadas sem inventar um usuário.

A lista de chaves pessoais que a auditoria mascara não inclui as chaves que a F2 introduz: `phoneE164` e `text` (texto de mensagem). Uma chamada descuidada gravaria telefone ou conversa do cliente em `changes`.

Sem incidente: ainda não existe dado de conversa.

Quando isso for entregue, a auditoria registra `USER`, `AI` ou `SYSTEM` como autor, e telefone e texto de mensagem nunca aparecem em `changes`.

## Flow

Reusa o `audit.record` e o denylist que já existem; só o autor muda de forma.

1. use case -> `audit` (exists) - `record(tx, actor, { action, entityId, changes })`, onde `actor` é um contexto com `userId` (autor `USER`) ou uma das constantes `SYSTEM_ACTOR` / `AI_ACTOR` exportadas pelo `audit/index.ts` (door 2)
2. `audit` (exists) - mascara as chaves do denylist, agora com `phoneE164` e `text`, e grava `AuditLog` com `actorType` e `actorUserId` (door 1)

## Impact

| Front | What changes |
| --- | --- |
| domain | termo novo: **ator** da auditoria - `USER` (um usuário, com `actorUserId`), `AI` ou `SYSTEM` (sem usuário). Vive no `audit` |
| domain | `actorUserId` deixa de ser sempre preenchido. Quem ramifica nele hoje: ninguém lê `AuditLog` fora dos testes (`audit.spec.ts`, `branding.spec.ts`, `member.spec.ts`, `invitation.spec.ts`, `organization.spec.ts`, `onboarding.spec.ts`); nenhuma rota expõe a trilha |
| stored data | backfill na migration: toda linha existente ganha `actorType = 'USER'` (todas têm `actorUserId`) |
| callers | os 7 chamadores atuais de `record` passam um contexto com `userId` e continuam iguais |

## Relations

`AuditLog` N:0..1 `User` (antes N:1). One-way constraints: `actorType` obrigatório; `actorUserId` preenchido se e somente se `actorType = USER` (door 1).

## Surface

`None - nenhuma rota lê ou grava auditoria diretamente`.

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. Autor da auditoria | `enum AuditActorType { USER AI SYSTEM }`; `AuditLog.actorType` `NOT NULL` (sem default depois do backfill); `actorUserId` nulo; `CONSTRAINT "AuditLog_actor_check" CHECK (("actorType" = 'USER') = ("actorUserId" IS NOT NULL))` | um `User` "Sistema" fixo: seria uma identidade que pode logar e entraria em `Member`, `Session` e na contagem de usuários; `actorUserId` nulo sem `actorType` e sem `CHECK`: nulo não diz se foi a IA ou o sistema, e uma linha `USER` sem usuário passaria |
| 2. Assinatura do `record` | `record(tx, actor: Pick<RequestContext, 'userId'> \| typeof SYSTEM_ACTOR \| typeof AI_ACTOR, input)`, com `SYSTEM_ACTOR = { actorType: 'SYSTEM' }` e `AI_ACTOR = { actorType: 'AI' }` | um terceiro parâmetro `actorType` opcional: um chamador de sistema poderia esquecê-lo e gravar um `userId` de mentira; união discriminada exigida de todos os chamadores: troca 7 chamadas sem ganho |

- Nada mais nesta mudança é difícil de reverter.

## Criteria

### S1: Autor usuário, IA ou sistema (P1)

Toda linha de auditoria diz quem agiu, inclusive quando não foi uma pessoa.

**Acceptance Criteria**

1. WHEN `record` recebe um contexto com `userId` THEN the system SHALL gravar `actorType = 'USER'` e `actorUserId` igual a esse `userId`
2. WHEN `record` recebe `SYSTEM_ACTOR` THEN the system SHALL gravar `actorType = 'SYSTEM'` e `actorUserId` nulo
3. WHEN `record` recebe `AI_ACTOR` THEN the system SHALL gravar `actorType = 'AI'` e `actorUserId` nulo
4. IF uma linha de `AuditLog` é inserida com `actorType = 'USER'` e `actorUserId` nulo, ou com `actorType` `AI`/`SYSTEM` e um `actorUserId` THEN the database SHALL recusá-la com violação de `CHECK` (`23514`)
5. WHEN a migration roda sobre uma trilha com linhas existentes THEN the system SHALL deixar cada uma delas com `actorType = 'USER'` e o mesmo `actorUserId`
6. The system SHALL manter `actorType` sem valor padrão no banco, de modo que um `INSERT` sem `actorType` falhe (`23502`)

**Independent test:** gravar uma linha com cada tipo de autor e ler de volta; tentar gravar uma linha `USER` sem usuário direto no banco.

### S2: Sem PII das conversas (P1)

**Acceptance Criteria**

7. WHEN `changes` contém a chave `phoneE164` ou `text`, em qualquer nível THEN the system SHALL gravar `"[alterado]"` no lugar do valor, para qualquer tipo de autor
8. The system SHALL manter mascaradas as chaves que já eram (`email`, `name`, `phone`, `document`, `documentEncrypted`, `token`, `password`, `ipAddress`, `userAgent`)

**Independent test:** `record` com `SYSTEM_ACTOR` e `changes: { text: 'oi', nested: { phoneE164: '+55…' } }` grava os dois como `"[alterado]"`.

## Out of scope

| Excluded | Why |
| --- | --- |
| tela ou rota para ler a trilha | nenhum requisito do MVP até a F5 ("trilha de auditoria visível") |
| auditar cada mensagem | §35: "Não criar auditoria completa de cada operação interna" |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| ações novas na lista fechada | a AD nova acrescenta só `conversation.reopen` (autor `SYSTEM`), gravada pela `conversation-core`; atribuição, handoff manual e entrada/saída de humano entram na F3/F5, com as rotas que as produzem | "ação nova entra na AD antes do código", e a F2 só produz a reabertura | n |
| `AI_ACTOR` sem uso na F2 | exportado e testado; o primeiro chamador é a F4 | o ADR-013 define o enum com `AI`; recriar o enum na F4 custaria outra migration | n |

**Open questions:** none - all resolved or logged above.

## Observable

`None - no user-facing surface`

## Sources

- ADR-013 §Autoria e auditoria - `actorType: USER | AI | SYSTEM`, `actorUserId` opcional
- AD-008 (`.specs/STATE.md`) - denylist e lista fechada de ações, revisadas aqui
- handoff §35 - o que registrar
