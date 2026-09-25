import type { Config } from '../../shared/config.ts'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 5000

type TurnstileConfig = Pick<
  Config,
  'NODE_ENV' | 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITEVERIFY_URL'
>

// Whether Cloudflare accepts the widget token. Without a secret (dev and tests) there is nothing to
// check; production refuses to boot without one (config.ts). Fails closed: an unreachable or
// malformed siteverify is a refusal, never a pass.
export async function verifyTurnstile(
  config: TurnstileConfig,
  token: string,
  remoteIp: string,
): Promise<boolean> {
  if (!config.TURNSTILE_SECRET_KEY) return true
  const url =
    config.NODE_ENV === 'test' && config.TURNSTILE_SITEVERIFY_URL
      ? config.TURNSTILE_SITEVERIFY_URL
      : SITEVERIFY_URL
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: config.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: remoteIp,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return false
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null && 'success' in body && body.success === true
  } catch {
    return false
  }
}
