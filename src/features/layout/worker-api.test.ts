import { expose, wrap } from 'comlink'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import { computeLayout } from './compute-layout'
import { isAbortError } from './layout-client'
import { manualFromLayout } from './manual'
import { item, realisticItems } from './test-support/fixtures'
import { layoutWorkerApi, type LayoutWorkerApi } from './worker-api'

describe('layoutWorkerApi over a real Comlink channel', () => {
  let channel: MessageChannel | null = null
  afterEach(() => {
    channel?.port1.close()
    channel?.port2.close()
    channel = null
  })

  it('returns the same layout as calling computeLayout directly', async () => {
    channel = new MessageChannel()
    expose(layoutWorkerApi, channel.port1)
    const remote = wrap<LayoutWorkerApi>(channel.port2)
    const items = realisticItems(12, 7)
    await expect(remote.computeLayout(DEFAULT_PAGE_SETUP, items)).resolves.toEqual(
      computeLayout(DEFAULT_PAGE_SETUP, items),
    )
  })

  it('passes a manual layout through and returns its outcome', async () => {
    channel = new MessageChannel()
    expose(layoutWorkerApi, channel.port1)
    const remote = wrap<LayoutWorkerApi>(channel.port2)
    const items = realisticItems(6, 2)
    const manual = manualFromLayout(
      computeLayout(DEFAULT_PAGE_SETUP, items),
      items,
      DEFAULT_PAGE_SETUP,
    )
    const rest = items.slice(1)
    const direct = computeLayout(DEFAULT_PAGE_SETUP, rest, manual)
    expect(direct.manual?.kind).toBe('adjusted')
    await expect(remote.computeLayout(DEFAULT_PAGE_SETUP, rest, manual)).resolves.toEqual(direct)
  })

  it('surfaces a RangeError from computeLayout with its name and message, not as an abort', async () => {
    channel = new MessageChannel()
    expose(layoutWorkerApi, channel.port1)
    const remote = wrap<LayoutWorkerApi>(channel.port2)
    const err: unknown = await remote
      .computeLayout(DEFAULT_PAGE_SETUP, [item('a', 1), item('a', 1)])
      .catch((e: unknown) => e)
    // Comlink rebuilds the error as a plain Error carrying name/message, so consumers check err.name.
    expect(err).toBeInstanceOf(Error)
    expect(err instanceof RangeError).toBe(false) // instanceof is lost across the worker
    expect((err as Error).name).toBe('RangeError')
    expect((err as Error).message).toBe('duplicate layout key a#0')
    expect(isAbortError(err)).toBe(false)
  })
})
