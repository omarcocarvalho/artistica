export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>
  acquire(signal?: AbortSignal): Promise<() => void>
}

export function createLimiter(max: number): Limiter {
  const limit = Math.max(1, max)
  let active = 0
  const queue: (() => void)[] = []
  const next = (): void => {
    if (active >= limit) return
    queue.shift()?.()
  }

  const acquire = (signal?: AbortSignal): Promise<() => void> =>
    new Promise<() => void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason as Error)
        return
      }
      const onAbort = (): void => {
        const at = queue.indexOf(start)
        if (at !== -1) queue.splice(at, 1)
        reject(signal?.reason as Error)
      }
      function start(): void {
        signal?.removeEventListener('abort', onAbort)
        active += 1
        let held = true
        resolve(() => {
          if (!held) return
          held = false
          active -= 1
          next()
        })
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      queue.push(start)
      next()
    })

  const run = async <T>(task: () => Promise<T>): Promise<T> => {
    const release = await acquire()
    try {
      return await task()
    } finally {
      release()
    }
  }

  return { run, acquire }
}
