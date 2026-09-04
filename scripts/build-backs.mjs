/**
 * Converts the eight reference card backs into pixel-perfect SVGs.
 *
 * Each PNG is 540x500 with the art in a 213x288 region at (163,106) that is a clean 3x upscale
 * of the 71x96 grid Windows Solitaire actually used. Recovering that grid and emitting merged
 * rectangles is lossless and scales to any size without blurring.
 *
 * Only needed if the reference art changes -- the output is committed.
 */
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { readPixelGrid, gridToSvg } from './pixel-art.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_DIR = `${root}tmp/reference/cardbacks`
const OUT_DIR = `${root}src/assets/backs`

/** Art region shared by all eight PNGs. */
const REGION = { x: 163, y: 106, width: 213, height: 288, scale: 3 }

/**
 * Source filename -> output slug. The reference set is not consistently named (one file has a
 * space in it), so the mapping is spelled out rather than derived.
 */
const BACKS = [
  ['card1.png', 'fish-blue'],
  ['card2.png', 'fish-cyan'],
  ['card3.png', 'castle'],
  ['card4.png', 'robot'],
  ['card5.png', 'beach'],
  ['card 6.png', 'magician'],
  ['card7.png', 'holly'],
  ['card8.png', 'roses'],
]

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })

  let total = 0
  for (const [file, slug] of BACKS) {
    const grid = await readPixelGrid(`${SOURCE_DIR}/${file}`, REGION)
    // Cards are laid out at the authentic 71:96 ratio, so the art fills its box exactly.
    const svg = gridToSvg(grid)
    await writeFile(`${OUT_DIR}/${slug}.svg`, svg)
    total += svg.length
    console.log(`  ${slug.padEnd(10)} ${grid.width}x${grid.height}  ${(svg.length / 1024).toFixed(1)} KB`)
  }
  console.log(`backs: wrote ${BACKS.length} files to src/assets/backs (${(total / 1024).toFixed(0)} KB)`)
}

await main()
