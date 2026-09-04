/**
 * Picking cards up and putting them down.
 *
 * One Pointer Events path serves mouse, touch and pen. On top of dragging there are the two
 * shortcuts the original had -- double-click and right-click send a card home -- plus
 * tap-to-select then tap-to-place, which is what makes the game comfortable on a phone and
 * usable without a steady hand.
 */
import { canMove, canTake, getPile, pileKind } from '../engine/game.js'

/** @typedef {import('../engine/game.js').GameState} GameState */

/** How far a pointer may travel before the gesture counts as a drag rather than a tap. */
const DRAG_THRESHOLD = 6

/** Two taps closer together than this, on the same card, are a double-tap. */
const DOUBLE_TAP_MS = 320

/**
 * @param {object} options
 * @param {HTMLElement} options.boardElement
 * @param {ReturnType<import('./board.js').createBoard>} options.board
 * @param {() => GameState} options.getState
 * @param {() => import('../state/storage.js').Settings} options.getSettings
 * @param {(from: string, to: string, count: number) => boolean} options.onMove
 * @param {() => void} options.onDraw
 * @param {(pileId: string) => boolean} options.onSendToFoundation
 * @param {() => void} options.onChange called after anything that alters the game
 * @param {() => boolean} options.isBlocked true while something else owns the board, such as
 *   the win cascade
 */
export function createDragController(options) {
  const { boardElement, board, getState, getSettings, onMove, onDraw, onSendToFoundation } = options

  /** @type {{ from: string, index: number, cards: string[] } | null} */
  let selection = null

  /** @type {null | { from: string, index: number, cards: string[], startX: number, startY: number, moved: boolean, bases: { x: number, y: number }[] }} */
  let gesture = null

  /** @type {{ card: string, at: number } | null} */
  let lastTap = null

  /** Board-relative pointer position. @param {PointerEvent} event */
  function pointAt(event) {
    const bounds = boardElement.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  function clearSelection() {
    selection = null
    board.setSelection([])
  }

  function finish() {
    clearSelection()
    options.onChange()
  }

  /**
   * The cards a grab would lift: the run from `index` to the top of the pile.
   * @param {string} pileId
   * @param {number} index
   */
  function runFrom(pileId, index) {
    const pile = getPile(getState(), pileId)
    return pile.slice(index).map((card) => card.id)
  }

  /**
   * Tries the selected cards on a pile. Returns whether they went.
   * @param {string} toId
   */
  function dropSelectionOn(toId) {
    if (!selection) return false
    const moved = onMove(selection.from, toId, selection.cards.length)
    if (moved) finish()
    return moved
  }

  /**
   * Whether a point falls inside the stock. Cards travelling from the stock to the waste are
   * briefly still over the stock, and hit-testing would hand them the click instead; the stock
   * is a fixed target, so testing the geometry keeps rapid dealing responsive.
   * @param {{ x: number, y: number }} at
   */
  function overStock(at) {
    const geometry = board.layout
    if (!geometry) return false
    const origin = geometry.piles.stock
    return (
      at.x >= origin.x &&
      at.x <= origin.x + geometry.cardW &&
      at.y >= origin.y &&
      at.y <= origin.y + geometry.cardH
    )
  }

  /** @param {PointerEvent} event */
  function onPointerDown(event) {
    if (event.button === 2) return // right-click is handled as a context menu
    if (options.isBlocked()) return

    if (overStock(pointAt(event))) {
      onDraw()
      finish()
      return
    }

    const cardElement = /** @type {HTMLElement|null} */ (
      /** @type {HTMLElement} */ (event.target).closest('.card')
    )
    const pileElement = /** @type {HTMLElement|null} */ (
      /** @type {HTMLElement} */ (event.target).closest('.pile')
    )

    const pileId = cardElement?.dataset.pile ?? pileElement?.dataset.pile
    if (!pileId || pileId === 'stock') {
      clearSelection()
      return
    }

    // An empty or covered pile is only ever a destination.
    if (!cardElement) {
      if (!dropSelectionOn(pileId)) clearSelection()
      return
    }

    const state = getState()
    const index = Number(cardElement.dataset.index)
    const count = getPile(state, pileId).length - index

    if (!canTake(state, pileId, count)) {
      // Tapping a buried card still means "put the selection here" if that is legal.
      if (!dropSelectionOn(pileId)) clearSelection()
      return
    }

    const cards = runFrom(pileId, index)
    const start = pointAt(event)
    gesture = {
      from: pileId,
      index,
      cards,
      startX: start.x,
      startY: start.y,
      moved: false,
      bases: cards.map((id) => {
        const element = /** @type {HTMLElement} */ (board.elementFor(id))
        return {
          x: Number.parseFloat(element.style.getPropertyValue('--x')),
          y: Number.parseFloat(element.style.getPropertyValue('--y')),
        }
      }),
    }
    boardElement.setPointerCapture(event.pointerId)
  }

  /** @param {PointerEvent} event */
  function onPointerMove(event) {
    const active = gesture
    if (!active) return

    const at = pointAt(event)
    const dx = at.x - active.startX
    const dy = at.y - active.startY

    if (!active.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      active.moved = true
      clearSelection()

      const ghost = getSettings().outlineDragging
      active.cards.forEach((id, order) => {
        const element = /** @type {HTMLElement} */ (board.elementFor(id))
        element.classList.add('card--dragging')
        if (ghost) element.classList.add('card--ghost')
        element.style.zIndex = String(1000 + order)
      })
    }

    active.cards.forEach((id, order) => {
      const element = /** @type {HTMLElement} */ (board.elementFor(id))
      element.style.setProperty('--x', `${active.bases[order].x + dx}px`)
      element.style.setProperty('--y', `${active.bases[order].y + dy}px`)
    })

    board.highlightDrop(targetUnder(active, dx, dy))
  }

  /**
   * The legal drop target the dragged stack covers most of.
   * @param {NonNullable<typeof gesture>} active
   * @param {number} dx
   * @param {number} dy
   */
  function targetUnder(active, dx, dy) {
    const state = getState()
    const geometry = board.layout
    if (!geometry) return null

    const card = {
      x: active.bases[0].x + dx,
      y: active.bases[0].y + dy,
      width: geometry.cardW,
      height: geometry.cardH,
    }

    let best = null
    let bestOverlap = 0
    for (const target of board.dropTargets(state)) {
      if (!canMove(state, active.from, target.id, active.cards.length)) continue

      const overlapX = Math.min(card.x + card.width, target.x + target.width) - Math.max(card.x, target.x)
      const overlapY = Math.min(card.y + card.height, target.y + target.height) - Math.max(card.y, target.y)
      const overlap = Math.max(0, overlapX) * Math.max(0, overlapY)

      if (overlap > bestOverlap) {
        bestOverlap = overlap
        best = target.id
      }
    }
    // Require a real overlap, so letting go in open space always returns the cards.
    return bestOverlap > (geometry.cardW * geometry.cardH) / 8 ? best : null
  }

  /** @param {PointerEvent} event */
  function onPointerUp(event) {
    const active = gesture
    gesture = null
    if (!active) return
    if (boardElement.hasPointerCapture(event.pointerId)) {
      boardElement.releasePointerCapture(event.pointerId)
    }

    if (!active.moved) {
      handleTap(active)
      return
    }

    const at = pointAt(event)
    const target = targetUnder(active, at.x - active.startX, at.y - active.startY)

    for (const id of active.cards) {
      const element = /** @type {HTMLElement} */ (board.elementFor(id))
      element.classList.remove('card--dragging', 'card--ghost')
      element.style.zIndex = ''
    }
    board.highlightDrop(null)

    // Whether or not the drop was legal, re-rendering animates the cards to where they belong.
    if (target) onMove(active.from, target, active.cards.length)
    finish()
  }

  /**
   * A tap with no drag: the second of a pair sends the card home, the first either places the
   * current selection or becomes the new selection.
   * @param {NonNullable<typeof gesture>} active
   */
  function handleTap(active) {
    const topCard = active.cards[active.cards.length - 1]
    const now = performance.now()

    if (lastTap && lastTap.card === topCard && now - lastTap.at < DOUBLE_TAP_MS) {
      lastTap = null
      if (active.cards.length === 1 && onSendToFoundation(active.from)) {
        finish()
        return
      }
    }
    lastTap = { card: topCard, at: now }

    if (selection && selection.from !== active.from && dropSelectionOn(active.from)) return

    if (selection && selection.from === active.from && selection.index === active.index) {
      clearSelection()
      return
    }

    selection = { from: active.from, index: active.index, cards: active.cards }
    board.setSelection(active.cards)
  }

  /** @param {MouseEvent} event */
  function onContextMenu(event) {
    event.preventDefault()
    if (options.isBlocked()) return

    const cardElement = /** @type {HTMLElement|null} */ (
      /** @type {HTMLElement} */ (event.target).closest('.card')
    )
    const pileId = cardElement?.dataset.pile
    if (!pileId || pileKind(pileId) === 'stock') return

    const pile = getPile(getState(), pileId)
    if (Number(cardElement?.dataset.index) !== pile.length - 1) return
    if (onSendToFoundation(pileId)) finish()
  }

  function onPointerCancel() {
    const active = gesture
    gesture = null
    if (!active) return
    for (const id of active.cards) {
      const element = /** @type {HTMLElement} */ (board.elementFor(id))
      element.classList.remove('card--dragging', 'card--ghost')
      element.style.zIndex = ''
    }
    board.highlightDrop(null)
    finish()
  }

  boardElement.addEventListener('pointerdown', onPointerDown)
  boardElement.addEventListener('pointermove', onPointerMove)
  boardElement.addEventListener('pointerup', onPointerUp)
  boardElement.addEventListener('pointercancel', onPointerCancel)
  boardElement.addEventListener('contextmenu', onContextMenu)

  return {
    clearSelection,
    /** @returns {boolean} whether a drag is in progress */
    get dragging() {
      return Boolean(gesture?.moved)
    },
  }
}
