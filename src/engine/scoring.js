/**
 * Scoring for the three modes Windows Solitaire offered.
 *
 * Each function returns a point delta for one event; `game.js` records the delta on the undo
 * stack so undoing a move restores the score exactly rather than re-deriving it.
 */

/** @typedef {'standard'|'vegas'|'none'} ScoringMode */

/** Vegas charges $52 for the deck up front and pays $5 a card. */
export const VEGAS_STAKE = -52
export const VEGAS_PER_CARD = 5

/** Standard scoring's penalty for taking another pass through the stock in draw-one. */
export const RECYCLE_PENALTY = -100

/** Timed games lose two points for every ten seconds played. */
export const TIME_PENALTY_INTERVAL = 10
export const TIME_PENALTY = -2

/**
 * How many times the stock may be turned over. Standard play is unlimited; Vegas buys the deck
 * once for draw-one and three times for draw-three.
 * @param {ScoringMode} mode
 * @param {1|3} drawCount
 * @returns {number} `Infinity` when unlimited
 */
export function allowedPasses(mode, drawCount) {
  if (mode !== 'vegas') return Infinity
  return drawCount === 1 ? 1 : 3
}

/** @param {ScoringMode} mode */
export function startingScore(mode) {
  return mode === 'vegas' ? VEGAS_STAKE : 0
}

/**
 * Points for moving a card between two kinds of pile.
 * @param {ScoringMode} mode
 * @param {'stock'|'waste'|'foundation'|'tableau'} from
 * @param {'foundation'|'tableau'} to
 */
export function moveScore(mode, from, to) {
  if (mode === 'none') return 0

  if (mode === 'vegas') {
    if (to === 'foundation') return VEGAS_PER_CARD
    if (from === 'foundation') return -VEGAS_PER_CARD
    return 0
  }

  if (to === 'foundation') return from === 'foundation' ? 0 : 10
  if (from === 'foundation') return -15
  if (from === 'waste') return 5
  return 0
}

/**
 * Points for turning up the card a move exposed in a tableau column.
 * @param {ScoringMode} mode
 */
export function flipScore(mode) {
  return mode === 'standard' ? 5 : 0
}

/**
 * Points for turning the waste back into stock. Standard scoring only penalises draw-one, and
 * never pushes the score below zero.
 * @param {ScoringMode} mode
 * @param {1|3} drawCount
 * @param {number} score the score before the recycle
 */
export function recycleScore(mode, drawCount, score) {
  if (mode !== 'standard' || drawCount !== 1 || score <= 0) return 0
  return Math.max(RECYCLE_PENALTY, -score)
}

/**
 * The running penalty a timed game has applied after `seconds` of play. Callers diff this
 * against the penalty already applied rather than calling it per tick.
 * @param {ScoringMode} mode
 * @param {boolean} timed
 * @param {number} seconds
 */
export function timePenaltyAt(mode, timed, seconds) {
  if (!timed || mode !== 'standard') return 0
  const intervals = Math.floor(seconds / TIME_PENALTY_INTERVAL)
  // Multiplying zero by a negative would hand back -0, which reads oddly everywhere downstream.
  return intervals === 0 ? 0 : intervals * TIME_PENALTY
}

/**
 * The end-of-game bonus a timed win earns. Finishing inside 30 seconds pays nothing extra,
 * matching the original.
 * @param {ScoringMode} mode
 * @param {boolean} timed
 * @param {number} seconds
 */
export function timeBonus(mode, timed, seconds) {
  if (!timed || mode !== 'standard' || seconds <= 30) return 0
  return Math.floor(700000 / seconds)
}
