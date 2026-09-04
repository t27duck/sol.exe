/**
 * Shared helpers for turning the reference pixel art (PNGs that are integer upscales of a
 * small pixel grid) back into an exact grid, and from there into SVG rectangles.
 */
import { readFile } from 'node:fs/promises'
import { PNG } from 'pngjs'

/**
 * @typedef {object} PixelGrid
 * @property {number} width
 * @property {number} height
 * @property {(string|null)[]} pixels row-major CSS colours; `null` is transparent
 */

/**
 * The reference PNGs store the EGA palette with 252 where 255 was meant. Nothing else in the
 * art uses 252, so mapping just that value restores the intended colours losslessly.
 * @param {number} channel
 */
const restoreChannel = (channel) => (channel === 252 ? 255 : channel)

/** @param {number} value */
const hex2 = (value) => value.toString(16).padStart(2, '0')

/**
 * Recovers the original pixel grid from an upscaled PNG by sampling the centre of each block.
 * @param {string} file
 * @param {{ x: number, y: number, width: number, height: number, scale: number }} region
 *   position and size of the art in PNG pixels, plus the integer upscale factor
 * @returns {Promise<PixelGrid>}
 */
export async function readPixelGrid(file, region) {
  const png = PNG.sync.read(await readFile(file))
  const { x, y, width, height, scale } = region
  if (width % scale !== 0 || height % scale !== 0) {
    throw new Error(`${file}: ${width}x${height} is not a multiple of scale ${scale}`)
  }
  const cols = width / scale
  const rows = height / scale
  const half = Math.floor(scale / 2)
  /** @type {(string|null)[]} */
  const pixels = new Array(cols * rows)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = x + col * scale + half
      const sy = y + row * scale + half
      const i = (png.width * sy + sx) << 2
      const alpha = png.data[i + 3]
      pixels[row * cols + col] =
        alpha === 0
          ? null
          : `#${hex2(restoreChannel(png.data[i]))}${hex2(restoreChannel(png.data[i + 1]))}${hex2(
              restoreChannel(png.data[i + 2]),
            )}`
    }
  }
  return { width: cols, height: rows, pixels }
}

/**
 * Covers the grid with as few axis-aligned rectangles as a greedy sweep can manage: grow each
 * unclaimed pixel right while the colour holds, then down while the whole span still matches.
 * @param {PixelGrid} grid
 * @returns {{ colour: string, x: number, y: number, w: number, h: number }[]}
 */
export function mergeToRects({ width, height, pixels }) {
  const claimed = new Uint8Array(width * height)
  const rects = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x
      const colour = pixels[start]
      if (colour === null || claimed[start]) continue

      let w = 1
      while (x + w < width && !claimed[start + w] && pixels[start + w] === colour) w++

      let h = 1
      grow: while (y + h < height) {
        const row = (y + h) * width + x
        for (let dx = 0; dx < w; dx++) {
          if (claimed[row + dx] || pixels[row + dx] !== colour) break grow
        }
        h++
      }

      for (let dy = 0; dy < h; dy++) claimed.fill(1, (y + dy) * width + x, (y + dy) * width + x + w)
      rects.push({ colour, x, y, w, h })
    }
  }
  return rects
}

/**
 * Renders a grid as an SVG: one `<path>` per colour, each rectangle a subpath of horizontal and
 * vertical line commands. Paths beat one `<rect>` per run by a wide margin on the dithered
 * backs, where merging can only ever find small rectangles.
 * @param {PixelGrid} grid
 * @param {{ preserveAspectRatio?: string }} [options]
 */
export function gridToSvg(grid, options = {}) {
  /** @type {Map<string, string[]>} */
  const byColour = new Map()
  for (const { colour, x, y, w, h } of mergeToRects(grid)) {
    // Subpaths are implicitly closed when filled, so no `z` is needed.
    const subpath = `M${x} ${y}h${w}v${h}h-${w}`
    const bucket = byColour.get(colour)
    if (bucket) bucket.push(subpath)
    else byColour.set(colour, [subpath])
  }

  const paths = [...byColour]
    .map(([colour, subpaths]) => `<path fill="${colour}" d="${subpaths.join('')}"/>`)
    .join('')
  const par = options.preserveAspectRatio
    ? ` preserveAspectRatio="${options.preserveAspectRatio}"`
    : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${grid.width}" height="${grid.height}" ` +
    `viewBox="0 0 ${grid.width} ${grid.height}"${par} shape-rendering="crispEdges">${paths}</svg>\n`
  )
}

/**
 * Writes a grid straight out as a PNG at an integer scale -- no rasteriser needed, and the
 * pixel art stays exact.
 * @param {PixelGrid} grid
 * @param {number} scale
 * @param {string|null} background CSS `#rrggbb` to paint behind transparent pixels
 * @returns {Buffer}
 */
export function gridToPng({ width, height, pixels }, scale, background = null) {
  const png = new PNG({ width: width * scale, height: height * scale })
  const bg = background ? parseHex(background) : null

  for (let y = 0; y < height * scale; y++) {
    for (let x = 0; x < width * scale; x++) {
      const colour = pixels[Math.floor(y / scale) * width + Math.floor(x / scale)]
      const rgb = colour ? parseHex(colour) : bg
      const i = (png.width * y + x) << 2
      png.data[i] = rgb ? rgb[0] : 0
      png.data[i + 1] = rgb ? rgb[1] : 0
      png.data[i + 2] = rgb ? rgb[2] : 0
      png.data[i + 3] = rgb ? 255 : 0
    }
  }
  return PNG.sync.write(png)
}

/** @param {string} hex @returns {[number, number, number]} */
function parseHex(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}
