import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import {
  emailJobsTo,
  lastEmailUrl,
  PASSWORD,
  signedInUser,
  TestClient,
  uniqueEmail,
} from '../../../test/auth.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  await app.ready()
})

afterAll(() => close())

const NEW_PASSWORD = 'nova-senha-789'

async function requestReset(email: string) {
  return new TestClient(app).post('/api/auth/request-password-reset', {
    email,
    redirectTo: '/reset-password',
  })
}

// The token is the last path segment of the link in the e-mail.
async function resetToken(email: string) {
  const url = new URL(await lastEmailUrl(deps, email, 'reset-password'), 'http://localhost')
  return url.pathname.split('/').at(-1) ?? ''
}

async function signIn(email: string, password: string) {
  return new TestClient(app).post('/api/auth/sign-in/email', { email, password })
}

describe('password reset', () => {
  it('queues the reset e-mail for a known user', async () => {
    const { email } = await signedInUser(new TestClient(app), deps)

    const response = await requestReset(email)

    expect(response.statusCode).toBe(200)
    const jobs = await emailJobsTo(deps, email, 'reset-password')
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.props.url).toContain('/api/auth/reset-password/')
  })

  it('answers the same for an unknown e-mail', async () => {
    const { email } = await signedInUser(new TestClient(app), deps)
    const known = await requestReset(email)
    const unknownEmail = uniqueEmail('ninguem')

    const unknown = await requestReset(unknownEmail)

    expect(unknown.statusCode).toBe(200)
    expect(unknown.json()).toEqual(known.json())
    expect(await emailJobsTo(deps, unknownEmail)).toEqual([])
  })

  it('resets the password and revokes every session', async () => {
    const client = new TestClient(app)
    const { email, userId } = await signedInUser(client, deps)
    await requestReset(email)

    const response = await new TestClient(app).post('/api/auth/reset-password', {
      token: await resetToken(email),
      newPassword: NEW_PASSWORD,
    })

    expect(response.statusCode).toBe(200)
    expect(await deps.db.session.count({ where: { userId } })).toBe(0)
    expect((await client.get('/api/v1/me')).statusCode).toBe(401)
    expect((await signIn(email, PASSWORD)).statusCode).toBe(401)
    expect((await signIn(email, NEW_PASSWORD)).statusCode).toBe(200)
  })

  it('reset token lasts one hour', async () => {
    const { email } = await signedInUser(new TestClient(app), deps)
    const requestedAt = Date.now()

    await requestReset(email)

    const token = await resetToken(email)
    const verification = await deps.db.verification.findFirstOrThrow({
      where: { identifier: { contains: token } },
    })
    expect(Math.abs(verification.expiresAt.getTime() - (requestedAt + 3_600_000))).toBeLessThan(
      60_000,
    )
  })

  it('rejects a used or expired token', async () => {
    const used = await signedInUser(new TestClient(app), deps)
    await requestReset(used.email)
    const usedToken = await resetToken(used.email)
    await new TestClient(app).post('/api/auth/reset-password', {
      token: usedToken,
      newPassword: NEW_PASSWORD,
    })

    const reused = await new TestClient(app).post('/api/auth/reset-password', {
      token: usedToken,
      newPassword: 'terceira-senha-000',
    })

    expect(reused.statusCode).toBe(400)
    expect((await signIn(used.email, NEW_PASSWORD)).statusCode).toBe(200)

    const expired = await signedInUser(new TestClient(app), deps)
    await requestReset(expired.email)
    const expiredToken = await resetToken(expired.email)
    const changed = await deps.db.verification.updateMany({
      where: { identifier: { contains: expiredToken } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(changed.count).toBe(1)

    const late = await new TestClient(app).post('/api/auth/reset-password', {
      token: expiredToken,
      newPassword: NEW_PASSWORD,
    })

    expect(late.statusCode).toBe(400)
    expect((await signIn(expired.email, PASSWORD)).statusCode).toBe(200)
  })
})
