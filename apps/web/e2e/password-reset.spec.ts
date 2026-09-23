import { emailLink, expect, inbox, NAME, onboard, test, uniqueEmail, verifiedUser } from './support'

const sent = 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.'
const NEW_PASSWORD = 'nova-senha-789'

test.describe('recuperação de senha', () => {
  test('requests a reset without revealing the account', async ({ page, api }) => {
    const user = await verifiedUser(api)
    const stranger = uniqueEmail('ninguem')

    for (const email of [user.email, stranger]) {
      await page.goto('/forgot-password')
      await page.getByLabel('E-mail').fill(email)
      await page.getByRole('button', { name: 'Enviar link' }).click()
      await expect(page.getByText(sent), email).toBeVisible()
    }

    await emailLink(user.email, 'Redefina sua senha')
    expect(await inbox(stranger)).toEqual([])
  })

  test('resets the password from the e-mail link', async ({ page, api }) => {
    const user = await verifiedUser(api)
    // With a brokerage, signing in lands on the dashboard (org-web door 3).
    await onboard(api)
    await page.goto('/forgot-password')
    await page.getByLabel('E-mail').fill(user.email)
    await page.getByRole('button', { name: 'Enviar link' }).click()
    await expect(page.getByText(sent)).toBeVisible()

    await page.goto(await emailLink(user.email, 'Redefina sua senha'))
    await expect(page).toHaveURL(/\/reset-password\?token=/)
    await page.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirme a nova senha').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Redefinir senha' }).click()

    await expect(page).toHaveURL('/login?reset=true')
    await expect(page.getByText('Senha redefinida. Entre com a nova senha.')).toBeVisible()
    await page.getByLabel('E-mail').fill(user.email)
    await page.getByLabel('Senha').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('heading', { name: `Olá, ${NAME}` })).toBeVisible()
  })

  test('rejects an invalid reset link', async ({ page, api: _api }) => {
    await page.goto('/reset-password?error=INVALID_TOKEN')
    await expect(page.getByText('Link inválido ou expirado.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Pedir um novo link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )

    await page.goto('/reset-password?token=token-invalido')
    await page.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirme a nova senha').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Redefinir senha' }).click()
    await expect(page.getByText('Link inválido ou expirado.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Pedir um novo link' })).toBeVisible()
  })

  test('checks the confirmation before calling the api', async ({ page, api: _api }) => {
    const calls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/reset-password')) calls.push(request.url())
    })
    await page.goto('/reset-password?token=qualquer')

    await page.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirme a nova senha').fill('outra-senha-000')
    await page.getByRole('button', { name: 'Redefinir senha' }).click()

    await expect(page.getByText('As senhas não conferem.')).toBeVisible()
    expect(calls).toEqual([])
  })
})
