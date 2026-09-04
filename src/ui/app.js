/**
 * Wiring: the piece that owns the game, the settings and the DOM, and keeps the three in step.
 *
 * Anything that changes the game goes through `apply()`, which is the single place that saves,
 * re-renders and checks for a win -- so no code path can quietly forget one of the three.
 */
import {
  FOUNDATION_IDS,
  canAutoFinish,
  canTake,
  createGame,
  autoFinishStep,
  draw,
  getPile,
  isStuck,
  move,
  sendToFoundation,
  setElapsed,
  undo,
} from '../engine/game.js'
import { randomGameNumber, MAX_GAME_NUMBER } from '../engine/rng.js'
import {
  DEFAULT_SETTINGS,
  clearGame,
  clearStats,
  loadGame,
  loadSettings,
  loadStats,
  saveGame,
  saveSettings,
  saveStats,
} from '../state/storage.js'
import { CARD_BACKS, DECKS } from './assets.js'
import { createBoard } from './board.js'
import { createDragController } from './drag.js'
import { confirmDialog, field, fieldset, showDialog, showMessage } from './dialogs.js'
import { columnProfile, computeLayout } from './layout.js'
import { createMenuBar } from './menu.js'
import { createStatusBar, formatTime } from './statusbar.js'
import { createCascade } from './winanim.js'

/** @typedef {import('../engine/game.js').GameState} GameState */

/** How fast the auto-finish plays the last cards home. */
const AUTO_FINISH_MS = 110

export function createApp() {
  const elements = {
    board: /** @type {HTMLElement} */ (document.getElementById('board')),
    piles: /** @type {HTMLElement} */ (document.getElementById('piles')),
    cards: /** @type {HTMLElement} */ (document.getElementById('cards')),
    cascade: /** @type {HTMLCanvasElement} */ (document.getElementById('cascade')),
    menubar: /** @type {HTMLElement} */ (document.getElementById('menubar')),
    statusbar: /** @type {HTMLElement} */ (document.getElementById('statusbar')),
    score: /** @type {HTMLElement} */ (document.getElementById('status-score')),
    time: /** @type {HTMLElement} */ (document.getElementById('status-time')),
    message: /** @type {HTMLElement} */ (document.getElementById('status-message')),
  }

  let settings = loadSettings()
  let stats = loadStats()

  const board = createBoard(elements)
  const status = createStatusBar({
    root: elements.statusbar,
    score: elements.score,
    time: elements.time,
    message: elements.message,
  })
  const cascade = createCascade(elements.cascade, elements.board)

  /** @type {GameState} */
  let state = restoreOrDeal()
  /** Whether this game has already been counted in the statistics. */
  let recorded = state.status === 'won'
  /** Whether the win has already been celebrated, so a later tap does not replay the cascade. */
  let celebrated = state.status === 'won'
  /** @type {number|null} */
  let clock = null
  /** @type {number|null} */
  let autoFinish = null

  /** Picks up where the player left off, or deals a fresh game with the current settings. */
  function restoreOrDeal() {
    const saved = loadGame()
    if (saved) {
      // The saved game's own rules win: changing them mid-game would rewrite history.
      settings = { ...settings, drawCount: saved.drawCount, scoring: saved.scoring, timed: saved.timed }
      return saved
    }
    return createGame({
      gameNumber: randomGameNumber(),
      drawCount: settings.drawCount,
      scoring: settings.scoring,
      timed: settings.timed,
    })
  }

  // --- rendering -------------------------------------------------------------------------

  /**
   * @param {{ animate?: boolean }} [options] a re-layout is not a move, so it should not
   *   animate the cards into place
   */
  function render(options = {}) {
    const bounds = elements.board.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return

    const instant = options.animate === false
    if (instant) elements.board.classList.add('board--instant')

    const layout = computeLayout(bounds.width, bounds.height, columnProfile(state))
    board.render(state, layout, settings)
    board.markPlayable((cardId) => {
      const element = board.elementFor(cardId)
      const pileId = element?.dataset.pile
      if (!pileId || pileId === 'stock') return false
      const count = getPile(state, pileId).length - Number(element?.dataset.index)
      return canTake(state, pileId, count)
    })
    status.update(state, settings, stats.vegasTotal)

    if (instant) {
      // Flush the new positions before transitions come back, or they animate after all.
      void elements.board.offsetWidth
      elements.board.classList.remove('board--instant')
    }
  }

  /** The single funnel every game change passes through. */
  function apply() {
    saveGame(state)
    render()
    updateClock()

    if (state.status === 'won') {
      if (!celebrated) {
        celebrated = true
        finishGame()
      }
      return
    }

    if (canAutoFinish(state)) startAutoFinish()
    else if (isStuck(state)) status.setMessage('No more moves — press F2 to deal again.')
    else status.setMessage('')
  }

  // --- the clock -------------------------------------------------------------------------

  function updateClock() {
    const shouldRun = state.started && state.status === 'playing'
    if (shouldRun && clock === null) {
      clock = window.setInterval(() => {
        setElapsed(state, state.elapsed + 1)
        status.update(state, settings, stats.vegasTotal)
        saveGame(state)
      }, 1000)
    } else if (!shouldRun && clock !== null) {
      window.clearInterval(clock)
      clock = null
    }
  }

  // --- game lifecycle --------------------------------------------------------------------

  /**
   * Counts a finished game exactly once.
   * @param {boolean} won
   */
  function recordResult(won) {
    if (recorded || !state.started) return
    recorded = true

    stats.played++
    if (won) {
      stats.won++
      stats.streak++
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak)
      if (settings.timed && (stats.bestTime === 0 || state.elapsed < stats.bestTime)) {
        stats.bestTime = state.elapsed
      }
    } else {
      stats.streak = 0
    }
    if (settings.scoring === 'standard') stats.bestScore = Math.max(stats.bestScore, state.score)
    saveStats(stats)
  }

  async function finishGame() {
    recordResult(true)
    stopAutoFinish()
    updateClock()
    status.setMessage('You win!')

    await playCascade()

    const again = await confirmDialog(
      'Solitaire',
      settings.scoring === 'vegas'
        ? `You win! Final score $${state.score}. Deal again?`
        : `You win with ${state.score} points. Deal again?`,
      'Deal',
    )
    if (again) newGame()
  }

  /** @returns {Promise<void>} resolves when the cascade has run its course */
  function playCascade() {
    const layout = board.layout
    if (!layout) return Promise.resolve()

    /** @type {{ image: HTMLImageElement, x: number, y: number }[]} */
    const cards = []
    // Kings first, then queens, and so on -- taking one from each foundation in turn.
    for (let depth = 12; depth >= 0; depth--) {
      for (const pileId of FOUNDATION_IDS) {
        const card = getPile(state, pileId)[depth]
        if (!card) continue
        const element = board.elementFor(card.id)
        const image = element?.querySelector('img')
        if (!element || !image) continue
        cards.push({
          image: /** @type {HTMLImageElement} */ (image),
          x: Number.parseFloat(element.style.getPropertyValue('--x')),
          y: Number.parseFloat(element.style.getPropertyValue('--y')),
        })
      }
    }

    return new Promise((resolve) => cascade.start(cards, layout, resolve))
  }

  function startAutoFinish() {
    if (autoFinish !== null) return
    const context = { idle: 0 }
    autoFinish = window.setInterval(() => {
      if (!autoFinishStep(state, context)) {
        stopAutoFinish()
        apply()
        return
      }
      saveGame(state)
      render()
    }, AUTO_FINISH_MS)
  }

  function stopAutoFinish() {
    if (autoFinish === null) return
    window.clearInterval(autoFinish)
    autoFinish = null
  }

  /** @param {number} [gameNumber] */
  function newGame(gameNumber) {
    stopAutoFinish()
    cascade.stop()

    if (state.started) {
      recordResult(state.status === 'won')
      if (settings.scoring === 'vegas' && settings.keepScore) {
        stats.vegasTotal += state.score
        saveStats(stats)
      }
    }

    recorded = false
    celebrated = false
    state = createGame({
      gameNumber: gameNumber ?? randomGameNumber(),
      drawCount: settings.drawCount,
      scoring: settings.scoring,
      timed: settings.timed,
    })
    drag.clearSelection()
    clearGame()
    apply()
  }

  // --- player actions --------------------------------------------------------------------

  const drag = createDragController({
    boardElement: elements.board,
    board,
    getState: () => state,
    getSettings: () => settings,
    onMove: (from, to, count) => move(state, from, to, count),
    onDraw: () => {
      if (cascade.running) return
      draw(state)
    },
    onSendToFoundation: (pileId) => sendToFoundation(state, pileId),
    onChange: apply,
    isBlocked: () => cascade.running,
  })

  function undoMove() {
    if (cascade.running) return
    stopAutoFinish()
    if (!undo(state)) return
    // Taking a winning move back puts the game back in play, cascade and all.
    if (state.status === 'playing') celebrated = false
    apply()
  }

  // --- dialogs ---------------------------------------------------------------------------

  async function openOptions() {
    const body = document.createElement('form')

    const draws = fieldset('Draw', [
      field('radio', 'draw', 'Draw one', settings.drawCount === 1, '1'),
      field('radio', 'draw', 'Draw three', settings.drawCount === 3, '3'),
    ])
    const scoring = fieldset('Scoring', [
      field('radio', 'scoring', 'Standard', settings.scoring === 'standard', 'standard'),
      field('radio', 'scoring', 'Vegas', settings.scoring === 'vegas', 'vegas'),
      field('radio', 'scoring', 'None', settings.scoring === 'none', 'none'),
    ])
    const extras = fieldset('Options', [
      field('checkbox', 'timed', 'Timed game', settings.timed),
      field('checkbox', 'statusBar', 'Status bar', settings.statusBar),
      field('checkbox', 'outlineDragging', 'Outline dragging', settings.outlineDragging),
      field('checkbox', 'keepScore', 'Keep score (Vegas)', settings.keepScore),
    ])
    body.append(draws, scoring, extras)

    const answer = await showDialog({
      title: 'Options',
      body,
      buttons: [
        { value: 'ok', label: 'OK', primary: true },
        { value: 'cancel', label: 'Cancel' },
      ],
    })
    if (answer !== 'ok') return

    /** @param {string} name */
    const radio = (name) =>
      /** @type {HTMLInputElement} */ (body.querySelector(`input[name="${name}"]:checked`))?.value
    /** @param {string} name */
    const checkbox = (name) =>
      /** @type {HTMLInputElement} */ (body.querySelector(`input[name="${name}"]`)).checked

    const next = {
      ...settings,
      drawCount: /** @type {1|3} */ (radio('draw') === '3' ? 3 : 1),
      scoring: /** @type {import('../engine/scoring.js').ScoringMode} */ (
        radio('scoring') ?? settings.scoring
      ),
      timed: checkbox('timed'),
      statusBar: checkbox('statusBar'),
      outlineDragging: checkbox('outlineDragging'),
      keepScore: checkbox('keepScore'),
    }

    // Draw count, scoring and the timer are baked into a deal, so changing them needs a new one.
    const needsDeal =
      next.drawCount !== settings.drawCount ||
      next.scoring !== settings.scoring ||
      next.timed !== settings.timed

    if (needsDeal && state.started && state.status === 'playing') {
      const confirmed = await confirmDialog(
        'Options',
        'Changing these options will start a new game. The game in progress will count as a loss.',
        'Start new game',
      )
      if (!confirmed) return
    }

    settings = next
    saveSettings(settings)
    status.setVisible(settings.statusBar)

    if (needsDeal) newGame()
    else apply()
  }

  async function openDeck() {
    const body = document.createElement('div')
    body.className = 'decks'
    let chosen = settings.cardBack

    for (const deck of DECKS) {
      const option = document.createElement('button')
      option.type = 'button'
      option.className = 'decks__option'
      option.setAttribute('role', 'radio')
      option.setAttribute('aria-checked', String(deck.slug === chosen))
      option.title = deck.name

      const preview = document.createElement('img')
      preview.src = CARD_BACKS[deck.slug]
      preview.alt = deck.name
      option.append(preview)

      option.addEventListener('click', () => {
        chosen = deck.slug
        for (const sibling of body.children) {
          sibling.setAttribute('aria-checked', String(sibling === option))
        }
      })
      body.append(option)
    }

    const answer = await showDialog({
      title: 'Select Card Back',
      body,
      buttons: [
        { value: 'ok', label: 'OK', primary: true },
        { value: 'cancel', label: 'Cancel' },
      ],
    })
    if (answer !== 'ok') return

    settings = { ...settings, cardBack: chosen }
    saveSettings(settings)
    board.applySettings(settings)
  }

  async function openStatistics() {
    const body = document.createElement('div')
    const percent = stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100)

    const rows = [
      ['Games played', String(stats.played)],
      ['Games won', String(stats.won)],
      ['Win rate', `${percent}%`],
      ['Current streak', String(stats.streak)],
      ['Best streak', String(stats.bestStreak)],
      ['Best time', stats.bestTime ? formatTime(stats.bestTime) : '—'],
      ['Best score', String(stats.bestScore)],
      ['Vegas balance', `$${stats.vegasTotal}`],
    ]

    const table = document.createElement('table')
    table.className = 'stats'
    for (const [label, value] of rows) {
      const row = table.insertRow()
      const heading = document.createElement('th')
      heading.scope = 'row'
      heading.textContent = label
      const cell = row.insertCell()
      cell.textContent = value
      row.prepend(heading)
    }
    body.append(table)

    const answer = await showDialog({
      title: 'Statistics',
      body,
      buttons: [
        { value: 'ok', label: 'OK', primary: true },
        { value: 'reset', label: 'Reset' },
      ],
    })

    if (answer === 'reset') {
      const confirmed = await confirmDialog('Statistics', 'Clear all statistics?', 'Reset')
      if (!confirmed) return
      clearStats()
      stats = loadStats()
      render()
    }
  }

  async function openSelectGame() {
    const body = document.createElement('div')
    const label = document.createElement('label')
    label.textContent = `Game number (1 to ${MAX_GAME_NUMBER}):`
    label.htmlFor = 'game-number'

    const input = document.createElement('input')
    input.id = 'game-number'
    input.type = 'number'
    input.min = '1'
    input.max = String(MAX_GAME_NUMBER)
    input.value = String(state.gameNumber)
    input.style.width = '100%'
    input.style.marginTop = '6px'

    body.append(label, input)

    const answer = await showDialog({
      title: 'Select Game',
      body,
      buttons: [
        { value: 'ok', label: 'OK', primary: true },
        { value: 'cancel', label: 'Cancel' },
      ],
    })
    if (answer !== 'ok') return

    const chosen = Math.trunc(Number(input.value))
    if (!Number.isFinite(chosen) || chosen < 1 || chosen > MAX_GAME_NUMBER) {
      await showMessage('Select Game', `Please enter a number from 1 to ${MAX_GAME_NUMBER}.`)
      return
    }
    newGame(chosen)
  }

  function openAbout() {
    const body = document.createElement('div')
    body.innerHTML =
      '<p style="margin-top:0"><strong>SOL.EXE</strong><br>Klondike solitaire, the way Windows played it.</p>' +
      '<p>Drag a card, or double-click and right-click to send it home. ' +
      'On a touch screen, tap a card and then tap where it should go.</p>' +
      '<p>Card faces are public-domain artwork. Card backs and the icon are the original ' +
      'pixel art, rebuilt as vectors.</p>'
    const number = document.createElement('p')
    number.textContent = `Game #${state.gameNumber}`
    body.append(number)
    return showDialog({ title: 'About Solitaire', body })
  }

  // --- menus and keys --------------------------------------------------------------------

  createMenuBar(elements.menubar, [
    {
      id: 'game',
      label: 'Game',
      items: () => [
        { label: 'Deal', shortcut: 'F2', action: () => newGame() },
        { label: 'Undo', shortcut: 'Ctrl+Z', action: undoMove, disabled: state.history.length === 0 },
        { separator: true },
        { label: 'Select Game…', action: openSelectGame },
        { label: 'Deck…', action: openDeck },
        { label: 'Options…', action: openOptions },
        { separator: true },
        { label: 'Statistics…', action: openStatistics },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: () => [{ label: 'About Solitaire…', action: openAbout }],
    },
  ])

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return

    if (event.key === 'F2') {
      event.preventDefault()
      newGame()
    } else if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      undoMove()
    } else if (event.key === 'Escape' && cascade.running) {
      cascade.stop()
    }
  })

  // Stop the cascade on any deliberate interaction, the way the original did.
  elements.board.addEventListener('pointerdown', () => {
    if (cascade.running) cascade.stop()
  })

  // --- start -----------------------------------------------------------------------------

  new ResizeObserver(() => {
    if (!drag.dragging && !cascade.running) render({ animate: false })
  }).observe(elements.board)

  window.addEventListener('beforeunload', () => saveGame(state))

  status.setVisible(settings.statusBar)
  board.applySettings(settings)
  apply()
  render({ animate: false })

  return {
    newGame,
    /** Re-reads the game and redraws. Public so a test can set a position up and hand back. */
    refresh: apply,
    get state() {
      return state
    },
  }
}

export { DEFAULT_SETTINGS }
