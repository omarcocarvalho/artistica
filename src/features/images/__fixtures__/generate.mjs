// Run once on macOS:  node src/features/images/__fixtures__/generate.mjs
// Pure node, any OS:  node src/features/images/__fixtures__/generate.mjs --only=value-ramp
//                     node src/features/images/__fixtures__/generate.mjs --only=flat-grey
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { injectExifOrientation } from '../exif.ts'
import { flatGreyPng } from './flat-grey.ts'
import { valueRampPng } from './value-ramp.ts'

const here = dirname(fileURLToPath(import.meta.url))
const out = (name) => join(here, name)
mkdirSync(here, { recursive: true })

const pureNode = { 'value-ramp': valueRampPng, 'flat-grey': flatGreyPng }
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)
if (only !== undefined) {
  const write = pureNode[only]
  if (!write) throw new Error(`--only takes one of: ${Object.keys(pureNode).join(', ')}`)
  writeFileSync(out(`${only}.png`), write())
  console.log(`${only}.png written to`, here)
  process.exit(0)
}
for (const [name, write] of Object.entries(pureNode)) writeFileSync(out(`${name}.png`), write())

const browser = await chromium.launch()
const page = await browser.newPage()
const draw = async (type, quality, paint, w, h) =>
  Buffer.from(
    await page.evaluate(
      async ({ type, quality, paint, w, h }) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        new Function('ctx', 'w', 'h', paint)(ctx, w, h)
        const blob = await new Promise((r) => c.toBlob(r, type, quality))
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let s = ''
        for (const b of bytes) s += String.fromCharCode(b)
        return btoa(s)
      },
      { type, quality, paint, w, h },
    ),
    'base64',
  )

const quadrants = `
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, w / 2, h / 2)
  ctx.fillStyle = '#00ff00'; ctx.fillRect(w / 2, 0, w / 2, h / 2)
  ctx.fillStyle = '#0000ff'; ctx.fillRect(0, h / 2, w / 2, h / 2)
  ctx.fillStyle = '#ffff00'; ctx.fillRect(w / 2, h / 2, w / 2, h / 2)`
const transparent = `ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#ff0000'; ctx.fillRect(8, 8, 16, 16)`

const jpg = await draw('image/jpeg', 0.95, quadrants, 64, 48)
writeFileSync(out('quadrants.jpg'), jpg)
writeFileSync(out('quadrants-exif6.jpg'), injectExifOrientation(jpg, 6))
writeFileSync(out('quadrants-exif3.jpg'), injectExifOrientation(jpg, 3))
const png = await draw('image/png', 1, quadrants, 64, 48)
writeFileSync(out('quadrants.png'), png)
writeFileSync(out('quadrants.webp'), await draw('image/webp', 0.95, quadrants, 64, 48))
writeFileSync(out('transparent.png'), await draw('image/png', 1, transparent, 32, 32))
await browser.close()

// GIFs by hand: 1x1, global colour table red + blue, LZW min code size 2.
const head = [...Buffer.from('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 255, 0, 0, 0, 0, 255]
const frame = (idx) => [
  0x2c,
  0,
  0,
  0,
  0,
  1,
  0,
  1,
  0,
  0x00,
  0x02,
  0x02,
  idx === 0 ? 0x44 : 0x4c,
  0x01,
  0x00,
]
writeFileSync(out('still.gif'), Uint8Array.from([...head, ...frame(0), 0x3b]))
writeFileSync(out('animated.gif'), Uint8Array.from([...head, ...frame(0), ...frame(1), 0x3b]))

// HEIC needs a real encoder. macOS ships one in sips. On Linux use `heif-enc quadrants.png -o photo.heic`.
execFileSync('sips', ['-s', 'format', 'heic', out('quadrants.png'), '--out', out('photo.heic')])
copyFileSync(out('photo.heic'), out('mislabelled-heic.jpg'))
writeFileSync(out('notes.pdf'), '%PDF-1.4\n%%EOF\n')
console.log('fixtures written to', here)
