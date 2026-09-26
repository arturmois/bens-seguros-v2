# F3 close checks

Profile: light
Plan: none - docs only, 2 files, no one-way door (see Intent)

## Intent

F3's criterion was "fluxo e2e verde no staging". A staging run was attempted on 2026-09-26: accounts
`E2E Admin/Manager/Commercial` and orgs "E2E Corretora A/B" were created on staging without touching
Turnstile, but the real Turnstile challenges the automated visitor browser, so each visitor session
needs a human click. The user decided (2026-09-26) that this costs too much for the MVP: close F3 on
the CI e2e (run `36250587672`, ci + e2e, 104 passed; deploy run `36251067456` green) and move the
staging e2e to the go-live criterion of F11. The staging spec was discarded, nothing of it is committed.

Independently, the prompt asked to fix the stale staging domain: `docs/roadmap.md` (Staging milestone)
and `.specs/STATE.md` cited `staging.bensseg.com` as the current address, which no longer answers
(feature `domain-bens360`).

4 checks in 1 slice · 0 one-way doors · 0 open

Every command runs from the repo root.

## Checks

### S1 - roadmap and state · 2 files · ~60 KB · ~15k

**C1** - `docs/roadmap.md` F3 opens with "Concluída em 2026-09-26", cites run `36250587672` and says the staging e2e moved to the go-live (F11); its `Critério` line says "e2e verde no CI" and records the former "no staging" wording as revised on 2026-09-26; its `Andamento` no longer says "falta o e2e no staging"
Proof: `grep -n "Concluída em 2026-09-26" docs/roadmap.md` matches the F3 blockquote with `36250587672`; `grep -n "falta o e2e no staging" docs/roadmap.md` prints nothing

**C2** - `docs/roadmap.md` F11 `Critério` includes the F3 web chat + inbox flow green on staging, marked as deferred from F3 on 2026-09-26
Proof: `grep -n "adiado da F3 em 2026-09-26" docs/roadmap.md` matches the F11 `Critério` line

**C3** - `.specs/STATE.md` says "**Próximo:** F4 IA." and records the F3 close with the revised criterion and the deferral
Proof: `grep -n "Próximo" .specs/STATE.md` prints only `F4 IA.`; `grep -n "F3 fechada (2026-09-26)" .specs/STATE.md` matches

**C4** - Every `bensseg` hit in `docs/roadmap.md` and `.specs/STATE.md` is marked as the former domain next to `staging.bens360.com.br`
Proof: `grep -n "bensseg" docs/roadmap.md .specs/STATE.md` prints 2 lines, each containing "domínio antigo; hoje `https://staging.bens360.com.br`"

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| places that state F3's status (3) | roadmap F3 header C1 · roadmap F3 criterion/andamento C1 · STATE next step C3 | - |
| stale domain mentions (2) | roadmap Staging milestone C4 · STATE staging entry C4 | - |

## Swept

- validation: n/a - docs only
- failure modes: n/a - docs only
- idempotency: n/a - docs only
- authorization: n/a - docs only
- concurrency: n/a - docs only
- data lifecycle: n/a - the E2E accounts and orgs stay on staging, recorded in STATE (C3), for the go-live run
- dependency failure: n/a - docs only
- state transitions: n/a - docs only
- observability: n/a - docs only

## Handoff

- S1 ≈ 15k, one builder.
