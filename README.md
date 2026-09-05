# SOL.EXE

Klondike solitaire for the web, built to play the way Windows Solitaire did: draw one or three,
Standard and Vegas scoring, a timed game with the end-of-game bonus, the eight original card
backs, and the bouncing-card cascade when you win.

It installs to a device as a web app and, once loaded, works with no network at all. The same
board plays on a desktop, and on a phone held either way up.

## Requirements

- **Node.js 22.12 or newer** (any current LTS). Check with `node --version`.
- npm, which ships with Node.

## Getting started

```sh
npm install     # install dependencies
npm run dev     # start the dev server, then open the URL it prints
```

## Building

```sh
npm run build    # production build into dist/
npm run preview  # serve dist/ locally to check the built app
```

`dist/` is a static site — copy it to any web host. The service worker needs the site to be
served over HTTPS (or from `localhost`) for the app to be installable and work offline.

## Testing

```sh
npm test         # unit tests for the game engine (vitest)
npm run test:e2e # browser tests on desktop, mobile portrait and mobile landscape (Playwright)
npm run typecheck # check the JSDoc types
```

The first `npm run test:e2e` needs browsers: `npx playwright install chromium`. The e2e suite
builds the app and serves it on port 4173 itself, so no server needs to be running first.

All three run in GitHub Actions on every push and pull request (`.github/workflows/ci.yml`),
across Node 22 and the current LTS.

## How it is put together

The code is plain ES modules — no framework, no compile step. Types are written as JSDoc
comments and checked on demand by `npm run typecheck`.

```
src/engine/   the rules, scoring and undo. No DOM, no browser APIs; this is what the unit
              tests exercise.
src/ui/       rendering, pointer handling, menus and dialogs.
src/state/    local storage: options, statistics, and the game in progress.
src/assets/   the card art (see below).
```

Every change to a game goes through `apply()` in `src/ui/app.js`, which is the single place
that saves, redraws and checks for a win.

### Card art

`src/assets/` is the source of truth for the artwork. It is committed, and nothing in the build
regenerates it — edit an SVG there and the change ships.

- **Faces** (`src/assets/cards/`), one file per card, were split out of a public-domain sheet of
  54 cards laid out 9 across and 6 down, in the order spades A–K, hearts, clubs, diamonds, then
  two unused jokers. Each occupies a 750×1050 box and is drawn entirely in paths, with no text
  and no fonts, so a card file is self-contained.
- **Backs** (`src/assets/backs/`) are the eight original designs. Each is a 71×96 grid of flat
  colour, redrawn as one SVG path per colour so it scales to any size without blurring rather
  than being an upscaled bitmap.
- **Icons** (`src/assets/icon.svg`, `public/icons/`) come from the original 24×31 pixel icon the
  same way. The PNG sizes the web app manifest needs are whole-number scales of it, which is
  what keeps the pixels square.
- **`src/assets/ui/`** holds the two hand-drawn marks: the arrow on the empty deck, and the
  crossed circle for a Vegas game that has run out of passes.

The one-off tools that originally produced these files are no longer in the tree — they needed
reference art that was never committed, so they could not be run from a clone. They are still in
the history if the derivation is ever wanted: `git log --diff-filter=D -- scripts/`.

## Playing

- **Drag** a card or a run of cards where you want it.
- **Double-click** or **right-click** a card to send it to a foundation.
- **Tap** a card and then tap where it should go — the way to play on a touch screen.
- Click the deck to turn cards; click the empty deck to turn the waste back over.
- `F2` deals a new game, `Ctrl+Z` takes a move back.

Once no face-down cards remain, the game plays the rest out for you.

### Menus

**Game** — Deal, Undo, Select Game (deal a specific numbered game again), Deck (choose one of the
eight card backs), Options, Statistics.
**Help** — About.

Options covers draw one or three, Standard / Vegas / no scoring, carrying the Vegas balance
between games, the timed game, the status bar, and dragging an outline instead of the cards.
Everything is remembered in local storage, along with your statistics and the game you are in
the middle of.
