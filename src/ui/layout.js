/**
 * Board geometry.
 *
 * Everything is expressed as a multiple of the card width, and the card width is whatever makes
 * the whole board -- top row plus the tallest tableau column -- fit the space available. That
 * single rule is what makes the same layout work on a desktop, a phone held upright, and the
 * same phone turned on its side, with no breakpoints and no scrolling.
 */

import { FOUNDATION_IDS, TABLEAU_IDS } from '../engine/game.js'

/** Windows dealt 71x96 cards, and the art was rebuilt at that ratio. */
export const CARD_RATIO = 96 / 71

/** All as fractions of the card width, except where noted. */
const GAP_X = 0.12 // the tightest the columns are ever packed
const GAP_X_MAX = 0.5 // how far they may spread when the board is wider than it needs
const PAD_Y = 0.1 // of card height
const ROW_GAP = 0.22 // of card height, between the top row and the tableau
const FAN_UP_MAX = 0.5 // of card height
const FAN_UP_MIN = 0.12
const FAN_DOWN_SHARE = 0.42 // a face-down card takes this share of a face-up card's step
const WASTE_FAN = 0.3

/**
 * How far the top row and the tableau may drift apart, in card heights. A tall phone has more
 * height than seven columns of width-limited cards can ever use; spending the surplus here
 * keeps the deck where it belongs at the top while moving the columns into thumb reach.
 */
const ROW_GAP_MAX = 1.2

/** Beyond this the cards stop growing and the board simply centres itself. */
const MAX_CARD_W = 170
const MIN_CARD_W = 26

/**
 * Cards are sized for a column of roughly this many steps even when the board is currently
 * sparser, so the deal does not start with huge cards that shrink as columns grow. A column
 * that outgrows the reserve does shrink the cards, which is the graceful way to keep fitting.
 */
const RESERVE_STEPS = 7

/**
 * @typedef {object} Layout
 * @property {number} cardW
 * @property {number} cardH
 * @property {number} gapX
 * @property {number} fanUp vertical step between face-up tableau cards
 * @property {number} fanDown vertical step between face-down tableau cards
 * @property {number} wasteFan horizontal step between fanned waste cards
 * @property {Record<string, { x: number, y: number }>} piles top-left of every pile
 */

/**
 * The vertical steps a column of `down` face-down and `up` face-up cards needs, counted in
 * face-up steps so the two can be solved for together.
 * @param {number} down
 * @param {number} up
 */
const stepsIn = (down, up) => down * FAN_DOWN_SHARE + Math.max(0, up - 1)

/**
 * @param {number} width available board width in CSS pixels
 * @param {number} height available board height
 * @param {{ down: number, up: number }[]} columns how each tableau column is currently stacked
 * @returns {Layout}
 */
export function computeLayout(width, height, columns) {
  const steps = columns.reduce((most, { down, up }) => Math.max(most, stepsIn(down, up)), 0)

  // Seven columns, six gaps between them, and half a gap of margin at each edge.
  const byWidth = width / (7 + 8 * GAP_X)

  // Top row + row gap + the tallest column at its tightest fan, plus padding above and below.
  const reserve = Math.max(steps, RESERVE_STEPS)
  const byHeight = height / (CARD_RATIO * (2 + 2 * PAD_Y + ROW_GAP + reserve * FAN_UP_MIN))

  const cardW = Math.max(MIN_CARD_W, Math.min(byWidth, byHeight, MAX_CARD_W))
  const cardH = cardW * CARD_RATIO

  // A board wider than the columns need lets them spread out rather than huddle in the middle.
  const gapX = Math.min(
    cardW * GAP_X_MAX,
    Math.max(cardW * GAP_X, (width - 7 * cardW) / 8),
  )

  // Spend whatever height is left on a roomier fan. Sizing it against the reserve rather than
  // the current columns keeps the step steady as the game fills the tableau up.
  const forColumns = height - cardH * (1 + 2 * PAD_Y + ROW_GAP) - cardH
  const fanUp = Math.max(
    cardH * FAN_UP_MIN,
    Math.min(cardH * FAN_UP_MAX, forColumns / Math.max(reserve, 1)),
  )

  const columnsWidth = 7 * cardW + 6 * gapX
  const originX = Math.max(gapX / 2, (width - columnsWidth) / 2)

  // Height left over once a reserve-sized board has been laid out at its natural spacing.
  const surplus = height - (cardH * (2 + 2 * PAD_Y + ROW_GAP) + reserve * fanUp)
  const rowGap = Math.min(cardH * ROW_GAP_MAX, cardH * ROW_GAP + Math.max(0, surplus))

  const originY = cardH * PAD_Y
  const tableauY = originY + cardH + rowGap

  /** @param {number} column */
  const x = (column) => originX + column * (cardW + gapX)

  /** @type {Record<string, { x: number, y: number }>} */
  const piles = {
    stock: { x: x(0), y: originY },
    waste: { x: x(1), y: originY },
  }
  // Foundations occupy the right-hand four columns; column 2 is the gap Windows left.
  FOUNDATION_IDS.forEach((id, index) => {
    piles[id] = { x: x(index + 3), y: originY }
  })
  TABLEAU_IDS.forEach((id, index) => {
    piles[id] = { x: x(index), y: tableauY }
  })

  return {
    cardW,
    cardH,
    gapX,
    fanUp,
    fanDown: fanUp * FAN_DOWN_SHARE,
    wasteFan: cardW * WASTE_FAN,
    piles,
  }
}

/**
 * Summarises the tableau for {@link computeLayout}, which only needs the shape of each column.
 * @param {import('../engine/game.js').GameState} state
 */
export function columnProfile(state) {
  return state.tableau.map((column) => ({
    down: column.filter((card) => !card.faceUp).length,
    up: column.filter((card) => card.faceUp).length,
  }))
}

/**
 * Where each card in a pile sits, relative to the pile's own top-left corner.
 *
 * Only the tableau fans vertically and only the waste fans sideways; stock and foundations show
 * their top card and hide the rest underneath it.
 * @param {Layout} layout
 * @param {string} pileId
 * @param {import('../engine/deck.js').Card[]} pile
 * @param {1|3} drawCount
 * @returns {{ x: number, y: number }[]}
 */
export function cardOffsets(layout, pileId, pile, drawCount) {
  if (pileId[0] === 't') {
    let y = 0
    return pile.map((card, index) => {
      const at = { x: 0, y }
      // The step belongs to the card being covered, not the one on top of it.
      if (index < pile.length - 1) y += card.faceUp ? layout.fanUp : layout.fanDown
      return at
    })
  }

  if (pileId === 'waste') {
    // Draw-three shows the last three turned cards side by side, the way the original did.
    const fanned = drawCount === 3 ? Math.min(3, pile.length) : 1
    const first = pile.length - fanned
    return pile.map((_, index) => ({
      x: index < first ? 0 : (index - first) * layout.wasteFan,
      y: 0,
    }))
  }

  return pile.map(() => ({ x: 0, y: 0 }))
}
