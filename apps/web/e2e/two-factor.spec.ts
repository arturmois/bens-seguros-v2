import type { Page } from '@playwright/test'
import { expect, NAME, test, totp, userWithTwoFactor, verifiedUser } from './support'

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

async function twoFactorEnabled(page: Page) {
  const me = await page.request.get('/api/v1/me')
  return (await me.json()).twoFactorEnabled
}

test.describe('verificação em duas etapas', () => {
  test('shows the qr code, the key and the backup codes', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL('/dashboard')
    await page.goto('/settings/security')

    await page.getByLabel('Senha atual').fill(user.password)
    await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click()

    const qrCode = page.getByLabel('QR code do autenticador')
    await expect(qrCode).toBeVisible()
    expect(await qrCode.evaluate((element) => element.tagName.toLowerCase())).toBe('svg')
    await expect(page.getByTestId('totp-secret')).toHaveText(/^[A-Z2-7]+=*$/)
    await expect(page.getByTestId('backup-codes').locator('li')).not.toHaveCount(0)
    await expect(page.getByLabel('Código de 6 dígitos')).toBeVisible()
  })

  test('enables two-factor with a valid code', async ({ page, api }) => {
    const user = await verifiedUser(api)
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL('/dashboard')
    await page.goto('/settings/security')
    await page.getByLabel('Senha atual').fill(user.password)
    await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click()
    const secret = await page.getByTestId('totp-secret').innerText()

    await page.getByLabel('Código de 6 dígitos').fill(totp(secret))
    await page.getByRole('button', { name: 'Confirmar' }).click()

    await expect(page.getByText('Verificação em duas etapas ativada.')).toBeVisible()
    expect(await twoFactorEnabled(page)).toBe(true)
  })

  test('asks for the code at sign-in', async ({ page, api }) => {
    const user = await userWithTwoFactor(api)

    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL(/\/two-factor/)

    const wrong = totp(user.secret) === '000000' ? '111111' : '000000'
    await page.getByLabel('Código').fill(wrong)
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page.getByText('Código inválido.')).toBeVisible()

    await page.getByLabel('Código').fill(totp(user.secret))
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('heading', { name: `Olá, ${NAME}` })).toBeVisible()
  })

  test('accepts a backup code', async ({ page, api }) => {
    const user = await userWithTwoFactor(api)

    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL(/\/two-factor/)
    await page.getByRole('button', { name: 'Usar código de backup' }).click()
    await page.getByLabel('Código de backup').fill(user.backupCodes[0] ?? '')
    await page.getByRole('button', { name: 'Verificar' }).click()

    await expect(page).toHaveURL('/dashboard')
  })

  test('disables two-factor', async ({ page, api }) => {
    const user = await userWithTwoFactor(api)
    await signIn(page, user.email, user.password)
    await page.getByLabel('Código').fill(totp(user.secret))
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page).toHaveURL('/dashboard')
    await page.goto('/settings/security')

    await page.getByLabel('Senha atual').fill(user.password)
    await page.getByRole('button', { name: 'Desativar' }).click()

    await expect(page.getByText('Verificação em duas etapas desativada.')).toBeVisible()
    expect(await twoFactorEnabled(page)).toBe(false)
  })

  test('keeps the redirect through the second factor', async ({ page, api }) => {
    const user = await userWithTwoFactor(api)
    await page.goto('/login?redirect=%2Fsettings%2Fsecurity')
    await page.getByLabel('E-mail').fill(user.email)
    await page.getByLabel('Senha').fill(user.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/two-factor/)

    await page.getByLabel('Código').fill(totp(user.secret))
    await page.getByRole('button', { name: 'Verificar' }).click()

    await expect(page).toHaveURL('/settings/security')
  })

  test('shows each two-factor error', async ({ page, api }) => {
    // Wrong backup code at sign-in.
    const withTotp = await userWithTwoFactor(api)
    await signIn(page, withTotp.email, withTotp.password)
    await expect(page).toHaveURL(/\/two-factor/)
    await page.getByRole('button', { name: 'Usar código de backup' }).click()
    await page.getByLabel('Código de backup').fill('codigo-errado')
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page.getByText('Código inválido.')).toBeVisible()

    // Locked account (Better Auth locks after repeated wrong codes), simulated.
    await page.route('**/api/auth/two-factor/verify-backup-code', (route) =>
      route.fulfill({
        status: 400,
        json: { code: 'ACCOUNT_TEMPORARILY_LOCKED', message: 'Too many failed attempts.' },
      }),
    )
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(
      page.getByText('Muitas tentativas. Aguarde alguns minutos e tente de novo.'),
    ).toBeVisible()

    // Wrong password to disable.
    await page.getByRole('button', { name: 'Usar o aplicativo autenticador' }).click()
    await page.getByLabel('Código').fill(totp(withTotp.secret))
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page).toHaveURL('/dashboard')
    await page.goto('/settings/security')
    await page.getByLabel('Senha atual').fill('senha-errada-000')
    await page.getByRole('button', { name: 'Desativar' }).click()
    await expect(page.getByText('Senha incorreta.')).toBeVisible()
    expect(await twoFactorEnabled(page)).toBe(true)

    // Wrong password to enable, then a wrong confirmation code.
    await page.context().clearCookies()
    const plain = await verifiedUser(api)
    await signIn(page, plain.email, plain.password)
    await expect(page).toHaveURL('/dashboard')
    await page.goto('/settings/security')
    await page.getByLabel('Senha atual').fill('senha-errada-000')
    await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click()
    await expect(page.getByText('Senha incorreta.')).toBeVisible()

    await page.getByLabel('Senha atual').fill(plain.password)
    await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click()
    const secret = await page.getByTestId('totp-secret').innerText()
    const wrong = totp(secret) === '000000' ? '111111' : '000000'
    await page.getByLabel('Código de 6 dígitos').fill(wrong)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByText('Código inválido.')).toBeVisible()
    expect(await twoFactorEnabled(page)).toBe(false)
  })
})
