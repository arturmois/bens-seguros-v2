# ADR-015 — IA: fronteira do provider, tools com contexto fixo, execução assíncrona e falha para a fila

**Status:** aceito (modelo exato definido na spec da F4) · **Data:** 2026-09-23

## Context
A IA atende primeiro, coleta dados, resume, usa ferramentas e pede humano (handoff §22), mas **não é
a fonte de verdade**: regras, autorização, estados e persistência são do sistema. Ela não acessa o
banco, não tem SQL nem tool genérica de escrita (§23) e não executa operação comercial crítica (§24).
Se o provider cair, o atendimento vai para a fila humana (§25). Um provider agora, trocável sem
contaminar o domínio (§26). Execução fora da requisição HTTP (§27). Uso atribuível e limitável por
organização (§29).

## Decision
- **Fronteira do provider:** `modules/ai/provider.ts` é o **único arquivo que importa o SDK**. Ele
  expõe `AiModel.generate({ system, messages, tools })` → `{ text, toolCalls, usage, model }` com
  tipos próprios (`ChatTurn`, `ToolSpec` em Zod). Uma implementação. Testes usam um `FakeAiModel`
  roteirizado, sem rede.
- **Provider inicial:** um modelo Claude (Anthropic). A escolha do modelo (qualidade × custo) e a
  variável de configuração são definidas e registradas na spec da F4.
- **Execução assíncrona:** job `ai.reply { conversationId }` (dedupe por conversa, retries com
  backoff):
  1. `withTenant`: lê a conversa; `handler ≠ AI` → termina (um humano assumiu);
  2. checa o limite de uso da organização; excedido → `QUEUE`;
  3. monta o contexto: instruções e branding da organização, campos estruturados do lead, últimas N
     mensagens (sem o telefone);
  4. chama o provider **fora da transação**;
  5. executa as tool calls validadas por Zod, pelos use cases públicos dos módulos;
  6. `withTenant`: revalida `handler = AI` e que não chegou mensagem mais nova; se chegou, descarta a
     resposta e reenfileira; senão grava a mensagem (`author: AI`) + `AiRun` + evento (+ entrega).
- **Falha segura:** falha definitiva do provider, timeout, saída inválida, limite mensal ou limite de
  respostas por conversa → `handler: QUEUE` + mensagem ao cliente. A IA **nunca** sai de `QUEUE`
  sozinha (ADR-013).
- **Tools do MVP:** `get_lead` (leitura do próprio contato), `update_lead_information` (allowlist de
  campos: nome, e-mail, interesse/ramo, observações; auditado com ator `AI`) e `request_human`.
  **`ToolContext = { organizationId, conversationId, contactId }` é fixado pelo sistema**: a IA nunca
  recebe nem informa IDs, tenant ou telefone. **Não existe tool de escrita em `sales`** (mover etapa,
  marcar ganho, alterar valor); um teste de arquitetura impede `ai` de importar use cases de escrita
  de `sales`.
- **Uso e observabilidade:** `AiRun(conversationId, model, inputTokens, outputTokens, latencyMs,
  toolsCalled, outcome: REPLIED | HANDOFF | FAILED | SKIPPED, errorCode)`, tenant-scoped. Limite
  mensal em `Organization.aiMonthlyTokenLimit`, checado antes da chamada. `aiEnabled` por organização
  e por canal.
- **Contexto:** janela das últimas N mensagens + campos estruturados. Resumo e recuperação seletiva
  só quando houver evidência de conversas longas.

## Why
- O `ToolContext` injetado elimina por construção a classe "a IA acessa outro tenant ou outro
  contato".
- Toda falha cai no caminho humano, que existe antes da IA (F3 antes da F4): a conversa nunca fica
  sem dono.
- A revalidação após a geração impede a IA de responder por cima de um humano ou a um contexto velho.
- Uma tabela (`AiRun`) atende atribuição de custo, limite e observabilidade da IA.

## Alternatives considered
- **Chamada síncrona na requisição do cliente:** viola o §27 e prende a resposta HTTP ao provider.
- **Camada multi-provider desde já:** o §26 pede só a fronteira, não várias implementações.
- **Tools recebendo IDs da IA:** exigiria autorizar cada ID; a injeção pelo sistema é mais simples e
  mais segura.
- **IA com tools comerciais (mover etapa):** proibido pelo §24.

## Trade-offs
- Uma chamada ao provider pode ser descartada (humano assumiu, mensagem nova): custo de tokens aceito.
- Respostas da IA levam alguns segundos a mais que o realtime puro, por causa do polling do pg-boss e
  da latência do modelo.

## Consequences
- Módulo `ai` criado na F4; depende de `conversations`, `contacts` e (leitura) `sales`, nunca o
  contrário.
- Testes da F4 cobrem todos os desfechos com `FakeAiModel` (resposta, handoff, falha em todas as
  tentativas, limite, humano assume durante a geração, mensagem nova durante a geração, allowlist).
