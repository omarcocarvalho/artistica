import { describe, expect, it } from 'vitest'
import { createLimiter } from './limiter'

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

describe('createLimiter', () => {
  it('never runs more than max tasks at once and runs them in order', async () => {
    const limit = createLimiter(2)
    let active = 0
    let peak = 0
    const started: number[] = []
    const run = (i: number) =>
      limit.run(async () => {
        started.push(i)
        active++
        peak = Math.max(peak, active)
        await tick()
        active--
        return i
      })
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => run(i)))
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(peak).toBe(2)
  })
  it('keeps going after a task rejects', async () => {
    const limit = createLimiter(1)
    const bad = limit.run(() => Promise.reject(new Error('x')))
    const good = limit.run(() => Promise.resolve(1))
    await expect(bad).rejects.toThrow('x')
    await expect(good).resolves.toBe(1)
  })
  it('releases the slot when a task throws synchronously', async () => {
    const limit = createLimiter(1)
    const bad = limit.run((): Promise<number> => {
      throw new Error('sync')
    })
    const good = limit.run(() => Promise.resolve(2))
    await expect(bad).rejects.toThrow('sync')
    await expect(good).resolves.toBe(2)
  })
  it('treats max < 1 as 1', async () => {
    const limit = createLimiter(0)
    await expect(limit.run(() => Promise.resolve(3))).resolves.toBe(3)
  })

  it('acquire holds a slot until its release is called, and a second release does nothing', async () => {
    const limit = createLimiter(1)
    const release = await limit.acquire()
    let started = false
    const next = limit.run(() => {
      started = true
      return Promise.resolve(4)
    })
    await tick()
    expect(started).toBe(false)
    release()
    await expect(next).resolves.toBe(4)
    release()
    const order: string[] = []
    const a = await limit.acquire()
    const b = limit.acquire().then((r) => {
      order.push('b')
      return r
    })
    await tick()
    expect(order).toEqual([])
    a()
    ;(await b)()
    expect(order).toEqual(['b'])
  })
  it('a waiter whose signal aborts leaves the queue at once and the next waiter gets its turn', async () => {
    const limit = createLimiter(1)
    const held = await limit.acquire()
    const ctl = new AbortController()
    const gone = limit.acquire(ctl.signal)
    const after = limit.acquire()
    ctl.abort(new DOMException('stop', 'AbortError'))
    await expect(gone).rejects.toMatchObject({ name: 'AbortError' })
    held()
    const release = await after
    let ran = false
    const third = limit.run(() => {
      ran = true
      return Promise.resolve()
    })
    await tick()
    expect(ran).toBe(false)
    release()
    await third
    expect(ran).toBe(true)
  })
  it('an already aborted signal never takes a slot', async () => {
    const limit = createLimiter(1)
    const ctl = new AbortController()
    ctl.abort(new DOMException('stop', 'AbortError'))
    await expect(limit.acquire(ctl.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(limit.run(() => Promise.resolve(5))).resolves.toBe(5)
  })
})
