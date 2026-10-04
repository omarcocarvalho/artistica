import { existsSync } from 'node:fs'
import { PDFDocument } from '@pdfme/pdf-lib'
import { expect, test } from '@playwright/test'
import { AppPage } from './support/app.ts'
import { FIXTURES } from './support/fixtures.ts'
import { guardNetwork } from './support/network-guard.ts'
import { mmToPt, summarizePdf } from './support/pdf.ts'
import { solidGrayPng } from './support/png.ts'
import { runOnly } from './support/projects.ts'
import { syntheticJpegs } from './support/synthetic.ts'

runOnly('chromium')

interface FetchHost {
  fetch(url: string, init?: { method?: string; body?: string }): Promise<unknown>
}

test('summarizePdf reads page sizes, image draws and vector strokes through the render inspector', async () => {
  const doc = await PDFDocument.create()
  const png = await doc.embedPng(solidGrayPng(4, 4, 128))
  const a4 = doc.addPage([mmToPt(210), mmToPt(297)])
  a4.drawImage(png, { x: 10, y: 10, width: 50, height: 50 })
  a4.drawImage(png, { x: 70, y: 10, width: 50, height: 50 })
  a4.drawLine({ start: { x: 0, y: 0 }, end: { x: 10, y: 10 } })
  doc.addPage([612, 792])
  const info = await summarizePdf(await doc.save())
  expect(info.pageCount).toBe(2)
  expect(info.imageCount).toBe(1)
  expect(info.pages[0]?.widthPt).toBeCloseTo(595.28, 1)
  expect(info.pages[0]?.heightPt).toBeCloseTo(841.89, 1)
  expect(info.pages[0]?.imagePlacements).toBe(2)
  expect(info.pages[0]?.strokes).toBeGreaterThanOrEqual(1)
  expect(info.pages[1]).toMatchObject({ widthPt: 612, heightPt: 792, imagePlacements: 0 })
})

test('solidGrayPng writes a valid PNG header with the requested size', () => {
  const png = solidGrayPng(30, 20, 7)
  expect(Buffer.from(png.subarray(1, 4)).toString('ascii')).toBe('PNG')
  expect(Buffer.from(png).readUInt32BE(16)).toBe(30)
  expect(Buffer.from(png).readUInt32BE(20)).toBe(20)
})

test("the images feature's fixtures exist where FIXTURES says they do", () => {
  for (const path of Object.values(FIXTURES)) expect(existsSync(path), path).toBe(true)
})

test('the app loads with no off-origin or mutating requests (network guard)', async ({ page }) => {
  const guard = guardNetwork(page)
  const app = new AppPage(page)
  await app.goto()
  await expect(page.getByRole('heading', { name: 'Add some reference photos' })).toBeVisible()
  await expect(page.getByLabel('Paper size')).toHaveValue('A4')
  expect(guard.violations()).toEqual([])
})

test('the network guard is strict by default and honours the typed-URL allow-list', async ({
  page,
}) => {
  await page.route('https://typed.example/**', (route) => route.fulfill({ status: 200, body: 'x' }))
  await page.route('https://other.example/**', (route) => route.fulfill({ status: 200, body: 'x' }))
  const guard = guardNetwork(page)
  await new AppPage(page).goto()
  const host = (u: string, init?: { method?: string; body?: string }) =>
    page.evaluate(([url, i]) => (globalThis as unknown as FetchHost).fetch(url, i as object), [
      u,
      init,
    ] as const)

  guard.allowExternal('https://typed.example/photo.jpg?x=1')
  await host('https://typed.example/photo.jpg')
  expect(guard.violations()).toEqual([])

  await host('https://typed.example/photo.jpg', { method: 'POST', body: 'secret' })
  await host('https://other.example/track')
  await host('/artistica/app/', { method: 'POST', body: 'a' })
  expect(guard.violations()).toEqual([
    'POST https://typed.example/photo.jpg (with body)',
    'GET https://other.example/track',
    'POST http://localhost:' + new URL(page.url()).port + '/artistica/app/ (with body)',
  ])
})

test('syntheticJpegs encodes real JPEGs in the page', async ({ page }) => {
  await new AppPage(page).goto()
  const files = await syntheticJpegs(page, 2, 64, 48)
  expect(files.map((f) => f.name)).toEqual(['synthetic-01.jpg', 'synthetic-02.jpg'])
  for (const f of files) expect([...f.buffer.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
})
