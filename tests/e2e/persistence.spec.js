import { expect, test } from '@playwright/test'
import { drawCard, gameState, openMenuItem, selectGame } from './helpers.js'

test('a game in progress is picked up again after a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)

  await selectGame(page, 4242)
  await drawCard(page)
  await drawCard(page)
  const before = await gameState(page)
  expect(before.gameNumber).toBe(4242)

  await page.reload()
  await expect(page.locator('.card')).toHaveCount(52)

  const after = await gameState(page)
  expect(after.gameNumber).toBe(4242)
  expect(after.waste).toEqual(before.waste)
  expect(after.stock).toBe(before.stock)
  expect(after.tableau).toEqual(before.tableau)
})

test('abandoning a game counts it as a loss in the statistics', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)

  await drawCard(page)
  await page.keyboard.press('F2')
  await page.waitForTimeout(200)

  await openMenuItem(page, 'Game', 'Statistics…')
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toContainText('Games played')
  await expect(dialog.locator('tr', { hasText: 'Games played' })).toContainText('1')
  await expect(dialog.locator('tr', { hasText: 'Games won' })).toContainText('0')
})

test('a corrupt save is discarded rather than breaking the game', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)

  await page.evaluate(() => {
    localStorage.setItem('solexe.game', '{"version":1,"tableau":"nonsense"}')
  })
  await page.reload()

  await expect(page.locator('.card')).toHaveCount(52)
  const state = await gameState(page)
  expect(state.tableau.map((column) => column.length)).toEqual([1, 2, 3, 4, 5, 6, 7])
})
