import { expect, test } from '@playwright/test'
import { cardPoint, dragTo, gameState, openMenuItem, pilePoint } from './helpers.js'

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

  // ...but it must still be displayed at the board's size, not its backing store's, or every
  // card it paints comes out larger than the ones that were played.
  const display = await page.evaluate(() => {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('cascade'))
    const board = /** @type {HTMLElement} */ (document.getElementById('board'))
    const bounds = canvas.getBoundingClientRect()
    return {
      width: bounds.width - board.clientWidth,
      height: bounds.height - board.clientHeight,
    }
  })
  expect(Math.abs(display.width)).toBeLessThan(1)
  expect(Math.abs(display.height)).toBeLessThan(1)

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

/**
 * Everything face up but a draw-three stock the auto-finish cannot get into: drawing turns up
 * QS, AH, KS with the King on top, and turning the waste over just deals the same three again.
 * The Ace of hearts is needed before anything else can go home.
 */
async function stalledDrawThree(page) {
  await page.evaluate(() => {
    const { state, refresh } = globalThis.solitaire
    const cards = new Map(
      [...state.stock, ...state.waste, ...state.foundations.flat(), ...state.tableau.flat()].map(
        (card) => [card.id, card],
      ),
    )
    /** @param {string} id */
    const card = (id) => {
      const found = /** @type {import('../../src/engine/deck.js').Card} */ (cards.get(id))
      found.faceUp = true
      return found
    }
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

    state.drawCount = 3
    state.waste = []
    state.stock = ['KS', 'AH', 'QS'].map(card)
    for (const stocked of state.stock) stocked.faceUp = false
    state.foundations = [
      ranks.slice(0, 11).map((rank) => card(rank + 'S')),
      [],
      ranks.map((rank) => card(rank + 'C')),
      ranks.map((rank) => card(rank + 'D')),
    ]
    state.tableau = [ranks.slice(1).reverse().map((rank) => card(rank + 'H')), [], [], [], [], [], []]
    state.started = true
    refresh()
  })
}

/** @param {import('@playwright/test').Page} page */
const movesMade = (page) => page.evaluate(() => globalThis.solitaire.state.moves)

test('an auto-finish that cannot finish stops, and resumes after the player moves', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)

  await stalledDrawThree(page)

  // It may turn the stock through once looking for a card, but then it must give up rather
  // than cycle forever.
  await page.waitForTimeout(1500)
  const settled = await movesMade(page)
  expect(settled).toBeLessThan(10)
  await page.waitForTimeout(1000)
  expect(await movesMade(page)).toBe(settled)
  expect((await gameState(page)).status).toBe('playing')

  // Moving the King out of the way uncovers the Ace, so the game can finish itself after all.
  const waste = (await gameState(page)).waste
  expect(waste[waste.length - 1]).toBe('KS')
  await dragTo(page, await cardPoint(page, 'KS'), await pilePoint(page, 't1'))

  await expect(page.locator('#board')).toHaveClass(/board--cascading/, { timeout: 10000 })
  expect((await gameState(page)).status).toBe('won')
})

test('undoing the move that won does not replay it', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)

  await nearlyWon(page)
  await expect(page.locator('#board')).toHaveClass(/board--cascading/, { timeout: 5000 })

  await page.locator('#board').click({ position: { x: 20, y: 20 } })
  await page.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click()

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(1000)

  const state = await gameState(page)
  expect(state.status).toBe('playing')
  expect(state.tableau[0].map((card) => card.id)).toEqual(['KD'])
})
