import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(undo).toHaveAttribute('aria-disabled', 'true')
    act(() => {
      useArrange.getState().setMode(true)
      useArrange.getState().select('b#0')
    })
    await user.click(screen.getByRole('button', { name: 'Move down' }))
    expect(undo).not.toHaveAttribute('aria-disabled')
    await user.click(undo)
    expect(useArrange.getState().undo).toHaveLength(0)
    expect(useArrange.getState().manual).toBeNull()
    expect(undo).toHaveAttribute('aria-disabled', 'true')
    expect(said()).toBe('Undone.')
  })

  it('the last Undo keeps focus on Undo, which then does nothing (WCAG 2.4.3)', async () => {
    show([loaded('a'), loaded('b')])
    const user = setup()
    act(() => {
      useArrange.getState().setMode(true)
      useArrange.getState().select('b#0')
    })
    await user.click(screen.getByRole('button', { name: 'Move down' }))
    const undo = screen.getByRole('button', { name: 'Undo' })
    undo.focus()
    await user.keyboard('{Enter}')
    expect(useArrange.getState().manual).toBeNull()
    expect(undo).toHaveFocus()
    expect(undo).toBeEnabled()
    act(() => {
      useArrangeUi.getState().announce('')
    })
    await user.keyboard('{Enter}')
    expect(said()).toBe('')
  })

  it('Re-run is off while the layout is automatic, and asks before going back', async () => {
    show([loaded('a'), loaded('b')])
    const user = setup()
    const rerun = screen.getByRole('button', { name: 'Re-run auto layout' })
    expect(rerun).toHaveAttribute('aria-disabled', 'true')
    await user.click(rerun)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => {
      useArrange.getState().setMode(true)
      useArrange.getState().select('b#0')
    })
    await user.click(screen.getByRole('button', { name: 'Move down' }))
    expect(rerun).not.toHaveAttribute('aria-disabled')
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

  it('with an arrangement and no undo step left, Undo is off and Re-run is on', async () => {
    show([loaded('a'), loaded('b')])
    const user = setup()
    act(() => {
      useArrange.setState({ manual: shownManual(), undo: [] })
    })
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-disabled', 'true')
    const rerun = screen.getByRole('button', { name: 'Re-run auto layout' })
    expect(rerun).not.toHaveAttribute('aria-disabled')
    await user.click(rerun)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('after Re-run is confirmed, focus returns to Re-run, still focusable (WCAG 2.4.3)', async () => {
    show([loaded('a'), loaded('b')])
    const user = setup()
    act(() => {
      useArrange.getState().setMode(true)
      useArrange.getState().select('b#0')
    })
    await user.click(screen.getByRole('button', { name: 'Move down' }))
    const rerun = screen.getByRole('button', { name: 'Re-run auto layout' })
    rerun.focus()
    await user.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog')
    within(dialog).getByRole('button', { name: 'Re-run' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useArrange.getState().manual).toBeNull()
    expect(rerun).toHaveFocus()
    expect(rerun).toHaveAttribute('aria-disabled', 'true')
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

describe('ArrangeToolbar on the phone (B5)', () => {
  function phone() {
    stubDesktop(false)
    render(<ArrangeToolbar variant="phone" />)
    return userEvent.setup()
  }
  function arranged(id: string | null) {
    act(() => {
      useArrange.getState().setMode(true)
      useArrange.getState().select(id)
    })
  }
  const bar = () => screen.getByRole('group', { name: 'Arrange photos' })

  it('puts Arrange, Undo and Re-run in one group of 44 px buttons', () => {
    show([loaded('a')])
    phone()
    const toggle = within(bar()).getByRole('button', { name: 'Arrange' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveClass('ds-btn--lg')
    for (const name of ['Undo', 'Re-run auto layout']) {
      const b = within(bar()).getByRole('button', { name })
      expect(b).toHaveClass('ds-btn--icon', 'ds-btn--lg')
      expect(b).toHaveTextContent('')
      expect(b).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('the last Undo and a confirmed Re-run keep focus in the bar (WCAG 2.4.3)', async () => {
    show([loaded('a'), loaded('b')])
    const user = phone()
    arranged('a#0')
    act(() => {
      useArrange.getState().apply((m) => ({ ok: true, manual: m }))
    })
    const undo = within(bar()).getByRole('button', { name: 'Undo' })
    await user.click(undo)
    expect(useArrange.getState().manual).toBeNull()
    expect(undo).toHaveFocus()
    expect(undo).toHaveAttribute('aria-disabled', 'true')
    act(() => {
      useArrange.getState().apply((m) => ({ ok: true, manual: m }))
    })
    const rerun = within(bar()).getByRole('button', { name: 'Re-run auto layout' })
    await user.click(rerun)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Re-run' }))
    expect(useArrange.getState().manual).toBeNull()
    expect(rerun).toHaveFocus()
    expect(rerun).toHaveAttribute('aria-disabled', 'true')
  })

  it('shows no controls for the selected photo in the bar itself', () => {
    show([loaded('a')])
    phone()
    arranged('a#0')
    expect(screen.queryByRole('combobox', { name: 'Move to page' })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'Width' })).toBeNull()
  })

  it('offers Photo options only for a selected photo in Arrange mode', () => {
    show([loaded('a')])
    phone()
    expect(screen.queryByRole('button', { name: 'Photo options' })).toBeNull()
    act(() => {
      useArrange.getState().select('a#0')
    })
    expect(screen.queryByRole('button', { name: 'Photo options' })).toBeNull()
    arranged(null)
    expect(screen.queryByRole('button', { name: 'Photo options' })).toBeNull()
    arranged('a#0')
    expect(within(bar()).getByRole('button', { name: 'Photo options' })).toHaveClass('ds-btn--lg')
  })

  it("Photo options opens the selected photo's sheet: Move to page, Swap with, Width and 44 px Position", async () => {
    show([loaded('a'), loaded('b')])
    const user = phone()
    arranged('a#0')
    const { b } = blockOf('a#0')
    await user.click(screen.getByRole('button', { name: 'Photo options' }))
    const sheet = screen.getByRole('dialog', { name: 'a.jpg' })
    expect(sheet).toHaveClass('ds-sheet')
    expect(sheet).toHaveAccessibleDescription(
      new RegExp(`^${String(Math.round(b.tileW))}(\\.\\d)? × [\\d.]+ mm, page 1 of 1$`),
    )
    expect(within(sheet).getByRole('combobox', { name: 'Move to page' })).toBeInTheDocument()
    expect(within(sheet).getByRole('combobox', { name: 'Swap with…' })).toBeInTheDocument()
    expect(within(sheet).getByRole('spinbutton', { name: 'Width' })).toBeInTheDocument()
    for (const name of ['Move left', 'Move up', 'Move down', 'Move right'])
      expect(within(sheet).getByRole('button', { name })).toHaveClass('ds-btn--icon', 'ds-btn--lg')
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the sheet runs the operations and stays open, so several can follow', async () => {
    show([loaded('a'), loaded('b')])
    const user = phone()
    arranged('b#0')
    await user.click(screen.getByRole('button', { name: 'Photo options' }))
    const sheet = screen.getByRole('dialog', { name: 'b.jpg' })
    await user.selectOptions(
      within(sheet).getByRole('combobox', { name: 'Move to page' }),
      'New page',
    )
    expect(useArrange.getState().manual?.pageCount).toBe(2)
    expect(said()).toMatch(/page 2, /)
    expect(screen.getByRole('dialog', { name: 'b.jpg' })).toHaveAccessibleDescription(
      /, page 2 of 2$/,
    )
    expect(useArrangeUi.getState().focusId).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))
    arranged('a#0')
    await user.click(screen.getByRole('button', { name: 'Photo options' }))
    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toHaveAccessibleDescription(
      /, page 1 of 2$/,
    )
  })

  it('the sheet closes when its photo goes away', async () => {
    show([loaded('a'), loaded('b')])
    const user = phone()
    arranged('b#0')
    await user.click(screen.getByRole('button', { name: 'Photo options' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => {
      useImages.setState({ images: [loaded('a')] })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a sheet closed because its photo went away stays closed when the photo comes back', async () => {
    show([loaded('a'), loaded('b')])
    const user = phone()
    arranged('b#0')
    await user.click(screen.getByRole('button', { name: 'Photo options' }))
    act(() => {
      useImages.setState({ images: [loaded('a')] })
    })
    act(() => {
      useImages.setState({ images: [loaded('a'), loaded('b')] })
    })
    expect(screen.getByRole('button', { name: 'Photo options' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closing the sheet brings the photo into view (it may be on another page now)', async () => {
    show([loaded('a'), loaded('b')])
    const user = phone()
    arranged('b#0')
    const block = document.createElement('div')
    block.dataset.blockId = 'b#0'
    let focusedAtScroll: Element | null = null
    const scroll = vi.fn(() => {
      focusedAtScroll = document.activeElement
    })
    block.scrollIntoView = scroll
    document.body.append(block)
    try {
      await user.click(screen.getByRole('button', { name: 'Photo options' }))
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'center' })
      expect(focusedAtScroll).toBe(screen.getByRole('button', { name: 'Photo options' }))
    } finally {
      block.remove()
    }
  })

  it('when what opened the sheet is gone, closing it focuses the photo (a tapped block re-rendered on another page)', async () => {
    show([loaded('a'), loaded('b')])
    const user = phone()
    arranged('b#0')
    const block = document.createElement('div')
    block.dataset.blockId = 'b#0'
    block.tabIndex = 0
    block.scrollIntoView = vi.fn()
    const tapped = document.createElement('div')
    tapped.tabIndex = 0
    document.body.append(block, tapped)
    try {
      tapped.focus()
      act(() => {
        screen.getByRole('button', { name: 'Photo options' }).click()
      })
      expect(screen.getByRole('dialog', { name: 'b.jpg' })).toBeInTheDocument()
      tapped.remove()
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(document.activeElement).toBe(block)
    } finally {
      block.remove()
      tapped.remove()
    }
  })

  it('Re-run asks first on the phone too', async () => {
    show([loaded('a'), loaded('b')])
    const user = phone()
    arranged('a#0')
    act(() => {
      useArrange.getState().apply((m) => ({ ok: true, manual: m }))
    })
    await user.click(within(bar()).getByRole('button', { name: 'Re-run auto layout' }))
    const dialog = screen.getByRole('dialog', {
      name: 'Re-run auto layout? Your moves and size changes will be lost.',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Re-run' }))
    expect(useArrange.getState().manual).toBeNull()
    expect(said()).toBe('Photos arranged automatically.')
  })
})
