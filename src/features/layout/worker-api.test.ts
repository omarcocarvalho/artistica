import { expose, wrap } from 'comlink'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import { computeLayout } from './compute-layout'
import { realisticItems } from './test-support/fixtures'
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
})
