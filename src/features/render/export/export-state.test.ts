import { describe, expect, it } from 'vitest'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import {
  INITIAL_EXPORT_STATE,
  exportReducer,
  exportSummary,
  pageSteps,
  type ExportState,
} from './export-state'
import { pdfFileName, sanitizePdfFileName } from './file-name'

const running = (pageIndex: number, pageCount = 3): ExportState => ({
  status: 'running',
  progress: { pageIndex, pageCount, fraction: pageIndex / pageCount },
})

describe('exportReducer', () => {
  it('runs ready → running → done', () => {
    let s = exportReducer(INITIAL_EXPORT_STATE, { type: 'start', pageCount: 2 })
    expect(s).toEqual({ status: 'running', progress: { pageIndex: 0, pageCount: 2, fraction: 0 } })
    s = exportReducer(s, {
      type: 'progress',
      progress: { pageIndex: 1, pageCount: 2, fraction: 0.5 },
    })
    expect(s).toMatchObject({ progress: { pageIndex: 1 } })
    expect(exportReducer(s, { type: 'done', url: 'blob:x' })).toEqual({
      status: 'done',
      url: 'blob:x',
    })
  })
  it('goes to error from running only', () => {
    expect(exportReducer(running(0), { type: 'error', code: 'failed' })).toEqual({
      status: 'error',
      code: 'failed',
    })
    expect(exportReducer(INITIAL_EXPORT_STATE, { type: 'error', code: 'failed' })).toBe(
      INITIAL_EXPORT_STATE,
    )
  })
  it('ignores late progress/done after cancel', () => {
    const cancelled = exportReducer(running(1), { type: 'cancel' })
    expect(cancelled).toBe(INITIAL_EXPORT_STATE)
    expect(
      exportReducer(cancelled, {
        type: 'progress',
        progress: { pageIndex: 2, pageCount: 3, fraction: 0.9 },
      }),
    ).toBe(cancelled)
    expect(exportReducer(cancelled, { type: 'done', url: 'blob:late' })).toBe(cancelled)
  })
  it('resets from done', () => {
    expect(exportReducer({ status: 'done', url: 'blob:x' }, { type: 'reset' })).toBe(
      INITIAL_EXPORT_STATE,
    )
  })
})

describe('pageSteps', () => {
  it('marks pages before the current one done', () => {
    expect(pageSteps(running(1), 3)).toEqual(['done', 'active', 'todo'])
    expect(pageSteps(INITIAL_EXPORT_STATE, 2)).toEqual(['todo', 'todo'])
    expect(pageSteps({ status: 'done', url: 'u' }, 2)).toEqual(['done', 'done'])
  })
})

describe('exportSummary', () => {
  it('counts pages, tiles and distinct images', () => {
    const pages = [
      pageModel([drawTile({ imageId: id('a') }), drawTile({ imageId: id('a') })], {
        cropMarks: [{ x1: 19, y1: 20, x2: 15, y2: 20 }],
      }),
      pageModel([drawTile({ imageId: id('b') })], { index: 1 }),
    ]
    expect(exportSummary(pages, 'A4')).toEqual({
      pageCount: 2,
      paperLabel: 'A4',
      orientation: 'portrait',
      tileCount: 3,
      imageCount: 2,
      cropMarks: true,
      bleedMm: null,
    })
  })
  it('reports landscape and bleed', () => {
    const s = exportSummary(
      [pageModel([drawTile({ bleedMm: 3 })], { size: { w: 297, h: 210 } })],
      'Letter',
    )
    expect(s.orientation).toBe('landscape')
    expect(s.bleedMm).toBe(3)
    expect(s.cropMarks).toBe(false)
  })
})

describe('pdfFileName (D10)', () => {
  it('formats paper and local date', () => {
    expect(pdfFileName('A4', new Date(2026, 9, 3, 23, 59))).toBe('artistica-A4-2026-10-03.pdf')
    expect(pdfFileName('Letter', new Date(2026, 0, 9))).toBe('artistica-Letter-2026-01-09.pdf')
    expect(pdfFileName('Custom', new Date(2026, 11, 31))).toBe('artistica-Custom-2026-12-31.pdf')
    expect(pdfFileName(' A/4 ', new Date(2026, 9, 3))).toBe('artistica-A-4-2026-10-03.pdf')
    expect(pdfFileName('Letter (US)', new Date(2026, 9, 3))).toBe(
      'artistica-Letter-US-2026-10-03.pdf',
    )
    expect(pdfFileName('', new Date(2026, 9, 3))).toBe('artistica-Custom-2026-10-03.pdf')
  })
})

describe('sanitizePdfFileName', () => {
  it('keeps good names, adds .pdf, strips separators, falls back when empty', () => {
    expect(sanitizePdfFileName('sheet.pdf', 'f.pdf')).toBe('sheet.pdf')
    expect(sanitizePdfFileName(' my sheet ', 'f.pdf')).toBe('my sheet.pdf')
    expect(sanitizePdfFileName('a/b:c', 'f.pdf')).toBe('a-b-c.pdf')
    expect(sanitizePdfFileName('   ', 'f.pdf')).toBe('f.pdf')
    expect(sanitizePdfFileName('X.PDF', 'f.pdf')).toBe('X.PDF')
  })
})
