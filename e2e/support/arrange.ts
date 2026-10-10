import { expect, type Locator, type Page } from '@playwright/test'
import type { RectMm } from '../../src/features/layout/types.ts'
import { cropMarksForTiles } from '../../src/features/render/page-model/crop-marks.ts'
import { safeAreaRect } from '../../src/features/render/page-model/build-page-models.ts'
import type { PdfPageSummary } from './pdf.ts'
import { PT_PER_MM } from '../../src/shared/model/units.ts'

export type { RectMm }

/** A tile hit area (outside Arrange mode) or a block (in it), in page mm, read from the DOM. */
export interface PlacedBox {
  /** Accessible name of the tile, or the photo's file name for a block. */
  readonly name: string
  /** `data-block-id` of a block; '' for a tile. */
  readonly id: string
  readonly page: number
  readonly rect: RectMm
}

export interface PreviewSheet {
  readonly size: { readonly w: number; readonly h: number }
  readonly boxes: readonly PlacedBox[]
}

/** Arrange mode's markup (B4): roles, names and the stable `data-block-id` hook. */
export class ArrangeArea {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  get toggle(): Locator {
    return this.page.getByRole('button', { name: 'Arrange', exact: true })
  }
  get undo(): Locator {
    return this.page.getByRole('button', { name: 'Undo', exact: true })
  }
  get rerun(): Locator {
    return this.page.getByRole('button', { name: 'Re-run auto layout', exact: true })
  }
  get blocks(): Locator {
    return this.page.locator('main figure [data-block-id]')
  }
  /** The block of the photo `file` (its accessible name starts with the file name). */
  block(file: string): Locator {
    return this.page.locator(`main figure [data-block-id][aria-label^="${file}, "]`)
  }
  get ghost(): Locator {
    return this.page.getByTestId('arrange-ghost')
  }
  /** The one polite region for arrange announcements, just before the busy preview. */
  get liveRegion(): Locator {
    return this.page.locator('[aria-live="polite"]:has(+ [aria-busy])')
  }
  get selectedGroup(): Locator {
    return this.page.getByRole('group', { name: /^Selected photo: / })
  }
  get moveToPage(): Locator {
    return this.page.getByLabel('Move to page', { exact: true })
  }
  get swapWith(): Locator {
    return this.page.getByLabel('Swap with…', { exact: true })
  }
  get width(): Locator {
    return this.page.getByRole('spinbutton', { name: 'Width' })
  }
  nudgeButton(name: 'Move left' | 'Move up' | 'Move down' | 'Move right'): Locator {
    return this.page.getByRole('button', { name, exact: true })
  }

  async enter(): Promise<void> {
    if ((await this.toggle.getAttribute('aria-pressed')) !== 'true') await this.toggle.click()
    await expect(this.toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(this.blocks.first()).toBeVisible()
  }
  async exit(): Promise<void> {
    if ((await this.toggle.getAttribute('aria-pressed')) === 'true') await this.toggle.click()
    await expect(this.toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(this.blocks).toHaveCount(0)
  }
  /** Re-run auto layout through its confirmation (owner Q6 default). */
  async rerunAuto(): Promise<void> {
    await this.rerun.click()
    const dialog = this.page.getByRole('dialog', {
      name: 'Re-run auto layout? Your moves and size changes will be lost.',
    })
    await dialog.getByRole('button', { name: 'Re-run', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(this.rerun).toBeDisabled()
  }
  async announcement(): Promise<string> {
    return ((await this.liveRegion.textContent()) ?? '').trim()
  }
  async expectAnnouncement(text: string | RegExp): Promise<void> {
    await expect.poll(async () => this.announcement()).toMatch(text)
  }

  /** Every page sheet with its blocks (Arrange mode) or tile hit areas (otherwise), in page mm. */
  async sheets(): Promise<PreviewSheet[]> {
    return readSheets(this.page)
  }
  async blockBoxes(): Promise<PlacedBox[]> {
    return (await this.sheets()).flatMap((s) => s.boxes.filter((b) => b.id !== ''))
  }
  async blockOf(file: string): Promise<PlacedBox> {
    const b = (await this.blockBoxes()).find((x) => x.name === file)
    if (!b) throw new Error(`no block for ${file}`)
    return b
  }

  /** The sheet (page area) of page `index`. */
  sheet(index: number): Locator {
    return this.page.locator('main figure > div[role="group"]').nth(index)
  }
  /** Screen px per page mm of page `index`, with its box. */
  async sheetBox(index: number): Promise<{ x: number; y: number; ppm: number }> {
    const box = await this.sheet(index).boundingBox()
    const size = (await this.sheets()).at(index)?.size
    if (!box || !size) throw new Error(`no sheet ${String(index)}`)
    return { x: box.x, y: box.y, ppm: box.width / size.w }
  }

  /**
   * Drags the block of `file` by its centre so its top-left lands at (x, y) mm on page `to`
   * (before snapping), with the pointer kept in the viewport.
   */
  async dragBlockTo(file: string, to: number, x: number, y: number): Promise<void> {
    const from = await this.blockOf(file)
    await this.block(file).scrollIntoViewIfNeeded()
    const a = await this.sheetBox(from.page)
    const startX = a.x + (from.rect.x + from.rect.w / 2) * a.ppm
    const startY = a.y + (from.rect.y + from.rect.h / 2) * a.ppm
    await this.page.mouse.move(startX, startY)
    await this.page.mouse.down()
    await this.page.mouse.move(startX + 10, startY + 10, { steps: 2 })
    const b = await this.sheetBox(to)
    await this.page.mouse.move(
      b.x + (x + from.rect.w / 2) * b.ppm,
      b.y + (y + from.rect.h / 2) * b.ppm,
      { steps: 12 },
    )
    await this.page.mouse.up()
  }

  /** Drags a corner handle of the (selected) block of `file` by dx, dy mm. */
  async dragHandle(
    file: string,
    corner: 'tl' | 'tr' | 'bl' | 'br',
    dx: number,
    dy: number,
  ): Promise<void> {
    const block = await this.blockOf(file)
    const handle = this.block(file).locator(`[data-corner="${corner}"]`)
    await handle.scrollIntoViewIfNeeded()
    const box = await handle.boundingBox()
    if (!box) throw new Error(`no ${corner} handle on ${file}`)
    const { ppm } = await this.sheetBox(block.page)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    await this.page.mouse.move(x + dx * ppm, y + dy * ppm, { steps: 12 })
    await this.page.mouse.up()
  }
}

interface DomEl {
  style: { aspectRatio: string; left: string; top: string; width: string; height: string }
  getAttribute(name: string): string | null
  querySelectorAll(sel: string): Iterable<DomEl>
}

/** Reads every sheet's page size and the % boxes of its blocks or tile buttons. */
export async function readSheets(page: Page): Promise<PreviewSheet[]> {
  const raw = await page.evaluate(() => {
    const doc = (
      globalThis as unknown as { document: { querySelectorAll(s: string): Iterable<DomEl> } }
    ).document
    return [...doc.querySelectorAll('main figure > div[role="group"]')].map((g) => ({
      ar: g.style.aspectRatio,
      boxes: [...g.querySelectorAll(':scope > button, :scope > [data-block-id]')].map((b) => ({
        label: b.getAttribute('aria-label') ?? '',
        id: b.getAttribute('data-block-id') ?? '',
        left: b.style.left,
        top: b.style.top,
        width: b.style.width,
        height: b.style.height,
      })),
    }))
  })
  return raw.map((s, page) => {
    const [w, h] = s.ar.split('/').map((v) => Number(v.trim()))
    if (!w || !h) throw new Error(`sheet ${String(page)} has no aspect ratio: ${s.ar}`)
    const pct = (v: string, of: number) => (Number.parseFloat(v) / 100) * of
    return {
      size: { w, h },
      boxes: s.boxes.map((b) => ({
        name: b.id === '' ? b.label : (b.label.split(', ')[0] ?? ''),
        id: b.id,
        page,
        rect: { x: pct(b.left, w), y: pct(b.top, h), w: pct(b.width, w), h: pct(b.height, h) },
      })),
    }
  })
}

/** Rects equal within `tol` mm on every side. */
export function sameRect(a: RectMm, b: RectMm, tol = 0.01): boolean {
  return (
    Math.abs(a.x - b.x) <= tol &&
    Math.abs(a.y - b.y) <= tol &&
    Math.abs(a.w - b.w) <= tol &&
    Math.abs(a.h - b.h) <= tol
  )
}

const byPosition = (a: RectMm, b: RectMm) => a.y - b.y || a.x - b.x || a.w - b.w

/** Every rect of `want` matched by one of `got` within `tol`, and none left over (as text). */
export function rectMismatches(
  label: string,
  got: readonly RectMm[],
  want: readonly RectMm[],
  tol = 0.01,
): string[] {
  const left = [...got].sort(byPosition)
  const out: string[] = []
  for (const w of [...want].sort(byPosition)) {
    const i = left.findIndex((g) => sameRect(g, w, tol))
    if (i < 0) out.push(`${label}: no match for ${JSON.stringify(w)}`)
    else left.splice(i, 1)
  }
  for (const g of left) out.push(`${label}: extra ${JSON.stringify(g)}`)
  return out
}

/** A PDF page's crop-mark segments in page mm (origin top left), as `cropMarksForTiles` gives them. */
export function pdfMarksMm(
  p: PdfPageSummary,
): { x1: number; y1: number; x2: number; y2: number }[] {
  const y = (pt: number) => (p.heightPt - pt) / PT_PER_MM
  return p.markSegments.map((s) => ({
    x1: s.x1 / PT_PER_MM,
    y1: y(s.y1),
    x2: s.x2 / PT_PER_MM,
    y2: y(s.y2),
  }))
}

/** The crop marks the app's own geometry gives for these trims (no bleed) on this page. */
export function expectedMarks(
  trims: readonly RectMm[],
  size: { w: number; h: number },
  safeAreaMm: number,
): { x1: number; y1: number; x2: number; y2: number }[] {
  return cropMarksForTiles(
    trims.map((trim) => ({ trim, bleedMm: 0 })),
    safeAreaRect(size, safeAreaMm),
  )
}

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
}
const segKey = (s: Seg) => [s.x1, s.y1, s.x2, s.y2]

/** Segments matched one to one within `tol` mm (either direction), as text for each miss. */
export function segmentMismatches(got: readonly Seg[], want: readonly Seg[], tol = 0.01): string[] {
  const left = [...got]
  const out: string[] = []
  const close = (a: Seg, b: Seg) => {
    const ka = segKey(a)
    const kb = segKey(b)
    const kr = [b.x2, b.y2, b.x1, b.y1]
    return (
      ka.every((v, i) => Math.abs(v - (kb[i] ?? NaN)) <= tol) ||
      ka.every((v, i) => Math.abs(v - (kr[i] ?? NaN)) <= tol)
    )
  }
  for (const w of want) {
    const i = left.findIndex((g) => close(g, w))
    if (i < 0) out.push(`missing mark ${JSON.stringify(w)}`)
    else left.splice(i, 1)
  }
  for (const g of left) out.push(`extra mark ${JSON.stringify(g)}`)
  return out
}
