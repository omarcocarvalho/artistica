import { expect, test, type Locator, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'

// WCAG 2.5.7: the crop moves and resizes with single taps or clicks, no drag and no keyboard.

const THEMES = ['light', 'dark'] as const
const STEPS = [
  'Move left',
  'Move up',
  'Move down',
  'Move right',
  'Narrower',
  'Wider',
  'Shorter',
  'Taller',
] as const
type Step = (typeof STEPS)[number]

let guard: NetworkGuard | undefined

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

interface Crop {
  w: number
  h: number
  x: number
  y: number
}

async function openEdit(page: Page): Promise<{ app: AppPage; sheet: Locator }> {
  guard = guardNetwork(page)
  const app = new AppPage(page)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg])
  await app.expectImages(1)
  await app.editButton('quadrants.jpg').click()
  const sheet = page.getByRole('dialog')
  await expect(app.cropArea).toBeVisible()
  return { app, sheet }
}

async function readCrop(sheet: Locator): Promise<Crop> {
  const text = (await sheet.getByTestId('crop-readout').textContent()) ?? ''
  const m = /^Crop (\d+) × (\d+) px at (\d+), (\d+)$/.exec(text)
  if (!m) throw new Error(`unexpected crop readout: ${text}`)
  return { w: Number(m[1]), h: Number(m[2]), x: Number(m[3]), y: Number(m[4]) }
}

function stepButton(sheet: Locator, name: Step): Locator {
  return sheet
    .getByRole('group', { name: 'Crop position and size' })
    .getByRole('button', { name, exact: true })
}

async function expectTargets(sheet: Locator, min: number): Promise<void> {
  for (const name of STEPS) {
    const box = await stepButton(sheet, name).boundingBox()
    expect(box, name).not.toBeNull()
    expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(min)
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(min)
  }
}

/** quadrants.jpg is 64 x 48 px: one step is 1 px and the crop starts as the whole image. */
async function pressAll(
  sheet: Locator,
  press: (button: Locator, name: Step) => Promise<void>,
): Promise<Record<string, Crop>> {
  const seen: Record<string, Crop> = {}
  const run = async (name: Step, times: number) => {
    for (let i = 0; i < times; i++) await press(stepButton(sheet, name), name)
    seen[`${name} x${String(times)}`] = await readCrop(sheet)
  }
  await run('Narrower', 3)
  await run('Move right', 2)
  await run('Shorter', 4)
  await run('Move down', 1)
  await run('Wider', 1)
  await run('Taller', 2)
  await run('Move up', 1)
  await run('Move left', 1)
  return seen
}

const EXPECTED: Record<string, Crop> = {
  'Narrower x3': { w: 61, h: 48, x: 0, y: 0 },
  'Move right x2': { w: 61, h: 48, x: 2, y: 0 },
  'Shorter x4': { w: 61, h: 44, x: 2, y: 0 },
  'Move down x1': { w: 61, h: 44, x: 2, y: 1 },
  'Wider x1': { w: 62, h: 44, x: 2, y: 1 },
  'Taller x2': { w: 62, h: 46, x: 2, y: 1 },
  'Move up x1': { w: 62, h: 46, x: 2, y: 0 },
  'Move left x1': { w: 62, h: 46, x: 1, y: 0 },
}

test.describe('crop without dragging (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('C4-D1 clicks alone move and resize the crop, inside the image, with 24 px targets', async ({
    page,
  }) => {
    const { app, sheet } = await openEdit(page)
    await expectTargets(sheet, 24)
    expect(await readCrop(sheet)).toEqual({ w: 64, h: 48, x: 0, y: 0 })
    await stepButton(sheet, 'Move left').click()
    await stepButton(sheet, 'Taller').click()
    expect(await readCrop(sheet), 'a full crop stays put').toEqual({ w: 64, h: 48, x: 0, y: 0 })
    expect(await pressAll(sheet, (b) => b.click())).toEqual(EXPECTED)
    await expect(app.cropArea).not.toBeFocused()

    await sheet.getByRole('radio', { name: '1:1' }).click()
    const square = await readCrop(sheet)
    expect(square.w).toBe(square.h)
    await stepButton(sheet, 'Narrower').click()
    await stepButton(sheet, 'Narrower').click()
    const smaller = await readCrop(sheet)
    expect(smaller.w).toBe(square.w - 2)
    expect(smaller.h).toBe(smaller.w)
    await stepButton(sheet, 'Wider').click()
    const larger = await readCrop(sheet)
    expect(larger.w).toBe(smaller.w + 1)
    expect(larger.h).toBe(larger.w)

    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await app.expectPreviewPages(1)
  })

  test('C4-D2 the buttons give the same crop as the arrow keys', async ({ page }) => {
    const { app, sheet } = await openEdit(page)
    await sheet.getByRole('radio', { name: '4:3' }).click()
    await stepButton(sheet, 'Narrower').click()
    const byButtons = await pressAll(sheet, (b) => b.click())
    await sheet.getByRole('button', { name: 'Reset crop' }).click()
    await sheet.getByRole('radio', { name: '4:3' }).click()
    await app.cropArea.focus()
    await page.keyboard.press('Shift+ArrowLeft')
    const keyFor: Record<Step, string> = {
      'Move left': 'ArrowLeft',
      'Move up': 'ArrowUp',
      'Move down': 'ArrowDown',
      'Move right': 'ArrowRight',
      Narrower: 'Shift+ArrowLeft',
      Wider: 'Shift+ArrowRight',
      Shorter: 'Shift+ArrowUp',
      Taller: 'Shift+ArrowDown',
    }
    const byKeys = await pressAll(sheet, async (_button, name) => {
      await page.keyboard.press(keyFor[name])
    })
    expect(byKeys).toEqual(byButtons)
  })

  for (const scheme of THEMES) {
    test(`C4-D3 axe: the edit dialog with the crop controls (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const { sheet } = await openEdit(page)
      await stepButton(sheet, 'Narrower').click()
      await stepButton(sheet, 'Move right').focus()
      await expectNoAxeViolations(page)
    })
  }
})

test.describe('crop without dragging (phone)', () => {
  runOnly('mobile-chromium', 'mobile-webkit')

  test('C4-P1 taps alone move and resize the crop, with 44 px targets', async ({ page }) => {
    const { app, sheet } = await openEdit(page)
    await expectTargets(sheet, 44)
    expect(await pressAll(sheet, (b) => b.tap())).toEqual(EXPECTED)
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(app.imageRows).toHaveCount(1)
  })

  for (const scheme of THEMES) {
    test(`C4-P2 axe: the edit sheet with the crop controls (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const { sheet } = await openEdit(page)
      await stepButton(sheet, 'Shorter').tap()
      await expectNoAxeViolations(page)
    })
  }
})
