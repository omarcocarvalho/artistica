import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { useAppUi } from '../state/useAppUi'

const imageCount = vi.hoisted(() => ({ value: 0 }))
vi.mock('../state/hasImages', () => ({ useImageCount: () => imageCount.value }))

import { MobileFlow } from './MobileFlow'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  imageCount.value = 0
  useAppUi.setState(useAppUi.getInitialState())
})

describe('MobileFlow', () => {
  it('starts on Images with Back disabled and a labelled step region', () => {
    render(<MobileFlow />)
    expect(screen.getByRole('region', { name: 'Step 1 of 4: Images' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Images' })).toHaveAttribute('aria-current', 'step')
  })
  it('walks Images, Page, Preview, Export with Next and Back', async () => {
    const user = userEvent.setup()
    render(<MobileFlow />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('region', { name: 'Step 2 of 4: Page' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('region', { name: 'Step 3 of 4: Preview' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('region', { name: 'Step 4 of 4: Export' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('region', { name: 'Step 3 of 4: Preview' })).toBeInTheDocument()
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
})
