import { createTransport } from 'nodemailer'
import type { ReactElement } from 'react'
import { render } from 'react-email'
import type { Config } from '../shared/config.ts'

export type EmailMessage = {
  to: string
  subject: string
  // A template from src/emails, e.g. <VerifyEmail url={…} />.
  body: ReactElement
}

export type Mailer = ReturnType<typeof createMailer>

// SMTP everywhere: Mailpit in dev, Resend's SMTP endpoint in production. Callers send from a job
// (`email.send`), never inside a request, so a slow provider does not hold a transaction open.
export function createMailer(config: Config) {
  const transport = createTransport(config.SMTP_URL)

  return {
    async send(message: EmailMessage) {
      const [html, text] = await Promise.all([
        render(message.body),
        render(message.body, { plainText: true }),
      ])
      await transport.sendMail({
        from: config.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html,
        text,
      })
    },

    close() {
      transport.close()
    },
  }
}
