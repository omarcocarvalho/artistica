import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import { AI_ASSET_PATHS, DOWNLOAD_PATHS } from './support/guides.ts'
import { guardNetwork, type NetworkGuard } from './support/network-guard.ts'
import { runOnly } from './support/projects.ts'

// The e2e tsconfig has no DOM lib; these are the browser globals used inside page.evaluate.
interface StorageLike {
  readonly length: number
  key(i: number): string | null
  getItem(k: string): string | null
}
declare const localStorage: StorageLike
declare const sessionStorage: StorageLike
declare const indexedDB: { databases?: () => Promise<unknown[]> }
declare const caches: { keys(): Promise<string[]> } | undefined

runOnly('chromium', 'firefox', 'webkit')
test.use({ viewport: { width: 1280, height: 900 } })

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

test('P1 import, layout, edit and export make no request except same-origin GETs and the typed URL', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const typed = 'https://photos.example/typed.jpg'
  await page.route(typed, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(FIXTURES.quadrantsJpg),
    }),
  )
  const app = startApp(page)
  guard?.allowExternal(typed)
  await app.goto()
  await app.upload([FIXTURES.quadrantsJpg, FIXTURES.quadrantsExif6, FIXTURES.heic])
  await app.expectImages(3, 60_000)
  await app.submitLink(typed)
  await app.expectImages(4)
  await app.setPaper('Letter')
  await app.setSwitch('Bleed', true)
  await app.expectPreviewPages(1)
  await app.editButton('quadrants.jpg').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await app.openStudiesTab()
  await app.setVersions(['Original', 'Blurred', 'Values', 'Blur + Values'])
  await app.applyStudiesToAll()
  await expect(app.studyTile('quadrants.jpg', 'Blur + Values')).toBeVisible()
  await expect(app.studyTile('typed.jpg', 'Blur + Values')).toBeVisible()
  await app.openLinesTab()
  await app.setAllLineSwitches(true)
  await app.setGrid(6, 2)
  await app.setSpiralCorner('Bottom right')
  await app.setLineStyle({ colour: '#1f3fbf', widthMm: 1.2, opacityPct: 55 })
  await app.applyLinesToAll()
  await app.expectPreviewSettled()
  const { bytes } = await app.exportPdf()
  expect(bytes.length).toBeGreaterThan(1000)
})

test('P2 nothing from the photos is persisted: storage stays small and a reload starts empty (R12)', async ({
  page,
}) => {
  const app = startApp(page)
  await app.goto()
  await app.upload(FIXTURES.quadrantsJpg)
  await app.expectImages(1)
  await app.setPaper('A5')
  await expect(page.getByLabel('Paper size')).toHaveValue('A5')
  await app.openStudiesTab()
  await app.setVersions(['Original', 'Blurred'])
  await app.setSlider('Amount', 63)
  await app.setSlider('Number of values', 9)
  await app.openLinesTab()
  await app.setAllLineSwitches(true)
  await app.setGrid(7, 3)
  await app.setSpiralCorner('Bottom left')
  await app.setLineStyle({ colour: '#2a9d3c', widthMm: 0.8, opacityPct: 45 })
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('artistica:settings')))
    .toContain('"count":9')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('artistica:settings')))
    .toContain('"opacityPct":45')

  const stored = await page.evaluate(async () => {
    const size = (s: StorageLike) => {
      let n = 0
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i) ?? ''
        n += k.length + (s.getItem(k) ?? '').length
      }
      return n
    }
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) ?? '')
    const dbs = indexedDB.databases ? (await indexedDB.databases()).length : 0
    const cacheKeys = typeof caches === 'undefined' ? 0 : (await caches.keys()).length
    return {
      keys,
      settings: localStorage.getItem('artistica:settings'),
      local: size(localStorage),
      session: size(sessionStorage),
      dbs,
      cacheKeys,
    }
  })
  expect(stored.keys).toEqual(['artistica:settings'])
  const envelope = JSON.parse(stored.settings ?? 'null') as {
    version: number
    state: Record<string, unknown>
  }
  expect(envelope.version).toBe(4)
  expect(Object.keys(envelope.state).sort()).toEqual([
    'language',
    'lineDefaults',
    'pageSetup',
    'studyDefaults',
    'theme',
    'unit',
  ])
  // Only numbers join the settings for studies: no versions, nothing from the photos.
  expect(envelope.state.studyDefaults).toEqual({
    blurPct: 63,
    values: { count: 9, hue: 55, neutral: false },
  })
  // Line defaults keep the chosen style, grid size and corner; every type is off (owner Q7).
  expect(envelope.state.lineDefaults).toEqual({
    grid: { on: false, cols: 7, rows: 3 },
    thirds: false,
    armature: false,
    golden: false,
    spiral: { on: false, corner: 'bottomLeft' },
    centre: false,
    style: { colour: '#2a9d3c', widthMm: 0.8, opacityPct: 45 },
    edges: { on: false, detailPct: 50 },
    face: false,
    pose: false,
  })
  expect(stored.local).toBeLessThan(2_000)
  expect(stored.session).toBe(0)
  expect(stored.dbs).toBe(0)
  expect(stored.cacheKeys).toBe(0)

  page.on('dialog', (d) => void d.accept())
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Add some reference photos' })).toBeVisible()
  await expect(app.imageRows).toHaveCount(0)
  await expect(page.getByLabel('Paper size')).toHaveValue('A5')

  // A photo added after the reload starts as Original only, with the remembered blur and values.
  await app.upload(FIXTURES.quadrantsPng)
  await app.expectImages(1)
  await app.openStudiesTab()
  await expect(app.studySlider('Amount')).toHaveAttribute('aria-valuetext', '63%')
  await expect(app.studySlider('Number of values')).toHaveAttribute('aria-valuetext', '9 values')
  for (const [v, on] of [
    ['Original', 'true'],
    ['Blurred', 'false'],
    ['Values', 'false'],
    ['Blur + Values', 'false'],
  ] as const)
    await expect(app.versionChip(v)).toHaveAttribute('aria-pressed', on)
})

interface CacheWindow {
  caches?: {
    keys(): Promise<string[]>
    open(name: string): Promise<{ keys(): Promise<{ url: string }[]> }>
  }
}

test('G-P2 with guides: settings v4 keep only the detail; Cache Storage holds only AI assets; nothing from a photo', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const app = startApp(page)
  await app.goto()
  await app.upload(FIXTURES.portraitJpg)
  await app.expectImages(1)
  await app.openGuides()
  await app.setGuide('edges', true)
  await app.setDetail(73)
  await app.setGuide('face', true)
  const offered = (await app.expectGuideSettled('face')) === 'box'
  if (offered) await app.downloadModel('face')
  await app.setGuide('pose', true)
  await app.expectGuideSettled('edges')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('artistica:settings')))
    .toContain('"detailPct":73')

  const stored = await page.evaluate(async () => {
    const w = globalThis as unknown as CacheWindow
    const cached: Record<string, string[]> = {}
    for (const name of (await w.caches?.keys()) ?? []) {
      const cache = await w.caches?.open(name)
      cached[name] = ((await cache?.keys()) ?? []).map((r) => r.url)
    }
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) ?? '')
    return {
      keys,
      settings: localStorage.getItem('artistica:settings'),
      dbs: indexedDB.databases ? (await indexedDB.databases()).length : 0,
      session: sessionStorage.length,
      cached,
    }
  })
  expect(stored.keys).toEqual(['artistica:settings'])
  const envelope = JSON.parse(stored.settings ?? 'null') as {
    version: number
    state: { lineDefaults: Record<string, unknown> }
  }
  expect(envelope.version).toBe(4)
  // The detail is remembered; the switches never are (owner Q8).
  expect(envelope.state.lineDefaults.edges).toEqual({ on: false, detailPct: 73 })
  expect(envelope.state.lineDefaults.face).toBe(false)
  expect(envelope.state.lineDefaults.pose).toBe(false)
  expect(stored.session).toBe(0)
  expect(stored.dbs).toBe(0)
  const origin = new URL(page.url()).origin
  for (const [name, urls] of Object.entries(stored.cached)) {
    // Service workers are blocked here, so there is no shell cache (offline.spec checks it).
    expect(name).toMatch(/^(artistica-ai-v1|artistica-shell-.+)$/)
    for (const url of urls) {
      expect(url).not.toMatch(/^blob:/)
      expect(new URL(url).origin).toBe(origin)
      expect(AI_ASSET_PATHS).toContain(new URL(url).pathname)
    }
  }
  const ai = Object.entries(stored.cached).find(([n]) => n === 'artistica-ai-v1')?.[1] ?? []
  expect(ai.map((u) => new URL(u).pathname).sort()).toEqual(
    offered ? [...DOWNLOAD_PATHS.face].sort() : [],
  )
})
