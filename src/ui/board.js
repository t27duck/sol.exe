/**
 * Draws the board.
 *
 * All 52 card elements are created once and then only ever moved: position is a CSS transform,
 * so a re-render is a handful of custom-property writes and the browser animates the difference
 * on the compositor. Nothing is added to or removed from the DOM during play.
 */
import { FOUNDATION_IDS, TABLEAU_IDS, canRecycle, getPile } from '../engine/game.js'
import { createDeck } from '../engine/deck.js'
import { CARD_FACES, backUrl, cardName } from './assets.js'
import { cardOffsets } from './layout.js'

/** @typedef {import('../engine/game.js').GameState} GameState */
/** @typedef {import('./layout.js').Layout} Layout */
/** @typedef {import('../state/storage.js').Settings} Settings */

/** Render order, which is also stacking order: later piles draw over earlier ones. */
export const PILE_IDS = ['stock', 'waste', ...FOUNDATION_IDS, ...TABLEAU_IDS]

/** Empty-pile labels, so a screen reader hears more than "blank". */
const PILE_LABELS = {
  stock: 'Stock',
  waste: 'Waste',
  f0: 'Foundation 1',
  f1: 'Foundation 2',
  f2: 'Foundation 3',
  f3: 'Foundation 4',
}

/**
 * @param {{ board: HTMLElement, piles: HTMLElement, cards: HTMLElement }} elements
 */
export function createBoard(elements) {
  /** @type {Map<string, HTMLElement>} */
  const pileElements = new Map()
  /** @type {Map<string, HTMLElement>} */
  const cardElements = new Map()

  for (const id of PILE_IDS) {
    const pile = document.createElement('div')
    pile.className = `pile pile--${id[0] === 't' ? 'tableau' : id[0] === 'f' ? 'foundation' : id}`
    pile.dataset.pile = id
    pile.setAttribute('aria-label', PILE_LABELS[id] ?? `Column ${Number(id.slice(1)) + 1}`)
    pileElements.set(id, pile)
    elements.piles.append(pile)
  }

  for (const card of createDeck()) {
    const element = document.createElement('div')
    element.className = 'card card--down'
    element.dataset.card = card.id
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', cardName(card))

    const face = document.createElement('img')
    face.className = 'card__face'
    face.src = CARD_FACES[card.id]
    face.alt = ''
    face.draggable = false
    element.append(face)

    cardElements.set(card.id, element)
    elements.cards.append(element)
  }

  /** @type {Layout|null} */
  let layout = null

  /**
   * @param {HTMLElement} element
   * @param {number} x
   * @param {number} y
   */
  function place(element, x, y) {
    element.style.setProperty('--x', `${x}px`)
    element.style.setProperty('--y', `${y}px`)
  }

  return {
    /** @returns {Layout|null} the geometry the last render used */
    get layout() {
      return layout
    },

    /** @param {string} cardId */
    elementFor(cardId) {
      return cardElements.get(cardId)
    },

    /** @param {string} pileId */
    pileElementFor(pileId) {
      return pileElements.get(pileId)
    },

    /** @param {Settings} settings */
    applySettings(settings) {
      elements.board.style.setProperty('--card-back', `url("${backUrl(settings.cardBack)}")`)
    },

    /**
     * @param {GameState} state
     * @param {Layout} next
     * @param {Settings} settings
     */
    render(state, next, settings) {
      layout = next
      elements.board.style.setProperty('--card-w', `${next.cardW}px`)
      elements.board.style.setProperty('--card-h', `${next.cardH}px`)

      const stock = pileElements.get('stock')
      if (stock) {
        stock.classList.toggle('pile--recyclable', state.stock.length === 0 && canRecycle(state))
        stock.classList.toggle(
          'pile--dead',
          state.stock.length === 0 && state.waste.length > 0 && !canRecycle(state),
        )
      }

      let z = 1
      for (const pileId of PILE_IDS) {
        const origin = next.piles[pileId]
        const pileElement = pileElements.get(pileId)
        if (pileElement) place(pileElement, origin.x, origin.y)

        const pile = getPile(state, pileId)
        const offsets = cardOffsets(next, pileId, pile, state.drawCount)

        pile.forEach((card, index) => {
          const element = /** @type {HTMLElement} */ (cardElements.get(card.id))
          place(element, origin.x + offsets[index].x, origin.y + offsets[index].y)
          element.style.zIndex = String(z++)
          element.classList.toggle('card--down', !card.faceUp)
          element.dataset.pile = pileId
          element.dataset.index = String(index)
          element.setAttribute('aria-hidden', card.faceUp ? 'false' : 'true')
        })
      }
    },

    /**
     * Rectangles a dragged card can be dropped on. A tableau column's target grows with the
     * column so the whole visible stack is a valid place to aim at, not just its top card.
     * @param {GameState} state
     * @returns {{ id: string, x: number, y: number, width: number, height: number }[]}
     */
    dropTargets(state) {
      if (!layout) return []
      const geometry = layout

      return [...FOUNDATION_IDS, ...TABLEAU_IDS].map((id) => {
        const origin = geometry.piles[id]
        const pile = getPile(state, id)
        const offsets = cardOffsets(geometry, id, pile, state.drawCount)
        const last = offsets[offsets.length - 1] ?? { x: 0, y: 0 }
        return {
          id,
          x: origin.x,
          y: origin.y,
          width: geometry.cardW + last.x,
          height: geometry.cardH + last.y,
        }
      })
    },

    /** @param {string|null} pileId highlight a pile as the current drop target */
    highlightDrop(pileId) {
      for (const [id, element] of pileElements) {
        element.classList.toggle('pile--drop', id === pileId)
      }
    },

    /** @param {string[]} cardIds */
    setSelection(cardIds) {
      const selected = new Set(cardIds)
      for (const [id, element] of cardElements) {
        element.classList.toggle('card--selected', selected.has(id))
      }
    },

    /**
     * Marks which cards the player can pick up, so the cursor and hit area match the rules.
     * @param {(cardId: string) => boolean} isPlayable
     */
    markPlayable(isPlayable) {
      for (const [id, element] of cardElements) {
        element.classList.toggle('card--playable', isPlayable(id))
      }
    },

    /** @returns {HTMLElement[]} every card element, for the win cascade to copy */
    allCards() {
      return [...cardElements.values()]
    },
  }
}
