import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import {
  emailJobsTo,
  lastEmailUrl,
  PASSWORD,
  sessionCookieOf,
  signUp,
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

describe('POST /api/auth/sign-up/email', () => {
  it('creates an unverified user and queues the verification e-mail', async () => {
    const client = new TestClient(app)
    const email = uniqueEmail()

    const response = await client.post('/api/auth/sign-up/email', {
      name: 'Maria Souza',
      email,
      password: PASSWORD,
    })

    expect(response.statusCode).toBe(200)
    expect(sessionCookieOf(response.headers['set-cookie'])).toBeUndefined()
    const user = await deps.db.user.findUniqueOrThrow({ where: { email } })
    expect(user.emailVerified).toBe(false)
    expect(await deps.db.session.count({ where: { userId: user.id } })).toBe(0)
    const jobs = await emailJobsTo(deps, email)
    expect(jobs.map((job) => job.template)).toEqual(['verify-email'])
    expect(jobs[0]?.props.url).toContain('/api/auth/verify-email?token=')
  })

  it('does not reveal an existing e-mail', async () => {
    const email = uniqueEmail()
    const first = await new TestClient(app).post('/api/auth/sign-up/email', {
      name: 'Maria Souza',
      email,
      password: PASSWORD,
    })
    const second = await new TestClient(app).post('/api/auth/sign-up/email', {
      name: 'Outra Pessoa',
      email,
      password: 'outra-senha-456',
    })

    expect(second.statusCode).toBe(first.statusCode)
    expect(Object.keys(second.json()).sort()).toEqual(Object.keys(first.json()).sort())
    expect(await deps.db.user.count({ where: { email } })).toBe(1)
  })

  it('verifying the e-mail signs the user in', async () => {
    const client = new TestClient(app)
    const { email } = await signUp(client)

    const response = await client.get(await lastEmailUrl(deps, email, 'verify-email'))

    expect(response.statusCode).toBe(302)
    expect(sessionCookieOf(response.headers['set-cookie'])).toBeDefined()
    expect((await deps.db.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true)
    const me = await client.get('/api/v1/me')
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ email, emailVerified: true })
  })
})
