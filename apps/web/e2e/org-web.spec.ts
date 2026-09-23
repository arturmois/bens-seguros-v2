import { type APIRequestContext, type Page, request as playwrightRequest } from '@playwright/test'
import {
  clearActiveOrganization,
  emailLink,
  expect,
  inbox,
  NAME,
  onboard,
  PASSWORD,
  signUp,
  test,
  uniqueEmail,
  verifiedUser,
} from './support'

const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha').fill(user.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // The click returns before the session request settles. A later goto would cancel it.
  await expect(page).not.toHaveURL(/\/login/)
}

// A new sign-in does not carry the active organization, so the guard asks which one.
async function enterApp(page: Page, organizationName: string) {
  await expect(page).toHaveURL('/select-org')
  await page.getByRole('button', { name: organizationName }).click()
  await expect(page).toHaveURL('/dashboard')
}

async function invitationToken(to: string) {
  let text = ''
  await expect
    .poll(async () => {
      const message = (await inbox(to)).find((item) => item.Subject.startsWith('Convite para '))
      if (!message) return false
      const response = await fetch(`${mailpit}/api/v1/message/${message.ID}`)
      const body = (await response.json()) as { Text: string }
      text = body.Text
      return text.includes('accept-invitation?token=')
    })
    .toBe(true)
  const token = text.match(/accept-invitation\?token=([^\s]+)/)?.[1]
  if (!token) throw new Error(`no invitation token for ${to}`)
  return token
}

function requireBase(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('baseURL is required')
  return baseURL
}

async function acceptInvite(baseURL: string | undefined, email: string) {
  const origin = requireBase(baseURL)
  const guest = await playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin: new URL(origin).origin },
  })
  await signUp(guest, email)
  const verify = await guest.get(await emailLink(email, 'Confirme seu e-mail'), { maxRedirects: 0 })
  expect(verify.status()).toBe(302)
  expect(
    (
      await guest.post('/api/v1/me/terms-acceptance', {
        data: { termsVersion: '1.0', privacyVersion: '1.0' },
      })
    ).ok(),
  ).toBeTruthy()
  const token = await invitationToken(email)
  expect((await guest.post('/api/v1/invitations/accept', { data: { token } })).ok()).toBeTruthy()
  await guest.dispose()
  return { email, password: PASSWORD }
}

async function invite(api: APIRequestContext, email: string, role: string) {
  const response = await api.post('/api/v1/invitations', { data: { email, role } })
  expect(response.ok()).toBeTruthy()
}

test.describe('org web', () => {
  test('sends a user without a brokerage to onboarding', async ({ page, api }) => {
    await signIn(page, await verifiedUser(api))
    await expect(page).toHaveURL('/onboarding')
    await expect(page.getByRole('heading', { name: 'Criar corretora' })).toBeVisible()
    await expect(page.getByLabel('Nome')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Criar corretora' })).toBeVisible()
  })

  test('creates the brokerage and shows its name', async ({ page, api }) => {
    await signIn(page, await verifiedUser(api))
    await page.getByLabel('Nome').fill('Corretora Azul')
    const created = page.waitForRequest('**/api/v1/onboarding')
    await page.getByRole('button', { name: 'Criar corretora' }).click()
    expect((await created).postDataJSON()).toEqual({ name: 'Corretora Azul' })
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText('Corretora Azul')).toBeVisible()
  })

  test('rejects a brokerage name outside 2 to 80 characters', async ({ page, api }) => {
    const calls: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/v1/onboarding'))
        calls.push(request.url())
    })
    await signIn(page, await verifiedUser(api))
    for (const name of ['A', 'A'.repeat(81)]) {
      await page.getByLabel('Nome').fill(name)
      await page.getByRole('button', { name: 'Criar corretora' }).click()
      await expect(page.getByText('O nome precisa ter entre 2 e 80 caracteres.')).toBeVisible()
    }
    expect(calls).toEqual([])
  })

  test('shows the organization limit message', async ({ page, api }) => {
    await page.route('**/api/v1/onboarding', (route) =>
      route.fulfill({
        status: 422,
        json: {
          error: {
            code: 'ORG_LIMIT_REACHED',
            message: 'Você já participa do número máximo de organizações.',
          },
        },
      }),
    )
    await signIn(page, await verifiedUser(api))
    await page.getByLabel('Nome').fill('Corretora Limite')
    await page.getByRole('button', { name: 'Criar corretora' }).click()
    await expect(
      page.getByText('Você já participa do número máximo de organizações.'),
    ).toBeVisible()
    await expect(page).toHaveURL('/onboarding')
  })

  test('sends a signed-out visitor away from onboarding', async ({ page, api: _api }) => {
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/login/)
  })

  test('sends pending terms away from onboarding', async ({ page, api }) => {
    const user = await verifiedUser(api, { terms: false })
    await signIn(page, user)
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/terms-acceptance/)
  })

  test('makes the new brokerage active', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api, 'Primeira')
    await signIn(page, user)
    await page.goto('/onboarding')
    await page.getByLabel('Nome').fill('Corretora Nova')
    await page.getByRole('button', { name: 'Criar corretora' }).click()
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText('Corretora Nova')).toBeVisible()
  })

  test('offers every brokerage when none is active', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const alfa = await onboard(api, 'Alfa')
    const beta = await onboard(api, 'Beta')
    const me = await (await api.get('/api/v1/me')).json()
    await clearActiveOrganization(me.id)
    await signIn(page, user)
    await expect(page).toHaveURL('/select-org')
    await expect(page.getByRole('heading', { name: 'Escolher corretora' })).toBeVisible()
    await expect(page.getByRole('button', { name: alfa.name })).toBeVisible()
    await expect(page.getByRole('button', { name: beta.name })).toBeVisible()
  })

  test('activates the brokerage that was chosen', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const alfa = await onboard(api, 'Alfa')
    await onboard(api, 'Beta')
    const me = await (await api.get('/api/v1/me')).json()
    await clearActiveOrganization(me.id)
    await signIn(page, user)
    const chosen = page.waitForRequest('**/api/v1/me/active-organization')
    await page.getByRole('button', { name: alfa.name }).click()
    expect((await chosen).postDataJSON()).toEqual({ organizationId: alfa.id })
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText(alfa.name)).toBeVisible()
  })

  test('switches the active brokerage from the header', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const alfa = await onboard(api, 'Alfa')
    const beta = await onboard(api, 'Beta')
    await signIn(page, user)
    await enterApp(page, beta.name)
    await page.getByRole('button', { name: beta.name }).click()
    await page.getByRole('button', { name: alfa.name }).click()
    await expect(page.getByRole('button', { name: alfa.name })).toBeVisible()
    const body = await page.evaluate(async () => {
      const response = await fetch('/api/v1/organization', { credentials: 'include' })
      return response.json() as Promise<{ id: string }>
    })
    expect(body.id).toBe(alfa.id)
  })

  test('shows a single brokerage as text', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const created = await onboard(api, 'Unica')
    await signIn(page, user)
    await enterApp(page, created.name)
    await expect(page.getByText(created.name)).toBeVisible()
    await expect(page.getByRole('button', { name: created.name })).toHaveCount(0)
  })

  test('sends pending terms to acceptance before onboarding', async ({ page, api }) => {
    const user = await verifiedUser(api, { terms: false })
    await signIn(page, user)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/terms-acceptance/)
    await expect(page).not.toHaveURL(/\/onboarding/)
  })

  test('asks for a choice when the active membership is gone', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api, 'Alfa')
    await onboard(api, 'Beta')
    await page.route('**/api/v1/me', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      const body = await response.json()
      body.role = null
      await route.fulfill({ response, json: body })
    })
    await signIn(page, user)
    await expect(page).toHaveURL('/select-org')
  })

  test('sends a user with no active membership to onboarding', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api, 'Sumida')
    await page.route('**/api/v1/me', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      const body = await response.json()
      body.role = null
      body.organizations = []
      await route.fulfill({ response, json: body })
    })
    await signIn(page, user)
    await expect(page).toHaveURL('/onboarding')
  })

  test('shows organization not found when the switch fails', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const created = await onboard(api, 'Troca')
    await onboard(api, 'Outra')
    const me = await (await api.get('/api/v1/me')).json()
    await clearActiveOrganization(me.id)
    await page.route('**/api/v1/me/active-organization', (route) =>
      route.fulfill({
        status: 404,
        json: { error: { code: 'NOT_FOUND', message: 'Organização não encontrada.' } },
      }),
    )
    await signIn(page, user)
    await page.getByRole('button', { name: created.name }).click()
    await expect(page.getByText('Organização não encontrada.')).toBeVisible()
    await expect(page).toHaveURL('/select-org')
  })

  test('shows the brokerage form to the owner', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const created = await onboard(api, 'Formulario')
    await signIn(page, user)
    await enterApp(page, created.name)
    await page.goto('/settings/organization')
    await expect(page.getByRole('heading', { name: 'Corretora' })).toBeVisible()
    await expect(page.getByLabel('Nome')).toHaveValue(created.name)
    await expect(page.getByText(created.slug)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Salvar' })).toBeVisible()
  })

  test('renames the brokerage and keeps the slug', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const created = await onboard(api, 'Antiga')
    await signIn(page, user)
    await enterApp(page, created.name)
    await page.goto('/settings/organization')
    await page.getByLabel('Nome').fill('Corretora Verde')
    const saved = page.waitForRequest(
      (request) => request.method() === 'PATCH' && request.url().includes('/api/v1/organization'),
    )
    await page.getByRole('button', { name: 'Salvar' }).click()
    expect((await saved).postDataJSON()).toEqual({ name: 'Corretora Verde' })
    await expect(page.getByText('Nome atualizado.')).toBeVisible()
    await expect(page.getByText(created.slug)).toBeVisible()
  })

  test('rejects a rename outside 2 to 80 characters', async ({ page, api }) => {
    const calls: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().includes('/api/v1/organization'))
        calls.push(request.url())
    })
    const user = await verifiedUser(api)
    const created = await onboard(api, 'Nome')
    await signIn(page, user)
    await enterApp(page, created.name)
    await page.goto('/settings/organization')
    for (const name of ['A', 'A'.repeat(81)]) {
      await page.getByLabel('Nome').fill(name)
      await page.getByRole('button', { name: 'Salvar' }).click()
      await expect(page.getByText('O nome precisa ter entre 2 e 80 caracteres.')).toBeVisible()
    }
    expect(calls).toEqual([])
  })

  test('shows the brokerage read-only to a viewer', async ({ page, api, baseURL }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Leitura')
    const email = uniqueEmail('viewer')
    await invite(api, email, 'VIEWER')
    const viewer = await acceptInvite(baseURL, email)
    const patches: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH') patches.push(new URL(request.url()).pathname)
    })
    await signIn(page, viewer)
    await enterApp(page, created.name)
    await page.goto('/settings/organization')
    await expect(page.getByText(created.name)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0)
    expect(patches).toEqual([])
    expect(owner.email).not.toBe(viewer.email)
  })

  test('shows brokerage loading and error', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const created = await onboard(api, 'Carga')
    let fail = false
    let release: (value: boolean) => void = () => {}
    const gate = new Promise<boolean>((resolve) => {
      release = resolve
    })
    await page.route('**/api/v1/organization', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      fail = await gate
      if (fail) {
        await route.fulfill({
          status: 500,
          json: { error: { code: 'INTERNAL_ERROR', message: 'falhou' } },
        })
        return
      }
      await route.continue()
    })
    await signIn(page, user)
    await enterApp(page, created.name)
    await page.goto('/settings/organization')
    await expect(page.getByText('Carregando a corretora…')).toBeVisible()
    release(true)
    await expect(page.getByText('Não foi possível carregar a corretora.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  })

  test('shows Equipe only to someone who can update members', async ({ page, api, baseURL }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Menu')
    await signIn(page, owner)
    await enterApp(page, created.name)
    await expect(page.getByRole('link', { name: 'Corretora' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Equipe' })).toBeVisible()

    const email = uniqueEmail('viewer')
    await invite(api, email, 'VIEWER')
    const viewer = await acceptInvite(baseURL, email)
    await page.context().clearCookies()
    await signIn(page, viewer)
    await enterApp(page, created.name)
    await expect(page.getByRole('link', { name: 'Corretora' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Equipe' })).toHaveCount(0)
  })

  test('hides team management from a viewer', async ({ page, api, baseURL }) => {
    await verifiedUser(api)
    const created = await onboard(api, 'Oculta')
    const email = uniqueEmail('viewer')
    await invite(api, email, 'VIEWER')
    const viewer = await acceptInvite(baseURL, email)
    const calls: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path === '/api/v1/members' || path === '/api/v1/invitations') calls.push(path)
    })
    await signIn(page, viewer)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    await expect(page.getByText('Você não gerencia a equipe desta corretora.')).toBeVisible()
    expect(calls).toEqual([])
  })

  test('shows the owner without role controls', async ({ page, api }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Dono')
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    const row = page.getByRole('listitem').filter({ hasText: owner.email })
    await expect(page.getByRole('heading', { name: 'Equipe' })).toBeVisible()
    await expect(row.getByText('Proprietário')).toBeVisible()
    await expect(row.getByRole('button', { name: 'Desativar' })).toHaveCount(0)
    await expect(row.getByLabel(`Papel de ${owner.email}`)).toHaveCount(0)
  })

  test('labels every role', async ({ page, api, baseURL }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Rotulos')
    for (const role of ['ADMIN', 'MANAGER', 'COMMERCIAL', 'VIEWER'] as const) {
      const email = uniqueEmail(role.toLowerCase())
      await invite(api, email, role)
      await acceptInvite(baseURL, email)
    }
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    const members = page.getByRole('list').first()
    for (const label of ['Proprietário', 'Administrador', 'Gerente', 'Comercial', 'Visualizador']) {
      await expect(members.locator('span', { hasText: label })).toBeVisible()
    }
  })

  test('sends an administrator invitation', async ({ page, api }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Convite')
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    const email = uniqueEmail('admin')
    await page.getByLabel('E-mail').fill(email)
    const sent = page.waitForRequest('**/api/v1/invitations')
    await page.getByRole('button', { name: 'Enviar convite' }).click()
    expect((await sent).postDataJSON()).toEqual({ email, role: 'ADMIN' })
    const row = page.getByRole('listitem').filter({ hasText: email })
    await expect(row.getByText('Administrador')).toBeVisible()
  })

  test('rejects an invalid invitation email', async ({ page, api }) => {
    const calls: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/v1/invitations'))
        calls.push(request.url())
    })
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Invalido')
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    await page.getByLabel('E-mail').fill('nao-e-email')
    await page.getByRole('button', { name: 'Enviar convite' }).click()
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible()
    expect(calls).toEqual([])
  })

  test('shows a pending invitation conflict', async ({ page, api }) => {
    await page.route('**/api/v1/invitations', (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      return route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'INVITATION_PENDING',
            message: 'Já existe um convite pendente para este e-mail.',
          },
        },
      })
    })
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Pendente')
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    await page.getByLabel('E-mail').fill(uniqueEmail('pendente'))
    await page.getByRole('button', { name: 'Enviar convite' }).click()
    await expect(page.getByText('Já existe um convite pendente para este e-mail.')).toBeVisible()
  })

  test('shows no pending invitations', async ({ page, api }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Vazio')
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    await expect(page.getByText('Nenhum convite pendente.')).toBeVisible()
  })

  test('revokes an invitation after confirmation', async ({ page, api }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Revoga')
    const email = uniqueEmail('revoga')
    await invite(api, email, 'ADMIN')
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    const row = page.getByRole('listitem').filter({ hasText: email })
    await row.getByRole('button', { name: 'Revogar' }).click()
    const dialog = page.getByRole('dialog', { name: `Revogar o convite para ${email}?` })
    const removed = page.waitForRequest(
      (request) => request.method() === 'DELETE' && request.url().includes('/api/v1/invitations/'),
    )
    await dialog.getByRole('button', { name: 'Revogar' }).click()
    await removed
    await expect(row).toHaveCount(0)
  })

  test('changes a member role to commercial', async ({ page, api, baseURL }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Papel')
    const email = uniqueEmail('papel')
    await invite(api, email, 'ADMIN')
    await acceptInvite(baseURL, email)
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    const changed = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        /\/api\/v1\/members\/[^/]+$/.test(new URL(request.url()).pathname),
    )
    await page.getByLabel(`Papel de ${email}`).selectOption({ label: 'Comercial' })
    expect((await changed).postDataJSON()).toEqual({ role: 'COMMERCIAL' })
    const row = page.getByRole('listitem').filter({ hasText: email })
    await expect(row.locator('span', { hasText: 'Comercial' })).toBeVisible()
  })

  test('deactivates a member after confirmation', async ({ page, api, baseURL }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Desativa')
    const email = uniqueEmail('desativa')
    await invite(api, email, 'ADMIN')
    await acceptInvite(baseURL, email)
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    const row = page.getByRole('listitem').filter({ hasText: email })
    await row.getByRole('button', { name: 'Desativar' }).click()
    const dialog = page.getByRole('dialog', { name: `Desativar ${NAME}?` })
    const saved = page.waitForRequest((request) => request.method() === 'PATCH')
    await dialog.getByRole('button', { name: 'Desativar' }).click()
    expect((await saved).postDataJSON()).toEqual({ active: false })
    await expect(row.getByText('Inativo')).toBeVisible()
  })

  test('confirms a portfolio transfer with the returned count', async ({ page, api, baseURL }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Carteira')
    const email = uniqueEmail('carteira')
    await invite(api, email, 'ADMIN')
    await acceptInvite(baseURL, email)
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    const row = page.getByRole('listitem').filter({ hasText: email })
    await row.getByRole('button', { name: 'Transferir carteira' }).click()
    const dialog = page.getByRole('dialog', {
      name: `Transferir a carteira de ${NAME} para ${NAME}?`,
    })
    const moved = page.waitForRequest((request) => request.url().includes('/transfer-portfolio'))
    await dialog.getByRole('button', { name: 'Transferir' }).click()
    const body = (await moved).postDataJSON() as { toMemberId: string }
    expect(body.toMemberId).toEqual(expect.any(String))
    await expect(page.getByText('Transferidos: 0.')).toBeVisible()
  })

  test('shows team loading and error', async ({ page, api }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Equipe')
    let release: (value: boolean) => void = () => {}
    const gate = new Promise<boolean>((resolve) => {
      release = resolve
    })
    const hang = async (route: {
      request: () => { method: () => string }
      continue: () => Promise<void>
      fulfill: (options: object) => Promise<void>
    }) => {
      if (route.request().method() !== 'GET') return route.continue()
      if (await gate) {
        await route.fulfill({
          status: 500,
          json: { error: { code: 'INTERNAL_ERROR', message: 'falhou' } },
        })
        return
      }
      await route.continue()
    }
    await page.route('**/api/v1/members', hang)
    await page.route('**/api/v1/invitations', hang)
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    await expect(page.getByText('Carregando a equipe…')).toBeVisible()
    release(true)
    await expect(page.getByText('Não foi possível carregar a equipe.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  })

  test('keeps the confirmation open when the change fails', async ({ page, api, baseURL }) => {
    const owner = await verifiedUser(api)
    const created = await onboard(api, 'Falha')
    const email = uniqueEmail('falha')
    await invite(api, email, 'ADMIN')
    await acceptInvite(baseURL, email)
    await page.route('**/api/v1/members/**', (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      return route.fulfill({
        status: 422,
        json: {
          error: {
            code: 'USER_QUOTA_REACHED',
            message: 'O plano não tem vagas para outro usuário.',
          },
        },
      })
    })
    await signIn(page, owner)
    await enterApp(page, created.name)
    await page.goto('/settings/members')
    const row = page.getByRole('listitem').filter({ hasText: email })
    await row.getByRole('button', { name: 'Desativar' }).click()
    const dialog = page.getByRole('dialog', { name: `Desativar ${NAME}?` })
    await dialog.getByRole('button', { name: 'Desativar' }).click()
    await expect(dialog.getByText('O plano não tem vagas para outro usuário.')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('shows the invitation before sign-in', async ({ page, api }) => {
    await verifiedUser(api)
    const created = await onboard(api, 'Aberto')
    const email = uniqueEmail('aberto')
    await invite(api, email, 'MANAGER')
    const token = await invitationToken(email)
    const calls: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/v1/invitations/accept'))
        calls.push(request.url())
    })
    await page.goto(`/accept-invitation?token=${token}`)
    await expect(page.getByRole('heading', { name: created.name })).toBeVisible()
    await expect(page.getByText('Gerente')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Entrar para aceitar' })).toHaveAttribute(
      'href',
      /\/login\?redirect=.*accept-invitation.*token/,
    )
    expect(calls).toEqual([])
  })

  test('accepts the invitation into the brokerage', async ({ page, api, baseURL }) => {
    await verifiedUser(api)
    const created = await onboard(api, 'Aceite')
    const email = uniqueEmail('aceite')
    await invite(api, email, 'ADMIN')
    const origin = requireBase(baseURL)
    const guest = await playwrightRequest.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin: new URL(origin).origin },
    })
    await signUp(guest, email)
    expect(
      (
        await guest.get(await emailLink(email, 'Confirme seu e-mail'), { maxRedirects: 0 })
      ).status(),
    ).toBe(302)
    expect(
      (
        await guest.post('/api/v1/me/terms-acceptance', {
          data: { termsVersion: '1.0', privacyVersion: '1.0' },
        })
      ).ok(),
    ).toBeTruthy()
    await guest.dispose()
    const token = await invitationToken(email)
    await signIn(page, { email, password: PASSWORD })
    await page.goto(`/accept-invitation?token=${token}`)
    const accepted = page.waitForRequest('**/api/v1/invitations/accept')
    await page.getByRole('button', { name: 'Aceitar convite' }).click()
    expect((await accepted).postDataJSON()).toEqual({ token })
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText(created.name)).toBeVisible()
  })

  test('shows an unknown invitation as not found', async ({ page, api: _api }) => {
    await page.goto('/accept-invitation?token=nao-existe')
    await expect(page.getByText('Convite não encontrado.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aceitar convite' })).toHaveCount(0)
  })

  test('shows an expired invitation', async ({ page, api: _api }) => {
    await page.route('**/api/public/invitations/**', (route) =>
      route.fulfill({
        status: 200,
        json: {
          organizationName: 'Corretora Velha',
          email: 'velha@example.com',
          role: 'ADMIN',
          status: 'EXPIRED',
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      }),
    )
    await page.goto('/accept-invitation?token=expirado')
    await expect(page.getByText('Este convite expirou.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aceitar convite' })).toHaveCount(0)
  })

  test('shows a closed invitation', async ({ page, api: _api }) => {
    for (const status of ['REVOKED', 'ACCEPTED'] as const) {
      await page.route('**/api/public/invitations/**', (route) =>
        route.fulfill({
          status: 200,
          json: {
            organizationName: 'Corretora Fechada',
            email: 'fechada@example.com',
            role: 'ADMIN',
            status,
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        }),
      )
      await page.goto(`/accept-invitation?token=${status}`)
      await expect(page.getByText('Este convite não está mais aberto.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Aceitar convite' })).toHaveCount(0)
      await page.unroute('**/api/public/invitations/**')
    }
  })

  test('shows an invitation meant for another email', async ({ page, api }) => {
    await verifiedUser(api)
    await onboard(api, 'Outro')
    const invited = uniqueEmail('outro')
    await invite(api, invited, 'ADMIN')
    const token = await invitationToken(invited)
    const stranger = await verifiedUser(api)
    await signIn(page, stranger)
    await page.goto(`/accept-invitation?token=${token}`)
    await page.getByRole('button', { name: 'Aceitar convite' }).click()
    await expect(page.getByText('Este convite é para outro e-mail.')).toBeVisible()
    await expect(page).toHaveURL(/\/accept-invitation/)
  })

  test('loads the invitation without an active brokerage', async ({ page, api }) => {
    const user = await verifiedUser(api, { terms: false })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/public/invitations/**', async (route) => {
      await gate
      await route.fulfill({
        status: 200,
        json: {
          organizationName: 'Convite Aberto',
          email: user.email,
          role: 'ADMIN',
          status: 'PENDING',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      })
    })
    await signIn(page, user)
    await page.goto('/accept-invitation?token=aguardando')
    await expect(page.getByText('Carregando o convite…')).toBeVisible()
    await expect(page).toHaveURL(/\/accept-invitation/)
    release()
    await expect(page.getByRole('heading', { name: 'Convite Aberto' })).toBeVisible()
    await expect(page).not.toHaveURL(/\/onboarding|\/terms-acceptance/)
  })
})
