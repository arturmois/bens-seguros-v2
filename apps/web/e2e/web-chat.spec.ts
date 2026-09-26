import { randomUUID } from 'node:crypto'
import { visitorTokenStorageKey, WEB_CHAT_NOTICE_VERSION } from '../src/features/web-chat/constants'
import { expect, onboard, TURNSTILE_TEST_TOKEN, test, verifiedUser } from './support'

const VALID_PHONE = '(11) 98765-4321'
const FIRST_MESSAGE = 'Olá, quero cotar um seguro auto.'
const FOLLOW_UP = 'Prefiro cobertura completa.'
const HUMAN_REPLY = 'Claro, posso ajudar com a cotação.'
const PRIOR_MESSAGE = 'Mensagem anterior à sessão do browser.'

// A minimal valid PNG (1×1). The server decides the type by its magic bytes.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function brandedOrg(
  api: Parameters<typeof onboard>[0],
  name = 'WebChat',
  options: { logo?: boolean } = {},
) {
  const org = await onboard(api, name)
  const branding = await api.patch('/api/v1/organization/branding', {
    data: { brandColor: '#0b5fff', greeting: 'Bem-vindo ao chat da corretora!' },
  })
  expect(branding.ok()).toBeTruthy()
  if (options.logo) {
    const logo = await api.put('/api/v1/organization/logo', {
      data: { image: PNG.toString('base64') },
    })
    expect(logo.ok()).toBeTruthy()
  }
  return org
}

async function startVisitorChat(
  page: import('@playwright/test').Page,
  publicChatKey: string,
  text = FIRST_MESSAGE,
) {
  await page.goto(`/c/${publicChatKey}`)
  await expect(page.getByTestId('web-chat-start')).toBeVisible()
  await page.getByLabel('Telefone').fill(VALID_PHONE)
  await page.getByLabel('Mensagem').fill(text)
  await page.getByTestId('web-chat-notice').check()
  await page.getByRole('button', { name: 'Iniciar conversa' }).click()
  await expect(page.getByTestId('web-chat-thread')).toBeVisible()
  await expect(page.getByTestId('web-chat-message').filter({ hasText: text })).toBeVisible()
}

test.describe('web chat', () => {
  test('shows the brokerage on the public link', async ({ page, api }) => {
    await verifiedUser(api)
    const org = await brandedOrg(api, 'Marca Chat', { logo: true })

    await page.goto(`/c/${org.publicChatKey}`)

    await expect(page.getByTestId('web-chat-brand').getByText(org.name)).toBeVisible()
    await expect(page.getByText('Bem-vindo ao chat da corretora!')).toBeVisible()
    await expect(page.getByRole('img', { name: `Logo de ${org.name}` })).toBeVisible()
    await expect(page.getByTestId('web-chat-start')).toBeVisible()
  })

  test('shows an error for a bad or unknown link', async ({ page }) => {
    await page.goto('/c/not-a-valid-key!!')
    await expect(page.getByTestId('web-chat-error')).toBeVisible()
    await expect(page.getByText(/não é válido/i)).toBeVisible()
    await expect(page.getByLabel('Telefone')).toHaveCount(0)

    await page.goto(`/c/${'a'.repeat(32)}`)
    await expect(page.getByTestId('web-chat-error')).toBeVisible()
    await expect(page.getByText(/não existe|não está mais disponível/i)).toBeVisible()
    await expect(page.getByLabel('Telefone')).toHaveCount(0)
  })

  // C7 + C9 + C10. The public chat rate-limits POST /sessions to 5/IP/min and this file runs in
  // well under a minute, so the follow-up rides on this session instead of starting its own.
  test('starts a session and shows the first message; stores the visitor token for the socket; sends a follow-up message in the thread', async ({
    page,
    api,
  }) => {
    await verifiedUser(api)
    const org = await brandedOrg(api)
    let startToken = ''
    await page.route(`**/api/public/chat/${org.publicChatKey}/sessions`, async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as { token?: string }
      startToken = body.token ?? ''
      await route.fulfill({ response })
    })
    await startVisitorChat(page, org.publicChatKey)

    const stored = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      visitorTokenStorageKey(org.publicChatKey),
    )
    expect(startToken).toMatch(/^v1\./)
    expect(stored).toBe(startToken)

    await page.getByLabel('Mensagem').fill(FOLLOW_UP)
    await page.getByRole('button', { name: 'Enviar' }).click()
    await expect(page.getByTestId('web-chat-message').filter({ hasText: FOLLOW_UP })).toBeVisible()
  })

  test('requires accepting the notice', async ({ page, api }) => {
    await verifiedUser(api)
    const org = await brandedOrg(api)
    await page.goto(`/c/${org.publicChatKey}`)
    await expect(page.getByTestId('web-chat-start')).toBeVisible()

    let sessions = 0
    await page.route(`**/api/public/chat/${org.publicChatKey}/sessions`, async (route) => {
      sessions += 1
      await route.continue()
    })

    await page.getByLabel('Telefone').fill(VALID_PHONE)
    await page.getByLabel('Mensagem').fill(FIRST_MESSAGE)
    await page.getByRole('button', { name: 'Iniciar conversa' }).click()

    await expect(page.getByTestId('web-chat-notice-error')).toBeVisible()
    expect(sessions).toBe(0)
  })

  // C12 + C13 + C15: prior seq below fromSeq, human leg, resync refetch.
  test('shows a human reply in under two seconds; reloads messages after events resync', async ({
    page,
    api,
  }) => {
    await verifiedUser(api)
    const org = await brandedOrg(api)

    const prior = await api.post(`/api/public/chat/${org.publicChatKey}/sessions`, {
      data: {
        phone: VALID_PHONE,
        consent: true,
        noticeVersion: WEB_CHAT_NOTICE_VERSION,
        turnstileToken: TURNSTILE_TEST_TOKEN,
        clientMessageId: randomUUID(),
        text: PRIOR_MESSAGE,
      },
    })
    expect(prior.status()).toBe(201)

    await startVisitorChat(page, org.publicChatKey)
    await expect(
      page.getByTestId('web-chat-message').filter({ hasText: PRIOR_MESSAGE }),
    ).toHaveCount(0)

    const listed = await api.get('/api/v1/conversations')
    expect(listed.ok()).toBeTruthy()
    const conversationId = (await listed.json()).items[0].id as string
    const sent = await api.post(`/api/v1/conversations/${conversationId}/messages`, {
      data: { text: HUMAN_REPLY },
    })
    expect(sent.status()).toBe(201)
    await expect(page.getByTestId('web-chat-message').filter({ hasText: HUMAN_REPLY })).toBeVisible(
      { timeout: 2_000 },
    )

    let messageFetches = 0
    await page.route(`**/api/public/chat/${org.publicChatKey}/messages**`, async (route) => {
      if (route.request().method() === 'GET') messageFetches += 1
      await route.continue()
    })
    await expect
      .poll(async () => page.evaluate(() => Boolean(window.__bensVisitorSocket?.connected)))
      .toBe(true)
    const before = messageFetches
    await page.evaluate(() => window.dispatchEvent(new Event('bens:visitor-resync')))
    await expect.poll(() => messageFetches).toBeGreaterThan(before)
    await expect(
      page.getByTestId('web-chat-message').filter({ hasText: FIRST_MESSAGE }),
    ).toBeVisible()
    await expect(
      page.getByTestId('web-chat-message').filter({ hasText: PRIOR_MESSAGE }),
    ).toHaveCount(0)
  })

  test('shows loading and error for the public chat', async ({ page, api }) => {
    await verifiedUser(api)
    const org = await brandedOrg(api)

    await page.route(`**/api/public/chat/${org.publicChatKey}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Falha simulada.' } }),
      })
    })

    await page.goto(`/c/${org.publicChatKey}`)
    await expect(page.getByTestId('web-chat-loading')).toBeVisible()
    await expect(page.getByTestId('web-chat-error')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  })

  test('reconnects the visitor socket after reload', async ({ page, api }) => {
    await verifiedUser(api)
    const org = await brandedOrg(api)
    await startVisitorChat(page, org.publicChatKey)

    let starts = 0
    let sessionGets = 0
    await page.route(`**/api/public/chat/${org.publicChatKey}/sessions`, async (route) => {
      if (route.request().method() === 'POST') starts += 1
      await route.continue()
    })
    await page.route(`**/api/public/chat/${org.publicChatKey}/session`, async (route) => {
      if (route.request().method() === 'GET') sessionGets += 1
      await route.continue()
    })

    // Force the cookie path (GET /session), not sessionStorage alone (door 2).
    await page.evaluate(
      (key) => sessionStorage.removeItem(key),
      visitorTokenStorageKey(org.publicChatKey),
    )
    await page.reload()
    await expect(page.getByTestId('web-chat-thread')).toBeVisible()
    await expect(
      page.getByTestId('web-chat-message').filter({ hasText: FIRST_MESSAGE }),
    ).toBeVisible()
    expect(starts).toBe(0)
    expect(sessionGets).toBeGreaterThan(0)

    await expect
      .poll(async () => page.evaluate(() => Boolean(window.__bensVisitorSocket?.connected)))
      .toBe(true)
  })
})
