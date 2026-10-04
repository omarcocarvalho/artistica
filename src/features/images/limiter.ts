export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const queue: (() => void)[] = []
  const next = (): void => {
    if (active >= max) return
    queue.shift()?.()
  }
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = (): void => {
        active += 1
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            next()
          })
      }
      queue.push(start)
      next()
    })
}
