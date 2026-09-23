import type { Page } from '@playwright/test'
import { expect, NAME, onboard, signUp, test, verifiedUser } from './support'

async function signIn(page: Page, email: string, password: string, path = '/login') {
  await page.goto(path)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

const rateLimited = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'

test.describe('login, logout e guard', () => {
  test('signs in to the redirect target', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api)

    await signIn(page, user.email, user.password, '/login?redirect=%2Fsettings%2Fsecurity')
    await expect(page).toHaveURL('/settings/security')

    await page.context().clearCookies()
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL('/dashboard')
  })

  test('ignores an external redirect', async ({ page, api, baseURL }) => {
    const user = await verifiedUser(api)
    await onboard(api)

    for (const target of [
      'https://evil.example',
      '//evil.example',
      'dashboard',
      '/\\evil.example',
    ]) {
      await page.context().clearCookies()
      await signIn(page, user.email, user.password, `/login?redirect=${encodeURIComponent(target)}`)
      await expect(page, target).toHaveURL(`${baseURL}/dashboard`)
    }
  })

  test('shows wrong credentials', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api)

    await signIn(page, user.email, 'senha-errada-000')

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
    await expect(page.getByLabel('E-mail')).toHaveValue(user.email)
  })

  test('asks to confirm the e-mail', async ({ page, api }) => {
    const user = await signUp(api)

    await signIn(page, user.email, user.password)

    await expect(page.getByText('Confirme seu e-mail para entrar.')).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Reenviar o e-mail de confirmação' }),
    ).toHaveAttribute('href', `/verify-email?email=${encodeURIComponent(user.email)}`)
  })

  test('shows the rate limit message', async ({ page, api: _api }) => {
    await page.route('**/api/auth/sign-in/email', (route) =>
      route.fulfill({ status: 429, json: { message: 'Too many requests.' } }),
    )

    await signIn(page, 'alguem@example.com', 'qualquer-senha')

    await expect(page.getByText(rateLimited)).toBeVisible()
  })

  test('guards app routes', async ({ page, api: _api }) => {
    await page.goto('/dashboard')

    await expect(page).toHaveURL('/login?redirect=%2Fdashboard')
    await expect(page.getByText('Olá,')).toHaveCount(0)
  })

  test('sends a signed-in user away from auth pages', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api)
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL('/dashboard')

    await page.goto('/login')
    await expect(page).toHaveURL('/dashboard')
    await page.goto('/register')
    await expect(page).toHaveURL('/dashboard')
  })

  test('signs out', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api)
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL('/dashboard')

    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL('/login')

    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login?redirect=%2Fdashboard')
  })

  test('sign-out clears the cached account', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api)
    await signIn(page, user.email, user.password)
    await expect(page.getByRole('heading', { name: `Olá, ${NAME}` })).toBeVisible()

    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL('/login')
    // Back in the history: the SPA navigates without reloading, so only a cleared cache sends the
    // guard to the server again.
    await page.goBack()

    await expect(page).toHaveURL('/login?redirect=%2Fdashboard')
    await expect(page.getByText('Olá,')).toHaveCount(0)
  })

  test('redirects on the first 401 without rendering the page', async ({ page, api: _api }) => {
    await page.addInitScript(() => {
      const seen = { greeting: false }
      Object.assign(window, { __seen: seen })
      new MutationObserver(() => {
        if (document.body?.innerText.includes('Olá,')) seen.greeting = true
      }).observe(document, { childList: true, subtree: true, characterData: true })
    })
    const meRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/v1/me') meRequests.push(request.url())
    })

    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login?redirect=%2Fdashboard')
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()

    // One from the _app guard, one from the /login guard; a retried 401 would add more.
    expect(meRequests).toHaveLength(2)
    expect(await page.evaluate(() => Reflect.get(window, '__seen').greeting)).toBe(false)
  })

  test('disables the button while signing in', async ({ page, api: _api }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/auth/sign-in/email', async (route) => {
      await held
      await route.fulfill({
        status: 401,
        json: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
      })
    })
    await page.goto('/login')
    await page.getByLabel('E-mail').fill('alguem@example.com')
    await page.getByLabel('Senha').fill('qualquer-senha')

    await page.getByRole('button', { name: 'Entrar' }).click()

    const waiting = page.getByRole('button', { name: 'Aguarde…' })
    await expect(waiting).toBeVisible()
    await expect(waiting).toBeDisabled()
    release()
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
  })

  test('shows loading and error states for the account', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await onboard(api)
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL('/dashboard')
    // One handler for the whole test (re-routing mid-test races in Playwright): the mode decides.
    let mode: 'slow' | 'failing' | 'normal' = 'slow'
    await page.route('**/api/v1/me', async (route) => {
      if (mode === 'failing') {
        await route.fulfill({
          status: 500,
          json: { error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } },
        })
        return
      }
      if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })

    await page.goto('/dashboard')
    await expect(page.getByText('Carregando sua conta…')).toBeVisible()
    await expect(page.getByRole('heading', { name: `Olá, ${NAME}` })).toBeVisible()

    mode = 'failing'
    await page.goto('/dashboard')
    await expect(page.getByText('Não foi possível carregar sua conta.')).toBeVisible({
      timeout: 15_000,
    })

    mode = 'normal'
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByRole('heading', { name: `Olá, ${NAME}` })).toBeVisible()
  })
})
