# Paridade legado → v2

> O v2 começa com o **banco vazio**: não há migração de dados.
> A estratégia é de **paridade de comportamento**, não de código: o legado é a especificação executável, com as correções decididas nos ADRs.
> Escopo: tudo o que o legado faz, **exceto metas**. Messenger, Instagram e Embedded Signup ficam adiados.

## 1. Processo por módulo (Fase 6)

1. **Entender o comportamento legado.** Ler o use case, a rota e o spec em `packages/core/src/modules/...` e `apps/server/src/routes/v1/...` (legado em `github.com/arturmois/bens-seguros`). Montar a tabela "regra → teste".
2. **Definir o contrato:** `<x>.schema.ts` e as rotas (`operationId` estável).
3. **Implementar o domínio:** funções puras com teste unitário cobrindo todas as transições.
4. **Implementar a persistência:** repository com `ctx`, `scopeFor` e teste de integração com PG real.
5. **Implementar a API:** permissão, auditoria (sem PII), testes cross-tenant (`withTwoTenants`) e de carteira (`withTwoSalespeople`).
6. **Implementar o frontend:** `pnpm api:generate` → feature com os 4 estados.
7. **Criar os testes:** unitários, integração e e2e dos fluxos críticos.
8. **Validar:** checklist abaixo.
9. **Revisar a complexidade:** *"Existe alguma abstração que podemos remover?"*

## 2. Checklist de paridade

Legenda: **[novo]** = mudança decidida em relação ao legado.

### Auth / Organizations
- [ ] Cadastro com Turnstile, bloqueio de e-mail temporário e `SIGNUP_MODE` (`closed | self_serve`). Verificação de e-mail, reset de senha.
- [ ] Onboarding cria org + OWNER + assinatura em trial. `MAX_ORGS_PER_USER` (padrão 3).
- [ ] Troca de organização ativa, validada contra `Member`.
- [ ] Convites com role e expiração. O aceite checa a quota de usuários do plano.
- [ ] OWNER único e não removível. Mudança de role é auditada.
- [ ] Aceite de termos e privacidade versionado.
- [ ] Super-admin com 2FA obrigatório.
- [ ] **[novo]** Transferência de carteira entre membros (ADMIN/OWNER).

### Contacts / Clients
- [ ] **[novo]** Contato `CHAT_ONLY` fora do CRM. Passa a `QUALIFIED` via `captureLead`, ação do atendente ou criação de proposta.
- [ ] CPF/CNPJ único por org (HMAC) e cifrado. **[novo]** Sem coluna em texto puro.
- [ ] Mascaramento: a lista sempre mascara; o detalhe é completo para OWNER, ADMIN, MANAGER e o COMMERCIAL dono.
- [ ] Soft delete. A exclusão LGPD anonimiza (ADMIN/OWNER) e é auditada sem PII.
- [ ] Promoção de contato a cliente: reaproveita documento igual, bloqueia documento divergente e dispara o auto-complete do checklist.
- [ ] Import CSV (job) e export CSV (streaming).
- [ ] **[novo]** COMMERCIAL vê só a própria carteira.

### Proposals
- [ ] Etapa inicial `CAPTURE`; em `ENDORSEMENT`, `QUOTE`. `advance` anda uma etapa, e nunca a partir de `POLICY_ISSUED` ou `LOST`.
- [ ] Sair de `QUOTE` exige `details`, com o mesmo ramo da proposta (schema por ramo, portado de `insuredObjectDetailsSchema`).
- [ ] Fora de `CAPTURE`, avançar exige todos os itens obrigatórios do checklist.
- [ ] Sair de `PAYMENT` exige contato promovido.
- [ ] `lose` exige motivo e é proibido em `POLICY_ISSUED`/`LOST`. `reopen` volta à etapa inicial.
- [ ] Coberturas com fim > início.
- [ ] Checklist por etapa + ramo (copiar `checklist-config.ts`) e auto-complete por documento. **[novo]** `INSPECTION_REPORT` no enum.
- [ ] Cotação por e-mail com PDF, `sentToClientAt`, validade.
- [ ] Lookup de CEP (ViaCEP) e de placa (Consultar Placa), com cache em tabela e rate limit por usuário.
- [ ] Kanban com arrastar para avançar e reabrir. Visões de tabela e Kanban.
- [ ] **[novo]** Renovação automática: `proposals.create-renewals` cria a proposta `RENEWAL` `renewalLeadDays` antes do fim (padrão 45), copiando contato, vendedor, ramo, seguradora e detalhes. Idempotente por apólice, ignora canceladas, notifica o vendedor.

### Policies
- [ ] Emissão só a partir de proposta em `POLICY_ISSUED`, com seguradora, contato promovido e cliente com endereço. `policyNumber` único por org.
- [ ] **[novo]** Apólice + comissão + etapa + auditoria na mesma transação.
- [ ] **[novo]** Importação sem proposta (`origin: IMPORTED`): cria ou casa o cliente (documento) e a seguradora (nome). Não gera comissão nem entra na conversão, mas gera renovação e alertas.
- [ ] Cancelamento com motivo (não cancela duas vezes). Cron diário de expiração.
- [ ] Endossos com snapshot antes/depois e data efetiva.
- [ ] PDF de resumo. Export CSV.

### Commissions
- [ ] **[novo]** Na emissão: `brokerageAmount = premium × rateBp` e `salespersonAmount = brokerageAmount × splitBp`, congelados. Só se `rateBp > 0`. Idempotente (índice único parcial).
- [ ] Workflow `PENDING_COMMERCIAL → PENDING_ADMIN → APPROVED → PAID`. Rejeição nas pendentes, com motivo. Estorno só de `PAID`, atômico.
- [ ] Notificação e e-mail em aprovação e rejeição. Export CSV.

### Claims / Assistances / Documents
- [ ] `claimNumber` sequencial por org, sem colisão (`OrganizationCounter`).
- [ ] Workflow do sinistro, prioridade, responsável, ocorrências.
- [ ] Status da assistência, prestador, localização.
- [ ] Documentos: tipos, upload validado por magic bytes, download pré-assinado, remoção do storage no delete.

### Chat
- [ ] Canais WhatsApp **Meta Cloud ou Baileys** (um tipo por canal) e widget. Pareamento por QR e por código (Baileys). Alerta de desconexão após 30 min.
- [ ] Conversa inicia em `BOT_ACTIVE` quando há IA ativa no canal; senão em `WAITING_HUMAN`.
- [ ] `assign` só de `WAITING_HUMAN`; `transfer` só em `HUMAN_ACTIVE`; `return-to-bot`, `return-to-queue`, `close`.
- [ ] **[novo]** Fila compartilhada entre quem atende. Contato com vendedor vai para a fila dele.
- [ ] Limite de respostas do bot por conversa. Auto-close por inatividade.
- [ ] Agentes de IA com provedor por agente (**Anthropic ou OpenAI**), `systemPrompt`, `temperature`, `maxTokens` e tools habilitadas. `escalateToHuman` é obrigatória.
- [ ] Tools `listProducts`, `searchClient`, `captureLead` e `collectInsuredAssetData`, agora como chamadas diretas aos módulos.
- [ ] Redação de PII antes do provider. Registro de uso de IA (provedor, modelo, tokens), sem cobrança.
- [ ] Não-lidas por usuário, presença, mídia no storage, expurgo após 730 dias.
- [ ] Refresh do token da Meta. Webhooks da Meta assinados.

### Notifications / Dashboard / Search / Audit
- [ ] Alertas diários idempotentes: apólice vencendo em 30 dias, sinistro parado, comissão pendente, proposta estagnada.
- [ ] In-app com push por socket + e-mail (React Email) para os eventos críticos.
- [ ] Dashboard:
  - propostas por etapa;
  - apólices ativas e vencendo;
  - sinistros por prioridade;
  - comissões (corretora e vendedor);
  - taxa de conversão (sem apólices importadas);
  - tendência de 6 meses;
  - export PDF.
- [ ] Busca global (contatos qualificados, clientes, propostas, apólices), respeitando a carteira.
- [ ] Tela de auditoria (ADMIN/MANAGER/OWNER), sem PII.

### Billing
- [ ] Planos com quotas de usuários e de números de WhatsApp. Trial. Assinatura mensal Asaas (cartão, boleto, PIX). Faturas.
- [ ] Dunning e bloqueio 402 em `PAST_DUE`/`EXPIRED`, com a página "assinatura expirada".
- [ ] `billingManagedExternally` ignora a cobrança.
- [ ] Webhook do Asaas idempotente e reconciliação horária.
- [ ] **Adiado:** excedente de IA, outras quotas, plano anual.

### Admin
- [ ] Lista de tenants, uso de IA por tenant, jobs com falha (re-executar), canais desconectados.
