import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { mmToPt, summarizePdf } from './support/pdf.ts'
import { keysOutsideWhitelist, PRESET_FIXTURES } from './support/presets.ts'
import { runOnly } from './support/projects.ts'
import { expectNoFocusZoom, expectTouchTargets, settled } from './support/targets.ts'

let guards: NetworkGuard[] = []

/** Page object with the strict network guard installed before navigation (checked after each test). */
function startApp(page: Page): AppPage {
  guards.push(guardNetwork(page))
  return new AppPage(page)
}

test.afterEach(() => {
  for (const guard of guards) expect(guard.violations()).toEqual([])
  guards = []
})

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const PHOTO_NAMES = ['quadrants', 'value-ramp', 'portrait.jpg']

interface PresetFileJson {
  format: unknown
  version: unknown
  presets: { name: string }[]
}

/** Keyboard activation: WebKit does not focus a button on click, and focus return is for keyboard users. */
async function press(target: Locator): Promise<void> {
  await target.focus()
  await target.press('Enter')
}

/**
 * Letter, landscape, bleed 3 mm; Original + Values with 4 values on ultramarine; rule of thirds.
 * Set on the selected photo, which is what "Save current settings…" reads.
 */
async function setLetterValues(app: AppPage, photo: string): Promise<void> {
  await app.selectButton(photo).click()
  await app.openPageTab()
  await app.setPaper('Letter')
  await app.page.getByRole('radio', { name: 'Landscape', exact: true }).click()
  await app.setSwitch('Bleed', true)
  await app.openStudiesTab()
  await app.setVersions(['Original', 'Values'])
  await app.setSlider('Number of values', 4)
  await app.swatch('Ultramarine').click()
  await expect(app.swatch('Ultramarine')).toHaveAttribute('aria-pressed', 'true')
  await app.openLinesTab()
  await app.setLineSwitch('Rule of thirds', true)
}

/** Two presets saved with photos loaded: "Letter values" and "A5 plain". */
async function withTwoPresets(page: Page): Promise<AppPage> {
  const app = startApp(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.valueRamp, FIXTURES.portraitJpg])
  await app.expectImages(3)
  await setLetterValues(app, 'quadrants.jpg')
  await app.openPresets()
  await app.savePreset('Letter values')
  await app.closePresets()
  await app.openPageTab()
  await app.setPaper('A5')
  await app.setSwitch('Bleed', false)
  await app.openStudiesTab()
  await app.setVersions(['Original'])
  await app.openPresets()
  await app.savePreset('A5 plain')
  return app
}

/** Waits until the page has loaded its fonts and lazy chunks, so later requests are the test's own. */
async function untilQuiet(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } }).document
      .fonts.ready
  })
  await page.waitForLoadState('networkidle')
}

async function newApp(browser: Browser): Promise<AppPage> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const app = startApp(await context.newPage())
  await app.goto()
  return app
}

test.describe('desktop', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('P-D1 a saved preset survives a reload and applies to two new photos, in the preview and the PDF', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const app = startApp(page)
    await app.goto()
    await app.upload(FIXTURES.quadrantsJpg)
    await app.expectImages(1)
    await setLetterValues(app, 'quadrants.jpg')
    await app.openPresets()
    await app.savePreset('Letter values')
    await app.closePresets()

    page.on('dialog', (d) => void d.accept())
    await page.reload()
    await expect(app.imageRows).toHaveCount(0)
    // Undo what the remembered settings kept, so only the preset can bring it back.
    await app.setPaper('A4')
    await page.getByRole('radio', { name: 'Portrait', exact: true }).click()
    await app.setSwitch('Bleed', false)
    const photos = [FIXTURES.quadrantsPng, FIXTURES.valueRamp]
    await app.upload(photos)
    await app.expectImages(2)
    for (const photo of ['quadrants.png', 'value-ramp.png']) {
      await app.selectButton(photo).click()
      await app.openStudiesTab()
      await app.setVersions(['Original', 'Values'])
      await app.setSlider('Number of values', 7)
      await app.swatch('Sepia').click()
      await expect(app.swatch('Sepia')).toHaveAttribute('aria-pressed', 'true')
      await app.setVersions(['Original'])
    }

    await app.openPresets()
    expect(await app.presetNames()).toEqual(['Letter values'])
    await app.applyPreset('Letter values', { asks: true })
    await app.closePresets()

    await app.openPageTab()
    await expect(page.getByLabel('Paper size')).toHaveValue('Letter')
    await expect(page.getByRole('radio', { name: 'Landscape', exact: true })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Bleed' })).toBeChecked()
    for (const photo of ['quadrants.png', 'value-ramp.png']) {
      await app.selectButton(photo).click()
      await app.openStudiesTab()
      for (const [v, on] of [
        ['Original', 'true'],
        ['Blurred', 'false'],
        ['Values', 'true'],
        ['Blur + Values', 'false'],
      ] as const)
        await expect(app.versionChip(v)).toHaveAttribute('aria-pressed', on)
      await expect(app.studySlider('Number of values')).toHaveAttribute(
        'aria-valuetext',
        '4 values',
      )
      await expect(app.swatch('Ultramarine')).toHaveAttribute('aria-pressed', 'true')
      await app.openLinesTab()
      await expect(app.lineSwitch('Rule of thirds')).toHaveAttribute('aria-checked', 'true')
      await expect(app.studyTile(photo, 'Values')).toBeAttached()
    }

    await app.expectPreviewSettled()
    const info = await summarizePdf((await app.exportPdf()).bytes)
    for (const p of info.pages) {
      expect(p.widthPt).toBeCloseTo(mmToPt(279.4), 0)
      expect(p.heightPt).toBeCloseTo(mmToPt(215.9), 0)
    }
    expect(sum(info.pages.map((p) => p.imagePlacements))).toBe(2 * photos.length)
    expect(sum(info.pages.map((p) => p.lineStrokes.length))).toBeGreaterThan(0)
  })

  test('P-D2 "Export all" writes a presets file with whitelisted keys and nothing from the photos', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const app = await withTwoPresets(page)
    const { fileName, text } = await app.exportPresets()
    expect(fileName).toMatch(/^artistica-presets-\d{4}-\d{2}-\d{2}\.json$/)
    const file = JSON.parse(text) as PresetFileJson
    expect(Object.keys(file).sort()).toEqual(['format', 'presets', 'version'])
    expect(file.format).toBe('artistica-presets')
    expect(file.version).toBe(1)
    expect(file.presets.map((p) => p.name)).toEqual(['Letter values', 'A5 plain'])
    expect(keysOutsideWhitelist(file.presets)).toEqual([])
    for (const name of PHOTO_NAMES) expect(text).not.toContain(name)
  })

  test('P-D3 the exported file imports into a fresh browser, and again with renamed copies', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000)
    const app = await withTwoPresets(page)
    const exported = await app.exportPresets()

    const fresh = await newApp(browser)
    await fresh.openPresets()
    expect(await fresh.presetNames()).toEqual([])
    const upload = {
      name: exported.fileName,
      mimeType: 'application/json',
      buffer: Buffer.from(exported.text),
    }
    await fresh.importPresets(upload)
    await expect(fresh.presetsStatus).toHaveText('Imported 2 presets.')
    expect(await fresh.presetNames()).toEqual(['Letter values', 'A5 plain'])
    const again = await fresh.exportPresets()
    expect(again.text).toBe(exported.text)

    await fresh.importPresets(upload)
    await expect(fresh.presetsStatus).toHaveText(
      'Imported 2 presets.2 were renamed: Letter values → Letter values (2), A5 plain → A5 plain (2).',
    )
    expect(await fresh.presetNames()).toEqual([
      'Letter values',
      'A5 plain',
      'Letter values (2)',
      'A5 plain (2)',
    ])
    await fresh.page.context().close()
  })

  const ERRORS = [
    ['not JSON', PRESET_FIXTURES.notJson, "This file isn't a presets file from Artistica."],
    [
      'a settings envelope',
      PRESET_FIXTURES.settingsEnvelope,
      "This file isn't a presets file from Artistica.",
    ],
    [
      'version 2',
      PRESET_FIXTURES.version2,
      'This file was made by a newer version of Artistica. Update the page and try again.',
    ],
    ['a 70 KiB file', PRESET_FIXTURES.tooLarge, 'This file is too large to be a presets file.'],
  ] as const
  for (const [what, file, message] of ERRORS) {
    test(`P-D4 importing ${what} shows its message, adds nothing and makes no request`, async ({
      page,
    }) => {
      const app = startApp(page)
      await app.goto()
      await app.openPresets()
      await untilQuiet(page)
      const mark = guards[0]?.mark() ?? 0
      await app.importPresets(file)
      await expect(app.presetsAlert).toHaveText(message)
      await expect(app.presetsStatus).toHaveText('')
      expect(await app.presetNames()).toEqual([])
      expect(guards[0]?.requestsSince(mark)).toEqual([])
    })
  }

  test('P-D4 importing a file with one valid and one broken preset imports 1 and skips 1, with no request', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await app.openPresets()
    await untilQuiet(page)
    const mark = guards[0]?.mark() ?? 0
    await app.importPresets(PRESET_FIXTURES.oneBroken)
    await expect(app.presetsStatus).toHaveText("Imported 1 preset.1 was skipped: it wasn't valid.")
    await expect(app.presetsAlert).toHaveCount(0)
    expect(await app.presetNames()).toEqual(['Letter values'])
    expect(guards[0]?.requestsSince(mark)).toEqual([])
  })

  test('P-D6 two tabs: a preset saved in one tab shows in the other and survives a save there', async ({
    context,
  }) => {
    const a = startApp(await context.newPage())
    const b = startApp(await context.newPage())
    await a.goto()
    await b.goto()
    await b.openPresets()
    await a.openPresets()
    await a.savePreset('From tab A')
    await expect(b.presetAction('Apply', 'From tab A')).toBeVisible()
    await b.savePreset('From tab B')
    expect(await b.presetNames()).toEqual(['From tab A', 'From tab B'])
    await expect(a.presetAction('Apply', 'From tab B')).toBeVisible()
    await a.page.reload()
    await a.openPresets()
    expect(await a.presetNames()).toEqual(['From tab A', 'From tab B'])
  })
})

test.describe('keyboard and axe', () => {
  runOnly('chromium', 'webkit')
  test.use({ viewport: { width: 1280, height: 900 } })

  /** axe in light and in dark, ending on the scheme the test started with. */
  async function axeBothThemes(page: Page): Promise<void> {
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme })
      await expectNoAxeViolations(page)
    }
  }

  test('P-D5 keyboard only: open, save, rename, apply, delete, export, import; focus order and return; axe in every state', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(240_000)
    await page.emulateMedia({ colorScheme: 'light' })
    const app = startApp(page)
    await app.goto()
    await app.upload([FIXTURES.quadrantsJpg, FIXTURES.valueRamp])
    await app.expectImages(2)
    await app.expectPreviewSettled()
    const dialog = app.presetsDialog

    // Open: empty list with its hint.
    await press(app.presetsButton)
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(
      'Save your page setup, studies and lines under a name, then apply them in one go.',
    )
    await axeBothThemes(page)

    // Save: the name field takes focus; an empty name explains itself; Enter saves.
    await press(app.savePresetOpen)
    await expect(app.presetNameField).toBeFocused()
    await expect(dialog).toContainText('Give the preset a name.')
    await axeBothThemes(page)
    await page.keyboard.type('A4 value studies')
    await page.keyboard.press('Enter')
    await expect(app.presetsStatus).toHaveText('Saved A4 value studies.')
    await expect(app.savePresetOpen).toBeFocused()

    // A taken name: the clash and its choices; Cancel returns to the field.
    await press(app.savePresetOpen)
    await page.keyboard.type('a4 VALUE studies')
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('alert')).toContainText('A preset with this name exists.')
    await axeBothThemes(page)
    await press(dialog.getByRole('button', { name: 'Cancel', exact: true }))
    await expect(app.presetNameField).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(app.savePresetOpen).toBeFocused()

    await press(app.savePresetOpen)
    await page.keyboard.type('Second')
    await page.keyboard.press('Enter')
    await expect(app.presetsStatus).toHaveText('Saved Second.')
    expect(await app.presetNames()).toEqual(['A4 value studies', 'Second'])
    await axeBothThemes(page)

    // Focus order in a row: Apply, Rename, Delete, then the next row.
    await app.presetAction('Apply', 'A4 value studies').focus()
    for (const next of [
      app.presetAction('Rename', 'A4 value studies'),
      app.presetAction('Delete', 'A4 value studies'),
      app.presetAction('Apply', 'Second'),
    ]) {
      await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
      await expect(next).toBeFocused()
    }

    // Rename in place: Esc cancels without closing the dialog, Enter commits.
    await press(app.presetAction('Rename', 'Second'))
    const renameField = dialog.getByLabel('New name for Second', { exact: true })
    await expect(renameField).toBeFocused()
    await axeBothThemes(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(app.presetAction('Rename', 'Second')).toBeFocused()
    await press(app.presetAction('Rename', 'Second'))
    await renameField.press('ControlOrMeta+a')
    await page.keyboard.type('Thirds on Letter')
    await page.keyboard.press('Enter')
    await expect(app.presetsStatus).toHaveText('Renamed Second to Thirds on Letter.')
    await expect(app.presetAction('Rename', 'Thirds on Letter')).toBeFocused()

    // Apply with photos loaded asks first; Cancel returns to Apply.
    await press(app.presetAction('Apply', 'A4 value studies'))
    const ask = page.getByRole('dialog', { name: 'Apply “A4 value studies”?', exact: true })
    await expect(ask).toContainText(
      'It sets the page setup and the studies and lines of all 2 photos.',
    )
    await axeBothThemes(page)
    await press(ask.getByRole('button', { name: 'Cancel', exact: true }))
    await expect(ask).toHaveCount(0)
    await expect(app.presetAction('Apply', 'A4 value studies')).toBeFocused()
    await press(app.presetAction('Apply', 'A4 value studies'))
    await press(ask.getByRole('button', { name: 'Apply', exact: true }))
    await expect(ask).toHaveCount(0)
    await expect(app.presetsStatus).toHaveText('Applied A4 value studies.')
    await axeBothThemes(page)

    // Delete asks; focus then moves to the next row's Apply, and with no next row to Save.
    await press(app.presetAction('Delete', 'A4 value studies'))
    const del = page.getByRole('dialog', { name: 'Delete “A4 value studies”?', exact: true })
    await expect(del).toBeVisible()
    await axeBothThemes(page)
    await press(del.getByRole('button', { name: 'Delete', exact: true }))
    await expect(del).toHaveCount(0)
    await expect(app.presetsStatus).toHaveText('Deleted A4 value studies.')
    await expect(app.presetAction('Apply', 'Thirds on Letter')).toBeFocused()

    // Export by keyboard.
    const download = page.waitForEvent('download')
    await press(dialog.getByRole('button', { name: 'Export all', exact: true }))
    const exported = await download
    expect(exported.suggestedFilename()).toMatch(/^artistica-presets-\d{4}-\d{2}-\d{2}\.json$/)

    await press(app.presetAction('Delete', 'Thirds on Letter'))
    await press(
      page
        .getByRole('dialog', { name: 'Delete “Thirds on Letter”?', exact: true })
        .getByRole('button', { name: 'Delete', exact: true }),
    )
    await expect(app.savePresetOpen).toBeFocused()
    await expect(dialog.getByRole('button', { name: 'Export all', exact: true })).toBeDisabled()

    // Import by keyboard through the file chooser: success, then an error.
    let chooser = page.waitForEvent('filechooser')
    await press(dialog.getByRole('button', { name: 'Import…', exact: true }))
    await (await chooser).setFiles(PRESET_FIXTURES.oneBroken)
    await expect(app.presetsStatus).toHaveText("Imported 1 preset.1 was skipped: it wasn't valid.")
    await axeBothThemes(page)
    chooser = page.waitForEvent('filechooser')
    await press(dialog.getByRole('button', { name: 'Import…', exact: true }))
    await (await chooser).setFiles(PRESET_FIXTURES.version2)
    await expect(app.presetsAlert).toHaveText(
      'This file was made by a newer version of Artistica. Update the page and try again.',
    )
    await axeBothThemes(page)

    // Close: focus returns to Presets.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(app.presetsButton).toBeFocused()

    // While a photo imports, Apply waits with its reason (an import held at the network).
    const link = 'https://photos.example/held.jpg'
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(link, async (route) => {
      await held
      await route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        headers: { 'access-control-allow-origin': '*' },
        body: readFileSync(FIXTURES.quadrantsJpg),
      })
    })
    guards[0]?.allowExternal(link)
    await app.submitLink(link)
    await press(app.presetsButton)
    const apply = app.presetAction('Apply', 'Letter values')
    await expect(apply).toHaveAttribute('aria-disabled', 'true')
    await expect(apply).toHaveAccessibleDescription('Waiting for photos to finish importing…')
    await axeBothThemes(page)
    await press(apply)
    await expect(page.getByRole('dialog', { name: 'Apply “Letter values”?' })).toHaveCount(0)
    release()
    await expect(apply).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 })
    await page.keyboard.press('Escape')
    await expect(app.presetsButton).toBeFocused()
    await app.expectImages(3)
  })
})

test.describe('phone', () => {
  runOnly('mobile-chromium', 'mobile-webkit')

  test('P-P1 the Presets bottom sheet: 44 px targets, a 16 px name field, apply from the Images step, axe', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const app = startApp(page)
    await app.goto()
    await expect(page.getByRole('region', { name: 'Step 1 of 5: Images' })).toBeVisible()

    await app.openPresets()
    const sheet = app.presetsDialog
    await settled(sheet)
    const box = await sheet.boundingBox()
    const viewportHeight = page.viewportSize()?.height ?? 0
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(viewportHeight - 40)
    await expectNoAxeViolations(page)

    await app.importPresets(PRESET_FIXTURES.letterValues)
    await expect(app.presetsStatus).toHaveText('Imported 1 preset.')
    await expectTouchTargets([
      sheet.getByRole('button', { name: 'Close', exact: true }),
      app.savePresetOpen,
      app.presetAction('Apply', 'Letter values'),
      app.presetAction('Rename', 'Letter values'),
      app.presetAction('Delete', 'Letter values'),
      sheet.getByRole('button', { name: 'Import…', exact: true }),
      sheet.getByRole('button', { name: 'Export all', exact: true }),
    ])
    await expectNoAxeViolations(page)

    await app.savePresetOpen.click()
    await expectNoFocusZoom([app.presetNameField])
    await expectTouchTargets([
      sheet.getByRole('button', { name: 'Save', exact: true }),
      sheet.getByRole('button', { name: 'Cancel', exact: true }),
    ])
    await expectNoAxeViolations(page)
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()

    // Applied before any photo: no question; photos added afterwards start with the preset.
    await app.applyPreset('Letter values', { asks: false })
    await expectNoAxeViolations(page)
    await app.closePresets()
    await expect(page.getByRole('region', { name: 'Step 1 of 5: Images' })).toBeVisible()
    await app.upload([FIXTURES.quadrantsJpg, FIXTURES.valueRamp])
    await app.expectImages(2)

    await app.goToStep('Page')
    await expect(page.getByLabel('Paper size')).toHaveValue('Letter')
    await expect(page.getByRole('radio', { name: 'Landscape', exact: true })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Bleed' })).toBeChecked()
    await app.goToStep('Studies')
    for (const photo of ['quadrants.jpg', 'value-ramp.png']) {
      await app.pickStudiesImage(photo)
      await expect(app.versionChip('Values')).toHaveAttribute('aria-pressed', 'true')
      await expect(app.versionChip('Original')).toHaveAttribute('aria-pressed', 'true')
      await expect(app.lineSwitch('Rule of thirds')).toHaveAttribute('aria-checked', 'true')
    }
  })
})
