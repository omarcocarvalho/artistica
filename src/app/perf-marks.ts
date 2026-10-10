export type PerfMarkName = 'layout:start' | 'layout:end' | 'models:end' | 'draw:end'
export interface DrawDetail {
  readonly page: number
}

export interface PerfLike {
  now(): number
  mark(name: string, options?: { detail?: unknown }): unknown
  measure(name: string, options: { start: number; end: number }): unknown
  clearMarks(name: string): void
  clearMeasures(name: string): void
}

export const PERF_PREFIX = 'artistica:'
export const MAX_PERF_ENTRIES = 200

const MARKS: readonly PerfMarkName[] = ['layout:start', 'layout:end', 'models:end', 'draw:end']
const MEASURES = ['layout', 'models'] as const

/**
 * User Timing marks around the layout call, the page models and each page's draw (M5-R27), local
 * to the page. Measures take explicit times, so clearing the marks never breaks one.
 */
export function createPerfMarks(perf: PerfLike | undefined) {
  let entries = 0
  let layoutStart: number | null = null
  let modelsFrom: number | null = null

  const add = (record: () => void) => {
    record()
    if (++entries < MAX_PERF_ENTRIES) return
    entries = 0
    for (const m of MARKS) perf?.clearMarks(PERF_PREFIX + m)
    for (const m of MEASURES) perf?.clearMeasures(PERF_PREFIX + m)
  }
  const measure = (what: (typeof MEASURES)[number], start: number, end: number) => {
    add(() => perf?.measure(PERF_PREFIX + what, { start, end }))
  }

  return (name: PerfMarkName, detail?: DrawDetail): void => {
    try {
      if (!perf) return
      const now = perf.now()
      add(() => perf.mark(PERF_PREFIX + name, detail ? { detail } : undefined))
      if (name === 'layout:start') {
        layoutStart = now
        modelsFrom = null
      } else if (name === 'layout:end') {
        if (layoutStart !== null) measure('layout', layoutStart, now)
        layoutStart = null
        modelsFrom = now
      } else if (name === 'models:end') {
        if (modelsFrom !== null) measure('models', modelsFrom, now)
        modelsFrom = null
      }
    } catch {
      // Timing must never break the preview.
    }
  }
}

export const mark = createPerfMarks(typeof performance === 'undefined' ? undefined : performance)
