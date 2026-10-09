import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettings } from '../features/settings'
import { initI18n } from '../shared/i18n'

const imageCount = vi.hoisted(() => ({ value: 0 }))
vi.mock('./state/hasImages', () => ({ useImageCount: () => imageCount.value }))
vi.mock('./effects/AppEffects', () => ({ AppEffects: () => null }))
vi.mock('./slots/ImagesSlot', () => ({ ImagesSlot: () => null, EmptyActionsSlot: () => null }))
vi.mock('./slots/PreviewSlot', () => ({ PreviewSlot: () => null, PreviewToolbar: () => null }))
vi.mock('./slots/ExportSlot', () => ({ ExportSlot: () => null }))

import { useImages } from '../features/images'
import { makeLoadedImage } from '../features/images/test-utils'
import { detectionKey, INITIAL_DETECTIONS, useDetections } from '../features/lines'
import type { ImageId } from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import { App } from './App'
import { appDetections } from './detections'
import { usePages } from './pages-store'
import { useAppUi } from './state/useAppUi'
import { stubDesktop } from './test-utils'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  localStorage.clear()
  imageCount.value = 0
  usePages.setState({ status: 'idle', layout: null, pages: [] })
  useAppUi.setState(useAppUi.getInitialState())
  useSettings.getState().reset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useDetections.setState(INITIAL_DETECTIONS, true)
  useImages.setState(useImages.getInitialState(), true)
})

const A = 'a' as ImageId

describe('App (desktop, no images)', () => {
  it('renders the three regions, the empty state and a disabled export', () => {
    stubDesktop(true)
    render(<App />)
    expect(screen.getByRole('complementary', { name: /^Images/ })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add some reference photos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export PDF' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
  it('applies the saved theme to <html>', () => {
    stubDesktop(true)
    useSettings.getState().setTheme('dark')
    render(<App />)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('App export gate (Review Focus 5)', () => {
  it('is disabled with a reason while computing or after an error, and opens when ready', async () => {
    stubDesktop(true)
    imageCount.value = 2
    render(<App />)
    const button = () => screen.getByRole('button', { name: 'Export PDF' })
    const set = (state: Partial<ReturnType<typeof usePages.getState>>) => {
      act(() => {
        usePages.setState(state)
      })
    }

    set({ status: 'error', layout: null, pages: [] })
    expect(button()).toHaveAttribute('aria-disabled', 'true')
    expect(button()).toHaveAccessibleDescription(
      'The layout could not be computed. Change a setting or reload the page.',
    )
    set({ status: 'computing' })
    expect(button()).toHaveAccessibleDescription(
      'The layout is updating. Export is available in a moment.',
    )
    set({ status: 'idle', layout: {} as never, pages: [] })
    expect(button()).toHaveAccessibleDescription(
      'Export is unavailable: the page setup leaves no room for images.',
    )
    set({ pages: [{ index: 0 }] as never })
    expect(button()).not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(button())
    expect(useAppUi.getState().exportOpen).toBe(true)
  })

  it('says "Finding guides in your photos…" while a printed photo’s guide is being found (owner Q13)', () => {
    stubDesktop(true)
    imageCount.value = 1
    const img = makeLoadedImage({ id: A, lines: { ...DEFAULT_LINES, pose: true } })
    useImages.setState({ images: [img], selectedId: A })
    usePages.setState({ status: 'idle', layout: {} as never, pages: [{ index: 0 }] as never })
    render(<App />)
    const button = () => screen.getByRole('button', { name: 'Export PDF' })
    expect(button()).not.toHaveAttribute('aria-disabled', 'true')
    act(() => {
      useDetections.setState({
        status: new Map([[detectionKey('pose', img), { state: 'running' }]]),
      })
    })
    expect(button()).toHaveAttribute('aria-disabled', 'true')
    expect(button()).toHaveAccessibleDescription('Finding guides in your photos…')
    act(() => {
      useDetections.setState({
        status: new Map([[detectionKey('pose', img), { state: 'done', found: 1 }]]),
      })
    })
    expect(button()).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('says "updating", not "no room", right after the first image is added to an empty workspace', () => {
    stubDesktop(true)
    usePages.getState().sink.cleared({ pages: [], suggestedPerPage: 8 } as never)
    imageCount.value = 1
    render(<App />)
    expect(screen.getByRole('button', { name: 'Export PDF' })).toHaveAccessibleDescription(
      'The layout is updating. Export is available in a moment.',
    )
  })
})

describe('App detections provider (owner Q15)', () => {
  const NO_WEBGL = 'Face and pose guides need WebGL, which this browser has turned off.'
  const openFace = async (img: ReturnType<typeof makeLoadedImage>) => {
    stubDesktop(true)
    imageCount.value = 1
    useImages.setState({ images: [img], selectedId: img.id })
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'Lines' }))
    expect(screen.getByRole('heading', { name: 'Guides from the photo' })).toBeVisible()
  }

  it('without WebGL on the page: the note, and no download offered', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const img = makeLoadedImage({ id: A, lines: { ...DEFAULT_LINES, face: true } })
    useDetections.setState({
      status: new Map([
        [detectionKey('face', img), { state: 'needs-download', bytes: 15_234_319 }],
      ]),
    })
    await openFace(img)
    expect(screen.getByText(NO_WEBGL)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Download & turn on' })).not.toBeInTheDocument()
  })

  it('with WebGL: "Download & turn on" asks the app’s scheduler for the model', async () => {
    const gl = { getExtension: () => null }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as never)
    const download = vi.spyOn(appDetections, 'download').mockImplementation(() => undefined)
    const img = makeLoadedImage({ id: A, lines: { ...DEFAULT_LINES, face: true } })
    useDetections.setState({
      status: new Map([
        [detectionKey('face', img), { state: 'needs-download', bytes: 15_234_319 }],
      ]),
    })
    await openFace(img)
    expect(screen.queryByText(NO_WEBGL)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Download & turn on' }))
    expect(download).toHaveBeenCalledExactlyOnceWith('face')
  })
})
