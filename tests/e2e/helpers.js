/**
 * Shared plumbing for the end-to-end tests.
 *
 * Cards are absolutely positioned and overlap heavily, so the tests drive the mouse by
 * coordinates the way a player does rather than relying on element-level clicks.
 */

/**
 * The element's box, or a failure -- a missing box always means the test is looking at the
 * wrong thing, so there is nothing useful to do with `null`.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 */
export async function boxOf(page, selector) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  return box
}

/** The centre of a pile's outline. */
export async function pilePoint(page, pile) {
  const box = await boxOf(page, `.pile[data-pile="${pile}"]`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * A point near the top of a card, which is the part left visible when the card is covered.
 *
 * Cards slide to their new places over about 180ms, and a box read mid-flight would aim the
 * mouse at where the card used to be, so this waits for the card to come to rest first.
 * @param {import('@playwright/test').Page} page
 * @param {string} cardId
 */
export async function cardPoint(page, cardId) {
  const selector = `.card[data-card="${cardId}"]`
  let previous = null
  for (let attempt = 0; attempt < 20; attempt++) {
    const box = await boxOf(page, selector)
    if (previous && box.x === previous.x && box.y === previous.y) {
      return { x: box.x + box.width / 2, y: box.y + box.height * 0.1 }
    }
    previous = box
    await page.waitForTimeout(40)
  }
  throw new Error(`${selector} never settled`)
}

/** Turns a card from the stock. */
export async function drawCard(page) {
  const at = await pilePoint(page, 'stock')
  await page.mouse.click(at.x, at.y)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 */
export async function dragTo(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Several steps, so the drag passes the threshold and the drop target updates on the way.
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

/** Reads the live game state through the handle the app publishes. */
export function gameState(page) {
  return page.evaluate(() => {
    const { state } = globalThis.solitaire
    return {
      gameNumber: state.gameNumber,
      score: state.score,
      status: state.status,
      drawCount: state.drawCount,
      elapsed: state.elapsed,
      stock: state.stock.length,
      waste: state.waste.map((card) => card.id),
      foundations: state.foundations.map((pile) => pile.map((card) => card.id)),
      tableau: state.tableau.map((column) =>
        column.map((card) => ({ id: card.id, faceUp: card.faceUp })),
      ),
    }
  })
}

/** Deals a known game so a test can rely on where the cards are. */
export async function selectGame(page, number) {
  await page.getByRole('menuitem', { name: 'Game' }).click()
  await page.getByRole('menuitem', { name: 'Select Game…' }).click()
  await page.getByLabel(/Game number/).fill(String(number))
  await page.getByRole('button', { name: 'OK' }).click()
  await page.waitForTimeout(150)
}

/** @param {import('@playwright/test').Page} page */
export async function openMenuItem(page, menu, item) {
  await page.getByRole('menuitem', { name: menu, exact: true }).click()
  await page.getByRole('menuitem', { name: item }).click()
}
