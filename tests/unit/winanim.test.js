import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCascade } from '../../src/ui/winanim.js'

/**
 * The cascade is driven by requestAnimationFrame, so these tests stand in for the browser:
 * frames are fired by hand at whatever rate the test chooses, and every card the cascade draws
 * is recorded rather than painted.
 */
function harness(count = 1) {
  /** @type {FrameRequestCallback|null} */
  let pending = null
  /** @type {{ x: number, y: number }[]} */
  const drawn = []
  /** @type {{ x: number, y: number }[]} */
  const cleared = []

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
    clearRect(/** @type {number} */ x, /** @type {number} */ y) {
      cleared.push({ x, y })
    },
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

  let clock = 0

  const cascade = createCascade(canvas, board)
  cascade.start(
    Array.from({ length: count }, () => ({ image, x: 600, y: 50 })),
    layout,
  )

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
        clock = now
        const callback = pending
        pending = null
        callback(now)
      }
      return drawn[drawn.length - 1]
    },
    /** Fires a single frame, `interval` milliseconds after the last one. */
    tick(interval) {
      if (!pending) return
      const callback = pending
      pending = null
      clock += interval
      callback(clock)
    },
    /** Every card drawn so far, frame by frame. */
    drawn,
    /** Draws of cards in flight, leaving out those painted resting on the foundation. */
    get flights() {
      return drawn.filter((at) => at.x !== 600 || at.y !== 50)
    },
    /** Every rectangle wiped back to the board beneath. */
    cleared,
    /** Whether the cascade still has a frame queued. */
    get running() {
      return pending !== null
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
    expect(at60.x).toBeLessThan(600)
  })

  it('does not let a stalled frame throw a card across the board', () => {
    // Each harness owns the stubbed frame callback, so finish one before starting the next.
    const smooth = harness().run(1000 / 60, 1000 / 60)
    // One frame, then nothing for two seconds -- a tab put in the background, say.
    const stalled = harness().run(2000, 2000)
    expect(Math.abs(stalled.x - smooth.x)).toBeLessThan(60)
  })

  it('keeps only one card in flight, launching the next once the last has left', () => {
    const cascade = harness(3)
    let frames = 0
    while (cascade.running && frames < 10000) {
      const before = cascade.flights.length
      cascade.tick(1000 / 60)
      // One draw in flight per frame means one card on the board at a time.
      expect(cascade.flights.length - before).toBeLessThanOrEqual(1)
      frames++
    }
    expect(cascade.running).toBe(false)

    // Each card starts from its foundation, so a jump back towards x = 600 marks a new launch.
    const flights = cascade.flights
    const launches = flights.filter((at, index) => index === 0 || at.x > flights[index - 1].x)
    expect(launches).toHaveLength(3)
  })

  it('sends most cards left and the odd one right', () => {
    const left = harness().run(1000 / 60, 200)
    vi.spyOn(Math, 'random').mockReturnValue(0.05)
    const right = harness().run(1000 / 60, 200)
    expect(left.x).toBeLessThan(600)
    expect(right.x).toBeGreaterThan(600)
  })

  it('shows the card beneath on the foundation as each one leaves', () => {
    const cascade = harness(3)
    // Before anything moves, the top card is painted where it rests.
    expect(cascade.drawn).toEqual([{ x: 600, y: 50 }])

    cascade.tick(1000 / 60)
    // The first launch uncovers the second card, painted in place under the one leaving.
    expect(cascade.drawn.slice(1).filter((at) => at.x === 600 && at.y === 50)).toHaveLength(1)
    expect(cascade.cleared).toHaveLength(0)

    let frames = 0
    while (cascade.running && frames < 10000) {
      cascade.tick(1000 / 60)
      frames++
    }
    // Three cards at rest in turn, then the last launch leaves the foundation empty.
    expect(cascade.drawn.filter((at) => at.x === 600 && at.y === 50)).toHaveLength(3)
    expect(cascade.cleared).toEqual([{ x: 600, y: 50 }])
  })
})
