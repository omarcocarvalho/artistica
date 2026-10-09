import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'

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
declare const document: {
  activeElement: { dispatchEvent(e: ClipboardEventLike): boolean } | null
}

const SLOW_URL = 'https://photos.example/slow.jpg'
const WAITING = 'Waiting for photos to finish importing…'

let guard: NetworkGuard | undefined

function startApp(page: Page): AppPage {
  guard = guardNetwork(page)
  return new AppPage(page)
}

test.afterEach(() => {
  expect(guard?.violations() ?? []).toEqual([])
  guard = undefined
})

/** Answers the image URL only once `release()` is called, so the import stays in progress. */
async function holdUrlImport(page: Page): Promise<() => void> {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(SLOW_URL, async (route) => {
    await held
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(FIXTURES.quadrantsJpg),
    })
  })
  guard?.allowExternal(SLOW_URL)
  return release
}

/** The version chips, swatches, Apply to all and the three sliders inside `scope` and outside the phone Lines section (native `disabled`: the locked chip is only aria-disabled). */
async function expectStudyControls(app: AppPage, scope: Locator, enabled: boolean): Promise<void> {
  const controls = await app.outsideLinesSection([
    ...(await scope.getByRole('button').all()),
    ...(await scope.getByRole('slider').all()),
  ])
  expect(controls).toHaveLength(4 + 8 + 1 + 3)
  for (const c of controls) await expect(c).toHaveJSProperty('disabled', !enabled)
}

test.describe('studies wait for imports in progress (desktop)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('S-W1 the controls are disabled with a reason while a photo imports, focus moves to the reason and back', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await app.upload([FIXTURES.valueRamp, FIXTURES.quadrantsPng])
    await app.expectImages(2)
    await app.openStudiesTab()
    await expectStudyControls(app, app.studiesPanel, true)
    const release = await holdUrlImport(page)

    const slider = app.studySlider('Amount')
    await slider.focus()
    const pasteSupported = await page.evaluate((url) => {
      try {
        const dt = new DataTransfer()
        dt.setData('text/plain', url)
        const event = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        })
        if (event.clipboardData !== dt) return false
        document.activeElement?.dispatchEvent(event)
        return true
      } catch {
        return false
      }
    }, SLOW_URL)
    if (!pasteSupported) await app.submitLink(SLOW_URL)

    const waiting = app.studiesPanel.getByText(WAITING)
    await expect(waiting).toBeVisible()
    await expectStudyControls(app, app.studiesPanel, false)
    await expect(app.studySlider('Amount')).toHaveAccessibleDescription(WAITING)
    await expect(
      page.getByRole('button', { name: 'Apply to all images' }),
    ).toHaveAccessibleDescription(WAITING)
    if (pasteSupported) await expect(waiting).toBeFocused()
    await expectNoAxeViolations(page)

    release()
    await app.expectImages(3)
    await expect(waiting).toHaveCount(0)
    await expectStudyControls(app, app.studiesPanel, true)
    if (pasteSupported) await expect(slider).toBeFocused()
    await app.setSlider('Amount', 55)
  })
})

test.describe('studies wait for imports in progress (phone)', () => {
  runOnly('mobile-chromium', 'mobile-webkit')

  test('S-W2 phone: the Studies step is disabled with a reason while a link imports', async ({
    page,
  }) => {
    const app = startApp(page)
    const step = page.getByRole('region', { name: 'Step 3 of 5: Studies' })
    await app.goto()
    await app.upload([FIXTURES.valueRamp, FIXTURES.quadrantsPng])
    await app.expectImages(2)
    const release = await holdUrlImport(page)
    await app.submitLink(SLOW_URL)
    await app.goToStep('Studies')
    const waiting = step.getByText(WAITING)
    await expect(waiting).toHaveCount(2)
    await expect(waiting.first()).toBeVisible()
    await expectStudyControls(app, step, false)
    await expect(app.studiesPicker.getByRole('radio').first()).toBeEnabled()
    await expectNoAxeViolations(page)
    release()
    await app.goToStep('Images')
    await app.expectImages(3)
    await app.goToStep('Studies')
    await expect(step.getByText(WAITING)).toHaveCount(0)
    await expectStudyControls(app, step, true)
  })

  test('L-W2 phone: one live region announces the wait for the step, and the Lines hint describes the Lines controls', async ({
    page,
  }) => {
    const app = startApp(page)
    const step = page.getByRole('region', { name: 'Step 3 of 5: Studies' })
    await app.goto()
    await app.upload([FIXTURES.valueRamp, FIXTURES.quadrantsPng])
    await app.expectImages(2)
    await app.goToStep('Studies')
    await app.setLineSwitch('Grid', true)
    const release = await holdUrlImport(page)
    await app.goToStep('Images')
    await app.submitLink(SLOW_URL)
    await app.goToStep('Studies')

    const waiting = step.getByText(WAITING)
    await expect(waiting).toHaveCount(2)
    await expect(waiting.nth(1)).toBeVisible()
    const live = await waiting.evaluateAll(
      (els: { closest(selector: string): unknown }[]) =>
        els.filter(
          (e) =>
            e.closest(
              '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]',
            ) !== null,
        ).length,
    )
    expect(live).toBe(1)
    await expect(app.linesSection.getByText(WAITING)).not.toHaveAttribute('aria-live')
    const linesControls = [
      ...(await app.linesSection.getByRole('switch').all()),
      ...(await app.linesSection.getByRole('textbox').all()),
      ...(await app.linesSection.getByRole('slider').all()),
      app.linesApplyButton,
    ]
    expect(linesControls).toHaveLength(6 + 3 + 4 + 2 + 1)
    for (const c of linesControls) {
      await expect(c).toBeDisabled()
      await expect(c).toHaveAccessibleDescription(new RegExp(WAITING))
    }
    await expectNoAxeViolations(page)
    release()
    await app.goToStep('Images')
    await app.expectImages(3)
    await app.goToStep('Studies')
    await expect(step.getByText(WAITING)).toHaveCount(0)
    await expect(app.lineSwitch('Grid')).toBeEnabled()
  })
})
