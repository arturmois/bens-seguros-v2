# F3 close verification

**Verdict**: PASS
**Profile**: light
**Diff range**: ce00a25..4d0fd16
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier; author is the main agent)

## Binding sources

None: `checks.md` declares `Plan: none - docs only`, profile `light`; step 1 does not run under `light`.

## Checks

All proofs run at `HEAD` = `4d0fd160e14387abbbb67d8d4a02b101f2fe1281`, working tree clean.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | roadmap F3 closed on 2026-09-26 on the CI e2e, run cited, staging e2e moved to F11; criterion revised with old wording kept; "falta o e2e no staging" gone | `grep -n "Concluída em 2026-09-26" docs/roadmap.md` -> 1 hit; `grep -n "falta o e2e no staging" docs/roadmap.md` -> no output, exit 1 | `docs/roadmap.md:80` - `> **Concluída em 2026-09-26:** ... e2e Playwright no CI (run \`36250587672\`, ci + e2e, 104 passed) ... virou item do go-live (F11).` (under `## F3 — Web Chat + Inbox humano`, line 78); `docs/roadmap.md:89` - `**Critério:** fluxo e2e verde no CI (revisto em 2026-09-26; antes, "no staging", adiado para o go-live).`; `docs/roadmap.md:90` - `Andamento ... e2e verde no CI` | PASS |
| C2 | F11 criterion includes F3 web chat + inbox green on staging, deferred from F3 on 2026-09-26 | `grep -n "adiado da F3 em 2026-09-26" docs/roadmap.md` -> 1 hit | `docs/roadmap.md:169` - `**Critério:** restore executado; alerta de canal fora chega; fluxo web chat + inbox da F3 verde no staging (adiado da F3 em 2026-09-26; ...); go-live ...` | PASS |
| C3 | STATE says "Próximo: F4 IA." and records the F3 close with revised criterion and deferral | `grep -n "Próximo" .specs/STATE.md` -> only line 50; `grep -n "F3 fechada (2026-09-26)" .specs/STATE.md` -> 1 hit | `.specs/STATE.md:50` - `- **Próximo:** F4 IA.`; `.specs/STATE.md:49` - `**F3 fechada (2026-09-26):** critério revisto pelo responsável para e2e verde no CI (run \`36250587672\`, 104 passed); ... adiado para o go-live (F11).` | PASS |
| C4 | every `bensseg` hit in roadmap and STATE marked as former domain next to `staging.bens360.com.br` | `grep -n "bensseg" docs/roadmap.md .specs/STATE.md` -> exactly 2 lines | `docs/roadmap.md:72` and `.specs/STATE.md:38` - both contain `(domínio antigo; hoje \`https://staging.bens360.com.br\`, feature \`domain-bens360\`)` | PASS |

## Coverage

Not recomputed under profile `light` (step runs under `standard`/`ui`). Read-only sanity check of the author's two rows: F3 status places (roadmap header line 80, criterion/andamento lines 89-90, STATE line 50) and stale domain mentions (roadmap:72, STATE:38) all resolve to a passing check above.

## Test policy rows

None: `checks.md` carries no `Test policy` section.

## Faults injected

Not run: profile `light`. Docs-only change; the proofs are grep assertions over text.

## Swept existing

All `Swept` rows are `n/a` (user-approved policy). The `data lifecycle` row cites STATE recording the E2E accounts/orgs on staging: confirmed at `.specs/STATE.md:49` ("contas E2E e orgs \"E2E Corretora A/B\" criadas no staging").

## Scope of the range

- `git diff --name-only ce00a25..4d0fd16` lists only `.md` files: `.specs/STATE.md`, `.specs/features/f3-close/checks.md`, `docs/roadmap.md`, `prompts/prompt-f3-staging.md`. Filtering out `\.md$` yields nothing: no application code changed.
- The range holds two commits: `39f3f67` (adds `prompts/prompt-f3-staging.md`, the task prompt) and `4d0fd16` (the feature). The prompt file is docs only.
- History preserved: in both files the old domain `https://staging.bensseg.com` stays in the dated 2026-09-24 entries with an annotation appended, not deleted (`docs/roadmap.md:72`, `.specs/STATE.md:38`). The F3 criterion keeps the former wording ("antes, \"no staging\"") and the fatias line records the deferral instead of dropping it silently (`docs/roadmap.md:86`). The only removed STATE line is the stale `Próximo` pointer, superseded by the new F3-closed entry.

## Notes (non-blocking)

- `gh run view 36250587672`: CI, `conclusion: success`, `headSha: ac92db3` (the last non-docs-only commit before `ce00a25`); `gh run view 36251067456`: Deploy, `success`. The docs cite the run number, not a SHA, so this is consistent. The "104 passed" count was not re-read from the run log.

## Gate

Docs-only range; no test target applies to the checks. Author reports `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green on `4d0fd16` (509 tests); not re-run by the Verifier since no code file is in the range. Check proofs: 4 run, 4 passed, 0 failed.
