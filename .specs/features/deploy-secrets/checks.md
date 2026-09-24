# Deploy secrets checks

Profile: light

## Intent

O primeiro deploy real do staging (run 36042824773, `3ab4429`) parou no Preflight: as variables do environment chegaram ao job, os quatro secrets `SSH_*` chegaram vazios. O job que usa o environment está no workflow reutilizável `deploy-environment.yml`, e os callers em `deploy.yml` não repassam secrets, então o contexto `secrets` do job chamado fica vazio. Com esta mudança, os três callers (`deploy-staging`, `deploy-production`, `redeploy`) passam `secrets: inherit`, e o job lê os secrets do environment que ele mesmo declara. O `cd-vps` já registrava isso como provado só pelo primeiro run real (plan, Open question 1).

1 check · 0 one-way doors · 0 open

## Checks

**C1** - Each of the three jobs of `deploy.yml` that call `./.github/workflows/deploy-environment.yml` (`deploy-staging`, `deploy-production`, `redeploy`) has `secrets: inherit`, and both workflows still pass actionlint
Proof: `test "$(grep -c '^    secrets: inherit$' .github/workflows/deploy.yml)" = 3` exits 0
Proof: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/deploy.yml .github/workflows/deploy-environment.yml` exits 0
Proof: live - the next Deploy run on `main` passes the Preflight step of `deploy-staging / deploy`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| deploy callers (3) | `deploy-staging` C1 · `deploy-production` C1 · `redeploy` C1 | - |

## Swept

- validation: existing - the Preflight step already names each empty secret
- failure modes: C1 (live run)
- idempotency: n/a - configuration of the call, no state
- authorization: n/a - `inherit` passes the repository and environment secrets of this repository only; the called job still reads only `SSH_*` and runs under the environment's branch policy
- concurrency: n/a - unchanged `concurrency` group
- data lifecycle: n/a - no data
- dependency failure: n/a - no new dependency
- state transitions: n/a - no state
- observability: existing - Preflight errors name the missing secret

## Handoff

- one file, ~1k - one builder
