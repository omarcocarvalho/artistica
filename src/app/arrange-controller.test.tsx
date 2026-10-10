import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { selectImageDescriptors, useImages } from '../features/images'
import { buildLayoutItems } from '../features/layout/build-items'
import { computeLayout } from '../features/layout/compute-layout'
import { blockRect, manualFromLayout, type ManualLayout } from '../features/layout/manual'
import type { LayoutItemInput } from '../features/layout/types'
import { useSettings } from '../features/settings'
import { initI18n } from '../shared/i18n'
import { DEFAULT_EDITS, type ImageId } from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import { DEFAULT_STUDY } from '../shared/model/study'
import {
  arrangeBlocks,
  commitOp,
  pickUpBlock,
  previewOp,
  rerunAutoLayout,
  selectBlock,
  setArrangeMode,
  shownManual,
  undoArrange,
} from './arrange-controller'
import { useArrange } from './arrange-store'
import { useArrangeUi } from './arrange-ui'
import { usePages } from './pages-store'

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

const items = (): LayoutItemInput[] =>
  buildLayoutItems(selectImageDescriptors(useImages.getState()))

function show(photos: ReturnType<typeof loaded>[]): void {
  useImages.setState({ images: photos })
  const layout = computeLayout(useSettings.getState().pageSetup, items())
  usePages.setState({ layout, empty: false, status: 'idle' })
}

function base(): ManualLayout {
  const m = shownManual()
  if (m === null) throw new Error('nothing shown')
  return m
}

const said = () => useArrangeUi.getState().announcement.text

function rectOf(m: ManualLayout, id: string) {
  const b = m.blocks.find((x) => x.blockId === id)
  const it = items().find((i) => `${i.imageId}#0` === id)
  if (!b || !it) throw new Error('missing')
  return { b, r: blockRect(b, it, m.gutter) }
}

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
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

describe('arrangeBlocks', () => {
  it('names each block "name, W × H mm, page N" from its trim box', () => {
    show([loaded('a'), loaded('b')])
    const m = base()
    const blocks = arrangeBlocks(m, items(), 'mm')
    const { r } = rectOf(m, 'a#0')
    const a = blocks.find((b) => b.id === 'a#0')
    expect(a).toMatchObject({ imageId: 'a', page: 0, rect: r, fixed: false })
    expect(a?.name).toBe(
      `a.jpg, ${String(Math.round(r.w * 10) / 10)} × ${String(Math.round(r.h * 10) / 10)} mm, page 1`,
    )
  })

  it("uses the user's unit", () => {
    show([loaded('a')])
    const m = base()
    const { r } = rectOf(m, 'a#0')
    expect(arrangeBlocks(m, items(), 'in')[0]?.name).toBe(
      `a.jpg, ${String(Math.round((r.w / 25.4) * 100) / 100)} × ${String(Math.round((r.h / 25.4) * 100) / 100)} in, page 1`,
    )
  })

  it('leaves out a block whose photo is gone (ruling B3-5)', () => {
    show([loaded('a'), loaded('b')])
    const m = base()
    useImages.setState({ images: [loaded('a')] })
    expect(arrangeBlocks(m, items(), 'mm').map((b) => b.id)).toEqual(['a#0'])
  })

  it('flags fixed-size photos', () => {
    show([loaded('a', { ...DEFAULT_EDITS, size: { kind: 'fixed', axis: 'width', mm: 50 } })])
    expect(arrangeBlocks(base(), items(), 'mm')[0]?.fixed).toBe(true)
  })

  it('is empty when nothing is shown', () => {
    expect(arrangeBlocks(null, [], 'mm')).toEqual([])
  })
})

describe('commitOp', () => {
  it('nudges 1 mm as one undo step and announces the new place from the page trim edge', () => {
    show([loaded('a'), loaded('b')])
    const before = rectOf(base(), 'b#0')
    expect(commitOp({ kind: 'nudge', id: 'b#0', dx: 0, dy: 1 }, { fromBlock: true })).toBe(true)
    const m = useArrange.getState().manual
    if (!m) throw new Error('not arranged')
    const { r } = rectOf(m, 'b#0')
    expect(r.y).toBeCloseTo(before.r.y + 1)
    expect(useArrange.getState().undo).toHaveLength(1)
    const f = (n: number) => String(Math.round(n * 10) / 10)
    expect(said()).toBe(
      `b.jpg, ${f(r.w)} × ${f(r.h)} mm, page 1, ${f(r.x)} mm from the left, ${f(r.y)} mm from the top.`,
    )
  })

  it('keeps focus on the block when the operation came from it, not from the toolbar', () => {
    show([loaded('a'), loaded('b')])
    commitOp({ kind: 'nudge', id: 'b#0', dx: 0, dy: 1 }, { fromBlock: false })
    expect(useArrangeUi.getState().focusId).toBeNull()
    commitOp({ kind: 'nudge', id: 'b#0', dx: 0, dy: 1 }, { fromBlock: true })
    expect(useArrangeUi.getState().focusId).toBe('b#0')
  })

  it('a refused step announces why and pushes no undo step', () => {
    show([loaded('a')])
    const m = base()
    const { r } = rectOf(m, 'a#0')
    expect(
      commitOp(
        { kind: 'move', id: 'a#0', page: 0, x: m.content.x - 5, y: r.y, fallback: false },
        { fromBlock: true },
      ),
    ).toBe(false)
    expect(said()).toBe("Can't place it there: it would go past the margin.")
    expect(useArrange.getState().undo).toHaveLength(0)
    expect(useArrange.getState().manual).toBeNull()
  })

  it('a drop onto another photo is refused as an overlap', () => {
    show([loaded('a'), loaded('b')])
    const m = base()
    const b = rectOf(m, 'b#0').r
    commitOp(
      { kind: 'move', id: 'a#0', page: 0, x: b.x, y: b.y, fallback: false },
      { fromBlock: true },
    )
    expect(said()).toBe("Can't place it there: it would overlap another photo.")
  })

  it('a drop on another page falls back to where that page has room', () => {
    show([loaded('a'), loaded('b')])
    commitOp({ kind: 'page', id: 'b#0', page: 1 }, { fromBlock: false })
    const m = useArrange.getState().manual
    if (!m) throw new Error('not arranged')
    expect(m.pageCount).toBe(2)
    expect(
      commitOp(
        { kind: 'move', id: 'a#0', page: 1, x: -50, y: -50, fallback: true },
        { fromBlock: true },
      ),
    ).toBe(true)
    const after = useArrange.getState().manual
    expect(after?.pageCount).toBe(1)
    expect(after?.blocks.map((x) => x.page)).toEqual([0, 0])
  })

  it('a drop on another page with no room there says so', () => {
    show([loaded('a'), loaded('b')])
    commitOp({ kind: 'page', id: 'b#0', page: 1 }, { fromBlock: false })
    commitOp({ kind: 'resize', id: 'b#0', tileW: 1000, anchor: 'tl' }, { fromBlock: false })
    commitOp({ kind: 'resize', id: 'a#0', tileW: 1000, anchor: 'tl' }, { fromBlock: false })
    const before = useArrange.getState().manual
    expect(
      commitOp(
        { kind: 'move', id: 'a#0', page: 1, x: -50, y: -50, fallback: true },
        { fromBlock: true },
      ),
    ).toBe(false)
    expect(said()).toBe("Can't place it there: there is no room for it on that page.")
    expect(useArrange.getState().manual).toBe(before)
  })

  it('moves to a new page and announces page 2', () => {
    show([loaded('a'), loaded('b')])
    expect(commitOp({ kind: 'page', id: 'b#0', page: 2 }, { fromBlock: false })).toBe(false)
    commitOp({ kind: 'page', id: 'b#0', page: 1 }, { fromBlock: false })
    expect(said()).toMatch(/^b\.jpg, .* page 2, /)
  })

  it('nudging into the margin is "blocked"', () => {
    show([loaded('a')])
    const m = base()
    const { r } = rectOf(m, 'a#0')
    commitOp(
      { kind: 'move', id: 'a#0', page: 0, x: m.content.x, y: r.y, fallback: false },
      { fromBlock: true },
    )
    commitOp({ kind: 'nudge', id: 'a#0', dx: -1, dy: 0 }, { fromBlock: true })
    expect(said()).toBe("Can't move it further: another photo or the margin is in the way.")
  })

  it.each([
    ['grow', 1000, "Can't make it bigger: another photo or the margin is in the way."],
    ['min', 1, "It can't get any smaller."],
  ])('a refused resize (%s) says why', (_l, tileW, text) => {
    show([loaded('a')])
    expect(commitOp({ kind: 'resize', id: 'a#0', tileW, anchor: 'tl' }, { fromBlock: true })).toBe(
      true,
    )
    expect(commitOp({ kind: 'resize', id: 'a#0', tileW, anchor: 'tl' }, { fromBlock: true })).toBe(
      false,
    )
    expect(said()).toBe(text)
  })

  it('a fixed-size photo is not resized', () => {
    show([loaded('a', { ...DEFAULT_EDITS, size: { kind: 'fixed', axis: 'width', mm: 50 } })])
    commitOp({ kind: 'resize', id: 'a#0', tileW: 60, anchor: 'tl' }, { fromBlock: true })
    expect(said()).toBe('Fixed size: change it in Edit.')
  })

  it('swaps, clears the pick-up and announces the moved photo', () => {
    show([loaded('a'), loaded('b')])
    const bBefore = rectOf(base(), 'b#0').r
    useArrangeUi.getState().pickUp('a#0')
    expect(commitOp({ kind: 'swap', id: 'a#0', with: 'b#0' }, { fromBlock: true })).toBe(true)
    expect(useArrangeUi.getState().pickedUp).toBeNull()
    const m = useArrange.getState().manual
    if (!m) throw new Error('not arranged')
    expect(rectOf(m, 'a#0').r.x).toBeCloseTo(bBefore.x)
    expect(said()).toMatch(/^a\.jpg, /)
  })

  it('offers nothing for a block whose photo is gone (ruling B3-5)', () => {
    show([loaded('a'), loaded('b')])
    useArrange.getState().apply((m) => ({ ok: true, manual: m }))
    useImages.setState({ images: [loaded('a')] })
    const before = useArrange.getState()
    expect(commitOp({ kind: 'nudge', id: 'b#0', dx: 1, dy: 0 }, { fromBlock: true })).toBe(false)
    expect(useArrange.getState()).toBe(before)
    expect(said()).toBe('')
  })

  it('offers nothing when no layout is shown', () => {
    expect(commitOp({ kind: 'nudge', id: 'a#0', dx: 1, dy: 0 }, { fromBlock: true })).toBe(false)
  })
})

describe('previewOp', () => {
  it('reports where the block would go and changes nothing', () => {
    show([loaded('a'), loaded('b')])
    const m = base()
    const { r } = rectOf(m, 'b#0')
    const p = previewOp({ kind: 'nudge', id: 'b#0', dx: 0, dy: 1 })
    expect(p.ok && p.rect.y).toBeCloseTo(r.y + 1)
    expect(useArrange.getState().manual).toBeNull()
    expect(useArrange.getState().undo).toHaveLength(0)
  })

  it('is not ok for a refused operation or a stale block', () => {
    show([loaded('a')])
    const m = base()
    expect(previewOp({ kind: 'move', id: 'a#0', page: 0, x: -10, y: 0, fallback: false }).ok).toBe(
      false,
    )
    expect(previewOp({ kind: 'nudge', id: 'zz#0', dx: 1, dy: 0 }).ok).toBe(false)
    expect(m.blocks).toHaveLength(1)
  })
})

describe('undo, re-run, pick-up, select, mode', () => {
  it('undo restores the previous state and says so; with nothing to undo it is silent', () => {
    show([loaded('a'), loaded('b')])
    undoArrange()
    expect(said()).toBe('')
    commitOp({ kind: 'nudge', id: 'b#0', dx: 0, dy: 1 }, { fromBlock: true })
    undoArrange()
    expect(useArrange.getState().undo).toHaveLength(0)
    expect(said()).toBe('Undone.')
  })

  it('re-run goes back to the automatic layout and says so', () => {
    show([loaded('a'), loaded('b')])
    commitOp({ kind: 'nudge', id: 'b#0', dx: 0, dy: 1 }, { fromBlock: true })
    useArrangeUi.getState().pickUp('a#0')
    rerunAutoLayout()
    expect(useArrange.getState()).toMatchObject({ manual: null, undo: [] })
    expect(useArrangeUi.getState().pickedUp).toBeNull()
    expect(said()).toBe('Photos arranged automatically.')
  })

  it('picking up and cancelling are announced', () => {
    show([loaded('a')])
    pickUpBlock('a#0')
    expect(said()).toBe(
      'Picked up a.jpg. Move to another photo and press Enter to swap, or Escape to cancel.',
    )
    pickUpBlock(null)
    expect(said()).toBe('Swap cancelled.')
  })

  it('selecting a block selects its photo', () => {
    show([loaded('a'), loaded('b')])
    selectBlock('b#0')
    expect(useArrange.getState().selected).toBe('b#0')
    expect(useImages.getState().selectedId).toBe('b')
  })

  it('turning Arrange off drops the pick-up', () => {
    show([loaded('a')])
    setArrangeMode(true)
    useArrangeUi.getState().pickUp('a#0')
    setArrangeMode(false)
    expect(useArrange.getState().mode).toBe(false)
    expect(useArrangeUi.getState().pickedUp).toBeNull()
  })
})

describe('the auto layout as a manual one', () => {
  it('equals manualFromLayout of what is shown', () => {
    show([loaded('a'), loaded('b')])
    const layout = usePages.getState().layout
    if (!layout) throw new Error('no layout')
    expect(shownManual()).toEqual(
      manualFromLayout(layout, items(), useSettings.getState().pageSetup),
    )
  })
})
