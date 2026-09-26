# Web Chat UI verification

**Verdict**: PASS
**Profile**: ui
**Diff range**: 40c8e65..HEAD
**Round**: 2 - full
**Verifier**: independent sub-agent (author != verifier)

**Proof run (at f46bbbb).** Postgres `bens-seguros-postgres-1` and Mailpit `bens-seguros-mailpit-1` up; `pnpm dev` serving web `:3000` and API `:3001`. Round-1 gaps closed in `f46bbbb` (logo, token equality, fromSeq, GET /session, architecture permission name).

Server (one batch, verbose):

`pnpm --filter @bens/server exec vitest run src/modules/channels/open-graph.spec.ts src/modules/conversations/conversation-send.spec.ts src/shared/permissions.spec.ts test/architecture.spec.ts -t "<C1–C3,C11,C16,C18,C20–C21 alternation>" --reporter=verbose`

Exit 0. `Tests 13 passed | 13 skipped`. Every named proof appeared as `✓`, including `every /api/v1 route declares a permission`.

Web e2e (one file):

`pnpm --filter @bens/web exec playwright test e2e/web-chat.spec.ts --reporter=line`

Exit 0. `8 passed (16.9s)`. Every C5–C10 / C12–C15 / C17 / C22 title matched (combined titles for C7+C9 and C12+C13).

Static: `rg -n "whatsapp|facebookexternalhit|/c/" Caddyfile` → lines 21–22; `node -e` socket.io-client → exit 0 (`^4.8.3`).

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| ADR-014 `docs/decisions/ADR-014-public-channel-identity-consent.md` | yes - full file + 2026-09-25 revision (`seq ≥ fromSeq`, cookie Path per key, `/c/:slug`, OG via API) | none - plan/checks `/c/:key` = publicChatKey | - |
| AD-018 `.specs/STATE.md:24` | yes - `withPublicChatKey`, visitor token, `GET /session` + `auth.token`, `seq ≥ fromSeq` | none | - |
| ADR-009 `docs/decisions/ADR-009-frontend-vite-tanstack-router.md` | yes - SPA Vite; OG HTML from API not Next (lines 13–15) | none | - |
| roadmap F3 `docs/roadmap.md:82–83` | yes - `/c/:slug` + OG; order `web-chat-ui` before `inbox`; AD-019 | none | - |
| AD-019 `.specs/STATE.md:25–26` | yes - UI features deliver API+UI + Playwright smoke | none | - |
| plan Surface / Observable / Landing | yes - plan.md | none | - |

## Checks

`og` = `apps/server/src/modules/channels/open-graph.spec.ts` · `cs` = `apps/server/src/modules/conversations/conversation-send.spec.ts` · `e2e` = `apps/web/e2e/web-chat.spec.ts` · `perm` = `apps/server/src/shared/permissions.spec.ts` · `ar` = `apps/server/test/architecture.spec.ts`

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | WhatsApp UA + existing org → 200 HTML with `og:title` = org name and `og:image` → `/logo` | batch ✓ `serves Open Graph html for a preview agent` | `og:51` - `toBe(200)`; `og:52` - `toMatch(/text\/html/)`; `og:53` - `toContain('…og:title…Corretora Preview')`; `og:54-57` - `og:image` regex with `/logo` | PASS |
| C2 | unknown 32-hex → 404; non-hex → 400 | batch ✓ `rejects a bad or unknown key for Open Graph` | `og:67` - `toBe(404)`; `og:74` - `toBe(400)` | PASS |
| C3 | Chrome UA → API 404, not OG HTML | batch ✓ `leaves the browser to the spa` | `og:89` - `toBe(404)`; `og:90` - `not.toMatch(/text\/html/)`; `og:91` - `not.toContain('og:title')` | PASS |
| C4 | Caddyfile proxies `/c/*` when UA matches preview regex | rg Caddyfile for preview UA and /c path, exit 0 | `Caddyfile:21` - path /c; `Caddyfile:22` - preview UA regex | PASS |
| C5 | public link shows org name; with branding, greeting and logo image | e2e ✓ `shows the brokerage on the public link` | `e2e:54` - `{ logo: true }`; `e2e:58` - brand name; `e2e:59` - greeting; `e2e:60` - `getByRole('img', { name: \`Logo de ${org.name}\` })` | PASS |
| C6 | bad/unknown key → pt-BR error, no phone field | e2e ✓ `shows an error for a bad or unknown link` | `e2e:66-68` - error + `/não é válido/i` + phone count 0; `e2e:71-73` - error + unknown text + phone count 0 | PASS |
| C7 | phone + notice + no Turnstile → session + first message in thread | e2e ✓ `starts a session and shows the first message; stores the visitor token for the socket` | `e2e:47-48` (via `startVisitorChat`) - thread + message `toBeVisible()` | PASS |
| C8 | unchecked notice → no `POST /sessions`, acceptance required | e2e ✓ `requires accepting the notice` | `e2e:120` - `web-chat-notice-error` visible; `e2e:121` - `sessions` `toBe(0)` | PASS |
| C9 | `sessionStorage` `bens_visitor_token:<key>` equals start-response token | same e2e as C7 ✓ | `e2e:96` - `startToken` `toMatch(/^v1\./)`; `e2e:97` - `stored` `toBe(startToken)` | PASS |
| C10 | follow-up message appears in thread | e2e ✓ `sends a follow-up message in the thread` | `e2e:132` - follow-up `toBeVisible()` | PASS |
| C11 | panel `POST …/messages` 201 + take from QUEUE; CLOSED → 409 `CONVERSATION_CLOSED` | batch ✓ `sends an outbound message and takes from the queue`; ✓ `refuses a message on a closed conversation` | `cs:63` - `toBe(201)`; `cs:72` - `handler: 'HUMAN'`; `cs:88-89` - `toBe(409)` / `CONVERSATION_CLOSED` | PASS |
| C12 | human reply visible in < 2 s without navigation | e2e ✓ `shows a human reply in under two seconds; reloads messages after events resync` | `e2e:166` - `toBe(201)`; `e2e:167-168` - reply visible `{ timeout: 2_000 }` | PASS |
| C13 | `events:resync` → refetch `GET /messages` and only `seq ≥ fromSeq` | same e2e as C12 ✓ | `e2e:156-158` - PRIOR below fromSeq `toHaveCount(0)`; `e2e:181` - `messageFetches` `toBeGreaterThan(before)`; `e2e:185-187` - PRIOR still omitted after resync | PASS |
| C14 | smoke start + follow-up visible | e2e ✓ C7 title; ✓ C10 title | `e2e:47-48` / `e2e:132` (same as C7/C10) | PASS |
| C15 | smoke human leg | e2e ✓ C12 title | `e2e:167-168` (same as C12) | PASS |
| C16 | declares `conversation:write`; 401/403/404; architecture every `/api/v1` route declares permission | batch ✓ `refuses a message outside the tenant or without permission`; ✓ `grants conversation write…`; ✓ `every /api/v1 route declares a permission` | `cs:105` - `toBe(401)`; `cs:118` - `toBe(403)`; `cs:128` - `toBe(404)`; `perm:25` - `toContain('conversation:write')`; `ar:289` - `ready()` resolves; `ar:291-292` - routes match `/conversations` and `/messages` | PASS |
| C17 | loading while describe pending; error + retry on fail | e2e ✓ `shows loading and error for the public chat` | `e2e:204` - loading; `e2e:205` - error; `e2e:206` - `Tentar de novo` | PASS |
| C18 | preview UA list matches Caddy members (7) | batch ✓ `recognizes each preview user agent` | `og:103` - each token `toBe(200)`; `og:104` - `toContain('og:title')`; list `open-graph.ts:7-14` = Caddy members | PASS |
| C19 | `socket.io-client` dependency of `@bens/web` | `node -e` exit 0 | `apps/web/package.json:28` - `"socket.io-client": "^4.8.3"` | PASS |
| C20 | module boundaries green | batch ✓ ×3 architecture names | `ar:280` - `findBoundaryViolations` `toEqual([])`; `ar:389` - cycles `toEqual([])`; `ar:407` - foreign writes `toEqual([])` | PASS |
| C21 | unknown field / empty text → 400 | batch ✓ `validates the outbound message body` | `cs:150` - `toBe(400)`; `cs:153` - `toBe(400)` | PASS |
| C22 | reload reconnects via `GET /session` without new session | e2e ✓ `reconnects the visitor socket after reload` | `e2e:226-228` - `sessionStorage.removeItem`; `e2e:235` - `starts` `toBe(0)`; `e2e:236` - `sessionGets` `toBeGreaterThan(0)` | PASS |

## Coverage

Recomputed from plan `Surface` / `Landing` / preview UAs / screen arrangement (not copied from checks).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /c/:key` OG statuses (3) | plan Surface | 200 C1 · 400 C2 · 404 C2 | - |
| screen Web Chat statuses (2) | plan Surface | 200 C5/C7 · 404 C6 | - |
| `POST /api/v1/conversations/:id/messages` statuses (6) | plan Surface | 201 C11 · 400 C21 · 401 C16 · 403 C16 · 404 C16 · 409 C11 | - |
| Landing doors (3) | plan Landing | door 1 C1,C3,C4,C18 · door 2 C9,C22 · door 3 C11,C12 | - |
| preview User-Agents (7) | plan Landing door 1 + `PREVIEW_USER_AGENTS` / Caddy | WhatsApp C18 · facebookexternalhit C18 · Facebot C18 · Twitterbot C18 · Slackbot C18 · LinkedInBot C18 · TelegramBot C18 | - |
| screen Web Chat arrangement (3 regions) | plan Observable + UI regions | header/brand C5 (name/greeting/logo) · start form C7/C8 · thread C10/C12 | - |
| startup config: OG proxy (2 assemblies) | plan Landing door 1 | Caddyfile C4 · API route C1,C3 | - |
| fromSeq cut on visitor reload (1) | AD-018 / AC 10 | C13 (PRIOR seed + omit before/after resync) | - |

Swept “existing” re-read: `requirePermission('conversation:write')` at `conversation.routes.ts:33`; `PREVIEW_USER_AGENTS` at `open-graph.ts:7-14`; Caddy `@preview` at `Caddyfile:20-26`; client notice gate at `web-chat-page.tsx:229-232`; `events:resync` listener at `use-visitor-socket.ts:51`; restore prefers `GET /session` then `sessionStorage` at `web-chat-page.tsx:113-128`. Swept `n/a` rows are approved policy.

## Test policy rows

checks.md has no `Test policy` section (repo `CLAUDE.md` Testes / Web fullstack). No Test policy verdicts owed.

## Faults injected

Baseline porcelain: only `?? .specs/features/web-chat-ui/verification.md`. Scratch worktree `/tmp/web-chat-ui-verify-r2` at `f46bbbb` for the C16 route mutant; web/server mutants applied on the real tree (Vite/`tsx watch` serve it) and reverted. Server fromSeq mutant required an explicit `tsx` restart (`touch src/server.ts`) before the proof failed. Real tree porcelain matches baseline after. Cap 5. Worktree removed.

| Mutation | Location | Killed |
| --- | --- | --- |
| remove logo `<img>` when `hasLogo` | `apps/web/src/features/web-chat/web-chat-page.tsx` `BrandHeader` | yes - C5 failed (logo `getByRole('img')` not visible) |
| `storeVisitorToken` stores `'fault-wrong-token'` | `apps/web/src/features/web-chat/constants.ts` | yes - C9 failed (`stored` ≠ `startToken`) |
| skip `GET /session` in restore (`throw` before fetch) | `apps/web/src/features/web-chat/web-chat-page.tsx` restore | yes - C22 failed (with storage cleared, session path broken) |
| drop `session.fromSeq` from `GET /messages` seq filter | `apps/server/src/modules/channels/public-chat.ts` | yes - C13 failed (PRIOR `toHaveCount(0)` received 1) after forced reload |
| omit `requirePermission('conversation:write')` from `canWrite` | worktree `conversation.routes.ts` | yes - C16 architecture failed (`every /api/v1 route declares a permission`) |

## Gate

- Server proof batch: 13 passed, 0 failed (13 skipped by filter); C16 architecture name matched and passed.
- Playwright `e2e/web-chat.spec.ts`: 8 passed, 0 failed.
- C4 `rg` exit 0; C19 `node -e` exit 0.
- Full `pnpm lint && pnpm typecheck && pnpm test && pnpm build` not re-run in this verifier turn (bound to the named proofs above).
