import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectImageDescriptors, useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import {
  detectionKey,
  DetectionsProvider,
  INITIAL_DETECTIONS,
  useDetections,
  type DetectionActions,
} from '../../features/lines'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { StudiesSlot } from './StudiesSlot'

const ids = ['a', 'b'] as ImageId[]
const linesSection = () => screen.getByRole('region', { name: 'Lines' })
const linesHeading = () => screen.getByRole('heading', { level: 3, name: 'Lines' })
/** The "N on" badge beside the Lines heading, or null when no line type is on. */
const linesCount = () =>
  within(linesHeading().parentElement ?? document.body).queryByText(/^\d+ on$/)
const ACTIONS: DetectionActions = { download: vi.fn(), retry: vi.fn(), landmarksSupported: true }
beforeAll(async () => {
  await initI18n()
})
afterEach(() => {
  useDetections.setState(INITIAL_DETECTIONS, true)
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

  it('phone: an always-open Lines section, named by its h3, follows the Studies panel', () => {
    const { container } = render(<StudiesSlot variant="phone" />)
    const section = linesSection()
    expect(section.tagName).toBe('SECTION')
    expect(section).toHaveAttribute('aria-labelledby', linesHeading().id)
    expect(within(section).getByRole('switch', { name: 'Grid' })).toBeVisible()
    expect(within(section).getByRole('button', { name: 'Apply lines to all images' })).toBeVisible()
    expect(container.querySelector('details, summary, [aria-expanded]')).toBeNull()
    const studiesApply = screen.getByRole('button', { name: 'Apply to all images' })
    expect(
      studiesApply.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
  it('phone: the panel’s section headings sit under the Lines h3, as h4', () => {
    render(<StudiesSlot variant="phone" />)
    expect(
      within(linesSection())
        .getAllByRole('heading')
        .map((h) => [h.tagName, h.textContent]),
    ).toEqual([
      ['H3', 'Lines'],
      ['H4', 'Composition'],
      ['H4', 'Line style'],
    ])
  })
  it('phone: the section shows the lines panel for the selected image, and both apply buttons have distinct names (owner Q12)', () => {
    render(<StudiesSlot variant="phone" />)
    const section = linesSection()
    expect(within(section).getByText('a.jpg', { selector: 'strong' })).toBeVisible()
    expect(within(section).getByRole('switch', { name: 'Golden spiral' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Apply to all images' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Apply lines to all images' })).toHaveLength(1)
  })
  it('phone: beside the heading, a count of the selected image’s line types that are on', async () => {
    const user = userEvent.setup()
    render(<StudiesSlot variant="phone" />)
    expect(linesCount()).toBeNull()
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { thirds: true, centre: true })
    })
    expect(linesCount()).toHaveTextContent('2 on')
    expect(linesCount()).toBeVisible()
    expect(linesHeading()).toHaveTextContent(/^Lines$/)
    expect(linesSection()).toHaveAccessibleName('Lines')
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Image' })).getByRole('radio', {
        name: 'b.jpg',
      }),
    )
    expect(linesCount()).toBeNull()
    act(() => {
      useImages.getState().updateLines('b' as ImageId, { grid: { on: true } })
    })
    expect(linesCount()).toHaveTextContent('1 on')
  })
  it('phone: the count includes the guides that are on', () => {
    render(<StudiesSlot variant="phone" />)
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { thirds: true })
    })
    expect(linesCount()).toHaveTextContent('1 on')
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { face: true })
    })
    expect(linesCount()).toHaveTextContent('2 on')
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { edges: { on: true }, pose: true })
    })
    expect(linesCount()).toHaveTextContent('4 on')
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { thirds: false, edges: { on: false } })
    })
    expect(linesCount()).toHaveTextContent('2 on')
  })
  it('phone: each panel keeps its own import wait hint', () => {
    useImages.setState({ importing: 1 })
    render(<StudiesSlot variant="phone" />)
    const section = linesSection()
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
    expect(linesHint).toBeVisible()
    expect(section).toContainElement(linesHint)
    expect(section).not.toContainElement(studiesHint)
  })
  it('phone: one live region announces the wait for the whole step', () => {
    const { container } = render(<StudiesSlot variant="phone" />)
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
  it('phone: the "N on" badge counts guides', () => {
    render(
      <DetectionsProvider value={ACTIONS}>
        <StudiesSlot variant="phone" />
      </DetectionsProvider>,
    )
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { thirds: true })
    })
    expect(linesCount()).toHaveTextContent('1 on')
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { face: true, edges: { on: true } })
    })
    expect(linesCount()).toHaveTextContent('3 on')
    act(() => {
      useImages.getState().updateLines('a' as ImageId, { thirds: false, edges: { on: false } })
    })
    expect(linesCount()).toHaveTextContent('1 on')
  })
  it('phone with the Guides section: one live region for the wait, and a guide status is announced once', () => {
    const { container } = render(
      <DetectionsProvider value={ACTIONS}>
        <StudiesSlot variant="phone" />
      </DetectionsProvider>,
    )
    expect(
      within(linesSection()).getByRole('heading', { level: 4, name: 'Guides from the photo' }),
    ).toBeVisible()
    const regionsWith = (text: string) =>
      Array.from(container.querySelectorAll('[aria-live]')).filter((r) =>
        r.textContent.includes(text),
      )
    act(() => {
      useImages.setState({ importing: 1 })
    })
    expect(regionsWith('Waiting for photos to finish importing…')).toHaveLength(1)
    act(() => {
      useImages.setState({ importing: 0 })
      useImages.getState().updateLines('a' as ImageId, { edges: { on: true } })
    })
    const img = selectImageDescriptors(useImages.getState()).find((i) => i.id === 'a')
    if (!img) throw new Error('no image')
    act(() => {
      useDetections.setState({
        status: new Map([[detectionKey('edges', img), { state: 'running' }]]),
      })
    })
    expect(regionsWith('Tracing the outline…')).toHaveLength(1)
  })
  it('desktop: no Lines section (the Lines tab holds the panel)', () => {
    render(<StudiesSlot variant="desktop" />)
    expect(screen.queryByRole('region', { name: 'Lines' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Lines' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Apply lines to all images' }),
    ).not.toBeInTheDocument()
  })
})
