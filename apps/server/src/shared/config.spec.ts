import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.ts'

const required = {
  DATABASE_URL: 'postgresql://bens:bens@localhost:5432/bens',
  S3_BUCKET: 'bens-dev',
  S3_ACCESS_KEY_ID: 'bens',
  S3_SECRET_ACCESS_KEY: 'bens-minio',
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
      S3_REGION: 'auto',
      S3_FORCE_PATH_STYLE: false,
      TRUST_PROXY: false,
      SIGNUP_MODE: 'self_serve',
      MAX_ORGS_PER_USER: 3,
    })
  })

  it('defaults max orgs per user to 3', () => {
    expect(loadConfig(required).MAX_ORGS_PER_USER).toBe(3)
  })

  it('coerces numbers and booleans from environment strings', () => {
    const config = loadConfig({ ...required, PORT: '4000', S3_FORCE_PATH_STYLE: 'true' })

    expect(config.PORT).toBe(4000)
    expect(config.S3_FORCE_PATH_STYLE).toBe(true)
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
    expect(load).toThrow(/S3_BUCKET/)
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
})
