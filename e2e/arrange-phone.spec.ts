import { expect, test, type Locator, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { summarizePdf } from './support/pdf.ts'
import { runOnly } from './support/projects.ts'
import { expectTouchTargets } from './support/targets.ts'
import { PT_PER_MM } from '../src/shared/model/units.ts'

runOnly('mobile-chromium', 'mobile-webkit')

// The e2e tsconfig has no DOM lib; these are the few browser globals used inside evaluate.
interface El {
  readonly dataset: Record<string, string | undefined>
  readonly style: Record<string, string>
  readonly parentElement: El | null
  scrollLeft: number
  dispatchEvent(event: unknown): boolean
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
}
declare const document: {
  querySelectorAll(selector: string): ArrayLike<El>
  querySelector(selector: string): El | null
}
declare const PointerEvent: new (type: string, init: Record<string, unknown>) => unknown
declare function getSelection(): { toString(): string } | null
declare function getComputedStyle(el: El): Record<string, string | undefined> & {
  getPropertyValue(name: string): string
}
declare function setTimeout(fn: () => void, ms: number): unknown

let guard: NetworkGuard | undefined

function startApp(page: Page): AppPage {
  guard = guardNetwork(page)
  return new AppPage(page)
}

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

const PHOTOS = [FIXTURES.quadrantsJpg, FIXTURES.portraitJpg]
const NAMES = ['quadrants.jpg', 'portrait.jpg'] as const

const bar = (page: Page) => page.getByRole('group', { name: 'Arrange photos' })
const blockOf = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')}, `) })
const carousel = (page: Page) => page.locator('main .snap-x')
const sheet = (page: Page) => page.getByRole('dialog')

async function openArranging(page: Page): Promise<AppPage> {
  const app = startApp(page)
  await app.goto()
  await app.upload(PHOTOS)
  await app.expectImages(PHOTOS.length)
  await app.goToStep('Preview')
  await app.expectPreviewPages(1)
  await bar(page).getByRole('button', { name: 'Arrange' }).click()
  await expect(bar(page).getByRole('button', { name: 'Arrange' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('[data-block-id]')).toHaveCount(PHOTOS.length)
  return app
}

async function openOptions(page: Page, name: string): Promise<Locator> {
  await blockOf(page, name).tap()
  await bar(page).getByRole('button', { name: 'Photo options' }).click()
  const s = page.getByRole('dialog', { name })
  await expect(s).toBeVisible()
  return s
}

async function done(page: Page): Promise<void> {
  await sheet(page).getByRole('button', { name: 'Done' }).click()
  await expect(sheet(page)).toHaveCount(0)
}

/** Each block's trim box as a fraction of the page, and the index of the page it is on. */
interface BlockBox {
  readonly id: string
  readonly page: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}
async function blockBoxes(page: Page): Promise<BlockBox[]> {
  return page.evaluate(() => {
    const layers = Array.from(document.querySelectorAll('.arrange-layer'))
    return Array.from(document.querySelectorAll('[data-block-id]')).map((el) => {
      const f = (v: string | undefined) => Number.parseFloat(v ?? '') / 100
      return {
        id: el.dataset.blockId ?? '',
        page: el.parentElement ? layers.indexOf(el.parentElement) : -1,
        x: f(el.style.left),
        y: f(el.style.top),
        w: f(el.style.width),
        h: f(el.style.height),
      }
    })
  })
}

const centreOf = async (target: Locator) => {
  const b = await target.boundingBox()
  if (!b) throw new Error('not visible')
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

interface Point {
  readonly x: number
  readonly y: number
}

/**
 * A finger drag from `from` to `to`: real touch events through CDP on Chromium; on WebKit, pointer
 * events with `pointerType: 'touch'` dispatched on the element under the finger.
 */
async function touchDrag(page: Page, from: Point, to: Point, steps = 12): Promise<void> {
  const points = Array.from({ length: steps }, (_, i) => ({
    x: from.x + ((to.x - from.x) * (i + 1)) / steps,
    y: from.y + ((to.y - from.y) * (i + 1)) / steps,
  }))
  if (test.info().project.name === 'mobile-chromium') {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
    for (const p of points) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    return
  }
  await page.evaluate(
    async ({ from, points }) => {
      const at = (p: { x: number; y: number }) => {
        const all = document.querySelectorAll('[data-block-id]')
        for (const el of Array.from(all)) {
          const r = el.getBoundingClientRect()
          if (p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height)
            return el
        }
        return document.querySelector('main')
      }
      const target = at(from)
      if (!target) throw new Error('nothing under the finger')
      const fire = (type: string, p: { x: number; y: number }) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 11,
            pointerType: 'touch',
            isPrimary: true,
            button: type === 'pointermove' ? -1 : 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: p.x,
            clientY: p.y,
          }),
        )
      const frame = () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 16)
        })
      fire('pointerdown', from)
      await frame()
      for (const p of points) {
        fire('pointermove', p)
        await frame()
      }
      fire('pointerup', points.at(-1) ?? from)
    },
    { from, points },
  )
}

test.describe('Arrange on the phone (B5)', () => {
  test('B-P1 a touch drag moves a photo, the carousel stays on its page, and the PDF matches the preview', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const app = await openArranging(page)

    let options = await openOptions(page, NAMES[1])
    await options.getByRole('combobox', { name: 'Move to page' }).selectOption('New page')
    await expect(options).toHaveAccessibleDescription(/, page 2 of 2$/)
    await done(page)
    await expect(app.pageFigures).toHaveCount(2)
    await app.showPage(0)
    const scrollLeft = () => carousel(page).evaluate((el: El) => el.scrollLeft)
    let start = await scrollLeft()
    await expect
      .poll(async () => {
        const prev = start
        start = await scrollLeft()
        return start === prev
      })
      .toBe(true)

    const block = blockOf(page, NAMES[0])
    await expect(block).toBeInViewport()
    const before = (await blockBoxes(page)).find((b) => b.page === 0)
    if (!before) throw new Error('no block on page 1')
    const sheetBox = await page.locator('.arrange-layer').first().boundingBox()
    if (!sheetBox) throw new Error('no sheet')
    const room = { right: 1 - (before.x + before.w), down: 1 - (before.y + before.h) }
    const down = room.down >= room.right
    const shift = (down ? room.down : room.right) * 0.5
    const from = await centreOf(block)
    const to = down
      ? { x: from.x, y: from.y + shift * sheetBox.height }
      : { x: from.x + shift * sheetBox.width, y: from.y }
    await touchDrag(page, from, to)

    await expect
      .poll(async () => {
        const now = (await blockBoxes(page)).find((b) => b.id === before.id)
        return now ? (down ? now.y - before.y : now.x - before.x) : 0
      })
      .toBeGreaterThan(shift * 0.5)
    expect(await scrollLeft()).toBe(start)
    options = await openOptions(page, NAMES[0])
    await expect(options).toHaveAccessibleDescription(/, page 1 of 2$/)
    await done(page)

    if (test.info().project.name === 'mobile-chromium') {
      const gap = { x: sheetBox.x + 4, y: sheetBox.y + 4 }
      await touchDrag(page, gap, { x: gap.x - 250, y: gap.y })
      await expect.poll(scrollLeft).toBeGreaterThan(start + 100)
    }

    const boxes = await blockBoxes(page)
    await app.goToStep('Export')
    const { bytes } = await app.exportPdf('step')
    const pdf = await summarizePdf(bytes)
    expect(pdf.pageCount).toBe(2)
    for (const b of boxes) {
      const p = pdf.pages.at(b.page)
      if (!p) throw new Error(`no PDF page ${String(b.page)}`)
      const pageW = p.widthPt / PT_PER_MM
      const pageH = p.heightPt / PT_PER_MM
      const want = { x: b.x * pageW, y: b.y * pageH, w: b.w * pageW, h: b.h * pageH }
      const drawn = p.draws.map((d) => ({
        x: d.xPt / PT_PER_MM,
        y: pageH - (d.yPt + d.hPt) / PT_PER_MM,
        w: d.wPt / PT_PER_MM,
        h: d.hPt / PT_PER_MM,
      }))
      expect(p.draws).toHaveLength(1)
      const d = drawn.at(0)
      if (!d) throw new Error('no image drawn')
      expect(d.x).toBeCloseTo(want.x, 2)
      expect(d.y).toBeCloseTo(want.y, 2)
      expect(d.w).toBeCloseTo(want.w, 2)
      expect(d.h).toBeCloseTo(want.h, 2)
    }
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`B-P2 controls and handles are at least 44 x 44 px, and Arrange mode is axe-clean (${colorScheme})`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await page.emulateMedia({ colorScheme })
      await openArranging(page)
      await blockOf(page, NAMES[0]).tap()
      await expect(blockOf(page, NAMES[0])).toHaveClass(/is-selected/)
      const handles = blockOf(page, NAMES[0]).locator('.arrange-handle')
      await expect(handles).toHaveCount(4)
      await expectTouchTargets([
        bar(page).getByRole('button', { name: 'Arrange' }),
        bar(page).getByRole('button', { name: 'Undo' }),
        bar(page).getByRole('button', { name: 'Re-run auto layout' }),
        bar(page).getByRole('button', { name: 'Photo options' }),
      ])
      for (const box of await handles.evaluateAll((els) =>
        els.map((el) => {
          const r = (el as unknown as El).getBoundingClientRect()
          return { w: r.width, h: r.height }
        }),
      )) {
        expect(box.w).toBeGreaterThanOrEqual(44)
        expect(box.h).toBeGreaterThanOrEqual(44)
      }
      await expectNoAxeViolations(page)

      const options = await openOptions(page, NAMES[0])
      await expectTouchTargets([
        options.getByRole('combobox', { name: 'Move to page' }),
        options.getByRole('combobox', { name: 'Swap with…' }),
        options.getByRole('spinbutton', { name: 'Width' }),
        options.getByRole('button', { name: 'Move left' }),
        options.getByRole('button', { name: 'Move up' }),
        options.getByRole('button', { name: 'Move down' }),
        options.getByRole('button', { name: 'Move right' }),
        options.getByRole('button', { name: 'Done' }),
      ])
      await expectNoAxeViolations(page)
    })
  }

  test('B-P3 every operation works without a drag: tap a photo, then the sheet', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const app = await openArranging(page)
    const said = page.locator('[aria-live="polite"]').filter({ hasText: /\S/ }).first()
    const id = (await blockOf(page, NAMES[0]).getAttribute('data-block-id')) ?? ''

    let options = await openOptions(page, NAMES[0])
    await options.getByRole('combobox', { name: 'Move to page' }).selectOption('New page')
    await expect(options).toHaveAccessibleDescription(/, page 2 of 2$/)
    await expect(said).toContainText(/^quadrants\.jpg, .*, page 2, /)
    await done(page)
    await expect(app.pageFigures).toHaveCount(2)
    await expect(blockOf(page, NAMES[0])).toBeInViewport()

    options = await openOptions(page, NAMES[0])
    const swap = options.getByRole('combobox', { name: 'Swap with…' })
    await swap.selectOption(`${NAMES[1]}, page 1`)
    await expect(options).toHaveAccessibleDescription(/, page 1 of 2$/)
    await expect(swap).toHaveValue('')

    const width = options.getByRole('spinbutton', { name: 'Width' })
    const smaller = String(Math.round(Number(await width.inputValue()) * 8) / 10)
    await width.fill(smaller)
    await width.press('Enter')
    await expect(options).toHaveAccessibleDescription(
      new RegExp(`^${smaller.replace('.', '\\.')} × `),
    )

    const x0 = (await blockBoxes(page)).find((b) => b.id === id)?.x ?? 0
    await options.getByRole('button', { name: 'Move right' }).click()
    await expect(said).toContainText(/ from the left, .* from the top\./)
    await expect
      .poll(async () => ((await blockBoxes(page)).find((b) => b.id === id)?.x ?? 0) - x0)
      .toBeGreaterThan(0)
    await done(page)

    await bar(page).getByRole('button', { name: 'Undo' }).click()
    await expect.poll(async () => (await blockBoxes(page)).find((b) => b.id === id)?.x).toBe(x0)
    await bar(page).getByRole('button', { name: 'Re-run auto layout' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Re-run' }).click()
    await expect(said).toContainText('Photos arranged automatically.')
    await expect(bar(page).getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('B-P4 a long press on a photo selects no text, has no callout menu and moves nothing', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await openArranging(page)
    const block = blockOf(page, NAMES[0])
    const style = await block.evaluate((el: El) => {
      const cs = getComputedStyle(el)
      return {
        touchAction: cs.getPropertyValue('touch-action'),
        userSelect:
          cs.getPropertyValue('user-select') || cs.getPropertyValue('-webkit-user-select'),
      }
    })
    expect(style.touchAction).toBe('none')
    expect(style.userSelect).toBe('none')

    const before = await blockBoxes(page)
    const at = await centreOf(block)
    if (test.info().project.name === 'mobile-chromium') {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
      await page.waitForTimeout(1200)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await cdp.detach()
    } else {
      await touchDrag(page, at, at, 1)
    }
    expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('')
    expect(await blockBoxes(page)).toEqual(before)
    await expect(block).toHaveClass(/is-selected/)
  })
})
