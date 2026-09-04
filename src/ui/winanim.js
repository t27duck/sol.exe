/**
 * The bouncing-card cascade that plays when a game is won.
 *
 * Cards leave the foundations one at a time and fall under gravity, bouncing off the bottom of
 * the board. The canvas is never cleared, so each card smears itself across the felt exactly the
 * way the original did.
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

  /** @type {{ image: HTMLImageElement, x: number, y: number, vx: number, vy: number }[]} */
  let flying = []
  /** @type {{ image: HTMLImageElement, x: number, y: number }[]} */
  let waiting = []

  let nextLaunch = 0
  let width = 0
  let height = 0
  let cardW = 0
  let cardH = 0

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
        ...card,
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
      context.drawImage(card.image, card.x, card.y, cardW, cardH)
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

      const ratio = Math.min(window.devicePixelRatio || 1, 2)
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
