import { describe, expect, it } from 'vitest'
import { createDeck, deal, isRed, SUITS } from '../../src/engine/deck.js'
import { createRng, shuffle } from '../../src/engine/rng.js'

describe('deck', () => {
  it('builds 52 distinct cards, 13 of each suit', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map((card) => card.id)).size).toBe(52)
    for (const suit of SUITS) {
      expect(deck.filter((card) => card.suit === suit)).toHaveLength(13)
    }
  })

  it('names cards the way the face assets are named', () => {
    const deck = createDeck()
    expect(deck.map((card) => card.id).slice(0, 13)).toEqual([
      'AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'JS', 'QS', 'KS',
    ])
    expect(deck.at(-1)?.id).toBe('KD')
  })

  it('treats hearts and diamonds as red', () => {
    expect(createDeck().filter(isRed).map((card) => card.suit)).toEqual(
      expect.arrayContaining(['H', 'D']),
    )
    expect(createDeck().filter(isRed)).toHaveLength(26)
  })
})

describe('deal', () => {
  it('lays out seven columns of 1..7 with only the last card up', () => {
    const { tableau, stock, waste, foundations } = deal(12345)

    expect(tableau.map((column) => column.length)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const column of tableau) {
      expect(column.at(-1)?.faceUp).toBe(true)
      expect(column.slice(0, -1).every((card) => !card.faceUp)).toBe(true)
    }
    expect(stock).toHaveLength(24)
    expect(stock.every((card) => !card.faceUp)).toBe(true)
    expect(waste).toEqual([])
    expect(foundations).toEqual([[], [], [], []])
  })

  it('uses every card exactly once', () => {
    const { tableau, stock } = deal(999)
    const ids = [...tableau.flat(), ...stock].map((card) => card.id)
    expect(new Set(ids).size).toBe(52)
  })

  it('is reproducible from the game number and differs between numbers', () => {
    const ids = (n) => deal(n).tableau.flat().map((card) => card.id)
    expect(ids(4242)).toEqual(ids(4242))
    expect(ids(4242)).not.toEqual(ids(4243))
  })
})

describe('shuffle', () => {
  it('permutes rather than loses or duplicates items', () => {
    const items = Array.from({ length: 52 }, (_, i) => i)
    const shuffled = shuffle([...items], createRng(7))
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items)
    expect(shuffled).not.toEqual(items)
  })
})
