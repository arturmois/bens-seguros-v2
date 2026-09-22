import { z } from 'zod'
import type { Transaction } from '../infrastructure/database.ts'
import type { EmailMessage, Mailer } from '../infrastructure/email.ts'
import type { Queue } from '../infrastructure/queue.ts'
import ResetPassword from './reset-password.tsx'
import VerifyEmail from './verify-email.tsx'

export const SEND_EMAIL = 'email.send'

const linkProps = z.object({ name: z.string().min(1), url: z.url() })

// Job payload (AD-003): a template key and its props, never a rendered element or HTML, so a
// retry renders the current template and the queue stays small.
export const emailPayload = z.discriminatedUnion('template', [
  z.object({ template: z.literal('verify-email'), to: z.email(), props: linkProps }),
  z.object({ template: z.literal('reset-password'), to: z.email(), props: linkProps }),
])

export type EmailPayload = z.infer<typeof emailPayload>

function toMessage(payload: EmailPayload): EmailMessage {
  switch (payload.template) {
    case 'verify-email':
      return {
        to: payload.to,
        subject: 'Confirme seu e-mail',
        body: <VerifyEmail {...payload.props} />,
      }
    case 'reset-password':
      return {
        to: payload.to,
        subject: 'Redefina sua senha',
        body: <ResetPassword {...payload.props} />,
      }
  }
}

// Throws on an invalid payload before anything is sent: pg-boss marks the job failed.
export async function sendEmail(mailer: Mailer, data: unknown) {
  await mailer.send(toMessage(emailPayload.parse(data)))
}

export function registerEmailWorker(deps: { queue: Queue; mailer: Mailer }) {
  return deps.queue.registerWorker(SEND_EMAIL, (data) => sendEmail(deps.mailer, data), {
    retries: 3,
    backoff: true,
  })
}

export function enqueueEmail(queue: Queue, tx: Transaction, payload: EmailPayload) {
  return queue.enqueue(tx, SEND_EMAIL, payload)
}
