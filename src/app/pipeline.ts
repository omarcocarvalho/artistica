import {
  isAbortError,
  type LayoutItemInput,
  type LayoutResult,
  type ManualLayout,
} from '../features/layout'
import { NO_GUIDES, type ImageGuides } from '../features/lines'
import type { PageModel } from '../features/render'
import type { ImageDescriptor } from '../shared/model/image'
import type { PageSetup } from '../shared/model/page-setup'
import { mark } from './perf-marks'

export type GuidesOf = (img: ImageDescriptor) => ImageGuides
const noGuides: GuidesOf = () => NO_GUIDES

export interface PipelineDeps {
  delayMs: number
  buildItems: (images: readonly ImageDescriptor[]) => LayoutItemInput[]
  layout: (
    setup: PageSetup,
    items: readonly LayoutItemInput[],
    manual: ManualLayout | null,
  ) => Promise<LayoutResult>
  buildModels: (
    layout: LayoutResult,
    setup: PageSetup,
    images: readonly ImageDescriptor[],
    guides: GuidesOf,
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
  /** The layout memo ignores `guides`: a detection result only rebuilds the page models. */
  schedule: (
    setup: PageSetup,
    images: readonly ImageDescriptor[],
    guides?: GuidesOf,
    manual?: ManualLayout | null,
  ) => void
  dispose: () => void
}

/**
 * A change that follows a quiet `delayMs` runs at once; a change within `delayMs` of the previous one
 * waits until the changes stop for `delayMs`. Changes in the same task run once, with the last input.
 */
export function createPipeline(deps: PipelineDeps, sink: PipelineSink): Pipeline {
  let timer: ReturnType<typeof setTimeout> | undefined
  let leading: (() => void) | null = null
  let seq = 0
  let memo: { key: string; layout: LayoutResult } | null = null

  async function run(
    mine: number,
    setup: PageSetup,
    images: readonly ImageDescriptor[],
    guides: GuidesOf,
    manual: ManualLayout | null,
  ): Promise<void> {
    const empty = images.length === 0
    try {
      // Even with no images the engine is asked (cheap), so "fits N per page" shows on an empty workspace (CR-B6).
      const items = deps.buildItems(images)
      const key = JSON.stringify([setup, items, manual])
      let layout: LayoutResult
      if (memo?.key === key) layout = memo.layout
      else {
        mark('layout:start')
        layout = await deps.layout(setup, items, manual)
        if (mine !== seq) return
        mark('layout:end')
      }
      memo = { key, layout }
      if (empty) sink.cleared(layout)
      else {
        const pages = deps.buildModels(layout, setup, images, guides)
        mark('models:end')
        sink.done(layout, pages)
      }
    } catch (error) {
      if (mine !== seq || isAbortError(error)) return
      if (empty) sink.cleared(null)
      else sink.failed(error)
    }
  }

  return {
    schedule(setup, images, guides = noGuides, manual = null) {
      const mine = ++seq
      sink.computing()
      const go = () => void run(mine, setup, images, guides, manual)
      if (leading) {
        leading = go
        return
      }
      const burst = timer !== undefined
      clearTimeout(timer)
      if (!burst) {
        leading = go
        queueMicrotask(() => {
          const next = leading
          leading = null
          next?.()
        })
      }
      timer = setTimeout(() => {
        timer = undefined
        if (burst) go()
      }, deps.delayMs)
    },
    dispose() {
      clearTimeout(timer)
      timer = undefined
      leading = null
      seq++
    },
  }
}
