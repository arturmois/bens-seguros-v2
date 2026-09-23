import { emailLink, expect, inbox, NAME, PASSWORD, signUp, test, uniqueEmail } from './support'

test.describe('cadastro e verificação', () => {
  test('registers and asks to confirm the e-mail', async ({ page, api: _api }) => {
    const email = uniqueEmail()
    await page.goto('/register')

    await page.getByLabel('Nome').fill(NAME)
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(PASSWORD)
    const signUp = page.waitForRequest('**/api/auth/sign-up/email')
    await page.getByRole('button', { name: 'Criar conta' }).click()

    expect((await signUp).postDataJSON()).toMatchObject({ email, callbackURL: '/login' })
    await expect(page).toHaveURL(`/verify-email?email=${encodeURIComponent(email)}`)
    await expect(page.getByText(`Enviamos um link de confirmação para ${email}.`)).toBeVisible()
    await expect
      .poll(async () => (await inbox(email)).map((m) => m.Subject))
      .toEqual(['Confirme seu e-mail'])
  })

  test('validates the form before calling the api', async ({ page, api: _api }) => {
    const calls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/sign-up/email')) calls.push(request.url())
    })
    await page.goto('/register')

    await page.getByLabel('E-mail').fill('invalido')
    await page.getByLabel('Senha').fill('1234567')
    await page.getByRole('button', { name: 'Criar conta' }).click()

    await expect(page.getByText('Informe seu nome.')).toBeVisible()
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible()
    await expect(page.getByText('A senha precisa ter pelo menos 8 caracteres.')).toBeVisible()
    expect(calls).toEqual([])
  })

  test('resends the verification e-mail', async ({ page, api }) => {
    const { email } = await signUp(api)
    await page.goto(`/verify-email?email=${encodeURIComponent(email)}`)

    const resend = page.waitForRequest('**/api/auth/send-verification-email')
    await page.getByRole('button', { name: 'Reenviar e-mail' }).click()
    expect((await resend).postDataJSON()).toMatchObject({ email, callbackURL: '/login' })
    await expect(page.getByText('E-mail reenviado.')).toBeVisible()

    await page.route('**/api/auth/send-verification-email', (route) =>
      route.fulfill({ status: 429, json: { message: 'Too many requests.' } }),
    )
    await page.getByRole('button', { name: 'Reenviar e-mail' }).click()
    await expect(
      page.getByText('Muitas tentativas. Aguarde alguns minutos e tente de novo.'),
    ).toBeVisible()
  })

  test('shows a generic message for an unknown error', async ({ page, api: _api }) => {
    await page.route('**/api/auth/sign-up/email', (route) =>
      route.fulfill({ status: 500, json: { message: 'Internal Server Error' } }),
    )
    await page.goto('/register')

    await page.getByLabel('Nome').fill(NAME)
    await page.getByLabel('E-mail').fill(uniqueEmail())
    await page.getByLabel('Senha').fill(PASSWORD)
    await page.getByRole('button', { name: 'Criar conta' }).click()

    await expect(page.getByText('Não foi possível concluir. Tente de novo.')).toBeVisible()
    await expect(page).toHaveURL('/register')
  })

  test('the e-mail link signs in', async ({ page, api }) => {
    const { email } = await signUp(api)

    await page.goto(await emailLink(email, 'Confirme seu e-mail'))

    await expect(page).toHaveURL(/\/terms-acceptance/)
    await page.getByRole('button', { name: 'Li e aceito' }).click()
    await expect(page).toHaveURL('/onboarding')
    await expect(page.getByRole('heading', { name: 'Criar corretora' })).toBeVisible()
    await expect(page.getByLabel('Nome')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Criar corretora' })).toBeVisible()
  })

  test('an invalid e-mail link lands on login', async ({ page, api: _api }) => {
    await page.goto('/api/auth/verify-email?token=invalido&callbackURL=%2Flogin')

    await expect(page).toHaveURL(/\/login\?error=/)
    await expect(
      page.getByText('Link inválido ou expirado. Faça login para receber outro.'),
    ).toBeVisible()
  })
})
