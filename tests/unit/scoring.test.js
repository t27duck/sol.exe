import { describe, expect, it } from 'vitest'
import {
  allowedPasses,
  flipScore,
  moveScore,
  recycleScore,
  startingScore,
  timeBonus,
  timePenaltyAt,
} from '../../src/engine/scoring.js'

describe('standard scoring', () => {
  it('pays the documented amounts for each kind of move', () => {
    expect(moveScore('standard', 'waste', 'tableau')).toBe(5)
    expect(moveScore('standard', 'waste', 'foundation')).toBe(10)
    expect(moveScore('standard', 'tableau', 'foundation')).toBe(10)
    expect(moveScore('standard', 'tableau', 'tableau')).toBe(0)
    expect(moveScore('standard', 'foundation', 'tableau')).toBe(-15)
    expect(flipScore('standard')).toBe(5)
  })

  it('charges 100 for a redeal in draw-one only, never below zero', () => {
    expect(recycleScore('standard', 1, 500)).toBe(-100)
    expect(recycleScore('standard', 1, 60)).toBe(-60)
    expect(recycleScore('standard', 1, 0)).toBe(0)
    expect(recycleScore('standard', 3, 500)).toBe(0)
  })

  it('deducts two points per ten seconds and pays a bonus past thirty', () => {
    expect(timePenaltyAt('standard', true, 9)).toBe(0)
    expect(timePenaltyAt('standard', true, 10)).toBe(-2)
    expect(timePenaltyAt('standard', true, 95)).toBe(-18)
    expect(timePenaltyAt('standard', false, 95)).toBe(0)

    expect(timeBonus('standard', true, 30)).toBe(0)
    expect(timeBonus('standard', true, 100)).toBe(7000)
    expect(timeBonus('standard', false, 100)).toBe(0)
  })

  it('allows unlimited passes through the stock', () => {
    expect(allowedPasses('standard', 1)).toBe(Infinity)
    expect(allowedPasses('standard', 3)).toBe(Infinity)
  })
})

describe('vegas scoring', () => {
  it('buys the deck for 52 and pays 5 a card each way', () => {
    expect(startingScore('vegas')).toBe(-52)
    expect(moveScore('vegas', 'tableau', 'foundation')).toBe(5)
    expect(moveScore('vegas', 'waste', 'foundation')).toBe(5)
    expect(moveScore('vegas', 'foundation', 'tableau')).toBe(-5)
    expect(moveScore('vegas', 'waste', 'tableau')).toBe(0)
    expect(flipScore('vegas')).toBe(0)
  })

  it('limits passes to one in draw-one and three in draw-three', () => {
    expect(allowedPasses('vegas', 1)).toBe(1)
    expect(allowedPasses('vegas', 3)).toBe(3)
  })

  it('has no timed penalty or bonus', () => {
    expect(timePenaltyAt('vegas', true, 300)).toBe(0)
    expect(timeBonus('vegas', true, 300)).toBe(0)
  })
})

describe('scoring turned off', () => {
  it('awards nothing at all', () => {
    expect(startingScore('none')).toBe(0)
    expect(moveScore('none', 'waste', 'foundation')).toBe(0)
    expect(moveScore('none', 'foundation', 'tableau')).toBe(0)
    expect(flipScore('none')).toBe(0)
    expect(recycleScore('none', 1, 500)).toBe(0)
  })
})
