import { expect, test, type Locator, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'
import { centre, MIN_TOUCH_TARGET_PX, paintStyle, settled, targetSize } from './support/targets.ts'

// The e2e tsconfig has no DOM lib; these are the few browser globals used inside page.evaluate.
interface DataTransferLike {
  setData(type: string, value: string): void
}
interface ClipboardEventLike {
  readonly clipboardData: DataTransferLike | null
}
declare const DataTransfer: new () => DataTransferLike
declare const ClipboardEvent: new (
  type: string,
  init: { clipboardData?: DataTransferLike; bubbles?: boolean; cancelable?: boolean },
) => ClipboardEventLike
declare const document: { body: { dispatchEvent(e: ClipboardEventLike): boolean } }

const THEMES = ['light', 'dark'] as const
const FILES = [FIXTURES.quadrantsJpg, FIXTURES.quadrantsExif6]

let guard: NetworkGuard | undefined

/** Page object with the strict network guard installed before navigation (checked after each test). */
function startApp(page: Page): AppPage {
  guard = guardNetwork(page)
  return new AppPage(page)
}

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

async function loaded(page: Page): Promise<AppPage> {
  const app = startApp(page)
  await app.goto()
  await app.upload(FILES)
  await app.expectImages(2)
  await app.expectPreviewPages(1)
  return app
}

// The loaded desktop workspace is the screen most likely to differ per engine.
test.describe('desktop, images loaded', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 900 } })

  for (const scheme of THEMES) {
    test(`workspace with a selected image is axe-clean (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const app = await loaded(page)
      await app.selectButton('quadrants.jpg').click()
      await expect(app.tile('quadrants.jpg')).toHaveAttribute('aria-pressed', 'true')
      await expectNoAxeViolations(page)
    })
  }

  test('forcing dark with the toggle while the OS is light is axe-clean', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await loaded(page)
    const toggle = page.getByRole('button', { name: /change theme/i })
    await toggle.click() // light
    await toggle.click() // dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expectNoAxeViolations(page)
  })
})

test.describe('desktop Studies tab (chromium)', () => {
  runOnly('chromium')
  test.use({ viewport: { width: 1280, height: 900 } })

  for (const scheme of THEMES) {
    test(`Studies tab: no photo, a study group applied to all, a locked chip (${scheme})`, async ({
      page,
    }) => {
      test.setTimeout(60_000)
      await page.emulateMedia({ colorScheme: scheme })
      const app = startApp(page)
      await app.goto()
      await app.openStudiesTab()
      await expect(
        app.studiesPanel.getByText('Add a photo, or select one, to set up its studies.'),
      ).toBeVisible()
      await expectNoAxeViolations(page)

      await app.upload(FILES)
      await app.expectImages(2)
      await app.setVersions(['Original', 'Blurred', 'Values'])
      await app.applyStudiesToAll()
      await expect(
        page.getByRole('status').filter({ hasText: 'Study settings copied to 1 image.' }),
      ).toBeAttached()
      await expect(app.studyTile('quadrants-exif6.jpg', 'Values')).toBeVisible()
      await app.expectPreviewSettled()
      await expectNoAxeViolations(page)

      await app.setVersions(['Values'])
      await expect(app.versionChip('Values')).toHaveAttribute('aria-disabled', 'true')
      await expect(app.studiesPanel.getByText('At least one version prints.')).toBeVisible()
      await app.expectPreviewSettled()
      await expectNoAxeViolations(page)
    })
  }
})

// Dialogs, notices and the custom-paper fields are plain DOM: one engine is enough.
test.describe('dialogs and notices (chromium)', () => {
  runOnly('chromium')
  test.use({ viewport: { width: 1280, height: 900 } })

  for (const scheme of THEMES) {
    test(`edit dialog (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const app = await loaded(page)
      await app.editButton('quadrants.jpg').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(app.cropArea).toBeVisible()
      await expectNoAxeViolations(page)
    })

    test(`export dialog: summary and done (${scheme})`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.emulateMedia({ colorScheme: scheme })
      const app = await loaded(page)
      await app.exportButton.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expectNoAxeViolations(page)
      await dialog.getByRole('button', { name: /create pdf/i }).click()
      await expect(dialog.getByRole('link', { name: /download pdf/i })).toBeVisible({
        timeout: 60_000,
      })
      await expectNoAxeViolations(page)
    })

    test(`import error callout, paste notice and page-setup note (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const app = startApp(page)
      await app.goto()
      await app.upload(FIXTURES.notesPdf)
      await expect(page.getByRole('alert')).toContainText('notes.pdf')
      await page.evaluate(() => {
        const dt = new DataTransfer()
        dt.setData('text/plain', 'hello')
        document.body.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
        )
      })
      await expect(app.notices.getByRole('status')).toContainText('No image on the clipboard')
      await app.setSwitch('Gutter between images', false)
      await app.setSwitch('Bleed', true)
      await expect(page.getByRole('status').filter({ hasText: 'Gutter turned on' })).toBeVisible()
      await expectNoAxeViolations(page)
    })

    test(`custom paper fields (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const app = startApp(page)
      await app.goto()
      await app.setPaper('Custom…')
      await expect(page.getByLabel('Width', { exact: true })).toBeVisible()
      await expectNoAxeViolations(page)
    })
  }
})

test.describe('phone steps (mobile-chromium)', () => {
  runOnly('mobile-chromium')

  for (const scheme of THEMES) {
    test(`all steps and the edit sheet (${scheme})`, async ({ page }) => {
      test.setTimeout(60_000)
      await page.emulateMedia({ colorScheme: scheme })
      const app = startApp(page)
      await app.goto()
      await app.upload(FILES)
      await app.expectImages(2)
      await expectNoAxeViolations(page)
      await app.editButton('quadrants.jpg').click()
      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()
      await expectNoAxeViolations(page)
      await sheet.getByRole('button', { name: 'Done' }).click()
      await expect(sheet).toHaveCount(0)
      for (const step of ['Page', 'Studies', 'Preview', 'Export'] as const) {
        await app.goToStep(step)
        await expect(page.getByRole('heading', { level: 2, name: step, exact: true })).toBeVisible()
        if (step === 'Preview') await app.expectPreviewPages(1)
        await expectNoAxeViolations(page)
      }
    })

    test(`Studies step with a study group, its preview and the edit sheet (${scheme})`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      await page.emulateMedia({ colorScheme: scheme })
      const app = startApp(page)
      await app.goto()
      await app.upload(FILES)
      await app.expectImages(2)
      await app.goToStep('Studies')
      await app.pickStudiesImage('quadrants.jpg')
      await app.setVersions(['Original', 'Values'])
      await expect(app.versionChip('Values')).toHaveAttribute('aria-pressed', 'true')
      await expectNoAxeViolations(page)
      await app.setVersions(['Values'])
      await expect(app.versionChip('Values')).toHaveAttribute('aria-disabled', 'true')
      await expectNoAxeViolations(page)
      await app.setVersions(['Original', 'Values'])
      await app.goToStep('Preview')
      await expect(app.studyTile('quadrants.jpg', 'Values')).toBeAttached()
      await app.expectPreviewSettled()
      await expectNoAxeViolations(page)
      await app.goToStep('Images')
      await app.editButton('quadrants.jpg').click()
      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()
      await expectNoAxeViolations(page)
    })
  }
})

test.describe('desktop control density (chromium)', () => {
  runOnly('chromium')

  const measure = async (target: Locator) => {
    await centre(target)
    return targetSize(target)
  }
  const box = async (target: Locator) => {
    const { box } = await measure(target)
    return [box.width, box.height].map(Math.round)
  }
  const fontSize = async (target: Locator) => (await paintStyle(target)).fontSizePx
  const heights = async (targets: readonly Locator[]) =>
    Promise.all(targets.map(async (t) => (await box(t))[1]))

  test('Page and edit-sheet form controls keep their dense desktop sizes', async ({ page }) => {
    const app = startApp(page)
    await app.goto()
    await app.upload([FIXTURES.quadrantsJpg])
    await app.expectImages(1)
    await app.setPaper('Custom…')
    await app.setSwitch('Gutter between images', true)
    await app.setSwitch('Bleed', true)
    const fields = ['Paper size', 'Width', 'Height', 'Safe area', 'Gutter size', 'Bleed amount']
    expect(await heights(fields.map((f) => page.getByLabel(f, { exact: true })))).toEqual(
      fields.map(() => 35),
    )
    const segItems = [
      ...(await page.getByRole('radiogroup', { name: 'Units' }).getByRole('radio').all()),
      ...(await page.getByRole('radiogroup', { name: 'Orientation' }).getByRole('radio').all()),
    ]
    expect(await heights(segItems)).toEqual([28, 28, 28, 28, 28])
    const switches = await page.getByRole('switch').all()
    expect(switches.length).toBeGreaterThanOrEqual(4)
    for (const sw of switches) {
      const { box, hit } = await measure(sw)
      expect([box.width, box.height].map(Math.round)).toEqual([42, 24])
      expect(Math.max(hit.width, hit.height)).toBeLessThan(MIN_TOUCH_TARGET_PX)
    }

    await app.editButton('quadrants.jpg').click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await settled(sheet)
    await sheet.getByRole('radio', { name: 'Fixed' }).click()
    const aspects = await sheet.getByRole('group', { name: 'Crop shape' }).getByRole('radio').all()
    expect(aspects).toHaveLength(6)
    expect(await heights(aspects)).toEqual(aspects.map(() => 36))
    expect(
      await heights(
        ['Auto', 'Fixed', 'Width', 'Height'].map((name) =>
          sheet.getByRole('radio', { name, exact: true }),
        ),
      ),
    ).toEqual([28, 28, 28, 28])
    for (const name of ['Fewer copies', 'More copies'])
      expect(await box(sheet.getByRole('button', { name }))).toEqual([40, 40])
    expect(
      await heights([
        sheet.getByRole('spinbutton', { name: 'Copies' }),
        sheet.getByRole('spinbutton', { name: 'Width' }),
      ]),
    ).toEqual([40, 35])
  })

  test('desktop text controls keep their 14 px text and the link field its 40 px height', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await app.upload([FIXTURES.quadrantsJpg])
    await app.expectImages(1)
    const link = await app.openLinkField()
    expect((await box(link))[1]).toBe(40)
    const fields = ['Paper size', 'Safe area'].map((f) => page.getByLabel(f, { exact: true }))
    expect(await Promise.all(fields.map(fontSize))).toEqual([14, 14])
  })
})
