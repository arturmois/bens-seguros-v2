import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('applies defaults to an empty environment', () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3001,
      LOG_LEVEL: 'info',
    })
  })

  it('coerces PORT from the environment string', () => {
    expect(loadConfig({ PORT: '4000' }).PORT).toBe(4000)
  })

  it('rejects invalid values listing every offending variable', () => {
    const load = () => loadConfig({ PORT: 'abc', NODE_ENV: 'staging' })

    expect(load).toThrow(ConfigError)
    expect(load).toThrow(/PORT/)
    expect(load).toThrow(/NODE_ENV/)
  })
})
