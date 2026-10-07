import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { StudiesSlot } from './StudiesSlot'

const ids = ['a', 'b'] as ImageId[]
beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  useImages.setState({
    images: ids.map((id) => makeLoadedImage({ id, name: `${id}.jpg` })),
    selectedId: 'a' as ImageId,
  })
})

describe('StudiesSlot', () => {
  it('phone: a radio group of thumbnails named by image picks the image being edited', async () => {
    const user = userEvent.setup()
    render(<StudiesSlot variant="phone" />)
    const picker = screen.getByRole('radiogroup', { name: 'Image' })
    expect(within(picker).getByRole('radio', { name: 'a.jpg' })).toBeChecked()
    await user.click(within(picker).getByRole('radio', { name: 'b.jpg' }))
    expect(useImages.getState().selectedId).toBe('b')
    expect(within(picker).getByRole('radio', { name: 'b.jpg' })).toBeChecked()
    expect(screen.getByText('b.jpg', { selector: 'strong' })).toBeVisible()
  })
  it('phone: arrow keys move through the picker (native radio behaviour)', async () => {
    const user = userEvent.setup()
    render(<StudiesSlot variant="phone" />)
    within(screen.getByRole('radiogroup', { name: 'Image' }))
      .getByRole('radio', { name: 'a.jpg' })
      .focus()
    await user.keyboard('{ArrowRight}')
    expect(useImages.getState().selectedId).toBe('b')
  })
  it('phone: with nothing selected no radio is checked, and the panel asks for a selection', () => {
    useImages.setState({ selectedId: null })
    render(<StudiesSlot variant="phone" />)
    const radios = within(screen.getByRole('radiogroup', { name: 'Image' })).getAllByRole('radio')
    expect(radios).toHaveLength(2)
    for (const r of radios) expect(r).not.toBeChecked()
    expect(screen.getByText('Add a photo, or select one, to set up its studies.')).toBeVisible()
  })
  it('desktop: no picker; the panel follows the selection', () => {
    const { rerender } = render(<StudiesSlot variant="desktop" />)
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.getByText('a.jpg', { selector: 'strong' })).toBeVisible()
    useImages.getState().select('b' as ImageId)
    rerender(<StudiesSlot variant="desktop" />)
    expect(screen.getByText('b.jpg', { selector: 'strong' })).toBeVisible()
  })
})
