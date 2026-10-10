import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectImageDescriptors, useImages } from '../features/images'
import { buildLayoutItems } from '../features/layout/build-items'
import { computeLayout } from '../features/layout/compute-layout'
import { manualFromLayout, type ManualLayout } from '../features/layout/manual'
import { moveBlock, nudge } from '../features/layout/manual-ops'
import type { LayoutItemInput, LayoutResult } from '../features/layout/types'
import { useSettings } from '../features/settings'
import { DEFAULT_EDITS, type ImageId } from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import { DEFAULT_STUDY } from '../shared/model/study'
import { MAX_UNDO, useArrange } from './arrange-store'
import { usePages } from './pages-store'

const loaded = (id: string) => ({
  id: id as ImageId,
  name: `${id}.jpg`,
  contentHash: `h-${id}`,
  pxW: 400,
  pxH: 300,
  originalPxW: 400,
  originalPxH: 300,
  edits: DEFAULT_EDITS,
  study: DEFAULT_STUDY,
  lines: DEFAULT_LINES,
  preview: { close: () => undefined } as unknown as ImageBitmap,
  source: new Blob(),
  thumbUrl: `blob:${id}`,
})

function items(): LayoutItemInput[] {
  return buildLayoutItems(selectImageDescriptors(useImages.getState()))
}

/** Loads photos and shows their auto layout, as the pipeline would. */
function show(ids: readonly string[]): LayoutResult {
  useImages.setState({ images: ids.map(loaded) })
  const layout = computeLayout(useSettings.getState().pageSetup, items())
  usePages.setState({ layout, empty: false, status: 'idle' })
  return layout
}

function shownBase(): ManualLayout {
  const layout = usePages.getState().layout
  if (layout === null) throw new Error('nothing shown')
  return manualFromLayout(layout, items(), useSettings.getState().pageSetup)
}

const idOf = (m: ManualLayout, i = 0): string => {
  const b = m.blocks[i]
  if (b === undefined) throw new Error('no block')
  return b.blockId
}
const right = (id: string) => (m: ManualLayout) => nudge(m, id, 1, 0, items())
const back = (id: string) => (m: ManualLayout) => nudge(m, id, -1, 0, items())

beforeEach(() => {
  useSettings.getState().reset()
  useArrange.setState(useArrange.getInitialState(), true)
  usePages.setState({ layout: null, empty: false, pages: [], status: 'idle' })
  useImages.setState({ images: [] })
})
afterEach(() => {
  useImages.setState({ images: [] })
  vi.unstubAllGlobals()
})

describe('useArrange: initial state', () => {
  it('starts with arranging off, no manual layout and nothing to undo', () => {
    const s = useArrange.getState()
    expect(s.mode).toBe(false)
    expect(s.manual).toBeNull()
    expect(s.undo).toEqual([])
    expect(s.selected).toBeNull()
  })

  it('setMode turns arranging on and off and touches nothing else', () => {
    show(['a'])
    useArrange.getState().setMode(true)
    expect(useArrange.getState().mode).toBe(true)
    useArrange.getState().setMode(false)
    expect(useArrange.getState()).toMatchObject({ mode: false, manual: null, undo: [] })
  })
})

describe('useArrange.apply', () => {
  it('the first edit starts from what is shown (M5-R8) and pushes it as the undo step', () => {
    const layout = show(['a', 'b'])
    const base = manualFromLayout(layout, items(), useSettings.getState().pageSetup)
    const id = idOf(base, 1)
    const refusal = useArrange.getState().apply(right(id))
    expect(refusal).toBeNull()
    const s = useArrange.getState()
    expect(s.undo).toEqual([base])
    const moved = nudge(base, id, 1, 0, items())
    if (!moved.ok) throw new Error(moved.reason)
    expect(s.manual).toEqual(moved.manual)
  })

  it('later edits start from the stored manual layout and push it', () => {
    show(['a', 'b'])
    const base = shownBase()
    const id = idOf(base, 1)
    useArrange.getState().apply(right(id))
    const first = useArrange.getState().manual
    useArrange.getState().apply(right(id))
    const s = useArrange.getState()
    expect(s.undo).toHaveLength(2)
    expect(s.undo[1]).toBe(first)
    expect(s.manual?.blocks.find((b) => b.blockId === id)?.x).toBeCloseTo(
      (first?.blocks.find((b) => b.blockId === id)?.x ?? 0) + 1,
      6,
    )
  })

  it('a refused operation returns its reason and changes nothing', () => {
    show(['a'])
    const base = shownBase()
    const id = idOf(base)
    expect(useArrange.getState().apply((m) => moveBlock(m, id, 0, -50, 0, items()))).toBe('outside')
    expect(useArrange.getState()).toMatchObject({ manual: null, undo: [] })

    useArrange.getState().apply(right(id))
    const before = useArrange.getState()
    expect(useArrange.getState().apply((m) => moveBlock(m, id, 0, -50, 0, items()))).toBe('outside')
    expect(useArrange.getState().manual).toBe(before.manual)
    expect(useArrange.getState().undo).toBe(before.undo)
  })

  it('keeps at most MAX_UNDO steps, dropping the oldest', () => {
    show(['a'])
    const base = shownBase()
    const id = idOf(base)
    expect(MAX_UNDO).toBe(50)
    const history: (ManualLayout | null)[] = [base]
    for (let i = 0; i < MAX_UNDO + 5; i++) {
      expect(useArrange.getState().apply(i % 2 === 0 ? right(id) : back(id))).toBeNull()
      history.push(useArrange.getState().manual)
    }
    const s = useArrange.getState()
    expect(s.undo).toHaveLength(MAX_UNDO)
    expect(s.undo).toEqual(history.slice(5, 5 + MAX_UNDO))
    expect(s.undo[0]).toBe(history[5])
  })

  it('with nothing shown it does nothing', () => {
    const op = vi.fn(right('a#0'))
    expect(useArrange.getState().apply(op)).toBeNull()
    expect(op).not.toHaveBeenCalled()
    usePages.setState({ layout: computeLayout(useSettings.getState().pageSetup, []), empty: true })
    expect(useArrange.getState().apply(op)).toBeNull()
    expect(op).not.toHaveBeenCalled()
    expect(useArrange.getState()).toMatchObject({ manual: null, undo: [] })
  })
})

describe('useArrange.undoLast', () => {
  it('restores the previous state, one step at a time', () => {
    show(['a', 'b'])
    const base = shownBase()
    const id = idOf(base, 1)
    useArrange.getState().apply(right(id))
    const one = useArrange.getState().manual
    useArrange.getState().apply(right(id))
    useArrange.getState().undoLast()
    expect(useArrange.getState().manual).toBe(one)
    expect(useArrange.getState().undo).toEqual([base])
    useArrange.getState().undoLast()
    expect(useArrange.getState().manual).toEqual(base)
    expect(useArrange.getState().undo).toEqual([])
  })

  it('with an empty stack it does nothing', () => {
    const before = useArrange.getState()
    useArrange.getState().undoLast()
    expect(useArrange.getState()).toBe(before)
  })

  it('drops a selection whose block is not in the restored layout', () => {
    show(['a', 'b'])
    const base = shownBase()
    useArrange.getState().apply(right(idOf(base, 1)))
    useArrange.getState().select(idOf(base, 0))
    useArrange.setState({
      undo: [{ ...base, blocks: base.blocks.filter((b) => b.blockId !== idOf(base, 0)) }],
    })
    useArrange.getState().undoLast()
    expect(useArrange.getState().selected).toBeNull()
  })
})

describe('useArrange.rerunAuto and Remove all', () => {
  function arrange(): string {
    show(['a', 'b'])
    const base = shownBase()
    const id = idOf(base, 1)
    useArrange.getState().apply(right(id))
    useArrange.getState().select(id)
    return id
  }

  it('rerunAuto drops the manual layout, the undo stack and the selection', () => {
    arrange()
    useArrange.getState().setMode(true)
    useArrange.getState().rerunAuto()
    expect(useArrange.getState()).toMatchObject({
      mode: true,
      manual: null,
      undo: [],
      selected: null,
    })
  })

  it('clear() of the images store (Remove all) does the same', () => {
    arrange()
    useImages.getState().clear()
    expect(useArrange.getState()).toMatchObject({ manual: null, undo: [], selected: null })
  })

  it('removing the last photo one by one does the same', () => {
    arrange()
    useImages.getState().remove('a' as ImageId)
    expect(useArrange.getState().manual).not.toBeNull()
    useImages.getState().remove('b' as ImageId)
    expect(useArrange.getState()).toMatchObject({ manual: null, undo: [], selected: null })
  })

  it('removing one photo of several keeps the arrangement (the engine reconciles it)', () => {
    arrange()
    const before = useArrange.getState()
    useImages.getState().remove('a' as ImageId)
    expect(useArrange.getState().manual).toBe(before.manual)
    expect(useArrange.getState().undo).toBe(before.undo)
  })
})

describe('useArrange.adopt', () => {
  function arranged(): { manual: ManualLayout; id: string } {
    show(['a', 'b'])
    const base = shownBase()
    const id = idOf(base, 1)
    useArrange.getState().apply(right(id))
    const manual = useArrange.getState().manual
    if (manual === null) throw new Error('not arranged')
    return { manual, id }
  }

  it.each(['kept', 'adjusted'] as const)(
    '%s replaces the manual layout without pushing undo',
    (kind) => {
      const { manual } = arranged()
      const undo = useArrange.getState().undo
      const moved = nudge(manual, idOf(manual, 0), 0, 1, items())
      if (!moved.ok) throw new Error(moved.reason)
      useArrange.getState().adopt({ kind, manual: moved.manual })
      expect(useArrange.getState().manual).toBe(moved.manual)
      expect(useArrange.getState().undo).toBe(undo)
    },
  )

  it('an outcome equal to the stored layout keeps the stored object (the pipeline settles)', () => {
    const { manual } = arranged()
    const before = useArrange.getState()
    useArrange.getState().adopt({ kind: 'kept', manual: structuredClone(manual) })
    expect(useArrange.getState()).toBe(before)
  })

  it('keeps `shape` on adopted blocks (B2 binding)', () => {
    const { manual } = arranged()
    const moved = nudge(manual, idOf(manual, 0), 0, 1, items())
    if (!moved.ok) throw new Error(moved.reason)
    useArrange.getState().adopt({ kind: 'adjusted', manual: moved.manual })
    for (const b of useArrange.getState().manual?.blocks ?? []) expect(b.shape).toBeDefined()
  })

  it('drops a selection whose block is gone after reconciliation, keeps one that is still there', () => {
    const { manual, id } = arranged()
    useArrange.getState().select(id)
    useArrange.getState().adopt({ kind: 'adjusted', manual })
    expect(useArrange.getState().selected).toBe(id)
    useArrange.getState().adopt({
      kind: 'adjusted',
      manual: { ...manual, blocks: manual.blocks.filter((b) => b.blockId !== id) },
    })
    expect(useArrange.getState().selected).toBeNull()
  })

  it.each(['paper', 'no-longer-fits', 'empty'] as const)(
    'dropped (%s) clears the manual layout, the undo stack and the selection',
    (reason) => {
      const { id } = arranged()
      useArrange.getState().select(id)
      useArrange.getState().adopt({ kind: 'dropped', reason })
      expect(useArrange.getState()).toMatchObject({ manual: null, undo: [], selected: null })
    },
  )

  it('a dropped outcome with nothing arranged changes nothing', () => {
    const before = useArrange.getState()
    useArrange.getState().adopt({ kind: 'dropped', reason: 'empty' })
    expect(useArrange.getState()).toBe(before)
  })
})

describe('useArrange.select', () => {
  it('selects and clears a block', () => {
    useArrange.getState().select('a#0')
    expect(useArrange.getState().selected).toBe('a#0')
    useArrange.getState().select(null)
    expect(useArrange.getState().selected).toBeNull()
  })
})

describe('useArrange privacy (M5-R7)', () => {
  it('never touches storage, whatever it does', () => {
    const touched: string[] = []
    const spy = (name: string) =>
      new Proxy(
        {},
        {
          get: (_, prop) => {
            touched.push(`${name}.${String(prop)}`)
            return () => undefined
          },
        },
      )
    show(['a', 'b'])
    vi.stubGlobal('localStorage', spy('localStorage'))
    vi.stubGlobal('sessionStorage', spy('sessionStorage'))
    vi.stubGlobal('indexedDB', spy('indexedDB'))
    const base = shownBase()
    const id = idOf(base, 1)
    const s = useArrange.getState()
    s.setMode(true)
    s.select(id)
    s.apply(right(id))
    s.apply(right(id))
    s.undoLast()
    const manual = useArrange.getState().manual
    if (manual) s.adopt({ kind: 'adjusted', manual })
    s.adopt({ kind: 'dropped', reason: 'paper' })
    s.rerunAuto()
    expect(touched).toEqual([])
  })
})
