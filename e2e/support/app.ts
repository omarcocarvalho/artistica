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
  /** "Adding N photo(s)…" beside the import progress bar. */
  importing(count: number): Locator {
    return this.page.getByText(
      count === 1 ? 'Adding 1 photo…' : `Adding ${String(count)} photos…`,
      {
        exact: true,
      },
    )
  }
  /** The dropzone's "Cancel" beside the progress (accessible name "Cancel adding photos"). */
  get cancelImportsButton(): Locator {
    return this.page.getByRole('button', { name: 'Cancel adding photos', exact: true })
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

  /** The phone Export step, where the export runs inline (M5-R28). */
  get exportStep(): Locator {
    return this.page.getByRole('region', { name: 'Step 5 of 5: Export' })
  }

  /**
   * Create the PDF and return its bytes: through the top bar's Export and its dialog, or with
   * `via: 'step'` inline in the phone Export step (which must be shown), with one press.
   */
  async exportPdf(
    via: 'top-bar' | 'step' = 'top-bar',
  ): Promise<{ bytes: Buffer; fileName: string }> {
    let scope: Locator
    if (via === 'step') {
      scope = this.exportStep
    } else {
      await this.exportButton.click()
      scope = this.page.getByRole('dialog')
    }
    await scope.getByRole('button', { name: /create pdf/i }).click()
    const download = this.page.waitForEvent('download', { timeout: 120_000 })
    await scope.getByRole('link', { name: /download pdf/i }).click()
    const d = await download
    const stream = await d.createReadStream()
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(c as Buffer)
    return { bytes: Buffer.concat(chunks), fileName: d.suggestedFilename() }
  }

  async openPageTab(): Promise<void> {
    await this.page.getByRole('tab', { name: 'Page' }).click()
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
   * Waits until no preview element is busy (layout or study tiles pending) and every page sheet on
   * screen is drawn (a page far from the view keeps a 0 × 0 canvas, M5-R21), then checks again a
   * couple of frames later: a sheet marks itself busy in an effect that runs after its tiles are
   * painted.
   */
  async expectPreviewSettled(timeout = 30_000): Promise<void> {
    const settled = () =>
      this.page.evaluate(() => {
        const w = globalThis as unknown as SettleWindow
        const doc = w.document
        if (doc.querySelector('main [aria-busy="true"]') !== null) return false
        const onScreen = (el: SettleElement): boolean => {
          let { left, top, right, bottom } = el.getBoundingClientRect()
          for (let p = el.parentElement; p; p = p.parentElement) {
            const s = w.getComputedStyle(p)
            if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
            const c = p.getBoundingClientRect()
            left = Math.max(left, c.left)
            top = Math.max(top, c.top)
            right = Math.min(right, c.right)
            bottom = Math.min(bottom, c.bottom)
          }
          right = Math.min(right, w.innerWidth)
          bottom = Math.min(bottom, w.innerHeight)
          return right > Math.max(left, 0) && bottom > Math.max(top, 0)
        }
        return [...doc.querySelectorAll('main figure canvas')].every(
          (c) => c.width > 0 || !onScreen(c),
        )
      })
    await expect
      .poll(
        async () => {
          if (!(await settled())) return false
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
          return settled()
        },
        { timeout },
      )
      .toBe(true)
  }
  /** Page sheets with a drawn canvas: those near the view (M5-R21). */
  async drawnSheetCount(): Promise<number> {
    const widths = await this.pageCanvases.evaluateAll((cs) =>
      cs.map((c) => (c as unknown as { width: number }).width),
    )
    return widths.filter((w) => w > 0).length
  }
  /** Scrolls page `index` into view and waits until it and every other page on screen is drawn. */
  async showPage(index: number): Promise<void> {
    await this.showFigure(this.pageFigures.nth(index))
  }
  /** Scrolls the page holding `tile` into view and waits until every page on screen is drawn. */
  async showTile(tile: Locator): Promise<void> {
    await this.showFigure(tile.locator('xpath=ancestor::figure'))
  }
  private async showFigure(figure: Locator): Promise<void> {
    await figure.scrollIntoViewIfNeeded()
    await expect
      .poll(async () => figure.locator('canvas').evaluate((c: { width: number }) => c.width))
      .toBeGreaterThan(0)
    await this.expectPreviewSettled()
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
        if (c.width === 0 || c.height === 0)
          throw new Error('page canvas is released: show the page first')
        return Array.from(
          g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data,
        )
      },
      [fx, fy] as [number, number],
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
        if (c.width === 0 || c.height === 0)
          throw new Error('page canvas is released: show the page first')
        return fractions.map(([x, y]) =>
          Array.from(g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data),
        )
      },
      at,
    )
  }

  // --- Lines, phone (D4) ---
  /** The Studies step's always-open Lines card, a region named by its h3. */
  get linesSection(): Locator {
    return this.page.getByRole('region', { name: 'Lines', exact: true })
  }
  get linesHeading(): Locator {
    return this.linesSection.getByRole('heading', { name: 'Lines', exact: true, level: 3 })
  }
  /** The "N on" badge beside the heading; absent while no line type is on. */
  get linesCount(): Locator {
    return this.linesHeading.locator('..').getByText(/^\d+ on$/)
  }
  /** Drops the locators inside the phone Lines section, which is always open below the Studies panel. */
  async outsideLinesSection(locators: readonly Locator[]): Promise<Locator[]> {
    if ((await this.linesSection.count()) === 0) return [...locators]
    const section = await this.linesSection.elementHandle()
    const kept: Locator[] = []
    for (const l of locators) {
      const inside = await l.evaluate(
        (el: unknown, s: { contains(node: unknown): boolean } | null) => s?.contains(el) ?? false,
        section,
      )
      if (!inside) kept.push(l)
    }
    return kept
  }
  get linesApplyButton(): Locator {
    return this.page.getByRole('button', { name: 'Apply lines to all images', exact: true })
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
  get lineHex(): Locator {
    return this.page.getByRole('textbox', { name: 'Colour hex code', exact: true })
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
        if (c.width === 0 || c.height === 0)
          throw new Error('page canvas is released: show the page first')
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

  // --- Presets (A3) ---
  get presetsButton(): Locator {
    return this.page.getByRole('button', { name: 'Presets', exact: true })
  }
  get presetsDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Presets', exact: true })
  }
  get presetList(): Locator {
    return this.presetsDialog.getByRole('list', { name: 'Saved presets' })
  }
  /** The name of each saved preset, in list order (the first line of each row). */
  async presetNames(): Promise<string[]> {
    if ((await this.presetList.count()) === 0) return []
    return this.presetList.getByRole('listitem').evaluateAll(
      (
        rows: {
          firstElementChild: { firstElementChild: { textContent: string | null } | null } | null
        }[],
      ) => rows.map((r) => r.firstElementChild?.firstElementChild?.textContent ?? ''),
    )
  }
  get savePresetOpen(): Locator {
    return this.presetsDialog.getByRole('button', { name: 'Save current settings…', exact: true })
  }
  get presetNameField(): Locator {
    return this.presetsDialog.getByLabel('Preset name', { exact: true })
  }
  presetAction(action: 'Apply' | 'Rename' | 'Delete', name: string): Locator {
    return this.presetsDialog.getByRole('button', { name: `${action} ${name}`, exact: true })
  }
  /** The polite region of the dialog that reports saves, applies, renames, deletes and imports. */
  get presetsStatus(): Locator {
    return this.presetsDialog.getByRole('status')
  }
  get presetsAlert(): Locator {
    return this.presetsDialog.getByRole('alert')
  }
  async openPresets(): Promise<void> {
    await this.presetsButton.click()
    await expect(this.presetsDialog).toBeVisible()
  }
  async closePresets(): Promise<void> {
    await this.presetsDialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(this.presetsDialog).toHaveCount(0)
  }
  /** Saves the current settings under `name` (the dialog must be open). */
  async savePreset(name: string): Promise<void> {
    await this.savePresetOpen.click()
    await this.presetNameField.fill(name)
    await this.presetsDialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(this.presetsStatus).toHaveText(`Saved ${name}.`)
  }
  /**
   * Applies a preset (the dialog must be open). With photos loaded the app asks first: pass
   * `asks: true` to answer Apply.
   */
  async applyPreset(name: string, { asks }: { asks: boolean }): Promise<void> {
    await this.presetAction('Apply', name).click()
    if (asks)
      await this.page
        .getByRole('dialog', { name: `Apply “${name}”?`, exact: true })
        .getByRole('button', { name: 'Apply', exact: true })
        .click()
    await expect(this.presetsStatus).toHaveText(`Applied ${name}.`)
  }
  /** "Export all": the downloaded file's name and text. */
  async exportPresets(): Promise<{ fileName: string; text: string }> {
    const download = this.page.waitForEvent('download')
    await this.presetsDialog.getByRole('button', { name: 'Export all', exact: true }).click()
    const d = await download
    const chunks: Buffer[] = []
    for await (const c of await d.createReadStream()) chunks.push(c as Buffer)
    return { fileName: d.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') }
  }
  /** "Import…" through the browser's file chooser (the dialog must be open). */
  async importPresets(
    file: string | { name: string; mimeType: string; buffer: Buffer },
  ): Promise<void> {
    const chooser = this.page.waitForEvent('filechooser')
    await this.presetsDialog.getByRole('button', { name: 'Import…', exact: true }).click()
    await (await chooser).setFiles(file)
  }

  // --- Guides from the photo (E3) ---
  /** The section labelled "Guides from the photo" in the open Lines panel or card. */
  get guidesSection(): Locator {
    return this.page.getByRole('region', { name: 'Guides from the photo', exact: true })
  }
  /** Opens the desktop Lines tab and waits for the guides section of the selected photo. */
  async openGuides(): Promise<void> {
    await this.openLinesTab()
    await expect(this.guidesSection).toBeVisible()
  }
  guideSwitch(kind: GuideKind): Locator {
    return this.guidesSection.getByRole('switch', { name: GUIDE_SWITCH_NAMES[kind], exact: true })
  }
  /** The guide's switch and everything shown under it (box, progress, status, alert). */
  guideGroup(kind: GuideKind): Locator {
    return this.guideSwitch(kind).locator('xpath=../..')
  }
  async setGuide(kind: GuideKind, on: boolean): Promise<void> {
    const s = this.guideSwitch(kind)
    if ((await s.getAttribute('aria-checked')) !== String(on)) await s.click()
    await expect(s).toHaveAttribute('aria-checked', String(on))
  }
  /** "Download & turn on" under a switched-on guide; waits until the download has ended. */
  async downloadModel(model: 'face' | 'pose', timeout = 120_000): Promise<void> {
    const group = this.guideGroup(model)
    await group.getByRole('button', { name: 'Download & turn on', exact: true }).click()
    await expect
      .poll(() => this.guideStatus(model), { timeout })
      .not.toMatch(/^(box|downloading|idle)$/)
  }
  get detailSlider(): Locator {
    return this.guidesSection.getByRole('slider', { name: 'Detail', exact: true })
  }
  /**
   * Native range input (fill fires input and change); the edge outline must be on. Returns once the
   * desktop Export is enabled again: it stays disabled from the change until the new outline is in
   * the pages (M4-R18).
   */
  async setDetail(pct: number): Promise<void> {
    await this.detailSlider.fill(String(pct))
    await expect(this.detailSlider).toHaveAttribute('aria-valuetext', `${String(pct)}%`)
    await expect(this.exportButton).toBeEnabled({ timeout: 60_000 })
  }
  /** What the guide shows now, read from its group's text (en locale). */
  async guideStatus(kind: GuideKind): Promise<GuideStatus> {
    const sw = this.guideSwitch(kind)
    if ((await sw.getAttribute('aria-checked')) !== 'true') return 'off'
    const group = this.guideGroup(kind)
    if ((await group.getByRole('progressbar').count()) > 0) return 'downloading'
    const text = (await group.innerText()).replace(/\s+/g, ' ')
    for (const [status, texts] of GUIDE_STATUS_TEXT)
      if (texts.some((t) => text.includes(t))) return status
    return 'idle'
  }
  /** Waits until the guide shows a settled state: found, none found, failed, unsupported or the box. */
  async expectGuideSettled(kind: GuideKind, timeout = 60_000): Promise<GuideStatus> {
    await expect
      .poll(() => this.guideStatus(kind), { timeout })
      .toMatch(/^(found|none|failed|download-failed|unsupported|box|off)$/)
    return this.guideStatus(kind)
  }
}

export type GuideKind = 'edges' | 'face' | 'pose'
export const GUIDE_SWITCH_NAMES: Readonly<Record<GuideKind, string>> = {
  edges: 'Edge outline',
  face: 'Face construction',
  pose: 'Body pose',
}
export type GuideStatus =
  | 'off'
  | 'idle'
  | 'box'
  | 'downloading'
  | 'running'
  | 'found'
  | 'none'
  | 'download-failed'
  | 'failed'
  | 'unsupported'

/** Text that identifies each state in the en locale (`lines.json`, `guides.*`), checked in this order. */
const GUIDE_STATUS_TEXT: readonly (readonly [GuideStatus, readonly string[]])[] = [
  ['unsupported', ['Face and pose guides need WebGL, which this browser has turned off.']],
  ['download-failed', ["Couldn't download the face model", "Couldn't download the pose model"]],
  [
    'failed',
    [
      "Couldn't trace the outline.",
      "Couldn't look for faces in this image",
      "Couldn't look for a person in this image",
    ],
  ],
  ['box', ['Download & turn on']],
  ['running', ['Tracing the outline…', 'Finding faces…', 'Finding the pose…']],
  [
    'found',
    ['Outline traced.', 'Face guides on. Brow, eye, nose and chin lines added.', 'Pose lines on.'],
  ],
  [
    'none',
    [
      'No edges found at this Detail. Try a higher Detail.',
      'No face found in this image.',
      'No person found in this image.',
    ],
  ],
]

// --- Preview settling (M5-R21) ---
interface SettleRect {
  left: number
  top: number
  right: number
  bottom: number
}
interface SettleElement {
  width: number
  parentElement: SettleElement | null
  getBoundingClientRect(): SettleRect
}
interface SettleWindow {
  innerWidth: number
  innerHeight: number
  document: {
    querySelector(sel: string): unknown
    querySelectorAll(sel: string): Iterable<SettleElement>
  }
  getComputedStyle(el: SettleElement): { overflowX: string; overflowY: string }
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
      if (c.width === 0 || c.height === 0)
        throw new Error('page canvas is released: show the page first')
      return Array.from(
        g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data,
      )
    },
    [fx, fy] as [number, number],
  )
}
