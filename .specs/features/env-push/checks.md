# env-push checks

Profile: standard
Plan: `.specs/features/env-push/plan.md`

35 checks in 6 slices · 3 one-way doors · 0 open

Every command runs from the repo root. Proof tool, new in this feature:

- `node scripts/env-push-smoke.mjs <step>` - copies `scripts/env-push.sh` and `.env.prod.example`
  into a scratch repo (never touches the real `.env.staging`), with `HOME` pointing at a scratch
  home that holds a dummy key and `~/.ssh/bens-known_hosts-staging` (`203.0.113.10 ssh-ed25519 …`).
  An `ssh` stub first on `PATH` appends its argv (JSON) to a calls file and runs its last argument
  with `bash -c`, so the remote commands run for real against a scratch `DEPLOY_PATH`; with
  `STUB_CORRUPT=1` it drops the last line of stdin first. A `docker` stub on the remote `PATH`
  records its argv, answers `volume inspect <name>` with 0 only when `<scratch>/volumes/<name>`
  exists, and exits `STUB_UP_EXIT` (default 0) on `compose … up`. Every run appends stdout and
  stderr to a transcript. `all` runs every step; each step is independent (it builds its own
  scratch).
- Static linter, in Docker: `koalaman/shellcheck`.

The stub means the real `ssh` (host key check, `restrict`) is proven only by argv (C13) and by the
first real use; see Test policy.

## Checks

### S1 - gerar o `.env` do ambiente · 3 files · ~10 KB · ~3k

**C1** - Without `.env.staging`, `env-push.sh staging` fed `staging.bens.test`, `re_key123`, `nao-responda@bens.test`, `site-key-1`, `secret-key-1` on stdin writes `.env.staging` with mode `600` whose key set equals the key set of `.env.prod.example` (all 14) (AC 1)
Proof: `node scripts/env-push-smoke.mjs generate` exits 0

**C2** - In that file `POSTGRES_PASSWORD` and `APP_DB_PASSWORD` each match `^[0-9a-f]{48}$` and differ, `BETTER_AUTH_SECRET` matches `^[A-Za-z0-9+/]{43}=$`; two generations produce different values for all three (AC 2)
Proof: `node scripts/env-push-smoke.mjs generate` exits 0

**C3** - The same file holds exactly `SITE_ADDRESS=staging.bens.test`, `APP_URL=https://staging.bens.test`, `SMTP_URL=smtps://resend:re_key123@smtp.resend.com:465`, `EMAIL_FROM="Bens Seguros <nao-responda@bens.test>"`, `TURNSTILE_SITE_KEY=site-key-1`, `TURNSTILE_SECRET_KEY=secret-key-1`, `HTTP_PORT=80`, `HTTPS_PORT=443`, `POSTGRES_USER=bens`, `POSTGRES_DB=bens`, `SIGNUP_MODE=self_serve`, `LOG_LEVEL=info` (AC 3)
Proof: `node scripts/env-push-smoke.mjs generate` exits 0

**C4** - With a valid `.env.staging` present, a run with stdin holding five junk lines leaves the file byte-identical and the remote `.env` equals it (the junk was not read into it) (AC 4)
Proof: `node scripts/env-push-smoke.mjs existing` exits 0

**C5** - No argument, `dev`, `staging extra`, and `staging --force` each exit `1` with a line starting `env-push: uso:`, create no `.env.*` in the scratch repo and leave the `ssh` calls file empty (AC 5)
Proof: `node scripts/env-push-smoke.mjs usage` exits 0

### S2 - validação antes de qualquer conexão · 2 files · ~8 KB · ~2k

**C6** - For each of the 14 keys of `.env.prod.example`, a valid file with that key removed, and separately with it empty (`KEY=`), exits `1` with the key name in stderr and zero `ssh` calls (AC 6)
Proof: `node scripts/env-push-smoke.mjs validate` exits 0 - table-driven over 14 keys × 2 cases

**C7** - `APP_URL=http://staging.bens.test`, `APP_URL=https://other.bens.test` and `APP_URL=https://staging.bens.test/` each exit `1` naming `APP_URL`, zero `ssh` calls (AC 7)
Proof: `node scripts/env-push-smoke.mjs validate` exits 0

**C8** - `BETTER_AUTH_SECRET` of 31 characters exits `1` naming it, zero `ssh` calls; one of exactly 32 passes validation (AC 8)
Proof: `node scripts/env-push-smoke.mjs validate` exits 0

**C9** - `POSTGRES_PASSWORD` holding `@`, and separately `/`, `:`, `#`, `%` and a space, exits `1` naming it; the same for `APP_DB_PASSWORD`; zero `ssh` calls; `aZ09._~-` passes (AC 9)
Proof: `node scripts/env-push-smoke.mjs validate` exits 0

**C10** - `SMTP_URL` still holding `<RESEND_API_KEY>`, and `SITE_ADDRESS=staging.example.com` with the matching `APP_URL`, each exit `1` naming the key, zero `ssh` calls (AC 10)
Proof: `node scripts/env-push-smoke.mjs validate` exits 0

**C11** - With the key file absent, and separately the known_hosts file absent, the run exits `1` with the missing path in stderr and zero `ssh` calls (AC 11)
Proof: `node scripts/env-push-smoke.mjs missing-files` exits 0

### S3 - envio · 2 files · ~12 KB · ~3k

**C12** - A valid run with no remote `.env` and no volume exits `0`; the remote `DEPLOY_PATH/.env` is byte-identical to the local file, has mode `600`, and no `.env.push` remains (AC 12)
Proof: `node scripts/env-push-smoke.mjs send` exits 0

**C13** - Every recorded `ssh` argv contains `-i <home>/.ssh/bens-deploy-staging`, `-o IdentitiesOnly=yes`, `-o BatchMode=yes`, `-o StrictHostKeyChecking=yes`, `-o UserKnownHostsFile=<home>/.ssh/bens-known_hosts-staging` and the target `deploy@203.0.113.10`; with `SSH_USER=ops SSH_HOST=198.51.100.7` the target is `ops@198.51.100.7` (AC 13)
Proof: `node scripts/env-push-smoke.mjs send` exits 0

**C14** - No recorded `ssh` argv contains the value of `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `BETTER_AUTH_SECRET`, `SMTP_URL` or `TURNSTILE_SECRET_KEY` (AC 14)
Proof: `node scripts/env-push-smoke.mjs send` exits 0

**C15** - With a remote `.env` already present (same database values) and `STUB_CORRUPT=1`, the run exits `1`, the remote `.env` is byte-identical to before, and no `.env.push` remains (AC 15)
Proof: `node scripts/env-push-smoke.mjs corrupt` exits 0

**C16** - With a remote `.env` whose `POSTGRES_USER`, then `POSTGRES_DB`, then `POSTGRES_PASSWORD`, then `APP_DB_PASSWORD` differs from the local file (one at a time), the run exits `1` naming that key, stderr holds neither the old nor the new value, and the remote `.env` is byte-identical to before (AC 16)
Proof: `node scripts/env-push-smoke.mjs db-guard` exits 0 - table-driven over the 4 keys

**C17** - With no remote `.env` and `<scratch>/volumes/bens-seguros-prod_postgres-data` present, the run exits `1` with `banco já existe` in stderr and no remote `.env` is written (AC 17)
Proof: `node scripts/env-push-smoke.mjs volume-guard` exits 0

**C18** - With a remote `.env` equal to the local one except `LOG_LEVEL=debug`, the run exits `0` and the remote `.env` becomes byte-identical to the local file (AC 18)
Proof: `node scripts/env-push-smoke.mjs replace` exits 0

**C19** - The transcript of every step contains none of the secret values the steps used (`POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `BETTER_AUTH_SECRET`, `SMTP_URL`, `TURNSTILE_SECRET_KEY`, generated and fixture) (AC 19)
Proof: `node scripts/env-push-smoke.mjs no-leak` exits 0 - runs the other steps, then reads the transcript

### S4 - aplicar · 1 file · ~6 KB · ~2k

**C20** - With `--apply` and a remote `deploy.env`, the `docker` stub records exactly `compose -f docker-compose.prod.yml --env-file .env --env-file deploy.env up -d --wait --no-build`, run with cwd `DEPLOY_PATH`, after the remote `.env` already equals the local file; exit `0` (AC 20)
Proof: `node scripts/env-push-smoke.mjs apply` exits 0

**C21** - With `--apply` and no remote `deploy.env`, the run exits `0`, the remote `.env` equals the local file, the `docker` stub records no `compose`, and stdout holds `primeiro deploy` (AC 21)
Proof: `node scripts/env-push-smoke.mjs apply-first` exits 0

**C22** - Without `--apply` and with a remote `deploy.env`, the `docker` stub records no `compose` (AC 22)
Proof: `node scripts/env-push-smoke.mjs send` exits 0

**C23** - With `--apply`, a remote `deploy.env` and `STUB_UP_EXIT=1`, the run exits `1`, stderr holds `.env novo já está na VPS`, and the remote `.env` equals the local file (AC 23)
Proof: `node scripts/env-push-smoke.mjs apply-fails` exits 0

**C24** - `scripts/env-push.sh` passes shellcheck
Proof: `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable scripts/env-push.sh` exits 0

### S5 - runbook enxuto e corrigido · 3 files · ~50 KB · ~13k

**C25** - The `## .env` section of `docs/runbooks/deploy.md` contains `scripts/env-push.sh staging` and none of `nano`, `curl`, `sudo -iu deploy` (AC 24)
Proof: `node scripts/env-push-smoke.mjs runbook` exits 0

**C26** - `docs/runbooks/deploy.md` keeps the 16 sections of `cd-vps` C34, in the order of that list with `Chave SSH do deploy` moved before `.env`, and every other assertion of that step still holds (AC 25)
Proof: `node scripts/staging-smoke.mjs runbook` exits 0
Proof: `node scripts/env-push-smoke.mjs runbook` exits 0 - asserts the index of `Chave SSH do deploy` is below the index of `.env`

**C27** - The runbook's `ops` access test is a command containing `ssh`, `-o PasswordAuthentication=no` and `SUDO_OK` (AC 26)
Proof: `node scripts/env-push-smoke.mjs runbook` exits 0

**C28** - The runbook writes `/etc/ssh/sshd_config.d/01-hardening.conf`, does not name `99-hardening.conf`, and after it runs a command holding `sshd -T` and `passwordauthentication` (AC 27)
Proof: `node scripts/env-push-smoke.mjs runbook` exits 0

**C29** - Every occurrence of `ps` as a compose subcommand in the runbook (`dc ps`, `… ps`) is followed by `-a` (AC 28)
Proof: `node scripts/env-push-smoke.mjs runbook` exits 0

**C30** - The runbook's ruleset item contains `pull request` in the same bullet as `Require status checks` (AC 29)
Proof: `node scripts/env-push-smoke.mjs runbook` exits 0

**C31** - The `Problemas comuns` table has a row containing `healthy`, `fora do ar` and `Rollback` (AC 30)
Proof: `node scripts/env-push-smoke.mjs runbook` exits 0

**C32** - `docs/runbooks/deploy.md` has at most 450 lines (AC 31)
Proof: `test "$(wc -l < docs/runbooks/deploy.md)" -le 450` exits 0

**C33** - The runbook's `ssh-keyscan` command writes to `~/.ssh/bens-known_hosts-staging`, and `SSH_KNOWN_HOSTS` is described as the content of that file (AC 32)
Proof: `node scripts/env-push-smoke.mjs runbook` exits 0

**C34** - `.specs/STATE.md` has an `active` row `AD-012` that names `.env.<ambiente>` and `scripts/env-push.sh` and says the GitHub holds no application secret (door 3)
Proof: `grep -E '^\| AD-012 \|.*\.env\.<ambiente>.*scripts/env-push\.sh.*GitHub.*\| active \|' .specs/STATE.md` exits 0

### S6 - achados da verificação, rodada 1 · 2 files · ~25 KB · ~6k

Acrescentado depois do FAIL da rodada 1 (`verification.md`, mutante P1). Nenhum check anterior foi alterado.

**C35** - With a valid `.env.staging` present, `bash -c 'scripts/env-push.sh staging; cat'` fed five junk lines exits `0`, its stdout ends with the five lines (the script consumed none of stdin), and stderr holds no `Domínio` prompt (AC 4)
Proof: `node scripts/env-push-smoke.mjs existing` exits 0

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| keys of `.env.prod.example` (14) | C6, table-driven over all 14; C1 key-set equality | - |
| stdin with an existing file (2) | not rewritten C4 · not consumed C35 | - |
| generated values (3) | `POSTGRES_PASSWORD` C2 · `APP_DB_PASSWORD` C2 · `BETTER_AUTH_SECRET` C2 | - |
| answers read (5) | domain C3 · Resend key C3 · sender C3 · Turnstile site C3 · Turnstile secret C3 | - |
| usage errors (4) | no arg C5 · unknown env C5 · extra arg C5 · unknown flag C5 | - |
| validation rules (6) | present/non-empty C6 · `APP_URL` C7 · secret length C8 · URL-safe passwords C9 · placeholders C10 · key/known_hosts files C11 | - |
| remote states before sending (4) | nothing C12 · volume without `.env` C17 · `.env` same database values C18, C15 · `.env` different database values C16 | - |
| database keys guarded (4) | `POSTGRES_USER` C16 · `POSTGRES_DB` C16 · `POSTGRES_PASSWORD` C16 · `APP_DB_PASSWORD` C16 | - |
| exit codes (2) | `0` C12, C18, C20, C21 · `1` C5-C11, C15-C17, C23 | - |
| `--apply` outcomes (4) | absent C22 · with `deploy.env` C20 · without `deploy.env` C21 · `up` fails C23 | - |
| where a secret could leak (3) | `ssh` argv C14 · script output C19 · error naming a key C16 | - |
| `ssh` options (6) | `-i` C13 · `IdentitiesOnly` C13 · `BatchMode` C13 · `StrictHostKeyChecking` C13 · `UserKnownHostsFile` C13 · target C13 | - |
| Landing doors (3) | 1 C1, C4 · 2 C5, C13 · 3 C34 | - |
| runbook fixes (9) | `.env` section C25 · order C26 · `ops` test C27 · hardening C28 · `ps -a` C29 · ruleset C30 · `up` failure C31 · length C32 · known_hosts C33 | - |

- Claims naming an exit code: C5-C12, C15-C18, C20-C23 - each proof runs the script and reads the exit code
- C13, C14 are argv claims: the real `ssh` is not run (Test policy)

## Test policy

The repo answers the level question for application code (CLAUDE.md, Testes) and not for operator
tooling; this follows `scripts/deploy-smoke.mjs` (feature `cd-vps`).

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| `scripts/env-push.sh` - decides (usage, generate vs existing, 6 validation rules, 4 remote states, hash check, 3 apply branches: 17 branch points) | executed as a process with real `bash`, real files and the remote commands run by real `bash` behind an `ssh` stub; `docker` stubbed only on the remote side | one run per member of each set above |
| the real `ssh` transport (host key, key auth, `restrict`) | argv asserted (C13); proven live by the first real push | n/a - no sshd in the smoke |
| runbook text | read as data | one assertion per fix |

Evidence: 17 branch points in the script (above); closest analogue `scripts/deploy-remote.sh`,
proven by `deploy-smoke.mjs` with a stub `docker` only to prove "not called".

Cost: one new smoke script, ~15 steps. Without these rows the database guard (C16, C17) would be
proven only by the first push that should have been refused.

## Swept

- validation: C5, C6-C11
- failure modes: C15 (truncated transfer), C23 (`up` fails after sending), C11
- idempotency: C18 (pushing again replaces), C4 (existing file never regenerated)
- authorization: C13 (deploy key, pinned host key); the `restrict` on the VPS is the runbook's
- concurrency: n/a - one operator per environment pushes by hand; the swap is a `mv`, so a reader of `.env` sees the old or the new file, never half (C15)
- data lifecycle: C16, C17 (credentials of an existing database never change through this command)
- dependency failure: C15 (transport), C23 (compose); ssh unreachable exits non-zero by `set -e` and `BatchMode` (read in review)
- state transitions: C12 (no `.env` -> `.env`), C18 (`.env` -> new `.env`)
- observability: C19 (no secret in output); the `env-push: …` line format is an Observable decision, read in review

## Handoff

- S1-S5 ≈ 30k (script ~7 KB, smoke ~18 KB, runbook ~25 KB, `staging-smoke.mjs` ~22 KB read, plan/checks ~25 KB), under the 150k budget - one builder
- Mechanism: one builder (under budget, no ask)
- **Round 1 fix (after `verification.md` FAIL):** C35 added for P1 (stdin not consumed when the file exists); the secret prompts (Resend key, Turnstile secret) no longer echo (`read -s`), as the Landing row 2 promised. Known text slips left as they are, since the proofs read the list from the file: `.env.prod.example` has 15 keys, not 14 (C1, C6, Coverage); an unreachable ssh exits through `|| state=$?` and the `*)` branch, not `set -e` (Swept).
