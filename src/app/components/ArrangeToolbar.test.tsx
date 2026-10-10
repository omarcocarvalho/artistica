import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { selectImageDescriptors, useImages } from '../../features/images'
import { buildLayoutItems } from '../../features/layout/build-items'
import { computeLayout } from '../../features/layout/compute-layout'
import { useSettings } from '../../features/settings'
import { initI18n } from '../../shared/i18n'
import { DEFAULT_EDITS, type ImageId } from '../../shared/model/image'
import { DEFAULT_LINES } from '../../shared/model/lines'
import { DEFAULT_STUDY } from '../../shared/model/study'
import { shownManual } from '../arrange-controller'
import { useArrange } from '../arrange-store'
import { useArrangeUi } from '../arrange-ui'
import { usePages } from '../pages-store'
import { stubDesktop } from '../test-utils'
import { ArrangeToolbar } from './ArrangeToolbar'

const loaded = (id: string, edits = DEFAULT_EDITS) => ({
  id: id as ImageId,
  name: `${id}.jpg`,
  contentHash: `h-${id}`,
  pxW: 400,
  pxH: 300,
  originalPxW: 400,
  originalPxH: 300,
  edits,
  study: DEFAULT_STUDY,
  lines: DEFAULT_LINES,
  preview: { close: () => undefined } as unknown as ImageBitmap,
  source: new Blob(),
  thumbUrl: `blob:${id}`,
})

function show(photos: ReturnType<typeof loaded>[]): void {
  useImages.setState({ images: photos })
  const items = buildLayoutItems(selectImageDescriptors(useImages.getState()))
  const layout = computeLayout(useSettings.getState().pageSetup, items)
  usePages.setState({ layout, empty: false, status: 'idle' })
}

const said = () => useArrangeUi.getState().announcement.text

function blockOf(id: string) {
  const m = shownManual()
  const b = m?.blocks.find((x) => x.blockId === id)
  if (!m || !b) throw new Error('no block')
  return { m, b }
}

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  stubDesktop(true)
  useSettings.getState().reset()
  useSettings.getState().setUnit('mm')
  useArrange.setState(useArrange.getInitialState(), true)
  useArrangeUi.setState(useArrangeUi.getInitialState(), true)
  usePages.setState({ layout: null, empty: false, pages: [], status: 'idle' })
  useImages.setState({ images: [] })
})
afterEach(() => {
  useImages.setState({ images: [] })
})

function setup() {
  render(<ArrangeToolbar />)
  return userEvent.setup()
}

describe('ArrangeToolbar: Arrange, Undo, Re-run', () => {
  it('Arrange is a toggle button', async () => {
    show([loaded('a')])
    const user = setup()
    const toggle = screen.getByRole('button', { name: 'Arrange' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(useArrange.getState().mode).toBe(true)
  })

  it('Undo is off with nothing to undo, and undoes the last step', async () => {
    show([loaded('a'), loaded('b')])
    const user = setup()
    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo).toBeDisabled()
    act(() => {
      useArrange.getState().setMode(true)
      useArrange.getState().select('b#0')
    })
    await user.click(screen.getByRole('button', { name: 'Move down' }))
    expect(undo).toBeEnabled()
    await user.click(undo)
    expect(useArrange.getState().undo).toHaveLength(0)
    expect(undo).toBeDisabled()
    expect(said()).toBe('Undone.')
  })

  it('Re-run is off while the layout is automatic, and asks before going back', async () => {
    show([loaded('a'), loaded('b')])
    const user = setup()
    const rerun = screen.getByRole('button', { name: 'Re-run auto layout' })
    expect(rerun).toBeDisabled()
    act(() => {
      useArrange.getState().setMode(true)
      useArrange.getState().select('b#0')
    })
    await user.click(screen.getByRole('button', { name: 'Move down' }))
    expect(rerun).toBeEnabled()
    await user.click(rerun)
    const dialog = screen.getByRole('dialog', {
      name: 'Re-run auto layout? Your moves and size changes will be lost.',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(useArrange.getState().manual).not.toBeNull()
    await user.click(rerun)
    await user.click(screen.getByRole('button', { name: 'Re-run' }))
    expect(useArrange.getState()).toMatchObject({ manual: null, undo: [] })
    expect(said()).toBe('Photos arranged automatically.')
  })
})

describe('ArrangeToolbar: the selected photo', () => {
  function arranged(id: string | null) {
    act(() => {
      useArrange.getState().setMode(true)
      useArrange.getState().select(id)
    })
  }

  it('shows nothing for the selected photo outside Arrange mode or with no selection', () => {
    show([loaded('a')])
    setup()
    act(() => {
      useArrange.getState().select('a#0')
    })
    expect(screen.queryByRole('group', { name: /^Selected photo/ })).toBeNull()
    arranged(null)
    expect(screen.queryByRole('group', { name: /^Selected photo/ })).toBeNull()
  })

  it('drops a stale selection: no controls for a photo that is gone', () => {
    show([loaded('a'), loaded('b')])
    setup()
    arranged('b#0')
    act(() => {
      useImages.setState({ images: [loaded('a')] })
    })
    expect(screen.queryByRole('group', { name: /^Selected photo/ })).toBeNull()
  })

  it('names the group after the photo', () => {
    show([loaded('a')])
    setup()
    arranged('a#0')
    expect(screen.getByRole('group', { name: 'Selected photo: a.jpg' })).toBeInTheDocument()
  })

  it('Move to page lists the pages and a new page, and moves the photo there', async () => {
    show([loaded('a'), loaded('b')])
    const user = setup()
    arranged('b#0')
    const select = screen.getByRole('combobox', { name: 'Move to page' })
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Page 1', 'New page'])
    await user.selectOptions(select, 'New page')
    expect(useArrange.getState().manual?.pageCount).toBe(2)
    expect(said()).toMatch(/page 2, /)
    expect(useArrangeUi.getState().focusId).toBeNull()
  })

  it('Swap with lists the other photos by name and page, and swaps', async () => {
    show([loaded('a'), loaded('b')])
    const user = setup()
    arranged('a#0')
    const before = blockOf('b#0')
    const select = screen.getByRole('combobox', { name: 'Swap with…' })
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choose a photo', 'b.jpg, page 1'])
    await user.selectOptions(select, 'b.jpg, page 1')
    expect(blockOf('a#0').b.x).toBeCloseTo(before.b.x)
    expect(select).toHaveValue('')
    expect(useArrangeUi.getState().focusId).toBeNull()
  })

  it('Width shows the tile width in the user unit and resizes on Enter', async () => {
    show([loaded('a')])
    const user = setup()
    arranged('a#0')
    const { b } = blockOf('a#0')
    const width = screen.getByRole('spinbutton', { name: 'Width' })
    expect(width).toHaveValue(String(Math.round(b.tileW * 10) / 10))
    await user.clear(width)
    await user.type(width, '30{Enter}')
    expect(blockOf('a#0').b.tileW).toBeCloseTo(30)
    expect(blockOf('a#0').b.x).toBeCloseTo(b.x)
    expect(blockOf('a#0').b.y).toBeCloseTo(b.y)
    expect(useArrangeUi.getState().focusId).toBeNull()
  })

  it('Width is off for a fixed-size photo and says why', () => {
    show([loaded('a', { ...DEFAULT_EDITS, size: { kind: 'fixed', axis: 'width', mm: 50 } })])
    setup()
    arranged('a#0')
    const width = screen.getByRole('spinbutton', { name: 'Width' })
    expect(width).toBeDisabled()
    expect(width).toHaveAccessibleDescription('Fixed size: change it in Edit.')
  })

  it.each([
    ['Move left', -1, 0],
    ['Move up', 0, -1],
    ['Move down', 0, 1],
    ['Move right', 1, 0],
  ])(
    '%s nudges 1 mm, one undo step, announced like an arrow key (ruling E1)',
    async (name, dx, dy) => {
      show([loaded('a'), loaded('b')])
      const user = setup()
      arranged('b#0')
      act(() => {
        useArrange.getState().apply((m) => ({ ok: true, manual: m }))
        useArrange.setState({ undo: [] })
      })
      const { m, b } = blockOf('b#0')
      const centred = { ...b, x: m.content.x + 40, y: m.content.y + 140 }
      act(() => {
        useArrange.setState({
          manual: { ...m, blocks: m.blocks.map((x) => (x.blockId === b.blockId ? centred : x)) },
        })
      })
      await user.click(screen.getByRole('button', { name }))
      const after = blockOf('b#0').b
      expect(after.x - centred.x).toBeCloseTo(dx)
      expect(after.y - centred.y).toBeCloseTo(dy)
      expect(useArrange.getState().undo).toHaveLength(1)
      expect(said()).toMatch(/^b\.jpg, .* mm from the left, .* mm from the top\.$/)
      expect(useArrangeUi.getState().focusId).toBeNull()
    },
  )

  it('the Position buttons are 32 px icon buttons (at least 24 px, WCAG 2.5.8)', () => {
    show([loaded('a')])
    setup()
    arranged('a#0')
    for (const name of ['Move left', 'Move up', 'Move down', 'Move right'])
      expect(screen.getByRole('button', { name })).toHaveClass('ds-btn--icon')
  })

  it('a refused nudge from a button says why', async () => {
    show([loaded('a')])
    const user = setup()
    arranged('a#0')
    const { m, b } = blockOf('a#0')
    act(() => {
      useArrange.setState({
        manual: { ...m, blocks: [{ ...b, x: m.content.x }] },
      })
    })
    await user.click(screen.getByRole('button', { name: 'Move left' }))
    expect(said()).toBe("Can't move it further: another photo or the margin is in the way.")
  })
})
