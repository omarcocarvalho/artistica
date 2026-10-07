import { isAbortError, type LayoutItemInput, type LayoutResult } from '../features/layout'
import type { PageModel } from '../features/render'
import type { ImageDescriptor } from '../shared/model/image'
import type { PageSetup } from '../shared/model/page-setup'

export interface PipelineDeps {
  delayMs: number
  buildItems: (images: readonly ImageDescriptor[]) => LayoutItemInput[]
  layout: (setup: PageSetup, items: readonly LayoutItemInput[]) => Promise<LayoutResult>
  buildModels: (
    layout: LayoutResult,
    setup: PageSetup,
    images: readonly ImageDescriptor[],
  ) => PageModel[]
}
export interface PipelineSink {
  computing: () => void
  /** No images: `layout` is the empty-list layout (only its `suggestedPerPage` matters), or null if even that failed. */
  cleared: (layout: LayoutResult | null) => void
  done: (layout: LayoutResult, pages: PageModel[]) => void
  failed: (error: unknown) => void
}
export interface Pipeline {
  schedule: (setup: PageSetup, images: readonly ImageDescriptor[]) => void
  dispose: () => void
}

export function createPipeline(deps: PipelineDeps, sink: PipelineSink): Pipeline {
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0
  let memo: { key: string; layout: LayoutResult } | null = null

  async function run(
    mine: number,
    setup: PageSetup,
    images: readonly ImageDescriptor[],
  ): Promise<void> {
    const empty = images.length === 0
    try {
      // Even with no images the engine is asked (cheap), so "fits N per page" shows on an empty workspace (CR-B6).
      const items = deps.buildItems(images)
      const key = JSON.stringify([setup, items])
      const layout = memo?.key === key ? memo.layout : await deps.layout(setup, items)
      if (mine !== seq) return
      memo = { key, layout }
      if (empty) sink.cleared(layout)
      else sink.done(layout, deps.buildModels(layout, setup, images))
    } catch (error) {
      if (mine !== seq || isAbortError(error)) return
      if (empty) sink.cleared(null)
      else sink.failed(error)
    }
  }

  return {
    schedule(setup, images) {
      clearTimeout(timer)
      const mine = ++seq
      sink.computing()
      timer = setTimeout(() => {
        void run(mine, setup, images)
      }, deps.delayMs)
    },
    dispose() {
      clearTimeout(timer)
      seq++
    },
  }
}
