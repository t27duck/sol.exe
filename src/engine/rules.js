/**
 * Pure legality predicates. Nothing here mutates or knows about scoring, timers or the DOM.
 */
import { ACE, KING, isRed } from './deck.js'

/** @typedef {import('./deck.js').Card} Card */

/**
 * Tableau columns build down in alternating colours; an empty column takes a King only.
 * @param {Card} card the card that would land on the column
 * @param {Card|undefined} target the column's current top card, or `undefined` when empty
 */
export function canStackOnTableau(card, target) {
  if (!target) return card.rank === KING
  if (!target.faceUp) return false
  return isRed(card) !== isRed(target) && card.rank === target.rank - 1
}

/**
 * Foundations build up from the Ace in a single suit. Any empty foundation accepts any Ace,
 * which is how Windows Solitaire behaves.
 * @param {Card} card
 * @param {Card[]} foundation
 */
export function canPlaceOnFoundation(card, foundation) {
  const top = foundation[foundation.length - 1]
  if (!top) return card.rank === ACE
  return card.suit === top.suit && card.rank === top.rank + 1
}

/**
 * A run may be picked up from a tableau column when every card from `index` down is face up and
 * forms a descending, alternating-colour sequence.
 * @param {Card[]} column
 * @param {number} index position of the card the player grabbed
 */
export function isMovableRun(column, index) {
  const card = column[index]
  if (!card || !card.faceUp) return false
  for (let i = index; i < column.length - 1; i++) {
    if (!canStackOnTableau(column[i + 1], column[i])) return false
  }
  return true
}

/**
 * How many cards the player would pick up by grabbing `index`.
 * @param {Card[]} column
 * @param {number} index
 */
export function runLength(column, index) {
  return column.length - index
}
