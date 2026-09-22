import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { twoFactor } from 'better-auth/plugins'
import { type EmailPayload, enqueueEmail } from '../../emails/send-email.tsx'
import type { Database } from '../../infrastructure/database.ts'
import type { Queue } from '../../infrastructure/queue.ts'
import type { Config } from '../../shared/config.ts'

export type AuthDeps = {
  config: Config
  db: Database
  queue: Queue
}

// Better Auth owns identity, sessions, 2FA and the auth rate limit (ADR-003). It runs on the
// application client (role `bens_app`, ADR-004); its tables are user-level, without a tenant.
export function createAuth(deps: AuthDeps) {
  const { config, db, queue } = deps

  // The e-mail leaves through the `email.send` job (AD-003), committed on its own short transaction:
  // the request never waits on SMTP, and the reset flow does not leak timing.
  const sendEmail = (payload: EmailPayload) =>
    db.withoutTenant((tx) => enqueueEmail(queue, tx, payload))

  return betterAuth({
    appName: 'Bens Seguros',
    baseURL: config.APP_URL,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(config.APP_URL).origin],
    database: prismaAdapter(db, { provider: 'postgresql' }),
    telemetry: { enabled: false },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          template: 'reset-password',
          to: user.email,
          props: { name: user.name, url },
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 86_400,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          template: 'verify-email',
          to: user.email,
          props: { name: user.name, url },
        })
      },
    },

    // 3 days, extended when used after 12 h; read from the database on every request (no cookie
    // cache), so deleting a session revokes it at once.
    session: {
      expiresIn: 259_200,
      updateAge: 43_200,
      additionalFields: {
        // Written only by the organizations module (Phase 4), after checking the membership.
        activeOrganizationId: { type: 'string', required: false, input: false },
      },
    },
    user: {
      additionalFields: {
        isSuperAdmin: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },

    // Persisted, so a restart does not reset the counters. The mount sets x-forwarded-for to the
    // client IP resolved by Fastify (AD-002); a value sent by the client never reaches here.
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 900, max: 10 },
        '/sign-up/email': { window: 3600, max: 5 },
        '/request-password-reset': { window: 3600, max: 3 },
        '/send-verification-email': { window: 3600, max: 3 },
        '/two-factor/*': { window: 900, max: 10 },
      },
    },

    advanced: {
      // UUID v7 from the Prisma schema, like every other table.
      database: { generateId: false },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },

    plugins: [twoFactor({ issuer: 'Bens Seguros' })],
  })
}

export type Auth = ReturnType<typeof createAuth>
