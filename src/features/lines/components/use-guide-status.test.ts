import { describe, expect, it } from 'vitest'
import type { DetectionStatus, GuideKind } from '../detect/store'
import { guideView } from './use-guide-status'

const LANDMARKS: readonly GuideKind[] = ['face', 'pose']

describe('guideView', () => {
  it('is idle while the guide is off, whatever the status', () => {
    for (const kind of ['face', 'pose', 'edges'] as const) {
      expect(guideView(kind, false, { state: 'running' }, true)).toEqual({ view: 'idle' })
      expect(guideView(kind, false, { state: 'needs-download', bytes: 5 }, false)).toEqual({
        view: 'idle',
      })
    }
  })

  it('is idle while the guide is on but the scheduler has not reported yet', () => {
    for (const kind of ['face', 'pose', 'edges'] as const) {
      expect(guideView(kind, true, undefined, true)).toEqual({ view: 'idle' })
    }
  })

  it.each(LANDMARKS)('%s: maps each status to its view', (kind) => {
    const cases: [DetectionStatus, ReturnType<typeof guideView>][] = [
      [
        { state: 'needs-download', bytes: 15_200_000 },
        { view: 'box', bytes: 15_200_000 },
      ],
      [
        { state: 'downloading', loaded: 4_100_000, total: 15_200_000 },
        { view: 'downloading', loaded: 4_100_000, total: 15_200_000 },
      ],
      [{ state: 'running' }, { view: 'running' }],
      [{ state: 'done', found: 2 }, { view: 'found' }],
      [{ state: 'done', found: 0 }, { view: 'none-found' }],
      [{ state: 'failed', reason: 'download' }, { view: 'download-failed' }],
      [{ state: 'failed', reason: 'integrity' }, { view: 'download-failed' }],
      [{ state: 'failed', reason: 'error' }, { view: 'failed' }],
      [{ state: 'failed', reason: 'unsupported' }, { view: 'unsupported' }],
    ]
    for (const [status, view] of cases) expect(guideView(kind, true, status, true)).toEqual(view)
  })

  it('edges: maps each status to its view; an unsupported or download failure is a plain failure', () => {
    expect(guideView('edges', true, { state: 'running' }, true)).toEqual({ view: 'running' })
    expect(guideView('edges', true, { state: 'done', found: 3 }, true)).toEqual({ view: 'found' })
    expect(guideView('edges', true, { state: 'done', found: 0 }, true)).toEqual({
      view: 'none-found',
    })
    for (const reason of ['download', 'integrity', 'unsupported', 'error'] as const) {
      expect(guideView('edges', true, { state: 'failed', reason }, true)).toEqual({
        view: 'failed',
      })
    }
  })

  describe('a browser without WebGL (owner Q15, default)', () => {
    it.each(LANDMARKS)(
      '%s: shows the WebGL note in place of the download box, and before any status',
      (kind) => {
        expect(guideView(kind, true, { state: 'needs-download', bytes: 9 }, false)).toEqual({
          view: 'unsupported',
        })
        expect(guideView(kind, true, undefined, false)).toEqual({ view: 'unsupported' })
      },
    )

    it.each(LANDMARKS)('%s: still shows what the engine reports once it ran', (kind) => {
      expect(guideView(kind, true, { state: 'running' }, false)).toEqual({ view: 'running' })
      expect(guideView(kind, true, { state: 'done', found: 1 }, false)).toEqual({ view: 'found' })
      expect(guideView(kind, true, { state: 'failed', reason: 'unsupported' }, false)).toEqual({
        view: 'unsupported',
      })
    })

    it('leaves the edge outline alone', () => {
      expect(guideView('edges', true, undefined, false)).toEqual({ view: 'idle' })
      expect(guideView('edges', true, { state: 'running' }, false)).toEqual({ view: 'running' })
      expect(guideView('edges', true, { state: 'done', found: 1 }, false)).toEqual({
        view: 'found',
      })
    })
  })
})
