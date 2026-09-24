# Harness H3 checks

Profile: light

## Intent

O Checkpoint H3 (`.harness-eval/runs/2026-09-24-h3/`, Track A only, com `docs/architecture.md` e `docs/roadmap.md` no escopo) rodou depois da poda do ERP (F0). O script marcou 19 BROKEN e todos são falso positivo, do mesmo tipo do H2 (diretório checado como arquivo, exemplos genéricos das skills vendoradas, comando de outra stack, caminho relativo a `apps/server`, script fora do `package.json` da raiz). A checagem manual confirmou que todo helper, caminho e comando do `CLAUDE.md` existe, que toda marcação [existe] do `architecture.md` existe e nenhum [Fx] nasceu antes da fase, e que nenhum doc vivo cita o que a F0 removeu. Resta um desvio de consistência: na árvore do `architecture.md`, `scripts/export-openapi.ts` é o único arquivo de `apps/server` sem marcação. Quando isso for entregue, todo arquivo de `apps/server` na árvore tem marcação, e o resultado do H3 fica registrado no roadmap e no `STATE.md`, com a F1 como próximo passo.

Só docs: nenhum código de produção, nenhuma porta de mão única (tudo volta com `git revert`). Três arquivos, então fica só este `checks.md`.

7 checks in 2 slices · 0 one-way doors · 0 open

## Checks

### S1 - Marcação no architecture.md e invariantes do harness · 2 files · ~40 KB · ~10k

**C1** - Na árvore de `docs/architecture.md`, a linha de `scripts/export-openapi.ts` tem a marcação `[existe]`
Proof: `bash -c 'grep -nE "scripts/export-openapi\.ts +# \[existe\]" docs/architecture.md'`

**C2** - Todo caminho marcado [existe] na árvore de `docs/architecture.md` existe em `apps/server`, e todo caminho marcado [Fx] (`contacts`, `conversations`, `channels`, `ai`, `sales`, `followups`, `metrics`, `infrastructure/events.ts`, `whatsapp.ts`) ainda não existe
Proof: `bash -c 'S=apps/server/src; for p in $S/modules/auth $S/modules/organizations $S/modules/audit $S/modules/billing $S/infrastructure/database.ts $S/infrastructure/queue.ts $S/infrastructure/realtime.ts $S/infrastructure/email.ts $S/emails $S/shared $S/app.ts $S/dependencies.ts $S/workers.ts $S/server.ts apps/server/test apps/server/scripts/export-openapi.ts apps/web/e2e; do test -e $p || { echo "missing $p"; exit 1; }; done; for p in $S/modules/contacts $S/modules/conversations $S/modules/channels $S/modules/ai $S/modules/sales $S/modules/followups $S/modules/metrics $S/infrastructure/events.ts $S/whatsapp.ts; do test ! -e $p || { echo "stale Fx $p"; exit 1; }; done'`

**C3** - Todo helper que o `CLAUDE.md` nomeia existe no código com esse nome: `withTenant`, `withUser`, `withInvitation`, `withoutTenant` em `database.ts`; `scopeFor` em `shared/scope.ts`; `requirePermission`, `requireTenant` e `SESSION_ONLY` em `tenant-context.ts`; `enqueue(tx` em `queue.ts`; `record` exportado pelo módulo `audit`; `withTwoTenants` e `withTwoSalespeople` em `test/factories.ts`; e o script `api:generate` no `package.json` da raiz
Proof: `bash -c 'D=apps/server/src/infrastructure/database.ts; for t in withTenant withUser withInvitation withoutTenant; do grep -qE "^\s+$t<T>\(" $D || { echo "missing $t"; exit 1; }; done; grep -q "export function scopeFor" apps/server/src/shared/scope.ts && T=apps/server/src/modules/organizations/tenant-context.ts && grep -q "export function requirePermission" $T && grep -q "export function requireTenant" $T && grep -q "const SESSION_ONLY" $T && grep -q "async enqueue(tx" apps/server/src/infrastructure/queue.ts && grep -q "export { record }" apps/server/src/modules/audit/index.ts && grep -q "withTwoTenants" apps/server/test/factories.ts && grep -q "withTwoSalespeople" apps/server/test/factories.ts && grep -q "\"api:generate\"" package.json'`

**C4** - Fora das seções F0 e Checkpoint H3 (registros) e do Apêndice de `docs/roadmap.md`, nenhum doc vivo (`CLAUDE.md`, `README.md`, `docs/architecture.md`, `docs/runbooks/`, `.env.example`) cita `storage.ts`, `pdf.ts`, MinIO, `S3_`, `commissionSplitBp` ou `migration.md`
Proof: `bash -c '! grep -rniE "storage\.ts|pdf\.ts|minio|S3_|commissionSplit|migration\.md" CLAUDE.md README.md docs/architecture.md docs/runbooks .env.example && ! awk "/^## F0/{h=1} /^## F1 /{h=0} /^# Apêndice/{h=1} !h" docs/roadmap.md | grep -niE "storage\.ts|pdf\.ts|minio|S3_|commissionSplit|migration\.md"'`

### S2 - Registro do resultado e gate · 2 files · ~25 KB · ~7k

**C5** - A seção Checkpoint H3 de `docs/roadmap.md` tem um `Resultado (2026-09-24)` com as linhas `Aplicado` e `Mantido`
Proof: `bash -c 'awk "/^## Checkpoint H3/,/^## F1/" docs/roadmap.md | grep -q "Resultado (2026-09-24)" && awk "/^## Checkpoint H3/,/^## F1/" docs/roadmap.md | grep -q "Aplicado" && awk "/^## Checkpoint H3/,/^## F1/" docs/roadmap.md | grep -q "Mantido"'`

**C6** - A seção MVP de `.specs/STATE.md` registra o H3 fechado e aponta a F1 como próximo passo, e não diz mais que o próximo é o checkpoint H3
Proof: `bash -c 'awk "/^## MVP/,/^## Histórico/" .specs/STATE.md | grep -q "H3 fechado" && awk "/^## MVP/,/^## Histórico/" .specs/STATE.md | grep -qE "Próximo:\*\* F1" && ! grep -q "Próximo:\*\* checkpoint H3" .specs/STATE.md'`

**C7** - Com o docker compose no ar, o gate do repositório passa depois do commit
Proof: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| entregáveis do H3 (4) | marcação no architecture C1 · roadmap C5 · STATE C6 · gates C7 | - |
| observações do prompt do H3 (3) | caminhos/helpers do CLAUDE.md C3 · [existe]/[Fx] do architecture C1, C2 · restos da F0 C4 | - |

- Nenhum check afirma mais do que o caso que a própria prova exercita
- C1–C6 são `grep`/`test` sobre arquivos, não uma suíte; C7 é o gate do repositório por natureza (o CLAUDE.md exige os quatro comandos)
- C2–C4 registram como invariante o que o H3 já confirmou; falham se um [Fx] nascer sem trocar a marcação, se um helper for renomeado ou se um resto da F0 voltar

## Swept

- validation: n/a - sem entrada de usuário; a mudança é só de texto
- failure modes: C7 (o gate pega referência quebrada em código; só docs mudam)
- idempotency: n/a - sem operação repetível
- authorization: n/a - nenhuma rota ou permissão muda
- concurrency: n/a - sem runtime
- data lifecycle: C4 (nada do que a F0 apagou volta a ser citado como vivo)
- dependency failure: n/a - nenhuma dependência muda
- state transitions: n/a - sem máquina de estados
- observability: n/a - sem log ou métrica

## Handoff

- S1–S2 ≈ 4 arquivos lidos (CLAUDE.md, docs/architecture.md, docs/roadmap.md, .specs/STATE.md) ≈ 65 KB ≈ 17k tokens; abaixo do budget de 150k - one builder
