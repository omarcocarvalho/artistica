import { describe, expect, it } from 'vitest'
import type { ImageDescriptor, ImageEdits } from '../../../shared/model/image'
import { DEFAULT_LINES, type LinesPatch, patchLines } from '../../../shared/model/lines'
import { DEFAULT_STUDY } from '../../../shared/model/study'
import { descriptor } from '../../render/test-support/fixtures'
import type { EdgeOutline, FaceLandmarks, PoseLandmarks } from '../guides/types'
import {
  type DetectionsState,
  type DetectionStatus,
  detectionKey,
  type GuideKind,
  guidesFor,
  guidesPending,
  INITIAL_DETECTIONS,
  useDetections,
} from './store'

function img(
  name: string,
  lines: LinesPatch = {},
  edits: Partial<ImageEdits> = {},
  hash = `h${name}`,
): ImageDescriptor {
  const base = descriptor(name, 1000, 500, edits)
  return { ...base, contentHash: hash, lines: patchLines(DEFAULT_LINES, lines) }
}

const FACE: FaceLandmarks[] = [{ points: [{ x: 0.5, y: 0.5 }] }]
const POSE: PoseLandmarks[] = [{ points: [{ x: 0.1, y: 0.2 }], visibility: [1] }]
const EDGES: EdgeOutline = {
  polylines: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  ],
}

function state(
  results: [string, FaceLandmarks[] | PoseLandmarks[] | EdgeOutline][] = [],
  status: [string, DetectionStatus][] = [],
): DetectionsState {
  return { ...INITIAL_DETECTIONS, results: new Map(results), status: new Map(status) }
}

describe('detectionKey', () => {
  const on: LinesPatch = { face: true, pose: true, edges: { on: true, detailPct: 50 } }

  it.each<[GuideKind, LinesPatch, Partial<ImageEdits>, string]>([
    ['face', on, {}, 'face|abc|r0'],
    ['face', on, { rotation: 90 }, 'face|abc|r90'],
    ['pose', on, { rotation: 270 }, 'pose|abc|r270'],
    ['edges', on, {}, 'edges|abc|full|d50'],
    [
      'edges',
      { edges: { on: true, detailPct: 37 } },
      { crop: { x: 10.4, y: 0.6, w: 99.6, h: 50 } },
      'edges|abc|10,1,100,50|d37',
    ],
  ])('%s with %j and %j is %s', (kind, lines, edits, key) => {
    expect(detectionKey(kind, img('a', lines, edits, 'abc'))).toBe(key)
  })

  it('face and pose keys of one image differ, so their results never share a map entry', () => {
    const a = img('a', on)
    expect(detectionKey('face', a)).not.toBe(detectionKey('pose', a))
  })

  const base = img('a', on, { crop: { x: 10, y: 20, w: 300, h: 200 } })
  const variants: [string, ImageDescriptor][] = [
    ['style', { ...base, lines: patchLines(base.lines, { style: { colour: '#000000' } }) }],
    ['width', { ...base, lines: patchLines(base.lines, { style: { widthMm: 1.5 } }) }],
    ['opacity', { ...base, lines: patchLines(base.lines, { style: { opacityPct: 20 } }) }],
    ['flipH', { ...base, edits: { ...base.edits, flipH: true } }],
    ['flipV', { ...base, edits: { ...base.edits, flipV: true } }],
    ['copies', { ...base, edits: { ...base.edits, copies: 7 } }],
    ['size', { ...base, edits: { ...base.edits, size: { kind: 'fixed', axis: 'width', mm: 50 } } }],
    ['cropAspect', { ...base, edits: { ...base.edits, cropAspect: '1:1' } }],
    ['studies', { ...base, study: { ...DEFAULT_STUDY, versions: ['original', 'values'] } }],
    [
      'composition lines',
      {
        ...base,
        lines: patchLines(base.lines, {
          thirds: true,
          grid: { on: true, cols: 5 },
          spiral: { on: true },
          centre: true,
        }),
      },
    ],
    ['id', { ...base, id: 'other' as ImageDescriptor['id'] }],
    ['pxW', { ...base, pxW: 2000 }],
  ]
  it.each(variants)('%s never changes a key', (_, changed) => {
    for (const kind of ['face', 'pose', 'edges'] as const) {
      expect(detectionKey(kind, changed)).toBe(detectionKey(kind, base))
    }
  })

  it('rotation changes the face and pose keys only', () => {
    const turned = { ...base, edits: { ...base.edits, rotation: 180 as const } }
    expect(detectionKey('face', turned)).not.toBe(detectionKey('face', base))
    expect(detectionKey('pose', turned)).not.toBe(detectionKey('pose', base))
    expect(detectionKey('edges', turned)).toBe(detectionKey('edges', base))
  })

  it('crop and detail change the edge key only', () => {
    const cropped = { ...base, edits: { ...base.edits, crop: { x: 11, y: 20, w: 300, h: 200 } } }
    const detailed = { ...base, lines: patchLines(base.lines, { edges: { detailPct: 51 } }) }
    for (const changed of [cropped, detailed]) {
      expect(detectionKey('edges', changed)).not.toBe(detectionKey('edges', base))
      expect(detectionKey('face', changed)).toBe(detectionKey('face', base))
      expect(detectionKey('pose', changed)).toBe(detectionKey('pose', base))
    }
  })

  it('the content hash is part of every key', () => {
    const other = { ...base, contentHash: 'other' }
    for (const kind of ['face', 'pose', 'edges'] as const) {
      expect(detectionKey(kind, other)).not.toBe(detectionKey(kind, base))
    }
  })
})

describe('guidesFor', () => {
  const a = img('a', { face: true, pose: true, edges: { on: true, detailPct: 50 } })

  it('returns the stored results for the image’s current keys', () => {
    const s = state([
      [detectionKey('face', a), FACE],
      [detectionKey('pose', a), POSE],
      [detectionKey('edges', a), EDGES],
    ])
    expect(guidesFor(s, a)).toEqual({ faces: FACE, poses: POSE, edges: EDGES })
  })

  it('is null where nothing is stored for the current key', () => {
    const turned = { ...a, edits: { ...a.edits, rotation: 90 as const } }
    const s = state([
      [detectionKey('face', a), FACE],
      [detectionKey('pose', a), POSE],
      [detectionKey('edges', a), EDGES],
    ])
    expect(guidesFor(s, turned)).toEqual({ faces: null, poses: null, edges: EDGES })
    expect(guidesFor(state(), a)).toEqual({ faces: null, poses: null, edges: null })
  })

  it('is null for a guide that is not switched on, even with a stored result', () => {
    const s = state([
      [detectionKey('face', a), FACE],
      [detectionKey('pose', a), POSE],
      [detectionKey('edges', a), EDGES],
    ])
    const off = { ...a, lines: patchLines(a.lines, { face: false }) }
    expect(guidesFor(s, off)).toEqual({ faces: null, poses: POSE, edges: EDGES })
    const offPose = { ...a, lines: patchLines(a.lines, { pose: false }) }
    expect(guidesFor(s, offPose)).toEqual({ faces: FACE, poses: null, edges: EDGES })
    const offEdges = { ...a, lines: patchLines(a.lines, { edges: { on: false } }) }
    expect(guidesFor(s, offEdges)).toEqual({ faces: FACE, poses: POSE, edges: null })
  })

  it('keeps an empty result apart from nothing known', () => {
    const s = state([
      [detectionKey('face', a), []],
      [detectionKey('edges', a), { polylines: [] }],
    ])
    expect(guidesFor(s, a)).toEqual({ faces: [], poses: null, edges: { polylines: [] } })
  })

  it('twins (same content hash) share results', () => {
    const twin = { ...img('b', a.lines), contentHash: a.contentHash, lines: a.lines }
    const s = state([
      [detectionKey('face', a), FACE],
      [detectionKey('pose', a), POSE],
      [detectionKey('edges', a), EDGES],
    ])
    expect(guidesFor(s, twin)).toEqual(guidesFor(s, a))
    expect(guidesFor(s, twin).faces).toBe(FACE)
  })
})

describe('guidesPending', () => {
  const a = img('a', { face: true })
  const b = img('b', { edges: { on: true } })
  const key = detectionKey('face', a)

  it.each<[DetectionStatus, boolean]>([
    [{ state: 'downloading', loaded: 1, total: 2 }, true],
    [{ state: 'running' }, true],
    [{ state: 'done', found: 0 }, false],
    [{ state: 'failed', reason: 'download' }, false],
    [{ state: 'failed', reason: 'error' }, false],
    [{ state: 'needs-download', bytes: 10 }, false],
  ])('%j → %s', (status, pending) => {
    expect(guidesPending(state([], [[key, status]]), [a])).toBe(pending)
  })

  it('a switched-on guide with no status yet waits (just switched on, or its model being checked)', () => {
    expect(guidesPending(state(), [a])).toBe(true)
    expect(guidesPending(state(), [b])).toBe(true)
    expect(guidesPending(state(), [img('c')])).toBe(false)
  })

  it('is false for images not in the list', () => {
    expect(guidesPending(state([], [[key, { state: 'running' }]]), [img('c')])).toBe(false)
  })

  it('ignores a running key the image no longer prints (switched off or rotated)', () => {
    const s = state([], [[key, { state: 'running' }]])
    expect(guidesPending(s, [{ ...a, lines: patchLines(a.lines, { face: false }) }])).toBe(false)
    const turned = { ...a, edits: { ...a.edits, rotation: 90 as const } }
    expect(guidesPending(s, [turned])).toBe(true)
    const settled = state(
      [],
      [
        [key, { state: 'running' }],
        [detectionKey('face', turned), { state: 'done', found: 1 }],
      ],
    )
    expect(guidesPending(settled, [turned])).toBe(false)
  })

  it('sees edge and pose detections too', () => {
    const p = img('p', { pose: true })
    expect(guidesPending(state([], [[detectionKey('edges', b), { state: 'running' }]]), [b])).toBe(
      true,
    )
    expect(guidesPending(state([], [[detectionKey('pose', p), { state: 'running' }]]), [p])).toBe(
      true,
    )
  })
})

describe('useDetections', () => {
  it('starts empty with every model unknown', () => {
    const s = useDetections.getState()
    expect(s.results.size).toBe(0)
    expect(s.status.size).toBe(0)
    expect(s.models).toEqual({ face: 'unknown', pose: 'unknown' })
  })

  it('is a plain in-memory store, without persistence', () => {
    expect('persist' in useDetections).toBe(false)
  })
})
