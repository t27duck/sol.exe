/**
 * Everything the game remembers between visits: options, statistics, and the game in progress.
 *
 * Local storage can be unavailable (private browsing, a browser configured to block it) or full.
 * None of that should stop a game of solitaire, so every access is guarded and failures simply
 * mean the app runs without persistence for that session.
 */
import { serializeGame, deserializeGame } from '../engine/serialize.js'

/** @typedef {import('../engine/game.js').GameState} GameState */
/** @typedef {import('../engine/scoring.js').ScoringMode} ScoringMode */

const KEYS = {
  settings: 'solexe.settings',
  stats: 'solexe.stats',
  game: 'solexe.game',
}

/**
 * @typedef {object} Settings
 * @property {1|3} drawCount
 * @property {ScoringMode} scoring
 * @property {boolean} keepScore carry the Vegas balance across games
 * @property {boolean} timed
 * @property {boolean} statusBar
 * @property {boolean} outlineDragging drag an outline instead of the card itself
 * @property {string} cardBack slug of the chosen back, e.g. `robot`
 */

/** @type {Settings} */
export const DEFAULT_SETTINGS = {
  drawCount: 1,
  scoring: 'standard',
  keepScore: false,
  timed: false,
  statusBar: true,
  outlineDragging: false,
  cardBack: 'fish-blue',
}

/**
 * @typedef {object} Stats
 * @property {number} played
 * @property {number} won
 * @property {number} streak current run of wins
 * @property {number} bestStreak
 * @property {number} bestTime seconds; `0` means no timed win yet
 * @property {number} bestScore
 * @property {number} vegasTotal running Vegas balance when "keep score" is on
 */

/** @type {Stats} */
export const DEFAULT_STATS = {
  played: 0,
  won: 0,
  streak: 0,
  bestStreak: 0,
  bestTime: 0,
  bestScore: 0,
  vegasTotal: 0,
}

/**
 * @returns {Storage|null} local storage, or `null` when the browser will not give us one
 */
function store() {
  try {
    const storage = globalThis.localStorage
    // Touch it: Safari in private mode hands back an object that throws only on write.
    const probe = '__solexe__'
    storage.setItem(probe, probe)
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

/**
 * @param {string} key
 * @returns {unknown}
 */
function read(key) {
  try {
    const raw = store()?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
function write(key, value) {
  try {
    store()?.setItem(key, JSON.stringify(value))
  } catch {
    // A full or read-only storage is not worth interrupting the game for.
  }
}

/** @param {string} key */
function remove(key) {
  try {
    store()?.removeItem(key)
  } catch {
    // See write().
  }
}

/**
 * Merges a stored object over defaults, keeping only keys the defaults declare so an old or
 * tampered-with record cannot introduce unexpected fields.
 * @template {Record<string, any>} T
 * @param {T} defaults
 * @param {unknown} stored
 * @returns {T}
 */
function withDefaults(defaults, stored) {
  const result = { ...defaults }
  if (stored && typeof stored === 'object') {
    for (const key of /** @type {(keyof T)[]} */ (Object.keys(defaults))) {
      const value = /** @type {any} */ (stored)[key]
      if (value !== undefined && typeof value === typeof defaults[key]) result[key] = value
    }
  }
  return result
}

/** @returns {Settings} */
export function loadSettings() {
  return withDefaults(DEFAULT_SETTINGS, read(KEYS.settings))
}

/** @param {Settings} settings */
export function saveSettings(settings) {
  write(KEYS.settings, settings)
}

/** @returns {Stats} */
export function loadStats() {
  return withDefaults(DEFAULT_STATS, read(KEYS.stats))
}

/** @param {Stats} stats */
export function saveStats(stats) {
  write(KEYS.stats, stats)
}

export function clearStats() {
  remove(KEYS.stats)
}

/** @param {GameState} state */
export function saveGame(state) {
  write(KEYS.game, serializeGame(state))
}

/** @returns {GameState|null} */
export function loadGame() {
  return deserializeGame(read(KEYS.game))
}

export function clearGame() {
  remove(KEYS.game)
}
