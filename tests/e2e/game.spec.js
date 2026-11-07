import { expect, test } from '@playwright/test'
import { boxOf, cardPoint, dragTo, drawCard, gameState, pilePoint, selectGame } from './helpers.js'

/** A deal with an opening column-to-column move and all four aces still in the stock. */
const OPENING_GAME = 1

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.card')).toHaveCount(52)
})

test('deals a Klondike layout', async ({ page }) => {
  const state = await gameState(page)

  expect(state.tableau.map((column) => column.length)).toEqual([1, 2, 3, 4, 5, 6, 7])
  expect(state.tableau.flat().filter((card) => card.faceUp)).toHaveLength(7)
  expect(state.stock).toBe(24)
  expect(state.foundations.flat()).toHaveLength(0)

  // Every card is on the board and nothing has escaped the felt.
  const board = await boxOf(page, '#board')
  const boxes = await page.locator('.card').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect()),
  )
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(board.x - 1)
    expect(box.right).toBeLessThanOrEqual(board.x + board.width + 1)
    expect(box.bottom).toBeLessThanOrEqual(board.y + board.height + 1)
  }
})

test('the whole window fits the viewport with no scrolling', async ({ page }) => {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }))
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight)
})

test('turns cards from the stock and recycles the waste', async ({ page }) => {
  await drawCard(page)
  expect((await gameState(page)).waste).toHaveLength(1)
  expect((await gameState(page)).stock).toBe(23)

  for (let i = 0; i < 23; i++) await drawCard(page)
  expect((await gameState(page)).stock).toBe(0)
  await expect(page.locator('.pile--stock')).toHaveClass(/pile--recyclable/)

  await drawCard(page)
  const recycled = await gameState(page)
  expect(recycled.stock).toBe(24)
  expect(recycled.waste).toHaveLength(0)
  expect(recycled.score).toBe(0) // the 100 penalty cannot take the score below zero
})

test('drags a card onto a legal column and refuses an illegal one', async ({ page }) => {
  // Game 1 opens with the jack of hearts able to go on the queen of spades, and holds all four
  // aces back in the stock -- which the shortcut tests below rely on too.
  await selectGame(page, OPENING_GAME)
  const before = await gameState(page)

  // Read the move out of the live game rather than hard-coding a column, so the test still
  // describes the rule it is checking.
  const plan = await page.evaluate(() => {
    const { state } = globalThis.solitaire
    const red = (card) => card.suit === 'H' || card.suit === 'D'
    for (let from = 0; from < 7; from++) {
      const card = state.tableau[from].at(-1)
      for (let to = 0; to < 7; to++) {
        const target = state.tableau[to].at(-1)
        if (from === to || !card || !target) continue
        if (red(card) !== red(target) && card.rank === target.rank - 1) {
          return { card: card.id, onto: target.id, from, to }
        }
      }
    }
    return null
  })
  test.skip(plan === null, 'this deal has no opening column-to-column move')
  if (!plan) return

  await dragTo(page, await cardPoint(page, plan.card), await cardPoint(page, plan.onto))

  const after = await gameState(page)
  expect(after.tableau[plan.to].at(-1)?.id).toBe(plan.card)
  expect(after.tableau[plan.from].length).toBe(before.tableau[plan.from].length - 1)

  // Dropping the same card back on a pile that will not take it leaves it where it is.
  await dragTo(page, await cardPoint(page, plan.card), await pilePoint(page, 'f0'))
  expect((await gameState(page)).tableau[plan.to].at(-1)?.id).toBe(plan.card)
})

test('double-clicking sends a card to a foundation', async ({ page }) => {
  await selectGame(page, OPENING_GAME)

  // Turn cards until an ace shows up on the waste, then send it home.
  let ace = null
  for (let i = 0; i < 24 && !ace; i++) {
    await drawCard(page)
    const state = await gameState(page)
    const top = state.waste.at(-1)
    if (top && top.startsWith('A')) ace = top
  }
  test.skip(ace === null, 'no ace reached the waste in one pass')
  if (!ace) return

  const at = await cardPoint(page, ace)
  await page.mouse.dblclick(at.x, at.y)
  await page.waitForTimeout(250)

  const state = await gameState(page)
  expect(state.foundations.flat()).toContain(ace)
  expect(state.score).toBe(10)
})

test('a card flies to its foundation over the tableau, not under it', async ({ page }) => {
  await selectGame(page, OPENING_GAME)

  // Put an ace on the last column, so its way home crosses every other column.
  const ace = await page.evaluate(() => {
    const { state, refresh } = globalThis.solitaire
    const piles = [state.stock, state.waste, ...state.tableau]
    const pile = /** @type {any[]} */ (piles.find((cards) => cards.some((c) => c.rank === 1)))
    const card = pile.splice(pile.findIndex((c) => c.rank === 1), 1)[0]
    card.faceUp = true
    state.tableau[6].push(card)
    refresh()
    return card.id
  })

  const at = await cardPoint(page, ace)
  // Slow the slide down enough to look at it mid-flight.
  await page.evaluate(() =>
    document.getElementById('board')?.style.setProperty('--deal-ms', '1500ms'),
  )
  await page.mouse.dblclick(at.x, at.y)

  const stacking = () =>
    page.evaluate((id) => {
      const z = (element) => Number(getComputedStyle(element).zIndex)
      const tableau = [...document.querySelectorAll('.card[data-pile^="t"]')].map(z)
      const card = /** @type {HTMLElement} */ (document.querySelector(`[data-card="${id}"]`))
      return { card: z(card), pile: card.dataset.pile, tableau: Math.max(...tableau) }
    }, ace)

  const inFlight = await stacking()
  expect(inFlight.pile).toMatch(/^f/)
  expect(inFlight.card).toBeGreaterThan(inFlight.tableau)

  // Once it lands it settles back under the tableau, where a foundation belongs.
  await expect
    .poll(async () => (await stacking()).card, { timeout: 4000 })
    .toBeLessThan(inFlight.tableau)
})

test('a card dropped nowhere flies back over the tableau, not under it', async ({ page }) => {
  await selectGame(page, OPENING_GAME)

  // An ace on the first column has nowhere to go on the tableau, and its way back from the far
  // side of the board crosses every column that stacks above it.
  const ace = await page.evaluate(() => {
    const { state, refresh } = globalThis.solitaire
    const piles = [state.stock, state.waste, ...state.tableau]
    const pile = /** @type {any[]} */ (piles.find((cards) => cards.some((c) => c.rank === 1)))
    const card = pile.splice(pile.findIndex((c) => c.rank === 1), 1)[0]
    card.faceUp = true
    state.tableau[0].push(card)
    refresh()
    return card.id
  })

  const at = await cardPoint(page, ace)
  const board = await boxOf(page, '#board')
  await page.evaluate(() =>
    document.getElementById('board')?.style.setProperty('--deal-ms', '1500ms'),
  )
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x + 20, at.y + 20, { steps: 4 })
  await page.mouse.move(board.x + board.width - 10, board.y + board.height - 10, { steps: 8 })
  await page.mouse.up()

  const stacking = () =>
    page.evaluate((id) => {
      const z = (element) => Number(getComputedStyle(element).zIndex)
      const card = /** @type {HTMLElement} */ (document.querySelector(`[data-card="${id}"]`))
      const others = [...document.querySelectorAll('.card[data-pile^="t"]')]
        .filter((element) => element !== card)
        .map(z)
      return { card: z(card), pile: card.dataset.pile, tableau: Math.max(...others) }
    }, ace)

  const inFlight = await stacking()
  expect(inFlight.pile).toBe('t0')
  expect(inFlight.card).toBeGreaterThan(inFlight.tableau)

  // Back home on the first column, which stacks under all the others.
  await expect
    .poll(async () => (await stacking()).card, { timeout: 4000 })
    .toBeLessThan(inFlight.tableau)
})

test('tapping a card and then a column moves it, which is how a phone plays', async ({ page }) => {
  await selectGame(page, OPENING_GAME)

  const plan = await page.evaluate(() => {
    const { state } = globalThis.solitaire
    const red = (card) => card.suit === 'H' || card.suit === 'D'
    for (let from = 0; from < 7; from++) {
      const card = state.tableau[from].at(-1)
      for (let to = 0; to < 7; to++) {
        const target = state.tableau[to].at(-1)
        if (from === to || !card || !target) continue
        if (red(card) !== red(target) && card.rank === target.rank - 1) {
          return { card: card.id, onto: target.id, to }
        }
      }
    }
    return null
  })
  test.skip(plan === null, 'this deal has no opening column-to-column move')
  if (!plan) return

  const source = await cardPoint(page, plan.card)
  await page.mouse.click(source.x, source.y)
  await expect(page.locator(`.card[data-card="${plan.card}"]`)).toHaveClass(/card--selected/)

  const target = await cardPoint(page, plan.onto)
  await page.mouse.click(target.x, target.y)
  await page.waitForTimeout(250)

  expect((await gameState(page)).tableau[plan.to].at(-1)?.id).toBe(plan.card)
  await expect(page.locator('.card--selected')).toHaveCount(0)
})

test('right-clicking a card sends it home', async ({ page }) => {
  await selectGame(page, OPENING_GAME)

  let ace = null
  for (let i = 0; i < 24 && !ace; i++) {
    await drawCard(page)
    const top = (await gameState(page)).waste.at(-1)
    if (top && top.startsWith('A')) ace = top
  }
  test.skip(ace === null, 'no ace reached the waste in one pass')
  if (!ace) return

  const at = await cardPoint(page, ace)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.waitForTimeout(250)

  expect((await gameState(page)).foundations.flat()).toContain(ace)
})

test('F2 deals a new game and Ctrl+Z takes a move back', async ({ page }) => {
  const first = await gameState(page)
  await drawCard(page)
  expect((await gameState(page)).waste).toHaveLength(1)

  await page.keyboard.press('Control+z')
  const undone = await gameState(page)
  expect(undone.waste).toHaveLength(0)
  expect(undone.stock).toBe(24)
  expect(undone.gameNumber).toBe(first.gameNumber)

  await page.keyboard.press('F2')
  await page.waitForTimeout(150)
  expect((await gameState(page)).gameNumber).not.toBe(first.gameNumber)
})

test('the tableau grows downwards without resizing the board', async ({ page }) => {
  const outlines = () =>
    page.locator('.pile').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect()
        return [node.getAttribute('data-pile'), box.x, box.y, box.width, box.height].join()
      }),
    )
  const before = await outlines()

  await page.evaluate(() => {
    // A deliberately long column: the layout has to compress the fan to keep it on screen.
    const { state, refresh } = globalThis.solitaire
    const spare = state.stock.splice(0, 12)
    for (const card of spare) card.faceUp = true
    state.tableau[3].push(...spare)
    refresh()
  })
  await page.waitForTimeout(250)

  // Card size and pile placement answer to the viewport and to nothing else, so a column that
  // outgrows its allowance compresses its own fan rather than shrinking every card on the board.
  expect(await outlines()).toEqual(before)

  const board = await boxOf(page, '#board')
  const bottom = await page.locator('.card[data-pile="t3"]').evaluateAll((nodes) =>
    Math.max(...nodes.map((node) => node.getBoundingClientRect().bottom)),
  )
  expect(bottom).toBeLessThanOrEqual(board.y + board.height + 1)
})
