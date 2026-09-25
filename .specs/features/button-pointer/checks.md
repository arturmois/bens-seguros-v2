# Button pointer checks

Profile: light
Plan: none - change under ~3 files, no one-way door (see Intent)

## Intent

Tailwind v4 dropped the `cursor: pointer` its preflight used to give buttons, so every button of
the web app (the Base UI `Button` of `components/ui/button.tsx` and any bare `<button>`) shows the
text arrow on hover, and a clickable control reads as inert. When this ships, hovering an enabled
button shows the hand cursor; a disabled one keeps the default cursor. One rule in the `base` layer
of `apps/web/src/styles.css` covers every button at once, so no component has to remember a class.

2 checks in 1 slice · 0 one-way doors · 0 open

## Checks

### S1 - cursor nos botões · 2 files · ~15 KB · ~4k

**C1** - On `/login` and `/register`, every visible enabled `button` has the computed style `cursor: pointer` (at least one button per page, so an empty set cannot pass)
Proof: `pnpm --filter @bens/web e2e -g "shows a pointer on every enabled button"`

**C2** - A disabled `button` keeps `cursor: default` (the rule excludes `:disabled`)
Proof: `pnpm --filter @bens/web e2e -g "keeps the default cursor on a disabled button"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| button states (2) | enabled C1 · disabled C2 | - |
| pages sampled (2) | `/login` C1 · `/register` C1 | - |

## Swept

- validation: n/a - no input
- failure modes: n/a - styling only
- idempotency: n/a - no writes
- authorization: n/a - no route or permission
- concurrency: n/a - none
- data lifecycle: n/a - no data
- dependency failure: n/a - no dependency
- state transitions: C2 (disabled vs enabled)
- observability: n/a - none

## Handoff

- S1 ~4k (`styles.css` 8 KB, `e2e/login.spec.ts` 7.5 KB), under the 150k budget - one builder
