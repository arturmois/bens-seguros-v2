import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import {
  emailJobsTo,
  lastEmailUrl,
  PASSWORD,
  signedInUser,
  signUp,
  TestClient,
  uniqueEmail,
} from '../../../test/auth.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import { loadConfig } from '../../shared/config.ts'

const serverRoot = fileURLToPath(new URL('../../..', import.meta.url))
const caddyfile = fileURLToPath(new URL('../../../../../Caddyfile', import.meta.url))

const requiredEnv = {
  DATABASE_URL: 'postgresql://bens:bens@127.0.0.1:5432/bens',
  S3_BUCKET: 'bens-dev',
  S3_ACCESS_KEY_ID: 'bens',
  S3_SECRET_ACCESS_KEY: 'bens-minio',
  SMTP_URL: 'smtp://127.0.0.1:1025',
  EMAIL_FROM: 'Bens Seguros <teste@bensseguros.local>',
  APP_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
}

type VerifyBody = { secret?: string; response?: string }

function listenVerify(success: boolean) {
  const calls: VerifyBody[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      calls.push(JSON.parse(Buffer.concat(chunks).toString()) as VerifyBody)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ success }))
    })
  })
  return new Promise<{ url: string; calls: VerifyBody[]; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address === null || typeof address === 'string') throw new Error('no port')
        resolve({
          url: `http://127.0.0.1:${address.port}/`,
          calls,
          close: () =>
            new Promise((done, fail) => {
              server.close((error) => (error ? fail(error) : done()))
            }),
        })
      })
    },
  )
}

async function bootProduction(extra: Record<string, string>) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ...requiredEnv,
      NODE_ENV: 'production',
      SIGNUP_MODE: 'self_serve',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })
  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => child.kill('SIGTERM'), 15_000)
    child.on('exit', (status) => {
      clearTimeout(timer)
      resolve(status)
    })
  })
  return { code, stderr }
}

describe('signup gates', () => {
  describe('open signup', () => {
    let app: App
    let deps: Deps
    let close: () => Promise<void>

    beforeAll(async () => {
      ;({ app, deps, close } = await buildTestApp({ workers: true }))
      await app.ready()
    })

    afterAll(() => close())

    it('rejects a disposable domain', async () => {
      for (const email of ['x@mailinator.com', 'x@MAILINATOR.COM']) {
        const response = await new TestClient(app).post('/api/auth/sign-up/email', {
          name: 'Maria Souza',
          email,
          password: PASSWORD,
        })

        expect(response.statusCode, email).toBe(403)
        expect(response.json(), email).toMatchObject({
          code: 'EMAIL_DOMAIN_NOT_ALLOWED',
          message: 'E-mails descartáveis não são permitidos. Use um e-mail pessoal ou corporativo.',
        })
        expect(await deps.db.user.count({ where: { email: email.toLowerCase() } }), email).toBe(0)
      }
    })

    it('accepts a regular domain', async () => {
      for (const domain of ['gmail.com', 'corretora.com.br']) {
        const email = uniqueEmail(domain.replaceAll('.', '-'))
        const at = email.indexOf('@')
        const addressed = `${email.slice(0, at)}@${domain}`

        const response = await new TestClient(app).post('/api/auth/sign-up/email', {
          name: 'Maria Souza',
          email: addressed,
          password: PASSWORD,
        })

        expect(response.statusCode, domain).toBe(200)
        expect(await deps.db.user.count({ where: { email: addressed } }), domain).toBe(1)
      }
    })

    it('returns the public signup config', async () => {
      const openResponse = await new TestClient(app).get('/api/public/signup-config')
      expect(openResponse.statusCode).toBe(200)
      expect(openResponse.json()).toEqual({ signupMode: 'self_serve', turnstileSiteKey: null })

      const secret = 'turnstile-secret-must-stay-server-side'
      const keyed = await buildTestApp({
        env: {
          SIGNUP_MODE: 'closed',
          TURNSTILE_SITE_KEY: 'site-key-public',
          TURNSTILE_SECRET_KEY: secret,
        },
      })
      await keyed.app.ready()
      try {
        const response = await new TestClient(keyed.app).get('/api/public/signup-config')
        const body = JSON.stringify(response.json())
        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({
          signupMode: 'closed',
          turnstileSiteKey: 'site-key-public',
        })
        expect(body).not.toContain(secret)
      } finally {
        await keyed.close()
      }
    })

    it('signup without turnstile secret', async () => {
      const email = uniqueEmail()
      const response = await new TestClient(app).post('/api/auth/sign-up/email', {
        name: 'Maria Souza',
        email,
        password: PASSWORD,
      })

      expect(response.statusCode).toBe(200)
      expect(await deps.db.user.count({ where: { email } })).toBe(1)
    })
  })

  describe('closed signup', () => {
    let open: { app: App; deps: Deps; close: () => Promise<void> }
    let closed: { app: App; deps: Deps; close: () => Promise<void> }

    beforeAll(async () => {
      open = await buildTestApp({ workers: true })
      closed = await buildTestApp({ workers: true, env: { SIGNUP_MODE: 'closed' } })
      await open.app.ready()
      await closed.app.ready()
    })

    afterAll(async () => {
      await open.close()
      await closed.close()
    })

    it('closed signup returns SIGNUP_CLOSED and creates nothing', async () => {
      const email = uniqueEmail()
      const response = await new TestClient(closed.app).post('/api/auth/sign-up/email', {
        name: 'Maria Souza',
        email,
        password: PASSWORD,
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        code: 'SIGNUP_CLOSED',
        message: 'O cadastro está fechado. Peça um convite à sua corretora.',
      })
      expect(await closed.deps.db.user.count({ where: { email } })).toBe(0)
      expect(await emailJobsTo(closed.deps, email, 'verify-email')).toEqual([])
    })

    it('closed signup still signs in, verifies and resets', async () => {
      const member = await signedInUser(new TestClient(open.app), open.deps)
      const signIn = await new TestClient(closed.app).post('/api/auth/sign-in/email', {
        email: member.email,
        password: PASSWORD,
      })
      expect(signIn.statusCode).toBe(200)

      const fresh = await signUp(new TestClient(open.app))
      const verify = await new TestClient(closed.app).get(
        await lastEmailUrl(open.deps, fresh.email, 'verify-email'),
      )
      expect(verify.statusCode).toBe(302)

      const reset = await new TestClient(closed.app).post('/api/auth/request-password-reset', {
        email: member.email,
        redirectTo: '/reset-password',
      })
      expect(reset.statusCode).toBe(200)
      expect(await emailJobsTo(closed.deps, member.email, 'reset-password')).toHaveLength(1)
    })
  })

  describe('turnstile', () => {
    let verify: Awaited<ReturnType<typeof listenVerify>>
    let open: { app: App; deps: Deps; close: () => Promise<void> }
    let guarded: { app: App; deps: Deps; close: () => Promise<void> }
    const secret = 'turnstile-secret-test'

    beforeAll(async () => {
      verify = await listenVerify(true)
      open = await buildTestApp({ workers: true })
      guarded = await buildTestApp({
        workers: true,
        env: {
          TURNSTILE_SECRET_KEY: secret,
          TURNSTILE_SITEVERIFY_URL: verify.url,
        },
      })
      await open.app.ready()
      await guarded.app.ready()
    })

    afterAll(async () => {
      await open.close()
      await guarded.close()
      await verify.close()
    })

    it('missing captcha token', async () => {
      const before = verify.calls.length
      const email = uniqueEmail()
      const response = await new TestClient(guarded.app).post('/api/auth/sign-up/email', {
        name: 'Maria Souza',
        email,
        password: PASSWORD,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'MISSING_RESPONSE' })
      expect(await guarded.deps.db.user.count({ where: { email } })).toBe(0)
      expect(verify.calls.length).toBe(before)
    })

    it('accepted captcha', async () => {
      const before = verify.calls.length
      const email = uniqueEmail()
      const token = `token-${email}`
      const response = await new TestClient(guarded.app).post(
        '/api/auth/sign-up/email',
        { name: 'Maria Souza', email, password: PASSWORD },
        { headers: { 'x-captcha-response': token } },
      )

      expect(response.statusCode).toBe(200)
      expect(await guarded.deps.db.user.count({ where: { email } })).toBe(1)
      expect(verify.calls[before]).toMatchObject({ secret, response: token })
    })

    it('disposable domain is rejected after a valid captcha', async () => {
      const email = 'pessoa@mailinator.com'
      const response = await new TestClient(guarded.app).post(
        '/api/auth/sign-up/email',
        { name: 'Maria Souza', email, password: PASSWORD },
        { headers: { 'x-captcha-response': 'token-disposable' } },
      )

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ code: 'EMAIL_DOMAIN_NOT_ALLOWED' })
      expect(await guarded.deps.db.user.count({ where: { email } })).toBe(0)
    })

    it('captcha is not required on sign-in or reset', async () => {
      const before = verify.calls.length
      const member = await signedInUser(new TestClient(open.app), open.deps)
      const signIn = await new TestClient(guarded.app).post('/api/auth/sign-in/email', {
        email: member.email,
        password: PASSWORD,
      })
      const reset = await new TestClient(guarded.app).post('/api/auth/request-password-reset', {
        email: member.email,
        redirectTo: '/reset-password',
      })

      expect(signIn.statusCode).toBe(200)
      expect(await emailJobsTo(guarded.deps, member.email, 'reset-password')).toHaveLength(1)
      expect(reset.statusCode).toBe(200)
      expect(verify.calls.length).toBe(before)
    })
  })

  describe('rejected captcha', () => {
    let verify: Awaited<ReturnType<typeof listenVerify>>
    let app: App
    let deps: Deps
    let close: () => Promise<void>

    beforeAll(async () => {
      verify = await listenVerify(false)
      ;({ app, deps, close } = await buildTestApp({
        workers: true,
        env: {
          TURNSTILE_SECRET_KEY: 'turnstile-secret-test',
          TURNSTILE_SITEVERIFY_URL: verify.url,
        },
      }))
      await app.ready()
    })

    afterAll(async () => {
      await close()
      await verify.close()
    })

    it('rejected captcha', async () => {
      const email = uniqueEmail()
      const response = await new TestClient(app).post(
        '/api/auth/sign-up/email',
        { name: 'Maria Souza', email, password: PASSWORD },
        { headers: { 'x-captcha-response': 'bad-token' } },
      )

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ code: 'VERIFICATION_FAILED' })
      expect(await deps.db.user.count({ where: { email } })).toBe(0)
    })
  })

  describe('captcha service down', () => {
    let app: App
    let deps: Deps
    let close: () => Promise<void>

    beforeAll(async () => {
      ;({ app, deps, close } = await buildTestApp({
        env: {
          TURNSTILE_SECRET_KEY: 'turnstile-secret-test',
          TURNSTILE_SITEVERIFY_URL: 'http://127.0.0.1:1/',
        },
      }))
      await app.ready()
    })

    afterAll(() => close())

    it('captcha service down', async () => {
      const email = uniqueEmail()
      const response = await new TestClient(app).post(
        '/api/auth/sign-up/email',
        { name: 'Maria Souza', email, password: PASSWORD },
        { headers: { 'x-captcha-response': 'any-token' } },
      )

      expect(response.statusCode).toBe(500)
      expect(response.json()).toMatchObject({ code: 'UNKNOWN_ERROR' })
      expect(await deps.db.user.count({ where: { email } })).toBe(0)
    })
  })

  it('defaults signup mode to self_serve', () => {
    expect(loadConfig(requiredEnv).SIGNUP_MODE).toBe('self_serve')
  })

  it('production self_serve without turnstile exits 1', async () => {
    const missingSecret = await bootProduction({ TURNSTILE_SITE_KEY: 'site-key' })
    expect(missingSecret.code).toBe(1)
    expect(missingSecret.stderr).toContain('TURNSTILE_SECRET_KEY')

    const missingSite = await bootProduction({ TURNSTILE_SECRET_KEY: 'secret-key' })
    expect(missingSite.code).toBe(1)
    expect(missingSite.stderr).toContain('TURNSTILE_SITE_KEY')
  })

  it('allows the turnstile host in the caddy csp', () => {
    const caddy = readFileSync(caddyfile, 'utf8')
    expect(caddy).toContain("script-src 'self' https://challenges.cloudflare.com")
    expect(caddy).toContain('frame-src https://challenges.cloudflare.com')
  })
})
