# CD na VPS verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 14fbe74..57b59fd
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All 35 checks are proven as written, but the verdict is FAIL on four findings outside the checks' own wording:

1. The health step accepts a response that is not `200` (AC 12). Against the smoke stack's HTTP port it exits 0 on a `308`.
2. A mutant survived on the running-image check of `deploy-remote.sh` (AC 4, "sair com `0` só se…"). No proof reaches that branch, even though it is live.
3. AC 6's "no container stopped or recreated" is proven for `server` and `caddy` only. `postgres` on a failed deploy maps to C8, which proves the success path.
4. ADR-008 names the images `server` and `caddy-web`. Door 1 and C2 use `server`, `migrate` and `web`, and this feature's ADR revision does not record the change.

How it ran: `node scripts/deploy-smoke.mjs down && up` (fresh registry and images, not the author's leftover state), then `node scripts/deploy-smoke.mjs all`, exit 0: 24 steps, each printed as `# <step>` with its `ok -` lines. actionlint and shellcheck exited 0. `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all` exited 0: 79 `ok -` lines over 15 steps including `runbook`, then `pnpm e2e` with 90 passed. Real-tree `git status --porcelain` was empty before the run, empty after the faults and worktree removal, and empty after the gate. Nothing was pushed or deployed.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-008-deployment.md` | yes - read in full at `57b59fd` (`:1-44`); deploy by tag, GHCR, SSH, `pull`, `run --rm migrate`, `up -d`, health check, rollback by the previous tag all match C2, C6, C18, C21, C24, C30 | `:26` decides the GHCR images are `server` and `caddy-web`; door 1 (`plan.md:78`) and C2 (`checks.md:33`) publish `server`, `migrate` and `web` (`deploy.yml:70,82,92`). The CD revision this feature added (`:10-13`) does not record the rename or the third image | - |
| `docs/roadmap.md`, milestone "Staging publicado" | yes - `docs/roadmap.md:68-72` | none. The criterion (staging answers, `/api/health`, login and onboarding) needs the real VPS; plan Open question 1 leaves it to the user's first deploy | - |

## Checks

The deploy-smoke proofs come from one `node scripts/deploy-smoke.mjs all` invocation after a fresh `up`, exit 0, with every named step present in the output. `ORDER` is at `scripts/deploy-smoke.mjs:933-958`. Every step is new in this diff (`scripts/deploy-smoke.mjs` is added in `b062e28`). Citations below are `scripts/deploy-smoke.mjs` unless another file is named.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `build.if` = the five conjuncts; `on.workflow_run` CI/completed/main | step `workflow-build-guard`, 7 ok | `:368-377` - `conjuncts.includes(expected)` for each of the five literals; `:378` - `conjuncts.length === 5`; `:380-384` - `JSON.stringify(trigger) === JSON.stringify({ workflows: ['CI'], types: ['completed'], branches: ['main'] })` | PASS |
| C2 | checkout `head_sha`; exactly 3 images, files/targets, only `sha-<head_sha>`, amd64, push | step `workflow-build-images`, 9 ok | `:390-392` - `deploy.env.IMAGE_REGISTRY === 'ghcr.io/arturmois/bens-seguros-v2'`; `:396-398` - `checkout?.with?.ref === '${{ github.event.workflow_run.head_sha }}'`; `:401` - `pushes.length === 3`; `:408-410` - `item.with.tags === tags` (only the sha tag); `:411-417` - `context === '.' && file === file && target === target && platforms === 'linux/amd64' && push === true` | PASS |
| C3 | top `permissions: {}`; build exactly contents read, packages write | step `workflow-permissions`, 2 ok | `:425` - `JSON.stringify(deploy.permissions) === '{}'`; `:426-429` - `JSON.stringify(deploy.jobs.build.permissions) === JSON.stringify({ contents: 'read', packages: 'write' })` | PASS |
| C4 | only the four official actions and the local reusable workflow | step `workflow-actions`, 1 ok | `:435-441` - the allowed set; `:450-452` - `used.length > 0 && foreign.length === 0`, collecting job-level and step-level `uses` of both files (`:443-448`) | PASS |
| C5 | both workflows pass actionlint | `docker run … rhysd/actionlint:latest -color .github/workflows/deploy.yml .github/workflows/deploy-environment.yml` exit 0, no output | exit code 0 on `.github/workflows/deploy.yml` and `.github/workflows/deploy-environment.yml` | PASS |
| C6 | `tag-a` exits 0; server/caddy/last migrate on `…:tag-a`; health 200 | step `first`, 6 ok | `:827-829` - `result.status === 0`; `:831-839` - `imageOf(containerId(service, true)) === ${REGISTRY}/${image}:tag-a` for server/server, caddy/web, migrate/migrate; `:841` - `(await health()) === 200` | PASS |
| C7 | after a then b: `deploy.env` b, `.previous` a, both `IMAGE_REGISTRY`; server on b | step `second`, 7 ok | `:852` - `current.includes('IMAGE_TAG=tag-b\n')`; `:853` - `previous.includes('IMAGE_TAG=tag-a\n')`; `:854-856` - `file.includes('IMAGE_REGISTRY=${REGISTRY}\n')` for both; `:857` - `imageOf(containerId('server')) === ${REGISTRY}/server:tag-b` | PASS |
| C8 | same tag again exits 0; postgres ID unchanged across 2nd and 3rd deploy | steps `second`, `same-tag` | `:843` - `saveState({ postgres: containerId('postgres') })` after the first deploy; `:858` - `containerId('postgres') === state().postgres` (second); `:864-865` - `result.status === 0`, same postgres assertion (third) | PASS |
| C9 | `tag-missing` non-zero; server/caddy IDs same, server on b, `deploy.env` identical | step `missing-tag`, 6 ok | `:872` - `result.status !== 0`; `:239-240` - `after.server === before.server`, `after.caddy === before.caddy`; `:241-244` - `imageOf(after.server) === ${REGISTRY}/server:tag-b`; `:245` - `after.deployEnv === before.deployEnv`. Transcript shows it failed at `pull …/migrate:tag-missing` | PASS |
| C10 | `tag-bad` (migrate exits 3) non-zero; server same and on b; `deploy.env` identical | step `bad-migrate`, 6 ok | precondition `:342-344` - `CMD ["node", "-e", "process.exit(3)"]` on `migrate:tag-bad`; `:880` - `result.status !== 0`; `:239`, `:241-245` via `assertUntouched`. Transcript: `deploy: erro: migrate falhou` | PASS |
| C11 | `.env` absent / mode 644: non-zero, names `.env`, docker stub 0 calls | step `env-guard` | `:354` - the stub appends each call to `STUB_CALLS`, on `PATH` first (`:804`); `:808` - `absent.status !== 0 && absent.output.includes('.env')`; `:809` - `noCalls()`; `:811-814` - same pair at `0o644` | PASS |
| C12 | empty stdin: non-zero, names the token, 0 docker calls | step `env-guard`, 6 ok | `:816` - `input: ''`; `:817-820` - `noToken.status !== 0 && noToken.output.includes('token')`; `:821` - `noCalls()` | PASS |
| C13 | no `auths` entry for the registry after success and after both failures | steps `first`, `missing-tag`, `bad-migrate` | `:87-91` - `registryAuths()` reads `$DOCKER_CONFIG/config.json` `.auths`; `:842` - `!registryAuths().includes(REGISTRY_HOST)` (first); `:246` - same, inside `assertUntouched` for missing-tag and bad-migrate | PASS |
| C14 | no script output contains the registry password | step `no-leak`, 2 ok | `:108` - every `deploy()` run appends stdout+stderr to the transcript; `:915` - `transcript.includes('deploy-remote.sh tag-a')`; `:916` - `!transcript.includes(state().password)` | PASS |
| C15 | rollback `tag-a` after b: exit 0, server a, `deploy.env` a, `.previous` b | step `rollback`, 4 ok | `:887` - `result.status === 0`; `:888` - `imageOf(containerId('server')) === ${REGISTRY}/server:tag-a`; `:889` - `deployEnv().includes('IMAGE_TAG=tag-a\n')`; `:890-893` - `.previous` `includes('IMAGE_TAG=tag-b\n')` | PASS |
| C16 | `deploy-remote.sh` passes shellcheck | `docker run … koalaman/shellcheck:stable scripts/deploy-remote.sh` exit 0, no output | exit code 0 on `scripts/deploy-remote.sh` | PASS |
| C17 | `deploy-staging` needs build, calls reusable with staging / `sha-${{ head_sha }}` / `head_sha` | step `workflow-callers` | `:461-468` expected; `:488` - `job.uses === reusable`; `:489` - `job.needs === expected.needs`; `:490-493` - `JSON.stringify(job.with) === JSON.stringify(expected.with)` | PASS |
| C18 | environment name; checkout `inputs.ref`; copies exactly the 3 files to the right paths; runs `./deploy-remote.sh "$IMAGE_TAG"` with GHCR registry | step `workflow-remote-steps`, 14 ok | `:521-524` - `job.environment.name === '${{ inputs.environment }}'`; `:525` - `job.env.IMAGE_REGISTRY === 'ghcr.io/arturmois/bens-seguros-v2'`; `:527` - `checkout?.with?.ref === '${{ inputs.ref }}'`; `:538-546` - sorted scp sources equal the three paths; `:547-555` - `destination === expected` per file; `:557-561` - `cd '$DEPLOY_PATH' && IMAGE_REGISTRY='$IMAGE_REGISTRY'` and `./deploy-remote.sh '$IMAGE_TAG'` | PASS |
| C19 | token only on stdin; no ssh/scp line has `TOKEN`/`github.token` | step `workflow-remote-steps` | `:562-565` - the install line matches `printf '%s' "$REGISTRY_TOKEN"` piped into `ssh`; `:566` - `install.env.REGISTRY_TOKEN === '${{ github.token }}'`; `:567-580` - for every step of both workflows, `!command.includes('TOKEN') && !command.includes('github.token')` from the `ssh`/`scp` word on | PASS |
| C20 | every ssh/scp with `StrictHostKeyChecking=yes` + pinned known_hosts; never `no`/`accept-new` | step `workflow-ssh-options`, 10 ok | `:588-592` - `SSH_KNOWN_HOSTS === '${{ secrets.SSH_KNOWN_HOSTS }}'` written to `~/.ssh/deploy_known_hosts`; `:596-600` - `ssh_opts` has `-o StrictHostKeyChecking=yes` and `-o UserKnownHostsFile="$HOME/.ssh/deploy_known_hosts"`; `:602` - `invocations.length === 4`; `:603-608` - each uses `"${ssh_opts[@]}"`; `:609-615` - no `StrictHostKeyChecking=no` or `=accept-new` in the text on both files | PASS |
| C21 | health step 0 against the stack; non-zero against a closed port within 75 s | step `health-step`, 2 ok (closed port failed in 60 s) | `:901-902` - `live.status === 0` with `SITE_URL=https://localhost:8543/` and Caddy's root CA; `:904-909` - `closed.status !== 0 && seconds <= 75` against `http://127.0.0.1:9`. The claim is proven as written. See ranked gap 1 for the `3xx` case it does not cover | PASS |
| C22 | preflight: each of the six empty → non-zero naming it; all six set → 0 | step `preflight-step`, 7 ok | `:726` - `runStep(run, full).status === 0`; `:727-739` - for each of the six names, `result.status !== 0 && result.output.includes(name)` | PASS |
| C23 | concurrency `deploy-${{ inputs.environment }}`, `cancel-in-progress: false` | step `workflow-concurrency`, 1 ok | `:621-624` - `JSON.stringify(job.concurrency) === JSON.stringify({ group: 'deploy-${{ inputs.environment }}', 'cancel-in-progress': false })` | PASS |
| C24 | promote `if` push + `refs/tags/v`; `on.push` = `{tags: ['v*']}` | step `workflow-promote-guard`, 2 ok | `:631-634` - `deploy.jobs.promote.if === "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')"`; `:636-638` - `JSON.stringify(deploy.on.push) === JSON.stringify({ tags: ['v*'] })` | PASS |
| C25 | release tag accepts 2, rejects 4 | step `release-tag-step`, 6 ok | `:645-647` - `runStep(run, { RELEASE_TAG: tag }).status === 0` for `v1.2.3`, `v10.0.12`; `:648-650` - `.status !== 0` for `v1.2`, `1.2.3`, `v1.2.3-rc.1`, `V1.2.3` | PASS |
| C26 | on-main step 0 on main, non-zero off main; runs before `imagetools create` | step `on-main-step`, 3 ok | `:699` - `update-ref refs/remotes/origin/main main` (precondition); `:700-704` - `onMain.status === 0 && onMain.outputs === 'sha=<main sha>\n'`; `:705` - `runStep(run, { RELEASE_TAG: 'v1.0.1' }, repo).status !== 0`; `:707-711` - `retagAt > names.indexOf('Tag commit is on main')` | PASS |
| C27 | images-exist exits 1 with the exact message for a missing SHA; 0 when the 3 exist | step `images-exist-step`, 4 ok | `:750-753` - `status === 0` for `sha-${FAKE_SHA}` (pushed in `up`, `:335`); `:754-762` - `missing.status === 1 && missing.output.split('\n').includes('::error::Imagens sha-${OTHER_SHA} não encontradas: o CI deste commit passou em main?')` | PASS |
| C28 | retag gives `v9.9.9` the same digest on all 3, no build | step `retag-step`, 4 ok | `:788` - `result.status === 0`; `:789-795` - `digest(…:v9.9.9) === digest(…:sha-<SHA>)` per image, `source !== undefined`. The step's `run` (`deploy.yml:166-169`) has no build command | PASS |
| C29 | `deploy-production` needs promote; production / `ref_name` / `ref_name` | step `workflow-callers` | `:469-476` expected; `:488-493` - `uses`, `needs`, `JSON.stringify(job.with)` equality | PASS |
| C30 | dispatch inputs exact; `redeploy` needs resolve, passes the two inputs and `needs.resolve.outputs.ref` | step `workflow-callers`, 15 ok | `:477-484` expected, asserted at `:488-493`; `:496-501` - `inputs.environment.type === 'choice' && JSON.stringify(options) === '["staging","production"]' && required === true`; `:502-505` - `image_tag.type === 'string' && required === true`; `:506` - `Object.keys(inputs).length === 2` | PASS |
| C31 | image-tag accepts 2, rejects 6 | step `image-tag-step`, 8 ok | `:657-661` - `accepted.status === 0 && accepted.outputs === 'ref=${sha}\n'`; `:662-663` - `v1.2.3` → `ref=v1.2.3`; `:664-674` - `result.status !== 0 && result.outputs === ''` for the six rejected values | PASS |
| C32 | resolve checks format and existence; redeploy needs resolve; no SSH before redeploy | steps `workflow-callers`, `images-exist-step` | `:508` - `resolve.if === "github.event_name == 'workflow_dispatch'"`; `:510-513` - both step names present; `:514-515` - `remote.length === 0` (no `ssh`/`scp` in resolve); `:489` - `redeploy` `needs === 'resolve'`; `:765-772` - resolve's `Image tag exists` passes on `tag-a` and `status !== 0` on `tag-missing` | PASS |
| C33 | 3 `image:` lines keeping `build:`; local smoke still passes | `grep -c --fixed-strings '${IMAGE_REGISTRY:-bens-seguros}/' docker-compose.prod.yml` printed `3`; `node scripts/staging-smoke.mjs up && … all` exit 0 (79 ok, e2e 90 passed) | `docker-compose.prod.yml:29-30,42-43,74-75` - `image:` followed by `build:` on migrate, server, caddy; the running staging containers have `.Config.Image` `bens-seguros/server:local` and `bens-seguros/web:local` | PASS |
| C34 | 16 sections in order; cited repo paths exist; door-5 names in tutorial and workflow; every `secrets.*`/`vars.*` named | `node scripts/staging-smoke.mjs all` (step `runbook`, 22 ok) | `scripts/staging-smoke.mjs:586-594` - `found.every(index >= 0)` and strictly increasing over the 16 prefixes; `:606-609` - `existsSync(path)` for each cited path (5 distinct); `:616-625` - `names.includes(name)` for the six; `:626-628` - `text.includes('\`${name}\`')` for every name the workflows read. Grep: all six names occur in `deploy-environment.yml` (4-10 hits each). See the notes on the proof's fence stripping | PASS |
| C35 | Rollback says `migration` + `não volta`; Pendências names backup F11; `staging.md` gone and unlinked; ADR-008 names `deploy.yml` | step `runbook`; `git grep -n 'runbooks/staging\.md' -- ':!.specs' ':!prompts'` exit 1; `grep -n 'deploy\.yml' docs/decisions/ADR-008-deployment.md` exit 0 | `scripts/staging-smoke.mjs:635-638` - `rollback.includes('migration') && rollback.includes('não volta')`; `:640` - `/backup/i.test(pending) && pending.includes('F11')`; `docs/runbooks/deploy.md:441` - "a migration não volta"; `docs/decisions/ADR-008-deployment.md:11` - cites `.github/workflows/deploy.yml`; `docs/runbooks/staging.md` does not exist | PASS |

## Coverage

Recomputed at `57b59fd` from the code and from the plan's criteria, not read from `checks.md:153-172`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| build guard conjuncts (5) | `.github/workflows/deploy.yml:35-40` | all five C1 (`:368-378`) | - |
| images (3) | `deploy.yml:62-94`; `docker-compose.prod.yml:29,42,74` | server, migrate, web C2 (`:407-419`), C6 (`:831-839`), C28 (`:789-795`) | - |
| `deploy-remote.sh` outcomes (8 named by the plan; 13 exits in the code) | `scripts/deploy-remote.sh:12-61`; plan AC 4-10 | success C6 · rotation C7, C15 · same tag C8 · missing tag C9 · migrate fails C10 · `.env` absent or 644 C11 · empty token C12 · **running `server` is not `…/server:<tag>` → non-zero, `deploy.env` untouched (AC 4 "só se", `:56-57`): no proof**. Exits in the code that no AC names, recorded but not counted: usage `:12`, tag grammar `:15`, `IMAGE_REGISTRY`/`REGISTRY_USER` unset `:21-22`, login fails `:36`, `up` fails `:54` | running-image mismatch (AC 4) - the check is live (shown with `IMAGE_TAG=tag-a` in the caller's environment: HEAD exits non-zero with `server rodando …:tag-a, esperado …:tag-b`), and fault 5 removing it survives |
| `deploy-remote.sh` exit codes (2) | same | `0` C6, C7, C8, C15 · non-zero C9, C10, C11, C12 | - |
| containers a failed deploy must not stop or recreate (AC 6: any container; AC 7: server) | `docker-compose.prod.yml` long-running services postgres, server, caddy; `scripts/deploy-smoke.mjs:229-247` | server C9, C10 · caddy C9 (and C10) · **postgres: only C8, which is two successful deploys (`:858`, `:865`); `snapshot()` (`:229-235`) holds server, caddy and `deploy.env` only** | postgres across a failed deploy (AC 6) |
| where the registry credential could leak (4) | `deploy-environment.yml:79-97`; `deploy-remote.sh:24-37` | ssh command line C19 · script output C14 · config after success C13 (`:842`) · config after failure C13 (`:246`) | - |
| workflow triggers (3) | `deploy.yml:8-25` | `workflow_run` C1 · tag push C24 · `workflow_dispatch` C30 | - |
| deploy callers (3) | `deploy.yml:96-105,171-180,226-235` | staging C17 · production C29 · redeploy C30 | - |
| door 5 names (6) | `deploy-environment.yml:43-48`; plan `:82` | each C22 (`:727-739`) and C34 (`scripts/staging-smoke.mjs:616-628`) | - |
| files copied to the VPS (3) | `deploy-environment.yml:92-94` | all three C18 (`:538-555`) | - |
| release tag format (6) | C25 / plan assumption | all six C25 | - |
| dispatch `image_tag` format (8) | AC 20 regex, `deploy.yml:198-205` | all eight C31 | - |
| promote outcomes (4) | `deploy.yml:117-169` | bad format C25 · not on main C26 · images missing C27 · retag same digest C28 | - |
| health step results (AC 12: 200 passes, anything else fails within 60 s) | `deploy-environment.yml:100-106`; curl `--fail` fails only on HTTP ≥ 400 | 200 C21 · connection refused C21 · **3xx: exits 0 at HEAD** (step run against `http://localhost:8180` returned `308` and the step exited 0) · 4xx/5xx: no case (`--fail` should catch them) · no answer within `--max-time`: no case | 3xx (a wrong result at HEAD), 4xx/5xx, timeout |
| Landing doors (6) | plan `:76-83` | 1 C2, C28, C31 · 2 C28 · 3 C18, C7 · 4 C33 · 5 C19, C22 · 6 C4, C20 | - |
| tutorial sections (16) | AC 23 | C34, table-driven (`scripts/staging-smoke.mjs:568-594`) | - |
| places that assemble the image name (4) | `docker-compose.prod.yml:29,42,74`; `deploy-remote.sh:46`; `deploy.yml:30`; `deploy-environment.yml:36` | compose C33 · `deploy.env` C7 · both workflow `IMAGE_REGISTRY` literals C2 (`:390-392`), C18 (`:525`) | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| `deploy-remote.sh` decides (7 outcomes, 9 branch points) | `scripts/deploy-remote.sh` | runs against real Docker and a real registry with htpasswd auth; the docker stub is used only for "not called" (C11, C12) | no - all 7 listed outcomes ran against real Docker. But the "image check" branch point that this row counts (`:56-57`) has no run, and AC 4 names its outcome. Fault 5 shows no proof depends on it |
| workflow `run` steps that decide | `deploy.yml:117-124,130-140,150-159,193-224`; `deploy-environment.yml:41-61,100-106` | the step's own `run` read from YAML and executed with bash `-eo pipefail` (`:137-157`) | no - tag formats 6/6 and 8/8, on-main 2/2, images-exist 4/4 and preflight 7/7 are all run. The health step has one rejected case, a closed port, out of refused / 3xx / 4xx-5xx / timeout, and the 3xx case is accepted at HEAD |
| workflow structure | `deploy.yml`, `deploy-environment.yml` | read as data via `mikefarah/yq` (`:116-126`) plus actionlint | yes - every member of the trigger, caller, permission, `uses`, concurrency and ssh-option sets is asserted (C1-C4, C17-C20, C23, C24, C29, C30), and actionlint exited 0 |

## Faults injected

All faults ran in `git worktree add <scratch>/verify-wt HEAD`. The `first`/`bad-migrate` steps run the script copied into the smoke's `DEPLOY_PATH` at `up`, so the mutated `deploy-remote.sh` was copied there (as the workflow copies it on every deploy) and the HEAD copy was restored with `cmp` after each run. Real-tree porcelain was empty before and after. The worktree was removed. Afterwards the smoke was rebuilt from the real tree: `up`, then `all` with exit 0 (133 `ok -`, no `not ok`), then `down`. No `bens-deploy-smoke` container or registry is left, and the scratch dir is gone.

| Mutation | Location | Killed |
| --- | --- | --- |
| cleanup trap no longer runs `docker logout` | `scripts/deploy-remote.sh:30` | yes - `first` fails `no credential left for the registry` (`scripts/deploy-smoke.mjs:842`) |
| `.env` mode check removed | `scripts/deploy-remote.sh:20` | yes - `env-guard` fails `.env at 644: fails and names .env` (`:813`) |
| `deploy.env` written before `migrate` (`cp "$next" deploy.env` after line 46) | `scripts/deploy-remote.sh:46-47` | yes - `bad-migrate` fails `failed migrate: deploy.env is byte-identical` (`:245`) |
| dispatch regex `^sha-([0-9a-f]{40})$` → `{7,40}` | `.github/workflows/deploy.yml:198` | yes - `image-tag-step` fails `rejects "sha-abc1234"` (`:673`) |
| running-image check removed (the `[ "$running" = … ]` test and its `die` → `:`) | `scripts/deploy-remote.sh:57` | no - survived: `first` exits 0 with all 6 ok. No other step reaches the branch. With `IMAGE_TAG=tag-a` in the caller's environment, a `tag-b` deploy by the mutant exits 0 and writes `IMAGE_TAG=tag-b` while the server runs `…/server:tag-a`. HEAD refuses the same run |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` - exit 0. Biome checked 164 files with no fixes. Typecheck clean. Vitest: 31 files, 308 passed, 0 failed. Build done (server and web).

## Ranked gaps

1. **The health step accepts a non-200 response (AC 12).** Location: `.github/workflows/deploy-environment.yml:104-106`. `curl --fail` fails only on status ≥ 400, so a redirect exits 0 without the server being reached. Measured at HEAD: `http://localhost:8180/api/health` answers `308`, and the step's own `run` exited 0. It happens whenever `SITE_URL` is `http://…`, because Caddy redirects to HTTPS. C21 only proves a closed port. Fix: assert the status code (for example `--write-out '%{http_code}'` compared with `200`, or `--location` plus a status check). Add a 3xx case and one 5xx/4xx case to `health-step`.
2. **Surviving mutant on AC 4's "só se".** Location: `scripts/deploy-remote.sh:56-57`. Removing the running-image check passes every step. The check is live: an `IMAGE_TAG` exported in the SSH session (shell env beats `--env-file` in Compose) makes `up` keep the old image. Fix: add a smoke step that deploys `tag-b` with `IMAGE_TAG=tag-a` in the environment. It should assert non-zero, `deploy.env` byte-identical and no credential left.
3. **AC 6's "any container" is proven for server and caddy only.** Location: `scripts/deploy-smoke.mjs:229-235`. The Coverage row maps postgres to C8, a success-path proof. Fix: add `postgres: containerId('postgres')` to `snapshot()`. Precision note on the checks: ID equality proves "not recreated" but not "not stopped", which AC 6 also names. `State.StartedAt` equality would cover both.
4. **ADR-008 contradicts door 1 on the image names.** Location: `docs/decisions/ADR-008-deployment.md:26` says `server` and `caddy-web`; C2 and `deploy.yml` publish `server`, `migrate` and `web`. Fix: add one line to the CD revision (`:10-13`) naming the three images.

Notes (do not change the verdict):

- The `runbook` proof strips only fences that start at column 0 (`scripts/staging-smoke.mjs:598`). The indented fences at `docs/runbooks/deploy.md:218,220,408,412` put prose and code out of phase from line 218 on. At HEAD a fence-aware parse finds the same five cited paths, all present, so C34 holds, but a later path cited after line 218 could escape the check.
- The C34 proof reads door-5 names from the union of both workflows (`scripts/staging-smoke.mjs:610-625`), not from `deploy-environment.yml` alone. A grep at HEAD confirms all six are in `deploy-environment.yml`.
