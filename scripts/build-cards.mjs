/**
 * Splits `tmp/reference/publicdomain-cards.svg` into 52 standalone, optimised card faces.
 *
 * The sheet is a 9x6 grid of 54 groups in document order: spades A-K, hearts A-K, clubs A-K,
 * diamonds A-K, then two jokers (which solitaire does not use). Each group looks like
 * `<g transform="matrix(0.24,0,0,0.24,cx,cy)">` and, once that translate is normalised to the
 * centre of a single cell, its contents occupy exactly a 750x1050 box.
 *
 * Only needed if the reference art changes -- the output is committed.
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { optimize } from 'svgo'

const root = fileURLToPath(new URL('..', import.meta.url))
const SOURCE = `${root}tmp/reference/publicdomain-cards.svg`
const OUT_DIR = `${root}src/assets/cards`

/** Card cell geometry inside the sheet's own coordinate system. */
const CELL_W = 750
const CELL_H = 1050

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['S', 'H', 'C', 'D']

/** Inherited from the sheet's root <svg>; the card paths rely on it. */
const ROOT_STYLE = 'fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round'

/** @type {import('svgo').Config} */
const svgoConfig = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          // The card box is exactly the viewBox, so svgo would otherwise drop it and
          // break scaling.
          removeViewBox: false,
          convertPathData: { floatPrecision: 2 },
          cleanupNumericValues: { floatPrecision: 2 },
        },
      },
    },
  ],
}

/**
 * Finds the byte offsets of every top-level card group in the sheet.
 * @param {string} source
 * @returns {number[]} start offsets, plus a final sentinel at the closing </svg>
 */
function findCardGroups(source) {
  const starts = []
  const marker = /<g transform="matrix\(0\.24,0,0,0\.24,/g
  let match
  while ((match = marker.exec(source)) !== null) starts.push(match.index)
  starts.push(source.lastIndexOf('</svg>'))
  return starts
}

/**
 * @param {number} index 0-based position in the sheet
 * @returns {string} card code such as `AS`, `10H`, `KD`
 */
function cardCode(index) {
  return `${RANKS[index % 13]}${SUITS[Math.floor(index / 13)]}`
}

async function main() {
  const source = await readFile(SOURCE, 'utf8')
  const offsets = findCardGroups(source)
  const groupCount = offsets.length - 1
  if (groupCount !== 54) {
    throw new Error(`expected 54 card groups in the sheet, found ${groupCount}`)
  }

  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })

  let total = 0
  for (let i = 0; i < 52; i++) {
    // `serif:*` attributes are editor metadata; without the sheet's root xmlns declaration
    // they would make each standalone file invalid XML.
    const group = source
      .slice(offsets[i], offsets[i + 1])
      .replace(/\s+serif:[\w-]+="[^"]*"/g, '')
      .trim()

    // Balance check: extraction is offset-based, so a malformed slice must not pass silently.
    const opens = (group.match(/<g[\s>]/g) ?? []).length
    const closes = (group.match(/<\/g>/g) ?? []).length
    if (opens !== closes) {
      throw new Error(`card ${cardCode(i)}: unbalanced groups (${opens} open, ${closes} close)`)
    }

    // Re-centre the card on its own 750x1050 canvas rather than its cell in the sheet.
    const centred = group.replace(
      /^<g transform="matrix\(0\.24,0,0,0\.24,[-\d.]+,[-\d.]+\)">/,
      `<g transform="matrix(0.24,0,0,0.24,${CELL_W / 2},${CELL_H / 2})">`,
    )

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}" ` +
      `viewBox="0 0 ${CELL_W} ${CELL_H}" preserveAspectRatio="none" style="${ROOT_STYLE}">` +
      `${centred}</svg>`

    const { data } = optimize(svg, { ...svgoConfig, path: `${cardCode(i)}.svg` })
    await writeFile(`${OUT_DIR}/${cardCode(i)}.svg`, data)
    total += data.length
  }

  const written = (await readdir(OUT_DIR)).length
  console.log(
    `cards: wrote ${written} files to src/assets/cards (${(total / 1024).toFixed(0)} KB, ` +
      `from ${(source.length / 1024).toFixed(0)} KB of sheet)`,
  )
}

await main()
