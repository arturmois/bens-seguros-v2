# ADR-002 — PostgreSQL como único serviço de dados (sem MongoDB, sem Redis)

**Status:** aceito, revisado por ADR-011 e ADR-013 (2026-09-23) · **Data:** 2026-09-21

## Revisão (pivot para o MVP, 2026-09-23)
- Continua valendo: só PostgreSQL, sem MongoDB nem Redis; pg-boss; rate limit do Better Auth no banco.
- A lista de models de chat abaixo (`ConversationRead`, `AiAgent`, `Contact` com `CHAT_ONLY | QUALIFIED`) é do ERP: o modelo do MVP está no ADR-013 e em `docs/architecture.md`.
- Mídia no S3 e `VehicleLookupCache` saem (ADR-011): não há anexos nem lookup de placa no MVP.

## Context
O legado usa três serviços de dados:
- **PostgreSQL** para o ERP;
- **MongoDB** em replica set para o chat, com documentos de esquema fixo e relações por ID;
- **Redis** para BullMQ, adapter do Socket.IO, pub/sub de invalidação e cache.

O v2 começa sem dados legados. A escala esperada é de dezenas de corretoras.

## Decision
Só **PostgreSQL**.

- O domínio do chat vai para o Prisma: `Channel`, `Conversation`, `Message`, `ConversationRead`, `AiAgent`, `WhatsAppAuthState`.
- Há um `Contact` único, com `status: CHAT_ONLY | QUALIFIED`.
- O TTL de mensagens vira um job de expurgo.
- A mídia fica no storage S3.
- **Filas e crons:** pg-boss, no próprio PostgreSQL (ADR-006).
- **Rate limit:** Better Auth com `storage: "database"` em `/api/auth/*`; `@fastify/rate-limit` em memória no resto.
- **Cache do lookup de placa:** tabela `VehicleLookupCache` com `expiresAt`.

## Why
- Nenhum requisito precisa de documento flexível nem de um store em memória compartilhado. Com uma instância só, o Redis serviria apenas de transporte para a fila, e o pg-boss faz esse papel no próprio PG.
- Um banco significa uma transação atômica por fluxo, o que inclui **enfileirar o job na mesma transação dos dados**. Significa também um backup, um conjunto de migrations e um modelo de tenancy.

## Alternatives considered
- **Manter o Mongo para mensagens:** não há ganho mensurável na escala esperada.
- **Manter o Redis para filas (BullMQ):** melhor em volume muito alto, mas perde o enfileiramento transacional e acrescenta um serviço.

## Trade-offs
- O PG absorve a carga da fila. É irrelevante com dezenas de corretoras, mas deve ser monitorado.
- Os contadores de rate limit em memória zeram a cada restart. Nas rotas de autenticação isso não acontece, porque os contadores estão no banco.
- Com volume alto de mensagens (dezenas de milhões por tenant), pode ser preciso particionar `Message` por mês.

## Consequences
- O compose de produção fica só com `caddy`, `server`, `postgres` e `migrate`.
- **Gatilho para trazer o Redis de volta:** mais de 1 instância do server (adapter do Socket.IO e rate limit compartilhado) ou volume de jobs que pese no PG. Mesmo nesse caso, existem alternativas em PG (`@socket.io/postgres-adapter` e um store próprio de rate limit).
