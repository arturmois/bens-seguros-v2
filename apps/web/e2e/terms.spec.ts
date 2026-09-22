import { expect, test, verifiedUser } from './support'

test.describe('terms', () => {
  test('sends a pending user to terms acceptance', async ({ page, api }) => {
    const user = await verifiedUser(api, { terms: false })
    await page.goto('/login')
    await page.getByLabel('E-mail').fill(user.email)
    await page.getByLabel('Senha').fill(user.password)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL(/\/terms-acceptance\?redirect=.*dashboard/)
  })

  test('accepts and follows the redirect', async ({ page, api }) => {
    const directed = await verifiedUser(api, { terms: false })
    await page.goto('/login')
    await page.getByLabel('E-mail').fill(directed.email)
    await page.getByLabel('Senha').fill(directed.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/terms-acceptance/)
    await page.goto('/terms-acceptance?redirect=%2Fsettings%2Fsecurity')
    await page.getByRole('button', { name: 'Li e aceito' }).click()
    await expect(page).toHaveURL('/settings/security')

    const plain = await verifiedUser(api, { terms: false })
    await page.context().clearCookies()
    await page.goto('/login')
    await page.getByLabel('E-mail').fill(plain.email)
    await page.getByLabel('Senha').fill(plain.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/terms-acceptance/)
    await page.goto('/terms-acceptance')
    await page.getByRole('button', { name: 'Li e aceito' }).click()
    await expect(page).toHaveURL('/dashboard')
  })

  test('reloads terms when the version changed', async ({ page, api }) => {
    const user = await verifiedUser(api, { terms: false })
    let phase: 'real' | 'mismatch' | 'accepted' = 'real'
    await page.route('**/api/v1/me', async (route) => {
      if (phase === 'real' || route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      const body = await response.json()
      body.terms = {
        pending: phase !== 'accepted',
        termsVersion: '2.0',
        privacyVersion: '2.0',
      }
      await route.fulfill({ json: body })
    })
    await page.route('**/api/v1/me/terms-acceptance', async (route) => {
      const body = route.request().postDataJSON() as {
        termsVersion: string
        privacyVersion: string
      }
      if (phase === 'real') {
        phase = 'mismatch'
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'TERMS_VERSION_MISMATCH',
              message: 'Os termos foram atualizados. Recarregue a página para ver a versão atual.',
            },
          },
        })
      }
      expect(body).toEqual({ termsVersion: '2.0', privacyVersion: '2.0' })
      phase = 'accepted'
      return route.fulfill({
        status: 200,
        json: { ...body, acceptedAt: '2026-09-22T12:00:00.000Z' },
      })
    })

    await page.goto('/login')
    await page.getByLabel('E-mail').fill(user.email)
    await page.getByLabel('Senha').fill(user.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByRole('button', { name: 'Li e aceito' }).click()
    await expect(
      page.getByText('Os termos foram atualizados. Recarregue a página para ver a versão atual.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Li e aceito' }).click()
    await expect(page).toHaveURL('/dashboard')
  })

  test('links the two documents in a new tab', async ({ page, api }) => {
    const user = await verifiedUser(api, { terms: false })
    await page.goto('/login')
    await page.getByLabel('E-mail').fill(user.email)
    await page.getByLabel('Senha').fill(user.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/terms-acceptance/)

    await expect(page.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute(
      'target',
      '_blank',
    )
    await expect(page.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute(
      'href',
      '/terms',
    )
    await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
      'target',
      '_blank',
    )
    await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  test('shows the public documents', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'Termos de Uso' })).toBeVisible()
    await expect(page.getByText('Versão 1.0')).toBeVisible()
    await expect(page.getByText('Ao criar uma conta ou utilizar o Bens Seguros')).toBeVisible()

    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: 'Política de Privacidade' })).toBeVisible()
    await expect(page.getByText('Versão 1.0')).toBeVisible()
    await expect(page.getByText('Lei Geral de Proteção de Dados Pessoais')).toBeVisible()
  })

  test('disables the button while accepting', async ({ page, api }) => {
    const user = await verifiedUser(api, { terms: false })
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/v1/me/terms-acceptance', async (route) => {
      await gate
      await route.continue()
    })
    await page.goto('/login')
    await page.getByLabel('E-mail').fill(user.email)
    await page.getByLabel('Senha').fill(user.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    const button = page.getByRole('button', { name: 'Li e aceito' })
    await button.click()
    await expect(page.getByRole('button', { name: 'Aguarde…' })).toBeDisabled()
    release()
    await expect(page).toHaveURL('/dashboard')
  })
})
