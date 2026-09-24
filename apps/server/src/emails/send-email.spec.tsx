import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createTestDeps } from '../../test/app.ts'
import { closeDependencies, type Deps } from '../dependencies.ts'
import { registerWorkers } from '../workers.ts'
import { enqueueEmail, SEND_EMAIL, sendEmail } from './send-email.tsx'

const mailpitApi = process.env.MAILPIT_API ?? 'http://localhost:8025/api/v1'

const address = z.object({ Address: z.string() })
const mailpitSearch = z.object({
  messages: z.array(z.object({ ID: z.string(), Subject: z.string(), To: z.array(address) })),
})
const mailpitMessage = z.object({ HTML: z.string(), Text: z.string() })

async function inbox(to: string) {
  const response = await fetch(`${mailpitApi}/search?query=${encodeURIComponent(`to:"${to}"`)}`)
  return mailpitSearch.parse(await response.json()).messages
}

async function message(id: string) {
  return mailpitMessage.parse(await (await fetch(`${mailpitApi}/message/${id}`)).json())
}

function recipient() {
  return `destino-${randomUUID()}@example.com`
}

function bossSchemaOf(target: Deps) {
  return `${new URL(target.config.DATABASE_URL).searchParams.get('schema')}_pgboss`
}

// Test files that ran earlier in this worker schema enqueue e-mails without starting a worker. Their
// jobs would sit ahead of this test's, and the worker takes one per poll every 2 s, oldest first.
// Those files have finished (one schema runs its files one after another), so the jobs are nobody's.
async function clearPendingEmails(target: Deps) {
  await target.db.$queryRawUnsafe(
    `DELETE FROM "${bossSchemaOf(target)}".job WHERE name = $1 AND state IN ('created', 'retry')`,
    SEND_EMAIL,
  )
}

let deps: Deps

beforeAll(async () => {
  deps = await createTestDeps()
})

afterAll(() => closeDependencies(deps))

describe('email.send', () => {
  it('sends the verification e-mail', async () => {
    const to = recipient()
    const url = `https://app.bens.test/api/auth/verify-email?token=${randomUUID()}`

    await sendEmail(deps.mailer, { template: 'verify-email', to, props: { name: 'Maria', url } })

    const [summary] = await inbox(to)
    expect(summary?.Subject).toBe('Confirme seu e-mail')
    expect(summary?.To.map((item) => item.Address)).toEqual([to])
    const body = await message(summary?.ID ?? '')
    expect(body.HTML).toContain(`href="${url.replaceAll('&', '&amp;')}"`)
    expect(body.Text).toContain(url)
  })

  it('sends the password reset e-mail', async () => {
    const to = recipient()
    const url = `https://app.bens.test/api/auth/reset-password/${randomUUID()}?callbackURL=%2Freset-password`

    await sendEmail(deps.mailer, { template: 'reset-password', to, props: { name: 'Maria', url } })

    const [summary] = await inbox(to)
    expect(summary?.Subject).toBe('Redefina sua senha')
    const body = await message(summary?.ID ?? '')
    expect(body.HTML).toContain(`href="${url}"`)
    expect(body.Text).toContain(url)
  })

  it('sends the invitation e-mail', async () => {
    const to = recipient()
    const url = `https://app.bens.test/accept-invitation?token=${randomUUID()}`

    await sendEmail(deps.mailer, {
      template: 'invitation',
      to,
      props: { organizationName: 'Corretora Azul', url },
    })

    const [summary] = await inbox(to)
    expect(summary?.Subject).toBe('Convite para Corretora Azul')
    expect(summary?.To.map((item) => item.Address)).toEqual([to])
    const body = await message(summary?.ID ?? '')
    expect(body.HTML).toContain(`href="${url}"`)
    expect(body.Text).toContain(url)
  })

  it('rejects an invalid payload without sending', async () => {
    const unknownTemplate = recipient()
    const missingUrl = recipient()

    await expect(
      sendEmail(deps.mailer, {
        template: 'welcome',
        to: unknownTemplate,
        props: { name: 'Maria', url: 'https://app.bens.test' },
      }),
    ).rejects.toThrow()
    await expect(
      sendEmail(deps.mailer, {
        template: 'verify-email',
        to: missingUrl,
        props: { name: 'Maria' },
      }),
    ).rejects.toThrow()

    expect(await inbox(unknownTemplate)).toEqual([])
    expect(await inbox(missingUrl)).toEqual([])
  })

  it('delivers each template through the queue', async () => {
    const queued = await createTestDeps()
    await queued.queue.start()
    await clearPendingEmails(queued)
    await registerWorkers(queued)
    const cases = [
      { template: 'verify-email' as const, subject: 'Confirme seu e-mail', to: recipient() },
      { template: 'reset-password' as const, subject: 'Redefina sua senha', to: recipient() },
    ]

    try {
      await queued.db.withoutTenant(async (tx) => {
        for (const { template, to } of cases) {
          await enqueueEmail(queued.queue, tx, {
            template,
            to,
            props: { name: 'Maria', url: `https://app.bens.test/${template}` },
          })
        }
      })

      for (const { to, subject, template } of cases) {
        await expect
          .poll(async () => (await inbox(to)).map((item) => item.Subject), { timeout: 15_000 })
          .toEqual([subject])
        const [summary] = await inbox(to)
        expect((await message(summary?.ID ?? '')).Text).toContain(
          `https://app.bens.test/${template}`,
        )
      }
    } finally {
      await closeDependencies(queued)
    }
  })

  it('retries a failed send', async () => {
    // Nothing listens on port 1: every SMTP attempt fails.
    const failing = await createTestDeps({ SMTP_URL: 'smtp://127.0.0.1:1' })
    await failing.queue.start()
    await clearPendingEmails(failing)
    await registerWorkers(failing)
    const bossSchema = bossSchemaOf(failing)
    const to = recipient()

    try {
      const [queue] = await failing.db.$queryRawUnsafe<
        { retry_limit: number; retry_backoff: boolean }[]
      >(`SELECT retry_limit, retry_backoff FROM "${bossSchema}".queue WHERE name = $1`, SEND_EMAIL)
      expect(queue).toEqual({ retry_limit: 3, retry_backoff: true })

      await failing.db.withoutTenant((tx) =>
        enqueueEmail(failing.queue, tx, {
          template: 'verify-email',
          to,
          props: { name: 'Maria', url: 'https://app.bens.test' },
        }),
      )

      await expect
        .poll(
          async () => {
            const [job] = await failing.db.$queryRawUnsafe<{ retry_count: number }[]>(
              `SELECT retry_count FROM "${bossSchema}".job WHERE name = $1 AND data->>'to' = $2`,
              SEND_EMAIL,
              to,
            )
            return job?.retry_count ?? 0
          },
          { timeout: 15_000, interval: 250 },
        )
        .toBeGreaterThanOrEqual(1)
      expect(await inbox(to)).toEqual([])
    } finally {
      await closeDependencies(failing)
    }
  })
})
