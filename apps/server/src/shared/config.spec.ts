import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.ts'

const required = {
  DATABASE_URL: 'postgresql://bens:bens@localhost:5432/bens',
  SMTP_URL: 'smtp://localhost:1025',
  EMAIL_FROM: 'Bens Seguros <nao-responda@bensseguros.local>',
  APP_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
}

describe('loadConfig', () => {
  it('applies defaults to the optional variables', () => {
    expect(loadConfig(required)).toEqual({
      ...required,
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3001,
      LOG_LEVEL: 'info',
      TRUST_PROXY: false,
      SIGNUP_MODE: 'self_serve',
      MAX_ORGS_PER_USER: 3,
    })
  })

  it('defaults max orgs per user to 3', () => {
    expect(loadConfig(required).MAX_ORGS_PER_USER).toBe(3)
  })

  it('coerces numbers and booleans from environment strings', () => {
    const config = loadConfig({ ...required, PORT: '4000', TRUST_PROXY: 'true' })

    expect(config.PORT).toBe(4000)
    expect(config.TRUST_PROXY).toBe(true)
  })

  it('rejects invalid values listing every offending variable', () => {
    const load = () => loadConfig({ ...required, PORT: 'abc', NODE_ENV: 'staging' })

    expect(load).toThrow(ConfigError)
    expect(load).toThrow(/PORT/)
    expect(load).toThrow(/NODE_ENV/)
  })

  it('requires the infrastructure variables and checks URL protocols', () => {
    const load = () =>
      loadConfig({ DATABASE_URL: 'mysql://localhost/bens', SMTP_URL: 'http://localhost' })

    expect(load).toThrow(/DATABASE_URL/)
    expect(load).toThrow(/SMTP_URL/)
    expect(load).toThrow(/EMAIL_FROM/)
  })

  it('requires the auth secret and the app url', () => {
    const { APP_URL: _appUrl, ...withoutAppUrl } = required
    const load = () => loadConfig({ ...withoutAppUrl, BETTER_AUTH_SECRET: 'a'.repeat(31) })

    expect(load).toThrow(ConfigError)
    expect(load).toThrow(/BETTER_AUTH_SECRET/)
    expect(load).toThrow(/APP_URL/)
    expect(loadConfig(required).BETTER_AUTH_SECRET).toHaveLength(32)
  })

  it('requires turnstile keys in production in every signup mode', () => {
    const production = { ...required, NODE_ENV: 'production' }
    const keys = { TURNSTILE_SECRET_KEY: 'secret-key', TURNSTILE_SITE_KEY: 'site-key' }

    for (const mode of ['closed', 'self_serve']) {
      const { TURNSTILE_SECRET_KEY: _secret, ...withoutSecret } = keys
      const { TURNSTILE_SITE_KEY: _site, ...withoutSite } = keys
      const missingSecret = () => loadConfig({ ...production, SIGNUP_MODE: mode, ...withoutSecret })
      const missingSite = () => loadConfig({ ...production, SIGNUP_MODE: mode, ...withoutSite })

      expect(missingSecret, mode).toThrow(ConfigError)
      expect(missingSecret, mode).toThrow(/TURNSTILE_SECRET_KEY/)
      expect(missingSite, mode).toThrow(ConfigError)
      expect(missingSite, mode).toThrow(/TURNSTILE_SITE_KEY/)
      expect(loadConfig({ ...production, SIGNUP_MODE: mode, ...keys }).SIGNUP_MODE).toBe(mode)
    }
  })
})
