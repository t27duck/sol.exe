/**
 * Seeded pseudo-random numbers.
 *
 * Every deal is derived from a game number, so a game can be replayed exactly, shared, and --
 * importantly for the test suite -- asserted against.
 */

/** Game numbers are shown to the player, so keep them in a friendly range. */
export const MAX_GAME_NUMBER = 1000000

/**
 * Mulberry32: small, fast, and good enough for shuffling a deck.
 * @param {number} seed
 * @returns {() => number} generator yielding floats in [0, 1)
 */
export function createRng(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** @returns {number} a fresh game number in `[1, MAX_GAME_NUMBER]` */
export function randomGameNumber() {
  return Math.floor(Math.random() * MAX_GAME_NUMBER) + 1
}

/**
 * Fisher-Yates, in place, driven by a seeded generator.
 * @template T
 * @param {T[]} items
 * @param {() => number} rng
 * @returns {T[]} the same array, shuffled
 */
export function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}
