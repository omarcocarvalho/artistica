import { act, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { AI_ASSETS } from 'virtual:ai-assets'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectImageDescriptors, useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import {
  AI_LOADER,
  INITIAL_DETECTIONS,
  useDetections,
  type DetectionPorts,
} from '../../features/lines'
import type { ImageId } from '../../shared/model/image'

const received = vi.hoisted(() => [] as unknown[])

vi.mock('../../features/lines', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/lines')>()
  const { fakePorts } = await import('../../features/lines/detect/test-support/fake-ports')
  return {
    ...actual,
    createDetectionScheduler: vi.fn((ports: DetectionPorts) => {
      received.push(ports)
      return actual.createDetectionScheduler(fakePorts({ cached: ['face', 'pose'] }).ports)
    }),
  }
})

import { appDetections } from '../detections'
import { DetectionEffect } from './DetectionEffect'

const A = 'a' as ImageId
const B = 'b' as ImageId

beforeEach(() => {
  useDetections.setState(INITIAL_DETECTIONS, true)
  useImages.setState({
    images: [makeLoadedImage({ id: A }), makeLoadedImage({ id: B })],
    selectedId: A,
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  useImages.setState(useImages.getInitialState(), true)
})

const hashOf = (id: ImageId) => useImages.getState().images.find((i) => i.id === id)?.contentHash

function keysFor(id: ImageId): string[] {
  const hash = hashOf(id) ?? '?'
  return [...useDetections.getState().results.keys()].filter((k) => k.includes(`|${hash}|`))
}

describe('DetectionEffect', () => {
  it('syncs the scheduler with the image descriptors on every change', () => {
    const sync = vi.spyOn(appDetections, 'sync')
    render(<DetectionEffect />)
    expect(sync).toHaveBeenLastCalledWith(selectImageDescriptors(useImages.getState()))
    const calls = sync.mock.calls.length
    act(() => {
      useImages.getState().updateLines(A, { face: true })
    })
    expect(sync).toHaveBeenCalledTimes(calls + 1)
    expect(sync.mock.lastCall?.[0].find((d) => d.id === A)?.lines.face).toBe(true)
    act(() => {
      useImages.getState().updateEdits(B, { rotation: 90 })
    })
    expect(sync.mock.lastCall?.[0].find((d) => d.id === B)?.edits.rotation).toBe(90)
  })

  it('removing a photo drops its detections and keeps the others', async () => {
    render(<DetectionEffect />)
    act(() => {
      useImages.getState().updateLines(A, { face: true, edges: { on: true } })
      useImages.getState().updateLines(B, { pose: true })
    })
    await waitFor(() => {
      expect(keysFor(A)).toHaveLength(2)
      expect(keysFor(B)).toHaveLength(1)
    })
    const hashA = hashOf(A) ?? '?'
    act(() => {
      useImages.getState().remove(A)
    })
    const { results, status } = useDetections.getState()
    expect([...results.keys()].some((k) => k.includes(hashA))).toBe(false)
    expect([...status.keys()].some((k) => k.includes(hashA))).toBe(false)
    expect(keysFor(B)).toHaveLength(1)
  })

  it('Remove all clears the detections', async () => {
    render(<DetectionEffect />)
    act(() => {
      useImages.getState().updateLines(A, { face: true })
      useImages.getState().updateLines(B, { edges: { on: true } })
    })
    await waitFor(() => {
      expect(useDetections.getState().results.size).toBe(2)
    })
    act(() => {
      useImages.getState().clear()
    })
    expect(useDetections.getState().results.size).toBe(0)
    expect(useDetections.getState().status.size).toBe(0)
  })

  it('the scheduler is created once per app (module scope) and never disposed by React effects', () => {
    const dispose = vi.spyOn(appDetections, 'dispose')
    const first = render(
      <StrictMode>
        <DetectionEffect />
      </StrictMode>,
    )
    first.unmount()
    render(<DetectionEffect />).unmount()
    expect(received).toHaveLength(1)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('gives the scheduler the app’s asset manifest and loader', () => {
    const ports = received[0] as DetectionPorts
    expect(ports.assets).toBe(AI_ASSETS)
    expect(ports.loader).toBe(AI_LOADER)
    expect(typeof ports.edges).toBe('function')
    expect(typeof ports.landmarks).toBe('function')
    expect(typeof ports.bitmapFor).toBe('function')
  })
})
