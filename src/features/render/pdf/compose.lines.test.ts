import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { tileRenderKey } from '../pixels/tile-plan'
import { drawTile, pageModel } from '../test-support/fixtures'
import { TINY_JPEG } from '../test-support/image-bytes'
import type { EncodedTileImage, PageModel } from '../types'
import { composePdf } from './compose'
import { inspectPdf } from './inspect'

const jpeg: EncodedTileImage = { format: 'jpeg', bytes: TINY_JPEG, pxW: 2, pxH: 2 }

function encodedFor(pages: readonly PageModel[]): Map<string, EncodedTileImage> {
  return new Map(pages.flatMap((p) => p.tiles.map((t) => [tileRenderKey(t), jpeg] as const)))
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const noLinesPages = (): PageModel[] => [
  pageModel(
    [
      drawTile({ trim: { x: 20, y: 30, w: 90, h: 60 } }),
      drawTile({ trim: { x: 20, y: 110, w: 90, h: 60 }, flipH: true }),
    ],
    {
      cropMarks: [
        { x1: 19, y1: 30, x2: 15, y2: 30 },
        { x1: 20, y1: 29, x2: 20, y2: 25 },
      ],
    },
  ),
  pageModel([drawTile({ trim: { x: 30, y: 40, w: 50, h: 70 }, bleedMm: 3 })], { index: 1 }),
]

describe('composePdf without lines', () => {
  it('writes exactly the bytes it wrote before lines existed', async () => {
    const pages = noLinesPages()
    const bytes = await composePdf(pages, encodedFor(pages))
    expect(sha256(bytes)).toBe('8a2bed03d7a1b018a2bc4a8551b2e5c9f80f5cc31c25d482b5052a6226105231')
    const report = await inspectPdf(bytes)
    expect(report.pages.map((p) => p.content)).toMatchSnapshot()
  })
})
