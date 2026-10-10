// Renders scripts/og-image.html to public/og-image.png (1200x630) and scripts/apple-touch-icon.html
// to public/apple-touch-icon.png (180x180). Run manually: node scripts/generate-images.mjs
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const font = (pkg, file) => pathToFileURL(join(root, 'node_modules', pkg, 'files', file)).href

const html = readFileSync(join(root, 'scripts/og-image.html'), 'utf8')
  .replace(
    '{{FRAUNCES}}',
    font('@fontsource-variable/fraunces', 'fraunces-latin-wght-normal.woff2'),
  )
  .replace(
    '{{ATKINSON}}',
    font(
      '@fontsource-variable/atkinson-hyperlegible-next',
      'atkinson-hyperlegible-next-latin-wght-normal.woff2',
    ),
  )
  .replace('{{CAVEAT}}', font('@fontsource-variable/caveat', 'caveat-latin-wght-normal.woff2'))

// file:// pages may load file:// fonts; about:blank (setContent) may not.
const tmp = mkdtempSync(join(tmpdir(), 'artistica-images-'))
const browser = await chromium.launch()

async function render(source, out, width, height) {
  const file = join(tmp, `${out}.html`)
  writeFileSync(file, source)
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(file).href)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(root, 'public', out), type: 'png' })
  await page.close()
  console.log(`wrote public/${out}`)
}

await render(html, 'og-image.png', 1200, 630)
await render(
  readFileSync(join(root, 'scripts/apple-touch-icon.html'), 'utf8'),
  'apple-touch-icon.png',
  180,
  180,
)
await browser.close()
