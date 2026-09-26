# Roadmap fullstack checks

Profile: light
Plan: none - change under ~3 files, no one-way door (see Intent)

## Intent

F0–F3 were built backend-first and the screens caught up afterwards (`web-chat-ui`, `inbox`, AD-019).
An audit on 2026-09-26 found every one of the 33 API operations used by a screen, and four
use-case gaps that no phase of `docs/roadmap.md` owns yet: MANAGER/ADMIN cannot reach another
member's conversation from the inbox (only `queue`/`mine`); closed conversations have no view; the
conversation list does not update in real time; and the dashboard is a placeholder whose comment
still points at the old "Phase 10". The roadmap also describes F4–F11 by backend changes, with no
screen and no browser smoke per phase.

When this ships, the roadmap states the fullstack rule once at the top, every phase from F4 on
names its screens and its Playwright smoke, each of the four gaps is owned by one phase with a
testable line, and the dashboard comment points at F11. Application behaviour does not change.

4 checks in 1 slice · 0 one-way doors · 0 open

## Checks

### S1 - roadmap owns the gaps · 2 files · ~26 KB · ~7k

**C1** - The roadmap header carries the fullstack rule (AD-019): a phase with a user surface ships API + screen in the same feature and proves the happy path with Playwright; the only exemption is infra or domain without UI
Proof: `grep -n "AD-019" docs/roadmap.md` matches a line above `## F0`

**C2** - Each of F4, F5, F6, F7, F8, F9, F10, F11 has a `**Telas:**` line and names a Playwright smoke in its `**Testes:**` line
Proof: `python3 -c` script in the build log counts, per `## F4`..`## F11` section, one `**Telas:**` and one `Playwright` - 8 of 8

**C3** - Each audit gap is owned by exactly one phase: "Todas/Equipe" view for MANAGER/ADMIN → F5; closed-conversation history → F6; realtime conversation list → F5; real dashboard → F11
Proof: `grep -n "Equipe\|histórico de conversas encerradas\|lista em tempo real\|placeholder" docs/roadmap.md` shows each under its phase

**C4** - `apps/web/src/routes/_app/dashboard.tsx` no longer says "Phase 10"; it points at F11
Proof: `grep -rn "Phase 10" apps/web/src` prints nothing; `grep -n "F11" apps/web/src/routes/_app/dashboard.tsx` matches

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| audit gaps (4) | team view C3 · closed history C3 · realtime list C3 · dashboard C3, C4 | - |
| phases with a user surface after F3 (8) | F4 C2 · F5 C2 · F6 C2 · F7 C2 · F8 C2 · F9 C2 · F10 C2 · F11 C2 | - |

## Swept

- validation: n/a - documentation
- failure modes: n/a - documentation
- idempotency: n/a - documentation
- authorization: C3 (the team view is MANAGER/ADMIN only, per handoff §7/§21)
- concurrency: n/a - documentation
- data lifecycle: n/a - documentation
- dependency failure: n/a - documentation
- state transitions: n/a - documentation
- observability: n/a - documentation

## Handoff

- S1 ≈ 7k, one builder.
