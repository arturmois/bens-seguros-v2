# Harness H3 verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 0517e3c..4e5673a
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All 7 checks are proven at `4e5673a`. Every proof was re-run by the Verifier at HEAD, and each of
C1–C6 was made to fail once by a discrimination probe on the working tree, which was then restored
with `git checkout -- <file>` (or `rmdir`) and the proof re-run green. The full gate (C7) passed.
One factual imprecision in the added prose is recorded under "Prose review". It does not fail a
check: no check claims it, and the change is docs-only and reverts with `git revert`.

The diff (`git diff --stat 0517e3c..4e5673a`) touches only `.specs/STATE.md` (+2 −1),
`.specs/features/harness-h3/checks.md` (new), `docs/architecture.md` (+1 −1) and
`docs/roadmap.md` (+4). No production code changed.

## Binding sources

Profile `light`: step 1 does not run. The plan is `checks.md` only (a three-file docs change with
no `plan.md`), and it marks no binding source.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `scripts/export-openapi.ts` line of the tree carries `[existe]` | `grep -nE "scripts/export-openapi\.ts +# \[existe\]" docs/architecture.md` exit 0. Probe: marker stripped with `sed` → exit 1; restored → exit 0 | `docs/architecture.md:91` - `│   │   └── scripts/export-openapi.ts # [existe] openapi.json sem subir o server (base do `pnpm api:generate`)` | PASS |
| C2 | every [existe] path exists; every [Fx] path does not yet | the `test -e` / `test ! -e` loop from checks.md, exit 0. Probes: `mkdir apps/server/src/modules/contacts` → `stale Fx apps/server/src/modules/contacts`, exit 1; moving `apps/server/scripts/export-openapi.ts` away → `missing apps/server/scripts/export-openapi.ts`, exit 1; both restored → exit 0 | tree `docs/architecture.md:62-95` ([existe] on lines 66-69, 78-81, 83-88, 90, 91, 94; [Fx] on 70-76, 82, 89); file `apps/server/scripts/export-openapi.ts:21` - `await writeFile(output, …)` | PASS |
| C3 | every helper CLAUDE.md names exists under that name | the grep chain from checks.md, exit 0. Probes: `withInvitation<T>(` renamed in `database.ts` → `missing withInvitation`, exit 1; `withTwoSalespeople` renamed in `factories.ts` → exit 1; both restored → exit 0 | `apps/server/src/infrastructure/database.ts:33` `withTenant<T>(`, `:44` `withUser<T>(`, `:53` `withInvitation<T>(`, `:62` `withoutTenant<T>(`; `apps/server/src/shared/scope.ts:5` `export function scopeFor`; `apps/server/src/modules/organizations/tenant-context.ts:21` `const SESSION_ONLY`, `:51` `export function requireTenant`, `:69` `export function requirePermission`; `apps/server/src/infrastructure/queue.ts:54` `async enqueue(tx: Transaction, …)`; `apps/server/src/modules/audit/index.ts:1` `export { record } from './audit.ts'`; `apps/server/test/factories.ts:28` `withTwoTenants`, `:34` `withTwoSalespeople`; `package.json:16` `"api:generate"` | PASS |
| C4 | no living doc cites what F0 removed, outside F0/H3 and the Appendix | the negated grep + awk from checks.md, exit 0. Probes: `MinIO` appended to `README.md` → hit `README.md:55`, exit 1; `usa storage.ts` inserted under `## F1` of roadmap → hit, exit 1; both restored → exit 0. Positive control: `grep -ciE` for `minio` or `migration.md` over `docs/roadmap.md` = 8 (hits exist, all inside the exempted F0/H3/Appendix ranges) | exempted hits `docs/roadmap.md:29` (F0), `docs/roadmap.md:40-41` (H3), `docs/roadmap.md:170`, `:199`, `:212`, `:231` (Appendix, from `docs/roadmap.md:159` `# Apêndice`) | PASS |
| C5 | Checkpoint H3 section has `Resultado (2026-09-24)` with `Aplicado` and `Mantido` | the three awk/grep from checks.md, exit 0. Probes: roadmap reverted to `0517e3c` → exit 1; `**Mantido:**` line deleted → exit 1; restored → exit 0 | `docs/roadmap.md:38` `- **Resultado (2026-09-24):** …`, `docs/roadmap.md:40` `- **Aplicado:** …`, `docs/roadmap.md:41` `- **Mantido:** …` (section `docs/roadmap.md:33` to `:43`) | PASS |
| C6 | STATE MVP section records H3 closed, next = F1, no longer next = H3 | the awk/grep from checks.md, exit 0. Probe: STATE reverted to `0517e3c` → exit 1; restored → exit 0 | `.specs/STATE.md:24` `- **Checkpoint H3 fechado (2026-09-24):** …`; `.specs/STATE.md:25` `- **Próximo:** F1. …` (section `.specs/STATE.md:18` to `:28`) | PASS |
| C7 | repository gate passes after the commit | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` with docker compose postgres up, exit 0 | lint: `Checked 154 files … No fixes applied.`; typecheck: server and web `Done`; test: `Test Files 29 passed (29)`, `Tests 272 passed (272)`; build: server `Done`, web `✓ built in 1.18s` | PASS |

## Coverage

Profile `light`: the Coverage recompute does not run. The artifact's two rows (4 H3 deliverables,
3 H3 prompt observations) each map to a check above that was run and made to fail once.

## Swept existing

The `Swept` rows resolving to a check (failure modes → C7, data lifecycle → C4) point at proofs
run above. All other rows are `n/a` (policy the user approved).

## Prose review

Claims in the added prose (`docs/roadmap.md:38-41`, `.specs/STATE.md:24-25`, `docs/architecture.md:91`)
checked against the repo:

| Claim | Where | Evidence | True |
| --- | --- | --- | --- |
| `export-openapi.ts` writes the `openapi.json` Orval reads, without starting the server | `docs/architecture.md:91` | `apps/server/scripts/export-openapi.ts:18` `await app.ready()` (no `listen`), `:20` `new URL('../openapi.json', …)` → `apps/server/openapi.json`; `apps/web/orval.config.ts:7` `input: { target: '../server/openapi.json' }`; `package.json:16` `api:generate` runs `openapi:export` then web `api:generate`; `apps/server/package.json:14` `openapi:export: tsx scripts/export-openapi.ts` | yes |
| 19 BROKEN, all false positive, in the listed families | `docs/roadmap.md:39`, `.specs/STATE.md:24` | `.harness-eval/runs/2026-09-24-h3/04-correctness.json` holds 19 BROKEN rows: dirs checked as files (`apps/server`, `.agents/skills`), vendored-skill generics (`lib/...`, `test/...`, `.cursor/skills`, `bin/console`, `bin/rails`, `references/view.md`), other-stack commands (`npm i`, `yarn test:unit`, `yarn test:e2e`), `scripts/export-openapi.ts` relative to `apps/server` (A019, A020), `pnpm --filter @bens/server db:migrate` (A022; `db:migrate` is at `apps/server/package.json:12`, not in root `package.json`) | yes |
| reports live outside git in `.harness-eval/runs/2026-09-24-h3/` | `docs/roadmap.md:38` | directory exists; `git check-ignore` returns it | yes |
| orphan MinIO container left the local environment | `docs/roadmap.md:40` | `docker ps` lists no minio container; `docker-compose.yml` has no minio | yes |
| Appendix still cites MinIO and `migration.md`; F1–4 `plan.md`s cite those sections | `docs/roadmap.md:41` | `docs/roadmap.md:170`, `:199`, `:212` (MinIO), `:231` (`docs/migration.md`); `.specs/features/{auth-core,org-core,org-web}/plan.md` reference the Appendix | yes |
| vendored skills owned upstream via `skills-lock.json` | `docs/roadmap.md:41` | `skills-lock.json` exists at repo root | yes |
| `shared/permissions.ts` has a matrix with a snapshot test | `.specs/STATE.md:25` | `apps/server/src/shared/permissions.ts:15` `ROLE_PERMISSIONS: Record<Role, …>`; `apps/server/src/shared/permissions.spec.ts:5` `it('matches the role permission snapshot'` asserting `toEqual({ OWNER: [...], ... })` (a literal snapshot, not a Vitest snapshot file) | yes |
| `Member_one_owner` exists | `.specs/STATE.md:25` | `apps/server/prisma/migrations/20260922210000_org_core/migration.sql:63` `CREATE UNIQUE INDEX "Member_one_owner"` | yes |
| onboarding still calls `billing.startTrial` | `.specs/STATE.md:25` | `apps/server/src/modules/organizations/onboarding.ts:7` imports `startTrial` from `../billing/index.ts`, `:35` `await startTrial(tx, now)` | yes |
| `scopeFor` touched by the `Role` rework; `channels/` is [F2] | `.specs/STATE.md:25` | `apps/server/src/shared/scope.ts:6` branches on `ctx.role === 'COMMERCIAL'`; `docs/architecture.md:72` `channels/ # [F2]` | yes |
| `export-openapi.ts` was the **only file without a marker** in the tree | `docs/roadmap.md:40` (also `checks.md` Intent: "a árvore tem uma marcação em cada arquivo") | after the change the tree still names files with no marker: `docs/architecture.md:63` `prisma/{schema.prisma, migrations/}`, `:96` `docker-compose.yml # dev: postgres, mailpit`, `:98` `Caddyfile  .github/workflows/ci.yml  CLAUDE.md` (and the `apps/web/src/{…}` line `:93`) | **no - overstatement** |

**Finding (precision, non-blocking):** "único arquivo sem marcação na árvore" (`docs/roadmap.md:40`)
and the Intent's "a árvore tem uma marcação em cada arquivo" are false as written. They hold only
for the `apps/server/src` + `test/` + `scripts/` entries, not for the whole tree. No check encodes
the claim (C1 asserts only the one line), so it does not fail the verdict. A one-word fix, e.g.
"único arquivo do server sem marcação", would make it true.

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` - exit 0; 29 test files, 272 passed, 0 failed.

Working tree after all probes: `git status --porcelain` empty except this report.
