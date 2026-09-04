/**
 * Converts the reference app icon into an SVG plus the PNG sizes a web app manifest needs.
 *
 * The art is a 24x31 pixel grid stored at 8x inside a 540x500 PNG. It is centred on a 32x32
 * board so the icon has the breathing room the platforms expect, and the PNGs are written
 * directly from the grid at integer scales -- no rasteriser dependency, no resampling blur.
 *
 * Only needed if the reference art changes -- the output is committed.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { readPixelGrid, gridToSvg, gridToPng } from './pixel-art.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const SOURCE = `${root}tmp/reference/icon.png`

const REGION = { x: 174, y: 130, width: 192, height: 248, scale: 8 }

/** Felt green, so the maskable icon has a full-bleed background instead of transparent corners. */
const FELT = '#008000'

/**
 * Centres a grid on a larger transparent board.
 * @param {import('./pixel-art.mjs').PixelGrid} grid
 * @param {number} size
 * @returns {import('./pixel-art.mjs').PixelGrid}
 */
function centre(grid, size) {
  const offsetX = Math.floor((size - grid.width) / 2)
  const offsetY = Math.floor((size - grid.height) / 2)
  /** @type {(string|null)[]} */
  const pixels = new Array(size * size).fill(null)
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      pixels[(y + offsetY) * size + x + offsetX] = grid.pixels[y * grid.width + x]
    }
  }
  return { width: size, height: size, pixels }
}

/**
 * Shrinks the art so it survives the safe-zone crop platforms apply to maskable icons.
 * @param {import('./pixel-art.mjs').PixelGrid} grid
 * @param {number} size
 */
function maskable(grid, size) {
  const board = centre(grid, size)
  for (let i = 0; i < board.pixels.length; i++) {
    if (board.pixels[i] === null) board.pixels[i] = FELT
  }
  return board
}

async function main() {
  const art = await readPixelGrid(SOURCE, REGION)
  console.log(`  source art ${art.width}x${art.height}`)

  const board = centre(art, 32)
  await writeFile(`${root}src/assets/icon.svg`, gridToSvg(board))
  await writeFile(`${root}public/favicon.svg`, gridToSvg(board))

  await mkdir(`${root}public/icons`, { recursive: true })
  // 32 * 6 = 192, 32 * 16 = 512: integer scales keep every pixel square.
  await writeFile(`${root}public/icons/icon-192.png`, gridToPng(board, 6))
  await writeFile(`${root}public/icons/icon-512.png`, gridToPng(board, 16))
  await writeFile(`${root}public/icons/apple-touch-icon.png`, gridToPng(maskable(art, 36), 5))
  await writeFile(`${root}public/icons/icon-512-maskable.png`, gridToPng(maskable(art, 40), 13))

  console.log('icons: wrote src/assets/icon.svg, public/favicon.svg and 4 PNGs in public/icons')
}

await main()
