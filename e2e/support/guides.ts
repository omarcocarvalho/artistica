import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import { expect, type Page } from '@playwright/test'
import { aiAssetsManifest } from '../../scripts/vite-ai-assets.ts'
import { applyAffine, sourceToFrame } from '../../src/features/lines/guides/map.ts'
import type {
  FaceLandmarks,
  ImageGuides,
  PoseLandmarks,
} from '../../src/features/lines/guides/types.ts'
import { frameOf, frameToPage } from '../../src/features/lines/place.ts'
import { tileLinesFor } from '../../src/features/render/page-model/tile-lines.ts'
import type { ImageDescriptor } from '../../src/shared/model/image.ts'
import type { AppPage } from './app.ts'
import {
  lineSamples,
  rgbDistance,
  type LineSamples,
  type PointMm,
  type RectMm,
  type SampleOptions,
  type TileLines,
} from './line-geometry.ts'
import { strokeToMm, type MmPathOp, type PdfPageSummary } from './pdf.ts'

/** The app's base path (vite `base`). */
export const BASE_PATH = '/artistica/'

const MANIFEST = aiAssetsManifest(BASE_PATH)
/** The four AI asset paths (runtime loader, runtime wasm, face model, pose model). */
export const AI_ASSET_PATHS: readonly string[] = [
  MANIFEST.runtimeLoader.url,
  MANIFEST.runtimeWasm.url,
  MANIFEST.face.url,
  MANIFEST.pose.url,
]
/** What a download of each model fetches when nothing is cached yet. */
export const DOWNLOAD_PATHS = {
  face: [MANIFEST.runtimeLoader.url, MANIFEST.runtimeWasm.url, MANIFEST.face.url],
  pose: [MANIFEST.runtimeLoader.url, MANIFEST.runtimeWasm.url, MANIFEST.pose.url],
} as const
export const MODEL_PATHS = { face: MANIFEST.face.url, pose: MANIFEST.pose.url } as const

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )
}

/**
 * Every path the build serves (the files under `dist/`, which the E2E web server builds before the
 * tests start), with the directory pages `…/` beside their `index.html`. The AI assets are in it.
 */
export function buildPaths(): ReadonlySet<string> {
  const out = new Set<string>()
  for (const file of walk(DIST)) {
    const path = BASE_PATH + relative(DIST, file).split(sep).join('/')
    out.add(path)
    if (path.endsWith('/index.html')) out.add(path.slice(0, -'index.html'.length))
  }
  return out
}

// --- Photo fixtures and their recorded landmarks (src/features/lines/guides/__fixtures__) ---

export const PORTRAIT = { name: 'portrait.jpg', pxW: 1361, pxH: 2048 } as const
export const FIGURE = { name: 'figure.jpg', pxW: 1536, pxH: 2048 } as const

const landmarks = (name: string): { points: [number, number][]; visibility?: number[] } =>
  JSON.parse(
    readFileSync(
      new URL(`../../src/features/lines/guides/__fixtures__/${name}`, import.meta.url),
      'utf8',
    ),
  ) as { points: [number, number][]; visibility?: number[] }

const face = landmarks('face-landmarks.json')
const pose = landmarks('pose-landmarks.json')
/** The face found in portrait.jpg in chromium, normalised to the photo. */
export const FIXTURE_FACE: FaceLandmarks = { points: face.points.map(([x, y]) => ({ x, y })) }
/** The pose found in figure.jpg in chromium, normalised to the photo. */
export const FIXTURE_POSE: PoseLandmarks = {
  points: pose.points.map(([x, y]) => ({ x, y })),
  visibility: pose.visibility ?? [],
}

type TileImage = Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits' | 'lines'>

/** The app's pure geometry for one tile with guides (what both renderers must draw). */
export function guideTileLines(
  img: TileImage,
  guides: ImageGuides,
  trim: RectMm,
  turned: boolean,
): TileLines {
  const tile = tileLinesFor(img, guides, trim, turned, 0)
  if (!tile) throw new Error('these settings and guides draw nothing')
  return tile
}

/** A point in source px of the picture, on the page (the same mapping as the guides). */
export function sourceToPage(
  img: Pick<ImageDescriptor, 'pxW' | 'pxH' | 'edits'>,
  p: { x: number; y: number },
  trim: RectMm,
  turned: boolean,
): PointMm {
  const m = sourceToFrame(img, frameOf(trim, turned))
  const q = frameToPage(applyAffine(m, { op: 'M', x: p.x, y: p.y }), trim, turned)
  return { x: q.x, y: q.y }
}

/** A PDF stroke as a one-stroke TileLines, to sample the preview along what the PDF drew. */
export function pdfTileLines(
  page: PdfPageSummary,
  strokeIndex: number,
  clip: RectMm,
  colour: string,
  widthMm: number,
): TileLines {
  const stroke = page.lineStrokes.at(strokeIndex)
  if (!stroke) throw new Error(`no line stroke ${String(strokeIndex)}`)
  return {
    tileIndex: 0,
    clip,
    colour,
    opacity: 1,
    widthMm,
    types: [],
    strokes: [{ dashMm: [], cmds: strokeToMm(stroke, page.heightPt) }],
  }
}

/** Where `want` appears as a contiguous run of `ops` (each coordinate within `tolMm`), or -1. */
export function findRun(
  ops: readonly MmPathOp[],
  want: readonly MmPathOp[],
  tolMm: number,
): number {
  const near = (a: number, b: number) => Math.abs(a - b) <= tolMm
  const same = (p: MmPathOp, q: MmPathOp) => {
    if (p.op !== q.op || !near(p.x, q.x) || !near(p.y, q.y)) return false
    if (p.op === 'C' && q.op === 'C')
      return near(p.x1, q.x1) && near(p.y1, q.y1) && near(p.x2, q.x2) && near(p.y2, q.y2)
    return true
  }
  for (let i = 0; i + want.length <= ops.length; i++)
    if (
      want.every((w, k) => {
        const o = ops.at(i + k)
        return o !== undefined && same(o, w)
      })
    )
      return i
  return -1
}

/** Subpaths of a path: each starts at an 'M'. */
export function subpaths(ops: readonly MmPathOp[]): MmPathOp[][] {
  const out: MmPathOp[][] = []
  for (const op of ops) {
    if (op.op === 'M' || out.length === 0) out.push([])
    out[out.length - 1]?.push(op)
  }
  return out
}

// --- Synthetic photo for the edge outline golden (B2's still life) ---

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

/** An 8-bit RGB PNG (no colour profile) of RGBA pixels whose alpha is 255. */
export function rgbPng(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // colour type: RGB
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = rgba[i] ?? 0
      raw[o + 1] = rgba[i + 1] ?? 0
      raw[o + 2] = rgba[i + 2] ?? 0
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Console errors ---

/** MediaPipe logs this INFO line through console.error; it is the only console error allowed. */
export const MEDIAPIPE_INFO = 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.'

/** Collects console errors and page errors except MediaPipe's INFO line and what `allow` accepts. */
export function watchConsoleErrors(
  page: Page,
  allow: (text: string) => boolean = () => false,
): () => string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (text === MEDIAPIPE_INFO || allow(text)) return
    errors.push(text)
  })
  page.on('pageerror', (e) => {
    errors.push(`pageerror: ${e.message}`)
  })
  return () => [...errors]
}

// --- Counting statuses (one detection = one "running" status shown) ---

interface CounterWindow {
  __statusCounts?: Record<string, number>
  document: { body: { textContent: string | null } }
  MutationObserver: new (cb: () => void) => {
    observe(target: unknown, opts: { childList: true; subtree: true; characterData: true }): void
  }
}

/**
 * Counts, from now on, how many times each text appears in the page after being absent (a
 * MutationObserver in the page). The guides section shows one "running" text per detection of the
 * selected photo, so the count of "Finding faces…" is the number of face detections it showed.
 */
export async function countAppearances(page: Page, texts: readonly string[]): Promise<void> {
  await page.evaluate((list) => {
    const w = globalThis as unknown as CounterWindow
    const counts: Record<string, number> = Object.fromEntries(list.map((t) => [t, 0]))
    w.__statusCounts = counts
    const shown = new Map(list.map((t) => [t, (w.document.body.textContent ?? '').includes(t)]))
    new w.MutationObserver(() => {
      const text = w.document.body.textContent ?? ''
      for (const t of list) {
        const now = text.includes(t)
        if (now && shown.get(t) === false) counts[t] = (counts[t] ?? 0) + 1
        shown.set(t, now)
      }
    }).observe(w.document.body, { childList: true, subtree: true, characterData: true })
  }, texts)
}

export async function appearances(page: Page, text: string): Promise<number> {
  return page.evaluate(
    (t) => (globalThis as unknown as CounterWindow).__statusCounts?.[t] ?? NaN,
    text,
  )
}

// --- Export ---

/** Exports once every listed guide has settled (M4-R18: Export waits until then), closes the dialog. */
export async function exportSettled(
  app: AppPage,
  kinds: readonly ('edges' | 'face' | 'pose')[],
): Promise<Buffer> {
  for (const k of kinds) await app.expectGuideSettled(k)
  await app.expectPreviewSettled()
  await expect(app.exportButton).toBeEnabled({ timeout: 30_000 })
  const { bytes } = await app.exportPdf()
  await app.page.keyboard.press('Escape')
  await expect(app.page.getByRole('dialog')).toHaveCount(0)
  return bytes
}

// --- Preview = PDF (as L-X1 in lines.spec.ts) ---

export type Px = [number, number, number, number]

export interface PreviewProbe {
  readonly pxPerMm: number
  /** Per tile, in tile order. */
  readonly tiles: readonly LineSamples[]
}

/** Sample points on and beside each tile's lines (page mm), for the first sheet. */
export async function previewProbe(
  app: AppPage,
  pageWidthMm: number,
  tiles: readonly TileLines[],
  opts: SampleOptions,
): Promise<PreviewProbe> {
  const { pxPerMm } = await app.sheetScale(0, pageWidthMm)
  const o: SampleOptions = { ...opts, edge: { marginPx: 0.9, endMm: 3, pxPerMm } }
  return { pxPerMm, tiles: tiles.map((t) => lineSamples(t, o)) }
}

/** The first sheet's pixels at every probe point, per tile. */
export async function readProbe(
  app: AppPage,
  probe: PreviewProbe,
): Promise<{ on: Px[]; off: Px[]; edge: Px[] }[]> {
  const k = probe.pxPerMm
  const points = probe.tiles.flatMap((t) => [...t.on, ...t.off, ...t.edge])
  const pixels = await app.sheetPixels(
    0,
    points.map((p) => [p.x * k, p.y * k] as const),
  )
  let i = 0
  const take = (n: number) => {
    i += n
    return pixels.slice(i - n, i)
  }
  return probe.tiles.map((t) => ({
    on: take(t.on.length),
    off: take(t.off.length),
    edge: take(t.edge.length),
  }))
}

/** Messages for the points whose pixel fails `ok`. */
export function failing(
  label: string,
  points: readonly PointMm[],
  pixels: readonly Px[],
  ok: (px: Px, i: number) => boolean,
): string[] {
  return points.flatMap((p, i) => {
    const px = pixels.at(i)
    return px !== undefined && ok(px, i)
      ? []
      : [`${label} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) mm = ${String(px)}`]
  })
}

/**
 * Preview = PDF for lines drawn at 100% opacity over a photo: the sheet shows the line colour on
 * every on-line sample, and beside the lines (and just past the stroke's edges) the same pixels as
 * once the lines are off. `turnOff` must remove exactly these lines and let the preview settle.
 */
export async function previewMismatches(
  app: AppPage,
  pageWidthMm: number,
  tiles: readonly TileLines[],
  colour: readonly number[],
  turnOff: () => Promise<void>,
  opts: SampleOptions = GUIDE_SAMPLES,
): Promise<{ counts: number[][]; failures: string[] }> {
  const probe = await previewProbe(app, pageWidthMm, tiles, opts)
  const lit = await readProbe(app, probe)
  await turnOff()
  const bare = await readProbe(app, probe)
  const counts = probe.tiles.map((t) => [t.on.length, t.off.length, t.edge.length])
  const failures = probe.tiles.flatMap((t, k) => {
    const l = lit.at(k)
    const b = bare.at(k)
    if (!l || !b) return [`tile ${String(k)} not read`]
    return [
      ...failing(`tile ${String(k)} on`, t.on, l.on, (px) => rgbDistance(px, colour) <= 60),
      ...failing(
        `tile ${String(k)} off`,
        t.off,
        l.off,
        (px, i) => rgbDistance(px, b.off[i] ?? []) <= 30,
      ),
      ...failing(
        `tile ${String(k)} past the edge`,
        t.edge,
        l.edge,
        (px, i) => rgbDistance(px, b.edge[i] ?? []) <= 30,
      ),
    ]
  })
  return { counts, failures }
}

/** Sampling for guides: their pieces are shorter than composition lines, so samples are denser. */
export const GUIDE_SAMPLES: SampleOptions = {
  stepMm: 2,
  crossMm: 2.5,
  offsetMm: 2,
  clearMm: 1.6,
  edgeMm: 1.5,
  dashMarginMm: 1,
}

// --- Counting messages posted to the app's workers ---

interface PostWindow {
  __workerPosts?: Record<string, number>
  __workerMaxLive?: Record<string, number>
  Worker: {
    new (url: unknown, opts?: unknown): object
    prototype: { postMessage: unknown; terminate: unknown }
  }
}
type PostMethod = (this: unknown, ...args: unknown[]) => unknown

/**
 * Counts every message the page posts to each worker, keyed by the worker script's name without
 * its hash (`edges.worker`, `landmark.worker`), and the most workers of each name alive at once
 * (created and not yet terminated). One edge outline is one message to `edges.worker`.
 * Install before the app starts.
 */
export async function installWorkerPostCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = globalThis as unknown as PostWindow
    const counts: Record<string, number> = {}
    const live: Record<string, number> = {}
    const maxLive: Record<string, number> = {}
    w.__workerPosts = counts
    w.__workerMaxLive = maxLive
    const names = new WeakMap<object, string>()
    const NativeWorker = w.Worker
    w.Worker = new Proxy(NativeWorker, {
      construct(target, args: unknown[]) {
        const worker = Reflect.construct(target, args) as object
        const name = /([\w-]+\.worker)-/.exec(String(args[0]))?.[1] ?? 'other'
        names.set(worker, name)
        live[name] = (live[name] ?? 0) + 1
        maxLive[name] = Math.max(maxLive[name] ?? 0, live[name])
        return worker
      },
    })
    const post = NativeWorker.prototype.postMessage as PostMethod
    NativeWorker.prototype.postMessage = function (this: object, ...args: unknown[]) {
      const name = names.get(this) ?? 'other'
      counts[name] = (counts[name] ?? 0) + 1
      return post.apply(this, args)
    }
    const terminate = NativeWorker.prototype.terminate as PostMethod
    NativeWorker.prototype.terminate = function (this: object, ...args: unknown[]) {
      const name = names.get(this)
      if (name !== undefined && names.delete(this)) live[name] = (live[name] ?? 1) - 1
      return terminate.apply(this, args)
    }
  })
}

/** The most workers named `name` that were alive at the same time. */
export async function maxLiveWorkers(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => (globalThis as unknown as PostWindow).__workerMaxLive?.[n] ?? 0, name)
}

export async function workerPosts(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => (globalThis as unknown as PostWindow).__workerPosts?.[n] ?? 0, name)
}
