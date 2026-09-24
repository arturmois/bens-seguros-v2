# ADR-010 — Carteira do vendedor e modelo de comissão

**Status:** aceito, carteira revisada pelo ADR-016; comissão **substituída** pelo ADR-011 (2026-09-23) · **Data:** 2026-09-21

## Revisão (pivot para o MVP, 2026-09-23)
- **Carteira:** a regra "COMMERCIAL só vê a própria carteira, 404 fora dela" continua, agora por `ownerId`/`assigneeId` e **incluindo a fila** (ADR-016). Fila `WAITING_HUMAN`, `CHAT_ONLY | QUALIFIED` e `captureLead` são do modelo antigo (ver ADR-013).
- **Comissão:** fora do escopo do MVP (ADR-011). A seção *Comissão* abaixo e `Member.commissionSplitBp` não valem mais.
- `withTwoSalespeople()` continua obrigatório, agora para contatos, conversas e oportunidades.

## Context
O legado tem três problemas nesta área:
- a especificação limita o COMMERCIAL à própria carteira, mas o código não aplica essa regra;
- `Member.commissionSplitPercentage` existe e nunca é aplicado;
- a comissão guarda um único valor, sem distinguir o que a corretora recebe do que é repassado ao vendedor.

## Decision

### Carteira
- O COMMERCIAL vê e edita **apenas** a própria carteira:
  - contatos e propostas com `salespersonId = ctx.userId`;
  - clientes ligados a esses contatos;
  - apólices, sinistros, assistências e comissões das suas apólices.
- A regra é aplicada em todos esses repositories via `scopeFor(ctx)`. Registro fora da carteira retorna 404.
- **Transferência de carteira** (`portfolio:transfer`, ADMIN/OWNER) move, numa transação auditada, os contatos, as propostas abertas e as conversas atribuídas.
- **Chat:**
  - a fila `WAITING_HUMAN` é compartilhada entre quem tem `chat:attend`;
  - contato com vendedor → a conversa vai para a fila desse vendedor;
  - quem assume a conversa de um contato sem vendedor passa a ser o vendedor dele quando o contato é qualificado.
- **Contatos do chat:** entram como `CHAT_ONLY`, fora do CRM. Passam a `QUALIFIED` por uma de três vias: tool `captureLead`, ação do atendente, ou criação de proposta.

### Comissão
- **Um vendedor por apólice.**
- A comissão é criada na emissão da apólice (não na importação), apenas se `rateBp > 0`, de forma idempotente (índice único parcial por apólice, sem contar estornos).
- Campos **congelados** na criação: `premiumCents`, `rateBp`, `splitBp` (do membro no momento da emissão), `brokerageAmountCents = premium × rateBp` e `salespersonAmountCents = brokerageAmount × splitBp`. O arredondamento segue `shared/money.ts`.
- O workflow `PENDING_COMMERCIAL → PENDING_ADMIN → APPROVED → PAID` (+ `REJECTED`, `REVERSED`) controla o **repasse ao vendedor**. O dashboard mostra os dois valores.
- **Estorno:** só de `PAID`. Cria um lançamento com os dois valores negativos e marca o original como `REVERSED`, na mesma transação.
- **Apólices importadas** (`origin: IMPORTED`) não geram comissão e não entram na taxa de conversão.

## Why
- A carteira é do vendedor, o que é o comportamento esperado em corretoras.
- Guardar os dois valores, congelados, torna o histórico imutável mesmo se o split mudar depois.

## Alternatives considered
- **Vendedor vê tudo e edita só o próprio:** expõe a carteira alheia.
- **Co-venda com vários vendedores:** sem caso concreto; mudaria o schema e o fluxo de aprovação.
- **Controle separado da receita da corretora:** é praticamente outro módulo (conciliação com a seguradora), uma evolução futura.

## Trade-offs
`scopeFor` precisa estar em todo repository afetado. O esquecimento é detectado por testes de carteira no padrão `withTwoTenants` (vendedor A × vendedor B).

## Consequences
Novo caso de teste obrigatório: `withTwoSalespeople()` para contacts, proposals, clients, policies, claims, assistances, commissions e chat.
