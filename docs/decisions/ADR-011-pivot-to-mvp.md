# ADR-011 — Pivot do repositório de ERP para o MVP de atendimento e comercial

**Status:** aceito · **Data:** 2026-09-23

## Context
O v2 nasceu para reescrever o ERP legado inteiro (apólices, comissões, sinistros, assistências,
documentos, renovação, billing com Asaas, Meta Cloud API). As Fases 1–4 entregaram só a fundação:
auth, organizações, convites, carteira, RLS, auditoria, fila e realtime. Nenhum módulo de ERP existe
no código; o ERP existe apenas nos docs, nos prompts e em dois recursos de infraestrutura (storage S3
e PDF).

O produto mudou (`docs/handoff.md`): o MVP é **captura de leads + atendimento com IA + handoff
humano + acompanhamento comercial de propostas**, para 10–50 corretoras. A análise
(`docs/architecture-analysis.md`) recomendou continuar neste repositório e podar o ERP.

## Decision
- **Continuar no repositório v2**, sem reescrita. A fundação das Fases 1–4 é mantida.
- **Fora do MVP:** emissão de apólice, cotação, integração com seguradoras, comissões, sinistros,
  assistências, documentos/anexos, renovação, endossos, billing automatizado (Asaas, planos,
  faturas), Meta Cloud API, Messenger e Instagram.
- **Storage de objetos e PDF saem** do código (`infrastructure/storage.ts`, `infrastructure/pdf.ts`,
  MinIO no compose e no CI, variáveis `S3_*`). O único uso previsto no MVP seria o logo da corretora,
  que fica no PostgreSQL (`bytea` ≤ 200 KB, tipo confirmado por magic bytes, servido com cache).
  O storage volta quando anexos entrarem no escopo. O backup off-site (ADR-008) não depende disso.
- **Modelo comercial do MVP:**
  - o **lead é o `Contact`** (identificado por telefone, com `leadStatus`); não há tabela de lead;
  - **oportunidade e proposta são uma única entidade, `Opportunity`**. Um contato pode ter várias;
  - o Kanban usa as etapas do v1: `CAPTURE → QUOTE → PROTOCOL → INSPECTION → PAYMENT →
    POLICY_ISSUED | LOST`, **sem** as regras de ERP do v1 (checklist por ramo, dados do bem,
    promoção a cliente). O movimento entre etapas é livre; `POLICY_ISSUED` conta como ganha; `LOST`
    exige motivo; uma oportunidade perdida pode ser reaberta.
- **Documentação:** `docs/architecture.md`, `docs/roadmap.md`, `CLAUDE.md` e `.specs/STATE.md`
  passam a descrever o MVP. `docs/migration.md` (paridade com o ERP) é aposentado.
- **Staging:** publicar o staging na VPS é um marco próprio antes da F3, fora da F0. A F0 fecha com
  CI verde e o smoke local (`scripts/staging-smoke.mjs`).

## Why
- A fundação (RLS, auth, RBAC, auditoria, fila transacional, testes cross-tenant) é o maior ativo do
  v2 e serve ao MVP sem mudança de arquitetura.
- Docs descrevendo o ERP levariam agentes a implementar o produto errado.
- Não há anexo no MVP: manter um serviço de storage (MinIO no dev e no CI, R2 em produção) só para
  um logo não se paga.
- Uma entidade só para oportunidade e proposta basta enquanto não existem cotação por seguradora nem
  várias propostas por oportunidade.

## Alternatives considered
- **Repositório novo:** perderia a fundação testada; descartado em 2026-09-23.
- **Manter o storage S3 para o logo:** um serviço a mais para um arquivo pequeno por organização.
- **Tabela `Lead` separada do `Contact`:** sobrepõe-se à `Opportunity` sem um caso concreto.
- **`Opportunity` e `Proposal` separadas:** fiel ao ERP, mas cotação e seguradoras estão fora.
- **Movimento sequencial no Kanban:** funil mais "limpo" para métricas, mas atrito na prática.
- **Enxugar as etapas do v1:** exigiria uma definição de produto nova (o handoff pede as do v1).

## Trade-offs
- Logo em `bytea` aumenta o tamanho do backup (desprezível: ≤ 200 KB por organização).
- Movimento livre no Kanban torna a "conversão por etapa" uma métrica de onde o card passou, não de
  uma sequência garantida.

## Consequences
- A F0 poda o código e os docs de ERP; F1–F11 constroem o MVP (`docs/roadmap.md`).
- ADRs revisados por este: ADR-002 (models de chat do ERP, mídia no S3, `VehicleLookupCache`),
  ADR-008 (`/embed/*`), ADR-010 (comissão substituída).
- O histórico do v2 (Fases 1–4, `.specs/features/*`, `docs/legacy-analysis.md`) fica como registro;
  o legado continua sendo referência de comportamento (etapas do Kanban, tools do bot, reconexão do
  Baileys), não de arquitetura.
