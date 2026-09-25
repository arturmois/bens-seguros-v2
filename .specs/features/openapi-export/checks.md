# OpenAPI export checks

Profile: standard
Plan: none - change under three files with no one-way door

## Intent

Desde `efa85c0` (`realtime-events`), o `onReady` do `buildApp` liga o listener de eventos (`deps.events.start()`). O `scripts/export-openapi.ts` chama `app.ready()` com uma `DATABASE_URL` placeholder sem senha, e o `pg` lança uma exceção não tratada (`SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`). Por isso `pnpm api:generate` falha: o passo "Generated API client is up to date" do CI está vermelho no `main` desde `d788b69`, e o deploy do staging não roda.

Quando a correção entrar, o export volta a gerar o `openapi.json` sem conectar a nada, como o comentário do script promete, e o CI do `main` volta a ficar verde.

1 check · 0 one-way doors · 0 open

## Checks

### S1 - Export sem conexão · 1 file · ~2 KB · ~1k

**C1** - `pnpm api:generate` (from the repo root) exits 0 with the placeholder config of `scripts/export-openapi.ts`, the events listener is never started by it, and it leaves no diff in `apps/server/openapi.json` nor `apps/web/src/api`
Proof: `pnpm api:generate && git add --all --intent-to-add apps/server/openapi.json apps/web/src/api && git diff --exit-code -- apps/server/openapi.json apps/web/src/api` (from the repo root)
Proof: `grep -c "events: { ...deps.events, start: async () => {} }" apps/server/scripts/export-openapi.ts` prints `1`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| assemblies that call `buildApp` and reach `onReady` (1 changed) | `export-openapi.ts` C1 | - |

- `server.ts` and `buildTestApp` are not touched: the listener still starts there (`realtime-events`, `conversation-events.spec.ts`).

Test policy: the repo answers it (a build script is proven by running it, as the CI step does).

## Swept

- validation: n/a - no input
- failure modes: C1 (the export no longer depends on a database)
- idempotency: C1 (a second run leaves no diff)
- authorization: n/a - build script
- concurrency: n/a - one process
- data lifecycle: n/a - nothing stored
- dependency failure: C1 (no database is needed)
- state transitions: n/a - no state in a build script
- observability: n/a - no log or metric requirement

## Handoff

- S1 ~1k tokens (`export-openapi.ts` 1 KB, `app.ts` 6 KB read), under the 150k budget - one builder
