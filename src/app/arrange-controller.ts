import i18n from 'i18next'
import { useMemo } from 'react'
import { selectImageDescriptors, useImages } from '../features/images'
import {
  blockIdOf,
  blockRect,
  buildLayoutItems,
  isFixedSize,
  manualFromLayout,
  moveBlock,
  moveToPage,
  nudge,
  resizeBlock,
  swapBlocks,
  type BlockId,
  type LayoutItemInput,
  type ManualLayout,
  type OpRefusal,
  type OpResult,
} from '../features/layout'
import type { ArrangeBlock, ArrangeIntent, ArrangePreview } from '../features/render'
import { useSettings } from '../features/settings'
import type { ImageId } from '../shared/model/image'
import { mmToUnit, roundForUnit, type Mm, type Unit } from '../shared/model/units'
import { useArrange } from './arrange-store'
import { useArrangeUi } from './arrange-ui'
import { usePages } from './pages-store'

export type ArrangeOp = ArrangeIntent

let lastDescriptors: unknown = null
let lastItems: LayoutItemInput[] = []

export function currentItems(): LayoutItemInput[] {
  const descriptors = selectImageDescriptors(useImages.getState())
  if (descriptors !== lastDescriptors) {
    lastDescriptors = descriptors
    lastItems = buildLayoutItems(descriptors)
  }
  return lastItems
}

/** The arrangement on screen: the stored one, else the automatic layout as a manual one (M5-R8). */
export function shownManual(
  items: readonly LayoutItemInput[] = currentItems(),
): ManualLayout | null {
  const stored = useArrange.getState().manual
  if (stored !== null) return stored
  const { layout, empty } = usePages.getState()
  if (layout === null || empty) return null
  return manualFromLayout(layout, items, useSettings.getState().pageSetup)
}

const fmt = (mm: Mm, unit: Unit): number => roundForUnit(mmToUnit(mm, unit), unit)

function nameOf(imageId: ImageId): string {
  return (
    useImages.getState().images.find((i) => i.id === imageId)?.name ??
    i18n.t('app:preview.unnamedImage')
  )
}

/**
 * The blocks to draw. Ruling B3-5: the stored layout can lag the photos by one run, so a block
 * whose photo copy is gone is left out and offers no operation.
 */
export function arrangeBlocks(
  manual: ManualLayout | null,
  items: readonly LayoutItemInput[],
  unit: Unit,
  name: (id: ImageId) => string = nameOf,
): ArrangeBlock[] {
  if (manual === null) return []
  const byBlock = new Map(items.map((it) => [blockIdOf(it), it]))
  const unitLabel = i18n.t(`common:units.${unit}`)
  const out: ArrangeBlock[] = []
  for (const b of manual.blocks) {
    const item = byBlock.get(b.blockId)
    if (item === undefined) continue
    const rect = blockRect(b, item, manual.gutter)
    out.push({
      id: b.blockId,
      imageId: item.imageId,
      page: b.page,
      rect,
      tileW: b.tileW,
      fixed: isFixedSize(item),
      name: i18n.t('preview:arrange.blockName', {
        name: name(item.imageId),
        w: fmt(rect.w, unit),
        h: fmt(rect.h, unit),
        unit: unitLabel,
        page: b.page + 1,
      }),
    })
  }
  return out
}

function idsOf(op: ArrangeOp): BlockId[] {
  return op.kind === 'swap' ? [op.id, op.with] : [op.id]
}

function available(
  m: ManualLayout | null,
  items: readonly LayoutItemInput[],
  op: ArrangeOp,
): m is ManualLayout {
  if (m === null) return false
  const known = new Set(items.map(blockIdOf))
  return idsOf(op).every((id) => known.has(id) && m.blocks.some((b) => b.blockId === id))
}

interface Run {
  readonly result: OpResult
  readonly fellBack: boolean
}

function run(m: ManualLayout, op: ArrangeOp, items: readonly LayoutItemInput[]): Run {
  switch (op.kind) {
    case 'move': {
      const at = moveBlock(m, op.id, op.page, op.x, op.y, items)
      if (at.ok || !op.fallback) return { result: at, fellBack: false }
      return { result: moveToPage(m, op.id, op.page, items), fellBack: true }
    }
    case 'nudge':
      return { result: nudge(m, op.id, op.dx, op.dy, items), fellBack: false }
    case 'resize':
      return { result: resizeBlock(m, op.id, op.tileW, op.anchor, items), fellBack: false }
    case 'swap':
      return { result: swapBlocks(m, op.id, op.with, items), fellBack: false }
    case 'page':
      return { result: moveToPage(m, op.id, op.page, items), fellBack: false }
  }
}

function placed(m: ManualLayout, id: BlockId, items: readonly LayoutItemInput[]) {
  const block = m.blocks.find((b) => b.blockId === id)
  const item = items.find((it) => blockIdOf(it) === id)
  if (block === undefined || item === undefined) return null
  return { block, item, rect: blockRect(block, item, m.gutter) }
}

export function previewOp(op: ArrangeOp): ArrangePreview {
  const items = currentItems()
  const m = shownManual(items)
  if (!available(m, items, op)) return { ok: false }
  const { result } = run(m, op, items)
  if (!result.ok) return { ok: false }
  const p = placed(result.manual, op.id, items)
  return p ? { ok: true, page: p.block.page, rect: p.rect } : { ok: false }
}

function refusalKey(op: ArrangeOp, reason: OpRefusal, fellBack: boolean, currentTileW: Mm): string {
  if (reason === 'fixed') return 'fixed'
  switch (op.kind) {
    case 'move':
      if (fellBack) return 'noRoomOnPage'
      return reason === 'overlap' ? 'overlap' : 'outside'
    case 'nudge':
      return 'blocked'
    case 'resize':
      if (reason === 'min') return 'min'
      return op.tileW > currentTileW ? 'grow' : 'blocked'
    case 'swap':
      return 'swap'
    case 'page':
      return op.page < 0 ? 'firstPage' : 'noRoomOnPage'
  }
}

export function announcePlaced(id: BlockId): void {
  const items = currentItems()
  const m = useArrange.getState().manual
  const p = m && placed(m, id, items)
  if (!p) return
  const unit = useSettings.getState().unit
  const unitLabel = i18n.t(`common:units.${unit}`)
  useArrangeUi.getState().announce(
    i18n.t('preview:arrange.placed', {
      name: nameOf(p.item.imageId),
      w: fmt(p.rect.w, unit),
      h: fmt(p.rect.h, unit),
      unit: unitLabel,
      page: p.block.page + 1,
      x: fmt(p.rect.x, unit),
      y: fmt(p.rect.y, unit),
    }),
  )
}

/** One operation, one undo step, one announcement. From the block itself, focus stays on the block. */
export function commitOp(op: ArrangeOp, { fromBlock }: { fromBlock: boolean }): boolean {
  const items = currentItems()
  const m = shownManual(items)
  if (!available(m, items, op)) return false
  const ui = useArrangeUi.getState()
  let fellBack = false
  const currentTileW = m.blocks.find((b) => b.blockId === op.id)?.tileW ?? 0
  const refusal = useArrange.getState().apply((base) => {
    const r = run(base, op, items)
    fellBack = r.fellBack
    return r.result
  })
  if (fromBlock) ui.requestFocus(op.id)
  if (refusal !== null) {
    ui.announce(
      i18n.t(`preview:arrange.refused.${refusalKey(op, refusal, fellBack, currentTileW)}`),
    )
    return false
  }
  if (op.kind === 'swap') ui.pickUp(null)
  announcePlaced(op.id)
  return true
}

export function undoArrange(): void {
  if (useArrange.getState().undo.length === 0) return
  useArrange.getState().undoLast()
  useArrangeUi.getState().announce(i18n.t('preview:arrange.undone'))
}

let stopRefocus: (() => void) | null = null

function focusStillOn(id: BlockId): boolean {
  const active = document.activeElement
  return (
    active === null ||
    active === document.body ||
    (active instanceof HTMLElement && active.dataset.blockId === id)
  )
}

/**
 * After Undo from a photo, focus that photo wherever the restored arrangement puts it. Back to the
 * automatic layout, the photo moves only when the engine's result is shown, so it is asked for again
 * then, unless focus has gone somewhere else meanwhile.
 */
export function refocusBlock(id: BlockId): void {
  stopRefocus?.()
  stopRefocus = null
  if (shownManual()?.blocks.some((b) => b.blockId === id)) useArrangeUi.getState().requestFocus(id)
  if (useArrange.getState().manual !== null || usePages.getState().status !== 'computing') return
  const stop = usePages.subscribe((pages) => {
    if (pages.status === 'computing') return
    stop()
    if (stopRefocus === stop) stopRefocus = null
    if (useArrange.getState().manual === null && focusStillOn(id)) refocusBlock(id)
  })
  stopRefocus = stop
}

export function rerunAutoLayout(): void {
  useArrange.getState().rerunAuto()
  useArrangeUi.getState().pickUp(null)
  useArrangeUi.getState().announce(i18n.t('preview:arrange.rerunDone'))
}

export function pickUpBlock(id: BlockId | null): void {
  const ui = useArrangeUi.getState()
  const previous = ui.pickedUp
  ui.pickUp(id)
  if (id !== null) {
    const items = currentItems()
    const item = items.find((it) => blockIdOf(it) === id)
    if (item) ui.announce(i18n.t('preview:arrange.pickedUp', { name: nameOf(item.imageId) }))
  } else if (previous !== null) {
    ui.announce(i18n.t('preview:arrange.pickUpCancelled'))
  }
}

export function selectBlock(id: BlockId): void {
  useArrange.getState().select(id)
  const imageId = currentItems().find((it) => blockIdOf(it) === id)?.imageId
  if (imageId !== undefined) useImages.getState().select(imageId)
}

export function setArrangeMode(on: boolean): void {
  useArrange.getState().setMode(on)
  if (!on) useArrangeUi.getState().pickUp(null)
}

export function useArrangeView(): { manual: ManualLayout | null; blocks: ArrangeBlock[] } {
  const stored = useArrange((s) => s.manual)
  const layout = usePages((s) => s.layout)
  const empty = usePages((s) => s.empty)
  const descriptors = useImages(selectImageDescriptors)
  const images = useImages((s) => s.images)
  const setup = useSettings((s) => s.pageSetup)
  const unit = useSettings((s) => s.unit)
  return useMemo(() => {
    const items = buildLayoutItems(descriptors)
    const manual =
      stored ?? (layout !== null && !empty ? manualFromLayout(layout, items, setup) : null)
    const names = new Map(images.map((i) => [i.id, i.name]))
    const name = (id: ImageId) => names.get(id) ?? i18n.t('app:preview.unnamedImage')
    return { manual, blocks: arrangeBlocks(manual, items, unit, name) }
  }, [stored, layout, empty, descriptors, images, setup, unit])
}
