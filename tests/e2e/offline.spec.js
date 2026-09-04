import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test('installs a manifest and icons', async ({ page }) => {
  await page.goto('/')

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()
  if (!manifestHref) return

  const manifest = await page.request.get(new URL(manifestHref, page.url()).toString())
  expect(manifest.ok()).toBe(true)

  const body = await manifest.json()
  expect(body.name).toBe('SOL.EXE')
  expect(body.display).toBe('standalone')
  expect(body.icons.length).toBeGreaterThanOrEqual(2)

  for (const icon of body.icons) {
    const response = await page.request.get(new URL(icon.src, manifest.url()).toString())
    expect(response.ok(), `${icon.src} should be served`).toBe(true)
  }
})

test('keeps working with the network switched off', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)

  // Wait for the service worker to take control, which is when the assets are cached.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
    timeout: 15000,
  })

  await context.setOffline(true)
  await page.reload()

  await expect(page.locator('.card')).toHaveCount(52)
  // Face artwork has to come out of the cache too, not just the HTML.
  const loaded = await page
    .locator('.card__face')
    .first()
    .evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth > 0)
  expect(loaded).toBe(true)

  await context.setOffline(false)
})
