import { z } from 'zod'

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
