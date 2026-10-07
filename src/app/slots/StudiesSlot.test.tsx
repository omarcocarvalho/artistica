import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { StudiesSlot } from './StudiesSlot'

const ids = ['a', 'b'] as ImageId[]
function linesSection(container: HTMLElement) {
  const details = container.querySelector('details')
  const summary = details?.querySelector('summary')
  if (!details || !summary) throw new Error('no Lines section')
  return { details, summary }
}
beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  useImages.setState({
    images: ids.map((id) => makeLoadedImage({ id, name: `${id}.jpg` })),
    selectedId: 'a' as ImageId,
    importing: 0,
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
    expect(screen.getByText(/^Studies for/)).toHaveTextContent('Studies for b.jpg')
    expect(screen.getByText(/^Lines for/)).toHaveTextContent('Lines for b.jpg')
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

  it('phone: a collapsed Lines section follows the Studies panel', () => {
    const { container } = render(<StudiesSlot variant="phone" />)
    const { details, summary } = linesSection(container)
    expect(details).not.toHaveAttribute('open')
    expect(summary).toHaveAccessibleName('Lines')
    expect(within(details).getByRole('switch', { name: 'Grid' })).not.toBeVisible()
    const studiesApply = screen.getByRole('button', { name: 'Apply to all images' })
    expect(
      studiesApply.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
  it('phone: opening the section shows the lines panel for the selected image, and both apply buttons have distinct names (owner Q12)', async () => {
    const user = userEvent.setup()
    const { container } = render(<StudiesSlot variant="phone" />)
    const { details, summary } = linesSection(container)
    await user.click(summary)
    expect(details).toHaveAttribute('open')
    expect(within(details).getByText('a.jpg', { selector: 'strong' })).toBeVisible()
    expect(within(details).getByRole('switch', { name: 'Golden spiral' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Apply to all images' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Apply lines to all images' })).toHaveLength(1)
  })
  it('phone: the summary counts the selected image’s line types that are on', async () => {
    const user = userEvent.setup()
    const { container } = render(<StudiesSlot variant="phone" />)
    const { summary } = linesSection(container)
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { thirds: true, centre: true })
    })
    expect(summary).toHaveAccessibleName('Lines, 2 on')
    expect(within(summary).getByText('2 on')).toBeVisible()
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Image' })).getByRole('radio', {
        name: 'b.jpg',
      }),
    )
    expect(summary).toHaveAccessibleName('Lines')
    act(() => {
      useImages.getState().updateLines('b' as ImageId, { grid: { on: true } })
    })
    expect(summary).toHaveAccessibleName('Lines, 1 on')
  })
  it('phone: each panel keeps its own import wait hint', () => {
    useImages.setState({ importing: 1 })
    const { container } = render(<StudiesSlot variant="phone" />)
    const { details } = linesSection(container)
    details.open = true
    const studiesApply = screen.getByRole('button', { name: 'Apply to all images' })
    const linesApply = screen.getByRole('button', { name: 'Apply lines to all images' })
    expect(studiesApply).toBeDisabled()
    expect(linesApply).toBeDisabled()
    const hintOf = (el: HTMLElement) =>
      document.getElementById(el.getAttribute('aria-describedby') ?? '')
    const linesHint = hintOf(linesApply)
    const studiesHint = hintOf(studiesApply)
    expect(linesHint).toHaveTextContent('Waiting for photos to finish importing…')
    expect(studiesHint).toHaveTextContent('Waiting for photos to finish importing…')
    expect(details).toContainElement(linesHint)
    expect(details).not.toContainElement(studiesHint)
  })
  it('phone: one live region announces the wait for the whole step, even with the Lines section open', () => {
    const { container } = render(<StudiesSlot variant="phone" />)
    linesSection(container).details.open = true
    act(() => {
      useImages.setState({ importing: 1 })
    })
    const live = Array.from(container.querySelectorAll('[aria-live]')).filter(
      (region) => region.textContent === 'Waiting for photos to finish importing…',
    )
    expect(live).toHaveLength(1)
    expect(live[0]).toBe(
      document.getElementById(
        screen
          .getByRole('button', { name: 'Apply to all images' })
          .getAttribute('aria-describedby') ?? '',
      ),
    )
  })
  it('desktop: no Lines section (the Lines tab holds the panel)', () => {
    const { container } = render(<StudiesSlot variant="desktop" />)
    expect(container.querySelector('details')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Apply lines to all images' }),
    ).not.toBeInTheDocument()
  })
})
