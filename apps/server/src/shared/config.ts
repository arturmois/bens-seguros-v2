import { z } from 'zod'

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  // Public origin of the app (Caddy in production, Vite in dev): links in e-mails, the Origin check
  // and the session cookie's `Secure` flag all derive from it.
  APP_URL: z.url({ protocol: /^https?$/ }),
  // Signs sessions and encrypts the TOTP secrets (Better Auth). At least 32 characters.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Only behind a reverse proxy that overwrites X-Forwarded-For (Caddy), with the server port closed.
  TRUST_PROXY: z.stringbool().default(false),

  // Unset for AWS S3; MinIO in dev and R2 in production need it.
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('auto'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),

  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  EMAIL_FROM: z.string().min(3),
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
