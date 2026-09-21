import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ownerDatabaseUrl } from './setup-db.ts'

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

  it('refuses to boot with a role that bypasses row security', async () => {
    // The table owner of the docker compose database is a superuser (ADR-004).
    const boot = run(process.execPath, ['--import', 'tsx', serverEntry], {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        PORT: '3999',
        DATABASE_URL: ownerDatabaseUrl(),
        S3_BUCKET: 'bens-test',
        S3_ACCESS_KEY_ID: 'bens',
        S3_SECRET_ACCESS_KEY: 'bens-minio',
        SMTP_URL: 'smtp://localhost:1025',
        EMAIL_FROM: 'teste@bensseguros.local',
      },
      timeout: 15_000,
    })

    await expect(boot).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Database role "bens" bypasses row level security'),
    })
  })
})
