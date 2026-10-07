import { act, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../features/images'
import { computeLayout } from '../../features/layout'
import { useSettings } from '../../features/settings'
import { initI18n } from '../../shared/i18n'
import { DEFAULT_EDITS, type ImageId } from '../../shared/model/image'
import { DEFAULT_STUDY } from '../../shared/model/study'
import { stubDesktop } from '../test-utils'

type LayoutAsync = typeof import('../../features/layout').layoutAsync

const layoutAsync = vi.hoisted(() => vi.fn<LayoutAsync>())
vi.mock('../../features/layout', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, layoutAsync }
})
vi.mock('../../features/render', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, PagePreview: () => <p>page</p>, GuidesLegend: () => null }
})

import { usePages } from '../pages-store'
import { PreviewSlot } from '../slots/PreviewSlot'
import { useNotices } from '../state/useNotices'
import { PipelineEffect } from './PipelineEffect'

const ERROR_TEXT = 'The layout could not be computed. Change a setting or reload the page.'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  stubDesktop(true)
  localStorage.clear()
  useSettings.getState().reset()
  useNotices.getState().clear()
  usePages.setState({ status: 'idle', layout: null, empty: false, pages: [] })
  useImages.setState({
    images: [
      {
        id: 'a' as ImageId,
        name: 'anna.jpg',
        contentHash: 'h-a',
        pxW: 400,
        pxH: 300,
        originalPxW: 400,
        originalPxH: 300,
        edits: DEFAULT_EDITS,
        study: DEFAULT_STUDY,
        preview: {} as ImageBitmap,
        source: new Blob(),
        thumbUrl: 'blob:a',
      },
    ],
  })
})
afterEach(() => {
  layoutAsync.mockReset()
  useImages.setState({ images: [] })
  vi.unstubAllGlobals()
})

describe('PipelineEffect + PreviewSlot on a layout failure', () => {
  it('keeps the error visible after the toast is dismissed and hides it once a layout succeeds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    layoutAsync.mockRejectedValue(new Error('worker crashed'))
    render(
      <>
        <PipelineEffect />
        <PreviewSlot />
      </>,
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(ERROR_TEXT)
    })
    act(() => {
      useNotices.getState().clear()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR_TEXT)

    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    act(() => {
      useSettings.getState().setPageSetup({ paper: 'A3' })
    })
    await waitFor(() => {
      expect(screen.getByText('page')).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(ERROR_TEXT)).not.toBeInTheDocument()
  })
})

describe('PipelineEffect layout memo (M2-R15)', () => {
  it('keeps one pipeline across changes: a version toggle runs the layout, a blur change reuses it', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    render(<PipelineEffect />)
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    expect(layoutAsync).toHaveBeenCalledTimes(1)
    act(() => {
      useImages.getState().updateStudy('a' as ImageId, { versions: ['original', 'blurred'] })
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles.map((t) => t.version)).toEqual([
        'original',
        'blurred',
      ])
    })
    expect(layoutAsync).toHaveBeenCalledTimes(2)
    act(() => {
      useImages.getState().updateStudy('a' as ImageId, { blurPct: 12 })
    })
    await waitFor(() => {
      expect(usePages.getState().pages[0]?.tiles[1]?.study?.blurPct).toBe(12)
    })
    expect(layoutAsync).toHaveBeenCalledTimes(2)
  })
})

describe('PipelineEffect lifetime', () => {
  it('under StrictMode runs one layout and fills the pages', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    render(
      <StrictMode>
        <PipelineEffect />
      </StrictMode>,
    )
    await waitFor(() => {
      expect(usePages.getState().pages).toHaveLength(1)
    })
    expect(layoutAsync).toHaveBeenCalledTimes(1)
  })

  it('unmounted before the debounce ends, it runs no layout', async () => {
    layoutAsync.mockImplementation((setup, items) => Promise.resolve(computeLayout(setup, items)))
    const { unmount } = render(<PipelineEffect />)
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(layoutAsync).not.toHaveBeenCalled()
    expect(usePages.getState().pages).toEqual([])
  })
})
