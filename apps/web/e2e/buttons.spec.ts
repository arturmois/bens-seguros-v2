import { expect, test } from './support'

const cursorOf = (element: Element) => getComputedStyle(element).cursor

test.describe('cursor dos botões', () => {
  test('shows a pointer on every enabled button', async ({ page }) => {
    for (const path of ['/login', '/register']) {
      await page.goto(path)
      const buttons = page.locator('button:visible:not(:disabled)')
      await expect(buttons.first(), path).toBeVisible()
      const cursors = await buttons.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).cursor),
      )
      expect(cursors.length, path).toBeGreaterThan(0)
      expect(new Set(cursors), path).toEqual(new Set(['pointer']))
    }
  })

  test('keeps the default cursor on a disabled button', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      const button = document.createElement('button')
      button.id = 'disabled-probe'
      button.disabled = true
      button.textContent = 'Desabilitado'
      document.body.append(button)
    })

    await expect(page.locator('#disabled-probe')).toBeDisabled()
    expect(await page.locator('#disabled-probe').evaluate(cursorOf)).toBe('default')
  })
})
