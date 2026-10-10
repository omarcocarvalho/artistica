import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { solidGrayPng } from './support/png.ts'
import { runOnly } from './support/projects.ts'

// The e2e tsconfig has no DOM lib; these are the few browser globals used inside page.evaluate.
interface CanvasLike {
  width: number
  height: number
  getContext(id: '2d'): {
    getImageData(
      x: number,
      y: number,
      w: number,
      h: number,
    ): { data: ArrayLike<number>; width: number; height: number }
    drawImage(image: unknown, x: number, y: number): void
  } | null
}
interface ImgLike {
  naturalWidth: number
  naturalHeight: number
}
interface DataTransferLike {
  items: { add(file: unknown): void }
  setData(type: string, value: string): void
}
interface ClipboardEventLike {
  readonly clipboardData: DataTransferLike | null
}
declare const DataTransfer: new () => DataTransferLike
declare const File: new (parts: unknown[], name: string, options: { type: string }) => unknown
declare const ClipboardEvent: new (
  type: string,
  init: { clipboardData?: DataTransferLike; bubbles?: boolean; cancelable?: boolean },
) => ClipboardEventLike
declare const document: {
  createElement(tag: 'canvas'): CanvasLike
  body: { dispatchEvent(e: ClipboardEventLike): boolean }
  activeElement: { dispatchEvent(e: ClipboardEventLike): boolean } | null
}

/**
 * Direction of the red pixels relative to the centre of everything non-white on a canvas or an
 * img (drawn onto a canvas first), i.e. where the red quadrant sits.
 */
async function redDirection(el: Locator): Promise<{ dx: number; dy: number; red: number }> {
  return el.evaluate((node: CanvasLike | ImgLike) => {
    let c: CanvasLike
    if ('naturalWidth' in node) {
      c = document.createElement('canvas')
      c.width = node.naturalWidth
      c.height = node.naturalHeight
      c.getContext('2d')?.drawImage(node, 0, 0)
    } else c = node
    const g = c.getContext('2d')
    if (!g) return { dx: 0, dy: 0, red: 0 }
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height)
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0,
      red = 0,
      rx = 0,
      ry = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4
        const [r, gg, b] = [data[i], data[i + 1], data[i + 2]]
        if (r > 245 && gg > 245 && b > 245) continue
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
        if (r > 200 && gg < 60 && b < 60) {
          red++
          rx += x
          ry += y
        }
      }
    }
    if (red === 0) return { dx: 0, dy: 0, red: 0 }
    return { dx: rx / red - (minX + maxX) / 2, dy: ry / red - (minY + maxY) / 2, red }
  })
}

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

test.describe('import (all browsers)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 800 } })

  test('I1 upload JPG and PNG shows two rows and one preview page', async ({ page }) => {
    const app = startApp(page)
    await app.goto()
    await app.upload([FIXTURES.quadrantsJpg, FIXTURES.transparentPng])
    await app.expectImages(2)
    expect(await app.expectPreviewPages(1)).toBe(1)
  })

  test('I2 EXIF orientation 6 and 3 are shown upright (48 x 64; red top-right, then bottom-right)', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await app.setSwitch('Crop marks', false)
    await app.setSwitch('Guides', false) // the dashed safe-area guides would widen the non-white box
    await app.upload(FIXTURES.quadrantsExif6)
    await app.expectImages(1)
    await expect(app.imageRows.first()).toContainText(/48\s*[×x]\s*64/)
    await app.expectPreviewPages(1)
    // The layout may turn a tile on the page to pack it, so orientation 6 is checked on the
    // list thumbnail (always upright). The page itself is checked for orientation 3, which is
    // landscape and never turned.
    const thumb = app.imageRows.first().locator('img')
    await expect.poll(async () => (await redDirection(thumb)).red).toBeGreaterThan(20)
    const six = await redDirection(thumb)
    expect(six.dx).toBeGreaterThan(0) // right
    expect(six.dy).toBeLessThan(0) // top
    await app.removeAll()
    await app.upload(FIXTURES.quadrantsExif3)
    await app.expectImages(1)
    await expect(app.imageRows.first()).toContainText(/64\s*[×x]\s*48/)
    await app.expectPreviewPages(1)
    await expect
      .poll(async () => (await redDirection(app.pageCanvases.first())).red)
      .toBeGreaterThan(20)
    const three = await redDirection(app.pageCanvases.first())
    expect(three.dx).toBeGreaterThan(0) // after a 180 degree turn the red quadrant is bottom-right
    expect(three.dy).toBeGreaterThan(0)
  })

  test('I3 HEIC loads: the decoder chunk is fetched once on Chromium and Firefox, never on Safari (native)', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90_000)
    const heicRequests: string[] = []
    page.on('request', (r) => {
      if (/heic/i.test(r.url())) heicRequests.push(r.url())
    })
    const app = startApp(page)
    await app.goto()
    expect(heicRequests).toEqual([]) // lazy: not loaded with the app
    await app.upload(FIXTURES.heic)
    await app.expectImages(1, 60_000)
    await expect(app.imageRows.first()).toContainText(/64\s*[×x]\s*48/)
    // WebKit decodes HEIC natively only on macOS; Playwright's WebKit on Linux (CI) has no
    // native decoder, so the chunk is fetched there like on the other browsers.
    if (browserName === 'webkit' && process.platform === 'darwin') expect(heicRequests).toEqual([])
    else expect(heicRequests.length).toBeGreaterThanOrEqual(1)
  })

  test('I16 the HEIC decoder is never requested for JPG, PNG, WebP or GIF', async ({ page }) => {
    const heicRequests: string[] = []
    page.on('request', (r) => {
      if (/heic/i.test(r.url())) heicRequests.push(r.url())
    })
    const app = startApp(page)
    await app.goto()
    await app.upload([
      FIXTURES.quadrantsJpg,
      FIXTURES.quadrantsPng,
      FIXTURES.quadrantsWebp,
      FIXTURES.stillGif,
    ])
    await app.expectImages(4)
    expect(heicRequests).toEqual([])
  })

  test('I17 bytes beat names: a HEIC named .jpg imports', async ({ page }) => {
    test.setTimeout(90_000)
    const app = startApp(page)
    await app.goto()
    await app.upload(FIXTURES.mislabelledHeic)
    await app.expectImages(1, 60_000)
    await expect(app.page.getByRole('alert')).toHaveCount(0)
  })

  test('I4 animated GIF uses its first frame (red)', async ({ page }) => {
    const app = startApp(page)
    await app.goto()
    await app.setSwitch('Crop marks', false)
    await app.upload(FIXTURES.animatedGif)
    await app.expectPreviewPages(1)
    const pixels = await app.pageCanvases.first().evaluate((c: CanvasLike) => {
      const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data
      let r = 0
      let b = 0
      for (let i = 0; d && i < d.length; i += 16) {
        if ((d[i] ?? 0) > 200 && (d[i + 2] ?? 0) < 60 && (d[i + 1] ?? 0) < 60) r++
        if ((d[i + 2] ?? 0) > 200 && (d[i] ?? 255) < 60) b++
      }
      return { r, b }
    })
    expect(pixels.r).toBeGreaterThan(50)
    expect(pixels.b).toBe(0)
  })

  test('I5 transparent PNG is flattened onto white (no black), red centre kept', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await app.setSwitch('Crop marks', false)
    await app.upload(FIXTURES.transparentPng)
    await app.expectPreviewPages(1)
    const counts = await app.pageCanvases.first().evaluate((c: CanvasLike) => {
      const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data
      let red = 0
      let black = 0
      for (let i = 0; d && i < d.length; i += 16) {
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
        if (r > 200 && g < 60 && b < 60) red++
        else if (r < 40 && g < 40 && b < 40) black++ // transparency rendered as black
      }
      return { red, black }
    })
    expect(counts.red).toBeGreaterThan(50)
    expect(counts.black).toBe(0)
  })

  test('I6 a non-image file gives exactly one alert (the dropzone callout), no toast, and adds nothing', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await app.upload(FIXTURES.notesPdf)
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('alert')).toContainText('notes.pdf')
    await expect(app.notices.getByRole('alert')).toHaveCount(0)
    await expect(app.imageRows).toHaveCount(0)
  })

  test('I9 imports an image URL the user typed', async ({ page }) => {
    const app = startApp(page)
    await app.goto()
    await page.route('https://photos.example/pic.jpg', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        headers: { 'access-control-allow-origin': '*' },
        body: readFileSync(FIXTURES.quadrantsJpg),
      }),
    )
    guard?.allowExternal('https://photos.example/pic.jpg')
    await app.submitLink('https://photos.example/pic.jpg')
    await app.expectImages(1)
    await expect(app.imageRows.first()).toContainText('pic.jpg')
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('I10 a URL blocked by CORS explains what to do (one alert)', async ({ page }) => {
    const app = startApp(page)
    await app.goto()
    // page.route().fulfill() adds CORS headers by itself, so a real block is simulated: the CORS
    // GET fails like a blocked request, while the app's no-cors HEAD probe still gets an answer.
    await page.route('https://blocked.example/pic.jpg', (route) =>
      route.request().method() === 'HEAD'
        ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' })
        : route.abort('failed'),
    )
    guard?.allowExternal('https://blocked.example/pic.jpg')
    await app.submitLink('https://blocked.example/pic.jpg')
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('alert')).toContainText(
      "This site doesn't allow other apps to read its images. Download it and upload it instead.",
    )
    await expect(app.imageRows).toHaveCount(0)
  })

  test('I18 a link that is not a picture says so', async ({ page }) => {
    const app = startApp(page)
    await app.goto()
    await page.route('https://pages.example/post', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        headers: { 'access-control-allow-origin': '*' },
        body: '<p>hi</p>',
      }),
    )
    guard?.allowExternal('https://pages.example/post')
    await app.submitLink('https://pages.example/post')
    await expect(page.getByRole('alert')).toContainText("That's not an image")
    await expect(app.imageRows).toHaveCount(0)
  })
})

test.describe('import (cancel)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 800 } })

  /** A promise and its resolver: a route handler calls `reach()` and leaves the request unanswered. */
  function hold(): { reached: Promise<void>; reach: () => void } {
    let reach = (): void => undefined
    const reached = new Promise<void>((resolve) => {
      reach = resolve
    })
    return { reached, reach }
  }

  // Both links are same-origin files of the preview server, so the strict guard needs no exception.
  // The 3 s limits sit well below FETCH_TIMEOUT_MS (30 s) and PROBE_TIMEOUT_MS (8 s): only Cancel
  // can abort the held request that soon.
  test('I-C1 Cancel ends a pending link import, download or CORS probe, and the added photos stay', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await app.upload([FIXTURES.quadrantsJpg, FIXTURES.transparentPng])
    await app.expectImages(2)
    const failed: string[] = []
    page.on('requestfailed', (r) => {
      failed.push(`${r.method()} ${r.url()}`)
    })

    const download = new URL('../apple-touch-icon.png', page.url()).href
    const held = hold()
    await page.route(download, () => {
      held.reach()
    })
    await app.submitLink(download)
    await held.reached
    await expect(app.importing(1)).toBeVisible()
    expect(failed).toEqual([])
    await app.cancelImportsButton.click()
    await expect.poll(() => failed, { timeout: 3_000 }).toEqual([`GET ${download}`])
    await expect(page.getByText('Stopped adding photos.', { exact: true })).toBeVisible()
    await expect(app.cancelImportsButton).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeFocused()
    await app.expectImages(2)
    await expect(page.getByRole('alert')).toHaveCount(0)

    const probed = new URL('../og-image.png', page.url()).href
    const probe = hold()
    await page.route(probed, (route) => {
      if (route.request().method() === 'HEAD') probe.reach()
      else return route.abort('failed')
    })
    await app.submitLink(probed)
    await probe.reached
    await expect(app.importing(1)).toBeVisible()
    expect(failed).toEqual([`GET ${download}`, `GET ${probed}`])
    await app.cancelImportsButton.click()
    await expect
      .poll(() => failed, { timeout: 3_000 })
      .toEqual([`GET ${download}`, `GET ${probed}`, `HEAD ${probed}`])
    await expect(page.getByText('Stopped adding photos.', { exact: true })).toBeVisible()
    await expect(app.cancelImportsButton).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeFocused()
    await app.expectImages(2)
    await expect(app.imageRows.first()).toContainText('quadrants.jpg')
    await expect(app.imageRows.nth(1)).toContainText('transparent.png')
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

test.describe('import (paste)', () => {
  runOnly('chromium', 'firefox', 'webkit')
  test.use({ viewport: { width: 1280, height: 800 } })

  test('I7 pasting an image imports it (no toast)', async ({ page, browserName }) => {
    const app = startApp(page)
    await app.goto()
    const supported = await page.evaluate(() => {
      try {
        const dt = new DataTransfer()
        return new ClipboardEvent('paste', { clipboardData: dt }).clipboardData === dt
      } catch {
        return false
      }
    })
    test.skip(!supported, `${browserName}: ClipboardEvent init ignores clipboardData`)
    const bytes = Array.from(readFileSync(FIXTURES.quadrantsPng))
    await page.evaluate((b) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(b)], 'pasted.png', { type: 'image/png' }))
      document.body.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      )
    }, bytes)
    await app.expectImages(1)
    await expect(app.notices.getByRole('alert')).toHaveCount(0)
  })
})

test.describe('import (chromium only)', () => {
  runOnly('chromium')
  test.use({ viewport: { width: 1280, height: 800 } })

  test('I8 pasting text says there is nothing to paste, but pasting into the link field is left alone', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.setData('text/plain', 'hello')
      document.body.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      )
    })
    await expect(app.notices.getByRole('status')).toContainText('No image on the clipboard')
    await app.notices.getByRole('button', { name: 'Dismiss' }).click()
    const field = await app.openLinkField()
    await field.focus()
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.setData('text/plain', 'https://x.example/a.jpg')
      document.activeElement?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      )
    })
    await expect(app.notices.getByRole('status')).toBeEmpty()
    await expect(app.notices.getByRole('alert')).toHaveCount(0)
  })

  test('I11 a network failure is reported once', async ({ page }) => {
    const app = startApp(page)
    await app.goto()
    await page.route('https://down.example/pic.jpg', (route) => route.abort('connectionrefused'))
    guard?.allowExternal('https://down.example/pic.jpg')
    await app.submitLink('https://down.example/pic.jpg')
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('alert')).toContainText("Couldn't load this link")
    await expect(app.imageRows).toHaveCount(0)
  })

  test('I12 dropping files imports the photo, reports the PDF once, and the page does not navigate', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    const url = page.url()
    const photo = Array.from(readFileSync(FIXTURES.quadrantsJpg))
    const pdf = Array.from(readFileSync(FIXTURES.notesPdf))
    const dt = await page.evaluateHandle(
      ([a, b]) => {
        const d = new DataTransfer()
        d.items.add(new File([new Uint8Array(a)], 'dropped.jpg', { type: 'image/jpeg' }))
        d.items.add(new File([new Uint8Array(b)], 'notes.pdf', { type: 'application/pdf' }))
        return d
      },
      [photo, pdf],
    )
    await app.dropzone.dispatchEvent('drop', { dataTransfer: dt })
    await app.expectImages(1)
    await expect(app.imageRows.first()).toContainText('dropped.jpg')
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('alert')).toContainText('notes.pdf')
    expect(page.url()).toBe(url)
  })

  test('I13 a 50 MP image is downscaled and loads', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const app = startApp(page)
    await app.goto()
    await app.setSwitch('Crop marks', false)
    const path = testInfo.outputPath('50mp.png')
    writeFileSync(path, solidGrayPng(8000, 6250, 140))
    await app.upload(path)
    await app.expectImages(1, 90_000)
    await expect(app.imageRows.first()).toContainText(/8000\s*[×x]\s*6250/)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await app.expectPreviewPages(1)
    await expect
      .poll(() =>
        app.pageCanvases.first().evaluate((c: CanvasLike) => {
          const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data
          let gray = 0
          for (let i = 0; d && i < d.length; i += 16) {
            const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
            if (Math.abs(r - 140) < 8 && Math.abs(g - 140) < 8 && Math.abs(b - 140) < 8) gray++
          }
          return gray
        }),
      )
      .toBeGreaterThan(1000)
  })

  test('I14 removing images: one at a time, then Remove all (confirmed with 2+, immediate with 1); the selection moves to the next image', async ({
    page,
  }) => {
    const app = startApp(page)
    await app.goto()
    const removeAll = page.getByRole('button', { name: 'Remove all images' })
    const confirm = page.getByRole('dialog', { name: 'Remove all images?' })
    await app.upload([FIXTURES.quadrantsJpg, FIXTURES.transparentPng, FIXTURES.quadrantsPng])
    await app.expectImages(3)
    await app.selectButton('quadrants.jpg').click()
    await expect(page.getByRole('button', { name: 'Edit selected image' })).toBeEnabled()
    await app.removeButton('quadrants.jpg').click()
    await app.expectImages(2)
    await expect(app.tile('transparent.png')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Edit selected image' })).toBeEnabled()
    await removeAll.click()
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toBeHidden()
    await app.expectImages(2)
    await removeAll.click()
    await confirm.getByRole('button', { name: 'Remove all' }).click()
    await expect(app.imageRows).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Add some reference photos' })).toBeVisible()
    await expect(app.exportButton).toHaveAttribute('aria-disabled', 'true')

    await app.upload(FIXTURES.quadrantsJpg)
    await app.expectImages(1)
    await removeAll.click()
    await expect(app.imageRows).toHaveCount(0)
    await expect(confirm).toHaveCount(0)
  })

  // Leaving is a navigation, not page.close(): goto() only resolves after any beforeunload
  // prompt has been raised and answered, so the absence of a dialog is final when it returns.
  test('I15 does not warn before leaving an empty workspace', async ({ page }) => {
    const app = startApp(page)
    await app.goto()
    const types: string[] = []
    page.on('dialog', (d) => {
      types.push(d.type())
      void d.accept()
    })
    await page.mouse.click(700, 400) // user activation, required by Chromium for beforeunload prompts
    await page.goto('about:blank')
    expect(types).toEqual([])
  })

  test('I15b with an image loaded the beforeunload prompt appears', async ({ page }) => {
    const app = startApp(page)
    await app.goto()
    await app.upload(FIXTURES.quadrantsJpg)
    await app.expectImages(1)
    const types: string[] = []
    page.on('dialog', (d) => {
      types.push(d.type())
      void d.accept()
    })
    await page.mouse.click(700, 400)
    await page.goto('about:blank')
    expect(types).toEqual(['beforeunload'])
  })
})
