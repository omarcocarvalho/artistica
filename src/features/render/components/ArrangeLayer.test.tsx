import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import type { ImageId } from '../../../shared/model/image'
import { ArrangeLayer } from './ArrangeLayer'
import {
  createSheetRegistry,
  type ArrangeBlock,
  type ArrangeIntent,
  type ArrangePreview,
  type ArrangeProps,
} from './arrange-types'

beforeAll(async () => {
  await initI18n()
})

const PAGE = { w: 210, h: 297 }
const PX_PER_MM = 2

const block = (over: Partial<ArrangeBlock> & Pick<ArrangeBlock, 'id'>): ArrangeBlock => ({
  imageId: over.id as ImageId,
  page: 0,
  rect: { x: 20, y: 20, w: 60, h: 80 },
  tileW: 60,
  fixed: false,
  name: `${over.id}.jpg, 60 × 80 mm, page 1`,
  ...over,
})

const BLOCKS = [
  block({ id: 'a', rect: { x: 20, y: 20, w: 60, h: 80 } }),
  block({ id: 'b', rect: { x: 100, y: 20, w: 50, h: 50 }, tileW: 50 }),
  block({ id: 'c', page: 1, rect: { x: 20, y: 20, w: 40, h: 40 }, tileW: 40 }),
]

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect

let scrolled = 0

function setup(over: Partial<ArrangeProps> = {}, page = 0, at = { x: 0, y: 0 }) {
  scrolled = 0
  const sheets = createSheetRegistry()
  const sheet0 = document.createElement('div')
  sheet0.getBoundingClientRect = () =>
    rect(at.x, at.y - scrolled, PAGE.w * PX_PER_MM, PAGE.h * PX_PER_MM)
  const sheet1 = document.createElement('div')
  sheet1.getBoundingClientRect = () =>
    rect(at.x, at.y + 700 - scrolled, PAGE.w * PX_PER_MM, PAGE.h * PX_PER_MM)
  sheets.register(0, sheet0)
  sheets.register(1, sheet1)
  const onPreview = vi.fn<(i: ArrangeIntent) => ArrangePreview>((i) =>
    i.kind === 'move'
      ? { ok: true, page: i.page, rect: { x: i.x, y: i.y, w: 60, h: 80 } }
      : { ok: true, page: 0, rect: { x: 20, y: 20, w: 90, h: 120 } },
  )
  const props: ArrangeProps = {
    blocks: BLOCKS,
    content: { x: 10, y: 10, w: 190, h: 277 },
    gutter: 5,
    selected: null,
    pickedUp: null,
    focusId: null,
    sheets,
    onSelect: vi.fn(),
    onFocused: vi.fn(),
    onPreview,
    onCommit: vi.fn(() => true),
    onPickUp: vi.fn(),
    ...over,
  }
  const view = render(
    <ArrangeLayer
      arrange={props}
      page={page}
      pageSize={PAGE}
      sheet={() => (page === 0 ? sheet0 : sheet1)}
    />,
  )
  return { props, view, user: userEvent.setup() }
}

const blockEl = (name: RegExp) => screen.getByRole('button', { name })
const down = (el: Element, x: number, y: number) => {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: x, clientY: y })
}
const move = (x: number, y: number) => {
  fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y })
}
const up = (x: number, y: number) => {
  fireEvent.pointerUp(document, { pointerId: 1, clientX: x, clientY: y })
}

describe('ArrangeLayer: blocks', () => {
  it("renders this page's blocks as movable photos with the instructions", () => {
    setup()
    const a = blockEl(/^a\.jpg/)
    expect(a).toHaveAttribute('aria-roledescription', 'movable photo')
    expect(a).toHaveAccessibleName('a.jpg, 60 × 80 mm, page 1')
    expect(a).toHaveAccessibleDescription(
      'Use the arrow keys to move, Shift and the arrow keys to resize, Page Up and Page Down to move to another page, Enter to swap with another photo.',
    )
    expect(screen.queryByRole('button', { name: /^c\.jpg/ })).toBeNull()
  })

  it('puts the blocks in reading order', () => {
    setup()
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('data-block-id'))).toEqual([
      'a',
      'b',
    ])
  })

  it('adds the fixed-size hint and no handles to a fixed-size photo', () => {
    setup({
      blocks: [block({ id: 'a', fixed: true })],
      selected: 'a',
    })
    expect(blockEl(/^a\.jpg/)).toHaveAccessibleDescription(
      'Use the arrow keys to move, Shift and the arrow keys to resize, Page Up and Page Down to move to another page, Enter to swap with another photo. Fixed size: change it in Edit.',
    )
    expect(document.querySelectorAll('.arrange-handle')).toHaveLength(0)
  })

  it('shows four corner handles on the selected photo only', () => {
    setup({ selected: 'b' })
    const handles = [...document.querySelectorAll('.arrange-handle')]
    expect(handles.map((h) => h.getAttribute('data-corner'))).toEqual(['tl', 'tr', 'bl', 'br'])
    expect(
      handles.every((h) => h.closest('[data-block-id]')?.getAttribute('data-block-id') === 'b'),
    ).toBe(true)
  })

  it('places blocks in % of the page', () => {
    setup()
    expect(blockEl(/^b\.jpg/).style.left).toBe(`${String((100 / 210) * 100)}%`)
    expect(blockEl(/^b\.jpg/).style.height).toBe(`${String((50 / 297) * 100)}%`)
  })

  it('focus alone never selects, in either direction', async () => {
    const { props, user } = setup({ selected: 'b' })
    await user.tab()
    await user.tab()
    expect(blockEl(/^b\.jpg/)).toHaveFocus()
    await user.tab({ shift: true })
    expect(blockEl(/^a\.jpg/)).toHaveFocus()
    await user.tab({ shift: true })
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('selects on pointer down and on click', () => {
    const { props } = setup()
    down(blockEl(/^b\.jpg/), 220, 60)
    expect(props.onSelect).toHaveBeenLastCalledWith('b')
    fireEvent.click(blockEl(/^a\.jpg/))
    expect(props.onSelect).toHaveBeenLastCalledWith('a')
  })

  it('a click on the selected block does not select it again', () => {
    const { props } = setup({ selected: 'a' })
    fireEvent.click(blockEl(/^a\.jpg/))
    expect(props.onSelect).not.toHaveBeenCalled()
  })
})

describe('ArrangeLayer: pointer', () => {
  it('a move under 4 px is a click: nothing is previewed or committed', () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(62, 61)
    up(62, 61)
    expect(props.onPreview).not.toHaveBeenCalled()
    expect(props.onCommit).not.toHaveBeenCalled()
    expect(screen.queryByTestId('arrange-ghost')).toBeNull()
  })

  it('the ghost follows the pointer in mm and pointer up commits the move', () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(160, 300)
    const ghost = screen.getByTestId('arrange-ghost')
    expect(ghost.style.transform).toBe('translate(140px, 280px)')
    expect(ghost.style.width).toBe('120px')
    up(160, 300)
    expect(props.onCommit).toHaveBeenCalledExactlyOnceWith({
      kind: 'move',
      id: 'a',
      page: 0,
      x: 70,
      y: 140,
      fallback: false,
    })
    expect(screen.queryByTestId('arrange-ghost')).toBeNull()
  })

  it("draws the ghost outside the layer, in the viewport's coordinates, so no scroller clips it", () => {
    const { view } = setup({}, 0, { x: 300, y: -40 })
    down(blockEl(/^a\.jpg/), 360, 20)
    move(460, 260)
    const ghost = screen.getByTestId('arrange-ghost')
    expect(view.container.contains(ghost)).toBe(false)
    expect(ghost.parentElement).toBe(document.body)
    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(ghost.style.transform).toBe('translate(440px, 240px)')
    expect(ghost.style.width).toBe('120px')
    expect(ghost.style.height).toBe('160px')
  })

  it('keeps the swap target on the sheet, in its coordinates', () => {
    const { view } = setup({}, 0, { x: 300, y: -40 })
    down(blockEl(/^a\.jpg/), 360, 20)
    move(540, 30)
    const target = document.querySelector<HTMLElement>('.arrange-swap-target')
    expect(target && view.container.contains(target)).toBe(true)
    expect(target?.style.transform).toBe('translate(200px, 40px)')
  })

  it('removes the ghost from the page when the drag ends, is cancelled or the layer goes', () => {
    const first = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(160, 300)
    fireEvent.pointerCancel(document, { pointerId: 1 })
    expect(document.querySelector('.arrange-ghost')).toBeNull()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(160, 300)
    expect(document.querySelector('.arrange-ghost')).not.toBeNull()
    first.view.unmount()
    expect(document.querySelector('.arrange-ghost')).toBeNull()
  })

  it('snaps to the margin within 2 mm', () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(43, 200)
    up(43, 200)
    expect(props.onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'move', x: 10, y: 90 }),
    )
  })

  it("over another block's centre the target is outlined and pointer up swaps", () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(240, 70)
    expect(document.querySelector('.arrange-swap-target')).not.toBeNull()
    up(240, 70)
    expect(props.onCommit).toHaveBeenCalledExactlyOnceWith({ kind: 'swap', id: 'a', with: 'b' })
  })

  it('an invalid spot shows the ghost in the danger style and still asks to commit (which refuses)', () => {
    const { props } = setup({ onPreview: vi.fn(() => ({ ok: false }) as const) })
    down(blockEl(/^a\.jpg/), 60, 60)
    move(160, 300)
    const ghost = screen.getByTestId('arrange-ghost')
    expect(ghost).toHaveClass('is-invalid')
    expect(ghost).toHaveTextContent("Can't place here")
    up(160, 300)
    expect(props.onCommit).toHaveBeenCalledOnce()
  })

  it('Escape cancels a drag', () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(160, 300)
    fireEvent.keyDown(document, { key: 'Escape' })
    up(160, 300)
    expect(props.onCommit).not.toHaveBeenCalled()
    expect(screen.queryByTestId('arrange-ghost')).toBeNull()
  })

  it('pointercancel cancels a drag', () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(160, 300)
    fireEvent.pointerCancel(document, { pointerId: 1 })
    up(160, 300)
    expect(props.onCommit).not.toHaveBeenCalled()
  })

  it('ignores other pointers', () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    fireEvent.pointerMove(document, { pointerId: 2, clientX: 160, clientY: 300 })
    fireEvent.pointerUp(document, { pointerId: 2, clientX: 160, clientY: 300 })
    expect(props.onCommit).not.toHaveBeenCalled()
  })

  it("dropped over another page's sheet, commits a move on that page with the fallback", () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(160, 700 + 300)
    expect(screen.getByTestId('arrange-ghost').style.transform).toBe('translate(140px, 980px)')
    up(160, 700 + 300)
    expect(props.onCommit).toHaveBeenCalledExactlyOnceWith({
      kind: 'move',
      id: 'a',
      page: 1,
      x: 70,
      y: 140,
      fallback: true,
    })
  })

  it('follows the page when it scrolls during a drag', () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    move(160, 300)
    scrolled = 100
    fireEvent.scroll(document)
    expect(screen.getByTestId('arrange-ghost').style.transform).toBe('translate(140px, 280px)')
    move(160, 300)
    expect(screen.getByTestId('arrange-ghost').style.transform).toBe('translate(140px, 280px)')
    up(160, 300)
    expect(props.onCommit).toHaveBeenCalledWith(expect.objectContaining({ x: 70, y: 190 }))
  })

  it('a scroll before the drag starts moves nothing', () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    scrolled = 100
    fireEvent.scroll(document)
    expect(screen.queryByTestId('arrange-ghost')).toBeNull()
    up(60, 60)
    expect(props.onCommit).not.toHaveBeenCalled()
  })

  it('ignores buttons other than the main one', () => {
    const { props } = setup()
    fireEvent.pointerDown(blockEl(/^a\.jpg/), { pointerId: 1, button: 2, clientX: 60, clientY: 60 })
    move(160, 300)
    up(160, 300)
    expect(props.onCommit).not.toHaveBeenCalled()
  })

  it('dragging a corner handle resizes with the opposite corner fixed', () => {
    const { props } = setup({ selected: 'a' })
    const br = document.querySelector('[data-block-id="a"] [data-corner="br"]')
    if (!br) throw new Error('no handle')
    down(br, 160, 200)
    move(220, 280)
    up(220, 280)
    expect(props.onCommit).toHaveBeenCalledOnce()
    const intent = vi.mocked(props.onCommit).mock.calls[0]?.[0]
    expect(intent).toMatchObject({ kind: 'resize', id: 'a', anchor: 'tl' })
    expect(intent?.kind === 'resize' ? intent.tileW : 0).toBeCloseTo(60 * 1.5, 0)
  })

  it("draws a resize ghost in the viewport's coordinates too", () => {
    setup({ selected: 'a' }, 0, { x: 300, y: -40 })
    const br = document.querySelector('[data-block-id="a"] [data-corner="br"]')
    if (!br) throw new Error('no handle')
    down(br, 460, 160)
    move(520, 240)
    const ghost = screen.getByTestId('arrange-ghost')
    expect(ghost.parentElement).toBe(document.body)
    expect(ghost.style.transform).toBe('translate(340px, 0px)')
    expect(ghost.style.width).toBe('180px')
  })

  it.each([
    ['tl', 'br', -40, -40],
    ['tr', 'bl', 40, -40],
    ['bl', 'tr', -40, 40],
    ['br', 'tl', 40, 40],
  ] as const)('the %s handle resizes about the opposite corner (%s)', (corner, anchor, dx, dy) => {
    const { props } = setup({ selected: 'a' })
    const handle = document.querySelector(`[data-block-id="a"] [data-corner="${corner}"]`)
    if (!handle) throw new Error('no handle')
    down(handle, 160, 200)
    move(160 + dx, 200 + dy)
    up(160 + dx, 200 + dy)
    expect(props.onCommit).toHaveBeenCalledOnce()
    expect(vi.mocked(props.onCommit).mock.calls[0]?.[0]).toMatchObject({
      kind: 'resize',
      id: 'a',
      anchor,
    })
  })

  it('a drag commits nothing during 50 pointer moves (M5-R19)', () => {
    const { props } = setup()
    down(blockEl(/^a\.jpg/), 60, 60)
    for (let i = 0; i < 50; i++) move(60 + i * 3, 60 + i * 2)
    expect(props.onCommit).not.toHaveBeenCalled()
    up(210, 160)
    expect(props.onCommit).toHaveBeenCalledOnce()
  })
})

describe('ArrangeLayer: keyboard', () => {
  it.each([
    ['ArrowLeft', -1, 0],
    ['ArrowRight', 1, 0],
    ['ArrowUp', 0, -1],
    ['ArrowDown', 0, 1],
  ])('%s nudges 1 mm', (key, dx, dy) => {
    const { props } = setup()
    fireEvent.keyDown(blockEl(/^a\.jpg/), { key })
    expect(props.onCommit).toHaveBeenCalledWith({ kind: 'nudge', id: 'a', dx, dy })
  })

  it.each([
    ['ArrowRight', 61],
    ['ArrowDown', 61],
    ['ArrowLeft', 59],
    ['ArrowUp', 59],
  ])('Shift + %s resizes by 1 mm of tile width, top-left fixed', (key, tileW) => {
    const { props } = setup()
    fireEvent.keyDown(blockEl(/^a\.jpg/), { key, shiftKey: true })
    expect(props.onCommit).toHaveBeenCalledWith({ kind: 'resize', id: 'a', tileW, anchor: 'tl' })
  })

  it('Enter and Space pick a block up; Enter on another block swaps them', () => {
    const { props, view } = setup()
    fireEvent.keyDown(blockEl(/^a\.jpg/), { key: 'Enter' })
    expect(props.onPickUp).toHaveBeenCalledWith('a')
    fireEvent.keyDown(blockEl(/^b\.jpg/), { key: ' ' })
    expect(props.onPickUp).toHaveBeenLastCalledWith('b')
    view.rerender(
      <ArrangeLayer
        arrange={{ ...props, pickedUp: 'a' }}
        page={0}
        pageSize={PAGE}
        sheet={() => null}
      />,
    )
    expect(screen.getByText('Picked up')).toBeInTheDocument()
    fireEvent.keyDown(blockEl(/^b\.jpg/), { key: 'Enter' })
    expect(props.onCommit).toHaveBeenCalledWith({ kind: 'swap', id: 'a', with: 'b' })
  })

  it('Escape or Enter on the picked-up block cancels the pick-up', () => {
    const { props } = setup({ pickedUp: 'a' })
    fireEvent.keyDown(blockEl(/^b\.jpg/), { key: 'Escape' })
    expect(props.onPickUp).toHaveBeenLastCalledWith(null)
    vi.mocked(props.onPickUp).mockClear()
    fireEvent.keyDown(blockEl(/^a\.jpg/), { key: 'Enter' })
    expect(props.onPickUp).toHaveBeenLastCalledWith(null)
  })

  it('a held Enter does not toggle the pick-up again', () => {
    const { props } = setup()
    fireEvent.keyDown(blockEl(/^a\.jpg/), { key: 'Enter' })
    fireEvent.keyDown(blockEl(/^a\.jpg/), { key: 'Enter', repeat: true })
    expect(props.onPickUp).toHaveBeenCalledOnce()
  })

  it.each([
    ['PageDown', 1],
    ['PageUp', -1],
  ])('%s moves the block to the next or previous page', (key, page) => {
    const { props } = setup({ blocks: [block({ id: 'c', page: 1 })] }, 1)
    const notPrevented = fireEvent.keyDown(blockEl(/^c\.jpg/), { key })
    expect(notPrevented).toBe(false)
    expect(props.onCommit).toHaveBeenCalledExactlyOnceWith({
      kind: 'page',
      id: 'c',
      page: 1 + page,
    })
  })

  it('a held Page Down moves one page only', () => {
    const { props } = setup()
    const a = blockEl(/^a\.jpg/)
    fireEvent.keyDown(a, { key: 'PageDown' })
    fireEvent.keyDown(a, { key: 'PageDown', repeat: true })
    expect(props.onCommit).toHaveBeenCalledOnce()
  })

  it.each([
    ['ArrowRight', {}],
    ['ArrowRight', { shiftKey: true }],
    ['PageDown', {}],
    ['Enter', {}],
    [' ', {}],
  ])('%s %o on a block selects it before acting', (key, mods) => {
    const { props } = setup({ selected: 'a' })
    fireEvent.keyDown(blockEl(/^b\.jpg/), { key, ...mods })
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith('b')
    const acted = [
      ...vi.mocked(props.onCommit).mock.invocationCallOrder,
      ...vi.mocked(props.onPickUp).mock.invocationCallOrder,
    ]
    expect(acted).toHaveLength(1)
    expect(vi.mocked(props.onSelect).mock.invocationCallOrder[0]).toBeLessThan(acted[0] ?? 0)
  })

  it('a keyboard swap selects the picked-up photo, not the one it swaps with', () => {
    const { props } = setup({ selected: 'a', pickedUp: 'a' })
    fireEvent.keyDown(blockEl(/^b\.jpg/), { key: 'Enter' })
    expect(props.onCommit).toHaveBeenCalledWith({ kind: 'swap', id: 'a', with: 'b' })
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('a keyboard swap selects the picked-up photo when another photo was selected since', () => {
    const { props } = setup({ selected: 'b', pickedUp: 'a' })
    fireEvent.keyDown(blockEl(/^b\.jpg/), { key: 'Enter' })
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith('a')
    expect(vi.mocked(props.onSelect).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(props.onCommit).mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('Escape and keys the block does not handle leave the selection alone', () => {
    const { props } = setup({ selected: 'a', pickedUp: 'a' })
    const b = blockEl(/^b\.jpg/)
    fireEvent.keyDown(b, { key: 'Escape' })
    fireEvent.keyDown(b, { key: 'Tab' })
    fireEvent.keyDown(b, { key: 'Delete' })
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('Delete does nothing', () => {
    const { props } = setup()
    fireEvent.keyDown(blockEl(/^a\.jpg/), { key: 'Delete' })
    expect(props.onCommit).not.toHaveBeenCalled()
    expect(props.onPickUp).not.toHaveBeenCalled()
  })

  it('a refused step is tried once while the key is held, and again after it is released', () => {
    const { props } = setup({ onCommit: vi.fn(() => false) })
    const a = blockEl(/^a\.jpg/)
    fireEvent.keyDown(a, { key: 'ArrowLeft' })
    fireEvent.keyDown(a, { key: 'ArrowLeft', repeat: true })
    fireEvent.keyDown(a, { key: 'ArrowLeft', repeat: true })
    expect(props.onCommit).toHaveBeenCalledOnce()
    fireEvent.keyUp(a, { key: 'ArrowLeft' })
    fireEvent.keyDown(a, { key: 'ArrowLeft' })
    expect(props.onCommit).toHaveBeenCalledTimes(2)
  })

  it('a held key keeps moving while the steps succeed', () => {
    const { props } = setup()
    const a = blockEl(/^a\.jpg/)
    fireEvent.keyDown(a, { key: 'ArrowLeft' })
    fireEvent.keyDown(a, { key: 'ArrowLeft', repeat: true })
    expect(props.onCommit).toHaveBeenCalledTimes(2)
  })
})

describe('ArrangeLayer: focus', () => {
  it('focuses the requested block once it is drawn and reports it', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const { props } = setup({ focusId: 'b' })
    expect(blockEl(/^b\.jpg/)).toHaveFocus()
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    expect(props.onFocused).toHaveBeenCalledWith('b')
  })

  it('leaves a request for a block on another page alone', () => {
    const { props } = setup({ focusId: 'c' })
    expect(props.onFocused).not.toHaveBeenCalled()
  })

  it('focusing a block leaves the selection where it is', () => {
    const { props } = setup({ selected: 'a' })
    act(() => {
      blockEl(/^b\.jpg/).focus()
    })
    expect(props.onSelect).not.toHaveBeenCalled()
  })
})

describe('createSheetRegistry', () => {
  it("an old sheet's unregister leaves the sheet that replaced it", () => {
    const sheets = createSheetRegistry()
    const old = document.createElement('div')
    const fresh = document.createElement('div')
    fresh.getBoundingClientRect = () => rect(0, 0, 100, 100)
    const unregisterOld = sheets.register(0, old)
    sheets.register(0, fresh)
    unregisterOld()
    expect(sheets.at(50, 50)?.page).toBe(0)
  })
})
