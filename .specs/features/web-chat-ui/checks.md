# Web Chat UI checks

Profile: ui
Plan: `.specs/features/web-chat-ui/plan.md`

22 checks in 4 slices · 3 one-way doors · 0 open

Proof prefixes (omitted below):
- server: `pnpm --filter @bens/server exec vitest run`
- web: `pnpm --filter @bens/web exec playwright test`

## Checks

### S1 - Open Graph e rota `/c/:key` · server + Caddy · ~15 KB · ~4k

**C1** - `GET /c/:key` with `User-Agent` containing `WhatsApp` (case-insensitive) for an existing org answers `200` `text/html` whose body includes `og:title` equal to the organization name and, when a logo exists, `og:image` pointing at `/api/public/chat/<key>/logo` (door 1, AC 3)
Proof: `src/modules/channels/open-graph.spec.ts -t "serves Open Graph html for a preview agent"`

**C2** - `GET /c/:key` with a WhatsApp UA and an unknown 32-hex key answers `404`; with a key that is not 32 hex answers `400` (AC 4, Surface)
Proof: `src/modules/channels/open-graph.spec.ts -t "rejects a bad or unknown key for Open Graph"`

**C3** - `GET /c/:key` with a normal browser UA (e.g. Chrome) is not handled as OG by the API: the route answers `404` with a body that is not `text/html` Open Graph (browser gets the SPA from Caddy/Vite) (door 1)
Proof: `src/modules/channels/open-graph.spec.ts -t "leaves the browser to the spa"`

**C4** - `Caddyfile` proxies `/c/*` to the server when `User-Agent` matches the preview regex `(?i)(whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|linkedinbot|telegrambot)` (door 1, startup config)
Proof: `rg -n "whatsapp|facebookexternalhit|/c/" Caddyfile`

### S2 - Página do Web Chat · web SPA · ~40 KB · ~12k

**C5** - Opening `/c/<key>` of an onboarded brokerage shows the organization name; with branding set, shows greeting text and a logo image (AC 1)
Proof: `e2e/web-chat.spec.ts -g "shows the brokerage on the public link"`

**C6** - Opening `/c/not-a-valid-key!!` and `/c/` + 32 hex unknown shows an error in pt-BR and no phone field (AC 2, screen 404)
Proof: `e2e/web-chat.spec.ts -g "shows an error for a bad or unknown link"`

**C7** - With phone, notice checked, and Turnstile skipped (no site key), submitting starts the session and shows the first message text in the thread (AC 5, door 2)
Proof: `e2e/web-chat.spec.ts -g "starts a session and shows the first message"`

**C8** - Submit without checking the notice does not call `POST /sessions` (no request) and shows that acceptance is required (AC 6)
Proof: `e2e/web-chat.spec.ts -g "requires accepting the notice"`

**C9** - After a successful start, `sessionStorage` has `bens_visitor_token:<key>` equal to the token from the start response (door 2)
Proof: `e2e/web-chat.spec.ts -g "stores the visitor token for the socket"`

### S3 - Thread e tempo real · web + minimal panel send · ~35 KB · ~10k

**C10** - In the thread, sending another message shows it in the list (AC 8)
Proof: `e2e/web-chat.spec.ts -g "sends a follow-up message in the thread"`

**C11** - `POST /api/v1/conversations/:id/messages` with `{ text }` by an ADMIN who can read the conversation (auto-takes from `QUEUE` if needed) answers `201` with the panel `Message` and notifies visitors; sending while `CLOSED` answers `409 CONVERSATION_CLOSED` (door 3, AC 9)
Proof: `src/modules/conversations/conversation-send.spec.ts -t "sends an outbound message and takes from the queue"`
Proof: `src/modules/conversations/conversation-send.spec.ts -t "refuses a message on a closed conversation"`

**C12** - After the visitor is in the thread, that panel send of a human reply makes the visitor page show the reply text within 2 s without a full navigation (AC 9, AC 12)
Proof: `e2e/web-chat.spec.ts -g "shows a human reply in under two seconds"`

**C13** - When the page receives `events:resync`, it refetches `GET /messages` and still only shows `seq ≥ fromSeq` (AC 10)
Proof: `e2e/web-chat.spec.ts -g "reloads messages after events resync"`

### S4 - Smoke e montagem · e2e + architecture · ~20 KB · ~5k

**C14** - Smoke: onboard → open public link → start → send → first + follow-up visible (AC 11)
Proof: `e2e/web-chat.spec.ts -g "starts a session and shows the first message"`
Proof: `e2e/web-chat.spec.ts -g "sends a follow-up message in the thread"`

**C15** - Smoke human leg: admin API sends reply → visitor sees it (AC 12)
Proof: `e2e/web-chat.spec.ts -g "shows a human reply in under two seconds"`

**C16** - `POST /api/v1/conversations/:id/messages` declares `conversation:write`; without session → `401`; role without the permission → `403`; unknown id / other tenant → `404` (Surface door 3)
Proof: `src/modules/conversations/conversation-send.spec.ts -t "refuses a message outside the tenant or without permission"`
Proof: `test/architecture.spec.ts -t "every /api/v1 route declares a permission"`
Proof: `src/shared/permissions.spec.ts -t "grants conversation write to admin manager and commercial"`
**C17** - Screen Web Chat shows loading while describe is pending and an error with retry when describe fails (Observable)
Proof: `e2e/web-chat.spec.ts -g "shows loading and error for the public chat"`

**C18** - Preview UA list used by the API matches the Caddy regex members: WhatsApp, facebookexternalhit, Facebot, Twitterbot, Slackbot, LinkedInBot, TelegramBot (door 1 Coverage)
Proof: `src/modules/channels/open-graph.spec.ts -t "recognizes each preview user agent"`

**C19** - `socket.io-client` is a dependency of `@bens/web` (Impact)
Proof: `node -e "const p=require('./apps/web/package.json');process.exit(p.dependencies['socket.io-client']?0:1)"`

**C20** - Module boundaries stay green (architecture)
Proof: `test/architecture.spec.ts -t "the source tree has no boundary violations|finds no import cycle between modules|lets each module write only its own tables"`

**C21** - Unknown field on `POST .../messages` → `400`; empty text → `400` (Surface)
Proof: `src/modules/conversations/conversation-send.spec.ts -t "validates the outbound message body"`

**C22** - Reload of `/c/:key` with a valid visitor cookie reconnects the socket using `GET /session` without starting a new session (door 2)
Proof: `e2e/web-chat.spec.ts -g "reconnects the visitor socket after reload"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /c/:key` OG statuses (3) | 200 C1 · 400 C2 · 404 C2 | - |
| screen Web Chat statuses (2) | 200 C5, C7 · 404 C6 | - |
| `POST /api/v1/conversations/:id/messages` statuses (6) | 201 C11 · 400 C21 · 401 C16 · 403 C16 · 404 C16 · 409 C11 | - |
| Landing doors (3) | door 1 C1, C3, C4, C18 · door 2 C9, C22 · door 3 C11, C12 | - |
| preview User-Agents (7) | WhatsApp C18 · facebookexternalhit C18 · Facebot C18 · Twitterbot C18 · Slackbot C18 · LinkedInBot C18 · TelegramBot C18 | - |
| screen Web Chat arrangement (3 regions) | header/brand C5 · start form C7/C8 · thread C10/C12 | - |
| startup config: OG proxy (2 assemblies) | Caddyfile C4 · API route C1, C3 | - |

- Binding sources (ui): plan Sources opened in verification; screen copy/arrangement enumerated above.
- No Test policy section: repo `CLAUDE.md` answers level (endpoint integration + Playwright for UI).

## Swept

- validation: C2, C6, C21
- failure modes: C6, C17
- idempotency: n/a - UI uses existing API dedupe (`clientMessageId`)
- authorization: C16
- concurrency: n/a - single visitor smoke; panel race is inbox
- data lifecycle: n/a - nothing persisted beyond existing public chat
- dependency failure: C17 (describe error)
- state transitions: C11 (QUEUE → HUMAN on send)
- observability: n/a - no new log requirement

## Handoff

- S1 ~4k + S2 ~12k + S3 ~10k + S4 ~5k ≈ 31k write; read ≈ 80 KB (register Turnstile pattern, public-chat hooks, e2e support, conversation routes, Caddy) ≈ 20k → ≈ 51k under 150k — **one builder**

### Door added in checks (Surface additive)

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 3. Panel outbound for smoke / early inbox | `POST /api/v1/conversations/:id/messages` body `{ text }` `.strict()`, permission `conversation:write` (ADMIN/MANAGER/COMMERCIAL). If handler is `QUEUE`, the same transaction takes (`HUMAN` + `assigneeId = me`) then `sendMessage` | SQL+notify only in e2e: would not exercise `sendMessage`; waiting for full inbox: blocks the smoke the user required |
