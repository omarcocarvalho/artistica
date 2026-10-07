import { expect, type Locator, type Page } from '@playwright/test'
import type { UploadFile } from './synthetic.ts'

type Upload = string | string[] | UploadFile | UploadFile[]

const STUDY_VERSION_NAMES = ['Original', 'Blurred', 'Values', 'Blur + Values'] as const
export type StudyVersionName = (typeof STUDY_VERSION_NAMES)[number]

export const LINE_TYPE_NAMES = [
  'Grid',
  'Rule of thirds',
  'Diagonals & armature',
  'Golden ratio',
  'Golden spiral',
  'Centre lines',
] as const
export type LineTypeName = (typeof LINE_TYPE_NAMES)[number]
export type SpiralCornerName = 'Top left' | 'Top right' | 'Bottom left' | 'Bottom right'

declare const requestAnimationFrame: (callback: () => void) => number

/**
 * Single home for selectors that depend on the app's markup (roles and accessible names from the
 * en locale). Adapt here, nowhere else.
 */
export class AppPage {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  async goto(): Promise<void> {
    await this.page.goto('app/')
    await expect(this.page.getByRole('heading', { level: 1, name: 'Artistica' })).toBeAttached()
  }

  // Import (ImportDropzone: section with a group "Add images")
  get dropzone(): Locator {
    return this.page.locator('[data-dropzone]').first()
  }
  get fileInput(): Locator {
    return this.page.locator('input[type="file"]').first()
  }

  // Image list (ImageList: ul "Loaded images")
  get imageList(): Locator {
    return this.page.getByRole('list', { name: 'Loaded images' })
  }
  get imageRows(): Locator {
    return this.imageList.getByRole('listitem')
  }
  selectButton(name: string): Locator {
    return this.page.getByRole('button', { name: `Select ${name}`, exact: true })
  }
  editButton(name: string): Locator {
    return this.page.getByRole('button', { name: `Edit ${name}`, exact: true })
  }
  removeButton(name: string): Locator {
    return this.page.getByRole('button', { name: `Remove ${name}`, exact: true })
  }

  // Preview (PagePreview: figure > group sheet > canvas + one button per tile named by image name)
  get pageFigures(): Locator {
    return this.page.locator('main figure')
  }
  get pageCanvases(): Locator {
    return this.page.locator('main figure canvas')
  }
  /** A tile on the page preview (a button named exactly by the image name; aria-pressed = selected). */
  tile(name: string): Locator {
    return this.pageFigures.getByRole('button', { name, exact: true })
  }

  // Edit sheet (CropEditor)
  get cropArea(): Locator {
    return this.page.getByRole('group', { name: 'Crop area', exact: true })
  }
  get cropReadout(): Locator {
    return this.page.getByTestId('crop-readout')
  }

  // Notices (NoticeRegion)
  get notices(): Locator {
    return this.page.getByRole('region', { name: 'Notifications' })
  }

  // Phone flow (MobileFlow: nav "Steps" with Images / Page / Preview / Export)
  get stepBar(): Locator {
    return this.page.getByRole('navigation', { name: 'Steps' })
  }
  stepTab(name: 'Images' | 'Page' | 'Studies' | 'Preview' | 'Export'): Locator {
    return this.stepBar.getByRole('button', { name, exact: true })
  }
  async goToStep(name: 'Images' | 'Page' | 'Studies' | 'Preview' | 'Export'): Promise<void> {
    await this.stepTab(name).click()
    await expect(this.stepTab(name)).toHaveAttribute('aria-current', 'step')
  }

  // Export
  get exportButton(): Locator {
    return this.page.getByRole('button', { name: 'Export PDF' })
  }

  async upload(files: Upload): Promise<void> {
    await this.fileInput.setInputFiles(files)
  }
  async expectImages(n: number, timeout = 30_000): Promise<void> {
    await expect(this.imageRows).toHaveCount(n, { timeout })
  }
  async expectPreviewPages(min = 1): Promise<number> {
    await expect
      .poll(async () => this.pageCanvases.count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(min)
    return this.pageCanvases.count()
  }

  // Page setup panel (labels from the pageSetup locale)
  async setPaper(label: string): Promise<void> {
    await this.page.getByLabel('Paper size').selectOption(label)
  }
  async setSwitch(name: string, on: boolean): Promise<void> {
    const sw = this.page.getByRole('switch', { name })
    if ((await sw.isChecked()) !== on) await sw.click()
  }
  async setField(label: string, value: string): Promise<void> {
    const f = this.page.getByLabel(label, { exact: true })
    await f.fill(value)
    await f.press('Enter')
    await f.blur()
  }

  /** Open the "Add link" form (button "Link" in the compact dropzone, "Add link" in the empty state). */
  async openLinkField(): Promise<Locator> {
    await this.page
      .getByRole('button', { name: /^(link|add link)$/i })
      .first()
      .click()
    return this.page.getByLabel('Image link')
  }
  async submitLink(url: string): Promise<void> {
    await (await this.openLinkField()).fill(url)
    await this.page.getByRole('button', { name: 'Add', exact: true }).click()
  }
  /** "Remove all images" and, with 2+ images, its confirmation dialog. */
  async removeAll(): Promise<void> {
    await this.page.getByRole('button', { name: 'Remove all images' }).click()
    const dialog = this.page.getByRole('dialog', { name: 'Remove all images?' })
    if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Remove all' }).click()
  }

  /**
   * Open the export dialog, create the PDF, return its bytes. `via: 'step'` uses the phone Export
   * step's "Create PDF" button. The dialog internals ("Create PDF", "Download PDF") are not merged
   * yet; adjust here when the export dialog lands.
   */
  async exportPdf(
    via: 'top-bar' | 'step' = 'top-bar',
  ): Promise<{ bytes: Buffer; fileName: string }> {
    if (via === 'step') await this.page.getByRole('button', { name: 'Create PDF' }).first().click()
    else await this.exportButton.click()
    const dialog = this.page.getByRole('dialog')
    await dialog.getByRole('button', { name: /create pdf/i }).click()
    const download = this.page.waitForEvent('download', { timeout: 120_000 })
    await dialog.getByRole('link', { name: /download pdf/i }).click()
    const d = await download
    const stream = await d.createReadStream()
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(c as Buffer)
    return { bytes: Buffer.concat(chunks), fileName: d.suggestedFilename() }
  }

  // --- Studies (D3) ---
  async openStudiesTab(): Promise<void> {
    await this.page.getByRole('tab', { name: 'Studies' }).click()
  }
  get studiesPanel(): Locator {
    return this.page.getByRole('tabpanel', { name: 'Studies' })
  }
  versionChip(name: StudyVersionName): Locator {
    return this.page
      .getByRole('group', { name: 'Print these versions' })
      .getByRole('button', { name, exact: true })
  }
  /** Turns the wanted versions on first, so the last-version rule never blocks a switch. */
  async setVersions(on: readonly StudyVersionName[]): Promise<void> {
    for (const v of on) {
      const chip = this.versionChip(v)
      if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
    }
    for (const v of STUDY_VERSION_NAMES) {
      const chip = this.versionChip(v)
      if (!on.includes(v) && (await chip.getAttribute('aria-pressed')) === 'true') {
        await chip.click()
        await expect(chip).toHaveAttribute('aria-pressed', 'false')
      }
    }
  }
  studySlider(name: 'Amount' | 'Number of values' | 'Custom hue'): Locator {
    return this.page.getByRole('slider', { name, exact: true })
  }
  /** Native range input: fill() sets the value and fires input/change in every engine. */
  async setSlider(
    name: 'Amount' | 'Number of values' | 'Custom hue',
    value: number,
  ): Promise<void> {
    await this.studySlider(name).fill(String(value))
    await expect(this.studySlider(name)).toHaveValue(String(value))
  }
  swatch(name: string): Locator {
    return this.page.getByRole('group', { name: 'Hue' }).getByRole('button', { name, exact: true })
  }
  async applyStudiesToAll(): Promise<void> {
    await this.page.getByRole('button', { name: 'Apply to all images' }).click()
  }
  /** A study tile on the preview: "<name>, <Version>"; originals keep the bare name. */
  studyTile(name: string, version: Exclude<StudyVersionName, 'Original'>): Locator {
    return this.pageFigures.getByRole('button', { name: `${name}, ${version}`, exact: true })
  }
  /**
   * Waits until no sheet is busy (layout or study tiles pending), then checks again a couple of
   * frames later: a sheet marks itself busy in an effect that runs after its tiles are painted.
   */
  async expectPreviewSettled(timeout = 30_000): Promise<void> {
    const busy = this.page.locator('main [aria-busy="true"]')
    await expect
      .poll(
        async () => {
          if ((await busy.count()) > 0) return false
          await this.page.evaluate(
            () =>
              new Promise<void>((done) => {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    done()
                  })
                })
              }),
          )
          return (await busy.count()) === 0
        },
        { timeout },
      )
      .toBe(true)
  }
  /** Pixel at the centre of a preview tile, read from its page canvas, as [r,g,b,a]. */
  async tileCentrePixel(tile: Locator, pageIndex = 0): Promise<number[]> {
    const box = await tile.boundingBox()
    const sheet = await this.pageCanvases.nth(pageIndex).boundingBox()
    if (!box || !sheet) throw new Error('tile or page canvas is not rendered')
    return this.canvasPixel(
      (box.x + box.width / 2 - sheet.x) / sheet.width,
      (box.y + box.height / 2 - sheet.y) / sheet.height,
      pageIndex,
    )
  }

  // --- Studies, phone (D4) ---
  get studiesPicker(): Locator {
    return this.page.getByRole('radiogroup', { name: 'Image' })
  }
  /** Taps the thumbnail: the radio itself is visually hidden inside its label. */
  async pickStudiesImage(name: string): Promise<void> {
    const radio = this.studiesPicker.getByRole('radio', { name, exact: true })
    await radio.locator('xpath=ancestor::label').click()
    await expect(radio).toBeChecked()
  }
  /** sRGB colours of the Studies panel's ramp strip, darkest first. */
  async rampColours(): Promise<number[][]> {
    return this.page
      .getByRole('img', { name: /values, from darkest to lightest tint/ })
      .locator('span')
      .evaluateAll((spans: { style: { backgroundColor: string } }[]) =>
        spans.map((s) => (s.style.backgroundColor.match(/\d+/g) ?? []).map(Number)),
      )
  }
  /** Pixel of the preview canvas under a point of a tile button (fx, fy in 0..1 of the tile). */
  async tilePixel(tile: Locator, fx: number, fy: number): Promise<number[]> {
    const box = await tile.boundingBox()
    const canvas = tile.locator('xpath=ancestor::figure').locator('canvas')
    const cbox = await canvas.boundingBox()
    if (!box || !cbox) throw new Error('tile or canvas not laid out')
    return readCanvasPixel(
      canvas,
      (box.x + fx * box.width - cbox.x) / cbox.width,
      (box.y + fy * box.height - cbox.y) / cbox.height,
    )
  }

  /** Pixels at tile fractions [fx, fy] of a tile, as [r,g,b,a] each, read in one call. */
  async tilePixels(
    tile: Locator,
    points: readonly (readonly [number, number])[],
  ): Promise<number[][]> {
    const box = await tile.boundingBox()
    const canvas = tile.locator('xpath=ancestor::figure').locator('canvas')
    const cbox = await canvas.boundingBox()
    if (!box || !cbox) throw new Error('tile or canvas not laid out')
    const at = points.map(([fx, fy]): [number, number] => [
      (box.x + fx * box.width - cbox.x) / cbox.width,
      (box.y + fy * box.height - cbox.y) / cbox.height,
    ])
    return canvas.evaluate(
      (
        c: {
          width: number
          height: number
          getContext(id: '2d'): {
            getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> }
          } | null
        },
        fractions: [number, number][],
      ) => {
        const g = c.getContext('2d')
        if (!g) throw new Error('canvas is not 2d')
        return fractions.map(([x, y]) =>
          Array.from(g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data),
        )
      },
      at,
    )
  }

  // --- Lines, phone (D4) ---
  /** The Studies step's collapsible Lines card: a <details>, whose summary has no ARIA role. */
  get linesSection(): Locator {
    return this.page.locator('details').filter({ has: this.page.locator('summary') })
  }
  get linesSummary(): Locator {
    return this.linesSection.locator('summary')
  }
  async openLinesSection(): Promise<void> {
    if ((await this.linesSection.getAttribute('open')) === null) await this.linesSummary.click()
    await expect(this.linesSection).toHaveAttribute('open', '')
  }
  phoneLineSwitch(name: LineTypeName): Locator {
    return this.linesSection.getByRole('switch', { name, exact: true })
  }
  get linesApplyButton(): Locator {
    return this.page.getByRole('button', { name: 'Apply lines to all images', exact: true })
  }
  /** Every composition type on, with the given grid and spiral corner, in the Lines controls inside `scope`. */
  async everyLineOn(
    scope: Locator,
    grid: { cols: number; rows: number },
    corner: SpiralCornerName,
  ): Promise<void> {
    for (const name of LINE_TYPE_NAMES) {
      const sw = scope.getByRole('switch', { name, exact: true })
      if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click()
      await expect(sw).toHaveAttribute('aria-checked', 'true')
    }
    for (const [label, n] of [
      ['Columns', grid.cols],
      ['Rows', grid.rows],
    ] as const) {
      const field = scope.getByRole('textbox', { name: label, exact: true })
      await field.fill(String(n))
      await field.press('Enter')
      await expect(field).toHaveValue(String(n))
    }
    const radio = scope
      .getByRole('radiogroup', { name: 'Spiral starts at' })
      .getByRole('radio', { name: corner, exact: true })
    await radio.click()
    await expect(radio).toBeChecked()
  }

  /** Pixel (fx, fy in 0..1) of a page canvas as [r,g,b,a]. */
  async canvasPixel(fx: number, fy: number, index = 0): Promise<number[]> {
    return this.pageCanvases.nth(index).evaluate(
      (
        c: {
          width: number
          height: number
          getContext(id: '2d'): {
            getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> }
          } | null
        },
        [x, y]: [number, number],
      ) => {
        const g = c.getContext('2d')
        if (!g) throw new Error('canvas is not 2d')
        return Array.from(
          g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data,
        )
      },
      [fx, fy] as [number, number],
    )
  }

  // --- Lines (D3) ---
  async openLinesTab(): Promise<void> {
    await this.page.getByRole('tab', { name: 'Lines' }).click()
  }
  get linesPanel(): Locator {
    return this.page.getByRole('tabpanel', { name: 'Lines' })
  }
  lineSwitch(name: LineTypeName): Locator {
    return this.page.getByRole('switch', { name, exact: true })
  }
  async setLineSwitch(name: LineTypeName, on: boolean): Promise<void> {
    const s = this.lineSwitch(name)
    if ((await s.getAttribute('aria-checked')) !== String(on)) await s.click()
    await expect(s).toHaveAttribute('aria-checked', String(on))
  }
  /** Turns every composition type on or off. */
  async setAllLineSwitches(on: boolean): Promise<void> {
    for (const name of LINE_TYPE_NAMES) await this.setLineSwitch(name, on)
  }
  gridField(name: 'Columns' | 'Rows'): Locator {
    return this.page.getByRole('textbox', { name, exact: true })
  }
  /** Commits each count with Enter (the grid switch must be on). */
  async setGrid(cols: number, rows: number): Promise<void> {
    for (const [name, n] of [
      ['Columns', cols],
      ['Rows', rows],
    ] as const) {
      const field = this.gridField(name)
      await field.fill(String(n))
      await field.press('Enter')
      await expect(field).toHaveValue(String(n))
    }
  }
  spiralCorner(name: SpiralCornerName): Locator {
    return this.page
      .getByRole('radiogroup', { name: 'Spiral starts at' })
      .getByRole('radio', { name, exact: true })
  }
  /** The golden spiral switch must be on. */
  async setSpiralCorner(name: SpiralCornerName): Promise<void> {
    await this.spiralCorner(name).click()
    await expect(this.spiralCorner(name)).toHaveAttribute('aria-checked', 'true')
  }
  get lineColour(): Locator {
    return this.page.getByLabel('Colour', { exact: true })
  }
  lineSlider(name: 'Thickness' | 'Opacity'): Locator {
    return this.page.getByRole('slider', { name, exact: true })
  }
  /**
   * fill() on input[type=color] sets the value and fires input and change in chromium, firefox
   * and webkit (checked by L-D11); native range inputs take fill() the same way.
   */
  async setLineStyle(style: {
    colour?: string
    widthMm?: number
    opacityPct?: number
  }): Promise<void> {
    if (style.colour !== undefined) {
      await this.lineColour.fill(style.colour)
      await expect(this.lineColour).toHaveValue(style.colour.toLowerCase())
    }
    if (style.widthMm !== undefined) {
      await this.lineSlider('Thickness').fill(String(style.widthMm))
      await expect(this.lineSlider('Thickness')).toHaveValue(String(style.widthMm))
    }
    if (style.opacityPct !== undefined) {
      await this.lineSlider('Opacity').fill(String(style.opacityPct))
      await expect(this.lineSlider('Opacity')).toHaveValue(String(style.opacityPct))
    }
  }
  async applyLinesToAll(): Promise<void> {
    await this.page.getByRole('button', { name: 'Apply lines to all images' }).click()
  }
  /** Device-pixel RGBA at (x, y) of the n-th sheet canvas. */
  async sheetPixel(n: number, x: number, y: number): Promise<[number, number, number, number]> {
    const [px] = await this.sheetPixels(n, [[x, y]])
    return px
  }
  /** Device-pixel RGBA at each (x, y) of the n-th sheet canvas, read in one round trip. */
  async sheetPixels(
    n: number,
    points: readonly (readonly [number, number])[],
  ): Promise<[number, number, number, number][]> {
    return this.pageCanvases.nth(n).evaluate(
      (c: SheetCanvas, pts: [number, number][]) => {
        const g = c.getContext('2d')
        if (!g) throw new Error('canvas is not 2d')
        const all = g.getImageData(0, 0, c.width, c.height).data
        return pts.map(([x, y]) => {
          const o = 4 * (Math.floor(y) * c.width + Math.floor(x))
          return [all[o] ?? NaN, all[o + 1] ?? NaN, all[o + 2] ?? NaN, all[o + 3] ?? NaN]
        })
      },
      points.map(([x, y]) => [x, y] as [number, number]),
    )
  }
  /** Device pixels per millimetre of the n-th sheet: its canvas width over the page width in mm. */
  async sheetScale(n: number, pageWidthMm: number): Promise<{ pxPerMm: number }> {
    const width = await this.pageCanvases.nth(n).evaluate((c: SheetCanvas) => c.width)
    return { pxPerMm: width / pageWidthMm }
  }
}

// --- Lines (D3) ---
interface SheetCanvas {
  width: number
  height: number
  getContext(id: '2d'): {
    getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> }
  } | null
}

/** Largest channel difference between a pixel and the closest colour of a palette. */
export function colourDistance(px: readonly number[], palette: readonly number[][]): number {
  return Math.min(
    ...palette.map((c) => Math.max(...c.map((ch, i) => Math.abs(ch - (px[i] ?? NaN))))),
  )
}

function readCanvasPixel(canvas: Locator, fx: number, fy: number): Promise<number[]> {
  return canvas.evaluate(
    (
      c: {
        width: number
        height: number
        getContext(id: '2d'): {
          getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> }
        } | null
      },
      [x, y]: [number, number],
    ) => {
      const g = c.getContext('2d')
      if (!g) throw new Error('canvas is not 2d')
      return Array.from(
        g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data,
      )
    },
    [fx, fy] as [number, number],
  )
}
