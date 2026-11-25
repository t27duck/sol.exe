/**
 * The bouncing-card cascade that plays when a game is won.
 *
 * Cards leave the foundations one at a time and fall under gravity, bouncing off the bottom of
 * the board. As in the original, only one card is ever in flight: the next waits until the last
 * has left the board. The canvas is never cleared, so each card smears itself across the felt
 * exactly the way the original did.
 *
 * The card faces are vector art, and asking the browser to rasterise a court card's several
 * thousand path segments afresh on every frame -- for up to 52 cards at once -- is what makes
 * the difference between a smooth cascade and a slideshow on a large display. Each face is
 * therefore rasterised once, at the exact size it will be drawn, and the loop blits bitmaps.
 *
 * Those bitmaps and the board-sized canvas behind them are the memory this costs, so the
 * cascade renders at its own resolution rather than the display's, and hands each bitmap back
 * the moment its card leaves the board.
 */

/** @typedef {import('./layout.js').Layout} Layout */

const GRAVITY = 0.28
const BOUNCE = 0.82

/** Most cards head off to the left, as they did in Windows; now and then one goes right. */
const RIGHT_CHANCE = 0.15

/**
 * The motion constants above are per frame at 60 frames a second. Each step scales them by how
 * long the frame actually took, so a 120Hz or 144Hz display plays the cascade at the same speed
 * rather than twice as fast.
 */
const REFERENCE_FRAME_MS = 1000 / 60

/**
 * The most frames' worth of motion one step may cover. After a stall -- a background tab, a
 * long garbage collection -- a card should pick up where it was, not leap across the board.
 */
const MAX_FRAME_STEP = 3

/**
 * Pixels per CSS pixel for the cascade, capped below the 2x a dense display would ask for.
 * Everything here is either moving fast or is part of a trail smeared across the felt, so the
 * extra sampling buys nothing visible while costing memory in proportion to the board's area
 * and to every card in flight at once.
 */
const RENDER_SCALE_CAP = 1.5

/**
 * The board the motion below was tuned against. Velocities and gravity are scaled from it, so
 * a card traces the same arc and takes the same time to cross the felt whether the window is a
 * laptop's or a 4K display's -- in raw pixels a big board would otherwise leave the cards
 * drifting across it for half a minute.
 */
const REFERENCE_BOARD = { width: 1280, height: 650 }

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} boardElement
 */
export function createCascade(canvas, boardElement) {
  /** @type {number|null} */
  let frame = null
  /** @type {(() => void)|null} */
  let onFinish = null

  /** @type {{ sprite: CanvasImageSource, x: number, y: number, vx: number, vy: number }[]} */
  let flying = []
  /**
   * Cards still on their foundations, in launch order. `sprite` is filled in once the card has
   * been painted at rest, so the same bitmap carries on into its flight.
   * @type {{ image: HTMLImageElement, x: number, y: number, sprite?: CanvasImageSource }[]}
   */
  let waiting = []
  let ratio = 1

  /** @type {number|null} timestamp of the previous frame, `null` before the first */
  let lastFrame = null
  let width = 0
  let height = 0
  let cardW = 0
  let cardH = 0
  let scaleX = 1
  let scaleY = 1

  /**
   * Draws a card face into an offscreen bitmap the size it will appear on the board, so the
   * animation loop never touches vector art. Cards are converted as they launch rather than all
   * at once, which spreads the work instead of stalling the first frame.
   * @param {HTMLImageElement} image
   * @returns {CanvasImageSource} the bitmap, or the original image if it cannot be drawn yet
   */
  function rasterise(image) {
    if (!image.complete || image.naturalWidth === 0) return image

    const sprite = document.createElement('canvas')
    sprite.width = Math.max(1, Math.round(cardW * ratio))
    sprite.height = Math.max(1, Math.round(cardH * ratio))

    const context = sprite.getContext('2d')
    if (!context) return image
    context.drawImage(image, 0, 0, sprite.width, sprite.height)

    // The board draws each card's black border outside the card, which this copy would lose,
    // so trace it just inside the edge, with the same corner radius as `.card`.
    const line = Math.max(1, Math.round(ratio))
    context.strokeStyle = '#000000'
    context.lineWidth = line
    context.beginPath()
    context.roundRect(
      line / 2,
      line / 2,
      sprite.width - line,
      sprite.height - line,
      Math.max(0, cardW * 0.06 * ratio - line / 2),
    )
    context.stroke()
    return sprite
  }

  /**
   * Drops a bitmap's backing store straight away rather than leaving it to the collector, which
   * is what keeps the peak cost to the cards actually in flight.
   * @param {CanvasImageSource} sprite
   */
  function release(sprite) {
    if (sprite instanceof HTMLCanvasElement) {
      sprite.width = 0
      sprite.height = 0
    }
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    for (const card of flying) release(card.sprite)
    for (const card of waiting) if (card.sprite) release(card.sprite)
    flying = []
    waiting = []
    // A stopped cascade should not go on holding a board-sized bitmap.
    canvas.width = 0
    canvas.height = 0
    boardElement.classList.remove('board--cascading')
    const finished = onFinish
    onFinish = null
    finished?.()
  }

  /**
   * Paints a waiting card where it rests on its foundation. The real cards are hidden while the
   * cascade runs, so without this the foundations would look empty under the card leaving them.
   * @param {CanvasRenderingContext2D} context
   * @param {typeof waiting[number]} card
   */
  function paintAtRest(context, card) {
    card.sprite ??= rasterise(card.image)
    context.drawImage(card.sprite, card.x, card.y, cardW, cardH)
  }

  /**
   * Shows what a launching card leaves behind: the next card down its foundation, or, once the
   * foundation is spent, the empty pile outline the canvas covers.
   * @param {CanvasRenderingContext2D} context
   * @param {typeof waiting[number]} launched
   */
  function uncover(context, launched) {
    const beneath = waiting.find((card) => card.x === launched.x && card.y === launched.y)
    if (beneath) paintAtRest(context, beneath)
    else context.clearRect(launched.x, launched.y, cardW, cardH)
  }

  /** @param {number} now */
  function step(now) {
    const context = canvas.getContext('2d')
    if (!context) return stop()

    const frames =
      lastFrame === null ? 1 : Math.min(MAX_FRAME_STEP, (now - lastFrame) / REFERENCE_FRAME_MS)
    lastFrame = now

    // One card at a time: the next leaves its foundation only once the last is off the board.
    if (flying.length === 0 && waiting.length > 0) {
      const card = /** @type {typeof waiting[number]} */ (waiting.shift())
      uncover(context, card)
      const direction = Math.random() < RIGHT_CHANCE ? 1 : -1
      flying.push({
        sprite: card.sprite ?? rasterise(card.image),
        x: card.x,
        y: card.y,
        // A wide spread of speeds, and some cards dropping rather than leaping off their
        // foundation, so no two cards bounce in step with each other.
        vx: direction * (6 + Math.random() * 12) * scaleX,
        vy: (Math.random() * 12 - 9) * scaleY,
      })
    }

    for (const card of flying) {
      card.vy += GRAVITY * scaleY * frames
      card.x += card.vx * frames
      card.y += card.vy * frames

      if (card.y + cardH >= height) {
        card.y = height - cardH
        card.vy = -Math.abs(card.vy) * BOUNCE
      }
      // Snapping to whole device pixels keeps each draw a straight copy rather than a resample.
      context.drawImage(
        card.sprite,
        Math.round(card.x * ratio) / ratio,
        Math.round(card.y * ratio) / ratio,
        cardW,
        cardH,
      )
    }

    // A card is done once it has left the board entirely; the trail it painted stays behind.
    flying = flying.filter((card) => {
      const onBoard = card.x + cardW > 0 && card.x < width
      if (!onBoard) release(card.sprite)
      return onBoard
    })

    if (flying.length === 0 && waiting.length === 0) return stop()
    frame = requestAnimationFrame(step)
  }

  return {
    get running() {
      return frame !== null
    },

    stop,

    /**
     * @param {{ image: HTMLImageElement, x: number, y: number }[]} cards in launch order
     * @param {Layout} layout
     * @param {() => void} [whenDone]
     */
    start(cards, layout, whenDone) {
      stop()
      onFinish = whenDone ?? null

      ratio = Math.min(window.devicePixelRatio || 1, RENDER_SCALE_CAP)
      // The canvas fills the board's padding box, which is the border-box bounds less the border.
      width = boardElement.clientWidth
      height = boardElement.clientHeight
      cardW = layout.cardW
      cardH = layout.cardH
      scaleX = width / REFERENCE_BOARD.width
      scaleY = height / REFERENCE_BOARD.height

      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)

      waiting = cards.map((card) => ({ ...card }))
      // The top card of each foundation is the first one waiting at its position.
      const painted = new Set()
      for (const card of waiting) {
        const key = `${card.x},${card.y}`
        if (painted.has(key)) continue
        painted.add(key)
        paintAtRest(context, card)
      }
      lastFrame = null
      boardElement.classList.add('board--cascading')
      frame = requestAnimationFrame(step)
    },
  }
}
