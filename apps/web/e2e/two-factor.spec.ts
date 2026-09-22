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

    await expect(page.getByLabel('QR code do autenticador')).toBeVisible()
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
})
