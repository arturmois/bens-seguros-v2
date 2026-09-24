# env-push verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 9bff3ef..8c4aaab (13a9a9a, 3605705, 6b6bc9b, 8c4aaab)
**Round**: 2 - scoped (fix diff 6b6bc9b..8c4aaab: `scripts/env-push.sh` +10 -4, `scripts/env-push-smoke.mjs` +13 -3, checks.md adds S6/C35)
**Verifier**: independent sub-agent (author != verifier)

The round-1 finding is fixed: mutant P1 (`cat >/dev/null` before the generate branch) is now
killed by C35. Every proof passes at `8c4aaab`, and the new silent-prompt branch in `ask` is
covered by C3 and C19.

A new mutant survives on the same claim. If the `</dev/null` is dropped from the ssh call that
reads the remote state (`scripts/env-push.sh:147`), `existing` still passes. Real `ssh` without
`-n` or a stdin redirect reads the caller's stdin and forwards it to the remote. The stub at
`scripts/env-push-smoke.mjs:66-72` does not: it hands stdin to `bash -c "$cmd"`, and since the
remote command never reads it, nothing is consumed. So C35 proves "the script does not read
stdin", but not "the script's `ssh` calls do not read stdin". AC 4 ("SHALL read nothing from
stdin") covers both. The code at HEAD is correct: every non-send `ssh` call has `</dev/null`
(`:147`, `:175`). What is missing is a proof that fails if either redirect is removed.

## Binding sources

Carried from 6b6bc9b: none. The fix did not touch the plan's Sources, and the profile is not `ui`.

## Checks

Verified at 8c4aaab. `node scripts/env-push-smoke.mjs all` exited 0 and printed all 15 steps with
556 `ok -` lines and 0 `not ok` (round 1: 550; the difference is C35's 3 assertions plus the
generate step's larger secret set). Each step appears in the output on its own line. I refreshed
the citations in the two files the fix touched: smoke assertions after `:280` moved down 10
lines, and script lines after `:43` moved down 6.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | generated `.env.staging`, mode 600, key set = example's | `env-push-smoke.mjs generate` exit 0 | `scripts/env-push-smoke.mjs:230` `mode(LOCAL) === 0o600`; `:232-235` key-set equality (output: "holds exactly the 15 keys") | PASS (precision gap: 15 keys, not 14) |
| C2 | 48-hex passwords that differ; 44-char base64; new on each generation | `generate` exit 0 | `scripts/env-push-smoke.mjs:236-242`, `:267-268` | PASS |
| C3 | the 12 literal values | `generate` exit 0 | `scripts/env-push-smoke.mjs:256-257` `values[key] === value`; `:259-261` `EMAIL_FROM` regex | PASS |
| C4 | existing file byte-identical; remote equals it | `existing` exit 0 | `scripts/env-push-smoke.mjs:279` `read(LOCAL) === text`; `:280` `read(REMOTE_ENV) === text` | PASS |
| C5 | 4 usage errors | `usage` exit 0 | `scripts/env-push-smoke.mjs:299-306` `code === 1`, `/^env-push: uso:/m`, `sshCalls().length === 0` | PASS |
| C6 | each key absent/empty rejected, no ssh | `validate` exit 0 | `scripts/env-push-smoke.mjs:312-315` loop over `EXAMPLE_KEYS`; `:212-214` | PASS (loop covers 15 keys) |
| C7 | 3 wrong `APP_URL`s | `validate` exit 0 | `scripts/env-push-smoke.mjs:316-322` | PASS |
| C8 | 31 rejected, 32 accepted | `validate` exit 0 | `scripts/env-push-smoke.mjs:323` `rejects('secret of 31', …)`; `:324` `accepts('secret of 32', …)` | PASS |
| C9 | unsafe password characters rejected; `aZ09._~-` accepted | `validate` exit 0 | `scripts/env-push-smoke.mjs:325-330` | PASS |
| C10 | placeholders rejected | `validate` exit 0 | `scripts/env-push-smoke.mjs:331-340` | PASS |
| C11 | missing key / known_hosts | `missing-files` exit 0 | `scripts/env-push-smoke.mjs:350-352` `stderr.includes(path)`, `sshCalls().length === 0` | PASS |
| C12 | remote `.env` byte-identical, 600, no `.env.push` | `send` exit 0 | `scripts/env-push-smoke.mjs:363-366` | PASS |
| C13 | ssh options and target; override | `send` exit 0 | `scripts/env-push-smoke.mjs:378` `joined.includes(option)`; `:380` `argv.includes('deploy@203.0.113.10')`; `:392-395` `ops@198.51.100.7` | PASS |
| C14 | no secret in ssh argv | `send` exit 0 | `scripts/env-push-smoke.mjs:383` `!joined.includes(values[key])` | PASS |
| C15 | truncated transfer | `corrupt` exit 0 | `scripts/env-push-smoke.mjs:406-408` | PASS |
| C16 | DB guard over 4 keys | `db-guard` exit 0 | `scripts/env-push-smoke.mjs:421-428` | PASS |
| C17 | volume without `.env` | `volume-guard` exit 0 | `scripts/env-push-smoke.mjs:438-440` | PASS |
| C18 | same DB values, other key differs → replaced | `replace` exit 0 | `scripts/env-push-smoke.mjs:450-451` | PASS |
| C19 | no secret in any transcript | `no-leak` exit 0 ("none of the 624 secrets") | `scripts/env-push-smoke.mjs:506` `secrets.size > 20`; `:508` `leaked.length === 0` | PASS |
| C20 | exact compose argv, cwd, `.env` already new | `apply` exit 0 | `scripts/env-push-smoke.mjs:463-474` | PASS |
| C21 | no `deploy.env`: no compose, `primeiro deploy` | `apply-first` exit 0 | `scripts/env-push-smoke.mjs:483-486` | PASS |
| C22 | without `--apply`: no compose | `send` exit 0 | `scripts/env-push-smoke.mjs:386` `composeCalls().length === 0` | PASS |
| C23 | `up` fails → exit 1, message, remote is new | `apply-fails` exit 0 | `scripts/env-push-smoke.mjs:496-498` | PASS |
| C24 | shellcheck clean | `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable scripts/env-push.sh` exit 0, no output | `scripts/env-push.sh:136` is the only directive (`disable=SC2029`) | PASS |
| C25 | `.env` section runs the command, no `nano`/`curl`/`sudo -iu deploy` | `env-push-smoke.mjs runbook` exit 0 | `scripts/env-push-smoke.mjs:521-528`; `docs/runbooks/deploy.md:205` | PASS |
| C26 | 16 sections, key before `.env` | `staging-smoke.mjs runbook` exit 0 (19 ok, 0 not ok); `env-push-smoke.mjs runbook` exit 0 | `scripts/staging-smoke.mjs:592-594`; `scripts/env-push-smoke.mjs:531` `key >= 0 && key < dotenv` | PASS |
| C27 | `ops` test with `PasswordAuthentication=no` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:532-535`; `docs/runbooks/deploy.md:80` | PASS |
| C28 | `01-hardening.conf` + `sshd -T` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:536-542`; `docs/runbooks/deploy.md:90`, `:96` | PASS |
| C29 | compose `ps -a` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:543-547`; `docs/runbooks/deploy.md:275`, `:334` | PASS |
| C30 | ruleset bullet says `pull request` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:548-551`; `docs/runbooks/deploy.md:252-253` | PASS |
| C31 | `Problemas comuns` unhealthy/rollback row | `runbook` exit 0 | `scripts/env-push-smoke.mjs:552-555`; `docs/runbooks/deploy.md:370` | PASS |
| C32 | ≤ 450 lines | `test "$(wc -l < docs/runbooks/deploy.md)" -le 450` exit 0 (380) | `docs/runbooks/deploy.md:380` last line | PASS |
| C33 | `ssh-keyscan` → `~/.ssh/bens-known_hosts-staging` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:556-563`; `docs/runbooks/deploy.md:173`, `:225` | PASS |
| C34 | AD-012 row `active` | the checks.md grep exit 0 | `.specs/STATE.md:18` | PASS |
| C35 | existing file: `script; cat` gets all 5 stdin lines, no `Domínio` prompt | `existing` exit 0 ("the five stdin lines reach the cat after the script", "no prompt is printed") | `scripts/env-push-smoke.mjs:289` `shared.stdout.endsWith(junk)`; `:290` `!shared.stderr.includes('Domínio')` | PASS as worded, but it does not prove the whole of AC 4 (see F1) |

**Precision gaps and the Handoff's known text slips.** The Handoff leaves two slips in place. I
judge both acceptable, and neither changes the verdict:

1. "14 keys" in C1, C6, the Coverage row and the plan's Problem. `.env.prod.example` has 15
   (`grep -cE '^[A-Z_]+=' .env.prod.example` → 15). The proofs read the list from the file
   (`scripts/env-push-smoke.mjs:50`), and the output confirms all 15 are covered. Only the
   number in the prose is wrong.
2. The Swept "dependency failure" row names `set -e`. The real mechanism is `|| state=$?` at
   `scripts/env-push.sh:147` plus `*) die` at `:157`. The outcome (exit 1) is the same, and it
   was checked ad hoc in round 1. Only the explanation is wrong.
3. New: C35 limits "reads nothing from stdin" to what the script itself reads. The stub cannot
   observe what `ssh` reads (F1 below).

## Coverage

Recomputed at 8c4aaab only for the rows whose authority the fix touched. All other rows are
carried from 6b6bc9b (see round 1 below).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| stdin with an existing file (2 in checks.md; 3 in the code) | `scripts/env-push.sh:57` (the generate branch is the only `read`), `:147` and `:175` (ssh calls with `</dev/null`), `:167` (the send call uses `<"$file"`) | not rewritten C4 · not read by the script C35 (P1 killed) · not read by `ssh` - **no proof**: the stub never consumes stdin (F1, F8 survive) | `ssh` stdin at `scripts/env-push.sh:147`, `:175` |
| answers read (5), now with 2 silent | `scripts/env-push.sh:59-63`, `ask` at `:41-53` | domain C3 · Resend key (silent) C3 · sender C3 · Turnstile site C3 · Turnstile secret (silent) C3. The silent branch's wrong variable (F5) or its newline on stdout (F4) break C3, and echoing the answer to stderr (F3) breaks C19 | - |
| exit codes, generation branches, and the rest | - | carried from 6b6bc9b | - |

The fix adds one branch point (`ASK_SILENT`, `scripts/env-push.sh:44`). No AC or check requires
the echo to be off. Round 1 raised this as a mismatch with the Landing rationale, and the Handoff
now claims the behaviour. The smoke has no terminal, so it cannot see echo (F2 survives, see
below). I checked it on a real pty (Python `pty.fork`, answers typed into the terminal). At HEAD
the Resend key and the Turnstile secret were not echoed and the site key was. With `-rs` → `-r`,
all three were echoed. So the behaviour is correct at HEAD but has no automated proof. It is not
an obligation of any check, so it is an observation, not a coverage gap.

## Test policy rows

Re-judged the row that classifies the touched files. The other two rows are carried from 6b6bc9b
(met).

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| `scripts/env-push.sh` decides | `scripts/env-push.sh` | run as a process with real bash behind an `ssh` stub | no: the stub (`scripts/env-push-smoke.mjs:62-73`) does not model how `ssh` treats stdin. For the "stdin with an existing file" set, one member has no run that could fail (F1) |
| real ssh transport | `scripts/env-push.sh:133-137` | argv (C13); first live push | yes (carried from 6b6bc9b). Whether `ssh` drains stdin is not in the row's list (host key, key auth, `restrict`), and the stub could model it cheaply, so it belongs to the row above |
| runbook text | `docs/runbooks/deploy.md` | read as data | yes (carried from 6b6bc9b; the fix did not touch the runbook) |

## Faults injected

Verified at 8c4aaab. Baseline `git status --porcelain` of the real tree was empty. Every mutant
was applied with an exact-once string replace in a detached `git worktree` of HEAD in the
scratchpad. I ran the narrowest step there, reset it with `git checkout -- .` after each mutant,
and removed the worktree at the end. Afterwards the real tree's porcelain was empty again, apart
from this report written after that.

| Mutation | Location | Killed |
| --- | --- | --- |
| P1 (round-1 survivor) `cat >/dev/null` before the generate branch | `scripts/env-push.sh:55` | yes - `existing`: "the five stdin lines reach the cat after the script" |
| F6 existing path reads one line (`read -r _`) | `scripts/env-push.sh:55` | yes - `existing`: "the five stdin lines reach the cat after the script" |
| F7 existing path prints the `Domínio` prompt without reading | `scripts/env-push.sh:55` | yes - `existing`: "no prompt is printed" |
| F1 `</dev/null` dropped from the remote-state `ssh` call | `scripts/env-push.sh:147` | no - survived: `existing` exit 0. The stub (`scripts/env-push-smoke.mjs:66-72`) passes stdin to a remote command that never reads it, whereas real `ssh` reads stdin unless given `-n` (`man ssh`: "-n Redirects stdin from /dev/null (actually, prevents reading from stdin)") |
| F8 `</dev/null` dropped from the `--apply` `ssh` call | `scripts/env-push.sh:175` | no - survived: `apply` exit 0. Same cause. C35 does not run `--apply`, and nothing else looks at stdin |
| F3 silent branch echoes the answer to stderr | `scripts/env-push.sh:46` | yes - `no-leak`: "the output holds none of the 318 secrets" |
| F4 silent branch writes its newline to stdout | `scripts/env-push.sh:46` | yes - `generate`: "generates and sends" (`TURNSTILE_SECRET_KEY ausente ou vazio`) |
| F5 silent branch reads into another variable | `scripts/env-push.sh:45` | yes - `generate`: "generates and sends" (`resposta vazia`) |
| F2 `read -rs` → `read -r` | `scripts/env-push.sh:45` | n/a - no check claims echo off. Echo cannot be observed without a terminal, so it survives `generate`. The pty run above shows HEAD hides both secrets and the mutant shows them |
| F9 (M1 re-run) DB guard drops `POSTGRES_PASSWORD` | `scripts/env-push.sh:150` | yes - `db-guard`: "POSTGRES_PASSWORD changed: exits 1" |
| F10 (M4 re-run) sha256 compared with itself | `scripts/env-push.sh:166` | yes - `corrupt`: "a truncated transfer exits 1" |
| F11 (M18 re-run) compose runs without `--apply` | `scripts/env-push.sh:170` | yes - `send`: "without --apply, no docker compose" |

That is more than the five-mutant cap. The brief asked for P1 to be re-injected, for the two
fix surfaces (the silent branch and C35's proof) to be covered, and for a regression sample.
The runbook and C34 mutants (R1-R9) are carried from 6b6bc9b, since the fix did not touch
`docs/` or `.specs/STATE.md`.

## Gate

Verified at 8c4aaab:

- `node scripts/env-push-smoke.mjs all`: 15 steps, 556 ok, 0 not ok, exit 0.
- `node scripts/staging-smoke.mjs runbook`: 19 ok, 0 not ok, exit 0.
- `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable scripts/env-push.sh`: exit 0, no output.
- C32 `test "$(wc -l < docs/runbooks/deploy.md)" -le 450`: exit 0 (380 lines).
- C34 grep: exit 0 (`.specs/STATE.md:18`).

**Ranked gaps:**

1. Surviving mutants F1 and F8: removing `</dev/null` from the ssh calls at
   `scripts/env-push.sh:147` or `:175` is not caught. With real ssh, that removal breaks AC 4 on
   an existing file. The code is correct today, but the claim is unguarded. The cause is the
   stub at `scripts/env-push-smoke.mjs:66-72`, which does not drain stdin the way `ssh` does.
   Suggested proof: make the non-corrupt path of the stub forward all of its stdin to the remote
   command, as real ssh does, for example `tmp=$(mktemp); cat >"$tmp"; … bash -c "$cmd" <"$tmp"`.
   Then C35 kills F1, and running C35's `bash -c '…; cat'` once with `--apply` and a
   `deploy.env` kills F8.
2. Observation, not a check failure: echo-off for the secret prompts has no automated proof (F2).
   It is correct at HEAD per the manual pty run. Either add a criterion, or leave it as the
   Handoff describes.
3. Precision (accepted, carried): 14 vs 15 keys, and the Swept `set -e` wording.

---

# Round 1 history (6b6bc9b, FAIL)

The round-1 report is kept below as written. Its line numbers refer to 6b6bc9b.


Round-1 verdict: FAIL
Round-1 profile: standard
**Diff range**: 9bff3ef..6b6bc9b (13a9a9a, 3605705, 6b6bc9b)
Round-1 round: 1 - full
**Verifier**: independent sub-agent (author != verifier)

One surviving mutant: C4's proof passes when the script, with `.env.staging` already present,
still reads stdin and throws it away (`scripts/env-push.sh:51`). AC 4 says "SHALL read nothing from
stdin". C4 only asks that the junk not end up in the file, and a script that prompts and ignores
the answers meets that. Every other check is proven. 43 of the 44 non-equivalent mutants were
killed.

### Round 1 - Binding sources

None. The plan marks no design or contract as binding. Its `Sources` are the user's request, the
runbook analysis done in the session, and AD-011 (`.specs/STATE.md`). AD-012 at
`.specs/STATE.md:18` complements AD-011 and does not contradict it: the GitHub still holds no
application secret. The profile is not `ui`, so step 1 does not apply.

### Round 1 - Checks

All proofs ran at HEAD `6b6bc9b`. `node scripts/env-push-smoke.mjs all` exited 0 and printed each
of the 15 steps (`# generate` … `# runbook`) with 550 `ok -` lines and no `not ok`. Every step
named below appears in that output individually. The smoke is new in this diff
(`scripts/env-push-smoke.mjs`, +589).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | generated `.env.staging`, mode 600, key set = example's | `env-push-smoke.mjs generate` exit 0 | `scripts/env-push-smoke.mjs:230` `mode(LOCAL) === 0o600`; `:232-235` `Object.keys(values).sort().join() === [...EXAMPLE_KEYS].sort().join()` (output: "holds exactly the 15 keys") | PASS (precision gap: the example has 15 keys, not 14) |
| C2 | 48-hex passwords that differ; 44-char base64 secret; new values on each generation | `generate` exit 0 | `scripts/env-push-smoke.mjs:236-242` `/^[0-9a-f]{48}$/`, `!==`, `/^[A-Za-z0-9+/]{43}=$/`; `:267-268` `second[key] !== values[key]` | PASS |
| C3 | the 12 literal values | `generate` exit 0 | `scripts/env-push-smoke.mjs:256-257` `values[key] === value` over the table at `:243-255`; `:259-261` the `EMAIL_FROM="Bens Seguros <nao-responda@bens.test>"` regex | PASS |
| C4 | existing file byte-identical; remote equals it | `existing` exit 0 | `scripts/env-push-smoke.mjs:279` `read(LOCAL) === text`; `:280` `read(REMOTE_ENV) === text` | PASS as worded. The proof misses AC 4's "reads nothing from stdin" (mutant P1 survived) |
| C5 | 4 usage errors: exit 1, `env-push: uso:`, no file, no ssh | `usage` exit 0 | `scripts/env-push-smoke.mjs:289-296` `result.code === 1`, `/^env-push: uso:/m`, no `.env.*`, `sshCalls().length === 0` | PASS |
| C6 | each key absent/empty → exit 1 naming it, no ssh | `validate` exit 0 (30 cases in the output) | `scripts/env-push-smoke.mjs:302-305` loop over `EXAMPLE_KEYS`; `:212-214` `code === 1`, `stderr.includes(named)`, `sshCalls().length === 0` | PASS (the loop covers 15 keys) |
| C7 | 3 wrong `APP_URL`s rejected | `validate` exit 0 | `scripts/env-push-smoke.mjs:306-312` → `rejects(…, 'APP_URL')` | PASS |
| C8 | 31 rejected, 32 accepted | `validate` exit 0 | `scripts/env-push-smoke.mjs:313` `rejects('secret of 31', …)`; `:314` + `:221` `accepts` → `result.code === 0` | PASS |
| C9 | `@ / : # %` and space rejected for both passwords; `aZ09._~-` accepted | `validate` exit 0 | `scripts/env-push-smoke.mjs:315-320` | PASS |
| C10 | `<RESEND_API_KEY>` and `example.com` rejected | `validate` exit 0 | `scripts/env-push-smoke.mjs:321-330` names `SMTP_URL` / `SITE_ADDRESS` | PASS |
| C11 | missing key / known_hosts → path in stderr, no ssh | `missing-files` exit 0 | `scripts/env-push-smoke.mjs:340-342` `stderr.includes(path)`, `sshCalls().length === 0` | PASS |
| C12 | remote `.env` byte-identical, mode 600, no `.env.push`, exit 0 | `send` exit 0 | `scripts/env-push-smoke.mjs:353-356` | PASS |
| C13 | ssh options and target; `SSH_USER`/`SSH_HOST` override | `send` exit 0 | `scripts/env-push-smoke.mjs:361-370` `joined.includes(option)`, `argv.includes('deploy@203.0.113.10')`; `:382-385` `ops@198.51.100.7` | PASS |
| C14 | no secret in ssh argv | `send` exit 0 | `scripts/env-push-smoke.mjs:372-374` `!joined.includes(values[key])` | PASS |
| C15 | truncated transfer: exit 1, remote unchanged, no `.env.push` | `corrupt` exit 0 | `scripts/env-push-smoke.mjs:396-398` | PASS |
| C16 | each of 4 DB keys differs → exit 1 naming the key, no value printed, remote unchanged | `db-guard` exit 0 (4×5 asserts) | `scripts/env-push-smoke.mjs:411-418` | PASS |
| C17 | volume without `.env` → exit 1, `banco já existe`, no remote `.env` | `volume-guard` exit 0 | `scripts/env-push-smoke.mjs:428-430` | PASS |
| C18 | same DB values, other key differs → replaced, exit 0 | `replace` exit 0 | `scripts/env-push-smoke.mjs:440-441` | PASS |
| C19 | no secret value in any transcript | `no-leak` exit 0 ("none of the 318 secrets" under M17) | `scripts/env-push-smoke.mjs:496-498` `secrets.size > 20`, `leaked.length === 0` | PASS |
| C20 | exact compose argv, cwd, `.env` already new | `apply` exit 0 | `scripts/env-push-smoke.mjs:453-464` `args.join(' ') === 'compose -f docker-compose.prod.yml … --no-build'`, `cwd === REMOTE`, `env-at-compose === text` | PASS |
| C21 | no `deploy.env`: exit 0, sent, no compose, `primeiro deploy` | `apply-first` exit 0 | `scripts/env-push-smoke.mjs:473-476` | PASS |
| C22 | without `--apply`: no compose | `send` exit 0 | `scripts/env-push-smoke.mjs:376` `composeCalls().length === 0` (a `deploy.env` exists, `:351`) | PASS |
| C23 | `up` fails → exit 1, `.env novo já está na VPS`, remote is new | `apply-fails` exit 0 | `scripts/env-push-smoke.mjs:486-488` | PASS |
| C24 | shellcheck clean | `docker run … koalaman/shellcheck:stable scripts/env-push.sh` exit 0, no output | `scripts/env-push.sh:130` is the only directive (`disable=SC2029`, with its reason on `:129`) | PASS |
| C25 | `.env` section runs the command; no `nano`/`curl`/`sudo -iu deploy` | `env-push-smoke.mjs runbook` exit 0 | `scripts/env-push-smoke.mjs:511-518`; `docs/runbooks/deploy.md:205` | PASS |
| C26 | 16 sections, `Chave SSH do deploy` before `.env`, other assertions of `cd-vps` C34 hold | `staging-smoke.mjs runbook` exit 0 (19 ok); `env-push-smoke.mjs runbook` exit 0 | `scripts/staging-smoke.mjs:577-578` order, `:592-594` `index > found[i - 1]`; `scripts/env-push-smoke.mjs:519-521` `key >= 0 && key < dotenv` | PASS |
| C27 | `ops` test with `-o PasswordAuthentication=no` and `SUDO_OK` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:522-525`; `docs/runbooks/deploy.md:80` | PASS |
| C28 | `01-hardening.conf`, no `99-`, then `sshd -T … passwordauthentication` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:526-532`; `docs/runbooks/deploy.md:90`, `:96` | PASS |
| C29 | every compose `ps` has `-a` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:533-537`; `docs/runbooks/deploy.md:275`, `:334`. `grep ' ps\b'` finds no other occurrence | PASS |
| C30 | the ruleset bullet says `pull request` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:538-541`; `docs/runbooks/deploy.md:252-253` | PASS |
| C31 | `Problemas comuns` row: `healthy` + `fora do ar` + `Rollback` | `runbook` exit 0 | `scripts/env-push-smoke.mjs:542-545`; `docs/runbooks/deploy.md:370` | PASS |
| C32 | ≤ 450 lines | `test "$(wc -l < docs/runbooks/deploy.md)" -le 450` exit 0 (380 lines) | `docs/runbooks/deploy.md:380` is the last line | PASS |
| C33 | `ssh-keyscan` → `~/.ssh/bens-known_hosts-staging`; `SSH_KNOWN_HOSTS` is its content | `runbook` exit 0 | `scripts/env-push-smoke.mjs:546-553`; `docs/runbooks/deploy.md:173`, `:225` | PASS |
| C34 | AD-012 row, `active` | the checks.md grep exit 0 | `.specs/STATE.md:18` | PASS |

**Precision gaps (about the checks, not the code):**

1. C1, C6, the Coverage row "keys of `.env.prod.example` (14)" and the plan's Problem ("14
   variáveis") all count 14 keys. `.env.prod.example` has 15. The proofs read the key list from the
   file (`scripts/env-push-smoke.mjs:50`), so all 15 are covered. Only the number in the prose is
   wrong.
2. C4 narrows AC 4 ("SHALL read nothing from stdin") to "the junk was not read into it". Mutant P1
   survives in that gap. See "Faults injected".

### Round 1 - Coverage

I recomputed each set from its authority: the example file for keys, `scripts/env-push.sh` for
branches and options, the plan's AC 24-32 for runbook fixes, and the AD-012 row for door 3.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| keys of `.env.prod.example` (15, not 14) | `grep -oE '^[A-Z_]+=' .env.prod.example` | C6 over all 15 × {absent, empty} (30 cases in the output); C1 set equality | - |
| generated values (3) | `scripts/env-push.sh:58-60` | C2 on each | - |
| answers read (5) | `scripts/env-push.sh:53-57` | C3: each answer is a distinct value that lands in its own key, so a swapped read order fails | - |
| usage errors (4) | `scripts/env-push.sh:13-19` | C5 over `[]`, `dev`, `staging extra`, `staging --force` | - |
| validation rules (6) | `scripts/env-push.sh:99-120` | presence C6 (`:100-102`) · placeholder C10 (`:103-107`) · `APP_URL` C7 (`:109`) · length C8 (`:111`) · URL-safe C9 (`:112-115`) · key/known_hosts C11 (`:119-120`) | - |
| remote states before sending (4 in the plan; the code has a 5th) | `scripts/env-push.sh:142-152` | `0`/same C18, C15 · `0`/different C16 · `3` C17 · `4` C12 · `*` (unreachable or unreadable path) is covered by the Swept row "dependency failure (read in review)". I checked it ad hoc: an ssh stub exiting 255 gives exit 1 and `não foi possível ler /opt/bens-seguros em deploy@203.0.113.10 (saída 255)` | - |
| DB keys guarded (4) | `scripts/env-push.sh:144` | C16, table-driven over the 4 | - |
| exit codes (2) | `die`/`usage` vs the normal end | `0` C12, C18, C20, C21 · `1` C5-C11, C15-C17, C23 | - |
| `--apply` outcomes (4) | `scripts/env-push.sh:164-174` | absent C22 · `0` C20 · `4` C21 · `*` C23 | - |
| where a secret could leak (3) | argv, stdout/stderr, the DB-guard message | C14 · C19 · C16 | - |
| ssh options (6) | `scripts/env-push.sh:127-131` | C13 on each | - |
| Landing doors (3) | plan Landing | 1 C1, C4 · 2 C5, C13 · 3 C34 | - |
| runbook fixes (9) | plan AC 24-32 | C25 · C26 · C27 · C28 · C29 · C30 · C31 · C32 · C33 | - |

The script has two branches that no set in the plan lists. No criterion asks for either, so
neither is an unproven member. I ran both ad hoc and both exit 1 as intended:

- the `DEPLOY_PATH` format guard at `scripts/env-push.sh:125`. `DEPLOY_PATH='/opt/a b'` gives
  `DEPLOY_PATH precisa ser um caminho absoluto sem espaços`.
- the missing-example guard at `:24`.

**Swept rows that cite existing code:**

- concurrency: the swap is `mv .env.push .env` (`scripts/env-push.sh:160`). Present.
- authorization: `restrict` is in the runbook (`docs/runbooks/deploy.md:183`). Present.
- dependency failure: the row says "ssh unreachable exits non-zero by `set -e` and `BatchMode`".
  It does exit non-zero, as the ad hoc run shows. The mechanism is different, though: the
  `|| state=$?` at `:141` catches the failure and the `*)` branch at `:151` dies. `set -e` plays
  no part.

### Round 1 - Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| `scripts/env-push.sh` decides (17 branch points) | `scripts/env-push.sh` | Run as a process with real bash and real files. The ssh stub runs each remote command with `bash -c` (`scripts/env-push-smoke.mjs:62-73`). `docker` is stubbed only on the remote `PATH` (`:75-87`, `:69-71`). | yes: one run per member of each set above. The one weak member is the existing branch. Its run exists, but it cannot see a stdin read (P1). |
| real ssh transport | `scripts/env-push.sh:127-131` | argv asserted (C13); proven live on the first real push | yes, as the row allows. The argv assertion checks that each option is present, not where it sits. Moving the options after the target (P2) passes the smoke, and it is also harmless: OpenSSH 9.6 re-parses options after the host. `ssh -G deploy@203.0.113.10 -i <file> -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes` printed `identityfile <file>`, `identitiesonly yes`, `stricthostkeychecking true`. Still unproven until the first live push: host-key rejection, key auth, and stdin passing through a `restrict` key. |
| runbook text | `docs/runbooks/deploy.md` | read as data | yes: one assertion per fix, and runbook mutants R1-R8 were each killed by their own assertion |

### Round 1 - Faults injected

Each mutant was applied to a detached worktree of HEAD in the scratchpad (`git worktree add`),
never to the real tree. I ran the narrowest step for each, then discarded the worktree. The real
tree's `git status --porcelain` was empty before (baseline) and after.

| Mutation | Location | Killed |
| --- | --- | --- |
| M1 DB guard loop drops `POSTGRES_PASSWORD` | `scripts/env-push.sh:144` | yes - `db-guard`: "POSTGRES_PASSWORD changed: exits 1" |
| M2 DB guard message prints the local value | `scripts/env-push.sh:146` | yes - `db-guard`: "the new value is not printed" |
| M3 volume state `3` treated as no database | `scripts/env-push.sh:149` | yes - `volume-guard`: "exits 1" |
| M4 sha256 comparison always true | `scripts/env-push.sh:160` | yes - `corrupt`: "a truncated transfer exits 1" |
| M5 hash mismatch removes `.env.push` but exits 0 | `scripts/env-push.sh:160` | yes - `corrupt`: "exits 1" |
| M6 password whitelist admits `%` | `scripts/env-push.sh:113` | yes - `validate`: "POSTGRES_PASSWORD with '%': exits 1" |
| M7 secret bound `-ge 32` → `-gt 32` | `scripts/env-push.sh:111` | yes - `validate`: "secret of 32: passes validation" |
| M8 `APP_URL` compared as a prefix | `scripts/env-push.sh:109` | yes - `validate`: "APP_URL=https://staging.bens.test/: exits 1" |
| M9 `example.com` placeholder dropped | `scripts/env-push.sh:105` | yes - `validate`: "example.com domain: exits 1" |
| M10 presence loop skips the last key | `scripts/env-push.sh:100` | yes - `validate`: "TURNSTILE_SITE_KEY absent: exits 1" |
| M11 key file check removed | `scripts/env-push.sh:119` | yes - `missing-files`: "exits 1" |
| P3 known_hosts check removed | `scripts/env-push.sh:120` | yes - `missing-files`: "exits 1" |
| M12 second argument not checked | `scripts/env-push.sh:15` | yes - `usage`: "args [staging extra]: prints env-push: uso:" |
| M13 `-o BatchMode=yes` dropped | `scripts/env-push.sh:127` | yes - `send`: "ssh carries -o BatchMode=yes" |
| M14 default user `ops` | `scripts/env-push.sh:123` | yes - `send`: "ssh targets deploy@203.0.113.10" |
| M15 `POSTGRES_PASSWORD` expanded into the remote command (argv) | `scripts/env-push.sh:158` | yes - `send`: "no ssh argument holds POSTGRES_PASSWORD" |
| M16 remote `umask 077` removed | `scripts/env-push.sh:158` | yes - `send`: "the remote .env has mode 600" |
| M17 success line prints `SMTP_URL` | `scripts/env-push.sh:162` | yes - `no-leak`: "the output holds none of the 318 secrets" |
| M18 compose runs without `--apply` | `scripts/env-push.sh:164` | yes - `send`: "without --apply, no docker compose" |
| M19 `--no-build` dropped | `scripts/env-push.sh:168` | yes - `apply`: exact argv mismatch |
| M20 missing `deploy.env` exits 0 (says "aplicado") | `scripts/env-push.sh:167` | yes - `apply-first`: "says the first deploy applies it" |
| P4 `deploy.env` check removed (compose runs) | `scripts/env-push.sh:167` | yes - `apply-first`: "no docker compose" |
| M21 `up` failure exits 0 | `scripts/env-push.sh:173` | yes - `apply-fails`: "exits 1" |
| M22 an existing file is regenerated | `scripts/env-push.sh:51` | yes - `existing`: ".env.staging is byte-identical" |
| M23 local `umask 077` removed | `scripts/env-push.sh:85` | yes - `generate`: ".env.staging has mode 600" |
| M24 `LOG_LEVEL` generated as `debug` | `scripts/env-push.sh:74` | yes - `generate`: "LOG_LEVEL=info" |
| M25 both passwords get one value | `scripts/env-push.sh:59` | yes - `generate`: "the two passwords differ" |
| P5 volume name typo in the guard | `scripts/env-push.sh:140` | yes - `volume-guard`: "exits 1" |
| P6 DB guard compares remote with remote | `scripts/env-push.sh:145` | yes - `db-guard`: "POSTGRES_USER changed: exits 1" |
| P1 the existing path reads stdin and discards it (`cat >/dev/null` before the `if`) | `scripts/env-push.sh:51` | no - survived: `existing` exit 0. AC 4 "SHALL read nothing from stdin" is unproven. A script that still prompts and ignores the answers would pass. |
| P2 ssh options placed after the target | `scripts/env-push.sh:131` | n/a - equivalent: survives `send`, but OpenSSH re-parses options after the host (`ssh -G` output above), so the behaviour does not change |
| R1 `dc ps -a` → `dc ps` | `docs/runbooks/deploy.md:334` | yes - `runbook`: "\"dc ps\" carries -a" |
| R2 `01-hardening` → `99-hardening` | `docs/runbooks/deploy.md:90` | yes - `runbook`: "writes 01-hardening.conf" |
| R3 `-o PasswordAuthentication=no` dropped from the `ops` test | `docs/runbooks/deploy.md:80` | yes - `runbook`: "the ops access test forces key authentication" |
| R4 `pull request` → `PR` | `docs/runbooks/deploy.md:253` | yes - `runbook`: "the ruleset bullet says it forces pull requests" |
| R5 unhealthy/rollback row removed | `docs/runbooks/deploy.md:370` | yes - `runbook`: "an unhealthy server means rollback" |
| R6 `ssh-keyscan` writes to the current directory | `docs/runbooks/deploy.md:173` | yes - `runbook`: "ssh-keyscan writes ~/.ssh/bens-known_hosts-staging" |
| R7 `nano .env` in the `.env` section | `docs/runbooks/deploy.md:205` | yes - `runbook`: ".env section has no nano" |
| R8 `.env` moved back before `Chave SSH do deploy` | `docs/runbooks/deploy.md:165-213` | yes - `staging-smoke.mjs runbook`: "in that order"; `env-push-smoke.mjs runbook`: "Chave SSH do deploy comes before .env" |
| R9 AD-012 `active` → `superseded` | `.specs/STATE.md:18` | yes - the C34 grep exits 1 |

That is more than the five mutants the procedure caps at. The brief asked for coverage of the
database guard, the sha256 check, the validation rules, the `--apply` branches and argv/secret
leakage, and the real mutation tooling does not exist for bash, so each of those surfaces got
its own mutant.

**Is the proof the right one?**

The smoke runs the real script with real bash, against real files and a real remote directory.
C12, C15-C18, C20-C23 read that directory's files, and the corrupt stub really truncates stdin, so
those proofs exercise the claim itself rather than a stand-in for it. C20 also checks that `.env`
was already the new one when compose ran (`env-at-compose`), which catches a reordering.

Two proofs fall short:

- C4: see P1.
- C13: the argv check looks for each option anywhere in the joined argv, not at its position. P2
  shows this is harmless for OpenSSH.

**One observation outside the checks.** Door 2's rationale in the plan mentions a "prompt com eco
desligado". `ask` (`scripts/env-push.sh:43`) uses `read -r` without `-s`, so the Resend key and
the Turnstile secret show on the operator's terminal as they are typed. No AC requires echo off.
C19 covers only the script's own output, so this is not a check failure. It is a mismatch between
the plan's rationale and the code, for the user to decide on.

### Round 1 - Gate

- `node scripts/env-push-smoke.mjs all`: 15 steps, 550 ok, 0 not ok, exit 0.
- `node scripts/staging-smoke.mjs runbook`: 19 ok, exit 0.
- shellcheck: exit 0.
- C32: 380 lines, exit 0.
- C34 grep: exit 0.
- The real tree's `git status --porcelain` is empty apart from this report.

**Ranked gaps:**

1. Surviving mutant P1: AC 4 "reads nothing from stdin" is unproven. C4 at
   `scripts/env-push-smoke.mjs:277-280`, code at `scripts/env-push.sh:51`. Suggested proof: run
   the script inside `bash -c 'scripts/env-push.sh staging; cat'` with the five junk lines on
   stdin, and assert that the trailing `cat` prints all five. Also assert that stderr holds no
   prompt text (`Domínio`).
2. Precision: C1, C6 and the Coverage row say 14 keys; `.env.prod.example` has 15. The proofs
   already cover 15.
3. Swept "dependency failure": the mechanism it names (`set -e`) is not the one at
   `scripts/env-push.sh:141,151`. The outcome is still exit 1.
