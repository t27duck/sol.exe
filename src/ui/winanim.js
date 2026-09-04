/**
 * The bouncing-card cascade that plays when a game is won.
 *
 * Cards leave the foundations one at a time and fall under gravity, bouncing off the bottom of
 * the board. The canvas is never cleared, so each card smears itself across the felt exactly the
 * way the original did.
 *
 * The card faces are vector art, and asking the browser to rasterise a court card's several
 * thousand path segments afresh on every frame -- for up to 52 cards at once -- is what makes
 * the difference between a smooth cascade and a slideshow on a large display. Each face is
 * therefore rasterised once, at the exact size it will be drawn, and the loop blits bitmaps.
 */

/** @typedef {import('./layout.js').Layout} Layout */

const GRAVITY = 0.28
const BOUNCE = 0.82
const LAUNCH_INTERVAL_MS = 90

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
  /** @type {{ image: HTMLImageElement, x: number, y: number }[]} */
  let waiting = []
  let ratio = 1

  let nextLaunch = 0
  let width = 0
  let height = 0
  let cardW = 0
  let cardH = 0

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
    return sprite
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    flying = []
    waiting = []
    boardElement.classList.remove('board--cascading')
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    const finished = onFinish
    onFinish = null
    finished?.()
  }

  /** @param {number} now */
  function step(now) {
    const context = canvas.getContext('2d')
    if (!context) return stop()

    if (waiting.length > 0 && now >= nextLaunch) {
      const card = /** @type {typeof waiting[number]} */ (waiting.shift())
      flying.push({
        sprite: rasterise(card.image),
        x: card.x,
        y: card.y,
        // Aim outward from wherever the card was sitting, so the fans spread across the board.
        vx: (card.x + cardW / 2 < width / 2 ? 1 : -1) * (2 + Math.random() * 5),
        vy: -(2 + Math.random() * 4),
      })
      nextLaunch = now + LAUNCH_INTERVAL_MS
    }

    for (const card of flying) {
      card.vy += GRAVITY
      card.x += card.vx
      card.y += card.vy

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
    flying = flying.filter((card) => card.x + cardW > 0 && card.x < width)

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

      ratio = Math.min(window.devicePixelRatio || 1, 2)
      const bounds = boardElement.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      cardW = layout.cardW
      cardH = layout.cardH

      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)

      waiting = cards
      nextLaunch = 0
      boardElement.classList.add('board--cascading')
      frame = requestAnimationFrame(step)
    },
  }
}
