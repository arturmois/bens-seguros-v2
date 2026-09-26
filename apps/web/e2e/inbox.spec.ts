import type { Page } from '@playwright/test'
import { expect, onboard, signIn, test, verifiedUser } from './support'

const VALID_PHONE = '(11) 98765-4321'
const FIRST_MESSAGE = 'Mensagem do smoke do inbox.'
const HUMAN_REPLY = 'Claro, posso ajudar pela corretora.'

async function startVisitorChat(page: Page, publicChatKey: string, text = FIRST_MESSAGE) {
  await page.goto(`/c/${publicChatKey}`)
  await expect(page.getByTestId('web-chat-start')).toBeVisible()
  await page.getByLabel('Telefone').fill(VALID_PHONE)
  await page.getByLabel('Mensagem').fill(text)
  await page.getByTestId('web-chat-notice').check()
  await page.getByRole('button', { name: 'Iniciar conversa' }).click()
  await expect(page.getByTestId('web-chat-thread')).toBeVisible()
  await expect(page.getByTestId('web-chat-message').filter({ hasText: text })).toBeVisible()
}

test.describe('inbox', () => {
  test('links Inbox in the app nav', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const org = await onboard(api)
    await signIn(page, user)
    await expect(page.getByRole('banner').getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    )
    await page.getByRole('banner').getByRole('link', { name: 'Inbox' }).click()
    await expect(page).toHaveURL(/\/inbox/)
    await expect(page.getByTestId('inbox-page')).toBeVisible()
    await expect(page.getByText(org.name)).toBeVisible()
  })

  test('shows the inbox queue with four list states', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api)
    await signIn(page, user)

    await page.goto('/inbox')
    await expect(page.getByTestId('inbox-list-empty')).toBeVisible()

    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/v1/conversations?**', async (route) => {
      if (!route.request().url().includes('view=queue')) {
        await route.continue()
        return
      }
      await held
      await route.abort('failed')
    })
    const pending = page.goto('/inbox')
    await expect(page.getByTestId('inbox-list-loading')).toBeVisible()
    release?.()
    await pending
    await expect(page.getByTestId('inbox-list-error')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()

    await page.unroute('**/api/v1/conversations?**')
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByTestId('inbox-list-empty')).toBeVisible()
  })

  // C22–C28: one visitor session (public-chat rate-limits 5/IP/min).
  test('commercial replies and visitor sees it then close removes it from inbox views', async ({
    page,
    api,
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error('baseURL is required')
    const user = await verifiedUser(api)
    const org = await onboard(api)

    const visitorContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
    const visitorPage = await visitorContext.newPage()
    await startVisitorChat(visitorPage, org.publicChatKey)

    await signIn(page, user)
    await page.goto('/inbox?view=queue')
    await expect(page.getByTestId('inbox-list')).toBeVisible()
    await expect(page.getByTestId('inbox-conversation-row')).toBeVisible()
    await page.getByTestId('inbox-conversation-row').click()

    await expect(page.getByTestId('inbox-unverified-badge')).toHaveText('Telefone não verificado')
    await expect(page.getByTestId('inbox-take')).toBeVisible()
    await page.getByTestId('inbox-take').click()
    await expect(page.getByTestId('inbox-reply-input')).toBeVisible()
    await expect(page.getByTestId('inbox-message').filter({ hasText: FIRST_MESSAGE })).toBeVisible()

    await page.getByTestId('inbox-view-mine').click()
    await expect(page.getByTestId('inbox-conversation-row')).toHaveCount(1)
    await page.getByTestId('inbox-conversation-row').click()

    await page.getByTestId('inbox-reply-input').fill(HUMAN_REPLY)
    await page.getByTestId('inbox-send').click()
    await expect(page.getByTestId('inbox-message').filter({ hasText: HUMAN_REPLY })).toBeVisible()

    await expect(
      visitorPage.getByTestId('web-chat-message').filter({ hasText: HUMAN_REPLY }),
    ).toBeVisible({ timeout: 2_000 })

    await page.getByTestId('inbox-close').click()
    await expect(page.getByTestId('inbox-close-confirm')).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar' }).click()

    await page.goto('/inbox?view=queue')
    await expect(page.getByTestId('inbox-list-empty')).toBeVisible()
    await page.goto('/inbox?view=mine')
    await expect(page.getByTestId('inbox-list-empty')).toBeVisible()

    await visitorContext.close()
  })
})
