# ADR-012 — Runtime WhatsApp separado, comunicando com a API pelo PostgreSQL

**Status:** aceito, sujeito ao spike S1 · **Data:** 2026-09-23 · **Substitui** a parte do WhatsApp
do ADR-006

## Context
O WhatsApp do MVP é só via **Baileys** (lib não oficial, uma conexão de longa duração por número). A
corretora pode ter vários números. As conexões precisam funcionar sem nenhum painel aberto,
reconectar sozinhas e pedir novo pareamento quando necessário (handoff §13). O handoff §14 exige
que o processo do Baileys tenha **ciclo de vida independente** da API: um deploy ou crash da API não
pode derrubar as sessões. Isso contradiz o ADR-006, que punha o Baileys no processo do server.

Cada sessão Baileys precisa de **um único dono**: duas conexões do mesmo número se derrubam.

## Decision
- **Um segundo entrypoint, `whatsapp`, do mesmo `apps/server`** e da mesma imagem Docker. Não é um
  pacote nem um serviço à parte: compartilha `modules/*`, `infrastructure/*` e `shared/*`.
- **Dono único:** ao subir, o runtime adquire `pg_advisory_lock(<constante>)` numa conexão dedicada.
  Uma segunda instância (sobreposição num deploy) espera o lock, sem abrir sessões.
- **Boot cross-tenant:** a lista de canais WhatsApp ativos de todas as organizações vem de **uma
  função `SECURITY DEFINER` que devolve apenas `(channelId, organizationId)`**, com AD própria. Daí em
  diante, todo acesso passa por `withTenant` com o `organizationId` da linha do `Channel`, nunca do
  conteúdo da mensagem.
- **Auth state no PostgreSQL, cifrado** com chave dedicada (`WhatsAppAuthState`), implementando o
  `SignalKeyStore` do Baileys. Não se usa `useMultiFileAuthState` (se perde com o container).
- **Comunicação API ↔ runtime só pelo banco:**
  - **comandos** (enviar mensagem, conectar, parear, desconectar) → pg-boss, `enqueue(tx, …)` na
    transação do dado (`whatsapp.send`, `whatsapp.control`), com worker no runtime `whatsapp`;
  - **eventos** (mensagem recebida, status de envio, QR, conexão) → `pg_notify('app_events', …)`
    **dentro da transação**, com payload só de IDs (limite de 8 KB). A API faz `LISTEN` e empurra
    pelo Socket.IO. O `NOTIFY` só é entregue no commit.
  - **Nenhuma API HTTP interna.**
- **Reconexão:** `loggedOut` (401) → canal `NEEDS_PAIRING` + alerta, sem retry; outros motivos →
  backoff exponencial com jitter; após N tentativas → `DISCONNECTED` + alerta. QR e código de
  pareamento são gravados no canal (TTL curto) e avisados por `NOTIFY`.
- **Heartbeat** do runtime a cada 30 s no banco; `/api/ready` e o painel mostram quando está atrasado.
- **Entrega at-least-once:** um crash entre "enviou" e "gravou `SENT`" pode duplicar um envio. É
  aceito e documentado; o S1 verifica se o Baileys aceita `messageId` próprio para reduzir isso.

### Spike S1 (antes da F9, em paralelo a F2/F3, código descartável)
Confirma: segundo entrypoint da mesma imagem; auth state cifrado sobrevive a restart; `enqueue` na
API → worker no runtime; `NOTIFY` do runtime → socket da API em < 2 s; advisory lock impede duas
instâncias; comportamento em `loggedOut`; `messageId` próprio no envio. Se algum item falhar, este
ADR é revisado antes da F9.

## Why
- Ciclo de vida independente (§14) sem microsserviço: o mesmo código e a mesma imagem, só outro
  processo.
- Comando e dado na mesma transação: o pg-boss já é o outbox. Nenhum serviço novo (Redis) e nenhuma
  autenticação interna (HMAC do v1).
- A API fica sem estado e pode ter mais de uma réplica no futuro; o runtime WhatsApp é exatamente 1.

## Alternatives considered
- **Baileys no processo da API (ADR-006):** cada deploy da API derruba todas as sessões; impede
  réplicas da API.
- **HTTP interno com HMAC (v1):** autenticação e retry próprios, e perde a atomicidade com o banco.
- **Redis pub/sub + BullMQ (v1):** um serviço a mais sem requisito que o justifique.
- **Pacote `packages/whatsapp` compartilhado:** é o problema do `packages/core` do v1; o mesmo app
  com outro entrypoint basta.
- **Meta Cloud API:** fora do MVP; é a evolução documentada se o risco de banimento do Baileys se
  materializar.

## Trade-offs
- O pg-boss faz polling: um comando leva alguns segundos para ser pego. Aceitável para envio; por
  isso os eventos de realtime usam `NOTIFY`, não a fila.
- Um `NOTIFY` emitido enquanto a API reconecta ao PG se perde. O banco é a fonte de verdade: ao
  reconectar, o cliente refaz as consultas.
- Dois processos para operar e observar (logs, health e alertas de cada um).
- A função `SECURITY DEFINER` é um caminho fora do tenant; fica restrita a devolver IDs e tem teste.

## Consequences
- O `docker-compose.prod.yml` ganha o serviço `whatsapp` (mesma imagem, `restart: unless-stopped`).
- Novo `infrastructure/events.ts` (`notify(tx, …)` + `LISTEN` na API), criado na F2.
- A fila precisa rodar também no runtime `whatsapp` (mesmo `queue.ts`).
- Revisa ADR-001 (dois entrypoints), ADR-006 (WhatsApp) e ADR-008 (serviço novo no compose).
