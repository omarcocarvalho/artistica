import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { id } from '../../render/test-support/fixtures'
import { createStudyPreviewProvider, RENDERER_RESTARTED, STUDY_RETAIN_BYTES } from './provider'
import {
  bitmapLog,
  deferred,
  fakeDeps,
  FakeBitmap,
  request,
  resetBitmapLog,
} from './test-support/fakes'

let f: ReturnType<typeof fakeDeps>
beforeEach(() => {
  resetBitmapLog()
  f = fakeDeps()
  f.add('a')
  f.add('b')
})
afterEach(() => {
  expect(bitmapLog.doubleCloses).toEqual([])
})

describe('createStudyPreviewProvider: queue and runner', () => {
  it('runs one job at a time, in the order wanted', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { w: 60, slot: 'b|blurred|0:1' })])
    await f.settle()
    expect(f.renders).toHaveLength(1)
    expect(f.renders[0]?.plan.canvasW).toBe(100)
    expect(p.stats().running).toBe(1)
    await f.finish(0)
    expect(f.renders).toHaveLength(2)
    expect(f.renders[1]?.plan.canvasW).toBe(60)
  })

  it('scales the plan to the preview bitmap and crops its integer box (as export does)', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    // Full 3000 × 2000 image on a 1000 × 667 preview: sx = 1/3, sy = 667/2000.
    expect(f.crops[0]?.box).toEqual({ x: 0, y: 0, w: 1000, h: 667 })
    expect(f.renders[0]?.plan.src.x).toBe(0)
    expect(f.renders[0]?.clone).toBe(f.crops[0]?.clone)
  })

  it('drops queued keys nobody wants any more: a 30-step drag costs at most 2 renders per tile', async () => {
    const p = createStudyPreviewProvider(f.deps)
    for (let i = 0; i < 30; i++) {
      p.want('page0', [request('a', `k${String(i)}`)])
      await f.settle()
    }
    expect(f.renders).toHaveLength(1) // k0 running, k29 queued, k1..k28 dropped
    expect(p.stats()).toMatchObject({ running: 1, queued: 1 })
    await f.finish(0)
    expect(f.renders).toHaveLength(2)
    expect(p.stats().queued).toBe(0)
    await f.finish(1)
    expect(p.get('k29', 'a|blurred|0:0')).not.toBeNull()
    expect(p.get('k0', 'a|blurred|0:0')).toBe(p.get('k29', 'a|blurred|0:0'))
  })

  it('closes a result whose key nobody wants when it arrives', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    p.want('page0', [])
    const out = await f.finish(0)
    expect(out.closed).toBe(1)
    expect(p.get('k1', 'a|blurred|0:0')).toBeNull()
  })

  it('skips a queued job whose image is gone', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { slot: 'b|blurred|0:1' })])
    await f.settle()
    f.sources.delete(id('b'))
    await f.finish(0)
    expect(f.renders).toHaveLength(1)
    expect(p.stats().queued).toBe(0)
  })

  it('keeps going after a failed render and stops counting the failed key as pending', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { slot: 'b|blurred|0:1' })])
    await f.settle()
    f.renders[0]?.result.reject(new Error('boom'))
    await f.settle()
    expect(f.renders).toHaveLength(2)
    expect(p.pending('page0')).toBe(1)
    expect(p.get('k1', 'a|blurred|0:0')).toBeNull()
    // Wanting the same failed key again does not retry it (a new key would).
    p.want('page0', [request('a', 'k1')])
    await f.finish(1)
    expect(f.renders).toHaveLength(2)
  })

  it('forgets a failed key once nobody wants it, so wanting it later renders it again', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    f.renders[0]?.result.reject(new Error('boom'))
    await f.settle()
    p.want('page0', [])
    p.want('page0', [request('a', 'k1')])
    expect(p.pending('page0')).toBe(1)
    const out = await f.finish(1)
    expect(p.get('k1', 'a|blurred|0:0')).toBe(out)
  })

  it('retries a key once when its renderer was restarted (error name, not class)', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    f.renders[0]?.result.reject(
      Object.assign(new Error('worker died'), { name: RENDERER_RESTARTED }),
    )
    await f.settle()
    expect(f.renders).toHaveLength(2) // retried with a fresh crop
    expect(f.crops).toHaveLength(2)
    f.renders[1]?.result.reject(Object.assign(new Error('again'), { name: RENDERER_RESTARTED }))
    await f.settle()
    expect(f.renders).toHaveLength(2) // only once
    expect(p.pending('page0')).toBe(0)
  })

  it('keeps going after cropBitmap rejects', async () => {
    const p = createStudyPreviewProvider({
      ...f.deps,
      cropBitmap: vi
        .fn<typeof f.deps.cropBitmap>()
        .mockRejectedValueOnce(new Error('crop'))
        .mockImplementation((bitmap, box) => f.deps.cropBitmap(bitmap, box)),
    })
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { slot: 'b|blurred|0:1' })])
    await f.settle()
    expect(f.renders).toHaveLength(1)
    expect(p.pending('page0')).toBe(1)
  })
})

describe('createStudyPreviewProvider: results, slots and notifications', () => {
  it('get returns the fresh result, else the slot image, else null (M2-R12)', async () => {
    const p = createStudyPreviewProvider(f.deps)
    expect(p.get('k1', 'a|blurred|0:0')).toBeNull()
    p.want('page0', [request('a', 'k1')])
    const first = await f.finish(0)
    expect(p.get('k1', 'a|blurred|0:0')).toBe(first)
    p.want('page0', [request('a', 'k2')]) // same slot, new key (blur changed)
    expect(p.get('k2', 'a|blurred|0:0')).toBe(first) // stale while k2 renders
    expect(p.get('k2', 'a|values|0:1')).toBeNull() // another slot never borrows it
  })

  it('replaces the slot image and closes the old one when the fresh tile arrives', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    const first = await f.finish(0)
    p.want('page0', [request('a', 'k2')])
    await f.settle()
    const second = await f.finish(1)
    expect(p.get('k2', 'a|blurred|0:0')).toBe(second)
    // k1 is retained (unwanted, under the cap) so `first` is still open, but no longer the slot image.
    expect(first.closed).toBe(0)
    p.pause() // closes retained entries
    expect(first.closed).toBe(1)
  })

  it('batches notifications per schedule tick', async () => {
    const p = createStudyPreviewProvider(f.deps)
    const listener = vi.fn()
    const off = p.subscribe(listener)
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { slot: 'b|blurred|0:1' })])
    await f.finish(0)
    await f.settle()
    await f.finish(1)
    expect(listener).not.toHaveBeenCalled()
    f.flush()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    p.want('page0', [request('a', 'k3')])
    await f.settle()
    await f.finish(2)
    f.flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('counts pending per consumer and shares results between consumers', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    p.want('page1', [
      request('a', 'k1', { slot: 'a|blurred|1:0' }),
      request('b', 'k2', { slot: 'b|blurred|1:1' }),
    ])
    expect(p.pending('page0')).toBe(1)
    expect(p.pending('page1')).toBe(2)
    await f.finish(0)
    expect(p.pending('page0')).toBe(0)
    expect(p.pending('page1')).toBe(1)
    expect(f.renders).toHaveLength(2) // k1 rendered once for both pages
  })

  it('release drops a consumer; its results become retained', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.finish(0)
    p.release('page0')
    expect(p.pending('page0')).toBe(0)
    expect(p.stats()).toMatchObject({ wantedBytes: 0, retainedBytes: 100 * 100 * 4 })
  })
})

describe('createStudyPreviewProvider: retention, removal, pause', () => {
  it('retains unwanted entries LRU up to the cap and closes the rest', async () => {
    const g = fakeDeps(2 * 100 * 100 * 4) // room for two 100 × 100 results
    g.add('a')
    const p = createStudyPreviewProvider(g.deps)
    const outs: FakeBitmap[] = []
    for (let i = 0; i < 3; i++) {
      p.want('page0', [request('a', `k${String(i)}`)])
      await g.settle()
      outs.push(await g.finish(i))
    }
    p.want('page0', [])
    expect(p.stats().retainedBytes).toBe(2 * 100 * 100 * 4)
    expect(outs.map((o) => o.closed)).toEqual([1, 0, 0])
  })

  it('never evicts a wanted entry even above the cap', async () => {
    const g = fakeDeps(100 * 100 * 4)
    g.add('a')
    const p = createStudyPreviewProvider(g.deps)
    p.want('page0', [request('a', 'k1'), request('a', 'k2', { slot: 'a|values|0:1' })])
    const one = await g.finish(0)
    const two = await g.finish(1)
    expect(p.stats().wantedBytes).toBe(2 * 100 * 100 * 4)
    expect([one.closed, two.closed]).toEqual([0, 0])
  })

  it('a wanted-again retained entry is served without a new render', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    const out = await f.finish(0)
    p.want('page0', [])
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    expect(f.renders).toHaveLength(1)
    expect(p.get('k1', 'a|blurred|0:0')).toBe(out)
    expect(p.stats().retainedBytes).toBe(0)
  })

  it('closes slot images of an image getSource no longer returns', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    const out = await f.finish(0)
    f.sources.delete(id('a'))
    p.want('page0', [request('a', 'k2')]) // a stale model still names the removed image
    expect(out.closed).toBe(1)
    expect(p.get('k2', 'a|blurred|0:0')).toBeNull()
    expect(f.renders).toHaveLength(1)
  })

  it('pause: no new job, retained closed, wanted kept; resume restarts', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    const kept = await f.finish(0)
    p.want('page1', [request('b', 'r1', { slot: 'b|blurred|1:0' })])
    const retained = await f.finish(1)
    p.release('page1')
    p.pause()
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { slot: 'b|values|0:1' })])
    await f.settle()
    expect(retained.closed).toBe(1)
    expect(kept.closed).toBe(0)
    expect(f.renders).toHaveLength(2)
    p.resume()
    await f.settle()
    expect(f.renders).toHaveLength(3)
  })

  it('pause lets the running job finish and keeps its result if wanted', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    p.pause()
    const out = await f.finish(0)
    expect(p.get('k1', 'a|blurred|0:0')).toBe(out)
  })

  it('dispose closes every bitmap exactly once', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    const a = await f.finish(0)
    p.want('page0', [request('a', 'k2')])
    await f.settle()
    const b = await f.finish(1)
    p.dispose()
    expect([a.closed, b.closed]).toEqual([1, 1])
  })

  it('defaults the retention cap to 32 MB', () => {
    expect(STUDY_RETAIN_BYTES).toBe(32 * 1024 * 1024)
  })
})

describe('createStudyPreviewProvider: ownership', () => {
  it('while paused, results that stop being wanted are closed, not retained', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    const first = await f.finish(0)
    p.pause()
    p.want('page0', [])
    expect(first.closed).toBe(1)
    expect(p.stats().retainedBytes).toBe(0)
    p.resume()
    p.want('page0', [request('a', 'k2')])
    const second = await f.finish(1)
    p.release('page0')
    expect(second.closed).toBe(0)
    expect(p.stats().retainedBytes).toBe(100 * 100 * 4)
  })

  it('closes a crop whose key stopped being wanted during the crop, without rendering it', async () => {
    const crop = deferred<FakeBitmap>()
    const p = createStudyPreviewProvider({
      ...f.deps,
      cropBitmap: vi
        .fn<typeof f.deps.cropBitmap>()
        .mockReturnValueOnce(crop.promise)
        .mockImplementation((bitmap, box) => f.deps.cropBitmap(bitmap, box)),
    })
    p.want('page0', [request('a', 'k1')])
    p.want('page0', [request('a', 'k2')])
    const late = new FakeBitmap(1000, 667, 'late clone')
    crop.resolve(late)
    await f.settle()
    expect(late.closed).toBe(1)
    expect(f.renders).toHaveLength(1)
    expect(f.renders[0]?.clone).not.toBe(late)
  })

  it('dispose during a crop closes the clone and renders nothing', async () => {
    const crop = deferred<FakeBitmap>()
    const p = createStudyPreviewProvider({ ...f.deps, cropBitmap: () => crop.promise })
    p.want('page0', [request('a', 'k1')])
    p.dispose()
    const clone = new FakeBitmap(1000, 667, 'clone after dispose')
    crop.resolve(clone)
    await f.settle()
    expect(clone.closed).toBe(1)
    expect(f.renders).toHaveLength(0)
  })

  it('ignores want after dispose and release of an unknown consumer', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.release('nobody')
    p.dispose()
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    expect(f.crops).toHaveLength(0)
    expect(p.pending('page0')).toBe(0)
  })

  it('dispose during a render closes the result when it arrives', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    p.dispose()
    const out = await f.finish(0)
    expect(out.closed).toBe(1)
    expect(p.get('k1', 'a|blurred|0:0')).toBeNull()
  })

  it('closes every result and clone exactly once and never closes a preview bitmap', async () => {
    const g = fakeDeps(100 * 100 * 4)
    g.add('a')
    g.add('b')
    const p = createStudyPreviewProvider(g.deps)
    const b0 = request('b', 'k2', { slot: 'b|blurred|0:1' })
    p.want('page0', [request('a', 'k1'), b0])
    p.want('page1', [request('a', 'k1', { slot: 'a|blurred|1:0' })])
    await g.finish(0)
    await g.finish(1)
    p.want('page0', [request('a', 'k3'), b0])
    await g.settle()
    g.renders[2]?.result.reject(Object.assign(new Error('died'), { name: RENDERER_RESTARTED }))
    await g.finish(3)
    p.release('page1')
    p.want('page0', [request('a', 'k4'), b0])
    await g.settle()
    g.renders[4]?.result.reject(new Error('boom'))
    await g.settle()
    g.sources.delete(id('b'))
    p.want('page0', [request('a', 'k4')])
    p.pause()
    p.resume()
    p.dispose()

    const previews = bitmapLog.created.filter((b) => b.label.startsWith('preview'))
    const owned = bitmapLog.created.filter((b) => !b.label.startsWith('preview'))
    expect(g.renders).toHaveLength(5)
    expect(previews.map((b) => b.closed)).toEqual([0, 0, 0, 0])
    expect(owned).toHaveLength(8)
    expect(owned.filter((b) => b.closed !== 1).map((b) => b.label)).toEqual([])
  })
})
