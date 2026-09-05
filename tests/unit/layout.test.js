import { describe, expect, it } from 'vitest'
import { CARD_RATIO, cardOffsets, computeLayout } from '../../src/ui/layout.js'

/** Every viewport the game claims to support, plus a couple of awkward ones. */
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 650 },
  { name: 'large desktop', width: 2560, height: 1300 },
  { name: 'laptop', width: 1440, height: 780 },
  { name: 'phone portrait', width: 390, height: 760 },
  { name: 'short phone portrait', width: 375, height: 600 },
  { name: 'phone landscape', width: 760, height: 340 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'squat window', width: 1000, height: 400 },
]

/**
 * A tableau with one column of the given shape and six single-card columns, which is the shape
 * that matters: the layout only ever looks at the tallest column.
 * @param {number} down
 * @param {number} up
 */
const tableauWith = (down, up) =>
  Array.from({ length: 7 }, (_, index) => (index === 3 ? { down, up } : { down: 0, up: 1 }))

/** A column can hold at most the six face-down cards it was dealt plus a full King-to-Ace run. */
const LONGEST_COLUMN = { down: 6, up: 13 }

/** These are ratios of derived pixel values; the last bit or two is float noise. */
const EPSILON = 1e-6

/** Where the bottom of a column of `down` face-down and `up` face-up cards falls. */
const bottomOf = (layout, { down, up }) =>
  layout.piles.t3.y + layout.cardH + down * layout.fanDown + (up - 1) * layout.fanUp

describe.each(VIEWPORTS)('layout at $name ($width x $height)', ({ width, height }) => {
  const shapes = [
    { down: 6, up: 1 }, // as dealt
    { down: 4, up: 5 },
    { down: 3, up: 9 },
    LONGEST_COLUMN,
  ]
  const layouts = shapes.map((shape) => computeLayout(width, height, tableauWith(shape.down, shape.up)))
  const [dealt] = layouts

  it('never resizes the cards as a column grows', () => {
    for (const layout of layouts) {
      expect(layout.cardW).toBe(dealt.cardW)
      expect(layout.cardH).toBe(dealt.cardH)
      expect(layout.gapX).toBe(dealt.gapX)
    }
  })

  it('never moves a pile as a column grows', () => {
    for (const layout of layouts) expect(layout.piles).toEqual(dealt.piles)
  })

  it('keeps the longest possible column inside the board', () => {
    for (const [index, layout] of layouts.entries()) {
      expect(bottomOf(layout, shapes[index])).toBeLessThanOrEqual(height + 0.5)
    }
  })

  it('fits the board across without scrolling', () => {
    expect(dealt.piles.t6.x + dealt.cardW).toBeLessThanOrEqual(width + 0.5)
    expect(dealt.piles.t0.x).toBeGreaterThanOrEqual(0)
    expect(dealt.cardH).toBeCloseTo(dealt.cardW * CARD_RATIO, 6)
  })

  it('leaves enough of a covered card showing to read its corner', () => {
    // Below about a tenth of the card height the corner index is cut into illegibility, so the
    // reserve is set to hold that line through the depths real games reach. Only a column longer
    // than any of the four hundred deals measured goes under it, and never below 8%.
    const deep = computeLayout(width, height, tableauWith(3, 10)) // 11.26 steps, the p90 game
    expect(deep.fanUp).toBeGreaterThan(deep.cardH * 0.1 - EPSILON)

    const longest = layouts[layouts.length - 1]
    expect(longest.fanUp).toBeGreaterThan(longest.cardH * 0.08 - EPSILON)
    expect(dealt.fanUp).toBeGreaterThan(dealt.cardH * 0.12 - EPSILON)
  })
})

describe('tableau fanning', () => {
  it('steps by the covered card, so face-down cards take less room', () => {
    const layout = computeLayout(1280, 650, tableauWith(2, 3))
    const pile = [
      { faceUp: false },
      { faceUp: false },
      { faceUp: true },
      { faceUp: true },
      { faceUp: true },
    ]
    const offsets = cardOffsets(layout, 't3', /** @type {any} */ (pile), 1)
    expect(offsets.map((at) => at.y)).toEqual([
      0,
      layout.fanDown,
      layout.fanDown * 2,
      layout.fanDown * 2 + layout.fanUp,
      layout.fanDown * 2 + layout.fanUp * 2,
    ])
    expect(offsets.every((at) => at.x === 0)).toBe(true)
  })

  it('fans only the last three waste cards in draw-three', () => {
    const layout = computeLayout(1280, 650, tableauWith(6, 1))
    const pile = /** @type {any} */ (Array.from({ length: 5 }, () => ({ faceUp: true })))
    expect(cardOffsets(layout, 'waste', pile, 3).map((at) => at.x)).toEqual([
      0,
      0,
      0,
      layout.wasteFan,
      layout.wasteFan * 2,
    ])
    expect(cardOffsets(layout, 'waste', pile, 1).every((at) => at.x === 0)).toBe(true)
  })
})
