/**
 * The card model and the opening deal.
 *
 * Card ids double as asset names (`AS`, `10H`, `KD`), so the board can resolve a face image
 * straight from a card without a lookup table.
 */
import { createRng, shuffle } from './rng.js'

/** @typedef {1|2|3|4|5|6|7|8|9|10|11|12|13} Rank */
/** @typedef {'S'|'H'|'C'|'D'} Suit */
/** @typedef {{ id: string, rank: Rank, suit: Suit, faceUp: boolean }} Card */

/** @type {Suit[]} */
export const SUITS = ['S', 'H', 'C', 'D']

/** Display names, indexed to match {@link SUITS}. */
export const SUIT_NAMES = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' }

/** Rank 1..13 to the code used in card ids. */
export const RANK_CODES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export const KING = 13
export const ACE = 1

/** @param {Card} card */
export const isRed = (card) => card.suit === 'H' || card.suit === 'D'

/**
 * @param {Rank} rank
 * @param {Suit} suit
 * @returns {string} the card's stable id
 */
export const cardId = (rank, suit) => `${RANK_CODES[rank]}${suit}`

/**
 * @param {Rank} rank
 * @param {Suit} suit
 * @param {boolean} [faceUp]
 * @returns {Card}
 */
export function createCard(rank, suit, faceUp = false) {
  return { id: cardId(rank, suit), rank, suit, faceUp }
}

/** @returns {Card[]} a fresh, ordered 52-card deck, all face down */
export function createDeck() {
  /** @type {Card[]} */
  const deck = []
  for (const suit of SUITS) {
    for (let rank = ACE; rank <= KING; rank++) {
      deck.push(createCard(/** @type {Rank} */ (rank), suit))
    }
  }
  return deck
}

/**
 * @typedef {object} Piles
 * @property {Card[]} stock face down; the last element is the top of the pile
 * @property {Card[]} waste
 * @property {Card[][]} foundations four piles, each starting empty and taking any Ace
 * @property {Card[][]} tableau seven columns, column `n` holding `n + 1` cards
 */

/**
 * Deals a game: columns of 1..7 cards with only the last of each turned up, the rest to stock.
 * @param {number} gameNumber
 * @returns {Piles}
 */
export function deal(gameNumber) {
  const deck = shuffle(createDeck(), createRng(gameNumber))

  /** @type {Card[][]} */
  const tableau = []
  for (let column = 0; column < 7; column++) {
    const cards = deck.splice(0, column + 1)
    cards[cards.length - 1].faceUp = true
    tableau.push(cards)
  }

  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau }
}
