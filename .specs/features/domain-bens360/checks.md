# Domain bens360 checks

Profile: light
Plan: none - change under ~3 files, no one-way door (see Intent)

## Intent

The staging environment moves from `staging.bensseg.com` to `staging.bens360.com.br` (the user
bought `bens360.com.br`; the apex stays reserved for production, which does not exist yet). No
application code names the domain: the server derives `baseURL`, `trustedOrigins`, the CORS origin
and invitation links from `APP_URL` (`auth.ts:30-33`, `app.ts:40`, `invitation.ts:103`) and Caddy
serves `SITE_ADDRESS`. So the change is configuration and the external services that are bound to
a hostname: DNS, Let's Encrypt (automatic through Caddy once DNS resolves), the Resend sender
domain and the Turnstile widget hostnames.

When this ships, `https://staging.bens360.com.br` serves the app with a valid certificate, the
deploy health check targets it, and sign-up, e-mail confirmation (sent from
`nao-responda@bens360.com.br`) and login work there.

Order matters: DNS before the `.env` push, or Caddy retries ACME against a name that does not
resolve and can hit the Let's Encrypt failed-validation rate limit.

8 checks in 1 slice · 0 one-way doors · 0 open

## Checks

### S1 - staging responde em staging.bens360.com.br · 1 tracked file · ~2k

**C1** - `dig +short A staging.bens360.com.br` prints `187.77.33.152` (the staging VPS)
Proof: `dig +short A staging.bens360.com.br | grep -qx 187.77.33.152` exits 0

**C2** - `.env.staging` holds exactly `SITE_ADDRESS=staging.bens360.com.br`, `APP_URL=https://staging.bens360.com.br` and `EMAIL_FROM="Bens Seguros <nao-responda@bens360.com.br>"`, and no line mentions `bensseg`
Proof: `grep -cxE 'SITE_ADDRESS=staging\.bens360\.com\.br|APP_URL=https://staging\.bens360\.com\.br|EMAIL_FROM="Bens Seguros <nao-responda@bens360\.com\.br>"' .env.staging` prints `3`
Proof: `! grep -q bensseg .env.staging` exits 0

**C3** - The VPS `.env` is byte-identical to `.env.staging` and the stack was recreated with it
Proof: `scripts/env-push.sh staging --apply` exits 0 and prints `env-push: aplicado`

**C4** - The GitHub environment `staging` has `SITE_URL=https://staging.bens360.com.br`
Proof: `gh variable get SITE_URL --env staging` prints `https://staging.bens360.com.br`

**C5** - `https://staging.bens360.com.br/api/health` answers `200` with `{"status":"ok"}` over a certificate curl trusts (no `-k`)
Proof: `curl -fsS https://staging.bens360.com.br/api/health` prints `{"status":"ok"}`

**C6** - The Resend domain `bens360.com.br` is `verified` (sending from `nao-responda@bens360.com.br` is accepted)
Proof: Resend dashboard → Domains shows `bens360.com.br` as `Verified` (the API key is send-only, so no CLI proof; C8 exercises the send)

**C7** - The Turnstile widget with site key `0x4AAAAAAFCjIpNreNEwXe_w` lists `staging.bens360.com.br` in its hostnames
Proof: Cloudflare dashboard → Turnstile → widget → Hostname Management lists `staging.bens360.com.br` (C8 exercises the siteverify)

**C8** - In a browser at `https://staging.bens360.com.br`, a new account signs up (Turnstile passes), receives the confirmation e-mail from `nao-responda@bens360.com.br` with a link to `https://staging.bens360.com.br/…`, confirms and logs in
Proof: manual run by the user, same as the staging milestone (roadmap F0); recorded in `verification.md`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| places that carry the hostname (5) | DNS C1 · `.env.staging` C2 · VPS `.env` C3 · GitHub `SITE_URL` C4 · Caddy certificate C5 | - |
| external services bound to the domain (3) | Let's Encrypt C5 · Resend C6, C8 · Turnstile C7, C8 | - |
| values derived from `APP_URL` at runtime (3) | Better Auth `baseURL`/`trustedOrigins` C8 (login from the new origin) · CORS origin C8 · e-mail links C8 | - |

- C3, C5 and C8 cross the real boundary (VPS, HTTPS, browser); none claims more than one run shows.

## Swept

- validation: C2 (`env-push.sh` refuses `APP_URL` ≠ `https://$SITE_ADDRESS` before sending)
- failure modes: C1 before C3 (ordering in Intent; a push before DNS leaves Caddy without a certificate)
- idempotency: C3 (`env-push` replaces the file by sha256; re-running is a no-op recreate)
- authorization: n/a - no route or permission changes
- concurrency: n/a - single operator change
- data lifecycle: n/a - database untouched; `env-push` refuses to change the database credentials
- dependency failure: C6, C7 (a Resend or Turnstile service not bound to the new domain fails sign-up in C8)
- state transitions: n/a - none
- observability: n/a - no log or metric changes

## Out of scope

- Redirect from `staging.bensseg.com` - staging only, no external users; the old name simply stops being served
- Production on `bens360.com.br` - production does not exist yet
- Rewriting history (`roadmap.md`, past `.specs`) that recorded `staging.bensseg.com` as it was

## Handoff

- S1 = ~2k, one builder.
