> **Arquivado em 2026-09-23 (ADR-011):** prompt de fase do ERP, cancelado pelo pivot para o MVP. Não use como instrução; as fases atuais estão em `docs/roadmap.md`.

Vamos implementar a Fase 2 (Infrastructure) do Bens Seguros v2.

Antes de tudo, leia CLAUDE.md, docs/architecture.md, a seção "Fase 2" de docs/roadmap.md e o ADR-006 (inclui o resultado do spike pg-boss ↔ Prisma).
As decisões já estão tomadas nos ADRs (docs/decisions/); não reabra nenhuma sem me perguntar.
O legado, só para consultar regras, está em /home/ixcsoft/www/bens-seguros.

Escopo: exatamente o que a Fase 2 do roadmap descreve, nada das fases seguintes (sem Better Auth, sem permissões, sem módulos de domínio).
A Fase 1 já está commitada: leia o código existente e siga os padrões dele (estilo, imports com extensão `.ts` no server, error handler, config).
Use a versão estável mais recente de cada dependência nova (Prisma fixo em 7.10.x, o `latest` aponta para o 8.0.0-rc),
consultando a documentação atual pelo Context7.

Pendências da Fase 1 que entram aqui:
- mapear P2002 do Prisma → 409 no error handler;
- `DATABASE_URL`, S3/MinIO e SMTP/Resend em `shared/config.ts` e no `.env.example` (as credenciais de dev estão no `docker-compose.yml`);
- service Postgres 18 no CI, e a checagem de diff do código gerado pelo Orval;
- trocar o fetch temporário de `/api/health` na landing pelo hook gerado pelo Orval.

Pontos de atenção:
- pg-boss: a deduplicação por `singletonKey` só funciona com `policy` declarada na fila (ver ADR-006);
- guard de tenant com operações aninhadas (`include`, `connect`) precisa de teste;
- o módulo "exemplo" é descartável: prove o ciclo schema → rota → OpenAPI → Orval → hook no web e registre como removê-lo
  (ou remova-o ao final, se os testes de infraestrutura já cobrirem o ciclo);
- o pnpm 12 bloqueia pacotes publicados recentemente (`minimumReleaseAge`) e scripts de build (`allowBuilds`);
  ao abrir exceções no `pnpm-workspace.yaml`, me avise no resumo.

A fase termina quando os critérios de aceite dela forem atendidos e
pnpm lint && pnpm typecheck && pnpm test && pnpm build passar (com o Postgres do docker compose no ar).
Faça commits pequenos (Conventional Commits) e, no final, resuma o que foi feito, as decisões que você tomou
e o que ficou para o checkpoint H1 e para a Fase 3.
