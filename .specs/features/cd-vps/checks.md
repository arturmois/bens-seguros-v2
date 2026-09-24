# CD na VPS checks

Profile: standard
Plan: `.specs/features/cd-vps/plan.md`

35 checks in 7 slices · 6 one-way doors · 1 open, of which 0 block (1 blocks go-live)

Every command runs from the repo root. `rg` means real ripgrep; in this shell it runs as
`ARGV0=rg ~/.local/bin/claude <args>` (see erp-prune checks, Handoff).

Two proof tools, both new in this feature:

- `node scripts/deploy-smoke.mjs <step>` - local proof of `scripts/deploy-remote.sh` and of the
  workflow steps. `up` starts a registry (`registry:3`, htpasswd auth, `127.0.0.1:5055`) and
  pushes the locally built images under two tags; each script step deploys into a scratch
  `DEPLOY_PATH` that holds only the files the workflow copies (no `apps/`, no git), with
  `COMPOSE_PROJECT_NAME=bens-deploy-smoke`, ports `8180`/`8543`, and its own `DOCKER_CONFIG`.
  Workflow steps are read with `mikefarah/yq` (YAML to JSON, in Docker) and the `run` of a named
  step is executed with `bash -e` and the env the workflow gives it. Script steps depend on the
  previous ones: `all` runs them in the order listed here; `down` removes everything.
- Static linters, in Docker: `rhysd/actionlint` and `koalaman/shellcheck`.

A step's name in a proof below means `node scripts/deploy-smoke.mjs <step>` exits 0 after the
steps before it in `all` ran.

## Checks

### S1 - imagens publicadas uma vez por commit verde em `main` · 2 files · ~8 KB · ~2k

**C1** - The `build` job of `deploy.yml` runs only when `github.event_name == 'workflow_run'`, `github.event.workflow_run.conclusion == 'success'`, `github.event.workflow_run.event == 'push'`, `github.event.workflow_run.head_branch == 'main'` and `github.event.workflow_run.head_repository.full_name == github.repository`, all joined by `&&` in its `if` (AC 1, 2)
Proof: `node scripts/deploy-smoke.mjs workflow-build-guard` exits 0 - asserts each of the five comparisons is a conjunct of `jobs.build.if`, and that `on.workflow_run` is `workflows: [CI]`, `types: [completed]`, `branches: [main]`

**C2** - The `build` job checks out `github.event.workflow_run.head_sha` and pushes exactly three images, `ghcr.io/arturmois/bens-seguros-v2/server` (`apps/server/Dockerfile`, target `runtime`), `…/migrate` (same file, target `migrate`) and `…/web` (`apps/web/Dockerfile`), each tagged only `sha-${{ github.event.workflow_run.head_sha }}`, `platforms: linux/amd64`, `push: true` (AC 1, door 1)
Proof: `node scripts/deploy-smoke.mjs workflow-build-images` exits 0

**C3** - `deploy.yml` sets `permissions: {}` at the top level and the `build` job asks for exactly `contents: read` and `packages: write` (AC 3)
Proof: `node scripts/deploy-smoke.mjs workflow-permissions` exits 0

**C4** - No job of `deploy.yml` or `deploy-environment.yml` uses a third-party action: every `uses:` is `actions/checkout@v7`, `docker/setup-buildx-action@v4`, `docker/login-action@v4`, `docker/build-push-action@v7`, or the local `./.github/workflows/deploy-environment.yml` (door 6)
Proof: `node scripts/deploy-smoke.mjs workflow-actions` exits 0

**C5** - Both workflows pass actionlint
Proof: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/deploy.yml .github/workflows/deploy-environment.yml` exits 0

### S2 - o script remoto instala uma tag com segurança · 2 files · ~20 KB · ~5k

**C6** - `deploy-remote.sh tag-a`, with the registry password on stdin, exits 0; afterwards the running `server`, `caddy` and the last `migrate` containers use `127.0.0.1:5055/bens/server:tag-a`, `…/web:tag-a`, `…/migrate:tag-a` (`.Config.Image`), and `https://localhost:8543/api/health` answers `200` (AC 4)
Proof: `node scripts/deploy-smoke.mjs first` exits 0

**C7** - After `tag-a` then `tag-b`, `deploy.env` holds `IMAGE_TAG=tag-b` and `deploy.env.previous` holds `IMAGE_TAG=tag-a`; both hold `IMAGE_REGISTRY=127.0.0.1:5055/bens`; the running `server` uses `…/server:tag-b` (AC 5)
Proof: `node scripts/deploy-smoke.mjs second` exits 0

**C8** - Deploying `tag-b` again exits 0, and the `postgres` container ID is the same before and after both the second and the third deploy (a deploy never recreates the database container)
Proof: `node scripts/deploy-smoke.mjs same-tag` exits 0

**C9** - `deploy-remote.sh tag-missing` exits non-zero; the `server` and `caddy` container IDs are the ones from before the call, the `server` still uses `…/server:tag-b`, and `deploy.env` is byte-identical to before (AC 6)
Proof: `node scripts/deploy-smoke.mjs missing-tag` exits 0

**C10** - With images `tag-bad` whose `migrate` exits `3`, `deploy-remote.sh tag-bad` exits non-zero; the `server` container ID is the one from before, still on `tag-b`, and `deploy.env` is byte-identical to before (AC 7)
Proof: `node scripts/deploy-smoke.mjs bad-migrate` exits 0

**C11** - With `.env` absent, and separately with `.env` at mode `644`, the script exits non-zero, prints a line naming `.env`, and a `docker` stub placed first on `PATH` records zero calls (AC 8)
Proof: `node scripts/deploy-smoke.mjs env-guard` exits 0

**C12** - With empty stdin the script exits non-zero, prints a line naming the registry token, and the `docker` stub records zero calls (AC 10)
Proof: `node scripts/deploy-smoke.mjs env-guard` exits 0

**C13** - After a successful deploy (`first`) and after a failed one (`missing-tag`, `bad-migrate`), `$DOCKER_CONFIG/config.json` has no `auths` entry for `127.0.0.1:5055` (AC 9)
Proof: `node scripts/deploy-smoke.mjs first` exits 0
Proof: `node scripts/deploy-smoke.mjs missing-tag` exits 0
Proof: `node scripts/deploy-smoke.mjs bad-migrate` exits 0

**C14** - No output (stdout or stderr) of any script run in the smoke contains the registry password (AC 10)
Proof: `node scripts/deploy-smoke.mjs no-leak` exits 0 - reads the transcript every script step appended

**C15** - Deploying `tag-a` after `tag-b` (the rollback) exits 0; the `server` uses `…/server:tag-a`, `deploy.env` holds `IMAGE_TAG=tag-a` and `deploy.env.previous` holds `IMAGE_TAG=tag-b`
Proof: `node scripts/deploy-smoke.mjs rollback` exits 0

**C16** - `deploy-remote.sh` passes shellcheck
Proof: `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable scripts/deploy-remote.sh` exits 0

### S3 - staging automático · 2 files · ~10 KB · ~3k

**C17** - `deploy-staging` needs `build` and calls `./.github/workflows/deploy-environment.yml` with `environment: staging`, `image_tag: sha-${{ github.event.workflow_run.head_sha }}` and `ref: ${{ github.event.workflow_run.head_sha }}` (AC 11)
Proof: `node scripts/deploy-smoke.mjs workflow-callers` exits 0

**C18** - The `deploy` job of `deploy-environment.yml` declares `environment.name: ${{ inputs.environment }}`, checks out `inputs.ref`, copies exactly `docker-compose.prod.yml`, `docker/postgres/init/01-app-role.sh` and `scripts/deploy-remote.sh` to `DEPLOY_PATH` (same relative paths, the script at `DEPLOY_PATH/deploy-remote.sh`), and runs `./deploy-remote.sh "$IMAGE_TAG"` there with `IMAGE_REGISTRY=ghcr.io/arturmois/bens-seguros-v2` (AC 11, door 3)
Proof: `node scripts/deploy-smoke.mjs workflow-remote-steps` exits 0

**C19** - The registry token reaches the remote script only on stdin: the step pipes `"$REGISTRY_TOKEN"` into `ssh`, and no `ssh`/`scp` command line in either workflow contains `TOKEN` or `github.token` (AC 10, door 5)
Proof: `node scripts/deploy-smoke.mjs workflow-remote-steps` exits 0

**C20** - Every `ssh` and `scp` in `deploy-environment.yml` runs with `-o StrictHostKeyChecking=yes` and `-o UserKnownHostsFile=` pointing at the file written from `secrets.SSH_KNOWN_HOSTS`, and no command anywhere sets `StrictHostKeyChecking=no` or `accept-new` (AC 13, door 6)
Proof: `node scripts/deploy-smoke.mjs workflow-ssh-options` exits 0

**C21** - The health step exits 0 against the running smoke stack (`SITE_URL=https://localhost:8543`, Caddy's local root CA as `CURL_CA_BUNDLE`), and against a closed port it exits non-zero in at most 75 seconds (curl `--retry-max-time 60` plus one attempt) (AC 12)
Proof: `node scripts/deploy-smoke.mjs health-step` exits 0

**C22** - The preflight step, run with each of `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`, `DEPLOY_PATH`, `SITE_URL` empty in turn and the others set, exits non-zero and prints the empty name; with all six set it exits 0 (door 5)
Proof: `node scripts/deploy-smoke.mjs preflight-step` exits 0

**C23** - The `deploy` job has `concurrency: { group: deploy-${{ inputs.environment }}, cancel-in-progress: false }` (AC 14)
Proof: `node scripts/deploy-smoke.mjs workflow-concurrency` exits 0

### S4 - produção por tag, com aprovação · 1 file · ~6 KB · ~2k

**C24** - The `promote` job runs only when `github.event_name == 'push'` and `startsWith(github.ref, 'refs/tags/v')`; `on.push.tags` is `['v*']` and `on.push` has no `branches` (AC 15)
Proof: `node scripts/deploy-smoke.mjs workflow-promote-guard` exits 0

**C25** - The release-tag step accepts `v1.2.3` and `v10.0.12`, and rejects `v1.2`, `1.2.3`, `v1.2.3-rc.1` and `V1.2.3` with a non-zero exit (AC 15, assumption "formato da tag")
Proof: `node scripts/deploy-smoke.mjs release-tag-step` exits 0

**C26** - In a scratch git repo, the on-main step exits 0 for a tag on a commit reachable from `origin/main`, and non-zero for a tag on a commit that is not; in `promote` it runs before any step that calls `imagetools create` (AC 16)
Proof: `node scripts/deploy-smoke.mjs on-main-step` exits 0

**C27** - Against the smoke registry, the images-exist step exits `1` and prints exactly `Imagens sha-<SHA> não encontradas: o CI deste commit passou em main?` for a SHA with no images, and exits 0 for one whose three images exist (AC 17)
Proof: `node scripts/deploy-smoke.mjs images-exist-step` exits 0

**C28** - Against the smoke registry, the retag step gives `…/server`, `…/migrate` and `…/web` the tag `v9.9.9` with the same digest as their `sha-<SHA>` (`imagetools inspect` digests equal), without building (door 2, AC 15)
Proof: `node scripts/deploy-smoke.mjs retag-step` exits 0

**C29** - `deploy-production` needs `promote` and calls `deploy-environment.yml` with `environment: production`, `image_tag: ${{ github.ref_name }}` and `ref: ${{ github.ref_name }}` (AC 18)
Proof: `node scripts/deploy-smoke.mjs workflow-callers` exits 0

### S5 - redeploy e rollback manuais · 1 file · ~4 KB · ~1k

**C30** - `on.workflow_dispatch.inputs` is `environment` (`type: choice`, options exactly `staging`, `production`, required) and `image_tag` (`type: string`, required); the `redeploy` job needs `resolve` and calls `deploy-environment.yml` with those two inputs and `ref` from `resolve` (AC 19)
Proof: `node scripts/deploy-smoke.mjs workflow-callers` exits 0

**C31** - The image-tag step accepts `sha-` + 40 lowercase hex and `v1.2.3`, and rejects `sha-abc1234`, `sha-` + 40 uppercase hex, `v1.2`, `latest`, `v1.2.3; id` and the empty string with a non-zero exit (AC 20)
Proof: `node scripts/deploy-smoke.mjs image-tag-step` exits 0

**C32** - In `resolve`, the image-tag step and the images-exist step run before the job ends, `redeploy` needs `resolve`, and no job before `redeploy` in that path opens SSH (AC 20, 21)
Proof: `node scripts/deploy-smoke.mjs workflow-callers` exits 0
Proof: `node scripts/deploy-smoke.mjs images-exist-step` exits 0

### S6 - a validação local continua igual · 1 file · ~3 KB · ~1k

**C33** - `docker-compose.prod.yml` has `image: ${IMAGE_REGISTRY:-bens-seguros}/migrate:${IMAGE_TAG:-local}`, `…/server:…` and `…/web:…` on `migrate`, `server` and `caddy`, each keeping its `build:`; and the local smoke still passes (door 4, AC 22)
Proof: `grep -c --fixed-strings '${IMAGE_REGISTRY:-bens-seguros}/' docker-compose.prod.yml` prints `3`
Proof: `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all` exits 0

### S7 - tutorial · 6 files · ~70 KB · ~18k

**C34** - `docs/runbooks/deploy.md` has these `##` sections in this order, matched by prefix: `Visão geral`, `Pré-requisitos`, `Criar a VPS na Hostinger`, `Proteger a VPS`, `Instalar o Docker`, `Usuário de deploy`, `DNS`, `.env`, `Chave SSH do deploy`, `Configurar o GitHub`, `Primeiro deploy`, `Produção por tag`, `Rollback`, `Operação do dia a dia`, `Problemas comuns`, `Pendências`; every repository path it cites in backticks exists; the six names of door 5 appear in it and in `deploy-environment.yml`, and every `secrets.*`/`vars.*` the workflows read appears in it (AC 23, 24)
Proof: `node scripts/staging-smoke.mjs runbook` (C15 of `staging`, now reading `deploy.md`)

**C35** - The tutorial says migrations do not roll back (the word `migration` and `não volta` in the `Rollback` section) and names the backup as pending for F11 in `Pendências`; `docs/runbooks/staging.md` no longer exists and nothing outside `.specs/` and the archived `prompts/` links to it; ADR-008's revision names `deploy.yml` (AC 25)
Proof: `node scripts/staging-smoke.mjs runbook`
Proof: `git grep -n 'runbooks/staging\.md' -- ':!.specs' ':!prompts'` exits 1
Proof: `grep -n 'deploy\.yml' docs/decisions/ADR-008-deployment.md` exits 0

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| build guard conjuncts (5) | event_name C1 · conclusion C1 · event C1 · head_branch C1 · head_repository C1 | - |
| images (3) | `server` C2, C6, C28 · `migrate` C2, C6, C28 · `web` C2, C6, C28 | - |
| `deploy-remote.sh` outcomes (7) | success C6 · rotation of `deploy.env` C7, C15 · same tag again C8 · missing tag C9 · migrate fails C10 · `.env` absent or open C11 · no token C12 | - |
| `deploy-remote.sh` exit codes (2) | `0` C6, C7, C8, C15 · non-zero C9, C10, C11, C12 | - |
| containers a failed deploy must not recreate (3) | `server` C9, C10 · `caddy` C9 · `postgres` C8 | - |
| where the registry credential could leak (4) | ssh command line C19 · script output C14 · Docker config after success C13 · Docker config after failure C13 | - |
| workflow triggers (3) | `workflow_run` C1 · tag push C24 · `workflow_dispatch` C30 | - |
| deploy callers (3) | staging C17 · production C29 · redeploy C30 | - |
| door 5 names (6) | `SSH_HOST` C22, C34 · `SSH_USER` C22, C34 · `SSH_PRIVATE_KEY` C22, C34 · `SSH_KNOWN_HOSTS` C20, C22, C34 · `DEPLOY_PATH` C18, C22, C34 · `SITE_URL` C21, C22, C34 | - |
| files copied to the VPS (3) | `docker-compose.prod.yml` C18 · `01-app-role.sh` C18 · `deploy-remote.sh` C18 | - |
| release tag format (6) | `v1.2.3` C25 · `v10.0.12` C25 · `v1.2` C25 · `1.2.3` C25 · `v1.2.3-rc.1` C25 · `V1.2.3` C25 | - |
| dispatch image_tag format (8) | 40-hex sha C31 · `v1.2.3` C31 · short sha C31 · uppercase sha C31 · `v1.2` C31 · `latest` C31 · `v1.2.3; id` C31 · empty C31 | - |
| promote outcomes (3) | not on main C26 · images missing C27 · retag with same digest C28 | - |
| Landing doors (6) | 1 C2, C28, C31 · 2 C28 · 3 C18, C7 · 4 C33 · 5 C19, C22 · 6 C4, C20 | - |
| tutorial sections (16) | C34, table-driven over all 16 | - |
| places that assemble the image name (2) | `docker-compose.prod.yml` C33 · `deploy.env` written by the script C7 | - |

- Claims naming an exit code: C9-C12, C21, C22, C25-C27, C31 - each proof runs the code and reads the exit code
- C1-C4, C17-C20, C23, C24, C29, C30 are structural: they read the workflow, because GitHub Actions cannot run here. The behaviour they guard is proven live only by the first real run (plan, Open question 1)

## Test policy

The repo answers the level question for application code (CLAUDE.md, Testes) and not for deploy
tooling. This follows the precedent of `scripts/staging-smoke.mjs` (feature `staging`).

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| `scripts/deploy-remote.sh` - decides (7 outcomes, 9 branch points: args, `.env` exists, `.env` mode, token, login, pull, migrate, image check, env rotation) | executed against a real Docker and a real registry with auth, never a mock of `docker` except to prove "Docker was not called" | one run per outcome in the table above |
| workflow `run` steps that decide (tag formats, on-main, images exist, preflight, health) | the step's own `run` text executed with the env the workflow gives it | one case per accepted and rejected member |
| workflow structure (`if`, `needs`, `with`, `permissions`, `concurrency`, `uses`) | read as data, plus actionlint | every member of its set |

Evidence: `deploy-remote.sh` has 9 branch points (above); the workflow has 5 deciding steps; closest
analogue `scripts/staging-smoke.mjs`, same shape (a node script driving `docker compose` step by
step against the real stack).

Cost: one new script (`deploy-smoke.mjs`), about 25 steps. Without these rows, the failure paths of
the remote script (C9-C12) would be proven only by the first deploy that fails in the VPS.

## Swept

- validation: C11 (`.env`), C12 (token), C25 (release tag), C31 (dispatch tag), C22 (preflight)
- failure modes: C9 (missing tag), C10 (migrate fails), C21 (health fails), C27 (images missing)
- idempotency: C8 (same tag twice), C28 (retag keeps the digest)
- authorization: C1 (only push on `main` of this repo), C3 (permissions), C20 (host key), C29 (production environment; the approval itself is GitHub configuration, in the tutorial - C34)
- concurrency: C23
- data lifecycle: C8 (postgres container kept across deploys); backup is out of scope (F11)
- dependency failure: C9 (registry does not have the tag), C21 (site unreachable), C27
- state transitions: C7, C15 (`deploy.env` / `deploy.env.previous` rotation)
- observability: C14 (no secret in output); one line per stage is an Observable decision, read in review

## Handoff

- S1-S7 ≈ 40k (workflows ~14 KB, script ~6 KB, smoke ~30 KB, tutorial ~25 KB, touched docs ~85 KB read), under the 150k budget - one builder
- Mechanism: one builder (under budget, no ask)
- **Settled mid-build:** (1) C35 excludes `prompts/` as well as `.specs/`: `prompts/prompt-04.md` and `prompt-05.md` still name `docs/runbooks/staging.md`, but both are archived records headed "Arquivado em 2026-09-23 (ADR-011) … Não use como instrução", so they were not rewritten. (2) The `rg` proofs of C33 and C35 became `grep`/`git grep` with the same pattern: `ARGV0=rg ~/.local/bin/claude` hung past 120 s in this shell. (3) `scp` copies with `-p`, so the executable bit of `deploy-remote.sh` survives the copy and the remote `./deploy-remote.sh` of C18 runs. (4) The deploy jobs are one reusable workflow, `.github/workflows/deploy-environment.yml`, called three times (placement; C4, C17-C23 name it).
- **Abandoned:** nothing.
