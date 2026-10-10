import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import { createLayoutClient, isAbortError, type LayoutEngine } from './layout-client'
import type { ManualLayout } from './manual'
import { item } from './test-support/fixtures'
import type { LayoutItemInput, LayoutResult } from './types'

const result = (n: number): LayoutResult => ({
  orientation: 'portrait',
  pageSize: { w: 210, h: 297 },
  pages: [],
  suggestedPerPage: n,
})

/** A fake worker: each computeLayout call returns a promise the test settles by hand. */
function fakeEngine() {
  const calls: {
    items: readonly LayoutItemInput[]
    manual: ManualLayout | null | undefined
    resolve: (r: LayoutResult) => void
    reject: (e: unknown) => void
  }[] = []
  const engine: LayoutEngine = {
    computeLayout: (_setup, items, manual) =>
      new Promise((resolve, reject) => {
        calls.push({ items, manual, resolve, reject })
      }),
  }
  return { engine, calls }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))
const items = (id: string) => [item(id, 1)]
const manualFor = (id: string): ManualLayout => ({
  orientation: 'portrait',
  pageSize: { w: 210, h: 297 },
  content: { x: 10, y: 10, w: 190, h: 277 },
  gutter: 6,
  pageCount: 1,
  blocks: [{ blockId: `${id}#0`, page: 0, x: 10, y: 10, tileW: 50, turned: false }],
})

describe('createLayoutClient', () => {
  it('resolves a single call with the engine result', async () => {
    const { engine, calls } = fakeEngine()
    const layout = createLayoutClient(() => engine)
    const p = layout(DEFAULT_PAGE_SETUP, items('a'))
    calls[0]?.resolve(result(1))
    await expect(p).resolves.toEqual(result(1))
  })

  it('passes the manual layout to the engine, and none when it is not given', async () => {
    const { engine, calls } = fakeEngine()
    const layout = createLayoutClient(() => engine)
    const manual = manualFor('a')
    const p1 = layout(DEFAULT_PAGE_SETUP, items('a'), manual)
    expect(calls[0]?.manual).toBe(manual)
    calls[0]?.resolve(result(1))
    await p1
    const p2 = layout(DEFAULT_PAGE_SETUP, items('a'))
    await flush()
    expect(calls[1]?.manual).toBeUndefined()
    calls[1]?.resolve(result(2))
    await p2
  })

  it('runs the newest call with its own manual layout when an arranged call is superseded', async () => {
    const { engine, calls } = fakeEngine()
    const layout = createLayoutClient(() => engine)
    const a = layout(DEFAULT_PAGE_SETUP, items('a'), manualFor('a'))
    const b = layout(DEFAULT_PAGE_SETUP, items('b'), manualFor('b'))
    const c = layout(DEFAULT_PAGE_SETUP, items('c'), manualFor('c'))
    await expect(a).rejects.toSatisfy(isAbortError)
    await expect(b).rejects.toSatisfy(isAbortError)
    calls[0]?.resolve(result(1))
    await flush()
    expect(calls.map((x) => x.manual?.blocks[0]?.blockId)).toEqual(['a#0', 'c#0'])
    calls[1]?.resolve(result(3))
    await expect(c).resolves.toEqual(result(3))
  })

  it('creates the engine lazily, once', async () => {
    const { engine, calls } = fakeEngine()
    const create = vi.fn(() => engine)
    const layout = createLayoutClient(create)
    expect(create).not.toHaveBeenCalled()
    const p1 = layout(DEFAULT_PAGE_SETUP, items('a'))
    calls[0]?.resolve(result(1))
    await p1
    const p2 = layout(DEFAULT_PAGE_SETUP, items('b'))
    await flush()
    calls[1]?.resolve(result(2))
    await p2
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('rejects a running call with AbortError as soon as a newer call arrives', async () => {
    const { engine, calls } = fakeEngine()
    const layout = createLayoutClient(() => engine)
    const a = layout(DEFAULT_PAGE_SETUP, items('a'))
    const b = layout(DEFAULT_PAGE_SETUP, items('b'))
    await expect(a).rejects.toSatisfy(isAbortError)
    expect(calls).toHaveLength(1) // b waits for a's computation to finish
    calls[0]?.resolve(result(1)) // a's late result is dropped
    await flush()
    expect(calls).toHaveLength(2)
    expect(calls[1]?.items[0]?.key).toBe('b#0')
    calls[1]?.resolve(result(2))
    await expect(b).resolves.toEqual(result(2))
  })

  it('skips calls superseded while waiting: a burst costs two computations', async () => {
    const { engine, calls } = fakeEngine()
    const layout = createLayoutClient(() => engine)
    const a = layout(DEFAULT_PAGE_SETUP, items('a'))
    const b = layout(DEFAULT_PAGE_SETUP, items('b'))
    const c = layout(DEFAULT_PAGE_SETUP, items('c'))
    await expect(a).rejects.toSatisfy(isAbortError)
    await expect(b).rejects.toSatisfy(isAbortError)
    calls[0]?.resolve(result(1))
    await flush()
    expect(calls.map((x) => x.items[0]?.key)).toEqual(['a#0', 'c#0'])
    calls[1]?.resolve(result(3))
    await expect(c).resolves.toEqual(result(3))
  })

  it('passes engine errors to the latest caller, and keeps working afterwards', async () => {
    const { engine, calls } = fakeEngine()
    const layout = createLayoutClient(() => engine)
    const a = layout(DEFAULT_PAGE_SETUP, items('a'))
    calls[0]?.reject(new RangeError('bad'))
    await expect(a).rejects.toThrow(RangeError)
    await expect(a).rejects.not.toSatisfy(isAbortError)
    const b = layout(DEFAULT_PAGE_SETUP, items('b'))
    await flush()
    calls[1]?.resolve(result(2))
    await expect(b).resolves.toEqual(result(2))
  })

  it('keeps a superseded call an AbortError when the engine then fails, and still runs the newer call', async () => {
    const { engine, calls } = fakeEngine()
    const layout = createLayoutClient(() => engine)
    const a = layout(DEFAULT_PAGE_SETUP, items('a'))
    const b = layout(DEFAULT_PAGE_SETUP, items('b'))
    await expect(a).rejects.toSatisfy(isAbortError)
    calls[0]?.reject(new Error('worker died'))
    await flush()
    await expect(a).rejects.toSatisfy(isAbortError)
    expect(calls).toHaveLength(2)
    calls[1]?.resolve(result(2))
    await expect(b).resolves.toEqual(result(2))
  })

  it('recreates a dead engine on the next call', async () => {
    let dead = false
    const first = fakeEngine()
    const second = fakeEngine()
    const create = vi
      .fn<() => LayoutEngine>()
      .mockReturnValueOnce({ ...first.engine, isDead: () => dead })
      .mockReturnValueOnce(second.engine)
    const layout = createLayoutClient(create)
    const a = layout(DEFAULT_PAGE_SETUP, items('a'))
    dead = true
    first.calls[0]?.reject(new Error('worker died'))
    await expect(a).rejects.toThrow('worker died')
    const b = layout(DEFAULT_PAGE_SETUP, items('b'))
    await flush()
    expect(create).toHaveBeenCalledTimes(2)
    second.calls[0]?.resolve(result(2))
    await expect(b).resolves.toEqual(result(2))
  })

  it('rejects when the engine cannot be created', async () => {
    const layout = createLayoutClient(() => {
      throw new Error('no workers')
    })
    await expect(layout(DEFAULT_PAGE_SETUP, items('a'))).rejects.toThrow('no workers')
  })

  it('does not treat other errors as aborts', () => {
    expect(isAbortError(new Error('x'))).toBe(false)
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true)
  })
})
