/**
 * Resolves the generated card art to URLs the browser can load.
 *
 * Everything is imported eagerly so the bundler emits it as a real asset -- which is also what
 * lets the service worker precache the whole deck and keep the game playable offline.
 */
import { RANK_CODES, SUIT_NAMES } from '../engine/deck.js'

/** @typedef {import('../engine/deck.js').Card} Card */

/** @type {Record<string, string>} */
const cardModules = import.meta.glob('../assets/cards/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** @type {Record<string, string>} */
const backModules = import.meta.glob('../assets/backs/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** @param {string} path */
const slugOf = (path) => /** @type {string} */ (path.split('/').pop()).replace('.svg', '')

/** Card id (`AS`, `10H`) to face URL. */
export const CARD_FACES = Object.fromEntries(
  Object.entries(cardModules).map(([path, url]) => [slugOf(path), url]),
)

/** Card back slug to URL. */
export const CARD_BACKS = Object.fromEntries(
  Object.entries(backModules).map(([path, url]) => [slugOf(path), url]),
)

/**
 * The decks, in the order the picker shows them. Names are the art rather than the original
 * Windows numbering, which was never shown to the player anyway.
 */
export const DECKS = [
  { slug: 'fish-blue', name: 'Clownfish' },
  { slug: 'fish-cyan', name: 'Shoal' },
  { slug: 'castle', name: 'Castle' },
  { slug: 'robot', name: 'Robot' },
  { slug: 'beach', name: 'Beach' },
  { slug: 'magician', name: 'Magician' },
  { slug: 'holly', name: 'Holly' },
  { slug: 'roses', name: 'Roses' },
]

/** @param {string} slug @returns {string} the requested back, or the default if it is unknown */
export function backUrl(slug) {
  return CARD_BACKS[slug] ?? CARD_BACKS[DECKS[0].slug]
}

/** @param {Card} card @returns {string} a description for assistive technology */
export function cardName(card) {
  const rank = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' }[RANK_CODES[card.rank]]
  return `${rank ?? RANK_CODES[card.rank]} of ${SUIT_NAMES[card.suit]}`
}
