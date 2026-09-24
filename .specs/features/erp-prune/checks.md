# ERP prune checks

Profile: standard
Plan: `.specs/features/erp-prune/plan.md`

30 checks in 4 slices · 2 one-way doors · 0 open

Proof command prefix for the server, omitted below when a proof starts with `src/` or `test/`:
`pnpm --filter @bens/server exec vitest run`. Every other command runs from the repo root and is
written in full. `<base>` is the feature base commit (`db84b0b`).

## Checks

### S1 - o server roda sem storage e sem PDF · 21 files · 76 KB · ~19k

**C1** - `loadConfig` com só as variáveis obrigatórias restantes (`DATABASE_URL`, `SMTP_URL`, `EMAIL_FROM`, `APP_URL`, `BETTER_AUTH_SECRET`), sem nenhuma `S3_*`, devolve o objeto exato com os padrões, sem nenhuma chave `S3_*` (AC 1)
Proof: `src/shared/config.spec.ts -t "applies defaults to the optional variables"`

**C2** - O entrypoint do server (`src/server.ts`), com o role owner e sem nenhuma `S3_*` no ambiente, passa da validação de config e sai com código `1` e `Database role "bens" bypasses row level security` no stderr (AC 2, assembly: boot)
Proof: `test/boot.spec.ts -t "refuses to boot with a role that bypasses row security"`

**C3** - O app de teste, montado sem nenhuma `S3_*`, responde `GET /api/health` com `200` e corpo `{ "status": "ok" }` (AC 2, assembly: test harness)
Proof: `src/app.spec.ts -t "returns ok with a request id header"`
Proof: `rg -n "S3_" apps/server/src apps/server/test` exits 1

**C4** - O script `export-openapi.ts` gera o `openapi.json` sem nenhuma `S3_*` (AC 2, assembly: export script)
Proof: `rg -n "S3_" apps/server/scripts` exits 1
Proof: `pnpm --filter @bens/server openapi:export` exits 0

**C5** - `apps/server/package.json` e o `pnpm-lock.yaml` não contêm `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` nem `@react-pdf/renderer` (AC 3)
Proof: `rg -n "@aws-sdk/client-s3|@aws-sdk/s3-request-presigner|@react-pdf/renderer" apps/server/package.json pnpm-lock.yaml` exits 1

**C6** - `apps/server/src/infrastructure/` não tem `storage.ts`, `storage.spec.ts`, `pdf.ts` nem `pdf.spec.tsx`, e nenhum arquivo do server importa `storage` ou `pdf` de `infrastructure` (AC 4)
Proof: `test ! -e apps/server/src/infrastructure/storage.ts && test ! -e apps/server/src/infrastructure/storage.spec.ts && test ! -e apps/server/src/infrastructure/pdf.ts && test ! -e apps/server/src/infrastructure/pdf.spec.tsx` exits 0
Proof: `rg -n "infrastructure/(storage|pdf)|deps\.storage|ensureBucket" apps/server/src apps/server/test apps/server/scripts` exits 1

**C7** - `docker-compose.yml` declara exatamente os serviços `mailpit` e `postgres`, e nenhum volume `minio-data` (AC 5)
Proof: `test "$(awk '/^services:/{f=1;next} /^[a-z]/{f=0} f && /^  [a-z][a-z0-9-]*:$/{print $1}' docker-compose.yml | tr -d ':' | sort | tr '\n' ' ')" = "mailpit postgres "` exits 0
Proof: `rg -n -i "minio" docker-compose.yml` exits 1

**C8** - `.github/workflows/ci.yml` não inicia nenhum container MinIO nem passa `S3_*` a nenhum job (AC 5)
Proof: `rg -n -i "minio|S3_" .github/workflows/ci.yml` exits 1

**C9** - `scripts/staging-smoke.mjs all` termina com exit code `0` e a lista de módulos carregados na imagem não inclui `infrastructure/pdf.js` nem `infrastructure/storage.js` (AC 6)
Proof: `node scripts/staging-smoke.mjs all` exits 0
Proof: `rg -n "infrastructure/(pdf|storage)" scripts/staging-smoke.mjs` exits 1

### S2 - a API de membros não expõe comissão · 12 files · 153 KB · ~38k

**C10** - `GET /api/v1/members` por OWNER e por ADMIN responde `200` e cada item tem exatamente as chaves `id`, `userId`, `role`, `active`, `email`, `name` (asserção por igualdade do objeto, não `toMatchObject`) (AC 7)
Proof: `src/modules/organizations/member.spec.ts -t "lists members newest first including inactive"`

**C11** - `GET /api/v1/members` sem sessão responde `401` (Surface, status 401)
Proof: `src/modules/organizations/member.spec.ts -t "requires a session to list members"`

**C12** - `GET /api/v1/members` por MANAGER, COMMERCIAL e VIEWER responde `403` `FORBIDDEN` (Surface, status 403)
Proof: `src/modules/organizations/member.spec.ts -t "rejects listing members without member:update"`

**C13** - `PATCH /api/v1/members/:id` com `{ role }` válido responde `200` com exatamente as chaves `id`, `userId`, `role`, `active`, `email`, `name` (asserção por igualdade das chaves) (AC 8)
Proof: `src/modules/organizations/member.spec.ts -t "changes a member role and records the audit"`

**C14** - `PATCH /api/v1/members/:id` com um corpo que não é `role` nem `active` responde `400` (Surface, status 400)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a member body that is not a role or an active flag"`

**C15** - `PATCH /api/v1/members/:id` sem sessão responde `401` (Surface, status 401)
Proof: `src/modules/organizations/member.spec.ts -t "requires a session"`

**C16** - `PATCH /api/v1/members/:id` por um papel sem `member:update` responde `403` (Surface, status 403)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a member change from a role without member:update"`

**C17** - `PATCH /api/v1/members/:id` para um id inexistente responde `404` (Surface, status 404)
Proof: `src/modules/organizations/member.spec.ts -t "returns not found for an unknown member"`

**C18** - `PATCH /api/v1/members/:id` no OWNER responde `422` `OWNER_IMMUTABLE` (Surface, status 422)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a change to the owner"`

**C19** - Depois de aplicar todas as migrations, a tabela `Member` do schema do worker não tem a coluna `commissionSplitBp` e mantém `id`, `organizationId`, `userId`, `role`, `active`, `createdAt`, `updatedAt` (AC 9)
Proof: `test/schema.spec.ts -t "Member carries no commission column"`

**C20** - Uma migration nova, posterior a `20260923133344_user_last_active_organization`, contém literalmente `ALTER TABLE "Member" DROP COLUMN "commissionSplitBp";` e `schema.prisma` não declara o campo (door 1)
Proof: `rg -n --fixed-strings 'ALTER TABLE "Member" DROP COLUMN "commissionSplitBp";' apps/server/prisma/migrations` exits 0
Proof: `rg -n "commissionSplitBp" apps/server/prisma/schema.prisma` exits 1

**C21** - `pnpm api:generate` não produz diff em `apps/server/openapi.json` nem em `apps/web/src/api/`, e nenhum dos dois contém `commissionSplitBp`; os `operationId` `listMembers` e `updateMember` continuam no `openapi.json` (AC 10, door 2)
Proof: `pnpm api:generate && git diff --exit-code -- apps/server/openapi.json apps/web/src/api` exits 0
Proof: `rg -n "commissionSplitBp" apps/server/openapi.json apps/web/src` exits 1
Proof: `rg -c '"operationId": "(listMembers|updateMember)"' apps/server/openapi.json` prints `2`

**C22** - Uma transferência de carteira cujo move grava numa coluna de `Member` que não é `commissionSplitBp` responde `200` `{ transferred: 2 }` e a gravação persiste (AC 16)
Proof: `src/modules/organizations/member.spec.ts -t "adds the rows a registered move reports"`

**C23** - Uma transferência cujo segundo move lança responde `500`, desfaz a gravação do primeiro move (numa coluna de `Member` que não é `commissionSplitBp`) e não grava auditoria (AC 16)
Proof: `src/modules/organizations/member.spec.ts -t "rolls back the transfer when a move throws"`

**C24** - O onboarding cria o `Member` com `role: 'OWNER'` e `active: true`, e o aceite de convite cria o `Member` com o papel do convite e `active: true`, com as demais asserções dos dois testes inalteradas (AC 16)
Proof: `src/modules/organizations/onboarding.spec.ts -t "creates the organization, the owner and the trial"`
Proof: `src/modules/organizations/invitation.spec.ts -t "accepts the invitation and switches the active organization"`

### S3 - nenhum doc vivo aponta para o ERP · 11 files · 92 KB · ~23k

**C25** - Cada arquivo `prompts/*.md`, `docs/legacy-analysis.md` e `docs/original-brief.md` tem, nas 3 primeiras linhas, um aviso de arquivado que cita `ADR-011` (AC 11)
Proof: `for f in prompts/*.md docs/legacy-analysis.md docs/original-brief.md; do head -3 "$f" | rg -q "ADR-011" || { echo "$f"; exit 1; }; done` exits 0

**C26** - Nenhuma ocorrência (sem diferenciar maiúsculas) de `minio`, `S3_` ou `commissionSplit` em `README.md`, `docs/runbooks/staging.md`, `.env.example`, `.env.prod.example`, `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.staging-local.yml` e `scripts/staging-smoke.mjs` (AC 12)
Proof: `rg -n -i "minio|S3_|commissionSplit" README.md docs/runbooks/staging.md .env.example .env.prod.example docker-compose.yml docker-compose.prod.yml docker-compose.staging-local.yml scripts/staging-smoke.mjs` exits 1

**C27** - `docs/architecture.md` não contém `storage.ts`, `pdf.ts`, `minio` nem `sai na F0` (AC 13)
Proof: `rg -n -i "storage\.ts|pdf\.ts|minio|sai na F0" docs/architecture.md` exits 1

### S4 - nenhuma regressão na fundação · 0 extra files · ~0k

**C28** - Os quatro gates terminam com exit code `0` (AC 14)
Proof: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exits 0

**C29** - `test/architecture.spec.ts` não muda; `test/boot.spec.ts` só perde linhas `S3_*`; `test/schema.spec.ts` só ganha o teste de C19; e os três passam (AC 15)
Proof: `pnpm --filter @bens/server exec vitest run test/schema.spec.ts test/architecture.spec.ts test/boot.spec.ts` exits 0
Proof: `git diff --exit-code <base>..HEAD -- apps/server/test/architecture.spec.ts` exits 0
Proof: `git diff <base>..HEAD -- apps/server/test/boot.spec.ts | rg '^[-+][^-+]' | rg -v 'S3_'` exits 1
Proof: `git diff <base>..HEAD -- apps/server/test/schema.spec.ts | rg '^-[^-]'` exits 1

**C30** - Os nomes de teste que existiam em `<base>` e não existem em `HEAD` são exatamente os 2 listados em *Tests removed or changed*; nenhum outro teste some (AC 16)
Proof: `pnpm --filter @bens/server exec vitest list` em `<base>` e em `HEAD` (worktree limpo em cada um), `comm -23` das listas ordenadas imprime exatamente `src/infrastructure/storage.spec.ts > storage (MinIO) > uploads, serves through a pre-signed attachment URL and deletes` e `src/infrastructure/pdf.spec.tsx > renderPdf > renders a React PDF document to a PDF buffer`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| startup config without `S3_*` (4 assemblies) | boot `server.ts` C2 · test harness `test/app.ts` C3 · export script `scripts/export-openapi.ts` C4 · staging image C9 | - |
| removed dependencies (3) | `@aws-sdk/client-s3` C5 · `@aws-sdk/s3-request-presigner` C5 · `@react-pdf/renderer` C5 | - |
| removed files (4) | `storage.ts` C6 · `storage.spec.ts` C6 · `pdf.ts` C6 · `pdf.spec.tsx` C6 | - |
| MinIO start points (3) | dev compose C7 · CI C8 · staging smoke C9 | - |
| `GET /api/v1/members` statuses (3) | 200 C10 · 401 C11 · 403 C12 | - |
| `PATCH /api/v1/members/:id` statuses (6) | 200 C13 · 400 C14 · 401 C15 · 403 C16 · 404 C17 · 422 C18 | - |
| `memberOutput` keys (6) | `id` C10, C13 · `userId` C10, C13 · `role` C10, C13 · `active` C10, C13 · `email` C10, C13 · `name` C10, C13 | - |
| one-way doors (2) | door 1 migration C19, C20 · door 2 contract C10, C13, C21 | - |
| writers of `Member` that set `commissionSplitBp` today (3) | onboarding C24 · invitation accept C24 · portfolio move probe C22, C23 | - |
| archived documents (8) | `prompt-01.md` C25 · `prompt-02.md` C25 · `prompt-03.md` C25 · `prompt-04.md` C25 · `prompt-05.md` C25 · `prompt-h2.md` C25 · `legacy-analysis.md` C25 · `original-brief.md` C25 | - |
| living docs and config free of ERP terms (9) | `README.md` C26 · runbook C26 · `.env.example` C26 · `.env.prod.example` C26 · `docker-compose.yml` C26 · `docker-compose.prod.yml` C26 · `docker-compose.staging-local.yml` C26 · `staging-smoke.mjs` C26 · `architecture.md` C27 | - |

- Claims naming a status code, route or response shape: C3, C10–C18 - each proof crosses the HTTP boundary with `app.inject`.
- C1 is table-free: one exact-object assertion over the whole default set.
- No other check claims more than the single case its proof exercises.

## Tests removed or changed

The plan calls this list the *Test policy*. No new decision code enters, so the repo's own rule
(`CLAUDE.md` › Testes) answers level and coverage; this section only records what the removal does
to existing tests. Nothing else may change.

| Test | Action | Why |
| --- | --- | --- |
| `infrastructure/storage.spec.ts` › `uploads, serves through a pre-signed attachment URL and deletes` | removed with the file | the behaviour is removed (ADR-011) |
| `infrastructure/pdf.spec.tsx` › `renders a React PDF document to a PDF buffer` | removed with the file | the behaviour is removed (ADR-011) |
| `config.spec.ts` › `applies defaults to the optional variables` | `S3_*` keys leave the input and the expected object | the variables no longer exist; the exact-object assertion stays |
| `config.spec.ts` › `coerces numbers and booleans from environment strings` | the boolean case moves from `S3_FORCE_PATH_STYLE` to `TRUST_PROXY` | the coercion is still asserted on a variable that exists |
| `config.spec.ts` › `requires the infrastructure variables and checks URL protocols` | the `/S3_BUCKET/` expectation leaves | the variable is no longer required |
| `boot.spec.ts` (2 tests), `signup-gates.spec.ts`, `test/app.ts` | `S3_*` entries leave the environment | assemblies without `S3_*` are the claim of C2/C3 |
| `member.spec.ts` › `lists members newest first including inactive` | `toMatchObject` with `commissionSplitBp` becomes an exact-object assertion without it | C10 |
| `member.spec.ts` › `changes a member role and records the audit` | gains an exact-keys assertion on the `200` body | C13 |
| `member.spec.ts` › `requires a session to list members` | new | C11 (Surface status 401 had no proof) |
| `member.spec.ts` › `adds the rows a registered move reports`, `rolls back the transfer when a move throws` | the probe column moves from `commissionSplitBp` to another `Member` column; the transfer, rollback and audit assertions stay | the tests prove the transfer transaction, not commission |
| `onboarding.spec.ts` › `creates the organization, the owner and the trial`; `invitation.spec.ts` › `accepts the invitation and switches the active organization` | `commissionSplitBp: 0` leaves the `toMatchObject` | the column no longer exists; role and active stay asserted |
| `test/schema.spec.ts` › `Member carries no commission column` | new | C19 |

## Swept

- validation: existing - `loadConfig` still rejects missing `DATABASE_URL`, `SMTP_URL`, `EMAIL_FROM`, `APP_URL`, `BETTER_AUTH_SECRET` (`config.spec.ts`); C1 proves the removed keys are no longer required
- failure modes: C23 (the transfer transaction still rolls back after the probe change)
- idempotency: n/a - removal only; no operation is retried or deduplicated
- authorization: C12, C16 (member routes keep `requirePermission`)
- concurrency: existing - `keeps a single reactivation when two race for the last seat` is untouched and runs in C28
- data lifecycle: C19, C20 (column dropped by migration; no production data, dev values are the default `0`)
- dependency failure: C2, C3 (boot and requests no longer depend on an object store being reachable or configured)
- state transitions: n/a - no state machine changes
- observability: n/a - no log, metric or health output changes; `/api/health` body stays `{ "status": "ok" }` (C3)

## Handoff

- S1 = 19k (server infra, config, CI, compose); S2 enters `organizations` at 57k; S3 enters docs at
  80k; S4 adds no files. Total ~80k, under the 150k budget - one builder.
- Mechanism: one builder (fits; no ask).
- C9 needs the `docker` CLI inside WSL (Docker Desktop WSL integration) - plan assumption, confirmed.

- **Progress:** S1 (C1-C8) green; C9 (staging smoke) runs after S3
- **Progress:** S2 (C10-C24) green
- **Settled mid-build:** in this shell `rg` is a function over Claude Code's bundled ripgrep, and the `rtk` hook rewrites it into a missing binary, so every `rg` proof "exits 1" even on a match. The `rg` proofs run as `ARGV0=rg ~/.local/bin/claude <same args>` (a known match exits 0 there, a miss exits 1). Same arguments, same claim.
- **Progress:** S3 (C25-C27) green
