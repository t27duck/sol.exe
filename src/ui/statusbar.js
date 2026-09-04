/**
 * The status bar: score on the left, clock next to it, and a line of commentary on the right.
 */
import { displayScore } from '../engine/game.js'

/** @typedef {import('../engine/game.js').GameState} GameState */

/**
 * @param {number} seconds
 * @returns {string} `m:ss`, or `h:mm:ss` once a game runs long
 */
export function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = Math.floor(seconds % 60)
  const padded = `${minutes.toString().padStart(hours ? 2 : 1, '0')}:${rest
    .toString()
    .padStart(2, '0')}`
  return hours ? `${hours}:${padded}` : padded
}

/**
 * @param {{ root: HTMLElement, score: HTMLElement, time: HTMLElement, message: HTMLElement }} elements
 */
export function createStatusBar(elements) {
  return {
    /** @param {boolean} visible */
    setVisible(visible) {
      elements.root.hidden = !visible
    },

    /** @param {string} text */
    setMessage(text) {
      elements.message.textContent = text
    },

    /**
     * @param {GameState} state
     * @param {import('../state/storage.js').Settings} settings
     * @param {number} vegasTotal balance carried in from previous Vegas games
     */
    update(state, settings, vegasTotal) {
      const carried = settings.scoring === 'vegas' && settings.keepScore ? vegasTotal : 0

      elements.score.textContent =
        settings.scoring === 'none'
          ? `Game #${state.gameNumber}`
          : settings.scoring === 'vegas'
            ? `Score: $${displayScore(state, carried)}`
            : `Score: ${displayScore(state)}`

      elements.time.textContent = settings.timed
        ? `Time: ${formatTime(state.elapsed)}`
        : `Game #${state.gameNumber}`

      // With scoring off and the timer hidden there is nothing left to say on the left.
      elements.time.hidden = settings.scoring === 'none' && !settings.timed
    },
  }
}
