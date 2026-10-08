import { expose } from 'comlink'

type Listener = (ev: { data: unknown }) => void

export interface Posted {
  readonly data: unknown
  readonly transfer: readonly unknown[]
}

export interface LoopbackWorker {
  readonly toWorker: Posted[]
  readonly fromWorker: Posted[]
  terminated: number
  emit(type: 'error' | 'messageerror'): void
}

/**
 * A `Worker` stand-in that serves `api` in-process through Comlink. Messages to the worker pass
 * by reference (node cannot clone an ImageBitmap); replies are structured-cloned with their
 * transfer list, so a transferred buffer is really detached on the worker side.
 */
export function loopbackWorkerClass(api: () => object) {
  const made: LoopbackWorker[] = []
  class Loopback implements LoopbackWorker {
    readonly toWorker: Posted[] = []
    readonly fromWorker: Posted[] = []
    terminated = 0
    private readonly outer = new Map<string, Set<Listener>>()
    private readonly inner = new Set<Listener>()

    constructor() {
      made.push(this)
      expose(api(), {
        postMessage: (data: unknown, transfer: Transferable[] = []) => {
          this.fromWorker.push({ data, transfer })
          const copy = structuredClone(data, { transfer })
          void Promise.resolve().then(() => {
            if (this.terminated > 0) return
            for (const l of this.outer.get('message') ?? []) l({ data: copy })
          })
        },
        addEventListener: (_type: string, l: EventListenerOrEventListenerObject) => {
          this.inner.add(l as unknown as Listener)
        },
        removeEventListener: (_type: string, l: EventListenerOrEventListenerObject) => {
          this.inner.delete(l as unknown as Listener)
        },
      })
    }

    postMessage(data: unknown, transfer: readonly unknown[] = []): void {
      if (this.terminated > 0) return
      this.toWorker.push({ data, transfer })
      void Promise.resolve().then(() => {
        for (const l of this.inner) l({ data })
      })
    }

    addEventListener(type: string, l: Listener): void {
      const set = this.outer.get(type) ?? new Set<Listener>()
      set.add(l)
      this.outer.set(type, set)
    }

    removeEventListener(type: string, l: Listener): void {
      this.outer.get(type)?.delete(l)
    }

    terminate(): void {
      this.terminated++
    }

    emit(type: 'error' | 'messageerror'): void {
      for (const l of this.outer.get(type) ?? []) l({ data: undefined })
    }
  }
  return { Loopback, made }
}

export function calledMethods(w: LoopbackWorker): string[] {
  return w.toWorker.flatMap(({ data }) => {
    const msg = data as { type?: string; path?: string[] }
    return msg.type === 'APPLY' ? [msg.path?.[0] ?? ''] : []
  })
}
