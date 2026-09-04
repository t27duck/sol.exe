import { describe, expect, it } from 'vitest'
import { createCard } from '../../src/engine/deck.js'
import {
  canPlaceOnFoundation,
  canStackOnTableau,
  isMovableRun,
} from '../../src/engine/rules.js'

const up = (rank, suit) => createCard(rank, suit, true)
const down = (rank, suit) => createCard(rank, suit, false)

describe('canStackOnTableau', () => {
  it('accepts a descending card of the opposite colour', () => {
    expect(canStackOnTableau(up(9, 'H'), up(10, 'S'))).toBe(true)
    expect(canStackOnTableau(up(9, 'D'), up(10, 'C'))).toBe(true)
    expect(canStackOnTableau(up(1, 'S'), up(2, 'H'))).toBe(true)
  })

  it('rejects matching colours, wrong ranks and face-down targets', () => {
    expect(canStackOnTableau(up(9, 'H'), up(10, 'D'))).toBe(false)
    expect(canStackOnTableau(up(9, 'S'), up(10, 'C'))).toBe(false)
    expect(canStackOnTableau(up(8, 'H'), up(10, 'S'))).toBe(false)
    expect(canStackOnTableau(up(11, 'H'), up(10, 'S'))).toBe(false)
    expect(canStackOnTableau(up(9, 'H'), down(10, 'S'))).toBe(false)
  })

  it('only lets a King start an empty column', () => {
    expect(canStackOnTableau(up(13, 'S'), undefined)).toBe(true)
    expect(canStackOnTableau(up(12, 'S'), undefined)).toBe(false)
    expect(canStackOnTableau(up(1, 'S'), undefined)).toBe(false)
  })
})

describe('canPlaceOnFoundation', () => {
  it('starts with an Ace and builds up in suit', () => {
    expect(canPlaceOnFoundation(up(1, 'S'), [])).toBe(true)
    expect(canPlaceOnFoundation(up(2, 'S'), [])).toBe(false)
    expect(canPlaceOnFoundation(up(2, 'S'), [up(1, 'S')])).toBe(true)
    expect(canPlaceOnFoundation(up(2, 'H'), [up(1, 'S')])).toBe(false)
    expect(canPlaceOnFoundation(up(3, 'S'), [up(1, 'S')])).toBe(false)
  })
})

describe('isMovableRun', () => {
  const column = [down(5, 'C'), up(10, 'S'), up(9, 'H'), up(8, 'C')]

  it('accepts a descending alternating run from any face-up index', () => {
    expect(isMovableRun(column, 1)).toBe(true)
    expect(isMovableRun(column, 2)).toBe(true)
    expect(isMovableRun(column, 3)).toBe(true)
  })

  it('rejects face-down cards and broken sequences', () => {
    expect(isMovableRun(column, 0)).toBe(false)
    expect(isMovableRun([up(10, 'S'), up(9, 'S')], 0)).toBe(false)
    expect(isMovableRun([up(10, 'S'), up(8, 'H')], 0)).toBe(false)
  })
})
