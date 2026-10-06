import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../features/images'
import { computeLayout } from '../../features/layout'
import { useSettings } from '../../features/settings'
import { initI18n } from '../../shared/i18n'
import { DEFAULT_EDITS, type ImageId } from '../../shared/model/image'
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
        bitmap: {} as ImageBitmap,
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
