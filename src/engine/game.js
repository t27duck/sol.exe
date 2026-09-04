/**
 * The game state machine. Every legal change to a game goes through this module, and every
 * change records how to undo itself -- including the exact number of points it awarded -- so
 * undo restores the score rather than trying to re-derive it.
 */
import { deal, KING } from './deck.js'
import { canPlaceOnFoundation, canStackOnTableau, isMovableRun } from './rules.js'
import {
  allowedPasses,
  flipScore,
  moveScore,
  recycleScore,
  startingScore,
  timeBonus,
  timePenaltyAt,
} from './scoring.js'
import { randomGameNumber } from './rng.js'

/** @typedef {import('./deck.js').Card} Card */
/** @typedef {import('./scoring.js').ScoringMode} ScoringMode */
/** @typedef {'stock'|'waste'|'foundation'|'tableau'} PileKind */

/**
 * @typedef {object} GameOptions
 * @property {number} [gameNumber]
 * @property {1|3} [drawCount]
 * @property {ScoringMode} [scoring]
 * @property {boolean} [timed]
 */

/**
 * @typedef {object} MoveRecord
 * @property {'move'|'draw'|'recycle'} kind
 * @property {string} [from] pile id the cards left
 * @property {string} [to] pile id the cards landed on
 * @property {number} count
 * @property {boolean} [flipped] whether the move turned up a card in the source column
 * @property {number} scoreDelta points actually applied, after clamping
 * @property {boolean} [won] whether this move completed the game
 * @property {number} [bonus] time bonus awarded by a winning move
 */

/**
 * @typedef {object} GameState
 * @property {number} gameNumber
 * @property {1|3} drawCount
 * @property {ScoringMode} scoring
 * @property {boolean} timed
 * @property {Card[]} stock
 * @property {Card[]} waste
 * @property {Card[][]} foundations
 * @property {Card[][]} tableau
 * @property {number} score
 * @property {number} passes how many times the waste has been turned back into stock
 * @property {number} elapsed seconds of play
 * @property {number} timePenaltyApplied points already deducted for elapsed time
 * @property {number} moves
 * @property {MoveRecord[]} history
 * @property {'playing'|'won'} status
 * @property {boolean} started whether the player has made their first move
 */

/** Pile ids: `stock`, `waste`, `f0`..`f3`, `t0`..`t6`. */
export const FOUNDATION_IDS = ['f0', 'f1', 'f2', 'f3']
export const TABLEAU_IDS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6']

/**
 * @param {string} pileId
 * @returns {PileKind}
 */
export function pileKind(pileId) {
  if (pileId === 'stock' || pileId === 'waste') return pileId
  if (pileId[0] === 'f') return 'foundation'
  if (pileId[0] === 't') return 'tableau'
  throw new Error(`unknown pile id: ${pileId}`)
}

/**
 * @param {GameState} state
 * @param {string} pileId
 * @returns {Card[]}
 */
export function getPile(state, pileId) {
  switch (pileKind(pileId)) {
    case 'stock':
      return state.stock
    case 'waste':
      return state.waste
    case 'foundation':
      return state.foundations[Number(pileId.slice(1))]
    default:
      return state.tableau[Number(pileId.slice(1))]
  }
}

/** @param {Card[]} pile @returns {Card|undefined} */
export const topOf = (pile) => pile[pile.length - 1]

/**
 * Starts a new game. Options left out keep their defaults, so callers can pass just the
 * settings that changed.
 * @param {GameOptions} [options]
 * @returns {GameState}
 */
export function createGame(options = {}) {
  const gameNumber = options.gameNumber ?? randomGameNumber()
  const scoring = options.scoring ?? 'standard'
  const { stock, waste, foundations, tableau } = deal(gameNumber)

  return {
    gameNumber,
    drawCount: options.drawCount ?? 1,
    scoring,
    timed: options.timed ?? false,
    stock,
    waste,
    foundations,
    tableau,
    score: startingScore(scoring),
    passes: 0,
    elapsed: 0,
    timePenaltyApplied: 0,
    moves: 0,
    history: [],
    status: 'playing',
    started: false,
  }
}

/**
 * Applies a point change. Only Vegas scores go negative; the others floor at zero the way the
 * original did. Returns the delta that was actually applied so it can be undone exactly.
 * @param {GameState} state
 * @param {number} delta
 */
function addScore(state, delta) {
  const before = state.score
  const next = state.scoring === 'vegas' ? before + delta : Math.max(0, before + delta)
  state.score = next
  return next - before
}

/**
 * The score to show the player. Kept separate from {@link GameState.score} only because Vegas
 * cumulative play adds a carried-over balance on top.
 * @param {GameState} state
 * @param {number} [carried] running Vegas total from previous games
 */
export function displayScore(state, carried = 0) {
  return state.scoring === 'vegas' ? state.score + carried : state.score
}

/**
 * Whether the waste may be turned back into stock. The opening deal already counts as the first
 * pass, so the number of recycles available is one fewer than the number of passes allowed.
 * @param {GameState} state
 */
export function canRecycle(state) {
  if (state.stock.length > 0 || state.waste.length === 0) return false
  return state.passes < allowedPasses(state.scoring, state.drawCount) - 1
}

/** @param {GameState} state */
export function isWon(state) {
  return state.foundations.every((pile) => pile.length === 13)
}

/**
 * Turns the game "live" on the first player action, which is what starts the clock.
 * @param {GameState} state
 */
function markStarted(state) {
  state.started = true
}

/**
 * Checks for a completed game and, if the game is timed, folds in the bonus.
 * @param {GameState} state
 * @param {MoveRecord} record
 */
function settleIfWon(state, record) {
  if (state.status !== 'playing' || !isWon(state)) return
  state.status = 'won'
  record.won = true
  const bonus = timeBonus(state.scoring, state.timed, state.elapsed)
  if (bonus) {
    record.bonus = addScore(state, bonus)
    record.scoreDelta += record.bonus
  }
}

/**
 * Turns cards from the stock onto the waste, or turns the waste back over when the stock is
 * spent. Returns whether anything happened.
 * @param {GameState} state
 */
export function draw(state) {
  if (state.status !== 'playing') return false

  if (state.stock.length === 0) {
    if (state.waste.length === 0) return false
    if (!canRecycle(state)) return false

    const count = state.waste.length
    const scoreDelta = addScore(state, recycleScore(state.scoring, state.drawCount, state.score))
    while (state.waste.length > 0) {
      const card = /** @type {Card} */ (state.waste.pop())
      card.faceUp = false
      state.stock.push(card)
    }
    state.passes++
    state.moves++
    markStarted(state)
    state.history.push({ kind: 'recycle', count, scoreDelta })
    return true
  }

  const count = Math.min(state.drawCount, state.stock.length)
  for (let i = 0; i < count; i++) {
    const card = /** @type {Card} */ (state.stock.pop())
    card.faceUp = true
    state.waste.push(card)
  }
  state.moves++
  markStarted(state)
  state.history.push({ kind: 'draw', count, scoreDelta: 0 })
  return true
}

/**
 * Whether `count` cards may be lifted off `fromId`.
 * @param {GameState} state
 * @param {string} fromId
 * @param {number} count
 */
export function canTake(state, fromId, count) {
  const kind = pileKind(fromId)
  if (kind === 'stock') return false

  const pile = getPile(state, fromId)
  if (count < 1 || count > pile.length) return false
  if (kind !== 'tableau') return count === 1

  return isMovableRun(pile, pile.length - count)
}

/**
 * Whether the `count` cards on top of `fromId` may be dropped on `toId`.
 * @param {GameState} state
 * @param {string} fromId
 * @param {string} toId
 * @param {number} [count]
 */
export function canMove(state, fromId, toId, count = 1) {
  if (state.status !== 'playing' || fromId === toId) return false
  if (!canTake(state, fromId, count)) return false

  const moving = getPile(state, fromId).slice(-count)
  const target = getPile(state, toId)

  switch (pileKind(toId)) {
    case 'foundation':
      return count === 1 && canPlaceOnFoundation(moving[0], target)
    case 'tableau':
      return canStackOnTableau(moving[0], topOf(target))
    default:
      return false
  }
}

/**
 * Moves `count` cards from one pile to another, turning up whatever the move exposed.
 * @param {GameState} state
 * @param {string} fromId
 * @param {string} toId
 * @param {number} [count]
 * @returns {boolean} whether the move was legal and applied
 */
export function move(state, fromId, toId, count = 1) {
  if (!canMove(state, fromId, toId, count)) return false

  const from = getPile(state, fromId)
  const to = getPile(state, toId)
  const fromKind = pileKind(fromId)
  const toKind = /** @type {'foundation'|'tableau'} */ (pileKind(toId))

  to.push(...from.splice(from.length - count, count))

  let scoreDelta = addScore(state, moveScore(state.scoring, fromKind, toKind))

  const exposed = topOf(from)
  const flipped = fromKind === 'tableau' && exposed !== undefined && !exposed.faceUp
  if (flipped) {
    /** @type {Card} */ (exposed).faceUp = true
    scoreDelta += addScore(state, flipScore(state.scoring))
  }

  state.moves++
  markStarted(state)

  /** @type {MoveRecord} */
  const record = { kind: 'move', from: fromId, to: toId, count, flipped, scoreDelta }
  settleIfWon(state, record)
  state.history.push(record)
  return true
}

/**
 * Finds a foundation that will take the top card of `fromId`.
 * @param {GameState} state
 * @param {string} fromId
 * @returns {string|null} the foundation's pile id
 */
export function findFoundationFor(state, fromId) {
  const card = topOf(getPile(state, fromId))
  if (!card || !card.faceUp) return null

  // Prefer a foundation already holding this suit so Aces don't scatter across empty piles.
  const suited = FOUNDATION_IDS.find((id) => {
    const pile = getPile(state, id)
    return pile.length > 0 && canPlaceOnFoundation(card, pile)
  })
  if (suited) return suited

  return FOUNDATION_IDS.find((id) => canPlaceOnFoundation(card, getPile(state, id))) ?? null
}

/**
 * The double-click / right-click shortcut: send the top card of a pile to a foundation.
 * @param {GameState} state
 * @param {string} fromId
 */
export function sendToFoundation(state, fromId) {
  const target = findFoundationFor(state, fromId)
  return target ? move(state, fromId, target) : false
}

/**
 * True once no face-down cards remain, which is the point at which the original started playing
 * the rest of the game for you.
 * @param {GameState} state
 */
export function canAutoFinish(state) {
  if (state.status !== 'playing' || isWon(state)) return false
  return state.tableau.every((column) => column.every((card) => card.faceUp))
}

/**
 * Plays one card of the auto-finish. The caller keeps `context` between calls so the routine can
 * tell "cycling the stock looking for a card" apart from "cycling forever with nothing to play".
 * @param {GameState} state
 * @param {{ idle: number }} context
 * @returns {boolean} whether a card was played or drawn
 */
export function autoFinishStep(state, context) {
  if (state.status !== 'playing') return false

  for (const id of ['waste', ...TABLEAU_IDS]) {
    if (sendToFoundation(state, id)) {
      context.idle = 0
      return true
    }
  }

  // Nothing playable right now; turning the stock over may expose something. Give up once a
  // full trip through the remaining cards has produced no move.
  const remaining = state.stock.length + state.waste.length
  if (remaining === 0 || context.idle >= remaining) return false
  if (!draw(state)) return false

  context.idle++
  return true
}

/**
 * Reverses the last change, score included.
 * @param {GameState} state
 * @returns {boolean} whether there was anything to undo
 */
export function undo(state) {
  const record = state.history.pop()
  if (!record) return false

  switch (record.kind) {
    case 'draw':
      for (let i = 0; i < record.count; i++) {
        const card = /** @type {Card} */ (state.waste.pop())
        card.faceUp = false
        state.stock.push(card)
      }
      break

    case 'recycle':
      for (let i = 0; i < record.count; i++) {
        const card = /** @type {Card} */ (state.stock.pop())
        card.faceUp = true
        state.waste.push(card)
      }
      state.passes--
      break

    default: {
      const from = getPile(state, /** @type {string} */ (record.from))
      const to = getPile(state, /** @type {string} */ (record.to))
      if (record.flipped) {
        const exposed = topOf(from)
        if (exposed) exposed.faceUp = false
      }
      from.push(...to.splice(to.length - record.count, record.count))
      break
    }
  }

  state.score -= record.scoreDelta
  if (record.won) state.status = 'playing'
  return true
}

/**
 * Records the clock reading and folds the timed-game penalty into the score. Called once a
 * second by the UI; the penalty already applied is tracked so ticks are idempotent.
 * @param {GameState} state
 * @param {number} seconds
 */
export function setElapsed(state, seconds) {
  state.elapsed = seconds
  const target = timePenaltyAt(state.scoring, state.timed, seconds)
  state.timePenaltyApplied += addScore(state, target - state.timePenaltyApplied)
}

/**
 * True when no legal move remains and the stock cannot be turned again -- used to tell the
 * player a Vegas game is over rather than leaving them poking at a dead board.
 * @param {GameState} state
 */
export function isStuck(state) {
  if (state.status !== 'playing') return false
  if (state.stock.length > 0 || canRecycle(state)) return false

  // Foundations are deliberately not searched: pulling a card back off one is legal but never
  // rescues a dead board, and counting it would mean no game is ever reported as stuck.
  const sources = ['waste', ...TABLEAU_IDS]
  for (const from of sources) {
    const pile = getPile(state, from)
    for (let i = 0; i < pile.length; i++) {
      const count = pile.length - i
      if (!canTake(state, from, count)) continue
      for (const to of [...FOUNDATION_IDS, ...TABLEAU_IDS]) {
        // Shuffling a lone King between empty columns is not progress.
        if (
          pileKind(from) === 'tableau' &&
          count === pile.length &&
          pile[i].rank === KING &&
          getPile(state, to).length === 0
        ) {
          continue
        }
        if (canMove(state, from, to, count)) return false
      }
    }
  }
  return true
}
