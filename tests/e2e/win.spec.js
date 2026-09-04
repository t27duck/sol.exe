import { expect, test } from '@playwright/test'
import { gameState, openMenuItem } from './helpers.js'

/**
 * Puts the board one card away from home, with nothing face down, which is the position the
 * original started finishing the game for you from.
 */
async function nearlyWon(page) {
  await page.evaluate(() => {
    const { state, refresh } = globalThis.solitaire
    const cards = new Map(
      [...state.stock, ...state.waste, ...state.foundations.flat(), ...state.tableau.flat()].map(
        (card) => [card.id, card],
      ),
    )
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

    state.stock = []
    state.waste = []
    state.tableau = [[], [], [], [], [], [], []]
    state.foundations = ['S', 'H', 'C', 'D'].map((suit) =>
      ranks.map((rank) => {
        const card = /** @type {import('../../src/engine/deck.js').Card} */ (
          cards.get(rank + suit)
        )
        card.faceUp = true
        return card
      }),
    )

    // Hold the last card back so the game still has a move left to make.
    const last = /** @type {import('../../src/engine/deck.js').Card} */ (state.foundations[3].pop())
    state.tableau[0].push(last)
    state.started = true
    refresh()
  })
}

test('finishes itself, runs the cascade and offers another deal', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)

  await nearlyWon(page)

  await expect(page.locator('#board')).toHaveClass(/board--cascading/, { timeout: 5000 })
  expect((await gameState(page)).status).toBe('won')
  await expect(page.locator('#status-message')).toHaveText('You win!')

  // The cascade renders below the display's pixel ratio on purpose: its canvas and the card
  // bitmaps it blits both cost memory in proportion to this, and none of it is visible on
  // artwork moving this fast.
  const scale = await page.evaluate(() => {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('cascade'))
    const board = /** @type {HTMLElement} */ (document.getElementById('board'))
    return canvas.width / board.getBoundingClientRect().width
  })
  expect(scale).toBeGreaterThan(0)
  expect(scale).toBeLessThanOrEqual(1.5 + 0.01)

  // The cascade runs until it is interrupted, exactly as the original did.
  await page.locator('#board').click({ position: { x: 20, y: 20 } })
  await expect(page.locator('#board')).not.toHaveClass(/board--cascading/)

  const dialog = page.locator('dialog[open]')
  await expect(dialog).toContainText('You win')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await openMenuItem(page, 'Game', 'Statistics…')
  const stats = page.locator('dialog[open]')
  await expect(stats.locator('tr', { hasText: 'Games won' })).toContainText('1')
  await expect(stats.locator('tr', { hasText: 'Win rate' })).toContainText('100%')
})

test('a vegas win pays out five dollars a card', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)

  await openMenuItem(page, 'Game', 'Options…')
  await page.getByLabel('Vegas', { exact: true }).check()
  await page.getByRole('button', { name: 'OK' }).click()
  await page.waitForTimeout(200)

  await nearlyWon(page)
  await expect(page.locator('#board')).toHaveClass(/board--cascading/, { timeout: 5000 })

  // 51 cards were placed by hand and only the last one scored, so the stake is still showing.
  const state = await gameState(page)
  expect(state.status).toBe('won')
  expect(state.score).toBe(-47)
})
