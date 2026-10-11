// Renders scripts/og-image.html once per landing language to public/og-image.png (en) and
// public/og-image-<code>.png (1200x630), and scripts/apple-touch-icon.html to
// public/apple-touch-icon.png (180x180). CJK text takes the system fonts of the machine that runs
// it (M6-R17), so run it on macOS: node scripts/generate-images.mjs [share|icon]
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import {
  cjkFontStack,
  shareImageFile,
  shareImageHtml,
  shareText,
  withShareText,
} from './share-images.ts'
import { landingLanguages } from './vite-landing.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(root, p), 'utf8')
const font = (pkg, file) => pathToFileURL(join(root, 'node_modules', pkg, 'files', file)).href
const fonts = {
  fraunces: font('@fontsource-variable/fraunces', 'fraunces-latin-wght-normal.woff2'),
  atkinson: font(
    '@fontsource-variable/atkinson-hyperlegible-next',
    'atkinson-hyperlegible-next-latin-wght-normal.woff2',
  ),
  caveat: font('@fontsource-variable/caveat', 'caveat-latin-wght-normal.woff2'),
}
const only = process.argv[2]

// file:// pages may load file:// fonts; about:blank (setContent) may not.
const tmp = mkdtempSync(join(tmpdir(), 'artistica-images-'))
const browser = await chromium.launch()

async function render(source, out, width, height, fit) {
  const file = join(tmp, `${out}.html`)
  writeFileSync(file, source)
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(file).href)
  await page.evaluate(() => document.fonts.ready)
  if (fit) await page.evaluate(fit)
  const png = await page.screenshot({ type: 'png' })
  await page.close()
  return png
}

// Shrinks the title until the text column fits the image with a margin.
const fitTitle = `(() => {
  const copy = document.querySelector('.copy')
  const title = document.querySelector('h1')
  for (let size = 68; size >= 40; size -= 2) {
    title.style.fontSize = size + 'px'
    if (copy.getBoundingClientRect().height <= 500 && copy.scrollWidth <= copy.clientWidth) return
  }
  throw new Error('share image: the title does not fit at 40 px')
})()`

if (only !== 'icon') {
  const template = read('scripts/og-image.html')
  const tokens = read('src/shared/theme/tokens.css')
  for (const lang of landingLanguages(readdirSync(join(root, 'landing/locales')))) {
    const text = shareText(JSON.parse(read(`landing/locales/${lang}.json`)), lang)
    const html = shareImageHtml(template, text, fonts, cjkFontStack(tokens, lang))
    const out = shareImageFile(lang)
    writeFileSync(
      join(root, 'public', out),
      withShareText(await render(html, out, 1200, 630, fitTitle), text),
    )
    console.log(`wrote public/${out}`)
  }
}

if (only !== 'share') {
  const png = await render(read('scripts/apple-touch-icon.html'), 'apple-touch-icon.png', 180, 180)
  writeFileSync(join(root, 'public/apple-touch-icon.png'), png)
  console.log('wrote public/apple-touch-icon.png')
}
await browser.close()
