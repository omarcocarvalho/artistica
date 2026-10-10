import type { ManualBlock, ManualLayout } from '../manual'

/** Freeze a value and everything inside it, so a mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

/** A4 portrait with the default setup: content box (10, 10, 190 × 277), gutter 6. */
export function manualOf(blocks: readonly ManualBlock[], pageCount = 1): ManualLayout {
  return deepFreeze({
    orientation: 'portrait',
    pageSize: { w: 210, h: 297 },
    content: { x: 10, y: 10, w: 190, h: 277 },
    gutter: 6,
    pageCount,
    blocks,
  })
}

export function block(blockId: string, x: number, y: number, tileW: number, page = 0): ManualBlock {
  return { blockId, page, x, y, tileW, turned: false }
}

export function blockOf(m: ManualLayout, id: string): ManualBlock {
  const b = m.blocks.find((x) => x.blockId === id)
  if (b === undefined) throw new Error(`no block ${id}`)
  return b
}
