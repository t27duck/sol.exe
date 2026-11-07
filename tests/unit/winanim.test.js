import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCascade } from '../../src/ui/winanim.js'

/**
 * The cascade is driven by requestAnimationFrame, so these tests stand in for the browser:
 * frames are fired by hand at whatever rate the test chooses, and every card the cascade draws
 * is recorded rather than painted.
 */
function harness() {
  /** @type {FrameRequestCallback|null} */
  let pending = null
  /** @type {{ x: number, y: number }[]} */
  const drawn = []

  vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('HTMLCanvasElement', class {})
  vi.stubGlobal('requestAnimationFrame', (/** @type {FrameRequestCallback} */ callback) => {
    pending = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null
  })

  const context = {
    setTransform() {},
    drawImage(/** @type {unknown} */ _image, /** @type {number} */ x, /** @type {number} */ y) {
      drawn.push({ x, y })
    },
  }
  const canvas = /** @type {any} */ ({ width: 0, height: 0, getContext: () => context })
  const board = /** @type {any} */ ({
    clientWidth: 1280,
    clientHeight: 650,
    classList: { add() {}, remove() {} },
  })
  // An image that has not loaded is drawn as it is, which keeps document out of the picture.
  const image = /** @type {any} */ ({ complete: false, naturalWidth: 0 })
  const layout = /** @type {any} */ ({ cardW: 71, cardH: 96 })

  const cascade = createCascade(canvas, board)
  cascade.start([{ image, x: 100, y: 50 }], layout)

  return {
    cascade,
    /**
     * Fires frames `interval` milliseconds apart until `until` milliseconds have passed.
     * @param {number} interval
     * @param {number} until
     * @returns {{ x: number, y: number }} where the card was last drawn
     */
    run(interval, until) {
      for (let now = 0; now <= until + 1e-6 && pending; now += interval) {
        const callback = pending
        pending = null
        callback(now)
      }
      return drawn[drawn.length - 1]
    },
  }
}

describe('the win cascade', () => {
  beforeEach(() => {
    // Every card launches with the same velocity, so runs can be compared.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('moves a card the same distance whatever the display refresh rate', () => {
    const at60 = harness().run(1000 / 60, 500)
    const at120 = harness().run(1000 / 120, 500)
    const at144 = harness().run(1000 / 144, 500)

    // The integration differs slightly with the step size, so allow a few pixels over half a
    // second of travel; running per frame instead would put the faster displays twice as far on.
    expect(Math.abs(at120.x - at60.x)).toBeLessThan(3)
    expect(Math.abs(at144.x - at60.x)).toBeLessThan(3)
    expect(Math.abs(at120.y - at60.y)).toBeLessThan(6)
    expect(at60.x).toBeGreaterThan(100)
  })

  it('does not let a stalled frame throw a card across the board', () => {
    // Each harness owns the stubbed frame callback, so finish one before starting the next.
    const smooth = harness().run(1000 / 60, 1000 / 60)
    // One frame, then nothing for two seconds -- a tab put in the background, say.
    const stalled = harness().run(2000, 2000)
    expect(Math.abs(stalled.x - smooth.x)).toBeLessThan(60)
  })
})
