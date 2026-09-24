# Turnstile centralizado checks

Profile: light

## Intent

No cadastro (`/register`), o widget do Turnstile (300 px de largura no tamanho `normal`) aparece encostado à esquerda do formulário, que é mais largo; os campos e o botão ocupam a largura toda, então o widget parece desalinhado (relato do usuário no staging, 2026-09-24). Com esta mudança, o container do widget centraliza o que o Turnstile desenha dentro dele.

1 check · 0 one-way doors · 0 open

## Checks

**C1** - On `/register` with a Turnstile site key, at the default desktop viewport, the horizontal center of the 300 px box the Turnstile script renders into its container is within 1 px of the horizontal center of the sign-up form
Proof: `pnpm --filter @bens/web exec playwright test e2e/signup-gates.spec.ts -g "centers the turnstile widget"` exits 0

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| widget position (1) | centered C1 | - |

## Swept

- validation: n/a - layout only
- failure modes: n/a - no new path; the widget states are Cloudflare's
- idempotency: n/a - no state
- authorization: n/a - public page, unchanged
- concurrency: n/a - no state
- data lifecycle: n/a - no data
- dependency failure: existing - `requires the turnstile token` keeps the button disabled without a token
- state transitions: n/a - no state
- observability: n/a - layout only

## Handoff

- two files, ~3k - one builder
