import { z } from 'zod'

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    // Public origin of the app (Caddy in production, Vite in dev): links in e-mails, the Origin check
    // and the session cookie's `Secure` flag all derive from it.
    APP_URL: z.url({ protocol: /^https?$/ }),
    // Signs sessions and encrypts the TOTP secrets (Better Auth). At least 32 characters.
    BETTER_AUTH_SECRET: z.string().min(32),
    // Only behind a reverse proxy that overwrites X-Forwarded-For (Caddy), with the server port closed.
    TRUST_PROXY: z.stringbool().default(false),

    SMTP_URL: z.url({ protocol: /^smtps?$/ }),
    EMAIL_FROM: z.string().min(3),

    // Public sign-up. `closed` blocks only POST /api/auth/sign-up/email; invite acceptance does not
    // pass through it. Production requires both Turnstile keys in every mode: the Web Chat start is
    // public too (ADR-014); the process exits otherwise.
    SIGNUP_MODE: z.enum(['closed', 'self_serve']).default('self_serve'),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    // Tests point the captcha checks at a local siteverify. Ignored outside `test`.
    TURNSTILE_SITEVERIFY_URL: z.url().optional(),

    // Memberships one user may hold. Onboarding past this answers 422 ORG_LIMIT_REACHED.
    MAX_ORGS_PER_USER: z.coerce.number().int().min(1).default(3),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return
    if (!value.TURNSTILE_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURNSTILE_SECRET_KEY'],
        message: 'Required when NODE_ENV is production',
      })
    }
    if (!value.TURNSTILE_SITE_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURNSTILE_SITE_KEY'],
        message: 'Required when NODE_ENV is production',
      })
    }
  })

export type Config = z.infer<typeof configSchema>

export class ConfigError extends Error {
  override name = 'ConfigError'
}

// The only place that reads environment variables. Fails fast so the process never boots half-configured.
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new ConfigError(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`)
  }
  return result.data
}
