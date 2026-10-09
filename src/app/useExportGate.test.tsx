import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { selectImageDescriptors, useImages } from '../features/images'
import { makeLoadedImage } from '../features/images/test-utils'
import {
  detectionKey,
  INITIAL_DETECTIONS,
  useDetections,
  type DetectionStatus,
  type GuideKind,
} from '../features/lines'
import type { LayoutResult } from '../features/layout'
import type { PageModel } from '../features/render'
import { initI18n } from '../shared/i18n'
import type { ImageId } from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import { createDetectionScheduler } from '../features/lines/detect/schedule'
import { deferred, fakePorts, flush } from '../features/lines/detect/test-support/fake-ports'
import { usePages } from './pages-store'
import { useExportGate } from './useExportGate'

const A = 'a' as ImageId
const B = 'b' as ImageId
const FINDING = 'Finding guides in your photos…'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  useImages.setState({
    images: [makeLoadedImage({ id: A, lines: { ...DEFAULT_LINES, face: true } })],
  })
  usePages.setState({
    status: 'idle',
    layout: {} as LayoutResult,
    empty: false,
    pages: [{} as PageModel],
  })
})
afterEach(() => {
  useDetections.setState(INITIAL_DETECTIONS, true)
  useImages.setState(useImages.getInitialState(), true)
  usePages.setState({ status: 'idle', layout: null, empty: false, pages: [] })
})

function setStatus(kind: GuideKind, status: DetectionStatus): void {
  const img = selectImageDescriptors(useImages.getState())[0]
  if (!img) throw new Error('no image')
  act(() => {
    useDetections.setState({ status: new Map([[detectionKey(kind, img), status]]) })
  })
}

describe('useExportGate with guides (M4-R18, owner Q13)', () => {
  it('the reason is "Finding guides in your photos…" while a guide is found or downloaded', () => {
    const { result } = renderHook(() => useExportGate())
    expect(result.current).toEqual({ block: 'guides', reason: FINDING })
    setStatus('face', { state: 'running' })
    expect(result.current).toEqual({ block: 'guides', reason: FINDING })
    setStatus('face', { state: 'downloading', loaded: 1, total: 2 })
    expect(result.current.reason).toBe(FINDING)
  })

  it.each<[string, DetectionStatus]>([
    ['found', { state: 'done', found: 1 }],
    ['nothing found', { state: 'done', found: 0 }],
    ['failed (an engine timeout ends as failed)', { state: 'failed', reason: 'error' }],
    ['waiting for the download click', { state: 'needs-download', bytes: 15_000_000 }],
  ])('does not block once the guide is %s', (_label, status) => {
    const { result } = renderHook(() => useExportGate())
    setStatus('face', { state: 'running' })
    setStatus('face', status)
    expect(result.current).toEqual({ block: null, reason: null })
  })

  it('ignores a running detection for a guide that is switched off', () => {
    const { result } = renderHook(() => useExportGate())
    const img = selectImageDescriptors(useImages.getState())[0]
    if (!img) throw new Error('no image')
    act(() => {
      useDetections.setState({
        status: new Map<string, DetectionStatus>([
          [detectionKey('face', img), { state: 'done', found: 1 }],
          [detectionKey('pose', img), { state: 'running' }],
        ]),
      })
    })
    expect(result.current.block).toBeNull()
  })

  it('waits from the moment a guide is switched on, before the scheduler has seen it, until its result is done', async () => {
    useImages.setState({ images: [makeLoadedImage({ id: A }), makeLoadedImage({ id: B })] })
    const h = fakePorts({ cached: ['face'] })
    const probe = deferred<boolean>()
    h.loader.isCached.mockReturnValueOnce(probe.promise)
    const scheduler = createDetectionScheduler(h.ports)
    const sync = () => {
      scheduler.sync(selectImageDescriptors(useImages.getState()))
    }
    try {
      const { result } = renderHook(() => useExportGate())
      sync()
      expect(result.current.block).toBeNull()

      act(() => {
        useImages.getState().updateLines(A, { face: true })
      })
      expect(result.current).toEqual({ block: 'guides', reason: FINDING })
      act(sync)
      expect(result.current.block).toBe('guides')
      probe.resolve(true)
      await act(flush)
      expect(result.current.block).toBeNull()

      act(() => {
        useImages.getState().updateLines(B, { face: true })
      })
      expect(result.current.block).toBe('guides')
      act(sync)
      expect(result.current.block).toBe('guides')
      await act(flush)
      expect(result.current.block).toBeNull()
    } finally {
      scheduler.dispose()
    }
  })

  it('a guide whose model needs a download does not wait for the click', async () => {
    const h = fakePorts()
    const scheduler = createDetectionScheduler(h.ports)
    try {
      const { result } = renderHook(() => useExportGate())
      expect(result.current.block).toBe('guides')
      act(() => {
        scheduler.sync(selectImageDescriptors(useImages.getState()))
      })
      await act(flush)
      expect(useDetections.getState().models.face).toBe('absent')
      expect(result.current.block).toBeNull()
    } finally {
      scheduler.dispose()
    }
  })
})
