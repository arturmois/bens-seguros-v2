# Harness H2 checks

Profile: light

## Intent

O Checkpoint H2 (`.harness-eval/runs/2026-09-23-h2/`, Tracks A + C) achou três coisas que desviam os agentes das fases 5 a 11. O exemplo canônico de use case em `docs/architecture.md` abre `deps.db.$transaction`, que falha em toda tabela de tenant sob RLS (ADR-004). A regra de tenant do `CLAUDE.md` só cita `withTenant`, sem dizer quando valem `withUser`, `withInvitation`, `withoutTenant`, a lista `SESSION_ONLY` e a organização ativa da sessão (AD-006, AD-007, AD-010). E a família de lições "teste que não discrimina" (L-017, L-029–L-033) apareceu em três features, com um id diferente em cada uma, então o `lessons.py` nunca a promove. Também sai `vercel-react-best-practices` (quase só Next/RSC; o conselho de SWR conflita com Orval + TanStack Query). O `docs/roadmap.md` deixa de citar arquivos que não existem e passa a registrar o resultado do H2. E `.harness-eval/` sai do git. Quando isso for entregue, um agente que copiar o exemplo ou ler a regra de tenant escreve a transação certa e sabe que um acesso novo fora do tenant pede AD, e não um helper novo.

Só docs e harness: nenhum código de produção, nenhuma porta de mão única (tudo volta com `git revert`). Por isso fica só este `checks.md`, sem `plan.md`, mesmo passando de três arquivos: são edições de texto independentes.

11 checks in 3 slices · 0 one-way doors · 0 open

## Checks

### S1 - Tenant e testes no CLAUDE.md e no architecture.md · 2 files · ~40 KB · ~10k

**C1** - O exemplo "Estilo de código do use case" em `docs/architecture.md` abre a transação com `deps.db.withTenant(ctx, async (tx) =>`, e o arquivo não contém `$transaction`
Proof: `bash -c '! grep -n "\$transaction" docs/architecture.md && grep -n "deps.db.withTenant(ctx, async (tx) =>" docs/architecture.md'`

**C2** - A anatomia do módulo em `docs/architecture.md` diz que o repository recebe `(tx, ctx)` e não contém mais `sempre recebem (db, ctx)`
Proof: `bash -c '! grep -n "sempre recebem (db, ctx)" docs/architecture.md && grep -n "(tx, ctx)" docs/architecture.md'`

**C3** - A seção Tenant do `CLAUDE.md` nomeia `withUser`, `withInvitation`, `withoutTenant`, `AD-006`, `AD-007`, `AD-010`, `activeOrganizationId` e `requireTenant`, e a regra de rota nomeia `SESSION_ONLY`
Proof: `bash -c 'for t in withUser withInvitation withoutTenant AD-006 AD-007 AD-010 activeOrganizationId requireTenant SESSION_ONLY; do grep -q "$t" CLAUDE.md || { echo "missing $t"; exit 1; }; done'`

**C4** - Todo helper novo citado no `CLAUDE.md` existe no código com esse nome: `withUser`, `withInvitation` e `withoutTenant` em `apps/server/src/infrastructure/database.ts`, `SESSION_ONLY` e `requireTenant` em `apps/server/src/modules/organizations/tenant-context.ts`
Proof: `bash -c 'for t in withUser withInvitation withoutTenant; do grep -qE "^\s+$t<T>\(" apps/server/src/infrastructure/database.ts || exit 1; done; grep -q "const SESSION_ONLY" apps/server/src/modules/organizations/tenant-context.ts && grep -q "export function requireTenant" apps/server/src/modules/organizations/tenant-context.ts'`

**C5** - A seção Testes do `CLAUDE.md` exige que o teste falhe quando o comportamento é removido e que a precondição do critério seja criada no banco, citando `L-031`, `L-032` e `L-033`
Proof: `bash -c 'awk "/^## Testes/,/^## Antes/" CLAUDE.md | grep -q "falha" && awk "/^## Testes/,/^## Antes/" CLAUDE.md | grep -q "precondição" && for l in L-031 L-032 L-033; do grep -q "$l" CLAUDE.md || exit 1; done'`

### S2 - Skills e roadmap · ~4 files · ~30 KB · ~8k

**C6** - `vercel-react-best-practices` não existe em `.agents/skills/` nem como symlink em `.claude/skills/`, e `skills-lock.json` continua JSON válido sem essa chave
Proof: `bash -c 'test ! -e .agents/skills/vercel-react-best-practices && test ! -L .claude/skills/vercel-react-best-practices && python3 -c "import json,sys; d=json.load(open(\"skills-lock.json\")); sys.exit(\"vercel-react-best-practices\" in d[\"skills\"])"'`

**C7** - Nenhuma superfície que instrui o agente (`CLAUDE.md`, `.agents/skills/**`, `docs/architecture.md`, `docs/migration.md`) cita `vercel-react-best-practices`; em `docs/roadmap.md` ela só aparece nos registros do Checkpoint H1 e H2 (histórico, não instrução)
Proof: `bash -c '! grep -rln "vercel-react-best-practices" CLAUDE.md .agents docs/architecture.md docs/migration.md && ! awk "/^## Checkpoint H1/{h=1} /^## Fase 3/{h=0} /^## Checkpoint H2/{h=1} /^## Fase 5/{h=0} !h" docs/roadmap.md | grep -q vercel-react-best-practices'`

**C8** - `docs/roadmap.md` não cita `audit.repository.ts` nem `with-two-tenants`/`with-two-salespeople`, e a Fase 4 cita `test/factories.ts`
Proof: `bash -c '! grep -nE "audit\.repository\.ts|with-two-tenants|with-two-salespeople" docs/roadmap.md && awk "/^## Fase 4/,/^## Checkpoint H2/" docs/roadmap.md | grep -q "test/factories.ts"'`

**C9** - A seção Checkpoint H2 de `docs/roadmap.md` tem um `Resultado` com a data `2026-09-23` e as linhas `Aplicado` e `Mantido`
Proof: `bash -c 'awk "/^## Checkpoint H2/,/^## Fase 5/" docs/roadmap.md | grep -q "Resultado (2026-09-23)" && awk "/^## Checkpoint H2/,/^## Fase 5/" docs/roadmap.md | grep -q "Aplicado" && awk "/^## Checkpoint H2/,/^## Fase 5/" docs/roadmap.md | grep -q "Mantido"'`

### S3 - Git e gate · 1 file · ~1 KB · ~1k

**C10** - `.harness-eval/` e o `__pycache__/` gerado pelos scripts das skills são ignorados pelo git: `git check-ignore` reconhece um arquivo de cada e `git status --porcelain` não lista nenhum dos dois
Proof: `bash -c 'git check-ignore -q .harness-eval/runs/2026-09-23-h2/claims.md && git check-ignore -q .agents/skills/harness-eval/scripts/__pycache__ && ! git status --porcelain | grep -qE "\.harness-eval/|__pycache__"'`

**C11** - Com o docker compose no ar, o gate do repositório passa depois do commit
Proof: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| propostas do H2 (6) | 1 C1, C2 · 2 C3, C4 · 3 C5 · 4 C6, C7 · 5 C8 · 6 C9, C10 | - |
| caminhos de banco novos no CLAUDE.md (3; `withTenant` já estava) | `withUser` C3, C4 · `withInvitation` C3, C4 · `withoutTenant` C3, C4 | - |
| portas de rota fora do tenant (2) | `SESSION_ONLY` C3, C4 · `activeOrganizationId` (AD-010) C3 | - |
| lugares onde a skill removida existe (3) | `.agents/skills/` C6 · symlink `.claude/skills/` C6 · `skills-lock.json` C6 | - |

- Nenhum check afirma mais do que o caso que a própria prova exercita
- C3, C4, C7 e C10 são `grep`/`git` sobre um arquivo, não uma suíte; C11 é o gate do repositório por natureza (o CLAUDE.md exige os quatro comandos)

## Swept

- validation: n/a - sem entrada de usuário; a mudança é só de texto
- failure modes: C11 (o gate pega referência quebrada em código; só docs mudam)
- idempotency: n/a - sem operação repetível
- authorization: n/a - nenhuma rota ou permissão muda
- concurrency: n/a - sem runtime
- data lifecycle: C10 (artefatos do harness-eval ficam fora do git)
- dependency failure: C6 (o lock de skills continua válido depois da remoção)
- state transitions: n/a - sem máquina de estados
- observability: n/a - sem log ou métrica

## Handoff

- S1–S3 ≈ 8 arquivos (CLAUDE.md, docs/architecture.md, docs/roadmap.md, .gitignore, skills-lock.json, symlink, pasta da skill removida, prompts/prompt-h2.md) ≈ 70 KB lidos ≈ 18k tokens; abaixo do budget de 150k - one builder
