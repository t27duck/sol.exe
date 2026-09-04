import { describe, expect, it } from 'vitest'
import { createCard } from '../../src/engine/deck.js'
import {
  FOUNDATION_IDS,
  TABLEAU_IDS,
  autoFinishStep,
  canAutoFinish,
  canMove,
  canRecycle,
  createGame,
  displayScore,
  draw,
  getPile,
  isStuck,
  isWon,
  move,
  pileKind,
  sendToFoundation,
  setElapsed,
  undo,
} from '../../src/engine/game.js'
import { createRng } from '../../src/engine/rng.js'

const up = (rank, suit) => createCard(rank, suit, true)
const down = (rank, suit) => createCard(rank, suit, false)

/** A game with an empty board, so each test can set up exactly the position it needs. */
function emptyGame(options = {}) {
  const state = createGame({ gameNumber: 1, ...options })
  state.stock = []
  state.waste = []
  state.foundations = [[], [], [], []]
  state.tableau = [[], [], [], [], [], [], []]
  state.history = []
  return state
}

/** A compact fingerprint of everything a move may touch. */
function snapshot(state) {
  return JSON.stringify({
    stock: state.stock,
    waste: state.waste,
    foundations: state.foundations,
    tableau: state.tableau,
    score: state.score,
    passes: state.passes,
    status: state.status,
  })
}

describe('pile addressing', () => {
  it('maps ids to the pile they name', () => {
    expect(pileKind('stock')).toBe('stock')
    expect(pileKind('waste')).toBe('waste')
    expect(pileKind('f2')).toBe('foundation')
    expect(pileKind('t6')).toBe('tableau')
    expect(() => pileKind('nope')).toThrow()

    const state = createGame({ gameNumber: 5 })
    expect(getPile(state, 't6')).toBe(state.tableau[6])
    expect(getPile(state, 'f3')).toBe(state.foundations[3])
  })
})

describe('drawing', () => {
  it('turns one card at a time in draw-one', () => {
    const state = createGame({ gameNumber: 5, drawCount: 1 })
    expect(draw(state)).toBe(true)
    expect(state.waste).toHaveLength(1)
    expect(state.stock).toHaveLength(23)
    expect(state.waste[0].faceUp).toBe(true)
  })

  it('turns three at a time, and whatever is left at the end of the stock', () => {
    const state = createGame({ gameNumber: 5, drawCount: 3 })
    for (let i = 0; i < 8; i++) draw(state)
    expect(state.stock).toHaveLength(0)
    expect(state.waste).toHaveLength(24)

    const short = createGame({ gameNumber: 5, drawCount: 3 })
    short.stock = short.stock.slice(0, 2)
    draw(short)
    expect(short.waste).toHaveLength(2)
  })

  it('restores the original stock order when the waste is turned back over', () => {
    const state = createGame({ gameNumber: 77, drawCount: 3 })
    const before = state.stock.map((card) => card.id)

    while (state.stock.length > 0) draw(state)
    expect(draw(state)).toBe(true)

    expect(state.stock.map((card) => card.id)).toEqual(before)
    expect(state.stock.every((card) => !card.faceUp)).toBe(true)
    expect(state.passes).toBe(1)
  })

  it('does nothing when both stock and waste are empty', () => {
    const state = emptyGame()
    expect(draw(state)).toBe(false)
    expect(state.history).toHaveLength(0)
  })
})

describe('moving cards', () => {
  it('moves a legal run between columns and turns up what it exposes', () => {
    const state = emptyGame()
    state.tableau[0] = [down(5, 'C'), up(10, 'S'), up(9, 'H')]
    state.tableau[1] = [up(11, 'D')]

    expect(move(state, 't0', 't1', 2)).toBe(true)
    expect(state.tableau[1].map((c) => c.id)).toEqual(['JD', '10S', '9H'])
    expect(state.tableau[0]).toHaveLength(1)
    expect(state.tableau[0][0].faceUp).toBe(true)
    expect(state.score).toBe(5) // the flip, since a tableau-to-tableau move scores nothing
  })

  it('refuses runs that are not in sequence', () => {
    const state = emptyGame()
    state.tableau[0] = [up(10, 'S'), up(9, 'S')]
    state.tableau[1] = [up(11, 'D')]
    expect(canMove(state, 't0', 't1', 2)).toBe(false)
    expect(move(state, 't0', 't1', 2)).toBe(false)
  })

  it('only lets one card at a time onto a foundation', () => {
    const state = emptyGame()
    state.tableau[0] = [up(1, 'S'), up(2, 'S')]
    expect(canMove(state, 't0', 'f0', 2)).toBe(false)
  })

  it('scores waste and foundation moves the standard way', () => {
    const state = emptyGame()
    state.waste = [up(1, 'H')]
    state.tableau[0] = [up(13, 'S')]

    move(state, 'waste', 'f0')
    expect(state.score).toBe(10)

    state.waste = [up(12, 'H')]
    move(state, 'waste', 't0')
    expect(state.score).toBe(15) // queen onto the king

    state.waste = [up(2, 'H')]
    move(state, 'waste', 'f0')
    expect(state.score).toBe(25)

    state.tableau[1] = [up(3, 'S')]
    move(state, 'f0', 't1')
    expect(state.score).toBe(10) // 25 - 15 for pulling a card back off a foundation
  })

  it('never lets a non-Vegas score fall below zero', () => {
    const state = emptyGame()
    state.foundations[0] = [up(1, 'H')]
    state.tableau[0] = [up(2, 'S')]
    move(state, 'f0', 't0')
    expect(state.score).toBe(0)
  })

  it('sends a card to the foundation already holding its suit', () => {
    const state = emptyGame()
    state.foundations[1] = [up(1, 'D')]
    state.tableau[0] = [up(2, 'D')]
    expect(sendToFoundation(state, 't0')).toBe(true)
    expect(state.foundations[1]).toHaveLength(2)
    expect(state.foundations[0]).toHaveLength(0)
  })
})

describe('vegas', () => {
  it('starts 52 down and pays 5 a card', () => {
    const state = emptyGame({ scoring: 'vegas' })
    expect(state.score).toBe(-52)

    state.tableau[0] = [up(1, 'S')]
    move(state, 't0', 'f0')
    expect(state.score).toBe(-47)
  })

  it('adds the carried balance to the displayed score only', () => {
    const state = emptyGame({ scoring: 'vegas' })
    expect(displayScore(state, 120)).toBe(68)
    expect(state.score).toBe(-52)
  })

  it('allows no redeal in draw-one and two in draw-three', () => {
    const one = createGame({ gameNumber: 3, drawCount: 1, scoring: 'vegas' })
    while (one.stock.length > 0) draw(one)
    expect(canRecycle(one)).toBe(false)
    expect(draw(one)).toBe(false)

    const three = createGame({ gameNumber: 3, drawCount: 3, scoring: 'vegas' })
    for (let pass = 0; pass < 2; pass++) {
      while (three.stock.length > 0) draw(three)
      expect(draw(three)).toBe(true)
    }
    while (three.stock.length > 0) draw(three)
    expect(canRecycle(three)).toBe(false)
  })
})

describe('the timer', () => {
  it('deducts as the clock runs and does not double-charge on repeat ticks', () => {
    const state = emptyGame({ timed: true })
    state.score = 100

    setElapsed(state, 10)
    expect(state.score).toBe(98)
    setElapsed(state, 10)
    expect(state.score).toBe(98)
    setElapsed(state, 35)
    expect(state.score).toBe(94)
  })

  it('pays a bonus for a timed win', () => {
    const state = emptyGame({ timed: true })
    // Three suits home, diamonds one short: the King of Diamonds wins the game.
    for (const [index, suit] of ['S', 'H', 'C'].entries()) {
      state.foundations[index] = Array.from({ length: 13 }, (_, i) => up(i + 1, suit))
    }
    state.foundations[3] = Array.from({ length: 12 }, (_, i) => up(i + 1, 'D'))
    state.tableau[0] = [up(13, 'D')]
    setElapsed(state, 100)

    move(state, 't0', 'f3')
    expect(state.status).toBe('won')
    expect(isWon(state)).toBe(true)
    expect(state.score).toBe(7010) // 10 for the card, 700000 / 100 bonus
  })
})

describe('undo', () => {
  it('reports nothing to undo on a fresh game', () => {
    expect(undo(createGame({ gameNumber: 1 }))).toBe(false)
  })

  it('restores a flipped card and the points the flip earned', () => {
    const state = emptyGame()
    state.tableau[0] = [down(5, 'C'), up(1, 'S')]

    move(state, 't0', 'f0')
    expect(state.tableau[0][0].faceUp).toBe(true)
    expect(state.score).toBe(15)

    undo(state)
    expect(state.tableau[0][0].faceUp).toBe(false)
    expect(state.tableau[0].map((c) => c.id)).toEqual(['5C', 'AS'])
    expect(state.score).toBe(0)
  })

  it('puts a win back into play', () => {
    const state = emptyGame()
    // Three suits home, diamonds one short: the King of Diamonds wins the game.
    for (const [index, suit] of ['S', 'H', 'C'].entries()) {
      state.foundations[index] = Array.from({ length: 13 }, (_, i) => up(i + 1, suit))
    }
    state.foundations[3] = Array.from({ length: 12 }, (_, i) => up(i + 1, 'D'))
    state.tableau[0] = [up(13, 'D')]
    move(state, 't0', 'f3')
    expect(state.status).toBe('won')

    undo(state)
    expect(state.status).toBe('playing')
    expect(isWon(state)).toBe(false)
  })

  it('is an exact inverse across a long random sequence of play', () => {
    const state = createGame({ gameNumber: 20250904, drawCount: 3, timed: true })
    const rng = createRng(11)
    const snapshots = [snapshot(state)]

    for (let step = 0; step < 400; step++) {
      setElapsed(state, step)
      snapshots.push(snapshot(state))

      // Collect every legal move from this position, then take one at random.
      /** @type {[string, string, number][]} */
      const options = []
      for (const from of ['waste', ...TABLEAU_IDS, ...FOUNDATION_IDS]) {
        const pile = getPile(state, from)
        for (let i = 0; i < pile.length; i++) {
          const count = pile.length - i
          for (const to of [...FOUNDATION_IDS, ...TABLEAU_IDS]) {
            if (canMove(state, from, to, count)) options.push([from, to, count])
          }
        }
      }

      if (options.length === 0 || rng() < 0.35) {
        if (!draw(state)) break
      } else {
        const [from, to, count] = options[Math.floor(rng() * options.length)]
        expect(move(state, from, to, count)).toBe(true)
      }
    }

    // Timed penalties are charged outside the undo stack, so rewind the clock alongside it.
    for (let step = state.history.length; step > 0; step--) {
      expect(undo(state)).toBe(true)
      setElapsed(state, step - 1)
      expect(snapshot(state)).toBe(snapshots[step])
    }
    expect(state.history).toHaveLength(0)
  })
})

describe('auto-finish', () => {
  it('waits until no face-down cards remain', () => {
    const state = createGame({ gameNumber: 8 })
    expect(canAutoFinish(state)).toBe(false)

    for (const column of state.tableau) for (const card of column) card.faceUp = true
    expect(canAutoFinish(state)).toBe(true)
  })

  it('plays a solvable position out to a win', () => {
    const state = emptyGame()
    for (const [index, suit] of ['S', 'H', 'C', 'D'].entries()) {
      // Each column holds one suit, Kings at the bottom, so every card is reachable in order.
      state.tableau[index] = Array.from({ length: 13 }, (_, i) => up(13 - i, suit))
    }

    const context = { idle: 0 }
    let steps = 0
    while (autoFinishStep(state, context)) {
      if (++steps > 200) throw new Error('auto-finish did not terminate')
    }
    expect(state.status).toBe('won')
  })

  it('gives up rather than cycling the stock forever', () => {
    const state = emptyGame()
    state.stock = [down(5, 'C'), down(7, 'H')]
    state.tableau[0] = [up(9, 'S')]

    const context = { idle: 0 }
    let steps = 0
    while (autoFinishStep(state, context)) {
      if (++steps > 50) throw new Error('auto-finish did not terminate')
    }
    expect(state.status).toBe('playing')
  })
})

describe('isStuck', () => {
  it('is false while a move remains', () => {
    const state = emptyGame()
    state.tableau[0] = [up(10, 'S')]
    state.tableau[1] = [up(9, 'H')]
    expect(isStuck(state)).toBe(false)
  })

  it('is true with an exhausted stock and nothing to play', () => {
    const state = emptyGame()
    state.tableau[0] = [down(2, 'C'), up(5, 'S')]
    state.tableau[1] = [down(3, 'C'), up(7, 'H')]
    expect(isStuck(state)).toBe(true)
  })

  it('does not count shuffling a lone King between empty columns as a move', () => {
    const state = emptyGame()
    state.tableau[0] = [up(13, 'S')]
    expect(isStuck(state)).toBe(true)
  })
})
