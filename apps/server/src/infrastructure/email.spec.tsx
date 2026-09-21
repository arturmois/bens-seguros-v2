import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { testConfig } from '../../test/app.ts'
import ExampleEmail from '../emails/example.tsx'
import { createMailer } from './email.ts'

const mailer = createMailer(testConfig())
const mailpitApi = process.env.MAILPIT_API ?? 'http://localhost:8025/api/v1'

afterAll(() => mailer.close())

const address = z.object({ Address: z.string() })
const mailpitSearch = z.object({
  messages: z.array(z.object({ ID: z.string(), To: z.array(address) })),
})
const mailpitMessage = z.object({ HTML: z.string(), Text: z.string(), From: address })

async function mailpit<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const response = await fetch(`${mailpitApi}${path}`)
  return schema.parse(await response.json())
}

describe('mailer (Mailpit)', () => {
  it('renders the React Email template to HTML and plain text and delivers it over SMTP', async () => {
    const subject = `Teste ${randomUUID()}`

    await mailer.send({
      to: 'maria@example.com',
      subject,
      body: <ExampleEmail name="Maria" url="https://app.bensseguros.local" />,
    })

    const search = await mailpit(
      `/search?query=${encodeURIComponent(`subject:"${subject}"`)}`,
      mailpitSearch,
    )
    expect(search.messages).toHaveLength(1)
    const [summary] = search.messages
    expect(summary?.To[0]?.Address).toBe('maria@example.com')

    const message = await mailpit(`/message/${summary?.ID}`, mailpitMessage)
    expect(message.From.Address).toBe('teste@bensseguros.local')
    expect(message.HTML).toContain('Olá, Maria!')
    expect(message.HTML).toContain('href="https://app.bensseguros.local"')
    expect(message.Text).toContain('Olá, Maria!')
  })
})
