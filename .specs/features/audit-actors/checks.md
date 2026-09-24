# Audit actors checks

Profile: standard
Plan: `.specs/features/audit-actors/plan.md`

Provas rodam em `apps/server` (`pnpm exec vitest run <arquivo> -t "<nome>"`).

9 checks in 2 slices · 2 one-way doors · 0 open

## Checks

### S1 - Autor usuário, IA ou sistema · 6 files · ~35 KB · ~9k

**C1** - `record(tx, ctx, …)` com um contexto de usuário grava `actorType = 'USER'` e `actorUserId = ctx.userId` (door 2, AC 1)
Proof: `src/modules/audit/audit.spec.ts -t "records a user actor"`

**C2** - `record(tx, SYSTEM_ACTOR, …)` grava `actorType = 'SYSTEM'` e `actorUserId` nulo (door 2, AC 2)
Proof: `src/modules/audit/audit.spec.ts -t "records the system actor without a user"`

**C3** - `record(tx, AI_ACTOR, …)` grava `actorType = 'AI'` e `actorUserId` nulo (door 2, AC 3)
Proof: `src/modules/audit/audit.spec.ts -t "records the ai actor without a user"`

**C4** - No banco, `INSERT` em `AuditLog` com `actorType 'USER'` e `actorUserId` nulo, com `'SYSTEM'` e um `actorUserId`, e com `'AI'` e um `actorUserId` falham com `23514` na constraint `AuditLog_actor_check`; `'SYSTEM'` e `'AI'` sem usuário e `'USER'` com usuário são aceitos (door 1, AC 4)
Proof: `test/schema.spec.ts -t "ties the audit actor type to the actor user"`

**C5** - Numa trilha criada pela migration anterior com duas linhas (dois usuários), aplicar a migration desta feature deixa as duas com `actorType = 'USER'` e os mesmos `actorUserId` (door 1, AC 5)
Proof: `test/schema.spec.ts -t "backfills existing audit rows as user actors"`

**C6** - `INSERT` em `AuditLog` sem a coluna `actorType` falha com `23502`, e `information_schema.columns` mostra `column_default` nulo para `actorType` e `is_nullable = 'YES'` para `actorUserId` (door 1, AC 6)
Proof: `test/schema.spec.ts -t "requires an explicit audit actor type"`

**C7** - Os chamadores atuais continuam gravando autor usuário: o onboarding grava `organization.create` com `actorType 'USER'` e o `actorUserId` do usuário que criou (AC 1)
Proof: `src/modules/organizations/onboarding.spec.ts -t "records organization.create"`

### S2 - Sem PII das conversas · 1 file · ~5 KB · ~1k

**C8** - `record` com `SYSTEM_ACTOR` e `changes: { text: 'olá', phoneE164: '+5511987654321', nested: { text: 'x', phoneE164: '+5511987654321', status: ['CLOSED', 'OPEN'] } }` grava `text` e `phoneE164` como `"[alterado]"` nos dois níveis e mantém `status` (AC 7)
Proof: `src/modules/audit/audit.spec.ts -t "redacts message text and phone for any actor"`

**C9** - As chaves já mascaradas continuam mascaradas (`email`, `name`, `phone`, `document`, `documentEncrypted`, `token`, `password`, `ipAddress`, `userAgent`) (AC 8)
Proof: `src/modules/audit/audit.spec.ts -t "redacts personal fields and keeps the role"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `actorType` values (3) | `USER` C1 · `SYSTEM` C2 · `AI` C3 | - |
| `AuditLog_actor_check` cases (6) | USER+user ok C4 · USER+null rejected C4 · SYSTEM+null ok C4 · SYSTEM+user rejected C4 · AI+null ok C4 · AI+user rejected C4 | - |
| keys newly redacted (2) × levels (2) | `text` top C8 · `text` nested C8 · `phoneE164` top C8 · `phoneE164` nested C8 | - |
| keys already redacted (9) | `email` C9 · `name` C9 · `phone` C9 · `document` C9 · `documentEncrypted` C9 · `token` C9 · `password` C9 · `ipAddress` C9 · `userAgent` C9 | - |
| Landing doors (2) | door 1 C4, C5, C6 · door 2 C1, C2, C3 | - |
| Relations constraints (2) | `actorType` obrigatório C6 · `actorUserId` ⇔ USER C4 | - |
| migration steps (2) | backfill C5 · drop default C6 | - |

- No check claims a route; the plan's Surface is `None`.

## Test policy

Omitted: the repo answers both questions for this change. `audit.record` is a decision (a denylist walk and now an actor branch) already proven at its own layer in `audit.spec.ts` against real PostgreSQL; schema constraints are proven in `test/schema.spec.ts` against the catalog and real inserts.

## Swept

- validation: C4 (the database rejects an inconsistent actor), C6
- failure modes: n/a - `record` runs inside the caller's transaction; a failed insert fails the act, as today
- idempotency: n/a - no retried entry point; each act writes its own row
- authorization: existing - `AuditLog` RLS `tenant_isolation` (`audit.spec.ts` "hides an audit log from the other tenant")
- concurrency: n/a - an insert per act, no shared row
- data lifecycle: C5 (backfill of existing rows)
- dependency failure: n/a - no external dependency
- state transitions: n/a - audit rows are immutable
- observability: C1, C2, C3 (the trail itself records who acted)

## Handoff

- S1 + S2 ≈ 40 KB (`audit.ts` 2 KB, `audit.spec.ts` 5 KB, `schema.spec.ts` 22 KB, `setup-db.ts` 4 KB, `schema.prisma` 9 KB, migration nova) ≈ 10k tokens, under the 150k budget - one builder
