import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const serverEntry = fileURLToPath(new URL('../src/server.ts', import.meta.url))

describe('server boot', () => {
  it('exits with code 1 and names the variable when the config is invalid', async () => {
    const boot = run(process.execPath, ['--import', 'tsx', serverEntry], {
      env: { PATH: process.env.PATH, PORT: 'not-a-port' },
      timeout: 15_000,
    })

    await expect(boot).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('PORT'),
    })
  })
})
