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
      limit(async () => {
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
    const bad = limit(() => Promise.reject(new Error('x')))
    const good = limit(() => Promise.resolve(1))
    await expect(bad).rejects.toThrow('x')
    await expect(good).resolves.toBe(1)
  })
})
