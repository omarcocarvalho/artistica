import type { ImageId } from '../../../shared/model/image'
import type { Mm } from '../../../shared/model/units'

export interface ArrangeRect {
  readonly x: Mm
  readonly y: Mm
  readonly w: Mm
  readonly h: Mm
}

export type ArrangeCorner = 'tl' | 'tr' | 'bl' | 'br'

/** One photo copy with all its study versions, as the arrange layer draws and moves it. */
export interface ArrangeBlock {
  readonly id: string
  readonly imageId: ImageId
  readonly page: number
  /** Trim box of the whole block, page mm from the page's top-left. */
  readonly rect: ArrangeRect
  /** Width of one tile, unturned. */
  readonly tileW: Mm
  readonly fixed: boolean
  /** Accessible name, e.g. "portrait.jpg, 120 × 160 mm, page 1". */
  readonly name: string
}

export type ArrangeIntent =
  | {
      readonly kind: 'move'
      readonly id: string
      readonly page: number
      readonly x: Mm
      readonly y: Mm
      /** Dropped on another page: when the point is refused, place it where that page has room. */
      readonly fallback: boolean
    }
  | { readonly kind: 'nudge'; readonly id: string; readonly dx: Mm; readonly dy: Mm }
  | {
      readonly kind: 'resize'
      readonly id: string
      readonly tileW: Mm
      readonly anchor: ArrangeCorner
    }
  | { readonly kind: 'swap'; readonly id: string; readonly with: string }
  /** To that page at the first place with room; the page after the last one is a new page. */
  | { readonly kind: 'page'; readonly id: string; readonly page: number }

export type ArrangePreview =
  { readonly ok: true; readonly page: number; readonly rect: ArrangeRect } | { readonly ok: false }

/** Where each page sheet sits on screen, so a drag can be dropped on another page. */
export interface SheetRegistry {
  register(page: number, el: HTMLElement): () => void
  /** The page whose sheet is under the point, with its on-screen box. */
  at(clientX: number, clientY: number): { readonly page: number; readonly box: DOMRect } | null
}

export interface ArrangeProps {
  /** Every block on every page (the layer draws those of its own page). */
  readonly blocks: readonly ArrangeBlock[]
  readonly content: ArrangeRect
  readonly gutter: Mm
  readonly selected: string | null
  readonly pickedUp: string | null
  /** A block to focus once it is drawn (after an operation moved it, perhaps to another page). */
  readonly focusId: string | null
  readonly sheets: SheetRegistry
  readonly onSelect: (id: string) => void
  readonly onFocused: (id: string) => void
  /** Dry run for the drag ghost: what the operation would give, without changing anything. */
  readonly onPreview: (intent: ArrangeIntent) => ArrangePreview
  /** Commit; false when refused (the caller announces why). */
  readonly onCommit: (intent: ArrangeIntent) => boolean
  readonly onPickUp: (id: string | null) => void
}

export function createSheetRegistry(): SheetRegistry {
  const sheets = new Map<number, HTMLElement>()
  return {
    register(page, el) {
      sheets.set(page, el)
      return () => {
        if (sheets.get(page) === el) sheets.delete(page)
      }
    },
    at(clientX, clientY) {
      for (const [page, el] of sheets) {
        const box = el.getBoundingClientRect()
        if (
          clientX >= box.left &&
          clientX <= box.right &&
          clientY >= box.top &&
          clientY <= box.bottom &&
          box.width > 0
        )
          return { page, box }
      }
      return null
    },
  }
}
