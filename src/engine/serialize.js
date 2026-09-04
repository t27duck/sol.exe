/**
 * Turning a game into something local storage can hold, and back again.
 *
 * Saves are versioned and every read is defensive: a save written by an older build, or one that
 * has been truncated or hand-edited, must never stop the app from starting. When a snapshot
 * cannot be trusted it is simply discarded and the player gets a fresh deal.
 */
import { RANK_CODES, SUITS, createCard } from './deck.js'

/** @typedef {import('./deck.js').Card} Card */
/** @typedef {import('./deck.js').Rank} Rank */
/** @typedef {import('./deck.js').Suit} Suit */
/** @typedef {import('./game.js').GameState} GameState */

export const SAVE_VERSION = 1

/** Face-up cards are marked with a trailing `+`, so `AS` is face down and `AS+` is face up. */
const FACE_UP = '+'

/** @param {Card} card */
const encodeCard = (card) => (card.faceUp ? card.id + FACE_UP : card.id)

/**
 * @param {unknown} token
 * @returns {Card|null} `null` when the token is not a card this build recognises
 */
function decodeCard(token) {
  if (typeof token !== 'string' || token.length < 2) return null

  const faceUp = token.endsWith(FACE_UP)
  const id = faceUp ? token.slice(0, -1) : token
  const suit = /** @type {Suit} */ (id.slice(-1))
  const rank = /** @type {Rank} */ (RANK_CODES.indexOf(id.slice(0, -1)))

  if (!SUITS.includes(suit) || rank < 1) return null
  return createCard(rank, suit, faceUp)
}

/**
 * @param {unknown} value
 * @returns {Card[]|null}
 */
function decodePile(value) {
  if (!Array.isArray(value)) return null
  const cards = value.map(decodeCard)
  return cards.includes(null) ? null : /** @type {Card[]} */ (cards)
}

/**
 * @param {GameState} state
 * @returns {object} a plain, JSON-safe snapshot
 */
export function serializeGame(state) {
  return {
    version: SAVE_VERSION,
    gameNumber: state.gameNumber,
    drawCount: state.drawCount,
    scoring: state.scoring,
    timed: state.timed,
    stock: state.stock.map(encodeCard),
    waste: state.waste.map(encodeCard),
    foundations: state.foundations.map((pile) => pile.map(encodeCard)),
    tableau: state.tableau.map((column) => column.map(encodeCard)),
    score: state.score,
    passes: state.passes,
    elapsed: state.elapsed,
    timePenaltyApplied: state.timePenaltyApplied,
    moves: state.moves,
    status: state.status,
    started: state.started,
    history: state.history,
  }
}

/**
 * Brings a snapshot from an older build up to the current shape. Each step upgrades by exactly
 * one version so future formats only need one more case.
 * @param {any} data
 * @returns {any|null} `null` when the save is from a build newer than this one
 */
function migrate(data) {
  if (data.version > SAVE_VERSION) return null
  // No older formats exist yet; future migrations chain from here.
  return data
}

/**
 * @param {unknown} raw
 * @returns {GameState|null} the restored game, or `null` when the snapshot is unusable
 */
export function deserializeGame(raw) {
  if (!raw || typeof raw !== 'object') return null

  const data = migrate(/** @type {any} */ (raw))
  if (!data) return null

  const stock = decodePile(data.stock)
  const waste = decodePile(data.waste)
  const foundations = Array.isArray(data.foundations) ? data.foundations.map(decodePile) : null
  const tableau = Array.isArray(data.tableau) ? data.tableau.map(decodePile) : null

  if (!stock || !waste || !foundations || !tableau) return null
  if (foundations.length !== 4 || foundations.includes(null)) return null
  if (tableau.length !== 7 || tableau.includes(null)) return null

  const piles = [stock, waste, ...foundations, ...tableau]
  const ids = new Set(piles.flat().map((card) => /** @type {Card} */ (card).id))
  // A game missing or duplicating a card is corrupt however plausible it otherwise looks.
  if (ids.size !== 52) return null

  return {
    gameNumber: Number(data.gameNumber) || 1,
    drawCount: data.drawCount === 3 ? 3 : 1,
    scoring: ['standard', 'vegas', 'none'].includes(data.scoring) ? data.scoring : 'standard',
    timed: Boolean(data.timed),
    stock,
    waste,
    foundations: /** @type {Card[][]} */ (foundations),
    tableau: /** @type {Card[][]} */ (tableau),
    score: Number(data.score) || 0,
    passes: Number(data.passes) || 0,
    elapsed: Number(data.elapsed) || 0,
    timePenaltyApplied: Number(data.timePenaltyApplied) || 0,
    moves: Number(data.moves) || 0,
    history: Array.isArray(data.history) ? data.history : [],
    status: data.status === 'won' ? 'won' : 'playing',
    started: Boolean(data.started),
  }
}
