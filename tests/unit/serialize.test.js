import { describe, expect, it } from 'vitest'
import {
  FOUNDATION_IDS,
  TABLEAU_IDS,
  createGame,
  draw,
  getPile,
  move,
  setElapsed,
} from '../../src/engine/game.js'
import { SAVE_VERSION, deserializeGame, serializeGame } from '../../src/engine/serialize.js'

/**
 * Plays real moves so the snapshot has a lived-in board: foundations started, a partly emptied
 * stock, face-up cards uncovered, and an undo history.
 */
function playedGame() {
  const state = createGame({ gameNumber: 4321, drawCount: 3, scoring: 'vegas', timed: true })

  for (let turn = 0; turn < 30; turn++) {
    let played = false
    for (const from of ['waste', ...TABLEAU_IDS]) {
      const pile = getPile(state, from)
      for (let index = 0; index < pile.length && !played; index++) {
        for (const to of [...FOUNDATION_IDS, ...TABLEAU_IDS]) {
          if (move(state, from, to, pile.length - index)) {
            played = true
            break
          }
        }
      }
      if (played) break
    }
    if (!played) draw(state)
  }

  setElapsed(state, 42)
  return state
}

describe('round trip', () => {
  it('restores an in-progress game exactly', () => {
    const state = playedGame()
    const restored = deserializeGame(JSON.parse(JSON.stringify(serializeGame(state))))
    expect(restored).toEqual(state)
  })

  it('keeps face-up state per card', () => {
    const state = createGame({ gameNumber: 7 })
    const restored = deserializeGame(serializeGame(state))
    expect(restored?.tableau.map((column) => column.map((card) => card.faceUp))).toEqual(
      state.tableau.map((column) => column.map((card) => card.faceUp)),
    )
    expect(restored?.stock.every((card) => !card.faceUp)).toBe(true)
  })

  it('stamps the current save version', () => {
    expect(serializeGame(createGame({ gameNumber: 1 })).version).toBe(SAVE_VERSION)
  })
})

describe('rejecting saves it cannot trust', () => {
  const good = () => JSON.parse(JSON.stringify(serializeGame(createGame({ gameNumber: 99 }))))

  it('refuses non-objects', () => {
    expect(deserializeGame(null)).toBeNull()
    expect(deserializeGame('nope')).toBeNull()
    expect(deserializeGame(42)).toBeNull()
  })

  it('refuses a save from a newer build', () => {
    expect(deserializeGame({ ...good(), version: SAVE_VERSION + 1 })).toBeNull()
  })

  it('refuses the wrong number of piles', () => {
    expect(deserializeGame({ ...good(), tableau: [[], [], []] })).toBeNull()
    expect(deserializeGame({ ...good(), foundations: [[], []] })).toBeNull()
  })

  it('refuses a deck that is missing or duplicating a card', () => {
    const missing = good()
    missing.stock.pop()
    expect(deserializeGame(missing)).toBeNull()

    const duplicated = good()
    duplicated.stock[0] = duplicated.stock[1]
    expect(deserializeGame(duplicated)).toBeNull()
  })

  it('refuses card tokens it does not recognise', () => {
    const bogus = good()
    bogus.stock[0] = '1S'
    expect(deserializeGame(bogus)).toBeNull()

    const wrongType = good()
    wrongType.waste = 'AS'
    expect(deserializeGame(wrongType)).toBeNull()
  })

  it('falls back to sane values for out-of-range settings', () => {
    const odd = { ...good(), drawCount: 9, scoring: 'roulette', status: 'exploded', score: 'x' }
    const restored = deserializeGame(odd)
    expect(restored?.drawCount).toBe(1)
    expect(restored?.scoring).toBe('standard')
    expect(restored?.status).toBe('playing')
    expect(restored?.score).toBe(0)
  })
})
