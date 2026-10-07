import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import type { LayoutResult } from '../../features/layout'
import type { ImageId } from '../../shared/model/image'
import { initI18n } from '../../shared/i18n'
import { usePages } from '../pages-store'
import { useAppUi } from '../state/useAppUi'

const imageCount = vi.hoisted(() => ({ value: 0 }))
vi.mock('../state/hasImages', () => ({ useImageCount: () => imageCount.value }))

import { MobileFlow } from './MobileFlow'

const layout = {} as LayoutResult

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  imageCount.value = 0
  useAppUi.setState(useAppUi.getInitialState())
  useImages.setState({ images: [], selectedId: null })
  usePages.setState({ status: 'idle', layout, pages: [{ index: 0 }] as never })
})

describe('MobileFlow', () => {
  it('starts on Images with Back disabled and a labelled step region', () => {
    render(<MobileFlow />)
    expect(screen.getByRole('region', { name: 'Step 1 of 5: Images' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Images' })).toHaveAttribute('aria-current', 'step')
  })
  it('walks Images, Page, Studies, Preview, Export with Next and Back', async () => {
    const user = userEvent.setup()
    render(<MobileFlow />)
    for (const [n, name] of [
      [2, 'Page'],
      [3, 'Studies'],
      [4, 'Preview'],
      [5, 'Export'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(
        screen.getByRole('region', { name: `Step ${String(n)} of 5: ${name}` }),
      ).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('region', { name: 'Step 4 of 5: Preview' })).toBeInTheDocument()
  })
  it('the step bar has five equal columns', () => {
    render(<MobileFlow />)
    const nav = screen.getByRole('navigation', { name: 'Steps' })
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Images', 'Page', 'Studies', 'Preview', 'Export'])
    expect(nav.querySelector('ol')).toHaveClass('grid-cols-5')
  })
  it('studies step: the empty state without images, the image picker and studies panel with them', () => {
    useAppUi.getState().setStep('studies')
    const { rerender } = render(<MobileFlow />)
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    imageCount.value = 1
    useImages.setState({
      images: [makeLoadedImage({ id: 'a' as ImageId, name: 'a.jpg' })],
      selectedId: 'a' as ImageId,
    })
    rerender(<MobileFlow />)
    expect(screen.getByRole('radiogroup', { name: 'Image' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Print these versions' })).toBeInTheDocument()
  })
  it('page step: the page setup only, with no settings tabs', () => {
    useAppUi.getState().setStep('page')
    render(<MobileFlow />)
    expect(screen.getByLabelText('Paper size')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
  it('jumps with the step bar and moves focus to the step heading', async () => {
    const user = userEvent.setup()
    render(<MobileFlow />)
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('heading', { name: 'Preview', level: 2 })).toHaveFocus()
  })
  it('export step: Create PDF is described as unavailable with no images, and opens the dialog with images', async () => {
    const user = userEvent.setup()
    useAppUi.getState().setStep('export')
    const { rerender } = render(<MobileFlow />)
    const create = screen.getByRole('button', { name: 'Create PDF' })
    expect(create).toHaveAttribute('aria-disabled', 'true')
    await user.click(create)
    expect(useAppUi.getState().exportOpen).toBe(false)
    imageCount.value = 2
    rerender(<MobileFlow />)
    expect(screen.getByText('2 images are ready to print.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create PDF' }))
    expect(useAppUi.getState().exportOpen).toBe(true)
  })
  it('export step: Create PDF is described by the error reason when the layout failed', () => {
    imageCount.value = 2
    usePages.setState({ status: 'error', layout: null, pages: [] })
    useAppUi.getState().setStep('export')
    render(<MobileFlow />)
    const create = screen.getByRole('button', { name: 'Create PDF' })
    expect(create).toHaveAttribute('aria-disabled', 'true')
    expect(create).toHaveAccessibleDescription(
      'The layout could not be computed. Change a setting or reload the page.',
    )
  })
  it('export step: Create PDF is described by the no-room reason with a layout but no pages', () => {
    imageCount.value = 2
    usePages.setState({ status: 'idle', pages: [] })
    useAppUi.getState().setStep('export')
    render(<MobileFlow />)
    expect(screen.getByRole('button', { name: 'Create PDF' })).toHaveAccessibleDescription(
      'Export is unavailable: the page setup leaves no room for images.',
    )
  })
})
