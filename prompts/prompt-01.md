> **Arquivado em 2026-09-23 (ADR-011):** prompt de fase do ERP, cancelado pelo pivot para o MVP. Não use como instrução; as fases atuais estão em `docs/roadmap.md`.

Vamos implementar a Fase 1 (Foundation) do Bens Seguros v2.

Antes de tudo, leia CLAUDE.md, docs/architecture.md e a seção "Fase 1" de docs/roadmap.md.
As decisões já estão tomadas nos ADRs (docs/decisions/); não reabra nenhuma sem me perguntar.
O legado, só para consultar regras, está em /home/ixcsoft/www/bens-seguros.

Escopo: exatamente o que a Fase 1 do roadmap descreve, nada das fases seguintes.
Comece com git init. Use a versão estável mais recente de cada dependência (Prisma fixo em 7.10.x),
consultando a documentação atual pelo Context7.

A fase termina quando os critérios de aceite dela forem atendidos e
pnpm lint && pnpm typecheck && pnpm test && pnpm build passar.
Faça commits pequenos (Conventional Commits) e, no final, resuma o que foi feito e o que
ficou para a Fase 2.