import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { id } from '../../render/test-support/fixtures'
import {
  createStudyPreviewProvider,
  RENDERER_RESTARTED,
  STUDY_RETAIN_BYTES,
  STUDY_TIMEOUT,
} from './provider'
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

  it('draws a slot whose new key failed as missing, not as the previous image, and not as pending', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    const first = await f.finish(0)
    p.want('page0', [request('a', 'k2')])
    await f.settle()
    f.renders[1]?.result.reject(new Error('CanvasUnavailableError'))
    await f.settle()
    expect(p.get('k2', 'a|blurred|0:0')).toBeNull()
    expect(p.pending('page0')).toBe(0)
    expect(p.get('k1', 'a|blurred|0:0')).toBe(first)
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

  it('starts no crop while paused, and starts the queued one on resume', async () => {
    const cropBitmap = vi.fn<typeof f.deps.cropBitmap>(() => deferred<FakeBitmap>().promise)
    const p = createStudyPreviewProvider({ ...f.deps, cropBitmap })
    p.pause()
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { slot: 'b|blurred|0:1' })])
    await f.settle()
    p.want('page0', [request('a', 'k3'), request('b', 'k2', { slot: 'b|blurred|0:1' })])
    await f.settle()
    expect(cropBitmap).not.toHaveBeenCalled()
    expect(p.stats()).toMatchObject({ running: 0, queued: 2 })
    p.resume()
    expect(cropBitmap).toHaveBeenCalledTimes(1)
  })

  it('counts slot images no entry holds as stale bytes, once per bitmap', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1'), request('a', 'k1', { slot: 'a|values|0:1' })])
    await f.finish(0)
    expect(p.stats().staleBytes).toBe(0)
    p.want('page0', [request('a', 'k2'), request('a', 'k2', { slot: 'a|values|0:1' })])
    expect(p.stats()).toMatchObject({ staleBytes: 0, retainedBytes: 100 * 100 * 4 })
    p.pause()
    expect(p.stats()).toMatchObject({ staleBytes: 100 * 100 * 4, retainedBytes: 0 })
    p.resume()
    await f.finish(1)
    expect(p.stats()).toMatchObject({ staleBytes: 0, wantedBytes: 100 * 100 * 4 })
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

describe('createStudyPreviewProvider: edge cases', () => {
  const SLOT = 'a|blurred|0:0'
  const restart = (): Error => Object.assign(new Error('died'), { name: RENDERER_RESTARTED })

  it('re-wanting the same keys never queues a key twice, nor the running one', async () => {
    const p = createStudyPreviewProvider(f.deps)
    const reqs = [request('a', 'k1'), request('b', 'k2', { slot: 'b|blurred|0:1' })]
    p.want('page0', reqs)
    await f.settle()
    for (let i = 0; i < 30; i++) p.want('page0', [...reqs, ...reqs])
    expect(p.stats()).toMatchObject({ running: 1, queued: 1 })
    f.renders[0]?.result.reject(new Error('boom'))
    await f.finish(1)
    expect(f.renders).toHaveLength(2)
    expect(p.stats()).toMatchObject({ running: 0, queued: 0 })
  })

  describe('pages near the view (M5-R21)', () => {
    const widths = () => f.renders.map((r) => r.plan.canvasW)

    it('requests for near pages run before older requests for pages that went far', async () => {
      const p = createStudyPreviewProvider(f.deps)
      p.want('far', [
        request('a', 'k1', { w: 10, slot: 'a|blurred|2:0' }),
        request('a', 'k2', { w: 11, slot: 'a|blurred|2:1' }),
        request('a', 'k3', { w: 12, slot: 'a|blurred|2:2' }),
      ])
      await f.settle()
      p.want('near', [request('b', 'k4', { w: 20, slot: 'b|blurred|0:0' })])
      p.want('far', [])
      expect(p.stats()).toMatchObject({ running: 1, queued: 1 })
      await f.finish(0)
      expect(widths()).toEqual([10, 20])
      await f.finish(1)
      expect(widths()).toEqual([10, 20])
      expect(p.stats()).toMatchObject({ running: 0, queued: 0 })
    })

    it('a re-wanted key keeps its place, and so does a key another page still wants', async () => {
      const p = createStudyPreviewProvider(f.deps)
      const p1 = [
        request('a', 'k1', { w: 10, slot: 'a|blurred|0:0' }),
        request('a', 'k2', { w: 11, slot: 'a|blurred|0:1' }),
      ]
      const p2 = [request('b', 'k3', { w: 12, slot: 'b|blurred|1:0' })]
      p.want('p1', p1)
      p.want('p2', p2)
      await f.settle()
      p.want('p2', p2)
      p.want('p1', p1)
      p.want('p3', [request('a', 'k2', { w: 11, slot: 'a|blurred|5:0' })])
      p.want('p1', [])
      await f.finish(0)
      await f.finish(1)
      expect(widths()).toEqual([10, 11, 12])
    })
  })

  it('a restarted renderer re-runs the job before the rest of the queue', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { w: 60, slot: 'b|blurred|0:1' })])
    await f.settle()
    f.renders[0]?.result.reject(restart())
    await f.settle()
    expect(f.renders.map((r) => r.plan.canvasW)).toEqual([100, 100])
  })

  it('forgets a used-up restart retry once nobody wants the key', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { slot: 'b|blurred|0:1' })])
    await f.settle()
    f.renders[0]?.result.reject(restart())
    await f.settle()
    f.renders[1]?.result.reject(restart())
    await f.settle()
    p.want('page0', [request('b', 'k2', { slot: 'b|blurred|0:1' })])
    p.want('page0', [request('a', 'k1')])
    await f.finish(2)
    expect(f.renders).toHaveLength(4)
    f.renders[3]?.result.reject(restart())
    await f.settle()
    expect(f.renders).toHaveLength(5)
  })

  it('a render that fails after its key stopped being wanted does not mark the key failed', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    p.want('page0', [request('a', 'k2')])
    f.renders[0]?.result.reject(new Error('boom'))
    await f.settle()
    p.want('page0', [request('a', 'k1')]) // the slider moved back
    expect(p.stats().queued).toBe(1)
    expect(p.pending('page0')).toBe(1)
    await f.finish(1)
    expect(f.renders).toHaveLength(3)
  })

  it('a restart after the key stopped being wanted does not use up its retry', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    p.want('page0', [request('a', 'k2')])
    f.renders[0]?.result.reject(restart())
    await f.settle()
    p.want('page0', [request('a', 'k1')])
    await f.finish(1)
    expect(f.renders).toHaveLength(3)
    f.renders[2]?.result.reject(restart())
    await f.settle()
    expect(f.renders).toHaveLength(4)
  })

  const timeout = (): Error => Object.assign(new Error('stalled'), { name: STUDY_TIMEOUT })

  it('a timed-out job re-runs before the rest of the queue: once on a fresh worker, once more on the main thread, then it fails and the queue moves on', async () => {
    const p = createStudyPreviewProvider(f.deps)
    const listener = vi.fn()
    p.subscribe(listener)
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { w: 60, slot: 'b|blurred|0:1' })])
    await f.settle()
    f.renders[0]?.result.reject(timeout())
    await f.settle()
    expect(f.renders.map((r) => r.plan.canvasW)).toEqual([100, 100])
    expect(f.crops).toHaveLength(2)
    f.renders[1]?.result.reject(timeout())
    await f.settle()
    expect(f.renders.map((r) => r.plan.canvasW)).toEqual([100, 100, 100])
    f.renders[2]?.result.reject(timeout())
    await f.settle()
    expect(f.renders.map((r) => r.plan.canvasW)).toEqual([100, 100, 100, 60])
    expect(p.stats()).toMatchObject({ running: 1, queued: 0 })
    expect(p.pending('page0')).toBe(1)
    await f.finish(3)
    expect(p.stats()).toMatchObject({ running: 0, queued: 0 })
    expect(p.pending('page0')).toBe(0)
    f.flush()
    expect(listener).toHaveBeenCalled()
    expect(p.get('k1', SLOT)).toBeNull()
  })

  it('a timed-out job that answers on its retry is drawn', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    f.renders[0]?.result.reject(timeout())
    const out = await f.finish(1)
    expect(p.get('k1', SLOT)).toBe(out)
    expect(p.pending('page0')).toBe(0)
  })

  it('timeout retries are counted apart from restart retries', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    f.renders[0]?.result.reject(restart())
    await f.settle()
    f.renders[1]?.result.reject(timeout())
    await f.settle()
    f.renders[2]?.result.reject(timeout())
    await f.settle()
    expect(f.renders).toHaveLength(4)
  })

  it('forgets used-up timeout retries once nobody wants the key', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    for (let i = 0; i < 3; i++) {
      f.renders[i]?.result.reject(timeout())
      await f.settle()
    }
    expect(f.renders).toHaveLength(3)
    p.want('page0', [])
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    expect(f.renders).toHaveLength(4)
    f.renders[3]?.result.reject(timeout())
    await f.settle()
    expect(f.renders).toHaveLength(5)
  })

  it('a timeout after the key stopped being wanted neither retries nor uses up a retry', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    p.want('page0', [request('a', 'k2')])
    f.renders[0]?.result.reject(timeout())
    await f.settle()
    expect(f.renders).toHaveLength(2)
    p.want('page0', [request('a', 'k1')])
    await f.finish(1)
    expect(f.renders).toHaveLength(3)
    f.renders[2]?.result.reject(timeout())
    await f.settle()
    f.renders[3]?.result.reject(timeout())
    await f.settle()
    expect(f.renders).toHaveLength(5)
  })

  it('notifies listeners when a render fails, so pending is read again', async () => {
    const p = createStudyPreviewProvider(f.deps)
    const listener = vi.fn()
    p.subscribe(listener)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    f.renders[0]?.result.reject(new Error('boom'))
    await f.settle()
    f.flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('get prefers the fresh result over a newer slot image', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1')])
    const first = await f.finish(0)
    p.want('page0', [request('a', 'k2')])
    const second = await f.finish(1)
    p.want('page0', [request('a', 'k1')]) // the slider moved back: k1 is retained
    expect(p.get('k1', SLOT)).toBe(first)
    expect(p.get('k2', SLOT)).toBe(second)
    expect(f.renders).toHaveLength(2)
  })

  it('evicts retained entries in the order they stopped being wanted', async () => {
    const g = fakeDeps(2 * 100 * 100 * 4)
    g.add('a')
    const p = createStudyPreviewProvider(g.deps)
    p.want('page0', [request('a', 'k0')])
    const k0 = await g.finish(0)
    p.want('page1', [request('a', 'k1', { slot: 'a|blurred|1:0' })])
    const k1 = await g.finish(1)
    p.release('page1')
    p.release('page0')
    p.want('page2', [request('a', 'k2', { slot: 'a|blurred|2:0' })])
    await g.finish(2)
    p.release('page2')
    expect([k1.closed, k0.closed]).toEqual([1, 0])
  })

  it('pause keeps wanted results and the stale slot image drawn', async () => {
    const p = createStudyPreviewProvider(f.deps)
    const b = request('b', 'k2', { slot: 'b|blurred|0:1' })
    p.want('page0', [request('a', 'k1'), b])
    const one = await f.finish(0)
    const two = await f.finish(1)
    p.want('page0', [request('a', 'k3'), b])
    p.pause()
    expect(p.get('k3', SLOT)).toBe(one)
    expect(p.get('k2', 'b|blurred|0:1')).toBe(two)
    expect(p.stats().wantedBytes).toBe(100 * 100 * 4)
    expect([one.closed, two.closed]).toEqual([0, 0])
  })

  it('a crop that resolves after pause is closed and re-run on resume, not rendered while paused', async () => {
    const crop = deferred<FakeBitmap>()
    const p = createStudyPreviewProvider({
      ...f.deps,
      cropBitmap: vi
        .fn<typeof f.deps.cropBitmap>()
        .mockReturnValueOnce(crop.promise)
        .mockImplementation((bitmap, box) => f.deps.cropBitmap(bitmap, box)),
    })
    p.want('page0', [request('a', 'k1')])
    p.pause()
    const clone = new FakeBitmap(1000, 667, 'clone during pause')
    crop.resolve(clone)
    await f.settle()
    expect(clone.closed).toBe(1)
    expect(f.renders).toHaveLength(0)
    expect(p.pending('page0')).toBe(1)
    p.resume()
    const out = await f.finish(0)
    expect(p.get('k1', SLOT)).toBe(out)
  })

  it('closes the result of an image removed while it renders, even if a stale model still wants it', async () => {
    const p = createStudyPreviewProvider(f.deps)
    const listener = vi.fn()
    p.subscribe(listener)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    f.sources.delete(id('a'))
    const out = await f.finish(0)
    expect(out.closed).toBe(1)
    expect(p.get('k1', SLOT)).toBeNull()
    expect(p.pending('page0')).toBe(0)
    f.flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('closes the crop of an image removed during the crop, without rendering it', async () => {
    const crop = deferred<FakeBitmap>()
    const p = createStudyPreviewProvider({ ...f.deps, cropBitmap: () => crop.promise })
    p.want('page0', [request('a', 'k1')])
    f.sources.delete(id('a'))
    const clone = new FakeBitmap(1000, 667, 'clone of removed image')
    crop.resolve(clone)
    await f.settle()
    expect(clone.closed).toBe(1)
    expect(f.renders).toHaveLength(0)
  })

  it('does not notify for a result nobody wants any more', async () => {
    const p = createStudyPreviewProvider(f.deps)
    const listener = vi.fn()
    p.subscribe(listener)
    p.want('page0', [request('a', 'k1')])
    await f.settle()
    p.want('page0', [])
    await f.finish(0)
    f.flush()
    expect(listener).not.toHaveBeenCalled()
  })

  it('neither queues nor counts as pending a wanted key whose image is gone', async () => {
    const p = createStudyPreviewProvider(f.deps)
    f.sources.delete(id('b'))
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { slot: 'b|blurred|0:1' })])
    expect(p.stats().queued).toBe(0)
    expect(p.pending('page0')).toBe(1)
    await f.finish(0)
    expect(p.pending('page0')).toBe(0)
  })

  it('stops counting a queued key as pending once its image is removed', async () => {
    const p = createStudyPreviewProvider(f.deps)
    p.want('page0', [request('a', 'k1'), request('b', 'k2', { slot: 'b|blurred|0:1' })])
    await f.settle()
    expect(p.pending('page0')).toBe(2)
    f.sources.delete(id('b'))
    expect(p.pending('page0')).toBe(1)
  })
})
