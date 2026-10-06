import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
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
    return { keys, local: size(localStorage), session: size(sessionStorage), dbs, cacheKeys }
  })
  expect(stored.keys).toEqual(['artistica:settings'])
  expect(stored.local).toBeLessThan(2_000)
  expect(stored.session).toBe(0)
  expect(stored.dbs).toBe(0)
  expect(stored.cacheKeys).toBe(0)

  page.on('dialog', (d) => void d.accept())
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Add some reference photos' })).toBeVisible()
  await expect(app.imageRows).toHaveCount(0)
  await expect(page.getByLabel('Paper size')).toHaveValue('A5')
})
