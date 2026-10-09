import { AI_ASSETS } from 'virtual:ai-assets'
import { useImages } from '../features/images'
import {
  AI_LOADER,
  createDetectionScheduler,
  createEdgeEngine,
  createLandmarkEngine,
  EDGE_ANALYSIS_LONG_SIDE,
  pageHasWebGL,
  type DetectionActions,
  type GuideKind,
} from '../features/lines'
import { orientMatrix, resolveCrop } from '../features/render'
import type { ImageDescriptor, ImageId } from '../shared/model/image'

export interface BitmapCtx {
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: ImageSmoothingQuality
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  drawImage(
    image: ImageBitmap,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void
}

export interface BitmapCanvas {
  readonly ctx: BitmapCtx
  readonly toBitmap: () => ImageBitmap
}

export interface BitmapDeps {
  readonly previewOf: (id: ImageId) => ImageBitmap | undefined
  readonly canvas: (w: number, h: number) => BitmapCanvas
}

/** DetectionPorts.bitmapFor (M4-R7): pixels from the photo's preview, every edit from `img`. */
export function createBitmapFor(
  deps: BitmapDeps,
): (img: ImageDescriptor, kind: GuideKind) => Promise<ImageBitmap> {
  return (img, kind) =>
    new Promise((resolve) => {
      resolve(draw(deps, img, kind))
    })
}

function draw(deps: BitmapDeps, img: ImageDescriptor, kind: GuideKind): ImageBitmap {
  const preview = deps.previewOf(img.id)
  if (!preview) throw new Error('No preview for this image')
  const w = preview.width
  const h = preview.height
  if (kind === 'edges') {
    const crop = resolveCrop(img)
    const sx = w / img.pxW
    const sy = h / img.pxH
    const sw = crop.w * sx
    const sh = crop.h * sy
    const k = Math.min(1, EDGE_ANALYSIS_LONG_SIDE / Math.max(sw, sh))
    const outW = Math.max(1, Math.round(sw * k))
    const outH = Math.max(1, Math.round(sh * k))
    const { ctx, toBitmap } = deps.canvas(outW, outH)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(preview, crop.x * sx, crop.y * sy, sw, sh, 0, 0, outW, outH)
    return toBitmap()
  }
  const { rotation } = img.edits
  const quarter = rotation === 90 || rotation === 270
  const outW = quarter ? h : w
  const outH = quarter ? w : h
  const { ctx, toBitmap } = deps.canvas(outW, outH)
  ctx.setTransform(...orientMatrix(rotation, false, false, w, h, outW, outH, 0))
  ctx.drawImage(preview, 0, 0, w, h, 0, 0, w, h)
  return toBitmap()
}

function offscreenCanvas(w: number, h: number): BitmapCanvas {
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context')
  return { ctx, toBitmap: () => canvas.transferToImageBitmap() }
}

/** The app's one detection scheduler (as `appStudyProvider`): never disposed by React. */
export const appDetections = createDetectionScheduler({
  edges: createEdgeEngine,
  landmarks: () => createLandmarkEngine(),
  loader: AI_LOADER,
  assets: AI_ASSETS,
  bitmapFor: createBitmapFor({
    previewOf: (id) => useImages.getState().images.find((i) => i.id === id)?.preview,
    canvas: offscreenCanvas,
  }),
})

export function createAppDetectionActions(): DetectionActions {
  return {
    download: (model) => {
      appDetections.download(model)
    },
    retry: (kind, imageId) => {
      appDetections.retry(kind, imageId)
    },
    landmarksSupported: pageHasWebGL(),
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    appDetections.dispose()
  })
}
