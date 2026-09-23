# Docs discoverability checks

Profile: light

## Intent

A auditoria de saúde (2026-09-23) achou três atritos de descoberta sem mudar código de produção: não há `README.md` na raiz (comandos e links de docs ficam só no `CLAUDE.md`); `docs/architecture.md` lista pastas de módulo como se existissem no disco (contacts, clients, chat…), o que confunde agentes; e `apps/server/src/modules/examples/` está vazio após a remoção do exemplo. Quando isso for entregue, um agente novo encontra install/dev/test em 60s, sabe o que já existe vs o que é roadmap, e não abre pasta fantasma.

Só docs e remoção de diretório vazio: nenhuma porta de mão única. Por isso fica só este `checks.md`, sem `plan.md`.

4 checks · 0 one-way doors · 0 open

## Checks

### S1 - Discoverability · 3 files · ~15 KB · ~4k

**C1** - Existe `README.md` na raiz com as strings `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `docker compose`, `CLAUDE.md` e `docs/architecture.md`
Proof: `bash -c 'test -f README.md && for t in "pnpm install" "pnpm lint" "pnpm typecheck" "pnpm test" "pnpm build" "docker compose" "CLAUDE.md" "docs/architecture.md"; do grep -qF "$t" README.md || { echo "missing $t"; exit 1; }; done'`

**C2** - Em `docs/architecture.md`, a árvore de `modules/` marca `auth/`, `organizations/`, `audit/` e `billing/` como implementados (ou billing como parcial) e marca `contacts/`, `clients/`, `proposals/`, `chat/` como planejado/não no disco; o arquivo contém a frase `Status no disco`
Proof: `bash -c 'grep -q "Status no disco" docs/architecture.md && for m in auth organizations audit; do grep -E "├── $m/|│   │   │   │   ├── $m/" docs/architecture.md | grep -qiE "implementado|no disco"; done && grep -E "billing/" docs/architecture.md | grep -qiE "implementado|parcial|trial" && for m in contacts clients proposals chat; do grep -E "$m/" docs/architecture.md | grep -qiE "planejado|não no disco|roadmap"; done'`

**C3** - O diretório `apps/server/src/modules/examples` não existe
Proof: `bash -c 'test ! -e apps/server/src/modules/examples'`

**C4** - O teste de regressão do exemplo continua: `app.spec.ts` ainda exige 404 em `/api/v1/examples/commission-preview`
Proof: `bash -c 'grep -q "examples/commission-preview" apps/server/src/app.spec.ts'`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| quick wins da auditoria (3) | README C1 · architecture status C2 · examples gone C3 | - |
| guard anti-regressão do exemplo (1) | C4 | - |

- Nenhum check afirma mais do que o caso que a própria prova exercita
- C1–C4 são `test`/`grep` sobre arquivos; sem runtime

## Swept

- validation: n/a - sem entrada de usuário
- failure modes: C4 (rota fantasma do exemplo continua coberta)
- idempotency: n/a
- authorization: n/a
- concurrency: n/a
- data lifecycle: n/a
- dependency failure: n/a
- state transitions: n/a
- observability: n/a

## Handoff

- S1 ≈ 3 arquivos (+ checks.md) ≈ 15 KB; one builder
