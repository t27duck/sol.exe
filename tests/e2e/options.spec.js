import { expect, test } from '@playwright/test'
import { drawCard, gameState, openMenuItem } from './helpers.js'

/**
 * Ticks or clears controls in the Options dialog and accepts it, agreeing to the new deal if
 * the change is one that needs one and a game is already under way.
 */
async function setOptions(page, changes) {
  await openMenuItem(page, 'Game', 'Options…')
  for (const [label, value] of Object.entries(changes)) {
    const control = page.getByLabel(label, { exact: true })
    if (value) await control.check()
    else await control.uncheck()
  }
  await page.getByRole('button', { name: 'OK' }).click()

  const confirm = page.getByRole('button', { name: 'Start new game' })
  await page.waitForTimeout(100)
  if (await confirm.count()) await confirm.click()
  await page.waitForTimeout(250)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)
})

test('draw three turns three cards and fans them', async ({ page }) => {
  await drawCard(page)
  await setOptions(page, { 'Draw three': true })

  expect((await gameState(page)).drawCount).toBe(3)

  await drawCard(page)
  const state = await gameState(page)
  expect(state.waste).toHaveLength(3)

  // Let the three cards finish sliding across before measuring where they landed.
  await page.waitForTimeout(300)
  const positions = await page
    .locator('.card[data-pile="waste"]')
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().x)))
  expect(new Set(positions).size).toBe(3)
})

test('vegas scoring stakes 52 dollars up front', async ({ page }) => {
  await setOptions(page, { Vegas: true })
  expect((await gameState(page)).score).toBe(-52)
  await expect(page.locator('#status-score')).toHaveText('Score: $-52')
})

test('a timed game shows and runs a clock', async ({ page }) => {
  await setOptions(page, { 'Timed game': true })
  await expect(page.locator('#status-time')).toHaveText('Time: 0:00')

  await drawCard(page)
  await expect(page.locator('#status-time')).not.toHaveText('Time: 0:00', { timeout: 3000 })
})

test('the status bar can be turned off', async ({ page }) => {
  await expect(page.locator('#statusbar')).toBeVisible()
  await setOptions(page, { 'Status bar': false })
  await expect(page.locator('#statusbar')).toBeHidden()
})

test('options and the chosen deck survive a reload', async ({ page }) => {
  await setOptions(page, { 'Draw three': true, Vegas: true })

  await openMenuItem(page, 'Game', 'Deck…')
  await page.getByRole('radio', { name: 'Robot' }).click()
  await page.getByRole('button', { name: 'OK' }).click()

  const backBefore = await page.locator('#board').evaluate((node) =>
    getComputedStyle(node).getPropertyValue('--card-back'),
  )
  expect(backBefore).toContain('robot')

  await page.reload()
  await expect(page.locator('.card')).toHaveCount(52)

  expect((await gameState(page)).drawCount).toBe(3)
  await expect(page.locator('#status-score')).toContainText('$')
  const backAfter = await page.locator('#board').evaluate((node) =>
    getComputedStyle(node).getPropertyValue('--card-back'),
  )
  expect(backAfter).toBe(backBefore)
})
