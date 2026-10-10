import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { ArrangeArea } from './support/arrange.ts'
import {
  clippedText,
  colourContrast,
  expectTabLoop,
  horizontalOverflow,
  inPage,
  liveEvents,
  recordLiveRegions,
  smallTargets,
  tabKey,
  TEXT_SPACING_CSS,
  textContrasts,
} from './support/audit.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { PRESET_FIXTURES } from './support/presets.ts'
import { runOnly } from './support/projects.ts'

// WCAG 2.2 AA audit of every screen and state (M5 task C3). Each test names the success criteria
// it checks; the ledger's "Accessibility audit" table maps every criterion to its evidence.

const THEMES = ['light', 'dark'] as const
const DESKTOP = ['chromium', 'firefox', 'webkit'] as const
const PHONE = ['mobile-chromium', 'mobile-webkit'] as const
const PHOTOS = [FIXTURES.quadrantsJpg, FIXTURES.portraitJpg]
const DESKTOP_MIN_TARGET_PX = 24
const PHONE_MIN_TARGET_PX = 44

/**
 * WebKit leaves the native colour well out of the Tab order even with Alt; the hex field next to
 * it sets the same colour from the keyboard (lines.spec.ts reaches and types in it by Tab).
 */
function untabbable(browserName: string): string {
  return browserName === 'webkit' ? 'input[type="color"]' : ''
}

// CI's Linux Firefox has no WebGL (C1-R1). Turned off here too, so a local run takes CI's path.
test.use({ launchOptions: { firefoxUserPrefs: { 'webgl.disabled': true } } })

let guard: NetworkGuard | undefined

function startApp(page: Page): AppPage {
  guard = guardNetwork(page)
  return new AppPage(page)
}

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

async function loaded(page: Page, { preview = true } = {}): Promise<AppPage> {
  const app = startApp(page)
  await app.goto()
  await app.upload(PHOTOS)
  await app.expectImages(PHOTOS.length)
  if (preview) await app.expectPreviewPages(1)
  return app
}

type Check = (label: string) => Promise<void>

/** Every desktop screen and state, calling `check` in each. */
async function desktopTour(page: Page, check: Check, browserName: string): Promise<void> {
  const app = startApp(page)
  await app.goto()
  await check('empty workspace')

  await app.exportButton.focus()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await check('disabled Export with its reason as a tooltip')
  await page.keyboard.press('Escape')

  await app.upload(PHOTOS)
  await app.expectImages(PHOTOS.length)
  await app.expectPreviewSettled()
  await app.editButton('quadrants.jpg').click()
  const edit = page.getByRole('dialog')
  await expect(app.cropArea).toBeVisible()
  await edit.getByRole('button', { name: 'More copies' }).click()
  await check('edit dialog, auto size, two copies')
  await edit.getByRole('radio', { name: 'Fixed' }).click()
  await check('edit dialog, fixed width')
  await edit.getByRole('radio', { name: 'Height', exact: true }).click()
  await check('edit dialog, fixed height')
  await edit.getByRole('radio', { name: 'Auto' }).click()
  await page.keyboard.press('Escape')
  await expect(edit).toHaveCount(0)
  await expect(app.imageList.getByText('×2')).toBeVisible()
  await expect(app.imageList.getByText(/\d+ DPI/).first()).toBeVisible()
  await app.selectButton('portrait.jpg').click()
  await check('images with the copies and low-resolution badges, a photo selected')

  await app.setPaper('Custom…')
  await app.setSwitch('Gutter between images', false)
  await app.setSwitch('Bleed', true)
  await expect(page.getByRole('status').filter({ hasText: 'Gutter turned on' })).toBeVisible()
  await check('Page tab: custom paper, bleed, the gutter note')
  await app.setPaper('A4')

  await app.openStudiesTab()
  await app.setVersions(['Original', 'Blurred', 'Values', 'Blur + Values'])
  await app.expectPreviewSettled()
  await check('Studies tab: every version')
  await app.setVersions(['Values'])
  await check('Studies tab: the last version locked')
  await app.setVersions(['Original'])

  await app.openLinesTab()
  await app.setAllLineSwitches(true)
  await app.setGuide('face', true)
  await app.setGuide('pose', true)
  const withoutWebGl = browserName === 'firefox'
  for (const kind of ['face', 'pose'] as const)
    expect(await app.expectGuideSettled(kind), kind).toBe(withoutWebGl ? 'unsupported' : 'box')
  await check(
    withoutWebGl
      ? 'Lines tab: every line on, face and pose with the no-WebGL note'
      : 'Lines tab: every line on, face and pose waiting for their download',
  )
  await app.setGuide('face', false)
  await app.setGuide('pose', false)
  await app.setAllLineSwitches(false)

  await app.openPresets()
  await check('Presets: empty')
  await app.savePreset('A4 values')
  await check('Presets: one saved')
  await app.presetAction('Rename', 'A4 values').click()
  await check('Presets: renaming')
  await page.keyboard.press('Escape')
  await app.presetAction('Apply', 'A4 values').click()
  const ask = page.getByRole('dialog', { name: 'Apply “A4 values”?' })
  await expect(ask).toBeVisible()
  await check('Presets: apply question')
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await app.presetAction('Delete', 'A4 values').click()
  const del = page.getByRole('dialog', { name: /Delete/ })
  await expect(del).toBeVisible()
  await check('Presets: delete question')
  await del.getByRole('button', { name: 'Cancel' }).click()
  await app.importPresets(PRESET_FIXTURES.notJson)
  await expect(app.presetsAlert).toBeVisible()
  await check('Presets: import refused')
  await app.closePresets()

  const arrange = new ArrangeArea(page)
  await arrange.enter()
  await check('Arrange: on')
  await arrange.block('portrait.jpg').focus()
  await page.keyboard.press('Enter')
  await arrange.expectAnnouncement(/picked up/i)
  await check('Arrange: a photo picked up, toolbar for the selected photo')
  await page.keyboard.press('Escape')
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('ArrowUp')
    if (/already|can't|cannot|no room|in the way/i.test(await arrange.announcement())) break
  }
  await check('Arrange: a refused move')
  await arrange.exit()

  await app.exportButton.click()
  const exp = page.getByRole('dialog')
  await expect(exp.getByRole('button', { name: /create pdf/i })).toBeVisible()
  await check('Export dialog: summary')
  await exp.getByRole('button', { name: /create pdf/i }).click()
  await expect(exp.getByRole('link', { name: /download pdf/i })).toBeVisible({ timeout: 60_000 })
  await check('Export dialog: done')
  await page.keyboard.press('Escape')
}

/** Every phone step and sheet, calling `check` in each. */
async function phoneTour(page: Page, check: Check): Promise<void> {
  const app = startApp(page)
  await app.goto()
  await check('Images step, empty')
  await app.upload(PHOTOS)
  await app.expectImages(PHOTOS.length)
  await check('Images step, photos with badges')
  await app.editButton('quadrants.jpg').click()
  const sheet = page.getByRole('dialog')
  await expect(app.cropArea).toBeVisible()
  await check('edit sheet, auto')
  await sheet.getByRole('radio', { name: 'Fixed' }).click()
  await check('edit sheet, fixed')
  await sheet.getByRole('radio', { name: 'Auto' }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)

  await app.goToStep('Page')
  await app.setSwitch('Gutter between images', false)
  await app.setSwitch('Bleed', true)
  await check('Page step with bleed and the gutter note')
  await app.goToStep('Studies')
  await app.setVersions(['Original', 'Values'])
  await app.setAllLineSwitches(true)
  await check('Studies step with a study group and every line')
  await app.setAllLineSwitches(false)
  await app.setVersions(['Original'])

  await app.openPresets()
  await check('Presets sheet')
  await app.closePresets()

  await app.goToStep('Preview')
  await app.expectPreviewSettled()
  await check('Preview step')
  const arrange = new ArrangeArea(page)
  await arrange.enter()
  await arrange.block('portrait.jpg').click()
  await page.getByRole('button', { name: 'Photo options' }).click()
  await expect(sheet).toBeVisible()
  await check('Arrange: the photo options sheet')
  await sheet.getByRole('button', { name: 'Done' }).click()
  await arrange.exit()

  await app.goToStep('Export')
  await check('Export step, ready')
  await app.exportStep.getByRole('button', { name: /create pdf/i }).click()
  await expect(app.exportStep.getByRole('link', { name: /download pdf/i })).toBeVisible({
    timeout: 60_000,
  })
  await check('Export step, done')
}

test.describe('every screen and state is axe-clean (desktop)', () => {
  runOnly(...DESKTOP)
  test.use({ viewport: { width: 1280, height: 900 } })
  for (const scheme of THEMES) {
    test(`4.1.2, 1.4.3, 1.4.11 and the rest of axe: the desktop tour (${scheme})`, async ({
      page,
      browserName,
    }) => {
      test.setTimeout(300_000)
      await page.emulateMedia({ colorScheme: scheme })
      await desktopTour(
        page,
        async () => {
          await expectNoAxeViolations(page)
        },
        browserName,
      )
    })
  }
})

test.describe('every screen and state is axe-clean (phone)', () => {
  runOnly(...PHONE)
  for (const scheme of THEMES) {
    test(`4.1.2, 1.4.3, 1.4.11 and the rest of axe: the phone tour (${scheme})`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      await page.emulateMedia({ colorScheme: scheme })
      await phoneTour(page, async () => {
        await expectNoAxeViolations(page)
      })
    })
  }
})

test.describe('2.5.8 target size', () => {
  test('desktop: every control is at least 24 x 24 px or clear of its neighbours', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(!(DESKTOP as readonly string[]).includes(testInfo.project.name))
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    const found: string[] = []
    await desktopTour(
      page,
      async (label) => {
        for (const t of await smallTargets(page, DESKTOP_MIN_TARGET_PX, true))
          found.push(`${label}: ${t}`)
      },
      browserName,
    )
    expect(found, browserName).toEqual([])
  })

  test('phone: every control is at least 44 x 44 px (owner H1)', async ({ page }, testInfo) => {
    test.skip(!(PHONE as readonly string[]).includes(testInfo.project.name))
    test.setTimeout(180_000)
    const found: string[] = []
    await phoneTour(page, async (label) => {
      for (const t of await smallTargets(page, PHONE_MIN_TARGET_PX, false))
        found.push(`${label}: ${t}`)
    })
    expect(found).toEqual([])
  })
})

test.describe('2.1.1, 2.1.2, 2.4.7, 2.4.11 keyboard walk (desktop)', () => {
  runOnly(...DESKTOP)
  test.use({ viewport: { width: 1280, height: 900 } })

  test('every screen: Tab reaches every control, shows a 2 px 3:1 ring, never hides it, and loops', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000)
    const key = tabKey(browserName)
    const skip = untabbable(browserName)
    const app = startApp(page)
    await app.goto()
    expect(await expectTabLoop(page, key, 'empty workspace', skip)).toBeGreaterThan(5)
    await app.upload(PHOTOS)
    await app.expectImages(PHOTOS.length)
    await app.expectPreviewSettled()
    await expectTabLoop(page, key, 'Page tab', skip)
    await app.openStudiesTab()
    await app.setVersions(['Original', 'Values'])
    await expectTabLoop(page, key, 'Studies tab', skip)
    await app.openLinesTab()
    await app.setLineSwitch('Grid', true)
    await expectTabLoop(page, key, 'Lines tab', skip)
    await app.setLineSwitch('Grid', false)

    await app.editButton('quadrants.jpg').click()
    await expect(app.cropArea).toBeVisible()
    await expectTabLoop(page, key, 'edit dialog', skip)
    await page.keyboard.press('Escape')

    await app.openPresets()
    await app.savePreset('One')
    await expectTabLoop(page, key, 'Presets dialog', skip)
    await app.closePresets()

    const arrange = new ArrangeArea(page)
    await arrange.enter()
    await arrange.block('portrait.jpg').click()
    await expectTabLoop(page, key, 'Arrange mode', skip)
    await arrange.exit()

    await app.exportButton.click()
    await expect(
      page.getByRole('dialog').getByRole('button', { name: /create pdf/i }),
    ).toBeVisible()
    await expectTabLoop(page, key, 'Export dialog', skip)
  })
})

test.describe('2.1.1, 2.1.2, 2.4.7, 2.4.11 keyboard walk (phone)', () => {
  runOnly(...PHONE)

  test('every step and sheet: Tab reaches every control, shows its ring above the bars, and loops', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000)
    const key = tabKey(browserName)
    const skip = untabbable(browserName)
    const app = startApp(page)
    await app.goto()
    await app.upload(PHOTOS)
    await app.expectImages(PHOTOS.length)
    for (const step of ['Images', 'Page', 'Studies', 'Preview', 'Export'] as const) {
      await app.goToStep(step)
      if (step === 'Preview') await app.expectPreviewSettled()
      await expectTabLoop(page, key, `${step} step`, skip)
    }
    await app.goToStep('Images')
    await app.editButton('quadrants.jpg').click()
    await expect(app.cropArea).toBeVisible()
    await expectTabLoop(page, key, 'edit sheet', skip)
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
    await app.openPresets()
    await expectTabLoop(page, key, 'Presets sheet', skip)
  })
})

test.describe('1.4.10 reflow, 1.4.4 zoom and 1.3.4 orientation', () => {
  const SIZES = [
    { name: '320 px (400 % of 1280)', width: 320, height: 640 },
    { name: '640 px (200 % of 1280)', width: 640, height: 450 },
  ]

  for (const size of SIZES) {
    test(`at ${size.name}: no step, sheet or dialog scrolls sideways or cuts text off`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium' && testInfo.project.name !== 'webkit')
      test.setTimeout(120_000)
      await page.setViewportSize({ width: size.width, height: size.height })
      const app = startApp(page)
      await app.goto()
      await app.upload(PHOTOS)
      await app.expectImages(PHOTOS.length)
      const found: string[] = []
      const look = async (label: string) => {
        for (const o of await horizontalOverflow(page)) found.push(`${label}: ${o}`)
      }
      for (const step of ['Images', 'Page', 'Studies', 'Preview', 'Export'] as const) {
        await app.goToStep(step)
        await look(step)
      }
      await app.goToStep('Images')
      await app.editButton('quadrants.jpg').click()
      await expect(app.cropArea).toBeVisible()
      await look('edit sheet')
      await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
      await app.openPresets()
      await look('Presets sheet')
      await app.closePresets()
      await page.getByRole('button', { name: 'Remove all images' }).click()
      await expect(page.getByRole('dialog', { name: 'Remove all images?' })).toBeVisible()
      await look('Remove all question')
      expect(found).toEqual([])
    })
  }

  test('landscape phone: the step flow works and nothing scrolls sideways', async ({
    page,
  }, testInfo) => {
    test.skip(!(PHONE as readonly string[]).includes(testInfo.project.name))
    test.setTimeout(120_000)
    const size = page.viewportSize()
    if (!size) throw new Error('no viewport')
    await page.setViewportSize({ width: size.height, height: size.width })
    const app = startApp(page)
    await app.goto()
    await app.upload(PHOTOS)
    await app.expectImages(PHOTOS.length)
    for (const step of ['Images', 'Page', 'Studies', 'Preview', 'Export'] as const) {
      await app.goToStep(step)
      await expect(page.getByRole('heading', { level: 2, name: step, exact: true })).toBeVisible()
      expect(await horizontalOverflow(page), step).toEqual([])
      await expectNoAxeViolations(page)
    }
    await app.exportStep.getByRole('button', { name: /create pdf/i }).click()
    await expect(app.exportStep.getByRole('link', { name: /download pdf/i })).toBeVisible({
      timeout: 60_000,
    })
  })
})

test.describe('1.4.12 text spacing', () => {
  for (const width of [1280, 390]) {
    test(`at ${String(width)} px no text is cut off or pushed off the side`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium')
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: 900 })
      const app = await loaded(page, { preview: width >= 960 })
      await page.addStyleTag({ content: TEXT_SPACING_CSS })
      const found: string[] = []
      const look = async (label: string) => {
        for (const c of await clippedText(page)) found.push(`${label}: clipped ${c}`)
        for (const o of await horizontalOverflow(page)) found.push(`${label}: ${o}`)
      }
      if (width >= 960) {
        await look('Page tab')
        await app.openStudiesTab()
        await look('Studies tab')
        await app.openLinesTab()
        await look('Lines tab')
      } else {
        for (const step of ['Images', 'Page', 'Studies', 'Preview', 'Export'] as const) {
          await app.goToStep(step)
          await look(step)
        }
      }
      await app.openPresets()
      await look('Presets')
      await app.closePresets()
      expect(found).toEqual([])
    })
  }
})

test.describe('1.4.3 text axe cannot judge', () => {
  runOnly('chromium')
  test.use({ viewport: { width: 1280, height: 900 } })

  for (const scheme of THEMES) {
    test(`select text, tile labels, badges on the page, dialog text and the landing tip (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const app = await loaded(page)
      await app.openStudiesTab()
      await app.setVersions(['Original', 'Values'])
      await app.expectPreviewSettled()
      const low: string[] = []
      const need = async (selector: string, min: number) => {
        const found = await textContrasts(page, selector)
        expect(found.length, selector).toBeGreaterThan(0)
        for (const f of found)
          if (f.ratio < min) low.push(`${selector} ${f.name} ${String(f.ratio)}:1`)
      }
      await app.openPageTab()
      await need('select.ds-select', 4.5)
      await need('.page-tile-label', 4.5)
      await need('main .ds-badge', 4.5)
      await app.openPresets()
      await need('.ds-dialog p', 4.5)
      await app.closePresets()
      await app.editButton('quadrants.jpg').click()
      await expect(app.cropArea).toBeVisible()
      await need('button[aria-label="More copies"]', 4.5)
      await page.keyboard.press('Escape')
      await page.goto('./')
      await need('[aria-hidden="true"] .font-hand', 3)
      expect(low).toEqual([])
    })
  }
})

test.describe('1.4.11 non-text contrast of Arrange on the paper', () => {
  runOnly('chromium')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('outlines, handles, the ghost and the refused ghost are at least 3:1 on the white sheet', async ({
    page,
  }) => {
    await loaded(page)
    const arrange = new ArrangeArea(page)
    await arrange.enter()
    await arrange.block('portrait.jpg').click()
    const colours = await inPage<Record<string, string>>(
      page,
      `const block = document.querySelector('.arrange-block')
       const selected = document.querySelector('.arrange-block.is-selected')
       const handle = document.querySelector('.arrange-handle')
       return {
         block: getComputedStyle(block, '::after').borderTopColor,
         selected: getComputedStyle(selected, '::after').borderTopColor,
         handle: getComputedStyle(handle, '::before').borderTopColor,
         focus: getComputedStyle(block).getPropertyValue('--on-paper-select'),
         danger: getComputedStyle(block).getPropertyValue('--on-paper-danger'),
         swap: getComputedStyle(block).getPropertyValue('--on-paper-swap'),
       }`,
    )
    const low: string[] = []
    for (const [part, colour] of Object.entries(colours)) {
      const r = await colourContrast(page, colour.trim(), '#ffffff')
      if (r < 3) low.push(`${part} ${colour} ${String(r)}:1`)
    }
    const block = await arrange.blockOf('portrait.jpg')
    const sheet = await arrange.sheetBox(block.page)
    const cx = sheet.x + (block.rect.x + block.rect.w / 2) * sheet.ppm
    const cy = sheet.y + (block.rect.y + block.rect.h / 2) * sheet.ppm
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 20, cy + 20, { steps: 4 })
    await expect(arrange.ghost).toBeVisible()
    const ghost = await arrange.ghost.evaluate(
      (el: {
        ownerDocument: { defaultView: { getComputedStyle(e: unknown): { borderTopColor: string } } }
      }) => el.ownerDocument.defaultView.getComputedStyle(el).borderTopColor,
    )
    const r = await colourContrast(page, ghost, '#ffffff')
    if (r < 3) low.push(`ghost ${ghost} ${String(r)}:1`)
    await page.mouse.move(sheet.x - 200, cy, { steps: 4 })
    await expect(arrange.ghost).toHaveClass(/is-invalid/)
    const refused = await arrange.ghost.evaluate(
      (el: {
        ownerDocument: { defaultView: { getComputedStyle(e: unknown): { borderTopColor: string } } }
      }) => el.ownerDocument.defaultView.getComputedStyle(el).borderTopColor,
    )
    const rr = await colourContrast(page, refused, '#ffffff')
    if (rr < 3) low.push(`refused ghost ${refused} ${String(rr)}:1`)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(low).toEqual([])
  })
})

test.describe('forced colours (chromium emulation)', () => {
  runOnly('chromium')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('every control family keeps a visible boundary and a visible state, Arrange included', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const app = await loaded(page)
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'light' })
    const boundary = async (selector: string) =>
      inPage<string[]>(
        page,
        `return [...document.querySelectorAll(${JSON.stringify(selector)})]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .filter((el) => {
            const parts = [getComputedStyle(el), getComputedStyle(el, '::before'), getComputedStyle(el, '::after')]
            return !parts.some((s) => parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' &&
              A.rgba(s.borderTopColor)[3] > 0)
          })
          .map((el) => A.describe(el))`,
      )
    const missing: string[] = []
    for (const sel of [
      '.ds-btn:not(.ds-btn--ghost)',
      '.ds-input',
      '.ds-select',
      '.ds-chip',
      '.ds-dialog',
    ]) {
      if (sel === '.ds-dialog') await app.openPresets()
      for (const m of await boundary(sel)) missing.push(`${sel}: ${m}`)
      if (sel === '.ds-dialog') await app.closePresets()
    }
    const state = async (on: string, off: string) =>
      inPage<boolean>(
        page,
        `const a = document.querySelector(${JSON.stringify(on)}); const b = document.querySelector(${JSON.stringify(off)})
         if (!a || !b) return false
         const sig = (el) => ['', '::before', '::after'].map((p) => { const s = getComputedStyle(el, p || null);
           return [s.backgroundColor, s.color, s.borderTopColor, s.borderTopWidth, s.borderTopStyle, s.outlineStyle, s.boxShadow, s.textDecorationLine].join('|') }).join('/')
         return sig(a) !== sig(b)`,
      )
    await app.openStudiesTab()
    await app.setVersions(['Original', 'Values'])
    const tick = await inPage<{ pressed: boolean; unpressed: boolean; ratio: number }>(
      page,
      `const on = document.querySelector('.ds-chip[aria-pressed="true"] .ds-chip__box')
       const off = document.querySelector('.ds-chip[aria-pressed="false"] .ds-chip__box')
       const svg = on && on.querySelector('svg')
       const bg = A.bgBehind(on)
       return { pressed: !!svg, unpressed: !!(off && off.querySelector('svg')),
         ratio: svg ? A.ratio(A.rgba(getComputedStyle(svg).color).slice(0, 3), bg) : 0 }`,
    )
    expect(tick.pressed && !tick.unpressed, 'chip: a tick only when pressed').toBe(true)
    expect(tick.ratio, 'chip: the tick against its box').toBeGreaterThanOrEqual(3)
    expect(
      await state('.ds-tab[aria-selected="true"]', '.ds-tab[aria-selected="false"]'),
      'tab',
    ).toBe(true)
    await app.setVersions(['Original'])
    const arrange = new ArrangeArea(page)
    await arrange.enter()
    await arrange.block('portrait.jpg').click()
    expect(
      await state('.arrange-block.is-selected', '.arrange-block:not(.is-selected)'),
      'block',
    ).toBe(true)
    for (const m of await boundary('.arrange-block')) missing.push(`block: ${m}`)
    for (const m of await boundary('.arrange-handle')) missing.push(`handle: ${m}`)
    await expectNoAxeViolations(page)
    expect(missing).toEqual([])
  })
})

test.describe('reduced motion', () => {
  runOnly('chromium', 'mobile-chromium')

  test('dialogs, sheets and the preview run no animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const app = await loaded(page, { preview: test.info().project.name === 'chromium' })
    const running = () =>
      page.evaluate<string[]>(
        `document.getAnimations().filter((a) => {
           const t = a.effect && a.effect.getComputedTiming()
           return a.playState === 'running' && t && Number(t.duration) > 1
         }).map((a) => (a.animationName || a.transitionProperty || 'animation') + ' on ' + (a.effect.target && a.effect.target.className))`,
      )
    expect(await running(), 'workspace').toEqual([])
    await app.openPresets()
    expect(await running(), 'presets').toEqual([])
    await app.closePresets()
    await app.editButton('quadrants.jpg').click()
    await expect(app.cropArea).toBeVisible()
    expect(await running(), 'edit').toEqual([])
  })
})

test.describe('4.1.3 status messages', () => {
  runOnly('chromium')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('a scripted session says each result once, in a region that was there first', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const app = startApp(page)
    await app.goto()
    await recordLiveRegions(page)

    await app.upload(PHOTOS)
    await app.expectImages(PHOTOS.length)
    await app.expectPreviewSettled()
    await app.openStudiesTab()
    await app.setVersions(['Original', 'Values'])
    await app.expectPreviewSettled()
    await app.openLinesTab()
    await app.setLineSwitch('Rule of thirds', true)
    await app.expectPreviewSettled()
    const arrange = new ArrangeArea(page)
    await arrange.enter()
    await arrange.block('portrait.jpg').focus()
    await page.keyboard.press('ArrowRight')
    await arrange.expectAnnouncement(/portrait\.jpg/)
    await arrange.exit()
    await app.openPresets()
    await app.savePreset('Session')
    await app.applyPreset('Session', { asks: true })
    await app.closePresets()
    await app.openPageTab()
    await app.setSwitch('Gutter between images', false)
    await app.setSwitch('Bleed', true)
    await expect(page.getByRole('status').filter({ hasText: 'Gutter turned on' })).toBeVisible()
    await app.upload(FIXTURES.notesPdf)
    await expect(page.getByRole('alert').filter({ hasText: 'notes.pdf' })).toBeVisible()
    await app.exportButton.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /create pdf/i }).click()
    await expect(dialog.getByRole('link', { name: /download pdf/i })).toBeVisible({
      timeout: 60_000,
    })

    const log = await liveEvents(page)
    await test.info().attach('live-regions.json', {
      body: JSON.stringify(log, null, 2),
      contentType: 'application/json',
    })
    expect(log.filter((e) => e.bornWithText).map((e) => `${e.region}: ${e.text}`)).toEqual([])
    const doubled = log.filter(
      (e, i) => i > 0 && log[i - 1]?.text === e.text && log[i - 1]?.frame === e.frame,
    )
    expect(
      doubled.map((e) => `${e.region}: ${e.text}`),
      'said twice at once',
    ).toEqual([])
    const PROGRESS = /^(Adding \d+ photos?…|Page \d+ of \d+…)$/
    const ARRANGED = /^portrait\.jpg, .* page 1, .* from the left, .* from the top\.$/
    const said = log.map((e) => e.text).filter((t) => !PROGRESS.test(t))
    expect(said.filter((t) => ARRANGED.test(t))).toHaveLength(1)
    // Layout notices arrive when the worker answers, so only the set of messages is fixed.
    expect(said.filter((t) => !ARRANGED.test(t)).sort()).toEqual(
      [
        'Saved Session.',
        'Applied Session.',
        'Gutter turned on. Bleed needs a gutter of at least 2 × bleed.',
        "notes.pdf can't be addedUse JPG, PNG, WebP, GIF or HEIC.",
        'Your arrangement no longer fits the new margins, so the photos were arranged automatically again.',
        'Your PDF is ready',
      ].sort(),
    )
  })
})

test.describe('the logo and landing page', () => {
  for (const scheme of THEMES) {
    test(`the logo is an image named Artistica, and the landing page is axe-clean (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const app = startApp(page)
      await app.goto()
      await expect(
        page.getByRole('link', { name: 'Artistica home' }).getByRole('img', { name: 'Artistica' }),
      ).toBeVisible()
      await page.goto('./')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoAxeViolations(page)
    })
  }
})
