/**
 * Entry point: pull in the styles and start the game.
 */
import './styles/win98.css'
import './styles/board.css'
import './styles/decks.css'
import { createApp } from './ui/app.js'

// Exposed as a handle for the end-to-end tests and for poking at a game from the console.
globalThis.solitaire = createApp()
