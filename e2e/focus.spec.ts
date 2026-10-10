import { expect, test, type Locator, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'

interface ElementLike {
  readonly parentElement: ElementLike | null
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
}
declare const document: {
  querySelector(selector: string): ElementLike | null
  elementFromPoint(x: number, y: number): ElementLike | null
}

let guard: NetworkGuard | undefined

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

/** Three images named a.jpg, b.jpg and c.jpg, in that order. */
async function withThree(page: Page): Promise<AppPage> {
  guard = guardNetwork(page)
  const app = new AppPage(page)
  await app.goto()
  for (const name of ['a.jpg', 'b.jpg', 'c.jpg']) {
    await app.upload({ name, mimeType: 'image/jpeg', buffer: await readFixture() })
    await expect(app.selectButton(name)).toBeVisible({ timeout: 30_000 })
  }
  await app.expectImages(3)
  return app
}

async function withFiles(page: Page, files: string[]): Promise<AppPage> {
  guard = guardNetwork(page)
  const app = new AppPage(page)
  await app.goto()
  await app.upload(files)
  await app.expectImages(files.length)
  return app
}

async function readFixture(): Promise<Buffer> {
  const { readFile } = await import('node:fs/promises')
  return readFile(FIXTURES.quadrantsJpg)
}

/** Keyboard activation: WebKit does not focus a button on click, and focus return is for keyboard users. */
async function press(target: Locator): Promise<void> {
  await target.focus()
  await target.press('Enter')
}

function uploadIn(scope: Locator): Locator {
  return scope.getByRole('button', { name: 'Upload', exact: true })
}

test.describe('desktop', () => {
  runOnly('chromium', 'firefox', 'webkit')

  test('closing the export dialog returns focus to Export PDF', async ({ page }) => {
    const app = await withFiles(page, [FIXTURES.quadrantsJpg])
    await app.expectPreviewPages(1)
    const dialog = page.getByRole('dialog', { name: 'Export PDF' })

    await press(app.exportButton)
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(app.exportButton).toBeFocused()

    await press(app.exportButton)
    await press(dialog.getByRole('button', { name: 'Close' }))
    await expect(dialog).toHaveCount(0)
    await expect(app.exportButton).toBeFocused()
  })

  test('closing the edit sheet returns focus to its Edit button', async ({ page }) => {
    const app = await withThree(page)
    const dialog = page.getByRole('dialog', { name: 'b.jpg' })

    await press(app.editButton('b.jpg'))
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(app.editButton('b.jpg')).toBeFocused()

    await press(app.editButton('b.jpg'))
    await press(dialog.getByRole('button', { name: 'Done' }))
    await expect(dialog).toHaveCount(0)
    await expect(app.editButton('b.jpg')).toBeFocused()
  })

  test('cancelling Remove all returns focus to Remove all images', async ({ page }) => {
    await withThree(page)
    const removeAll = page.getByRole('button', { name: 'Remove all images' })
    await press(removeAll)
    const dialog = page.getByRole('dialog', { name: 'Remove all images?' })
    await press(dialog.getByRole('button', { name: 'Cancel' }))
    await expect(dialog).toHaveCount(0)
    await expect(removeAll).toBeFocused()
  })

  test('row Remove focuses the next row, then the previous one, then Upload', async ({ page }) => {
    const app = await withThree(page)
    const panel = page.locator('[data-images-panel]')
    await press(app.removeButton('b.jpg'))
    await expect(app.removeButton('c.jpg')).toBeFocused()
    await press(app.removeButton('c.jpg'))
    await expect(app.removeButton('a.jpg')).toBeFocused()
    await press(app.removeButton('a.jpg'))
    await app.expectImages(0)
    await expect(uploadIn(panel)).toBeFocused()
  })

  test('Remove in the edit sheet focuses the next row Edit button, then Upload', async ({
    page,
  }) => {
    const app = await withThree(page)
    const removeInSheet = async (name: string) => {
      await press(app.editButton(name))
      await press(page.getByRole('dialog', { name }).getByRole('button', { name: 'Remove image' }))
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await removeInSheet('a.jpg')
    await expect(app.editButton('b.jpg')).toBeFocused()
    await removeInSheet('c.jpg')
    await expect(app.editButton('b.jpg')).toBeFocused()
    await removeInSheet('b.jpg')
    await expect(uploadIn(page.locator('[data-images-panel]'))).toBeFocused()
  })

  test('confirming Remove all focuses Upload', async ({ page }) => {
    await withThree(page)
    await press(page.getByRole('button', { name: 'Remove all images' }))
    await press(
      page
        .getByRole('dialog', { name: 'Remove all images?' })
        .getByRole('button', { name: 'Remove all' }),
    )
    await expect(uploadIn(page.locator('[data-images-panel]'))).toBeFocused()
  })
})

test.describe('export focus and axe (chromium)', () => {
  runOnly('chromium')

  test('focus follows the export steps; running and done pass axe', async ({ page }) => {
    test.setTimeout(150_000)
    // Many small pages keep the export running long enough to inspect it.
    const app = await withFiles(page, Array<string>(24).fill(FIXTURES.quadrantsJpg))
    await app.setPaper('A6')
    await app.expectPreviewPages(4)
    await press(app.exportButton)
    const dialog = page.getByRole('dialog', { name: 'Export PDF' })
    const create = dialog.getByRole('button', { name: 'Create PDF' })
    const cancel = dialog.getByRole('button', { name: 'Cancel' })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 })

    await press(create)
    await expect(cancel).toBeFocused()
    await expect(dialog.getByRole('status')).toHaveText(/^Page \d+ of \d+/)
    await expectNoAxeViolations(page)
    await cancel.dispatchEvent('click')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await expect(create).toBeFocused()

    await press(create)
    const download = dialog.getByRole('link', { name: 'Download PDF' })
    await expect(download).toBeFocused({ timeout: 120_000 })
    await expect(dialog.getByRole('status')).toHaveText('Your PDF is ready')
    await expectNoAxeViolations(page)
    await press(dialog.getByRole('button', { name: 'Make another' }))
    await expect(create).toBeFocused()
  })
})

test.describe('phone', () => {
  runOnly('mobile-chromium')

  test('closing the edit sheet returns focus to the opener; the inline export moves focus to Download', async ({
    page,
  }) => {
    const app = await withFiles(page, [FIXTURES.quadrantsJpg])
    await press(app.editButton('quadrants.jpg'))
    const sheet = page.getByRole('dialog', { name: 'quadrants.jpg' })
    await press(sheet.getByRole('button', { name: 'Done' }))
    await expect(sheet).toHaveCount(0)
    await expect(app.editButton('quadrants.jpg')).toBeFocused()

    await app.goToStep('Export')
    const create = page.getByRole('main').getByRole('button', { name: 'Create PDF' })
    // Create PDF is aria-disabled until the layout after the import is done; a press before that does nothing.
    await expect(create).not.toHaveAttribute('aria-disabled')
    await press(create)
    await expect(app.exportStep.getByRole('link', { name: 'Download PDF' })).toBeFocused({
      timeout: 60_000,
    })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await press(app.exportStep.getByRole('button', { name: 'Make another' }))
    await expect(create).toBeFocused()
  })

  test('removing the last image focuses Upload in the empty state', async ({ page }) => {
    const app = await withThree(page)
    await press(app.removeButton('c.jpg'))
    await expect(app.removeButton('b.jpg')).toBeFocused()
    await press(app.removeButton('b.jpg'))
    await expect(app.removeButton('a.jpg')).toBeFocused()

    await press(app.editButton('a.jpg'))
    await press(
      page.getByRole('dialog', { name: 'a.jpg' }).getByRole('button', { name: 'Remove image' }),
    )
    await app.expectImages(0)
    await expect(uploadIn(page.getByRole('main'))).toBeFocused()
  })

  test('confirming Remove all focuses Upload in the empty state', async ({ page }) => {
    await withThree(page)
    await press(page.getByRole('button', { name: 'Remove all images' }))
    await press(
      page
        .getByRole('dialog', { name: 'Remove all images?' })
        .getByRole('button', { name: 'Remove all' }),
    )
    await expect(uploadIn(page.getByRole('main'))).toBeFocused()
  })

  test('crop corner handles keep their whole hit area at the default crop', async ({ page }) => {
    const app = await withFiles(page, [FIXTURES.quadrantsJpg])
    await press(app.editButton('quadrants.jpg'))
    await expect(app.cropArea).toBeVisible()
    for (const corner of ['nw', 'ne', 'se', 'sw']) {
      const selector = `[data-handle="${corner}"]`
      await page.locator(selector).scrollIntoViewIfNeeded()
      const misses = await page.evaluate((sel) => {
        const handle = document.querySelector(sel)
        if (!handle) return ['missing']
        const r = handle.getBoundingClientRect()
        const out: string[] = []
        for (const fx of [0.1, 0.5, 0.9]) {
          for (const fy of [0.1, 0.5, 0.9]) {
            let hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy)
            while (hit && hit !== handle) hit = hit.parentElement
            if (!hit) out.push(`${String(fx)},${String(fy)}`)
          }
        }
        return out
      }, selector)
      expect(misses, `${corner} handle points not hit`).toEqual([])
    }
  })
})
