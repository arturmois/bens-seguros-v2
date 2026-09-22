import { expect, NAME, PASSWORD, test, uniqueEmail } from './support'

const openConfig = { signupMode: 'self_serve', turnstileSiteKey: null }

test.describe('signup gates', () => {
  test('shows that signup is closed', async ({ page }) => {
    await page.route('**/api/public/signup-config', (route) =>
      route.fulfill({ json: { signupMode: 'closed', turnstileSiteKey: null } }),
    )
    await page.goto('/register')

    await expect(
      page.getByText('O cadastro está fechado. Peça um convite à sua corretora.'),
    ).toBeVisible()
    await expect(page.getByLabel('Senha')).toHaveCount(0)
  })

  test('shows the disposable e-mail message', async ({ page }) => {
    await page.route('**/api/public/signup-config', (route) => route.fulfill({ json: openConfig }))
    await page.route('**/api/auth/sign-up/email', (route) =>
      route.fulfill({
        status: 403,
        json: {
          code: 'EMAIL_DOMAIN_NOT_ALLOWED',
          message: 'Disposable e-mail addresses are not allowed.',
        },
      }),
    )
    await page.goto('/register')
    await page.getByLabel('Nome').fill(NAME)
    await page.getByLabel('E-mail').fill('pessoa@mailinator.com')
    await page.getByLabel('Senha').fill(PASSWORD)
    await page.getByRole('button', { name: 'Criar conta' }).click()

    await expect(
      page.getByText(
        'E-mails descartáveis não são permitidos. Use um e-mail pessoal ou corporativo.',
      ),
    ).toBeVisible()
  })

  test('requires the turnstile token', async ({ page }) => {
    await page.route('**/api/public/signup-config', (route) =>
      route.fulfill({
        json: { signupMode: 'self_serve', turnstileSiteKey: '1x00000000000000000000AA' },
      }),
    )
    await page.route('**/turnstile/v0/api.js**', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.turnstile = {
            render(container, params) {
              container.dataset.turnstile = 'widget'
              container.textContent = 'Turnstile'
              window.__turnstileParams = params
              return 'widget-e2e'
            },
            reset() {},
            remove() {},
            getResponse() { return undefined },
            isExpired() { return false },
          }
          window.onloadTurnstileCallback?.()
        `,
      }),
    )
    await page.goto('/register')
    const submit = page.getByRole('button', { name: 'Criar conta' })
    await expect(page.locator('[data-turnstile="widget"]')).toBeVisible()
    await expect(submit).toBeDisabled()
    await page.evaluate(() => {
      const holder = window as Window & {
        __turnstileParams?: { callback: (token: string) => void }
      }
      holder.__turnstileParams?.callback('token-e2e')
    })
    await expect(submit).toBeEnabled()

    await page.getByLabel('Nome').fill(NAME)
    await page.getByLabel('E-mail').fill(uniqueEmail())
    await page.getByLabel('Senha').fill(PASSWORD)
    const signUp = page.waitForRequest('**/api/auth/sign-up/email')
    await submit.click()
    expect((await signUp).headers()['x-captcha-response']).toBe('token-e2e')
  })

  test('shows the captcha failure and resets the widget', async ({ page }) => {
    await page.route('**/api/public/signup-config', (route) =>
      route.fulfill({
        json: { signupMode: 'self_serve', turnstileSiteKey: '1x00000000000000000000AA' },
      }),
    )
    await page.route('**/turnstile/v0/api.js**', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.turnstile = {
            render(container, params) {
              container.dataset.turnstile = 'widget'
              container.textContent = 'Turnstile'
              setTimeout(() => params.callback('token-e2e'), 30)
              return 'widget-e2e'
            },
            reset(id) {
              document.querySelector('[data-turnstile="widget"]').dataset.turnstile = 'reset'
            },
            remove() {},
            getResponse() { return undefined },
            isExpired() { return true },
          }
          window.onloadTurnstileCallback?.()
        `,
      }),
    )
    await page.route('**/api/auth/sign-up/email', (route) =>
      route.fulfill({
        status: 403,
        json: { code: 'VERIFICATION_FAILED', message: 'Captcha verification failed' },
      }),
    )
    await page.goto('/register')
    const submit = page.getByRole('button', { name: 'Criar conta' })
    await expect(submit).toBeEnabled()
    await page.getByLabel('Nome').fill(NAME)
    await page.getByLabel('E-mail').fill(uniqueEmail())
    await page.getByLabel('Senha').fill(PASSWORD)
    await submit.click()

    await expect(
      page.getByText('Não foi possível confirmar que você não é um robô. Tente de novo.'),
    ).toBeVisible()
    await expect(submit).toBeDisabled()
    await expect(page.locator('[data-turnstile="reset"]')).toBeVisible()
  })

  test('shows loading and error for signup config', async ({ page }) => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/public/signup-config', async (route) => {
      await gate
      await route.fulfill({
        status: 500,
        json: { error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } },
      })
    })
    await page.goto('/register')
    await expect(page.getByText('Carregando o cadastro…')).toBeVisible()
    release()
    await expect(page.getByText('Não foi possível carregar o cadastro.')).toBeVisible()

    await page.unroute('**/api/public/signup-config')
    await page.route('**/api/public/signup-config', (route) => route.fulfill({ json: openConfig }))
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByLabel('Senha')).toBeVisible()
  })
})
