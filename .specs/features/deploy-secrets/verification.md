# Deploy secrets verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 3ab4429..29338cb
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

No `plan.md`: the `## Intent` section of `checks.md` stands in for it. No binding source, no
`Test policy` section; under `light` fault injection and the Coverage recompute do not run
(the coverage row was still cross-checked below, since it cost one grep).

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | the three callers of `deploy-environment.yml` pass `secrets: inherit`; both workflows pass actionlint | `test "$(grep -c '^    secrets: inherit$' .github/workflows/deploy.yml)" = 3` exit 0 | `.github/workflows/deploy.yml:100` (`deploy-staging`, job at :96, `uses` at :98) · `.github/workflows/deploy.yml:176` (`deploy-production`, job at :173, `uses` at :175) · `.github/workflows/deploy.yml:232` (`redeploy`, job at :229, `uses` at :231) - `secrets: inherit` | PASS |
| C1 | (actionlint) | `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/deploy.yml .github/workflows/deploy-environment.yml` exit 0, no findings | both files at HEAD | PASS |
| C1 | (live) next Deploy run on `main` passes Preflight of `deploy-staging / deploy` | `gh run view 36044406791 --json jobs` - run on `29338cb`, event `workflow_run`, branch `main`, conclusion `success`; job `deploy-staging / deploy` success; steps Preflight, SSH key and host key, Copy the files and install the tag, Health check all `success` | `gh run view 36044406791 --log`: Preflight env block shows `SSH_HOST: ***`, `SSH_USER: ***`, `SSH_PRIVATE_KEY: ***`, `SSH_KNOWN_HOSTS: ***` (masked = non-empty); 0 `##[error]` lines in the whole log. The secrets are read at `.github/workflows/deploy-environment.yml:43`-46 and checked at `.github/workflows/deploy-environment.yml:52` (`if [ -z "${!name}" ]`) | PASS |

Extra confirmations (asked for by the dispatcher, not proofs in `checks.md`):

- Placement: `grep -rn 'secrets:' .github/workflows/` returns exactly the three lines above;
  each sits between its job's `uses:` line and the next top-level job key (`promote` at :110,
  `resolve` at :186, end of file after `redeploy`), so the grep count of 3 is tied to the three
  right jobs and to nothing else.
- `node scripts/deploy-smoke.mjs workflow-callers` exit 0 (15/15 `ok`).
- `curl -s https://staging.bensseg.com/api/health` -> `{"status":"ok"}`, HTTP 200.

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| callers of `deploy-environment.yml` (3) | `grep -n 'uses: ./.github/workflows/deploy-environment.yml' .github/workflows/deploy.yml` -> :98, :175, :231 | `deploy-staging` C1 (grep + live) · `deploy-production` C1 (grep) · `redeploy` C1 (grep) | - |

Level note (not a gap): only `deploy-staging` is proven live; `deploy-production` and `redeploy`
are proven structurally (grep + actionlint). They call the same reusable workflow with the same
`secrets: inherit` line, so the live run on staging is evidence for the mechanism they share.

## Swept existing

- validation: the Preflight step names each empty secret - confirmed at
  `.github/workflows/deploy-environment.yml:53` (`echo "::error::$name não está configurado ..."`).
- observability: same line; holds.

## Observations

- The pre-fix run 36042824773 (`3ab4429`) returns HTTP 404 from the GitHub API
  (`gh run view` and `gh api .../actions/runs/36042824773`), and `gh run list --workflow deploy.yml`
  lists only 36044406791. The "before" failure described in the Intent could not be re-observed;
  it is context, not one of C1's proofs, so it does not affect the verdict.

## Gate

Proofs at HEAD `29338cb`: grep exit 0, actionlint exit 0, live run 36044406791 success
(Preflight success). `node scripts/deploy-smoke.mjs workflow-callers` 15 passed, 0 failed.
