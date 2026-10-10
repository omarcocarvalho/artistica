import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPerfMarks, MAX_PERF_ENTRIES, PERF_PREFIX, type PerfLike } from './perf-marks'

const ours = () =>
  [...performance.getEntriesByType('mark'), ...performance.getEntriesByType('measure')].filter(
    (e) => e.name.startsWith(PERF_PREFIX),
  )
const named = (name: string) => performance.getEntriesByName(`${PERF_PREFIX}${name}`)

/** A clock the test moves by hand, over the real User Timing API (start/end given explicitly). */
function clocked(): { perf: PerfLike; at: (t: number) => void } {
  let now = 0
  const perf: PerfLike = {
    now: () => now,
    mark: (name, options) => performance.mark(name, { ...options, startTime: now }),
    measure: (name, options) => performance.measure(name, options),
    clearMarks: (name) => {
      performance.clearMarks(name)
    },
    clearMeasures: (name) => {
      performance.clearMeasures(name)
    },
  }
  return {
    perf,
    at: (t) => {
      now = t
    },
  }
}

function clearAll() {
  performance.clearMarks()
  performance.clearMeasures()
}

beforeEach(clearAll)
afterEach(() => {
  clearAll()
  vi.restoreAllMocks()
})

describe('perf marks (M5-R27)', () => {
  it('names every mark artistica:<what>', () => {
    const { perf } = clocked()
    const mark = createPerfMarks(perf)
    mark('layout:start')
    mark('layout:end')
    mark('models:end')
    mark('draw:end', { page: 0 })
    expect(performance.getEntriesByType('mark').map((e) => e.name)).toEqual([
      'artistica:layout:start',
      'artistica:layout:end',
      'artistica:models:end',
      'artistica:draw:end',
    ])
  })

  it('measures artistica:layout from the layout start to its end', () => {
    const { perf, at } = clocked()
    const mark = createPerfMarks(perf)
    at(100)
    mark('layout:start')
    at(340)
    mark('layout:end')
    const [m] = named('layout')
    expect(m?.entryType).toBe('measure')
    expect(m?.startTime).toBe(100)
    expect(m?.duration).toBe(240)
  })

  it('measures artistica:models from the layout end to the models end of the same run', () => {
    const { perf, at } = clocked()
    const mark = createPerfMarks(perf)
    at(10)
    mark('layout:start')
    at(50)
    mark('layout:end')
    at(65)
    mark('models:end')
    const [m] = named('models')
    expect(m?.startTime).toBe(50)
    expect(m?.duration).toBe(15)
  })

  it('does not measure the models of a run that did not lay out (memo hit)', () => {
    const { perf, at } = clocked()
    const mark = createPerfMarks(perf)
    at(10)
    mark('layout:start')
    at(50)
    mark('layout:end')
    at(65)
    mark('models:end')
    at(500)
    mark('models:end')
    expect(named('models')).toHaveLength(1)
    expect(named('models:end')).toHaveLength(2)
  })

  it('a layout start without an end (superseded) is replaced by the next start', () => {
    const { perf, at } = clocked()
    const mark = createPerfMarks(perf)
    at(10)
    mark('layout:start')
    at(200)
    mark('layout:start')
    at(260)
    mark('layout:end')
    const all = named('layout')
    expect(all).toHaveLength(1)
    expect(all[0]?.startTime).toBe(200)
    expect(all[0]?.duration).toBe(60)
  })

  it('a layout end with no start measures nothing', () => {
    const { perf } = clocked()
    createPerfMarks(perf)('layout:end')
    expect(named('layout')).toHaveLength(0)
    expect(named('layout:end')).toHaveLength(1)
  })

  it('records the drawn page in the draw mark, and nothing else', () => {
    const { perf } = clocked()
    createPerfMarks(perf)('draw:end', { page: 3 })
    const [m] = named('draw:end') as PerformanceMark[]
    expect(m?.detail).toEqual({ page: 3 })
  })

  it(`clears its own marks and measures once they reach ${String(MAX_PERF_ENTRIES)}, and nobody else's`, () => {
    const { perf } = clocked()
    const mark = createPerfMarks(perf)
    performance.mark('someone-else')
    for (let i = 0; i < 66; i++) {
      mark('layout:start')
      mark('layout:end') // a mark and a measure
    }
    expect(ours()).toHaveLength(198)
    mark('draw:end', { page: 0 })
    expect(ours()).toHaveLength(199)
    mark('draw:end', { page: 1 })
    expect(ours()).toHaveLength(0)
    mark('draw:end', { page: 2 })
    expect(ours()).toHaveLength(1)
    expect(performance.getEntriesByName('someone-else')).toHaveLength(1)
  })

  it('a layout measure still works when the clear fell between its start and end', () => {
    const { perf, at } = clocked()
    const mark = createPerfMarks(perf)
    for (let i = 0; i < MAX_PERF_ENTRIES - 1; i++) mark('draw:end', { page: 0 })
    at(1000)
    mark('layout:start') // the 200th entry: everything of ours is cleared
    expect(ours()).toHaveLength(0)
    at(1100)
    mark('layout:end')
    expect(named('layout')[0]?.duration).toBe(100)
  })

  it('never throws, even when the User Timing API does', () => {
    const throwing: PerfLike = {
      now: () => 0,
      mark: () => {
        throw new TypeError('no marks here')
      },
      measure: () => {
        throw new TypeError('no measures here')
      },
      clearMarks: () => {
        throw new TypeError('nope')
      },
      clearMeasures: () => {
        throw new TypeError('nope')
      },
    }
    const mark = createPerfMarks(throwing)
    expect(() => {
      for (let i = 0; i < MAX_PERF_ENTRIES + 5; i++) {
        mark('layout:start')
        mark('layout:end')
        mark('models:end')
        mark('draw:end', { page: 0 })
      }
    }).not.toThrow()
    expect(() => { createPerfMarks(undefined)('layout:start'); }).not.toThrow()
  })

  it('stays in the page: no request, no storage', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const store = new Map<string, string>()
    const setItem = vi.fn((k: string, v: string) => store.set(k, v))
    vi.stubGlobal('localStorage', { setItem, getItem: (k: string) => store.get(k) ?? null })
    const { perf } = clocked()
    const mark = createPerfMarks(perf)
    mark('layout:start')
    mark('layout:end')
    mark('models:end')
    mark('draw:end', { page: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
