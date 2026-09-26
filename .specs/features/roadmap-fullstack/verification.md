# Roadmap fullstack verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 7cad1f6..cd06bfc
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Scope: commit `cd06bfc` (HEAD at verification). Files: `docs/roadmap.md`, `apps/web/src/routes/_app/dashboard.tsx`
(one comment), `.specs/STATE.md` (one line), `checks.md`. No `plan.md` (checks declare "Plan: none").
Every proof was run by the Verifier at `cd06bfc`; nothing was edited except this report.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | roadmap header states the fullstack rule (AD-019), API + screen + Playwright, exemption only infra/domain without UI | `grep -n "AD-019" docs/roadmap.md` -> hits at lines 7 and 84; `## F0` is line 25 | `docs/roadmap.md:7` - `> **Fullstack (AD-019, a partir de 2026-09-25):** toda feature com superfície de usuário ... entrega API **e** tela na mesma feature e prova o caminho feliz com Playwright ... Isentas só as fatias de infraestrutura ou de domínio sem UI.` (7 < 25) | PASS |
| C2 | F4..F11 each have one `**Telas:**` line and a Playwright smoke inside `**Testes:**` | python script splitting on `^## `, per F4..F11 counting `**Telas:**` and `Playwright` restricted to the `- **Testes` line -> 8/8 sections print `Telas 1 Testes lines 1 Playwright in Testes 1` | `docs/roadmap.md:95`/`96` (F4), `105`/`106` (F5), `115`/`116` (F6), `125`/`126` (F7), `135`/`136` (F8), `145`/`146` (F9), `155`/`156` (F10), `165`/`166` (F11) - each Testes line contains `Smoke Playwright` | PASS |
| C3 | each audit gap owned by exactly one phase: Equipe view -> F5, closed history -> F6, realtime list -> F5, dashboard -> F11 | the C3 grep (alternation of `Equipe`, `histórico de conversas encerradas`, `lista em tempo real`, `placeholder` over `docs/roadmap.md`) -> lines 87, 105, 106, 115, 165; section headers `## F5` at 99, `## F6` at 109, `## F11` at 159 | `docs/roadmap.md:105` (F5) - `a visão **Equipe** ... só para ADMIN/MANAGER` and `**lista em tempo real**: a lista do inbox recebe as mudanças de conversa em < 2 s`; `docs/roadmap.md:115` (F6) - `**histórico de conversas encerradas** (fecha o gap da F3 ...)`; `docs/roadmap.md:165` (F11) - `o dashboard real no lugar do placeholder de dashboard.tsx`. Line 87 (F3 Andamento) only cross-references the same owners; no second owner anywhere | PASS |
| C4 | `dashboard.tsx` no longer says "Phase 10"; points at F11 | `grep -rn "Phase 10" apps/web/src` -> no output, exit 1; `grep -n "F11" apps/web/src/routes/_app/dashboard.tsx` -> 1 hit | `apps/web/src/routes/_app/dashboard.tsx:4` - `// Placeholder: the real dashboard comes in F11 (docs/roadmap.md).` | PASS |

## Substance review (against the sources)

**The 4 gaps are real** (each confirmed in code or in the inbox plan):

| Gap | Source evidence | Real |
| --- | --- | --- |
| MANAGER/ADMIN cannot reach another member's conversation from the inbox | `apps/web/src/routes/_app/inbox.tsx:6` - `view: z.enum(['queue', 'mine'])`; `apps/server/src/modules/conversations/conversation.schema.ts:8` - `view: z.enum(['queue', 'mine']).optional()`; `read.ts` `viewWhere` gives `queue` = `handler: 'QUEUE'`, `mine` = `assigneeId: userId`. Handoff §21 lets MANAGER/ADMIN close any conversation; §7 gives them "visão da operação". The API's no-`view` list already returns everything in `scopeFor`, so the gap is screen-only today | yes |
| closed conversations have no view | `read.ts` `viewWhere`: both views filter `status: { not: 'CLOSED' }`; inbox `plan.md:180` - "CLOSED fora das duas"; handoff §34 requires the full history preserved and readable by another broker | yes |
| list does not update in real time | `apps/web/src/features/inbox/use-panel-socket.ts` only joins a `conversation:` room when a conversation is open and invalidates the list on `message.created` of that room; inbox `plan.md:170` puts `conversation.changed` on `org:`/`user:` out of scope ("evita vazar ids fora da carteira") | yes |
| dashboard is a placeholder with a stale "Phase 10" comment | pre-change `dashboard.tsx:1` - `// Placeholder: the real dashboard comes in Phase 10.` | yes |

The header's "33 rotas" matches the 33 distinct `operationId`s under `apps/server/src` (counted). Sampled usage in
`apps/web/src`: the 4 with no hook name hit are reached by URL/options helpers (`getGetOrganizationLogoUrl`,
`getGetPublicChatSessionQueryOptions`) or served as HTML to crawlers (Open Graph); not a contradiction.

**Telas vs Mudanças and ADRs, per phase:** F4 (ADR-015 `aiEnabled` per org/channel, monthly limit), F6 (Mudanças
already named the contacts screen), F7, F8, F9 (ADR-012 QR/code, status, alert), F11 (handoff §48 metrics, §7
portfolio) are consistent. F10 against ADR-017: read-only panel (402 on writes, reads free), Web Chat "indisponível"
for new conversations, `maxUsers` on invite - consistent; "tela ou comando operacional, a decidir na spec da F10 (o
ADR não define)" is accurate (ADR-017 says only "pelo super-admin", "manuais"; `User.isSuperAdmin` exists,
`apps/server/src/app.ts:104`). No screen promised that an ADR contradicts.

Non-blocking findings (no check covers them; none contradicts a binding decision, so they do not change the verdict):

1. **F5 lead queue has no F5 screen.** F5 Mudanças (`docs/roadmap.md:104`) ships "fila de leads (contatos sem dono);
   ADMIN/MANAGER atribuem; COMMERCIAL assume", and F5 Testes cover "N comerciais assumem o mesmo lead", but F5 Telas
   (`:105`) only lists inbox actions and the Equipe view. The lead-queue list and "atribuir o lead" appear in F6 Telas
   (`:115`, "ADMIN/MANAGER atribuem o lead a partir da ficha"; F6 Mudanças filter "fila"). That is the backend-first
   split the new header rule (line 7) forbids. Fix: either give F5 Telas the lead-queue screen (and smoke), or move
   lead-queue assignment out of F5 Mudanças into F6.
2. **F5 Mudanças do not name the backend work the new Telas need**: the realtime list event (explicitly deferred:
   "decidir o evento na spec") and a team view on the API ("COMMERCIAL não vê a visão Equipe (UI e API)"). Acknowledged
   in the text, so a precision note rather than a contradiction.
3. **F10 Telas omit one ADR-017 behaviour with a visible surface**: "conversas em andamento recebem uma resposta
   automática fixa" (visitor screen). Omission, not contradiction.
4. **F8 Telas "badge no card do Kanban"** needs F7, while F8 depends on F6 with F7 only "recomendado". Pre-existing in
   F8 Mudanças; the new line inherits it.

No contradiction found between the new text and the rest of the roadmap (F3 Andamento line 87, header line 7 and
`.specs/STATE.md` name the same owners F5/F5/F6/F11).

## Swept existing

- authorization -> C3: the Equipe view is stated MANAGER/ADMIN-only (`docs/roadmap.md:105`) and handoff §7/§21 support
  it (§21: MANAGER/ADMIN close any conversation; §7: they have the operation view). Present.

## Gate

`pnpm lint` - biome checked 219 files, exit 0; `pnpm --filter web typecheck` - `tsc --noEmit` exit 0. Full `pnpm test`
/ e2e not run by instruction (a concurrent Verifier owns the dev server and DB for e2e); the diff changes no
executable code (one comment line in `dashboard.tsx`).
