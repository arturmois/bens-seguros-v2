# Paridade legado → v2 (aposentado)

> **Aposentado em 2026-09-23** pelo pivot para o MVP ([ADR-011](./decisions/ADR-011-pivot-to-mvp.md)).
> Paridade com o ERP legado deixou de ser meta. Não use este arquivo como fonte de regras.
> Conteúdo anterior: `git show d817950:docs/migration.md`.

O arquivo continua existindo porque os `plan.md` e `verification.md` das Fases 3–4 o citam.

## Para onde foram as regras do legado que valem no MVP

| Regra do legado | Onde está agora |
| --- | --- |
| Etapas do Kanban (`CAPTURE → … → POLICY_ISSUED \| LOST`), `LOST` com motivo, reabrir | ADR-011 (sem checklist, dados do bem ou promoção a cliente; movimento livre) |
| Handoff por update condicional, fila compartilhada | ADR-013, ADR-016 |
| Limite de respostas do bot por conversa, `escalateToHuman` obrigatória | ADR-015 (`request_human`, falha → fila) |
| Pareamento por QR e por código, reconexão com backoff, alerta de desconexão após 30 min | ADR-012 |
| Cadastro, convites, troca de organização, termos, 2FA, super-admin com 2FA | já implementados nas Fases 3–4 (`docs/roadmap.md`, apêndice) |

Requisitos do MVP: [`handoff.md`](./handoff.md). Fases: [`roadmap.md`](./roadmap.md).
