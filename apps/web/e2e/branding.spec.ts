import {
  acceptInvite,
  enterApp,
  expect,
  invite,
  onboard,
  signIn,
  test,
  uniqueEmail,
  verifiedUser,
} from './support'

// A minimal valid PNG (1×1). The server decides the type by its magic bytes.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')

test.describe('branding', () => {
  test('uploads and removes the logo', async ({ page, api }) => {
    const admin = await verifiedUser(api)
    const created = await onboard(api, 'Logo')
    await signIn(page, admin)
    await enterApp(page, created.name)
    await page.goto('/settings/organization')
    await expect(page.getByText('Nenhum logo enviado.')).toBeVisible()

    await page
      .getByLabel(/Enviar logo/)
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })

    await expect(page.getByText('Logo atualizado.')).toBeVisible()
    const preview = page.getByRole('img', { name: 'Logo da corretora' })
    await expect(preview).toBeVisible()
    await expect(preview).toHaveAttribute('src', /^\/api\/v1\/organization\/logo\?v=/)
    await expect(page.getByText('Nenhum logo enviado.')).toHaveCount(0)

    await page.getByRole('button', { name: 'Remover logo' }).click()

    await expect(page.getByText('Logo removido.')).toBeVisible()
    await expect(page.getByText('Nenhum logo enviado.')).toBeVisible()
    await expect(preview).toHaveCount(0)
  })

  test('shows the logo error from the server', async ({ page, api }) => {
    const admin = await verifiedUser(api)
    const created = await onboard(api, 'Svg')
    await signIn(page, admin)
    await enterApp(page, created.name)
    await page.goto('/settings/organization')

    await page
      .getByLabel(/Enviar logo/)
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: SVG })

    await expect(page.getByText('Envie uma imagem PNG, JPEG ou WebP.')).toBeVisible()
    await expect(page.getByText('Nenhum logo enviado.')).toBeVisible()
  })

  test('saves the brand color and greeting', async ({ page, api }) => {
    const admin = await verifiedUser(api)
    const created = await onboard(api, 'Cores')
    await signIn(page, admin)
    await enterApp(page, created.name)
    await page.goto('/settings/organization')

    await page.getByLabel('Cor').fill('#1A2B3C')
    await page.getByLabel('Saudação').fill('Olá! Como podemos ajudar?')
    await page.getByRole('button', { name: 'Atualizar identidade visual' }).click()

    await expect(page.getByText('Identidade visual atualizada.')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Cor')).toHaveValue('#1a2b3c')
    await expect(page.getByLabel('Saudação')).toHaveValue('Olá! Como podemos ajudar?')
  })

  test('shows branding read-only without organization:update', async ({ page, api, baseURL }) => {
    await verifiedUser(api)
    const created = await onboard(api, 'Leitura')
    const branding = await api.patch('/api/v1/organization/branding', {
      data: { brandColor: '#123456', greeting: 'Bem-vindo à corretora' },
    })
    expect(branding.ok()).toBeTruthy()
    const email = uniqueEmail('commercial')
    await invite(api, email, 'COMMERCIAL')
    const commercial = await acceptInvite(baseURL, email)
    await signIn(page, commercial)
    await enterApp(page, created.name)
    await page.goto('/settings/organization')

    await expect(page.getByText('Cor: #123456')).toBeVisible()
    await expect(page.getByText('Saudação: Bem-vindo à corretora')).toBeVisible()
    await expect(page.getByTestId('web-chat-link')).toHaveText(
      new RegExp(`/c/${created.publicChatKey}$`),
    )
    await expect(page.getByLabel('Cor')).toHaveCount(0)
    await expect(page.getByLabel('Saudação')).toHaveCount(0)
    await expect(page.getByLabel(/Enviar logo/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remover logo' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Atualizar identidade visual' })).toHaveCount(0)
  })
})
