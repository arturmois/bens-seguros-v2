# ADR-006 — Jobs (pg-boss) e realtime (Socket.IO) no processo do server

**Status:** aceito, **parcialmente substituído** pelo ADR-012 (2026-09-23) · **Data:** 2026-09-21

## Revisão (pivot para o MVP, 2026-09-23)
- **Continua valendo:** pg-boss via `infrastructure/queue.ts` com `enqueue(tx)` transacional, handlers idempotentes, dedupe por fila; Socket.IO no processo da API com auth por cookie.
- **Substituído pelo ADR-012:** todo o item *WhatsApp* abaixo. O Baileys roda num runtime próprio (`whatsapp`), não no processo do server; não há `WhatsAppProvider` nem Meta Cloud API no MVP; a comunicação com a API é pg-boss (comandos) + `NOTIFY` (eventos).
- O namespace `/widget` dá lugar ao namespace de visitante do Web Chat (ADR-014). Os trade-offs "restart derruba as sessões" e "não dá para escalar a API" deixam de valer.

## Context
O legado roda BullMQ em dois workers e Socket.IO num chat-server, conectados por Redis pub/sub. A escala esperada é de dezenas de corretoras com 1 a 3 números de WhatsApp cada. O Baileys mantém uma conexão de longa duração por número, e cada sessão precisa de um único dono.

## Decision
- **pg-boss** no processo do server, para filas e crons (`tz: America/Sao_Paulo`). Os módulos usam **somente** `infrastructure/queue.ts`:
  - `enqueue(tx, name, payload, { singletonKey?, delaySeconds? })`: **transacional**, porque o job só existe se a transação confirmar;
  - `registerWorker(name, handler, { concurrency, retries, backoff })`;
  - `schedule(name, cron, { tz })`.

  A interface expõe apenas o que o BullMQ também oferece. Os handlers são idempotentes. Um teste proíbe importar `pg-boss` fora do `queue.ts`.
- **Socket.IO** no mesmo servidor HTTP, com rooms `org:*`, `user:*` e `conversation:*` e namespace `/widget`. Sem adapter.
- **WhatsApp:** interface `WhatsAppProvider` com duas implementações, `MetaCloudProvider` e `BaileysProvider`. **Um tipo por canal, sem fallback automático.** O `WhatsAppSessionManager` conecta as sessões Baileys ativas no boot e as encerra no shutdown gracioso. O estado de autenticação fica cifrado no PG. Um canal desconectado por mais de 30 min gera alerta para o admin da org e para o super-admin.

## Validação (spike 2026-09-21)
Testado com pg-boss 12.33.3, Prisma 7.10.0 (`@prisma/adapter-pg`) e PostgreSQL 18:
- **Enfileiramento transacional funciona.** Adapter: `{ executeSql: (text, values) => tx.$queryRawUnsafe(text, ...values).then(rows => ({ rows })) }`, passado em `send(..., { db })`. Com commit, o job existe; com rollback, o job não existe; o worker processa só os jobs confirmados.
- **Deduplicação é configurada na fila**, e não por job: `createQueue(name, { policy: 'short' })` + `singletonKey` deduplica jobs enfileirados (na mesma transação e entre transações diferentes). Na fila padrão, o `singletonKey` **não** deduplica. Por isso, `queue.ts` declara a política no registro da fila, e a idempotência de negócio (ex.: um alerta por entidade por dia) continua garantida pelo handler e por índices únicos no banco.

## Why
- Um processo cobre a carga com folga.
- O enfileiramento transacional elimina uma classe de bugs: e-mail ou notificação disparados para uma mudança que sofreu rollback.
- Sem Redis, há um serviço a menos (ADR-002).

## Alternatives considered
- **BullMQ + Redis:** mais rápido em volume alto e com o Bull Board, mas sem atomicidade com os dados e com um serviço extra.
- **Workers separados:** isolamento desnecessário na escala atual.
- **Fallback Baileys → Meta no mesmo número:** tecnicamente inviável (o número não pode estar nos dois ao mesmo tempo).
- **Fallback para um número secundário:** confunde o cliente final.

## Trade-offs
- Um restart derruba as sessões Baileys por alguns segundos. Elas reconectam com o estado salvo.
- Não dá para escalar a API horizontalmente enquanto o Baileys estiver no mesmo processo.
- O dashboard de filas é próprio e simples (tela de admin com jobs que falharam e opção de re-executar).

## Consequences
- **Custo de migrar para BullMQ depois:** ~1 a 2 dias, restrito ao `queue.ts`. Para manter a atomicidade, é preciso uma tabela outbox com relay após o commit.
- **Gatilho para um processo separado** (mesma imagem, entrypoint `worker.ts`): mais de 1 réplica da API (o Baileys vai para um processo dono das sessões, e entra o adapter do Socket.IO), jobs afetando a latência, ou processamento pesado.
