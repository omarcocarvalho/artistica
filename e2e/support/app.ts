import { expect, type Locator, type Page } from '@playwright/test'
import type { UploadFile } from './synthetic.ts'

type Upload = string | string[] | UploadFile | UploadFile[]

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
  stepTab(name: 'Images' | 'Page' | 'Preview' | 'Export'): Locator {
    return this.stepBar.getByRole('button', { name, exact: true })
  }
  async goToStep(name: 'Images' | 'Page' | 'Preview' | 'Export'): Promise<void> {
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
}
