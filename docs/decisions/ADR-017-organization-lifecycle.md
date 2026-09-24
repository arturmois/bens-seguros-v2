# ADR-017 — Ciclo de vida da organização sem billing automatizado

**Status:** aceito · **Data:** 2026-09-23 · **Revisa** os entitlements do ADR-005 e a quota do ADR-003

## Context
O MVP tem free trial, suspensão e reativação **sem perda de dados** e sem exclusão física no
encerramento (handoff §38–40). Não há cobrança automatizada: Asaas, planos e faturas estão fora
(ADR-011). No código do v2, o trial é uma `Subscription(TRIALING)` ligada a um `Plan` de catálogo, e o
aceite de convite e a reativação de membro checam `Plan.maxUsers`.

## Decision
- **Estado na própria organização:** `Organization.status: TRIAL | ACTIVE | SUSPENDED | CLOSED`,
  `trialEndsAt` e **`maxUsers`** (padrão 10, o §4 do handoff), ajustáveis pelo super-admin. `Plan` e
  `Subscription` saem na F10; até lá continuam como estão.
- **Trial expirado** (`TRIAL` com `trialEndsAt` no passado) é tratado como `SUSPENDED`, calculado na
  leitura; nenhum cron é necessário para bloquear.
- **Organização suspensa, trial expirado ou encerrada:**
  - mensagens recebidas **continuam persistidas** (Web Chat e WhatsApp);
  - IA desativada;
  - Web Chat mostra "atendimento indisponível" para conversas novas; conversas em andamento
    recebem uma resposta automática fixa;
  - painel **somente leitura**: escritas → **402**; leitura liberada.
- **Reativação:** `SUSPENDED → ACTIVE` pelo super-admin, sem migração de dados.
- **Encerramento:** `CLOSED` bloqueia o acesso sem apagar linhas (FKs `RESTRICT` do ADR-004 impedem
  cascade). Anonimização/exclusão LGPD fica para depois.
- A quota de usuários (`maxUsers`) mantém as regras e os testes que já existem, lendo da organização.

## Why
- Sem billing, um catálogo de planos e uma assinatura são duas tabelas sem uso real.
- Nenhuma mensagem é descartada por causa do estado comercial da corretora (§5: perda de dados não é
  aceitável); o bloqueio recai sobre o que custa (IA) e sobre operações novas.
- Estado calculado na leitura evita um cron e a janela entre expirar e bloquear.

## Alternatives considered
- **Manter `Plan` + `Subscription`:** pronto para cobrança futura, mas sem uso no MVP.
- **Sem limite de usuários:** perde um controle que já existe e está testado.
- **Bloqueio total (canais e painel):** os clientes finais da corretora ficariam sem resposta.
- **Bloquear só a IA:** o trial perderia efeito.

## Trade-offs
- Ativação e suspensão são manuais (super-admin) até existir cobrança.
- Quando o billing voltar, o estado sai de uma assinatura; a migração é local ao módulo
  `organizations`.

## Consequences
- F10 implementa o estado, o bloqueio 402 e a remoção de `Plan`/`Subscription` (e do módulo
  `billing`).
- Testes: trial expirado bloqueia escrita e preserva dados; reativação restaura o acesso; mensagem
  recebida com a organização suspensa é persistida.
