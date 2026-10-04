// Renders scripts/og-image.html to public/og-image.png (1200x630). Run manually: node scripts/generate-og-image.mjs
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
const tmp = join(mkdtempSync(join(tmpdir(), 'artistica-og-')), 'og.html')
writeFileSync(tmp, html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(tmp).href)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: join(root, 'public/og-image.png'), type: 'png' })
await browser.close()
console.log('wrote public/og-image.png')
