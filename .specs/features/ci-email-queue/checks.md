# CI email queue checks

Profile: standard
Plan: none - change under ~3 files, no one-way door (see Intent)

## Intent

The GitHub CI has never passed on `main` (10 of 10 runs red, 2026-09-23 to 2026-09-24): the two
queue tests of `apps/server/src/emails/send-email.spec.tsx` ("delivers each template through the
queue" and "retries a failed send") time out on `expect.poll` after 15 s. Because the deploy
(`cd-vps`) runs only after a green CI, nothing can reach the VPS.

Cause, reproduced locally: `CI=true pnpm exec vitest run --maxWorkers=2` fails the same two tests,
`--maxWorkers=4` passes. With fewer Vitest workers, more test files share one worker schema, and
the files that enqueue `email.send` without starting a worker leave their jobs in
`<schema>_pgboss.job` in state `created` (87 of them ahead of the test's jobs in the reproduced
run). The pg-boss worker takes one job per poll every 2 s, oldest first, so the test's own jobs are
not reached within 15 s. A probe worker on the leftover schema processed exactly 6 jobs in 12 s.

When this ships, each queue test starts from a queue that holds none of the other files' pending
jobs, so it passes regardless of how many files ran before it in the same schema, and the CI goes
green.

3 checks in 1 slice · 0 one-way doors · 0 open

Every command runs from `apps/server` with the dev `docker compose` stack (Postgres, Mailpit) up.

## Checks

### S1 - the queue tests do not depend on the other files' leftovers · 1 file · ~6 KB · ~2k

**C1** - The server suite passes with the worker counts that reproduce the failure: `CI=true pnpm exec vitest run --maxWorkers=1` and `--maxWorkers=2` both exit 0, with the two queue tests of `send-email.spec.tsx` reported as passed
Proof: `CI=true pnpm exec vitest run --maxWorkers=2` exits 0
Proof: `CI=true pnpm exec vitest run --maxWorkers=1` exits 0

**C2** - Before starting its worker, each of the two queue tests removes the `email.send` jobs in state `created` or `retry` from its own `<schema>_pgboss.job`, and only those (jobs of other queues and finished jobs stay)
Proof: `grep -n "state IN ('created', 'retry')" src/emails/send-email.spec.tsx` prints the statement, used by both queue tests
Proof: `CI=true pnpm exec vitest run src/emails/send-email.spec.tsx` exits 0

**C3** - The GitHub CI job `ci` passes on the pushed commit
Proof: `gh run list --workflow CI --limit 1 --json conclusion` shows `success` after the push (needs the user's go-ahead to push)

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| queue tests of `send-email.spec.tsx` (2) | delivers each template C1, C2 · retries a failed send C1, C2 | - |
| worker counts (3) | 1 C1 · 2 C1 · GitHub runner C3 | - |
| leftover job states the worker would fetch (2) | `created` C2 · `retry` C2 | - |

- No check claims more than its proof exercises. C3 is the only proof that runs off this machine.

## Test policy

The repo answers the level question (CLAUDE.md, Testes: real Postgres, no mock). This changes only
test setup, not application code: no new decision in `src/`.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| the setup of the two queue tests | the suite at the worker counts that reproduce the failure | both tests pass with a foreign backlog present (it is present at `--maxWorkers=1` and `2`) |

## Swept

- validation: n/a - no input changes
- failure modes: C1 (the failure reproduced and gone)
- idempotency: C2 (removing no rows is a no-op when the queue is already empty)
- authorization: n/a - test setup only
- concurrency: C2 (files in one worker schema run one after another, so the removed jobs belong to finished files; parallel files use other schemas)
- data lifecycle: n/a - test schemas are dropped at the start of every run (`test/setup-db.ts`)
- dependency failure: n/a - no external dependency changes
- state transitions: n/a - none
- observability: n/a - no log changes

## Handoff

- S1 ≈ 2k, one builder.
- Found while investigating, out of scope: in production the `email.send` worker also takes one job per poll every 2 s (pg-boss defaults: one job per fetch, `pollingIntervalSeconds` 2), so a burst of e-mails drains at about 30 per minute. Reported to the user, not changed here.
