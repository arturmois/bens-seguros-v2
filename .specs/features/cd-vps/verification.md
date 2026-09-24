# CD na VPS verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 14fbe74..HEAD (HEAD = 6ce354b; fix diff 57b59fd..6ce354b)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

All 40 checks are proven at `6ce354b`, and the four round-1 gaps are closed. Every mutant injected on the fix's surfaces was killed.

1. The health step now passes only on `200`. The `308` case fails, and so do a `404` and a server that never answers (ad hoc probes, below).
2. The running-image guard in `deploy-remote.sh` is reached by step `image-mismatch`. Removing it is now killed.
3. A failed deploy is proven to leave `server`, `caddy` and `postgres` with the same ID and the same `State.StartedAt`.
4. ADR-008's CD revision now names `server`, `migrate` and `web`, and says they replace `server` and `caddy-web`.

Scope, per `verify.md` "Re-verifying after a fix". The fix diff `57b59fd..6ce354b` touches five files outside `.specs/`: `.github/workflows/deploy-environment.yml`, `scripts/deploy-smoke.mjs`, `scripts/staging-smoke.mjs` (one line), `docs/decisions/ADR-008-deployment.md` and `docs/runbooks/deploy.md` (one row). The re-verified parts are those files, plus the round-1 verdicts that were not PASS: the ADR-008 contradiction, three Coverage rows and two Test policy rows. Proofs re-ran in full at `6ce354b`. Anything else says `carried from 57b59fd`.

How it ran at `6ce354b`:

- `node scripts/deploy-smoke.mjs down`, then `up` (fresh registry and images, not the author's leftover state), then `all`. `all` exited 0: 25 steps, 141 `ok -`, 0 `not ok`.
- actionlint and shellcheck exited 0 with no output.
- `docker compose up -d mailpit`, then `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all`. It exited 0: 15 steps and 79 `ok -`, including `runbook` with 22 ok, then `pnpm e2e` with 90 passed. `node scripts/staging-smoke.mjs runbook` on its own also exited 0, with 22 ok.
- Real-tree `git status --porcelain` was empty before the run, after the faults and worktree removal, and after the gate.
- After the faults, the smoke was rebuilt from the real tree (`up`, then `all` with exit 0 and 141 ok), then `down`. No `bens-deploy-smoke` container or registry is left.
- Nothing was pushed or deployed.

## Binding sources

Verified at 6ce354b for ADR-008, because the fix touched it. The roadmap row is carried from 57b59fd, because the fix did not touch the roadmap.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-008-deployment.md` (verified at 6ce354b) | yes - read in full at `6ce354b` (`:1-45`). Deploy by tag, GHCR, SSH, `pull`, `run --rm migrate`, `up -d`, health check and rollback by the previous tag still match C2, C6, C18, C21, C24, C30. The round-1 contradiction is resolved: `docs/decisions/ADR-008-deployment.md:12` records that the three images `server`, `migrate` and `web` replace `server` and `caddy-web`. The original decision at `:27` still reads `server` e `caddy-web`, but the ADR's convention is that dated revisions at the top supersede the body, as the MVP revision at `:5-8` already does | none | - |
| `docs/roadmap.md`, milestone "Staging publicado" (carried from 57b59fd) | yes - `docs/roadmap.md:68-72`, unchanged by the fix | none. The criterion needs the real VPS, and plan Open question 1 leaves it to the user's first deploy | - |

## Checks

Verified at 6ce354b. Proofs re-ran in full at `6ce354b` and citations were refreshed, because `scripts/deploy-smoke.mjs` shifted by +11 to +45 lines. The deploy-smoke proofs come from one `node scripts/deploy-smoke.mjs all` invocation after a fresh `up`, exit 0, with every named step in the output. `ORDER` is at `scripts/deploy-smoke.mjs:976-1002`. Citations below are `scripts/deploy-smoke.mjs` unless another file is named. C1-C35 were PASS in round 1; C36-C40 are new in this fix.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `build.if` = the five conjuncts; `on.workflow_run` CI/completed/main | step `workflow-build-guard`, 7 ok | `scripts/deploy-smoke.mjs:382-390` - `conjuncts.includes(expected)` for each of the five literals; `:391` - `conjuncts.length === 5`; `:393-397` - `JSON.stringify(trigger) === JSON.stringify({ workflows: ['CI'], types: ['completed'], branches: ['main'] })` | PASS |
| C2 | checkout `head_sha`; exactly 3 images, files/targets, only `sha-<head_sha>`, amd64, push | step `workflow-build-images`, 9 ok | `scripts/deploy-smoke.mjs:403-406` - `deploy.env.IMAGE_REGISTRY === 'ghcr.io/arturmois/bens-seguros-v2'`; `:409-412` - `checkout?.with?.ref === '${{ github.event.workflow_run.head_sha }}'`; `:414` - `pushes.length === 3`; `:421-423` - `item.with.tags === tags`; `:424-431` - context `.`, file, target, `platforms === 'linux/amd64'`, `push === true` | PASS |
| C3 | top `permissions: {}`; build exactly contents read, packages write | step `workflow-permissions`, 2 ok | `scripts/deploy-smoke.mjs:438` - `JSON.stringify(deploy.permissions) === '{}'`; `:439-443` - `JSON.stringify(deploy.jobs.build.permissions) === JSON.stringify({ contents: 'read', packages: 'write' })` | PASS |
| C4 | only the four official actions and the local reusable workflow | step `workflow-actions`, 1 ok | `scripts/deploy-smoke.mjs:448-454` - the allowed set; `:455-461` - job-level and step-level `uses` of both files; `:463-466` - `used.length > 0 && foreign.length === 0` | PASS |
| C5 | both workflows pass actionlint | `docker run … rhysd/actionlint:latest -color .github/workflows/deploy.yml .github/workflows/deploy-environment.yml` exit 0, no output | exit code 0 on `.github/workflows/deploy-environment.yml:1` and `.github/workflows/deploy.yml:1` (whole files) | PASS |
| C6 | `tag-a` exits 0; server/caddy/last migrate on `…:tag-a`; health 200 | step `first`, 6 ok | `scripts/deploy-smoke.mjs:848-851` - `result.status === 0`; `:852-861` - `imageOf(containerId(service, true)) === ${REGISTRY}/${image}:tag-a` for server/server, caddy/web, migrate/migrate; `:862` - `(await health()) === 200` | PASS |
| C7 | after a then b: `deploy.env` b, `.previous` a, both `IMAGE_REGISTRY`; server on b | step `second`, 7 ok | `scripts/deploy-smoke.mjs:873` - `current.includes('IMAGE_TAG=tag-b\n')`; `:874` - `previous.includes('IMAGE_TAG=tag-a\n')`; `:875-877` - `IMAGE_REGISTRY=${REGISTRY}\n` in both; `:878` - `imageOf(containerId('server')) === ${REGISTRY}/server:tag-b` | PASS |
| C8 | same tag again exits 0; postgres ID unchanged across 2nd and 3rd deploy | steps `second`, `same-tag` | `scripts/deploy-smoke.mjs:864` - `saveState({ postgres: containerId('postgres') })`; `:879` - `containerId('postgres') === state().postgres`; `:885-886` - `result.status === 0` and the same postgres assertion | PASS |
| C9 | `tag-missing` non-zero; server/caddy IDs same, server on b, `deploy.env` identical | step `missing-tag`, 7 ok | `scripts/deploy-smoke.mjs:893` - `result.status !== 0`; `:248-253` - `after.containers[service] === before.containers[service]` for server, caddy, postgres (ID plus start time); `:254-257` - `imageOf(after.server) === ${REGISTRY}/server:tag-b`; `:258` - `after.deployEnv === before.deployEnv` | PASS |
| C10 | `tag-bad` (migrate exits 3) non-zero; server same and on b; `deploy.env` identical | step `bad-migrate`, 7 ok | precondition `scripts/deploy-smoke.mjs:355-357` - `CMD ["node", "-e", "process.exit(3)"]` on `migrate:tag-bad`; `:901` - `result.status !== 0`; `:246-259` via `assertUntouched` | PASS |
| C11 | `.env` absent / mode 644: non-zero, names `.env`, docker stub 0 calls | step `env-guard` | `scripts/deploy-smoke.mjs:367` - the stub appends each call to `STUB_CALLS`, first on `PATH` (`:825`); `:829` - `absent.status !== 0 && absent.output.includes('.env')`; `:830` - `noCalls()`; `:832-835` - same pair at `0o644` | PASS |
| C12 | empty stdin: non-zero, names the token, 0 docker calls | step `env-guard`, 6 ok | `scripts/deploy-smoke.mjs:837` - `input: ''`; `:838-841` - `noToken.status !== 0 && noToken.output.includes('token')`; `:842` - `noCalls()` | PASS |
| C13 | no `auths` entry for the registry after success and after both failures | steps `first`, `missing-tag`, `bad-migrate` | `scripts/deploy-smoke.mjs:87-91` - `registryAuths()` reads `$DOCKER_CONFIG/config.json` `.auths`; `:863` - `!registryAuths().includes(REGISTRY_HOST)` (first); `:259` - same, inside `assertUntouched` for missing-tag and bad-migrate | PASS |
| C14 | no script output contains the registry password | step `no-leak`, 2 ok | `scripts/deploy-smoke.mjs:112` - every `deploy()` run appends its output to the transcript; `:958` - `transcript.includes('deploy-remote.sh tag-a')`; `:959` - `!transcript.includes(state().password)` | PASS |
| C15 | rollback `tag-a` after b: exit 0, server a, `deploy.env` a, `.previous` b | step `rollback`, 4 ok | `scripts/deploy-smoke.mjs:908` - `result.status === 0`; `:909` - `imageOf(containerId('server')) === ${REGISTRY}/server:tag-a`; `:910` - `deployEnv().includes('IMAGE_TAG=tag-a\n')`; `:911-914` - `.previous` includes `IMAGE_TAG=tag-b\n` | PASS |
| C16 | `deploy-remote.sh` passes shellcheck | `docker run … koalaman/shellcheck:stable scripts/deploy-remote.sh` exit 0, no output | exit code 0 on `scripts/deploy-remote.sh:1` (whole file) | PASS |
| C17 | `deploy-staging` needs build, calls reusable with staging / `sha-${{ head_sha }}` / `head_sha` | step `workflow-callers` | `scripts/deploy-smoke.mjs:474-481` expected; `:501` - `job.uses === reusable`; `:502` - `job.needs === expected.needs`; `:503-506` - `JSON.stringify(job.with) === JSON.stringify(expected.with)` | PASS |
| C18 | environment name; checkout `inputs.ref`; copies exactly the 3 files to the right paths; runs `./deploy-remote.sh "$IMAGE_TAG"` with GHCR registry | step `workflow-remote-steps`, 14 ok | `scripts/deploy-smoke.mjs:534-537` - `job.environment.name === '${{ inputs.environment }}'`; `:538` - `job.env.IMAGE_REGISTRY === 'ghcr.io/arturmois/bens-seguros-v2'`; `:540` - `checkout?.with?.ref === '${{ inputs.ref }}'`; `:551-559` - sorted scp sources equal the three paths; `:560-568` - `destination === expected` per file; `:570-574` - `cd '$DEPLOY_PATH' && IMAGE_REGISTRY='$IMAGE_REGISTRY'` and `./deploy-remote.sh '$IMAGE_TAG'` | PASS |
| C19 | token only on stdin; no ssh/scp line has `TOKEN`/`github.token` | step `workflow-remote-steps` | `scripts/deploy-smoke.mjs:575-578` - the install line matches `printf '%s' "$REGISTRY_TOKEN"` piped into `ssh`; `:579` - `install.env.REGISTRY_TOKEN === '${{ github.token }}'`; `:580-594` - for every step of both workflows, `!command.includes('TOKEN') && !command.includes('github.token')` from the `ssh`/`scp` word on | PASS |
| C20 | every ssh/scp with `StrictHostKeyChecking=yes` + pinned known_hosts; never `no`/`accept-new` | step `workflow-ssh-options`, 10 ok | `scripts/deploy-smoke.mjs:601-605` - `SSH_KNOWN_HOSTS === '${{ secrets.SSH_KNOWN_HOSTS }}'` written to `~/.ssh/deploy_known_hosts`; `:609-613` - `ssh_opts` has `-o StrictHostKeyChecking=yes` and the pinned `UserKnownHostsFile`; `:615` - `invocations.length === 4`; `:616-621` - each uses `"${ssh_opts[@]}"`; `:622-628` - no `StrictHostKeyChecking=(no or accept-new)` in either file | PASS |
| C21 | health step 0 against the stack; non-zero against a closed port within 75 s | step `health-step`, 3 ok (closed port failed in 60 s) | `scripts/deploy-smoke.mjs:938-939` - `live.status === 0` with `SITE_URL=https://localhost:8543/` and Caddy's root CA; `:946-952` - `closed.status !== 0 && seconds <= 75` against `http://127.0.0.1:9`. The step under test is the new loop at `.github/workflows/deploy-environment.yml:110-123` | PASS |
| C22 | preflight: each of the six empty → non-zero naming it; all six set → 0 | step `preflight-step`, 9 ok | `scripts/deploy-smoke.mjs:739` - `runStep(run, full).status === 0` (with `SITE_URL: 'https://staging.example.com'`, `:737`); `:740-753` - for each of the six names, `result.status !== 0 && result.output.includes(name)` | PASS |
| C23 | concurrency `deploy-${{ inputs.environment }}`, `cancel-in-progress: false` | step `workflow-concurrency`, 1 ok | `scripts/deploy-smoke.mjs:634-638` - `JSON.stringify(job.concurrency) === JSON.stringify({ group: 'deploy-${{ inputs.environment }}', 'cancel-in-progress': false })` | PASS |
| C24 | promote `if` push + `refs/tags/v`; `on.push` = `{tags: ['v*']}` | step `workflow-promote-guard`, 2 ok | `scripts/deploy-smoke.mjs:644-648` - `deploy.jobs.promote.if === "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')"`; `:649-652` - `JSON.stringify(deploy.on.push) === JSON.stringify({ tags: ['v*'] })` | PASS |
| C25 | release tag accepts 2, rejects 4 | step `release-tag-step`, 6 ok | `scripts/deploy-smoke.mjs:658-660` - `.status === 0` for `v1.2.3`, `v10.0.12`; `:661-663` - `.status !== 0` for `v1.2`, `1.2.3`, `v1.2.3-rc.1`, `V1.2.3` | PASS |
| C26 | on-main step 0 on main, non-zero off main; runs before `imagetools create` | step `on-main-step`, 3 ok | `scripts/deploy-smoke.mjs:712` - `update-ref refs/remotes/origin/main main` (precondition); `:713-717` - `onMain.status === 0 && onMain.outputs === 'sha=<main sha>\n'`; `:718` - `.status !== 0` for `v1.0.1`; `:719-724` - `retagAt > names.indexOf('Tag commit is on main')` | PASS |
| C27 | images-exist exits 1 with the exact message for a missing SHA; 0 when the 3 exist | step `images-exist-step`, 4 ok | `scripts/deploy-smoke.mjs:771-774` - `status === 0` for `sha-${FAKE_SHA}`; `:775-784` - `missing.status === 1` and a line equal to `::error::Imagens sha-${OTHER_SHA} não encontradas: o CI deste commit passou em main?` | PASS |
| C28 | retag gives `v9.9.9` the same digest on all 3, no build | step `retag-step`, 4 ok | `scripts/deploy-smoke.mjs:809` - `result.status === 0`; `:810-816` - `digest(…:v9.9.9) === digest(…:sha-<SHA>)` per image, `source !== undefined`. The step's `run` (`.github/workflows/deploy.yml:161-169`) has only `imagetools create`, no build | PASS |
| C29 | `deploy-production` needs promote; production / `ref_name` / `ref_name` | step `workflow-callers` | `scripts/deploy-smoke.mjs:482-489` expected; `:501-506` - `uses`, `needs`, `JSON.stringify(job.with)` equality | PASS |
| C30 | dispatch inputs exact; `redeploy` needs resolve, passes the two inputs and `needs.resolve.outputs.ref` | step `workflow-callers`, 15 ok | `scripts/deploy-smoke.mjs:490-497` expected, asserted at `:501-506`; `:509-514` - `environment.type === 'choice'`, options `["staging","production"]`, `required === true`; `:515-518` - `image_tag.type === 'string' && required === true`; `:519` - `Object.keys(inputs).length === 2` | PASS |
| C31 | image-tag accepts 2, rejects 6 | step `image-tag-step`, 8 ok | `scripts/deploy-smoke.mjs:670-674` - `accepted.status === 0 && accepted.outputs === 'ref=${sha}\n'`; `:675-676` - `v1.2.3` → `ref=v1.2.3`; `:677-687` - `result.status !== 0 && result.outputs === ''` for the six rejected values | PASS |
| C32 | resolve checks format and existence; redeploy needs resolve; no SSH before redeploy | steps `workflow-callers`, `images-exist-step` | `scripts/deploy-smoke.mjs:521` - `resolve.if === "github.event_name == 'workflow_dispatch'"`; `:522-526` - both step names present; `:527-528` - `remote.length === 0`; `:502` - `redeploy` `needs === 'resolve'`; `:786-793` - resolve's `Image tag exists` passes on `tag-a` and `status !== 0` on `tag-missing` | PASS |
| C33 | 3 `image:` lines keeping `build:`; local smoke still passes | `grep -c --fixed-strings '${IMAGE_REGISTRY:-bens-seguros}/' docker-compose.prod.yml` printed `3`; `node scripts/staging-smoke.mjs up && … all` exit 0 (79 ok, e2e 90 passed) | `docker-compose.prod.yml:29-30,42-43,74-75` - `image:` followed by `build:` on migrate, server, caddy (file unchanged by the fix); the running `bens-staging-local` containers have `.Config.Image` `bens-seguros/server:local` and `bens-seguros/web:local` | PASS |
| C34 | 16 sections in order; cited repo paths exist; door-5 names in tutorial and workflow; every `secrets.*`/`vars.*` named | `node scripts/staging-smoke.mjs runbook` exit 0 (22 ok), alone and inside `all` | `scripts/staging-smoke.mjs:586-594` - `found.every(index >= 0)` and strictly increasing over the 16 prefixes; `:598` - fenced blocks now stripped even when indented (the round-1 note); `:606-609` - `existsSync(path)` for each cited path (9 citations, 5 distinct); `:616-625` - `names.includes(name)` for the six; `:626-628` - the tutorial names every name the workflows read | PASS |
| C35 | Rollback says `migration` + `não volta`; Pendências names backup F11; `staging.md` gone and unlinked; ADR-008 names `deploy.yml` | step `runbook`; `git grep -n 'runbooks/staging\.md' -- ':!.specs' ':!prompts'` exit 1; `grep -n 'deploy\.yml' docs/decisions/ADR-008-deployment.md` exit 0 | `scripts/staging-smoke.mjs:635-638` - `rollback.includes('migration') && rollback.includes('não volta')`; `:640` - `/backup/i.test(pending) && pending.includes('F11')`; `docs/runbooks/deploy.md:441` - "a migration não volta"; `docs/decisions/ADR-008-deployment.md:11` - cites `.github/workflows/deploy.yml`; `docs/runbooks/staging.md` does not exist (`test -e` exit 1) | PASS |
| C36 | health step fails on a non-200 (the `308` of `http://localhost:8180`) and prints the status | step `health-step`, 3 ok | `scripts/deploy-smoke.mjs:941-945` - `redirect.status !== 0 && redirect.output.includes('308')` (the URL has no `308` in it, so only the status line can satisfy it); code at `.github/workflows/deploy-environment.yml:114` - `[ "$status" = 200 ]` and `:119` - the error prints `último status: $status` | PASS |
| C37 | preflight rejects `http://…` and a URL with no scheme, with the exact message | step `preflight-step`, 9 ok | `scripts/deploy-smoke.mjs:755-761` - for `http://staging.example.com` and `staging.example.com`, `result.status !== 0 && result.output.includes('SITE_URL precisa começar com https://')`; code at `.github/workflows/deploy-environment.yml:58-61` | PASS |
| C38 | with `IMAGE_TAG=tag-a` in the env, `deploy-remote.sh tag-b` fails on the running-image check, `deploy.env` identical, server on tag-a | step `image-mismatch`, 3 ok | `scripts/deploy-smoke.mjs:921` - `deploy('tag-b', { env: { IMAGE_TAG: 'tag-a' } })` (precondition, merged last at `:108`); `:922-925` - `result.status !== 0 && result.output.includes('esperado ${REGISTRY}/server:tag-b')`, a string only `scripts/deploy-remote.sh:57` prints; `:926` - `deployEnv() === before`; `:927-930` - `imageOf(containerId('server')) === ${REGISTRY}/server:tag-a` | PASS |
| C39 | after `missing-tag` and `bad-migrate`, server, caddy and postgres have the same ID and the same `State.StartedAt` | steps `missing-tag`, `bad-migrate` (3 container lines each) | `scripts/deploy-smoke.mjs:234` - `RUNNING = ['server', 'caddy', 'postgres']`; `:236-242` - the snapshot value is `${id} ${State.StartedAt}` per service; `:248-253` - `after.containers[service] === before.containers[service]` for each; called at `:891,894` and `:899,902` | PASS |
| C40 | ADR-008's CD revision names `server`, `migrate`, `web` and says they replace `server` and `caddy-web` | ``grep -n 'substituem as `server` e `caddy-web`' docs/decisions/ADR-008-deployment.md`` exit 0 | `docs/decisions/ADR-008-deployment.md:12` - "As imagens no GHCR são três, `server`, `migrate` e `web` … substituem as `server` e `caddy-web` da decisão original" | PASS |

## Coverage

Rows the fix touched are verified at 6ce354b and recomputed from the code at `6ce354b`, not read from `checks.md:163-183`. The other rows are carried from 57b59fd: their authority (`deploy.yml`, `docker-compose.prod.yml`, the plan) was not touched by the fix, and their proofs re-ran green at `6ce354b`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| build guard conjuncts (5) - carried from 57b59fd | `.github/workflows/deploy.yml:35-40` | all five C1 (`:382-391`) | - |
| images (3) - carried from 57b59fd | `deploy.yml:62-94`; `docker-compose.prod.yml:29,42,74` | server, migrate, web C2 (`:420-432`), C6 (`:852-861`), C28 (`:810-816`) | - |
| `deploy-remote.sh` outcomes (8 named by the plan) - verified at 6ce354b | `scripts/deploy-remote.sh:12-61` (unchanged by the fix); plan AC 4-10 | success C6 · rotation C7, C15 · same tag C8 · missing tag C9 · migrate fails C10 · `.env` absent or 644 C11 · empty token C12 · running `server` is not `…/server:<tag>` (AC 4 "só se", `:56-57`) C38 (`:921-930`), fault 3 killed. Exits that no AC names are recorded but not counted, as in round 1: usage `:12`, tag grammar `:15`, `IMAGE_REGISTRY`/`REGISTRY_USER` unset `:21-22`, login `:36`, `up` `:54` | - |
| `deploy-remote.sh` exit codes (2) - verified at 6ce354b | same | `0` C6, C7, C8, C15 · non-zero C9, C10, C11, C12, C38 | - |
| containers a failed deploy must not stop or recreate (3) - verified at 6ce354b | long-running services of `docker-compose.prod.yml` (postgres, server, caddy); `scripts/deploy-smoke.mjs:234-259` | server C9, C10, C39 · caddy C9, C10, C39 · postgres C39 (`:234`, `:248-253`), with ID and start time, which covers "stopped" as well as "recreated"; fault 4 (postgres restarted on a failed migrate) killed | - |
| where the registry credential could leak (4) - verified at 6ce354b | `deploy-environment.yml:84-102`; `deploy-remote.sh:24-37` | ssh command line C19 · script output C14 · config after success C13 (`:863`) · config after failure C13 (`:259`) | - |
| workflow triggers (3) - carried from 57b59fd | `deploy.yml:8-25` | `workflow_run` C1 · tag push C24 · `workflow_dispatch` C30 | - |
| deploy callers (3) - carried from 57b59fd | `deploy.yml:96-105,171-180,226-235` | staging C17 · production C29 · redeploy C30 | - |
| door 5 names (6) - verified at 6ce354b | `deploy-environment.yml:43-48`; plan door 5 | each C22 (`:740-753`) and C34 (`scripts/staging-smoke.mjs:616-628`) | - |
| files copied to the VPS (3) - verified at 6ce354b | `deploy-environment.yml:97-99` | all three C18 (`:551-568`) | - |
| release tag format (6) - carried from 57b59fd | C25 / plan assumption | all six C25 | - |
| dispatch `image_tag` format (8) - carried from 57b59fd | AC 20 regex, `deploy.yml:193-205` | all eight C31 | - |
| promote outcomes (4) - carried from 57b59fd | `deploy.yml:117-169` | bad format C25 · not on main C26 · images missing C27 · retag same digest C28 | - |
| health step results (3 code paths) - verified at 6ce354b | `.github/workflows/deploy-environment.yml:110-123`: one test, `[ "$status" = 200 ]` (`:114`); any other status, and `000` when curl gets no answer (`:113`, where a curl error is ignored), loops until the 60 s deadline and exits 1 | `200` C21 (`:938-939`) · any non-200 HTTP status C36 (`308`, `:941-945`), fault 1 killed · no HTTP answer (`000`) C21 (refused, `:946-952`), fault 5 killed. The round-1 members 4xx/5xx and timeout now take these same two rejecting paths. Ad hoc probe of the step's own `run` at `6ce354b` (not a repo proof, corroboration only): a `404` from `python3 -m http.server` exited 1 in 60 s with `último status: 404`, and a socket that accepts but never answers exited 1 in 70 s with `último status: 000` | - |
| `SITE_URL` accepted by the preflight (3) - verified at 6ce354b (new set) | `deploy-environment.yml:58-61` | `https://…` C22 (`:737-739`) · `http://…` C37 · no scheme C37 (`:755-761`), fault 2 killed | - |
| Landing doors (6) - carried from 57b59fd | plan Landing | 1 C2, C28, C31 · 2 C28 · 3 C18, C7 · 4 C33 · 5 C19, C22 · 6 C4, C20 | - |
| tutorial sections (16) - verified at 6ce354b | AC 23 | C34, table-driven (`scripts/staging-smoke.mjs:568-594`) | - |
| places that assemble the image name (4) - carried from 57b59fd | `docker-compose.prod.yml:29,42,74`; `deploy-remote.sh:46`; `deploy.yml:30`; `deploy-environment.yml:36` | compose C33 · `deploy.env` C7 · both workflow `IMAGE_REGISTRY` literals C2 (`:403-406`), C18 (`:538`) | - |

## Test policy rows

Verified at 6ce354b. Round 1 found rows 1 and 2 unmet. Row 3 classifies `deploy-environment.yml`, which the fix touched, so all three are re-judged.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| `deploy-remote.sh` decides (7 outcomes, 9 branch points) | `scripts/deploy-remote.sh` | runs against real Docker and a real registry with htpasswd auth; the docker stub is used only for "not called" (C11, C12) | yes - every listed outcome has a run against real Docker, and the image-check branch point (`:56-57`) is now reached by step `image-mismatch` (C38). Fault 3 shows a proof depends on it |
| workflow `run` steps that decide | `deploy.yml:117-224`; `deploy-environment.yml:49-66,110-123` | the step's own `run` read from YAML and executed with bash `-eo pipefail` (`scripts/deploy-smoke.mjs:142-161`) | yes - tag formats 6/6 and 8/8, on-main 2/2, images-exist 4/4, preflight 9/9 (six names empty, all set, two schemes). Health has one case per code path: `200`, a non-200 status (`308`) and a request that gets nothing back (refused) |
| workflow structure | `deploy.yml`, `deploy-environment.yml` | read as data via `mikefarah/yq` (`scripts/deploy-smoke.mjs:120-130`) plus actionlint | yes - every member of the trigger, caller, permission, `uses`, concurrency and ssh-option sets is asserted (C1-C4, C17-C20, C23, C24, C29, C30), and actionlint exited 0 at `6ce354b` |

## Faults injected

Verified at 6ce354b. The faults were re-injected on the surfaces the fix touched or created, one per distinct assertion surface, with a cap of five. The round-1 faults 1-4 target code the fix did not change and are carried from 57b59fd: logout trap, `.env` mode, `deploy.env` written before migrate, and the dispatch regex. All were killed then, and their proofs re-ran green at `6ce354b`.

All five ran in `git worktree add --detach <scratch>/verify-wt 6ce354b`. For script faults, the mutated `deploy-remote.sh` was copied into the smoke's `DEPLOY_PATH`, as the workflow copies it on every deploy. The HEAD copy was restored after each run and checked with `cmp`. Preconditions came from HEAD-script steps: `same-tag` before fault 4 put the server on `tag-b`. Real-tree porcelain was empty before and after. The worktree was removed and pruned. The smoke was then rebuilt from the real tree (`up`, `all` exit 0 with 141 ok) and brought `down`.

| Mutation | Location | Killed |
| --- | --- | --- |
| health accepts any `2xx`/`3xx`: `[ "$status" = 200 ]` → `[[ "$status" =~ ^[23] ]]` | `.github/workflows/deploy-environment.yml:114` | yes - `health-step` stops at `not ok - fails against the 308 of http:// and prints the status` (`scripts/deploy-smoke.mjs:942-945`) |
| https preflight no longer sets `missing=1` (`missing=1` → `:`) | `.github/workflows/deploy-environment.yml:60` | yes - `preflight-step` stops at `not ok - rejects SITE_URL=http://staging.example.com` (`scripts/deploy-smoke.mjs:757-760`) |
| running-image guard removed (line → `:`) | `scripts/deploy-remote.sh:57` | yes - `image-mismatch` stops at `not ok - deploy tag-b with IMAGE_TAG=tag-a in the environment fails on the image check` (`scripts/deploy-smoke.mjs:922-925`); the mutant wrote `IMAGE_TAG=tag-b` to `deploy.env` while the server ran `…/server:tag-a` |
| failed migrate restarts postgres before exiting (`… or { compose restart postgres; die …; }`) | `scripts/deploy-remote.sh:51` | yes - `bad-migrate` stops at `not ok - failed migrate: the postgres container is the same and was not restarted` (`scripts/deploy-smoke.mjs:249-252`). Same ID, new start time: the round-1 snapshot (IDs of server and caddy only) would have let it through |
| health deadline `SECONDS + 60` → `SECONDS + 90` | `.github/workflows/deploy-environment.yml:111` | yes - `health-step` stops at `not ok - fails against a closed port in 90s` (`scripts/deploy-smoke.mjs:949-952`) |

## Gate

Verified at 6ce354b. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exited 0, with the output captured to a file. Biome checked 164 files and applied no fixes. Typecheck was clean. Vitest ran 31 files: 308 passed, 0 failed. Build finished for server and web.

## Ranked gaps

None. The four round-1 gaps are closed at `6ce354b`:

1. Health accepts only `200`: C36, faults 1 and 5.
2. Running-image guard proven: C38, fault 3.
3. Postgres and start time in the failed-deploy snapshot: C39, fault 4.
4. ADR-008 records the three images: C40, `docs/decisions/ADR-008-deployment.md:12`.

Notes (do not change the verdict):

- AC 12 timing. The loop checks the deadline only between attempts, and each attempt may take up to `--max-time 10`. So a site that never answers fails after up to about 70 s, which the probe measured. An attempt that starts before 60 s and gets `200` after 60 s passes. C21's 75 s bound was approved with this tolerance ("plus one attempt"), so this is a precision note on AC 12's "em até 60 segundos", not a finding.
- The round-1 note on the `runbook` proof's fence stripping is resolved by `scripts/staging-smoke.mjs:598`. At `6ce354b` the step finds 9 path citations, 5 distinct, all present.
- Carried from 57b59fd: the C34 proof reads the door-5 names from both workflows together (`scripts/staging-smoke.mjs:610-625`). A grep at `6ce354b` confirms all six are in `deploy-environment.yml:43-48`.
